/**
 * POST /api/v1/admin/beta-access/toggle
 *
 * Admin-only. Grants or revokes a beta feature for a specific api_key.
 * Updates the JSONB column, writes an audit row, and queues an invite-email
 * row (only when granting + when no successful invite has been sent yet).
 *
 * Body:
 *   { api_key_id: string, feature: 'ai_chat', grant: boolean, notes?: string }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { validateApiKey, isAdmin } from '@/lib/api-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { corsOptions } from '@/lib/cors';

const bodySchema = z.object({
  api_key_id: z.string().uuid(),
  feature: z.enum(['ai_chat']),
  grant: z.boolean(),
  notes: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  const auth = await validateApiKey(request);
  if (!auth || !isAdmin(auth.email)) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Admin access required.' },
      { status: 403, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { api_key_id, feature, grant, notes } = parsed.data;
  const db = getSupabaseAdmin();

  // Load existing beta_features so we merge rather than overwrite siblings.
  const { data: key, error: keyErr } = await db
    .from('api_keys')
    .select('beta_features, email, is_active')
    .eq('id', api_key_id)
    .single();

  if (keyErr || !key) {
    return NextResponse.json(
      { error: 'not_found', message: 'API key not found.' },
      { status: 404 },
    );
  }

  if (!key.is_active) {
    return NextResponse.json(
      { error: 'inactive', message: 'Cannot grant beta access on an inactive API key.' },
      { status: 400 },
    );
  }

  // Merge: keep other flags, set the one we care about.
  const currentFlags = (key.beta_features as Record<string, boolean>) ?? {};
  const nextFlags = { ...currentFlags, [feature]: grant };

  const { error: updateErr } = await db
    .from('api_keys')
    .update({ beta_features: nextFlags })
    .eq('id', api_key_id);

  if (updateErr) {
    return NextResponse.json(
      { error: 'db_error', message: 'Failed to update beta_features.' },
      { status: 500 },
    );
  }

  // Audit row — always written, regardless of grant/revoke.
  await db.from('beta_access_grants').insert({
    api_key_id,
    feature,
    granted: grant,
    granted_by_email: auth.email,
    notes: notes ?? null,
  });

  // Queue an invite email if we're granting AND no successful send exists.
  let invite_queued = false;
  if (grant) {
    const { data: existingSent } = await db
      .from('beta_invite_emails')
      .select('id')
      .eq('api_key_id', api_key_id)
      .eq('feature', feature)
      .eq('status', 'sent')
      .maybeSingle();

    if (!existingSent) {
      await db.from('beta_invite_emails').insert({
        api_key_id,
        feature,
        status: 'queued',
      });
      invite_queued = true;
    }
  }

  return NextResponse.json({
    ok: true,
    api_key_id,
    feature,
    granted: grant,
    invite_queued,
  });
}

export { corsOptions as OPTIONS };
