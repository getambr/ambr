import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * What a share token grants on one contract. One check for the reader page and
 * the sign route, so what a token opens cannot drift between them.
 *
 *   full   the whole contract
 *   scope  only the capability summary, meant for showing a mandate to third
 *          parties; never enough to sign
 *   null   no such token for this contract, or it has expired
 *
 * Viewing and inviting are different grants. A token also has a purpose:
 *   deployer  the 30-day link handed to whoever created the contract, so their
 *             own reader URL works; it opens the reader and signs nothing
 *   invite    made by POST /share for the other party; the only kind that
 *             lets its holder fill an open counterparty slot
 * Every token made before purpose existed reads as 'deployer'.
 *
 * share_tokens has no revoked column; an expired or deleted row is the only way
 * a token stops working.
 */
export type ShareAccess = 'full' | 'scope' | null;

/** Viewing: any purpose. */
export async function validateShareToken(contractUuid: string, token: string): Promise<ShareAccess> {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from('share_tokens')
    .select('expires_at, access_level')
    .eq('contract_id', contractUuid)
    .eq('token', token)
    .single();

  if (!data) return null;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null;
  return data.access_level === 'scope' ? 'scope' : 'full';
}

/** Signing: a full-access token made as an invite, for this contract, not expired. */
export async function isInviteToken(contractUuid: string, token: string): Promise<boolean> {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from('share_tokens')
    .select('expires_at, access_level, purpose')
    .eq('contract_id', contractUuid)
    .eq('token', token)
    .single();

  if (!data) return false;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return false;
  return data.access_level !== 'scope' && data.purpose === 'invite';
}
