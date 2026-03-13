import { createHash } from 'crypto';
import { getSupabaseAdmin } from './supabase-admin';

export function hashContract(
  humanReadable: string,
  machineReadable: Record<string, unknown>,
): string {
  const sortedKeys = Object.keys(machineReadable).sort();
  const sortedObj = Object.fromEntries(sortedKeys.map((k) => [k, machineReadable[k]]));
  const canonical = humanReadable + '\n---\n' + JSON.stringify(sortedObj);
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
  apiKeyId: string;
  parentContractHash?: string;
  amendmentType?: 'original' | 'amendment' | 'extension';
}) {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('contracts')
    .insert({
      contract_id: params.contractId,
      template_id: params.templateId,
      status: 'draft',
      human_readable: params.humanReadable,
      machine_readable: params.machineReadable,
      sha256_hash: params.sha256Hash,
      principal_declaration: params.principalDeclaration,
      parameters: params.parameters,
      api_key_id: params.apiKeyId,
      parent_contract_hash: params.parentContractHash ?? null,
      amendment_type: params.amendmentType ?? 'original',
    })
    .select('id, contract_id, sha256_hash, status, created_at')
    .single();

  if (error) throw error;
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
