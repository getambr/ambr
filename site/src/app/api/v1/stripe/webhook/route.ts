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

    // Check idempotency — don't process the same session twice
    const db = getSupabaseAdmin();
    const { data: existing } = await db
      .from('api_keys')
      .select('id')
      .eq('stripe_session_id', session.id)
      .single();

    if (existing) {
      return NextResponse.json({ received: true });
    }

    const isTopup = session.metadata?.mode === 'topup';
    const paymentIntent = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;

    if (isTopup) {
      // Top-up: add credits to the most recent active key for this email
      const { data: activeKey } = await db
        .from('api_keys')
        .select('id, credits, key_prefix')
        .eq('email', email)
        .eq('is_active', true)
        .order('last_used_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .single();

      if (!activeKey) {
        console.error('Topup but no active key found for:', email);
        // Fall through to create a new key instead
      } else {
        const newCredits = activeKey.credits === -1
          ? -1  // already unlimited
          : activeKey.credits + tierConfig.credits;

        const { error: updateError } = await db
          .from('api_keys')
          .update({ credits: newCredits })
          .eq('id', activeKey.id);

        if (updateError) {
          console.error('Failed to topup credits:', updateError);
          return NextResponse.json({ error: 'DB error' }, { status: 500 });
        }

        // Record the topup as a separate row for payment history (no key_hash = not a login key)
        await db.from('api_keys').insert({
          key_hash: `topup_${session.id}`,
          key_prefix: activeKey.key_prefix,
          email,
          tier,
          credits: tierConfig.credits,
          payment_method: 'stripe',
          stripe_session_id: session.id,
          stripe_payment_intent: paymentIntent,
          is_active: false, // not a usable key — just a payment record
        });

        logAudit({
          event_type: 'stripe_credits_topup',
          actor: email,
          details: { tier, session_id: session.id, key_prefix: activeKey.key_prefix, credits_added: tierConfig.credits, new_total: newCredits },
        });

        return NextResponse.json({ received: true });
      }
    }

    // New key: generate and store
    const { key, hash, prefix } = generateApiKey();

    const { error: insertError } = await db.from('api_keys').insert({
      key_hash: hash,
      key_prefix: prefix,
      email,
      tier,
      credits: tierConfig.credits,
      payment_method: 'stripe',
      stripe_session_id: session.id,
      stripe_payment_intent: paymentIntent,
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
