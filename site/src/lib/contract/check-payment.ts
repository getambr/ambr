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
  created_at?: string | null;
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

export type NextVersion = { next: CheckContractRow } | { problem: string };

export interface EffectiveVersion {
  contract: CheckContractRow;
  /** Set when the chain could not be followed with confidence; the check then fails closed. */
  problem?: string;
}

/**
 * Follow an amended contract forward to its newest version. `findNext` says
 * which row replaced the given one, or why that cannot be known. Stops at the
 * first row that is not `amended`, after MAX_AMENDMENT_HOPS hops, or when a
 * hash repeats; the last two, and any `problem`, are reported, not guessed past.
 */
export async function followAmendments(
  start: CheckContractRow,
  findNext: (current: CheckContractRow) => Promise<NextVersion>,
): Promise<EffectiveVersion> {
  let current = start;
  const seen = new Set<string>([start.sha256_hash]);
  for (let hop = 0; current.status === 'amended'; hop++) {
    if (hop >= MAX_AMENDMENT_HOPS) {
      return { contract: current, problem: `The amendment chain is longer than ${MAX_AMENDMENT_HOPS} versions.` };
    }
    const step = await findNext(current);
    if ('problem' in step) return { contract: current, problem: step.problem };
    if (seen.has(step.next.sha256_hash)) {
      return { contract: current, problem: 'The amendment chain loops back on itself.' };
    }
    seen.add(step.next.sha256_hash);
    current = step.next;
  }
  return { contract: current };
}

/**
 * The version that replaced `current` is the one an approved amendment
 * proposal points at (resulting_contract_id, written by the approve route).
 * parent_contract_hash alone is not trusted: POST /contracts takes it from the
 * request body, so anyone could attach a fake "newer version" to a contract.
 * The approved proposal row, which only the approve route writes, is the trust
 * anchor; the new version must also name `current` as its parent. Its
 * api_key_id is NOT compared: the counterparty approves, and the new version
 * is stored under the approver's key.
 */
async function findApprovedNext(db: Db, current: CheckContractRow): Promise<NextVersion> {
  const { data: proposals } = await db
    .from('amendment_proposals')
    .select('resulting_contract_id')
    .eq('original_contract_id', current.id)
    .eq('status', 'approved');
  const ids = [...new Set((proposals ?? []).map((p: { resulting_contract_id: string | null }) => p.resulting_contract_id))];
  if (ids.length === 0) {
    return { problem: `The agreement is marked amended, but no approved amendment leads away from ${current.contract_id}.` };
  }
  if (ids.length > 1 || !ids[0]) {
    return { problem: `The amendment of ${current.contract_id} is ambiguous: more than one approved amendment, or none that points at a new version.` };
  }
  const { data: child } = await db.from('contracts').select(CHECK_CONTRACT_COLUMNS).eq('id', ids[0]).single();
  if (!child) {
    return { problem: `The amended version of ${current.contract_id} could not be found.` };
  }
  // The trust anchor is the approved proposal: only the approval route writes
  // resulting_contract_id, and amendment_proposals has RLS on with no policies,
  // so callers cannot write it. parent_contract_hash is not compared, because
  // a parent's sha256_hash can be re-derived after the amendment was stored
  // (the admin rehash route, the post-storage integrity fix), which would
  // strand a real amendment.
  return { next: child as unknown as CheckContractRow };
}

export function resolveEffectiveContract(db: Db, start: CheckContractRow): Promise<EffectiveVersion> {
  return followAmendments(start, (current) => findApprovedNext(db, current));
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

export interface CheckCaller {
  keyId?: string | null;
  shareToken?: string | null;
}

/**
 * A public contract is open to all; otherwise the key that created it, or a
 * valid share token, may check it.
 *
 * metadata_only: the check follows the reader page's rule, not GET's. GET
 * withholds the terms of a metadata_only contract from everyone, but the
 * reader page shows the capability summary (the limits) to the owner and to
 * share-token holders, and a check returns exactly that: a verdict and the
 * limits. So the owner and token holders are let in, anonymous callers are not.
 */
export async function canCheckContract(db: Db, contract: CheckContractRow, caller: CheckCaller): Promise<boolean> {
  if ((contract.visibility || 'private') === 'public') return true;
  if (caller.keyId && contract.api_key_id && caller.keyId === contract.api_key_id) return true;
  if (caller.shareToken) return validShareToken(db, contract.id, caller.shareToken);
  return false;
}

const VISIBILITY_RANK: Record<string, number> = { public: 0, metadata_only: 1, private: 2, encrypted: 2 };
const rank = (visibility?: string | null) => VISIBILITY_RANK[visibility || 'private'] ?? 2;

/**
 * Having passed on the contract asked for, a caller may also be shown the
 * version that replaced it when that version is no stricter in visibility, or
 * when the caller is a party to it: the original's creator key, or the key the
 * new version is stored under (the approver). Otherwise an amendment that
 * tightened visibility would leak its limits to someone who cannot read them.
 */
function mayCheckAmendment(
  original: CheckContractRow,
  effective: CheckContractRow,
  caller: CheckCaller,
): boolean {
  if (rank(effective.visibility) <= rank(original.visibility)) return true;
  const key = caller.keyId;
  return !!key && (key === original.api_key_id || key === effective.api_key_id);
}

export interface CheckResponse extends CheckOutcome {
  contract_id: string;
  effective_contract_id: string;
  status: string;
  sha256_hash: string;
  checked_at: string;
  reader_url: string;
}

export type RunCheckResult = { forbidden: true } | { forbidden: false; result: CheckResponse };

/**
 * Check a payment against the newest version of the agreement. The caller must
 * be allowed to see the contract asked for AND the version that replaced it:
 * an amendment can be stricter in visibility, and its limits must not reach
 * someone who could not read them directly. If the version chain cannot be
 * followed with confidence the answer is out_of_scope (rule "version").
 */
export async function runCheck(
  db: Db,
  contract: CheckContractRow,
  tx: CheckTransaction,
  caller: CheckCaller,
  now: Date = new Date(),
): Promise<RunCheckResult> {
  if (!(await canCheckContract(db, contract, caller))) return { forbidden: true };

  const { contract: effective, problem } = await resolveEffectiveContract(db, contract);
  if (effective !== contract && !mayCheckAmendment(contract, effective, caller)) {
    return { forbidden: true };
  }

  const terms = termsFromMachineReadable(
    effective.machine_readable as Record<string, unknown> | null | undefined,
    effective.expiry_date,
    effective.created_at,
  );
  const outcome = checkTransaction(terms, effective.status, tx, now);
  if (problem) {
    outcome.checks.unshift({ rule: 'version', result: 'fail', note: problem });
    outcome.reasons.unshift(problem);
    outcome.verdict = 'out_of_scope';
  }
  return {
    forbidden: false,
    result: {
      ...outcome,
      contract_id: contract.contract_id,
      effective_contract_id: effective.contract_id,
      status: effective.status,
      sha256_hash: effective.sha256_hash,
      checked_at: now.toISOString(),
      reader_url: `https://getamber.dev/reader/${effective.sha256_hash}`,
    },
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
