/**
 * POST /api/v1/resend/webhook
 *
 * Receives Resend delivery events (sent/delivered/bounced/opened/clicked) and
 * records them in `email_events`, giving outbound email a feedback loop it
 * previously had none of.
 *
 * Structure deliberately mirrors /api/v1/stripe/webhook: raw body via
 * request.text(), verify BEFORE parsing, and always acknowledge with
 * { received: true } unless a real database failure occurred. A non-2xx makes
 * Resend retry, so 4xx-ing an event we merely don't handle would wedge their
 * queue on a message that will never succeed.
 *
 * Required env: RESEND_WEBHOOK_SECRET (the `whsec_…` signing secret from
 * https://resend.com/webhooks)
 */

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { logAudit } from '@/lib/audit';
import { verifySvixSignature } from '@/lib/email/verify-svix';

/** Event types the `email_events.event_type` CHECK constraint accepts. */
const KNOWN_EVENT_TYPES = new Set([
  'email.sent',
  'email.scheduled',
  'email.delivered',
  'email.delivery_delayed',
  'email.bounced',
  'email.complained',
  'email.failed',
  'email.opened',
  'email.clicked',
]);

/** Events worth an audit entry. Opens and clicks are too frequent to log. */
const AUDITABLE = new Set(['email.bounced', 'email.complained', 'email.failed']);

interface ResendWebhookBody {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    subject?: string;
    created_at?: string;
    tags?: unknown;
    click?: { link?: string };
  };
}

export async function POST(request: Request) {
  const body = await request.text();

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('RESEND_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const verified = verifySvixSignature({ payload: body, headers: request.headers, secret });
  if (!verified.ok) {
    // Distinguish "you forgot the headers" from "this signature is wrong" —
    // both are 400, but only the latter is worth alarm.
    console.error(`Resend webhook rejected: ${verified.reason}`);
    return NextResponse.json(
      { error: verified.reason === 'missing_headers' ? 'Missing signature' : 'Invalid signature' },
      { status: 400 },
    );
  }

  let event: ResendWebhookBody;
  try {
    event = JSON.parse(body);
  } catch {
    console.error('Resend webhook body was not valid JSON');
    return NextResponse.json({ received: true });
  }

  const eventType = event.type;
  const resendId = event.data?.email_id;

  if (!eventType || !KNOWN_EVENT_TYPES.has(eventType)) {
    // A new Resend event type would violate the CHECK constraint and 500 into
    // an infinite retry. Acknowledge and move on; add it to the enum later.
    console.warn(`Resend webhook: unhandled event type ${JSON.stringify(eventType)}`);
    return NextResponse.json({ received: true });
  }

  if (!resendId) {
    console.error(`Resend webhook ${eventType} missing data.email_id`);
    return NextResponse.json({ received: true });
  }

  const to = event.data?.to;
  const recipientEmail = Array.isArray(to) ? to[0] : to;

  const db = getSupabaseAdmin();

  // Upsert rather than the Stripe route's select-then-insert: the unique index
  // on svix_id makes this atomic, so two concurrent redeliveries of the same
  // event can't both pass an existence check and double-insert.
  const { error } = await db
    .from('email_events')
    .upsert(
      {
        svix_id: verified.id,
        resend_id: resendId,
        event_type: eventType,
        recipient_email: recipientEmail ?? null,
        subject: event.data?.subject ?? null,
        tags: event.data?.tags ?? null,
        click_url: event.data?.click?.link ?? null,
        payload: event,
        occurred_at: event.data?.created_at ?? event.created_at ?? null,
      },
      { onConflict: 'svix_id', ignoreDuplicates: true },
    );

  if (error) {
    console.error('email_events insert failed:', error.message);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }

  if (AUDITABLE.has(eventType)) {
    // audit_log is service-role only; keep identifying data out. The recipient address and
    // subject live in email_events, which is RLS-locked; resend_id is the join
    // key for anyone who legitimately needs them. Mirrors the metadata-only
    // posture of chat_usage.
    logAudit({
      event_type: `resend_${eventType.replace('email.', '')}`,
      severity: 'warn',
      actor: 'resend-webhook',
      details: { resend_id: resendId },
    });
  }

  return NextResponse.json({ received: true });
}
