import { createHash, randomBytes } from 'crypto';
import { getSupabaseAdmin } from './supabase-admin';

export interface ApiKeyContext {
  keyId: string;
  email: string;
  credits: number;
  tier: string;
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
    .select('id, email, credits, tier, is_active')
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
  };
}

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const bytes = randomBytes(32);
  const key = 'amb_' + bytes.toString('base64url').slice(0, 40);
  const hash = createHash('sha256').update(key).digest('hex');
  const prefix = key.slice(0, 8);
  return { key, hash, prefix };
}
