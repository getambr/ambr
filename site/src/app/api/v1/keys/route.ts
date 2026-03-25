import { NextResponse } from 'next/server';
import { activateKeySchema } from '@/lib/validation/contract-schemas';
import { generateApiKey } from '@/lib/api-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { verifyUSDCPayment } from '@/lib/chain/verify-payment';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { checkVelocity } from '@/lib/velocity';
import { corsOptions } from '@/lib/cors';

const TIER_CREDITS: Record<string, number> = {
  starter: 50,
  builder: 250,
  enterprise: -1, // unlimited
};

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

  const { email, tx_hash, tier } = parsed.data;
  const db = getSupabaseAdmin();

  // --- Free Alpha tier: no payment required ---
  if (tier === 'alpha') {
    // Check if email already has a free alpha key
    const { data: existingAlpha } = await db
      .from('api_keys')
      .select('id')
      .eq('email', email)
      .eq('tier', 'alpha')
      .single();

    if (existingAlpha) {
      return NextResponse.json(
        { error: 'alpha_exists', message: 'A free alpha key already exists for this email.' },
        { status: 409 },
      );
    }

    const { key, hash, prefix } = generateApiKey();
    const { error: insertError } = await db.from('api_keys').insert({
      key_hash: hash,
      key_prefix: prefix,
      email,
      tier: 'alpha',
      credits: 5,
      is_active: true,
      payment_method: 'free',
    });

    if (insertError) {
      console.error('Alpha key insert error:', insertError);
      return NextResponse.json(
        { error: 'db_error', message: 'Failed to create API key' },
        { status: 500 },
      );
    }

    logAudit({
      event_type: 'alpha_key_claimed',
      severity: 'info',
      actor: email,
      details: { tier: 'alpha', credits: 5 },
      ip_address: ip,
    });

    return NextResponse.json(
      {
        api_key: key,
        prefix,
        tier: 'alpha',
        credits: 5,
        message: 'Free alpha key activated. Save this key — it cannot be retrieved again.',
        docs: 'https://ambr.run/developers',
      },
      { status: 201 },
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
      { error: 'db_error', message: 'Failed to create API key' },
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
