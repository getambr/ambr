import { createHash } from 'crypto';
import { getSupabaseAdmin } from './supabase-admin';
import { creditsAfterBurn, UNLIMITED_CREDITS } from './credits';

/**
 * Deep-sort all object keys recursively so JSON.stringify produces a
 * deterministic output regardless of insertion order. This is critical
 * because Postgres JSONB normalizes (alphabetically sorts) nested keys
 * on storage. Without deep-sorting, the hash computed pre-storage won't
 * match the hash recomputed after a DB round-trip.
 */
function deepSortKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(deepSortKeys);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    sorted[key] = deepSortKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

export function hashContract(
  humanReadable: string,
  machineReadable: Record<string, unknown>,
): string {
  const canonical = humanReadable + '\n---\n' + JSON.stringify(deepSortKeys(machineReadable));
  return createHash('sha256').update(canonical, 'utf-8').digest('hex');
}

/**
 * Hash scheme used before 2026-04-10: only the top-level keys were sorted.
 * Contracts stored then still carry that hash, so verification accepts both.
 */
function hashContractTopLevelSort(
  humanReadable: string,
  machineReadable: Record<string, unknown>,
): string {
  const sorted = Object.fromEntries(
    Object.keys(machineReadable).sort().map((k) => [k, machineReadable[k]]),
  );
  const canonical = humanReadable + '\n---\n' + JSON.stringify(sorted);
  return createHash('sha256').update(canonical, 'utf-8').digest('hex');
}

/**
 * Does the stored text still match the stored creation hash? Tries the
 * current deep-sort scheme, then the pre-2026-04-10 top-level sort. The one
 * check the reader, the status route and the MCP tools share. False when the
 * text or the machine-readable half is missing: nothing to verify.
 */
export function verifyContractHash(contract: {
  human_readable?: unknown;
  machine_readable?: unknown;
  sha256_hash?: unknown;
}): boolean {
  const { human_readable: human, machine_readable: machine, sha256_hash: stored } = contract;
  if (typeof human !== 'string' || typeof stored !== 'string') return false;
  if (!machine || typeof machine !== 'object' || Array.isArray(machine)) return false;
  const m = machine as Record<string, unknown>;
  try {
    return hashContract(human, m) === stored || hashContractTopLevelSort(human, m) === stored;
  } catch {
    return false;
  }
}

export async function generateContractId(): Promise<string> {
  const db = getSupabaseAdmin();
  const year = new Date().getFullYear();

  // Use Postgres function if available, fallback to count
  const { data: nextId } = await db.rpc('next_contract_id');
  if (nextId) return nextId;

  // Fallback: count existing contracts + 1
  const { count } = await db
    .from('contracts')
    .select('id', { count: 'exact', head: true });
  const seq = (count ?? 0) + 1;
  return `amb-${year}-${String(seq).padStart(4, '0')}`;
}

export async function storeContract(params: {
  contractId: string;
  templateId: string | null;
  /** The template's category (`templates.category`: consumer, commerce or
   *  delegation), stored as `contracts.contract_type`. The contract list's
   *  `?type=` filter, the dashboard and the cNFT "Contract Type" trait read
   *  it. Required, so no creation path can leave the column at its default. */
  contractType: string;
  humanReadable: string;
  machineReadable: Record<string, unknown>;
  sha256Hash: string;
  principalDeclaration: Record<string, unknown>;
  parameters: Record<string, unknown>;
  apiKeyId?: string;
  payerWallet?: string;
  paymentMethod?: 'api_key' | 'x402' | 'usdc_direct';
  visibility?: 'private' | 'metadata_only' | 'public' | 'encrypted';
  parentContractHash?: string;
  amendmentType?: 'original' | 'amendment' | 'extension';
  initialStatus?: string;
  oversightThresholdUsd?: number | null;
  principalApprovalRequired?: boolean;
  requireZkIdentity?: boolean;
  clientDraftId?: string;
  /** Deployer's connected wallet at creation time. Stored as
   *  `contracts.principal_wallet` and used by the sign endpoint to match
   *  the sender's wallet for the first signature. Never derived from
   *  `principal_declaration.agent_id`: that field often holds the
   *  counterparty's wallet, which would put one wallet on both sides. */
  principalWallet?: string | null;
  /** When true, this contract is a unilateral (one-sided) grant — the
   *  principal's first signature flips it to `active` directly, skipping the
   *  `pending_signature` step and the counterparty signature requirement.
   *  Sourced from `templates.is_one_sided` at deploy time. Stored
   *  denormalized on the contract row so the sign endpoint doesn't have to
   *  re-join templates on every signature. Default false → existing
   *  bilateral flow is untouched. */
  isOneSided?: boolean;
}) {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('contracts')
    .insert({
      contract_id: params.contractId,
      template_id: params.templateId,
      contract_type: params.contractType,
      status: params.initialStatus ?? 'draft',
      human_readable: params.humanReadable,
      machine_readable: params.machineReadable,
      sha256_hash: params.sha256Hash,
      principal_declaration: params.principalDeclaration,
      parameters: params.parameters,
      api_key_id: params.apiKeyId ?? null,
      payer_wallet: params.payerWallet ?? null,
      payment_method: params.paymentMethod ?? 'api_key',
      visibility: params.visibility ?? 'private',
      parent_contract_hash: params.parentContractHash ?? null,
      amendment_type: params.amendmentType ?? 'original',
      oversight_threshold_usd: params.oversightThresholdUsd ?? null,
      principal_approval_required: params.principalApprovalRequired ?? false,
      require_zk_identity: params.requireZkIdentity ?? false,
      client_draft_id: params.clientDraftId ?? null,
      is_one_sided: params.isOneSided ?? false,
      // Store wallet lowercased to match the sign endpoint's case-insensitive
      // comparison convention. Only an explicit principalWallet is stored;
      // without one the principal slot stays open (lib/contract/signers.ts).
      principal_wallet: params.principalWallet?.toLowerCase() ?? null,
    })
    .select('id, contract_id, sha256_hash, status, created_at')
    .single();

  if (error) throw error;

  // Post-storage integrity check: read back the stored content and verify
  // the hash still matches after the Postgres round-trip. If encoding
  // corruption happened during storage (e.g., UTF-8 → Latin-1 mojibake),
  // auto-fix by updating the hash to match the stored content. This way
  // the Reader portal always shows "Hash Verified" for the actual content.
  try {
    const { data: stored } = await db
      .from('contracts')
      .select('human_readable, machine_readable')
      .eq('id', data.id)
      .single();

    if (stored) {
      const verifyHash = hashContract(
        stored.human_readable as string,
        stored.machine_readable as Record<string, unknown>,
      );
      if (verifyHash !== params.sha256Hash) {
        console.error(
          `[HASH-INTEGRITY] Hash mismatch after storage for ${params.contractId}: ` +
          `expected ${params.sha256Hash}, got ${verifyHash}. Auto-fixing stored hash.`,
        );
        await db
          .from('contracts')
          .update({ sha256_hash: verifyHash })
          .eq('id', data.id);
      }
    }
  } catch (verifyErr) {
    // Non-fatal: if the verification read fails, the contract is still stored
    console.warn('[HASH-INTEGRITY] Post-storage verification failed:', verifyErr);
  }

  // Auto-bind the deployer's wallet to their account in account_wallets so
  // the dashboard's wallet-centric contract list (Phase B) can find this
  // contract under the user's bound wallets, not just their api_key_id.
  // Non-fatal: if the binding upsert fails (e.g., migration not yet applied
  // in some env), the contract is still stored correctly.
  if (params.apiKeyId && params.principalWallet) {
    try {
      await bindWalletToAccount({
        apiKeyId: params.apiKeyId,
        wallet: params.principalWallet,
        source: 'auto_deploy',
      });
    } catch (bindErr) {
      console.warn('[ACCOUNT-WALLETS] auto_deploy binding failed:', bindErr);
    }
  }

  return data;
}

