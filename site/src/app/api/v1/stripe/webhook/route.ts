import { NextResponse } from 'next/server';
import { getStripe, TIER_PRICES } from '@/lib/stripe';
import { generateApiKey } from '@/lib/api-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { logAudit } from '@/lib/audit';

export async function POST(request: Request) {
  const stripe = getStripe();
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    if (session.payment_status !== 'paid') {
      return NextResponse.json({ received: true });
    }

    const tier = session.metadata?.tier;
    const email = session.metadata?.email;

    if (!tier || !email) {
      console.error('Webhook missing metadata:', session.id);
      return NextResponse.json({ received: true });
    }

    const tierConfig = TIER_PRICES[tier];
    if (!tierConfig) {
      console.error('Unknown tier in webhook:', tier);
      return NextResponse.json({ received: true });
    }

    // Check idempotency — don't create duplicate keys
    const db = getSupabaseAdmin();
    const { data: existing } = await db
      .from('api_keys')
      .select('id')
      .eq('stripe_session_id', session.id)
      .single();

    if (existing) {
      return NextResponse.json({ received: true });
    }

    // Generate and store API key
    const { key, hash, prefix } = generateApiKey();

    const { error: insertError } = await db.from('api_keys').insert({
      key_hash: hash,
      key_prefix: prefix,
      email,
      tier,
      credits: tierConfig.credits,
      payment_method: 'stripe',
      stripe_session_id: session.id,
      stripe_payment_intent: typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id,
      pending_key_display: key,
      is_active: true,
    });

    if (insertError) {
      console.error('Failed to create API key from webhook:', insertError);
      return NextResponse.json({ error: 'DB error' }, { status: 500 });
    }

    logAudit({
      event_type: 'stripe_key_activated',
      actor: email,
      details: { tier, session_id: session.id, key_prefix: prefix },
    });
  }

  return NextResponse.json({ received: true });
}
