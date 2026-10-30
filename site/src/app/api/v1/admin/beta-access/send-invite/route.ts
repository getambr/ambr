/**
 * POST /api/v1/admin/beta-access/send-invite
 *
 * Admin-only. Sends a queued/failed invite email via Resend.
 * If no `invite_id` is passed, sends every row currently in 'queued' status.
 * If an `invite_id` is passed, retries that specific row.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { validateApiKey, isAdmin } from '@/lib/api-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { renderBetaInvite } from '@/lib/email/beta-invite-template';
import { sendViaResend } from '@/lib/email/send-via-resend';
import { corsOptions } from '@/lib/cors';

const bodySchema = z.object({
  invite_id: z.string().uuid().optional(),
});

const FROM_ADDRESS = 'Ambr <hello@ambr.run>';

interface SendResult {
  invite_id: string;
  status: 'sent' | 'failed';
  resend_id?: string;
  error_message?: string;
}

export async function POST(request: Request) {
  const auth = await validateApiKey(request);
  if (!auth || !isAdmin(auth.email)) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Admin access required.' },
      { status: 403, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const db = getSupabaseAdmin();

  // Select invites to process.
  let query = db
    .from('beta_invite_emails')
    .select('id, api_key_id, feature, status')
    .in('status', ['queued', 'failed']);

  if (parsed.data.invite_id) {
    query = query.eq('id', parsed.data.invite_id);
  }

  const { data: invites, error: invErr } = await query.limit(50);
  if (invErr) {
    return NextResponse.json(
      { error: 'db_error', message: 'Failed to load invite queue.' },
      { status: 500 },
    );
  }

  if (!invites || invites.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, results: [] });
  }

  // Join api_keys for recipient emails.
  const apiKeyIds = invites.map((i) => i.api_key_id);
  const { data: keys } = await db
    .from('api_keys')
    .select('id, email')
    .in('id', apiKeyIds);

  const emailByKeyId = new Map<string, string>();
  for (const k of keys ?? []) emailByKeyId.set(k.id, k.email);

  const results: SendResult[] = [];

  for (const inv of invites) {
    const recipient = emailByKeyId.get(inv.api_key_id);
    if (!recipient) {
      await db
        .from('beta_invite_emails')
        .update({ status: 'failed', error_message: 'recipient api_key not found' })
        .eq('id', inv.id);
      results.push({ invite_id: inv.id, status: 'failed', error_message: 'recipient api_key not found' });
      continue;
    }

    if (inv.feature !== 'ai_chat') {
      await db
        .from('beta_invite_emails')
        .update({ status: 'failed', error_message: `unknown feature: ${inv.feature}` })
        .eq('id', inv.id);
      results.push({ invite_id: inv.id, status: 'failed', error_message: `unknown feature: ${inv.feature}` });
      continue;
    }

    const { subject, text, html } = renderBetaInvite({
      recipientEmail: recipient,
      feature: 'ai_chat',
    });

    try {
      const result = await sendViaResend({
        from: FROM_ADDRESS,
        to: recipient,
        subject,
        text,
        html,
      });
      await db
        .from('beta_invite_emails')
        .update({
          status: 'sent',
          resend_id: result.resendId,
          sent_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', inv.id);
      results.push({ invite_id: inv.id, status: 'sent', resend_id: result.resendId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      await db
        .from('beta_invite_emails')
        .update({ status: 'failed', error_message: message.slice(0, 500) })
        .eq('id', inv.id);
      results.push({ invite_id: inv.id, status: 'failed', error_message: message });
    }
  }

  const sent = results.filter((r) => r.status === 'sent').length;
  return NextResponse.json({ ok: true, sent, results });
}

export { corsOptions as OPTIONS };
