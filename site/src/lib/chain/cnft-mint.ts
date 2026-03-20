import { ethers } from 'ethers';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { buildNftMetadata, getMetadataUri } from './cnft-metadata';

const BASE_RPC = 'https://mainnet.base.org';

const CNFT_ABI = [
  'function mint(address to, string uri) external returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
];

export async function mintContractNFT(params: {
  recipientWallet: string;
  metadataUri: string;
}): Promise<{ tokenId: number; txHash: string }> {
  const contractAddress = process.env.CNFT_CONTRACT_ADDRESS;
  const minterKey = process.env.CNFT_MINTER_PRIVATE_KEY;

  if (!contractAddress || !minterKey) {
    throw new Error('CNFT_CONTRACT_ADDRESS or CNFT_MINTER_PRIVATE_KEY not set');
  }

  const provider = new ethers.JsonRpcProvider(BASE_RPC);
  const wallet = new ethers.Wallet(minterKey, provider);
  const contract = new ethers.Contract(contractAddress, CNFT_ABI, wallet);

  const tx = await contract.mint(params.recipientWallet, params.metadataUri);
  const receipt = await tx.wait();

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

export async function mintContractNFTAsync(contractUuid: string): Promise<void> {
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

  let recipient = contract.payer_wallet;
  if (!recipient) {
    const { data: sig } = await db
      .from('signatures')
      .select('signer_wallet')
      .eq('contract_id', contractUuid)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    recipient = sig?.signer_wallet;
  }

  if (!recipient) {
    console.error('cNFT mint: no recipient wallet for', contract.contract_id);
    await db.from('contracts').update({ nft_mint_status: 'failed' }).eq('id', contractUuid);
    return;
  }

  const metadataUri = getMetadataUri(contract.sha256_hash);

  await db.from('contracts').update({ nft_mint_status: 'pending' }).eq('id', contractUuid);

  try {
    const { tokenId, txHash } = await mintContractNFT({
      recipientWallet: recipient,
      metadataUri,
    });

    const metadata = buildNftMetadata(contract);
    await db.from('contracts').update({
      nft_token_id: tokenId,
      nft_tx_hash: txHash,
      nft_minted_at: new Date().toISOString(),
      nft_mint_status: 'minted',
    }).eq('id', contractUuid);

    await db.from('audit_log').insert({
      contract_id: contractUuid,
      action: 'nft_minted',
      actor: 'system',
      details: { token_id: tokenId, tx_hash: txHash, recipient, metadata },
    });

    console.log(`cNFT minted: ${contract.contract_id} -> token #${tokenId} (${txHash})`);
  } catch (err) {
    console.error('cNFT mint failed:', contract.contract_id, err);
    await db.from('contracts').update({ nft_mint_status: 'failed' }).eq('id', contractUuid);
  }
}