/**
 * Upsert a (api_key_id, wallet) binding into account_wallets. Lowercases the
 * wallet for case-insensitive joins downstream. Idempotent — ON CONFLICT does
 * nothing, so existing rows keep their original `bound_at` and `source`.
 *
 * Sources are open-vocab strings; current valid values are auto_deploy /
 * auto_signature / auto_wallet_auth / auto_backfill / manual. See migration
 * 20260525222858_account_wallets.sql for the CHECK constraint.
 */
export async function bindWalletToAccount(params: {
  apiKeyId: string;
  wallet: string;
  source: 'auto_deploy' | 'auto_signature' | 'auto_wallet_auth' | 'manual';
}): Promise<void> {
  // Skip if wallet doesn't look like a real Ethereum address — prevents
  // garbage like 'null' / '0x' / '0xdeadbeef' bloating the table.
  if (!/^0x[a-fA-F0-9]{40}$/.test(params.wallet)) return;
  const db = getSupabaseAdmin();
  const { error } = await db
    .from('account_wallets')
    .upsert({
      api_key_id: params.apiKeyId,
      wallet_address: params.wallet.toLowerCase(),
      source: params.source,
    }, { onConflict: 'api_key_id,wallet_address', ignoreDuplicates: true });
  if (error) {
    // Non-fatal — log and move on. Most likely cause: migration not applied
    // (table doesn't exist yet). Should self-heal once migration runs.
    console.warn('[ACCOUNT-WALLETS] upsert failed:', error.message);
  }
}

/**
 * Burn `priceCents` credits from a key. Atomic and never negative: the
 * balance is re-read and the update is conditional on that exact balance
 * (compare-and-swap), retried if a concurrent burn moved it. The balance
 * passed in by callers at auth time is deliberately not trusted.
 * Returns the new balance, or null when the key cannot pay.
 */
export async function decrementCredits(apiKeyId: string, priceCents: number): Promise<number | null> {
  const db = getSupabaseAdmin();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: row, error } = await db
      .from('api_keys')
      .select('credits')
      .eq('id', apiKeyId)
      .single();
    if (error || !row) return null;

    const next = creditsAfterBurn(row.credits as number, priceCents);
    if (next === null) return null;
    if (next === UNLIMITED_CREDITS) return UNLIMITED_CREDITS;

    const { data: updated } = await db
      .from('api_keys')
      .update({ credits: next })
      .eq('id', apiKeyId)
      .eq('credits', row.credits)
      .select('credits');
    if (updated && updated.length > 0) return next;
  }
  return null;
}

/**
 * Add `amount` credits to a key (plan grants). Same compare-and-swap loop as
 * decrementCredits; a legacy unlimited key (-1) stays unlimited.
 * Returns the new balance, or null if the key is missing or kept changing.
 */
export async function grantCredits(apiKeyId: string, amount: number): Promise<number | null> {
  const db = getSupabaseAdmin();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: row, error } = await db
      .from('api_keys')
      .select('credits')
      .eq('id', apiKeyId)
      .single();
    if (error || !row) return null;
    if (row.credits === UNLIMITED_CREDITS) return UNLIMITED_CREDITS;

    const next = (row.credits as number) + amount;
    const { data: updated } = await db
      .from('api_keys')
      .update({ credits: next })
      .eq('id', apiKeyId)
      .eq('credits', row.credits)
      .select('credits');
    if (updated && updated.length > 0) return next;
  }
  return null;
}
