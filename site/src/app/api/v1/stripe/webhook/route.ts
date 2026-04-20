import { NextResponse } from 'next/server';
import { getStripe, TIER_PRICES, SUBSCRIPTION_PLANS } from '@/lib/stripe';
import { generateApiKey } from '@/lib/api-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { logAudit } from '@/lib/audit';
import type Stripe from 'stripe';

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

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const db = getSupabaseAdmin();

  // ─── Subscription events ───

  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
    const subscription = event.data.object as Stripe.Subscription;
    const plan = subscription.metadata?.plan;
    const email = subscription.metadata?.email;

    if (!plan || !email) {
      console.error('Subscription webhook missing metadata:', subscription.id);
      return NextResponse.json({ received: true });
    }

    const planConfig = SUBSCRIPTION_PLANS[plan];
    if (!planConfig) {
      console.error('Unknown plan in subscription webhook:', plan);
      return NextResponse.json({ received: true });
    }

    const customerId = typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

    const firstItem = subscription.items.data[0];

    const upsertData = {
      email,
      plan,
      status: mapStripeStatus(subscription.status),
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      stripe_price_id: firstItem?.price?.id || null,
      contracts_limit: planConfig.contracts_limit,
      ai_messages_limit: planConfig.ai_messages_limit,
      current_period_start: firstItem?.current_period_start
        ? new Date(firstItem.current_period_start * 1000).toISOString()
        : null,
      current_period_end: firstItem?.current_period_end
        ? new Date(firstItem.current_period_end * 1000).toISOString()
        : null,
      cancel_at_period_end: subscription.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await db
      .from('subscriptions')
      .select('id')
      .eq('stripe_subscription_id', subscription.id)
      .single();

    if (existing) {
      await db
        .from('subscriptions')
        .update(upsertData)
        .eq('stripe_subscription_id', subscription.id);
    } else {
      await db.from('subscriptions').insert({
        ...upsertData,
        contracts_used: 0,
        ai_messages_used: 0,
      });
    }

    logAudit({
      event_type: event.type === 'customer.subscription.created'
        ? 'stripe_subscription_created'
        : 'stripe_subscription_updated',
      actor: email,
      details: { plan, subscription_id: subscription.id, status: subscription.status },
    });

    return NextResponse.json({ received: true });
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription;

    await db
      .from('subscriptions')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('stripe_subscription_id', subscription.id);

    logAudit({
      event_type: 'stripe_subscription_cancelled',
      actor: subscription.metadata?.email || 'unknown',
      details: { subscription_id: subscription.id },
    });

    return NextResponse.json({ received: true });
  }

  if (event.type === 'invoice.paid') {
    const invoice = event.data.object as Stripe.Invoice;
    const subDetails = invoice.parent?.subscription_details;
    const subId = subDetails
      ? (typeof subDetails.subscription === 'string' ? subDetails.subscription : subDetails.subscription?.id)
      : null;

    if (subId) {
      await db
        .from('subscriptions')
        .update({
          status: 'active',
          contracts_used: 0,
          ai_messages_used: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_subscription_id', subId);
    }

    return NextResponse.json({ received: true });
  }

  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice;
    const subDetails = invoice.parent?.subscription_details;
    const subId = subDetails
      ? (typeof subDetails.subscription === 'string' ? subDetails.subscription : subDetails.subscription?.id)
      : null;

    if (subId) {
      await db
        .from('subscriptions')
        .update({ status: 'past_due', updated_at: new Date().toISOString() })
        .eq('stripe_subscription_id', subId);
    }

    return NextResponse.json({ received: true });
  }

  // ─── One-time payment events (existing) ───

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    // Skip subscription checkouts — handled by subscription events above
    if (session.metadata?.checkout_mode === 'subscription') {
      return NextResponse.json({ received: true });
    }

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
      } else {
        const newCredits = activeKey.credits === -1
          ? -1
          : activeKey.credits + tierConfig.credits;

        const { error: updateError } = await db
          .from('api_keys')
          .update({ credits: newCredits })
          .eq('id', activeKey.id);

        if (updateError) {
          console.error('Failed to topup credits:', updateError);
          return NextResponse.json({ error: 'DB error' }, { status: 500 });
        }

        await db.from('api_keys').insert({
          key_hash: `topup_${session.id}`,
          key_prefix: activeKey.key_prefix,
          email,
          tier,
          credits: tierConfig.credits,
          payment_method: 'stripe',
          stripe_session_id: session.id,
          stripe_payment_intent: paymentIntent,
          is_active: false,
        });

        logAudit({
          event_type: 'stripe_credits_topup',
          actor: email,
          details: { tier, session_id: session.id, key_prefix: activeKey.key_prefix, credits_added: tierConfig.credits, new_total: newCredits },
        });

        return NextResponse.json({ received: true });
      }
    }

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

function mapStripeStatus(status: string): 'active' | 'past_due' | 'cancelled' | 'trialing' {
  switch (status) {
    case 'active': return 'active';
    case 'past_due': return 'past_due';
    case 'canceled': return 'cancelled';
    case 'trialing': return 'trialing';
    case 'unpaid': return 'past_due';
    default: return 'cancelled';
  }
}
