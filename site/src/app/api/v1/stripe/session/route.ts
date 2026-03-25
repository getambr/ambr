import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { corsOptions } from '@/lib/cors';

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const rl = rateLimit(`stripe-session:${ip}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retry_after_ms: rl.resetAt - Date.now() },
      { status: 429 },
    );
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('session_id');

  if (!sessionId || !sessionId.startsWith('cs_')) {
    return NextResponse.json({ error: 'Invalid session_id' }, { status: 400 });
  }

  const db = getSupabaseAdmin();

  const { data, error } = await db
    .from('api_keys')
    .select('pending_key_display, key_prefix, tier, credits')
    .eq('stripe_session_id', sessionId)
    .single();

  if (error || !data) {
    // Webhook hasn't fired yet — client should poll
    return NextResponse.json({ status: 'pending' }, { status: 202 });
  }

  if (!data.pending_key_display) {
    // Key was already retrieved
    return NextResponse.json({
      status: 'already_retrieved',
      key_prefix: data.key_prefix,
      message: 'API key was already displayed. It cannot be retrieved again.',
    });
  }

  // Return the key and null the display column (one-time retrieval)
  await db
    .from('api_keys')
    .update({ pending_key_display: null })
    .eq('stripe_session_id', sessionId);

  return NextResponse.json({
    status: 'fulfilled',
    api_key: data.pending_key_display,
    prefix: data.key_prefix,
    tier: data.tier,
    credits: data.credits === -1 ? 'unlimited' : data.credits,
    message: 'Save this key — it cannot be retrieved again.',
    docs: 'https://ambr.run/developers',
  });
}

export { corsOptions as OPTIONS };
