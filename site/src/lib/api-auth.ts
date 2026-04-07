import { createHash, randomBytes } from 'crypto';
import { getSupabaseAdmin } from './supabase-admin';

// Re-export ADMIN_EMAILS and isAdmin from the shared (Node-free) module so
// server-side callers can import everything from one place.
export { ADMIN_EMAILS, isAdmin } from './admin-emails';

export interface DelegationScope {
  actions: ('create' | 'handshake' | 'read')[];
  templates?: string[];
}

export interface ApiKeyContext {
  keyId: string;
  email: string;
  credits: number;
  tier: string;
  principalWallet: string | null;
  delegationScope: DelegationScope | null;
  agentDailyLimit: number;
}

export async function validateApiKey(request: Request): Promise<ApiKeyContext | null> {
  const apiKey =
    request.headers.get('X-API-Key') ||
    request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!apiKey) return null;

  const keyHash = createHash('sha256').update(apiKey).digest('hex');
  const db = getSupabaseAdmin();

  const { data, error } = await db
    .from('api_keys')
    .select('id, email, credits, tier, is_active, principal_wallet, delegation_scope, agent_daily_limit')
    .eq('key_hash', keyHash)
    .single();

  if (error || !data || !data.is_active) return null;

  // Update last_used_at
  await db
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id);

  return {
    keyId: data.id,
    email: data.email,
    credits: data.credits,
    tier: data.tier,
    principalWallet: data.principal_wallet || null,
    delegationScope: data.delegation_scope as DelegationScope | null,
    agentDailyLimit: data.agent_daily_limit ?? 10,
  };
}

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const bytes = randomBytes(32);
  const key = 'amb_' + bytes.toString('base64url').slice(0, 40);
  const hash = createHash('sha256').update(key).digest('hex');
  const prefix = key.slice(0, 8);
  return { key, hash, prefix };
}

