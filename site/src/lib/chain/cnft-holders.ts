import { ethers } from 'ethers';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getBaseProvider } from './base-rpc';

const CNFT_ABI = [
  'function ownerOf(uint256 tokenId) view returns (address)',
];

/**
 * Look up the CURRENT holders of the cNFTs for a contract.
 *
 * The signatures table is the historical record of WHO ORIGINALLY SIGNED.
 * The cNFT contract is the live source of truth for WHO IS CURRENTLY A PARTY.
 * These can diverge after a transfer: the smart contract enforces bilateral
 * consent on transfer (`approveTransfer()`), so once a transfer happens the
 * new holder is implicitly a recognized party — the existing counterparty
 * already cryptographically approved them at the transfer step.
 *
 * This helper resolves "who is currently a party" by querying ownerOf() on
 * the paired cNFT tokens, falling back to the signatures table for legacy
 * contracts that pre-date the paired-mint era.
 *
 * Returns lowercased wallet addresses for case-insensitive comparison.
 */

export interface CurrentHoldersResult {
  /** Live current holders from the cNFT contract, OR signature wallets if legacy. */
  currentHolders: string[];
  /** Original signers from the signatures table (historical record). */
  originalSigners: string[];
  /** Whether at least one party has changed since original signing. */
  hasNovation: boolean;
  /** Whether we used the cNFT chain query (true) or the signatures fallback (false). */
  fromChain: boolean;
}

export async function getCurrentHolders(contractRow: {
  id: string;
  nft_token_id: number | null;
  nft_counterparty_token_id: number | null;
}): Promise<CurrentHoldersResult> {
  const db = getSupabaseAdmin();

  // Always read the historical signers — used as a fallback AND for novation
  // detection (compare current vs original).
  const { data: sigs } = await db
    .from('signatures')
    .select('signer_wallet')
    .eq('contract_id', contractRow.id)
    .order('signed_at', { ascending: true });

  const originalSigners = (sigs ?? [])
    .map((s) => (s.signer_wallet || '').toLowerCase())
    .filter((s) => s.length > 0);

  // If the contract has token IDs from the paired mint, query the cNFT
  // contract on Base for current ownership. This is the source of truth.
  const tokenIds = [contractRow.nft_token_id, contractRow.nft_counterparty_token_id]
    .filter((id): id is number => typeof id === 'number' && id > 0);

  if (tokenIds.length === 0) {
    // Legacy contract pre-paired-mint era, or unminted. Fall back to
    // signatures table — no novation can be detected here.
    return {
      currentHolders: originalSigners,
      originalSigners,
      hasNovation: false,
      fromChain: false,
    };
  }

  const contractAddress = process.env.CNFT_CONTRACT_ADDRESS;
  if (!contractAddress) {
    console.error('CNFT_CONTRACT_ADDRESS not set, falling back to signatures table');
    return {
      currentHolders: originalSigners,
      originalSigners,
      hasNovation: false,
      fromChain: false,
    };
  }

  try {
    const provider = await getBaseProvider();
    const cnft = new ethers.Contract(contractAddress, CNFT_ABI, provider);

    const currentHolders: string[] = [];
    for (const tokenId of tokenIds) {
      const owner = await cnft.ownerOf(tokenId);
      if (owner && typeof owner === 'string') {
        currentHolders.push(owner.toLowerCase());
      }
    }

    // Detect novation: any current holder that wasn't an original signer.
    const hasNovation = currentHolders.some((h) => !originalSigners.includes(h));

    return {
      currentHolders,
      originalSigners,
      hasNovation,
      fromChain: true,
    };
  } catch (err) {
    console.error('cNFT ownerOf lookup failed, falling back to signatures table:', err);
    return {
      currentHolders: originalSigners,
      originalSigners,
      hasNovation: false,
      fromChain: false,
    };
  }
}
