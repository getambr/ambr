import { verifyContractHash } from '@/lib/contract-engine';
import type { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  missingSlots,
  normalizeWallet,
  resolveSignerParties,
  type ContractSignerInput,
  type SignerParties,
  type SignerSlot,
} from './signers';

/**
 * "Is this contract in force right now?" in one place. The status route and the
 * MCP status tool both answer from here, so the two doors cannot disagree.
 *
 * Valid means: active, not revoked, not past its expiry, every required
 * signature on file (lib/contract/signers.ts) and the stored text still
 * matching its creation hash.
 */

export interface ValidityContract extends ContractSignerInput {
  id: string;
  status: string;
  sha256_hash: string;
  amendment_type?: string | null;
  revoked_at?: string | null;
  expiry_date?: string | null;
  human_readable?: unknown;
  machine_readable?: unknown;
}

export interface ContractValidity {
  isCurrentlyValid: boolean;
  /** Empty when valid: status_<x>, revoked, expired, missing_signatures, hash_mismatch. */
  reasons: string[];
  /** Slots still waiting for a signature. */
  missingSigners: SignerSlot[];
  isExpired: boolean;
}

/**
 * Signing parties of an amendment contract. Amendments never go through the
 * sign route: the approve route writes the signatures of the proposer and the
 * approver, who are the current cNFT holders and need not be any wallet named
 * in the amended parameters. Same wallet on both sides: one signer is enough
 * (the approve route stores a single row then).
 */
export function amendmentSignerParties(
  proposerWallet: unknown,
  approverWallet: unknown,
): SignerParties | null {
  const proposer = normalizeWallet(proposerWallet);
  if (!proposer) return null;
  const approver = normalizeWallet(approverWallet);
  if (approver === proposer) return { oneSided: true, principal: [proposer], counterparty: [] };
  return { oneSided: false, principal: [proposer], counterparty: approver ? [approver] : [] };
}

type Db = ReturnType<typeof getSupabaseAdmin>;

/** Who must have signed this contract: the proposal's parties for an amendment, else the contract's own. */
export async function resolveRequiredParties(db: Db, contract: ValidityContract): Promise<SignerParties> {
  if (contract.amendment_type === 'amendment') {
    const { data: proposal } = await db
      .from('amendment_proposals')
      .select('proposer_wallet, approved_by_wallet')
      .eq('resulting_contract_id', contract.id)
      .single();
    if (proposal) {
      const parties = amendmentSignerParties(proposal.proposer_wallet, proposal.approved_by_wallet);
      if (parties) return parties;
    }
  }
  return resolveSignerParties(contract);
}

export async function evaluateContractValidity(
  db: Db,
  contract: ValidityContract,
  signedWallets: string[],
): Promise<ContractValidity> {
  const isExpired =
    contract.status === 'expired' ||
    (!!contract.expiry_date && new Date(contract.expiry_date).getTime() < Date.now());

  const parties = await resolveRequiredParties(db, contract);
  const missingSigners = missingSlots(parties, signedWallets);

  const reasons: string[] = [];
  if (contract.status !== 'active') reasons.push(`status_${contract.status}`);
  if (contract.revoked_at) reasons.push('revoked');
  if (isExpired) reasons.push('expired');
  if (missingSigners.length > 0) reasons.push('missing_signatures');
  if (!verifyContractHash(contract)) reasons.push('hash_mismatch');

  return { isCurrentlyValid: reasons.length === 0, reasons, missingSigners, isExpired };
}
