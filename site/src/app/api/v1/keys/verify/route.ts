/**
 * POST /api/v1/keys/verify
 *
 * Redeems the single-use link emailed by POST /api/v1/keys. Clicking the link
 * is the proof of mailbox control that /api/v1/pricing advertises as
 * `requires: ['verified_email']`.
 *
 * Two-step by design when the address already holds a key:
 *   { token }                          -> { status: 'rotation_required', prefix }  (token NOT consumed)
 *   { token, confirm_rotation: true }  -> { status: 'issued', api_key }            (token consumed)
 *
 * Never rotate implicitly. Someone opening the link out of curiosity must
 * not have a live production key invalidated under them, so replacement always
 * takes a second, explicit act.
 *
 * Body: { token: string, confirm_rotation?: boolean }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateApiKey } from '@/lib/api-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { corsOptions } from '@/lib/cors';
import { hashClaimToken } from '@/lib/keys/claim-token';
import { FREE_TIER_CREDITS } from '@/lib/pricing';

const bodySchema = z.object({
  token: z.string().min(20).max(200),
  confirm_rotation: z.boolean().optional(),
});


/** One message for every rejection — expired, already used, and never-existed
 *  must be indistinguishable, or the endpoint becomes a token oracle. */
const INVALID = {
  error: 'invalid_token',
  message: 'This link is invalid, already used, or expired. Request a new one.',
} as const;

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = rateLimit(`keys-verify:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many requests. Limit: 10/min.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_error', details: parsed.error.issues }, { status: 400 });
  }

  const { token, confirm_rotation } = parsed.data;
  const tokenHash = hashClaimToken(token);
  const db = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  // Peek: needed to decide whether this is a first claim or a replacement.
  // Deliberately does not consume — the user may still be shown the rotation
  // warning and choose to back out, and their link must survive that.
  const { data: claim } = await db
    .from('key_claim_tokens')
    .select('id, email, purpose')
    .eq('token_hash', tokenHash)
    .is('consumed_at', null)
    .gt('expires_at', nowIso)
    .maybeSingle();

  if (!claim) {
    return NextResponse.json(INVALID, { status: 400 });
  }

  const email: string = claim.email;

  const { data: existing } = await db
    .from('api_keys')
    .select('id, key_prefix, credits')
    .eq('email', email)
    .in('tier', ['developer', 'alpha'])
    .eq('is_active', true)
    .maybeSingle();

  if (existing && !confirm_rotation) {
    return NextResponse.json(
      {
        status: 'rotation_required',
        prefix: existing.key_prefix,
        message: 'This email already has an active key. Continuing will stop it working and issue a new one.',
      },
      { status: 200 },
    );
  }

  // Consume atomically. The WHERE clause carries the single-use and expiry
  // conditions, so two simultaneous redemptions cannot both match — a
  // read-then-write would let both through.
  const { data: consumed } = await db
    .from('key_claim_tokens')
    .update({ consumed_at: nowIso })
    .eq('token_hash', tokenHash)
    .is('consumed_at', null)
    .gt('expires_at', nowIso)
    .select('id')
    .maybeSingle();

  if (!consumed) {
    return NextResponse.json(INVALID, { status: 400 });
  }

  // Deactivation must precede the insert: idx_api_keys_one_active_free_per_email
  // permits only one active free key per address.
  if (existing) {
    const { error: deactivateError } = await db
      .from('api_keys')
      .update({ is_active: false })
      .eq('id', existing.id);

    if (deactivateError) {
      console.error('Key rotation deactivate failed:', deactivateError);
      return NextResponse.json(
        { error: 'db_error', message: 'Could not replace the key. Your existing key still works.' },
        { status: 500 },
      );
    }
  }

  // The free grant is once per verified email: a rotation carries the remaining
  // balance over instead of granting it again. Re-read it now the old key is
  // deactivated: the balance read before could be stale if the old key burned
  // credits in the meantime.
  let grantedCredits: number = FREE_TIER_CREDITS;
  if (existing) {
    const { data: latest } = await db
      .from('api_keys')
      .select('credits')
      .eq('id', existing.id)
      .single();
    grantedCredits = (latest?.credits as number | undefined) ?? existing.credits;
  }

  const { key, hash, prefix } = generateApiKey();
  const { error: insertError } = await db.from('api_keys').insert({
    key_hash: hash,
    key_prefix: prefix,
    email,
    tier: 'developer',
    credits: grantedCredits,
    is_active: true,
    payment_method: 'free',
  });

  if (insertError) {
    console.error('Verified key insert failed:', insertError);
    // Compensate, or the user is left with no active key at all. (Concurrency
    // is already excluded here — the token was consumed atomically above, so
    // only one request ever reaches this point for a given link.)
    if (existing) {
      await db.from('api_keys').update({ is_active: true }).eq('id', existing.id);
    }
    return NextResponse.json(
      { error: 'db_error', message: 'Could not issue the key. Please request a new link.' },
      { status: 500 },
    );
  }

  logAudit({
    event_type: existing ? 'developer_key_rotated' : 'developer_key_claimed',
    severity: 'info',
    // audit_log is service-role only; keep identifying data out.
    actor: 'keys-verify-route',
    details: { tier: 'developer', credits: grantedCredits, rotated: Boolean(existing) },
    ip_address: ip,
  });

  return NextResponse.json(
    {
      status: 'issued',
      api_key: key,
      prefix,
      tier: 'developer',
      credits: grantedCredits,
      rotated: Boolean(existing),
      message: 'Save this key — it cannot be retrieved again.',
      docs: 'https://ambr.run/developers',
    },
    { status: 200 },
  );
}

export { corsOptions as OPTIONS };
