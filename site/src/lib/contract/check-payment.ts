import { z } from 'zod';
import type { getSupabaseAdmin } from '@/lib/supabase-admin';
import { contractRefColumn, INVALID_CONTRACT_REF } from './lookup';
import {
  checkTransaction,
  termsFromMachineReadable,
  type CheckOutcome,
  type CheckTransaction,
} from './check-terms';

/**
 * Server side of "check a payment against the agreement". The REST route
 * (POST /api/v1/contracts/[id]/check) and the MCP tool ambr_check_transaction
 * both call this, so the two doors cannot disagree. Read-only: no credits are
 * burned and nothing is written.
 */

type Db = ReturnType<typeof getSupabaseAdmin>;

export const CHECK_CONTRACT_COLUMNS =
  'id, contract_id, status, sha256_hash, parent_contract_hash, amendment_type, api_key_id, visibility, machine_readable, expiry_date, created_at';

export interface CheckContractRow {
  id: string;
  contract_id: string;
  status: string;
  sha256_hash: string;
  parent_contract_hash?: string | null;
  amendment_type?: string | null;
  api_key_id?: string | null;
  visibility?: string | null;
  machine_readable?: unknown;
  expiry_date?: string | null;
}

export const MAX_AMENDMENT_HOPS = 20;

export type LookupResult =
  | { ok: true; contract: CheckContractRow }
  | { ok: false; status: 400 | 404; body: Record<string, unknown> };

/** Find a contract by amb- id, SHA-256 hash or UUID. */
export async function lookupContractForCheck(db: Db, ref: string): Promise<LookupResult> {
  const column = contractRefColumn(ref);
  if (!column) return { ok: false, status: 400, body: { ...INVALID_CONTRACT_REF } };
  const { data, error } = await db.from('contracts').select(CHECK_CONTRACT_COLUMNS).eq(column, ref).single();
  if (error || !data) {
    return { ok: false, status: 404, body: { error: 'not_found', message: 'Contract not found' } };
  }
  return { ok: true, contract: data as unknown as CheckContractRow };
}

/**
 * Follow an amended contract forward to its newest version. The approve route
 * stores each new version with parent_contract_hash = the old hash and marks
 * the old row `amended`. `findChild` returns the version that names the given
 * hash as its parent. Stops at the first row that is not `amended`, after
 * MAX_AMENDMENT_HOPS hops, or when a hash repeats.
 */
export async function followAmendments(
  start: CheckContractRow,
  findChild: (parentHash: string) => Promise<CheckContractRow | null>,
): Promise<CheckContractRow> {
  let current = start;
  const seen = new Set<string>([start.sha256_hash]);
  for (let hop = 0; hop < MAX_AMENDMENT_HOPS && current.status === 'amended'; hop++) {
    const child = await findChild(current.sha256_hash);
    if (!child || seen.has(child.sha256_hash)) break;
    seen.add(child.sha256_hash);
    current = child;
  }
  return current;
}

export function resolveEffectiveContract(db: Db, start: CheckContractRow): Promise<CheckContractRow> {
  return followAmendments(start, async (parentHash) => {
    const { data } = await db
      .from('contracts')
      .select(CHECK_CONTRACT_COLUMNS)
      .eq('parent_contract_hash', parentHash)
      .eq('amendment_type', 'amendment')
      .order('created_at', { ascending: false })
      .limit(1);
    const row = Array.isArray(data) ? data[0] : null;
    return (row as unknown as CheckContractRow) ?? null;
  });
}

async function validShareToken(db: Db, contractUuid: string, token: string): Promise<boolean> {
  const { data } = await db
    .from('share_tokens')
    .select('id, expires_at')
    .eq('contract_id', contractUuid)
    .eq('token', token)
    .single();
  if (!data) return false;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return false;
  return true;
}

/**
 * Same rule as GET /api/v1/contracts/[id]: a public contract is open to all;
 * otherwise the key that created it, or a valid share token, may read it.
 * (GET withholds a metadata_only contract's terms even from its owner; a
 * check returns a verdict and the limits the owner set, so the owner and
 * token holders are let in there.)
 */
export async function canCheckContract(
  db: Db,
  contract: CheckContractRow,
  caller: { keyId?: string | null; shareToken?: string | null },
): Promise<boolean> {
  if ((contract.visibility || 'private') === 'public') return true;
  if (caller.keyId && contract.api_key_id && caller.keyId === contract.api_key_id) return true;
  if (caller.shareToken) return validShareToken(db, contract.id, caller.shareToken);
  return false;
}

export interface CheckResponse extends CheckOutcome {
  contract_id: string;
  effective_contract_id: string;
  status: string;
  sha256_hash: string;
  checked_at: string;
  reader_url: string;
}

/** Evaluate the payment against the newest version of the agreement. */
export async function checkAgainstAgreement(
  db: Db,
  contract: CheckContractRow,
  tx: CheckTransaction,
  now: Date = new Date(),
): Promise<CheckResponse> {
  const effective = await resolveEffectiveContract(db, contract);
  const terms = termsFromMachineReadable(
    effective.machine_readable as Record<string, unknown> | null | undefined,
    effective.expiry_date,
  );
  const outcome = checkTransaction(terms, effective.status, tx, now);
  return {
    ...outcome,
    contract_id: contract.contract_id,
    effective_contract_id: effective.contract_id,
    status: effective.status,
    sha256_hash: effective.sha256_hash,
    checked_at: now.toISOString(),
    reader_url: `https://getamber.dev/reader/${effective.sha256_hash}`,
  };
}

const label = z.string().trim().min(1).max(200);

/** The payment to check. Amounts are plain numbers in the agreement's currency unit. */
export const checkTransactionSchema = z.object({
  amount: z.number().nonnegative(),
  currency: label.optional(),
  category: label.optional(),
  action: label.optional(),
  period_spent: z.number().nonnegative().optional(),
});
