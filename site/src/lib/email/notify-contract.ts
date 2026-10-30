/**
 * Contract notification helper — logs to `contract_notification_log`, sends
 * via Resend, never throws. Failures land as a row with status='failed' and
 * an error_message so we can retry from the admin UI or by re-firing the
 * upstream event.
 *
 * Callers (share / sign routes) MUST wrap calls in try/catch defensively
 * even though this helper doesn't throw — they should never fail the
 * underlying mutation because an email send hiccupped.
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendViaResend } from './send-via-resend';
import { renderShareInvite } from './contract-share-invite-template';
import { renderContractSigned } from './contract-signed-template';
import { renderContractActive } from './contract-active-template';

export type ContractNotificationEvent =
  | 'share_invite'
  | 'counterparty_signed'
  | 'contract_activated';

const FROM_ADDRESS = 'Ambr <hello@ambr.run>';

export interface NotifyContractParams {
  event: ContractNotificationEvent;
  contractId: string;            // DB uuid (FK to contracts.id)
  contractIdLabel: string;       // human-readable contract_id text column (amb-2026-…)
  contractHash: string;          // SHA-256
  recipientEmail: string;
  recipientRole: 'sender' | 'counterparty';

  // Per-event optional context
  readerUrl?: string;            // share_invite + contract_activated
  contractUrl?: string;          // counterparty_signed — dashboard contract-detail link
  senderName?: string;           // share_invite — sender email/display name
  expiresAt?: string;            // share_invite — token expiry ISO
  signerWalletShort?: string;    // counterparty_signed — short wallet display
  signedAtISO?: string;          // counterparty_signed
  activatedAtISO?: string;       // contract_activated
}

export async function notifyContract(
  params: NotifyContractParams,
): Promise<{ ok: boolean; detail?: string }> {
  const db = getSupabaseAdmin();

  // 1. Insert queued log row first — gives us an id to update afterwards
  //    and ensures we have a record even if the send fails before logging.
  let logRowId: string | null = null;
  try {
    const { data: logRow } = await db
      .from('contract_notification_log')
      .insert({
        contract_id: params.contractId,
        event: params.event,
        recipient_email: params.recipientEmail,
        recipient_role: params.recipientRole,
        status: 'queued',
      })
      .select('id')
      .single();
    logRowId = logRow?.id ?? null;
  } catch {
    // Even logging failed — proceed to send but won't be able to update status.
    // Could be a unique-constraint hit (already sent for this event/recipient).
    // Check explicitly so we can short-circuit and not double-send.
    const { data: existing } = await db
      .from('contract_notification_log')
      .select('id, status')
      .eq('contract_id', params.contractId)
      .eq('event', params.event)
      .eq('recipient_email', params.recipientEmail)
      .eq('status', 'sent')
      .maybeSingle();
    if (existing) {
      return { ok: true, detail: 'already_sent' };
    }
  }

  // 2. Render the right template
  let rendered: { subject: string; text: string; html: string };
  try {
    rendered = renderForEvent(params);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown render error';
    if (logRowId) {
      await db
        .from('contract_notification_log')
        .update({ status: 'failed', error_message: `render: ${detail}` })
        .eq('id', logRowId);
    }
    return { ok: false, detail };
  }

  // 3. Send via Resend
  try {
    const result = await sendViaResend({
      from: FROM_ADDRESS,
      to: params.recipientEmail,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });
    if (logRowId) {
      await db
        .from('contract_notification_log')
        .update({
          status: 'sent',
          resend_id: result.resendId,
          sent_at: new Date().toISOString(),
        })
        .eq('id', logRowId);
    }
    return { ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown send error';
    if (logRowId) {
      await db
        .from('contract_notification_log')
        .update({
          status: 'failed',
          error_message: detail.slice(0, 500),
        })
        .eq('id', logRowId);
    }
    return { ok: false, detail };
  }
}

function renderForEvent(p: NotifyContractParams): { subject: string; text: string; html: string } {
  switch (p.event) {
    case 'share_invite':
      if (!p.readerUrl) throw new Error('share_invite requires readerUrl');
      return renderShareInvite({
        recipientEmail: p.recipientEmail,
        contractIdLabel: p.contractIdLabel,
        contractHash: p.contractHash,
        readerUrl: p.readerUrl,
        senderName: p.senderName,
        expiresAt: p.expiresAt,
      });

    case 'counterparty_signed':
      if (!p.contractUrl) throw new Error('counterparty_signed requires contractUrl');
      if (!p.signedAtISO) throw new Error('counterparty_signed requires signedAtISO');
      return renderContractSigned({
        recipientEmail: p.recipientEmail,
        contractIdLabel: p.contractIdLabel,
        contractHash: p.contractHash,
        contractUrl: p.contractUrl,
        signerWalletShort: p.signerWalletShort,
        signedAtISO: p.signedAtISO,
      });

    case 'contract_activated':
      if (!p.readerUrl) throw new Error('contract_activated requires readerUrl');
      if (!p.activatedAtISO) throw new Error('contract_activated requires activatedAtISO');
      return renderContractActive({
        recipientEmail: p.recipientEmail,
        recipientRole: p.recipientRole,
        contractIdLabel: p.contractIdLabel,
        contractHash: p.contractHash,
        readerUrl: p.readerUrl,
        activatedAtISO: p.activatedAtISO,
      });

    default: {
      const _exhaust: never = p.event;
      throw new Error(`unknown contract event: ${_exhaust as string}`);
    }
  }
}
