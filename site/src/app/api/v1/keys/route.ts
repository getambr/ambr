/**
 * POST /api/v1/keys
 *
 * Free developer tier: does NOT return a key. It emails a single-use link
 * which verifies the mailbox and then reveals the key at /activate/reveal.
 * That link is also the recovery path — before this, a key was shown once,
 * SHA-256'd at rest, and a user who missed it was locked out of that email
 * permanently (the old 409 did not even filter is_active, so freezing a key
 * would not release it). It is additionally what makes the
 * `requires: ['verified_email']` claim published by /api/v1/pricing true.
 *
 * Paid tiers are unchanged: an on-chain tx_hash already proves intent and
 * ties the key to a wallet, so those still issue immediately.
 *
 * Body: { email: string, tier: 'developer'|'startup'|'scale', tx_hash?: string }
 */

import { NextResponse } from 'next/server';
import { activateKeySchema } from '@/lib/validation/contract-schemas';
import { generateApiKey } from '@/lib/api-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { verifyUSDCPayment } from '@/lib/chain/verify-payment';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { checkVelocity } from '@/lib/velocity';
import { corsOptions } from '@/lib/cors';
import { sendViaResend } from '@/lib/email/send-via-resend';
import { renderKeyClaim } from '@/lib/email/key-claim-template';
import {
  generateClaimToken,
  normalizeEmail,
  buildClaimUrl,
  CLAIM_TOKEN_TTL_MINUTES,
  CLAIM_REQUESTS_PER_EMAIL,
  CLAIM_EMAIL_WINDOW_MS,
} from '@/lib/keys/claim-token';

import { FREE_TIER_CREDITS, PACKS } from '@/lib/pricing';

const FROM_ADDRESS = 'Ambr <hello@ambr.run>';

// Credits are cents (1 credit = 1 US cent). Amounts come from @/lib/pricing.
// Enterprise is contact-only and never self-serve; -1 (unlimited) is only a
// legacy marker on keys created before 2026-10 and is still honoured.
const TIER_CREDITS: Record<string, number> = {
  developer: FREE_TIER_CREDITS,
  ...Object.fromEntries(PACKS.map((p) => [p.slug, p.credits])),
};

const TIER_PRICES_USD: Record<string, number> = {
  developer: 0,
  ...Object.fromEntries(PACKS.map((p) => [p.slug, p.price_cents / 100])),
};

// Disposable / throwaway email domains — block from free tier signup
// Short pragmatic list; extend as spam patterns emerge.
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
  'tempmail.com', 'temp-mail.org', 'throwawaymail.com', 'maildrop.cc',
  'yopmail.com', 'sharklasers.com', 'getnada.com', 'nada.email',
  'trashmail.com', 'trashmail.net', 'mailnesia.com', '10minutemail.com',
  '10minutemail.net', 'dispostable.com', 'mintemail.com', 'emailondeck.com',
  'mohmal.com', 'fakemailgenerator.com', 'fakeinbox.com', 'spam4.me',
  'mytemp.email', 'tempail.com', 'temp-mail.io', 'inboxkitten.com',
  'burnermail.io', 'tmail.ws', 'mail-temp.com', 'dropmail.me',
]);

