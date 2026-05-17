/**
 * GET /api/v1/admin/beta-access/list
 *
 * Admin-only. Returns the merged view used by the Beta Access dashboard:
 * every active api_key + their beta_features + last-7d usage + most-recent
 * grant + invite-email status.
 *
 * One pass over the DB so the UI renders fast.
 */

import { NextResponse } from 'next/server';
import { validateApiKey, isAdmin } from '@/lib/api-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

interface BetaTesterRow {
  api_key_id: string;
  email: string;
  tier: string;
  is_admin: boolean;
  beta_features: Record<string, boolean>;
  usage_7d: {
    message_count: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  };
  last_grant: {
    granted: boolean;
    granted_by_email: string;
    granted_at: string;
    notes: string | null;
  } | null;
  invite_email: {
    status: 'queued' | 'sent' | 'failed' | null;
    sent_at: string | null;
    error_message: string | null;
  } | null;
}

export async function GET(request: Request) {
  const auth = await validateApiKey(request);
  if (!auth || !isAdmin(auth.email)) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Admin access required.' },
      { status: 403, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  const db = getSupabaseAdmin();

  const { data: keys, error: keysErr } = await db
    .from('api_keys')
    .select('id, email, tier, beta_features, is_active, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (keysErr || !keys) {
    return NextResponse.json(
      { error: 'db_error', message: 'Could not load api_keys' },
      { status: 500 },
    );
  }

  // Pull all admin emails for is_admin flagging.
  const { ADMIN_EMAILS } = await import('@/lib/admin-emails');
  const adminEmailsLower = ADMIN_EMAILS.map((e) => e.toLowerCase());

  // Pull last-7d usage in one go.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: usage } = await db
    .from('chat_usage')
    .select('api_key_id, input_tokens, output_tokens, cost_usd')
    .gte('created_at', sevenDaysAgo)
    .not('api_key_id', 'is', null);

  const usageByKey = new Map<string, { message_count: number; input_tokens: number; output_tokens: number; cost_usd: number }>();
  for (const row of usage ?? []) {
    if (!row.api_key_id) continue;
    const acc = usageByKey.get(row.api_key_id) ?? { message_count: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 };
    acc.message_count += 1;
    acc.input_tokens += row.input_tokens ?? 0;
    acc.output_tokens += row.output_tokens ?? 0;
    acc.cost_usd += Number(row.cost_usd) || 0;
    usageByKey.set(row.api_key_id, acc);
  }

  // Pull most-recent grant per api_key.
  const { data: grants } = await db
    .from('beta_access_grants')
    .select('api_key_id, granted, granted_by_email, granted_at, notes')
    .eq('feature', 'ai_chat')
    .order('granted_at', { ascending: false });

  const lastGrantByKey = new Map<string, { granted: boolean; granted_by_email: string; granted_at: string; notes: string | null }>();
  for (const g of grants ?? []) {
    if (!lastGrantByKey.has(g.api_key_id)) {
      lastGrantByKey.set(g.api_key_id, {
        granted: g.granted,
        granted_by_email: g.granted_by_email,
        granted_at: g.granted_at,
        notes: g.notes,
      });
    }
  }

  // Pull invite-email status per api_key.
  const { data: invites } = await db
    .from('beta_invite_emails')
    .select('api_key_id, status, sent_at, error_message, created_at')
    .eq('feature', 'ai_chat')
    .order('created_at', { ascending: false });

  const inviteByKey = new Map<string, { status: 'queued' | 'sent' | 'failed'; sent_at: string | null; error_message: string | null }>();
  for (const inv of invites ?? []) {
    if (!inviteByKey.has(inv.api_key_id)) {
      inviteByKey.set(inv.api_key_id, {
        status: inv.status as 'queued' | 'sent' | 'failed',
        sent_at: inv.sent_at,
        error_message: inv.error_message,
      });
    }
  }

  const rows: BetaTesterRow[] = keys.map((k) => ({
    api_key_id: k.id,
    email: k.email,
    tier: k.tier,
    is_admin: adminEmailsLower.includes(k.email.toLowerCase()),
    beta_features: (k.beta_features as Record<string, boolean>) ?? {},
    usage_7d: usageByKey.get(k.id) ?? { message_count: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 },
    last_grant: lastGrantByKey.get(k.id) ?? null,
    invite_email: inviteByKey.get(k.id) ?? null,
  }));

  return NextResponse.json(
    { rows },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
