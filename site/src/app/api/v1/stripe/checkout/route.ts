import { NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { getStripe, TIER_PRICES } from '@/lib/stripe';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { corsOptions } from '@/lib/cors';

const schema = z.object({
  email: z.email('Valid email required'),
  tier: z.enum(['starter', 'builder', 'enterprise']),
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

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { email, tier } = parsed.data;
  const tierConfig = TIER_PRICES[tier];

  try {
    const stripe = getStripe();
    const appUrl = 'https://getamber.dev';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
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
      metadata: { tier, email },
      success_url: `${appUrl}/activate?session_id={CHECKOUT_SESSION_ID}&status=success`,
      cancel_url: `${appUrl}/activate?status=cancelled`,
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