function isDisposableEmail(email: string): boolean {
  const domain = email.toLowerCase().split('@')[1];
  if (!domain) return false;
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

export async function POST(request: Request) {
  // Rate limit: 3 requests/min per IP
  const ip = getClientIp(request);
  const rl = rateLimit(`keys:${ip}`, 3, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many requests. Limit: 3/min.', retry_after_ms: rl.resetAt - Date.now() },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Invalid JSON' },
      { status: 400 },
    );
  }

  const parsed = activateKeySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { tx_hash, tier } = parsed.data;
  // Normalise before any comparison or write. The old code used
  // .eq('email', email) with no unique constraint, so 'User@x.com' and
  // 'user@x.com' were two separate free keys.
  const email = normalizeEmail(parsed.data.email);
  const db = getSupabaseAdmin();

  // Block known disposable email providers (free tier only — paid tiers are self-policing)
  if (tier === 'developer' && isDisposableEmail(email)) {
    logAudit({
      event_type: 'signup_blocked_disposable_email',
      severity: 'warn',
      actor: email,
      ip_address: ip,
    });
    return NextResponse.json(
      { error: 'disposable_email_not_allowed', message: 'Please use a real email address. Disposable email providers are not supported for the free tier.' },
      { status: 400 },
    );
  }

  // --- Free Developer tier: email a single-use verification link ---
  if (tier === 'developer') {
    // Second limit, keyed on the address rather than the requester's IP, so a
    // stranger cannot flood someone else's inbox from rotating IPs.
    const emailRl = rateLimit(`keys:email:${email}`, CLAIM_REQUESTS_PER_EMAIL, CLAIM_EMAIL_WINDOW_MS);
    if (!emailRl.allowed) {
      return NextResponse.json(
        { error: 'rate_limited', message: 'Too many requests for this email. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((emailRl.resetAt - Date.now()) / 1000)) } },
      );
    }

    // Does this address already hold an active free key? Decides whether the
    // link issues a first key or replaces an existing one. maybeSingle(), not
    // single(): single() errors on 0 or 2+ rows, and the old code discarded
    // that error — so two rows made the guard silently pass and mint another key.
    const { data: existingDev, error: lookupError } = await db
      .from('api_keys')
      .select('key_prefix')
      .eq('email', email)
      .in('tier', ['developer', 'alpha'])
      .eq('is_active', true)
      .maybeSingle();

    if (lookupError) {
      console.error('Developer key lookup error:', lookupError);
      return NextResponse.json(
        { error: 'db_error', message: 'Could not process this request. Please try again.' },
        { status: 500 },
      );
    }

    const purpose = existingDev ? 'rotate' : 'claim';
    const { token, tokenHash, expiresAt } = generateClaimToken();

    const { error: tokenError } = await db.from('key_claim_tokens').insert({
      email,
      token_hash: tokenHash,
      purpose,
      ip_address: ip,
      expires_at: expiresAt,
    });

    if (tokenError) {
      console.error('Claim token insert error:', tokenError);
      return NextResponse.json(
        { error: 'db_error', message: 'Could not process this request. Please try again.' },
        { status: 500 },
      );
    }

    const mail = renderKeyClaim({
      claimUrl: buildClaimUrl(token),
      purpose,
      existingPrefix: existingDev?.key_prefix,
      expiresMinutes: CLAIM_TOKEN_TTL_MINUTES,
    });

    try {
      await sendViaResend({
        from: FROM_ADDRESS,
        to: email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        tags: [{ name: 'campaign', value: 'key_claim' }, { name: 'purpose', value: purpose }],
      });
    } catch (err) {
      // Independent of whether the address is registered, so this reveals
      // nothing — but silently 202-ing would leave the user waiting forever.
      console.error('Claim email send failed:', err);
      return NextResponse.json(
        { error: 'email_send_failed', message: 'Could not send the verification email. Please try again.' },
        { status: 500 },
      );
    }

    logAudit({
      event_type: 'developer_key_link_requested',
      severity: 'info',
      // audit_log is service-role only; still keep addresses out of it.
      // key_claim_tokens holds the address under RLS.
      actor: 'keys-route',
      details: { purpose },
      ip_address: ip,
    });

    // Identical response whether or not the address is registered. Do not
    // return a 409 'developer_exists' here: it is an account-enumeration oracle,
    // letting anyone probe which emails have signed up. The email itself
    // explains which case this is, and only the mailbox owner sees it.
    return NextResponse.json(
      {
        status: 'verification_sent',
        message: 'Check your email for a link to reveal your API key. It expires in 30 minutes.',
      },
      { status: 202 },
    );
  }

  // --- Paid tiers: require tx_hash ---
  if (!tx_hash) {
    return NextResponse.json(
      { error: 'missing_tx_hash', message: 'Transaction hash is required for paid tiers.' },
      { status: 400 },
    );
  }

  // Check if tx_hash already used
  const { data: existingTx } = await db
    .from('api_keys')
    .select('id')
    .eq('tx_hash', tx_hash)
    .single();

  if (existingTx) {
    return NextResponse.json(
      { error: 'tx_already_used', message: 'This transaction has already been used to claim a key' },
      { status: 409 },
    );
  }

  // Verify payment on-chain
  const verification = await verifyUSDCPayment(tx_hash, tier);
  if (!verification.valid) {
    logAudit({
      event_type: 'failed_payment',
      severity: 'warn',
      actor: email,
      details: { tx_hash, tier, error: verification.error },
      ip_address: ip,
    });
    return NextResponse.json(
      { error: 'payment_invalid', message: verification.error },
      { status: 402 },
    );
  }

  // Velocity check on payer wallet
  if (verification.from) {
    const velocity = await checkVelocity(verification.from, Number(verification.amount) || 0);
    if (!velocity.allowed) {
      logAudit({
        event_type: 'velocity_blocked',
        severity: 'error',
        actor: verification.from,
        details: { reason: velocity.reason, tx_hash },
        ip_address: ip,
      });
      return NextResponse.json(
        { error: 'velocity_limit', message: velocity.reason },
        { status: 429 },
      );
    }
  }

  // Generate API key
  const { key, hash, prefix } = generateApiKey();
  const credits = TIER_CREDITS[tier];

  const { error: insertError } = await db.from('api_keys').insert({
    key_hash: hash,
    key_prefix: prefix,
    email,
    tier,
    credits,
    tx_hash,
    tx_from: verification.from,
    amount_usdc: verification.amount,
    is_active: true,
  });

  if (insertError) {
    console.error('API key insert error:', insertError);
    return NextResponse.json(
      { error: 'db_error', code: insertError.code ?? 'unknown', message: 'Failed to create API key' },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      api_key: key,
      prefix,
      tier,
      credits: credits === -1 ? 'unlimited' : credits,
      message: 'Save this key — it cannot be retrieved again.',
      docs: 'https://ambr.run/developers',
    },
    { status: 201 },
  );
}

export { corsOptions as OPTIONS };
