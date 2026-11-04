import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * Who may put `amendment_type` and `parent_contract_hash` on a new contract.
 *
 * An amendment row is made by exactly one flow: the counterparty's approval
 * (POST /api/v1/contracts/{id}/amendments/{proposalId}/approve), which loads the
 * parent itself and writes the hash and the type from what it loaded. Both create
 * doors (REST and MCP/A2A) take these fields from a caller-written body, so
 * neither may store them as sent: a key holder could otherwise mint a row that
 * reads as an amendment of someone else's contract.
 *
 * - `amendment_type`: only the default, 'original', is accepted from a caller
 *   (and is not stored from input at all). 'amendment' and 'extension' are refused.
 * - `parent_contract_hash`: still accepted, because it drives the EU AI Act
 *   Article 14 oversight gate for a contract created under a mandate
 *   (lib/compliance/oversight-gate.ts). The parent must exist and the caller must
 *   have created it; otherwise the request is refused.
 *
 * Both doors call these helpers so the answers cannot differ.
 */

export const AMENDMENT_TYPE_NOT_ALLOWED = {
  error: 'amendment_fields_not_allowed',
  message:
    'amendment_type is set only by the amendment flow. To amend a contract, propose an amendment with ' +
    'POST /api/v1/contracts/{id}/amend; the counterparty approves it and the amendment is created for you.',
} as const;

export const PARENT_CONTRACT_NOT_ACCEPTED = {
  error: 'invalid_parent_contract',
  message:
    'parent_contract_hash must be the SHA-256 hash of a contract that you created. ' +
    'To amend a contract, propose an amendment with POST /api/v1/contracts/{id}/amend.',
} as const;

/** True when a caller asks for an amendment type other than the default. */
export function forgesAmendmentType(amendmentType: unknown): boolean {
  return amendmentType !== undefined && amendmentType !== null && amendmentType !== 'original';
}

export interface ParentLinkCaller {
  /** The API key the request is authenticated with. */
  keyId?: string | null;
  /** The verified payer of an x402 request. */
  payerWallet?: string | null;
}

/**
 * True when `parentHash` names a contract the caller created: the same API key,
 * or the same x402 payer wallet. A missing parent and someone else's parent are
 * indistinguishable to the caller. A failed read counts as "no".
 */
export async function callerOwnsParent(
  parentHash: string,
  caller: ParentLinkCaller,
): Promise<boolean> {
  const db = getSupabaseAdmin();
  const { data: parent } = await db
    .from('contracts')
    .select('api_key_id, payer_wallet')
    .eq('sha256_hash', parentHash)
    .single();
  if (!parent) return false;

  if (caller.keyId && parent.api_key_id === caller.keyId) return true;
  if (
    caller.payerWallet &&
    typeof parent.payer_wallet === 'string' &&
    parent.payer_wallet.toLowerCase() === caller.payerWallet.toLowerCase()
  ) {
    return true;
  }
  return false;
}
