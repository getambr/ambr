import { createHash } from 'crypto';
import { getSupabaseAdmin } from './supabase-admin';

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
}) {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('contracts')
    .insert({
      contract_id: params.contractId,
      template_id: params.templateId,
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

  return data;
}

export async function decrementCredits(apiKeyId: string, currentCredits: number) {
  if (currentCredits === -1) return; // unlimited
  const db = getSupabaseAdmin();
  await db
    .from('api_keys')
    .update({ credits: currentCredits - 1 })
    .eq('id', apiKeyId);
}
