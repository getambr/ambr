import { NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { getStripe, TIER_PRICES, SUBSCRIPTION_PLANS } from '@/lib/stripe';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { corsOptions } from '@/lib/cors';

const schema = z.discriminatedUnion('checkout_mode', [
  z.object({
    checkout_mode: z.literal('payment'),
    email: z.email('Valid email required'),
    tier: z.enum(['startup', 'scale', 'enterprise']),
    mode: z.enum(['new', 'topup']).optional(),
  }),
  z.object({
    checkout_mode: z.literal('subscription'),
    email: z.email('Valid email required'),
    plan: z.enum(['personal', 'business']),
  }),
]);

const legacySchema = z.object({
  email: z.email('Valid email required'),
  tier: z.enum(['startup', 'scale', 'enterprise']),
  mode: z.enum(['new', 'topup']).optional(),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = rateLimit(`stripe-checkout:${ip}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retry_after_ms: rl.resetAt - Date.now() },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const stripe = getStripe();
  const appUrl = 'https://getamber.dev';

  // Subscription checkout
  if (body.checkout_mode === 'subscription') {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'validation_error', details: parsed.error.issues },
        { status: 400 },
      );
    }
    const data = parsed.data as { checkout_mode: 'subscription'; email: string; plan: string };
    const planConfig = SUBSCRIPTION_PLANS[data.plan];

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer_email: data.email,
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Ambr ${planConfig.label} Plan`,
                description: `${planConfig.contracts_limit} contracts/mo, unlimited AI chat`,
              },
              unit_amount: planConfig.cents_monthly,
              recurring: { interval: 'month' },
            },
            quantity: 1,
          },
        ],
        subscription_data: {
          metadata: { plan: data.plan, email: data.email },
        },
        metadata: { plan: data.plan, email: data.email, checkout_mode: 'subscription' },
        success_url: `${appUrl}/activate?session_id={CHECKOUT_SESSION_ID}&status=success&type=subscription`,
        cancel_url: `${appUrl}/activate?status=cancelled`,
      });

      logAudit({
        event_type: 'stripe_subscription_checkout_created',
        actor: data.email,
        details: { plan: data.plan, session_id: session.id },
        ip_address: ip,
      });

      return NextResponse.json({ url: session.url });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('Stripe subscription checkout error:', errMsg);
      return NextResponse.json(
        { error: 'stripe_error', message: errMsg },
        { status: 500 },
      );
    }
  }

  // One-time payment checkout (existing flow, backwards compatible)
  const parsed = legacySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { email, tier, mode } = parsed.data;
  const isTopup = mode === 'topup';
  const tierConfig = TIER_PRICES[tier];

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      payment_intent_data: {
        statement_descriptor: 'AMBR.RUN',
        statement_descriptor_suffix: tierConfig.label.toUpperCase(),
      },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Ambr API Key — ${tierConfig.label}`,
              description: tierConfig.credits === -1
                ? 'Unlimited contract credits'
                : `${tierConfig.credits} contract credits`,
            },
            unit_amount: tierConfig.cents,
          },
          quantity: 1,
        },
      ],
      metadata: { tier, email, mode: isTopup ? 'topup' : 'new' },
      success_url: isTopup
        ? `${appUrl}/dashboard?topup=success`
        : `${appUrl}/activate?session_id={CHECKOUT_SESSION_ID}&status=success`,
      cancel_url: isTopup
        ? `${appUrl}/dashboard?topup=cancelled`
        : `${appUrl}/activate?status=cancelled`,
    });

    logAudit({
      event_type: 'stripe_checkout_created',
      actor: email,
      details: { tier, session_id: session.id },
      ip_address: ip,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('Stripe checkout error:', errMsg);
    return NextResponse.json(
      { error: 'stripe_error', message: errMsg },
      { status: 500 },
    );
  }
}

export { corsOptions as OPTIONS };
