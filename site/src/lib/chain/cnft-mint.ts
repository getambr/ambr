import { ethers } from 'ethers';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { buildNftMetadata, getMetadataUri } from './cnft-metadata';
import { getBaseProvider, withRetry } from './base-rpc';

const CNFT_ABI = [
  'function mint(address to, address _counterparty, string uri, bytes32 _hash) external returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
];

export async function mintContractNFT(params: {
  recipientWallet: string;
  counterpartyWallet: string;
  metadataUri: string;
  contractHash: string;
}): Promise<{ tokenId: number; txHash: string }> {
  const contractAddress = process.env.CNFT_CONTRACT_ADDRESS;
  const minterKey = process.env.CNFT_MINTER_PRIVATE_KEY;

  if (!contractAddress || !minterKey) {
    throw new Error('CNFT_CONTRACT_ADDRESS or CNFT_MINTER_PRIVATE_KEY not set');
  }

  const provider = await getBaseProvider();
  const wallet = new ethers.Wallet(minterKey, provider);
  const contract = new ethers.Contract(contractAddress, CNFT_ABI, wallet);

  const { tx, receipt } = await withRetry(async () => {
    const mintTx = await contract.mint(
      params.recipientWallet,
      params.counterpartyWallet,
      params.metadataUri,
      params.contractHash,
    );
    const mintReceipt = await mintTx.wait();
    return { tx: mintTx, receipt: mintReceipt };
  }, 'cNFT mint');

  const transferLog = receipt.logs.find(
    (log: ethers.Log) =>
      log.topics[0] === ethers.id('Transfer(address,address,uint256)'),
  );

  if (!transferLog) {
    throw new Error('No Transfer event found in mint receipt');
  }

  const tokenId = Number(BigInt(transferLog.topics[3]));
  return { tokenId, txHash: receipt.hash };
}

/**
 * Mint contract NFT(s) on Base L2.
 *
 * @param contractUuid - the contracts.id to mint for
 * @param explicitWallets - optional override for the recipient + counterparty
 *   wallets. When provided, skips the signature/payer lookup. Use this from
 *   the amendment-approval flow where wallets come from the proposal record
 *   rather than the signatures table (amendments don't go through the sign
 *   route, so they have no signature rows).
 */
export async function mintContractNFTAsync(
  contractUuid: string,
  explicitWallets?: { recipient: string; counterparty?: string | null },
): Promise<void> {
  const db = getSupabaseAdmin();

  const { data: contract, error } = await db
    .from('contracts')
    .select('id, contract_id, sha256_hash, contract_type, amendment_type, principal_declaration, payer_wallet')
    .eq('id', contractUuid)
    .single();

  if (error || !contract) {
    console.error('cNFT mint: contract not found', contractUuid);
    return;
  }

  // Determine holder + counterparty. Priority order:
  //   1. explicitWallets parameter (amendment approval flow)
  //   2. payer_wallet column (x402 flow)
  //   3. signatures table lookup (signed contract via API key flow)
  let recipient: string | null = explicitWallets?.recipient || contract.payer_wallet || null;
  let counterpartyWallet: string = explicitWallets?.counterparty || ethers.ZeroAddress;

  if (!explicitWallets && !contract.payer_wallet) {
    const { data: sig } = await db
      .from('signatures')
      .select('signer_wallet')
      .eq('contract_id', contractUuid)
      .order('signed_at', { ascending: true })
      .limit(1)
      .single();
    recipient = sig?.signer_wallet || null;

    const { data: signers } = await db
      .from('signatures')
      .select('signer_wallet')
      .eq('contract_id', contractUuid)
      .order('signed_at', { ascending: true })
      .limit(2);

    if (signers && signers.length >= 2) {
      counterpartyWallet = signers[1].signer_wallet;
    }
  }

  if (!recipient) {
    console.error('cNFT mint: no recipient wallet for', contract.contract_id);
    await db.from('contracts').update({ nft_mint_status: 'failed' }).eq('id', contractUuid);
    return;
  }

  const metadataUri = getMetadataUri(contract.sha256_hash);
  const hashBytes32 = '0x' + contract.sha256_hash;

  await db.from('contracts').update({ nft_mint_status: 'pending' }).eq('id', contractUuid);

  try {
    // Phase 1: Paired cNFT minting.
    // First mint: the "recipient" (first signer or x402 payer) gets their NFT.
    // The counterparty address is recorded on-chain as metadata in this call.
    const { tokenId, txHash } = await mintContractNFT({
      recipientWallet: recipient,
      counterpartyWallet,
      metadataUri,
      contractHash: hashBytes32,
    });

    // Second mint (paired): if there IS a counterparty, they also get an NFT
    // in their own wallet. We swap the addresses so the counterparty becomes
    // the recipient of the second token, with the original recipient in the
    // counterparty metadata slot. Both tokens reference the SAME contract
    // hash and metadata URI — they're twin receipts of the same agreement.
    //
    // If the second mint fails, we don't fail the whole operation: the first
    // signer still holds on-chain proof. We log the error and carry on with
    // nft_counterparty_token_id as NULL so it's visible in the DB.
    let counterpartyTokenId: number | null = null;
    let counterpartyTxHash: string | null = null;
    const hasCounterparty = counterpartyWallet !== ethers.ZeroAddress;

    if (hasCounterparty) {
      try {
        const pairedMint = await mintContractNFT({
          recipientWallet: counterpartyWallet,
          counterpartyWallet: recipient,
          metadataUri,
          contractHash: hashBytes32,
        });
        counterpartyTokenId = pairedMint.tokenId;
        counterpartyTxHash = pairedMint.txHash;
      } catch (pairedErr) {
        console.error(
          'cNFT paired mint (second call) failed:',
          contract.contract_id,
          pairedErr,
        );
        await db.from('audit_log').insert({
          contract_id: contractUuid,
          action: 'nft_paired_mint_failed',
          actor: 'system',
          details: {
            first_token_id: tokenId,
            first_tx_hash: txHash,
            counterparty: counterpartyWallet,
            error: pairedErr instanceof Error ? pairedErr.message : String(pairedErr),
          },
        });
      }
    }

    const metadata = buildNftMetadata(contract);
    await db.from('contracts').update({
      nft_token_id: tokenId,
      nft_tx_hash: txHash,
      nft_minted_at: new Date().toISOString(),
      nft_mint_status: 'minted',
      nft_holder_wallet: recipient,
      nft_counterparty_wallet: hasCounterparty ? counterpartyWallet : null,
      nft_counterparty_token_id: counterpartyTokenId,
      nft_counterparty_tx_hash: counterpartyTxHash,
    }).eq('id', contractUuid);

    await db.from('audit_log').insert({
      contract_id: contractUuid,
      action: 'nft_minted',
      actor: 'system',
      details: {
        token_id: tokenId,
        tx_hash: txHash,
        recipient,
        counterparty: counterpartyWallet,
        counterparty_token_id: counterpartyTokenId,
        counterparty_tx_hash: counterpartyTxHash,
        paired: counterpartyTokenId !== null,
        hash_on_chain: hashBytes32,
        metadata,
      },
    });

    const pairedSuffix = counterpartyTokenId !== null
      ? ` + paired #${counterpartyTokenId}`
      : hasCounterparty ? ' (paired mint FAILED)' : '';
    console.log(`cNFT minted: ${contract.contract_id} -> token #${tokenId}${pairedSuffix} (${txHash})`);
  } catch (err) {
    console.error('cNFT mint failed:', contract.contract_id, err);
    await db.from('contracts').update({ nft_mint_status: 'failed' }).eq('id', contractUuid);
  }
}
