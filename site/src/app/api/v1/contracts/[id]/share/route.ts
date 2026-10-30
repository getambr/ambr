import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { contractRefColumn, INVALID_CONTRACT_REF } from '@/lib/contract/lookup';
import { validateApiKey } from '@/lib/api-auth';
import { corsOptions } from '@/lib/cors';
import { notifyContract } from '@/lib/email/notify-contract';

/**
 * POST /api/v1/contracts/[id]/share
 *
 * Generate a time-limited share token for a contract.
 * Allows lawyers, auditors, or counterparties to view the full contract
 * without needing an API key or wallet connection.
 *
 * Auth: API key (must be the contract creator).
 * Body: {
 *   expires_in_hours?: number,            // default: 168 = 7 days, max: 8760 = 1 year
 *   access_level?: 'full' | 'scope',      // default 'full'. 'scope' redacts the
 *                                         // principal's identity + full prose and
 *                                         // shows only the capability summary
 *                                         // (what the agent may do) + validity.
 *   purpose?: 'invite' | 'deployer',      // default 'invite': a link for the other
 *                                         // party; with full access its holder may
 *                                         // fill an open counterparty slot.
 *                                         // 'deployer' is the creator's own link: it
 *                                         // opens the reader and fills no slot. An
 *                                         // emailed link is always an invite and a
 *                                         // scope link never is; any other value,
 *                                         // or a purpose that contradicts the rest
 *                                         // of the body, is a 400.
 *   recipient_email?: string,             // optional — fires share-invite email if provided
 *   recipient_role?: 'counterparty'       // currently only counterparty supported
 * }
 */

const DEFAULT_EXPIRY_HOURS = 168; // 7 days
const MAX_EXPIRY_HOURS = 8760; // 1 year

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Auth
  const apiCtx = await validateApiKey(request);
  if (!apiCtx) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'API key required (X-API-Key header)' },
      { status: 401 },
    );
  }

  const db = getSupabaseAdmin();

  // Lookup contract
  let query = db.from('contracts').select('id, contract_id, sha256_hash, api_key_id');
  const column = contractRefColumn(id);
  if (!column) {
    return NextResponse.json(INVALID_CONTRACT_REF, { status: 400 });
  }
  query = query.eq(column, id);

  const { data: contract, error: contractError } = await query.single();

  if (contractError || !contract) {
    return NextResponse.json(
      { error: 'not_found', message: 'Contract not found' },
      { status: 404 },
    );
  }

  // Only the contract creator can generate share tokens
  if (contract.api_key_id !== apiCtx.keyId) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Only the contract creator can generate share links' },
      { status: 403 },
    );
  }

  // Parse expiry
  const body = await request.json().catch(() => ({}));
  const expiresInHours = Math.min(
    Math.max(1, body.expires_in_hours ?? DEFAULT_EXPIRY_HOURS),
    MAX_EXPIRY_HOURS,
  );

  const accessLevel = body.access_level === 'scope' ? 'scope' : 'full';

  // Strict, because a misread purpose would mint a link that can sign.
  if (body.purpose !== undefined && body.purpose !== null && body.purpose !== 'invite' && body.purpose !== 'deployer') {
    return NextResponse.json(
      { error: 'invalid_purpose', message: "purpose must be 'invite' or 'deployer'" },
      { status: 400 },
    );
  }

  const recipientEmail = typeof body.recipient_email === 'string'
    ? body.recipient_email.trim().toLowerCase()
    : null;
  const emailsInvite = recipientEmail !== null && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail);

  // The invite email goes to the other party, who needs a link that can sign.
  if (body.purpose === 'deployer' && emailsInvite) {
    return NextResponse.json(
      {
        error: 'purpose_conflict',
        message:
          "An emailed link is an invite for the other party. Leave out recipient_email to make a 'deployer' link, " +
          'or leave out purpose to email an invite.',
      },
      { status: 400 },
    );
  }
  // A scope link shows only the capability summary and can never sign.
  if (body.purpose === 'invite' && accessLevel === 'scope') {
    return NextResponse.json(
      {
        error: 'purpose_conflict',
        message: "A scope link cannot sign, so it cannot be an invite. Leave out access_level to make an invite.",
      },
      { status: 400 },
    );
  }
  const purpose = accessLevel === 'full' && body.purpose !== 'deployer' ? 'invite' : 'deployer';

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

  const { error: insertError } = await db.from('share_tokens').insert({
    contract_id: contract.id,
    token,
    created_by_api_key_id: apiCtx.keyId,
    expires_at: expiresAt,
    access_level: accessLevel,
    // An invite lets a full-access holder fill an open counterparty slot; a
    // deployer link only opens the reader (see lib/contract/share-token.ts).
    purpose,
  });

  if (insertError) {
    return NextResponse.json(
      { error: 'storage_failed', message: 'Failed to create share token' },
      { status: 500 },
    );
  }

  const shareUrl = `https://getamber.dev/reader/${contract.sha256_hash}?token=${token}`;

  // Optional: fire share-invite email to the counterparty.
  // Email failures NEVER block the share-token response — we log status='failed'
  // in contract_notification_log and return 200 anyway so the sender always
  // gets a usable URL even if Resend is down.
  let invite_email_sent: boolean | null = null;

  if (recipientEmail && emailsInvite) {
    // Persist counterparty email on the contract (only if not already set,
    // to preserve a value the counterparty themselves provided at sign time).
    try {
      await db
        .from('contracts')
        .update({ counterparty_email: recipientEmail })
        .eq('id', contract.id)
        .is('counterparty_email', null);
    } catch {
      // Non-fatal — column persistence failure shouldn't block email send.
    }

    try {
      const result = await notifyContract({
        event: 'share_invite',
        contractId: contract.id,
        contractIdLabel: contract.contract_id,
        contractHash: contract.sha256_hash,
        recipientEmail,
        recipientRole: 'counterparty',
        readerUrl: shareUrl,
        senderName: apiCtx.email,
        expiresAt,
      });
      invite_email_sent = result.ok;
    } catch {
      invite_email_sent = false;
    }
  }

  return NextResponse.json({
    share_url: shareUrl,
    token,
    contract_id: contract.contract_id,
    access_level: accessLevel,
    purpose,
    expires_at: expiresAt,
    expires_in_hours: expiresInHours,
    ...(invite_email_sent !== null ? { invite_email_sent } : {}),
  });
}

export { corsOptions as OPTIONS };
