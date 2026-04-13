import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { validateApiKey } from '@/lib/api-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { corsOptions } from '@/lib/cors';

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const rl = rateLimit(`stripe-payments:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retry_after_ms: rl.resetAt - Date.now() },
      { status: 429 },
    );
  }

  const auth = await validateApiKey(request);
  if (!auth) {
    return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });
  }

  try {
    // Query our own DB for Stripe payments by this email
    const db = getSupabaseAdmin();
    const { data: rows } = await db
      .from('api_keys')
      .select('stripe_session_id, stripe_payment_intent, tier, credits, created_at, key_prefix')
      .eq('email', auth.email)
      .eq('payment_method', 'stripe')
      .order('created_at', { ascending: false })
      .limit(20);

    if (!rows || rows.length === 0) {
      return NextResponse.json({ payments: [] });
    }

    // Fetch receipt URLs from Stripe for payment intents that exist
    const stripe = getStripe();
    const payments = await Promise.all(
      rows.map(async (row) => {
        let receipt_url: string | null = null;
        let amount_cents: number | null = null;

        if (row.stripe_payment_intent) {
          try {
            const pi = await stripe.paymentIntents.retrieve(row.stripe_payment_intent, {
              expand: ['latest_charge'],
            });
            const charge = pi.latest_charge;
            if (charge && typeof charge !== 'string') {
              receipt_url = charge.receipt_url ?? null;
              amount_cents = charge.amount ?? null;
            }
          } catch {
            // Stripe lookup failed — still return the row without receipt
          }
        }

        return {
          id: row.stripe_session_id,
          tier: row.tier,
          credits: row.credits,
          amount_cents,
          currency: 'usd',
          created_at: row.created_at,
          receipt_url,
          key_prefix: row.key_prefix,
        };
      }),
    );

    return NextResponse.json({ payments });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('Stripe payments list error:', errMsg);
    return NextResponse.json(
      { error: 'stripe_error', message: errMsg },
      { status: 500 },
    );
  }
}

export { corsOptions as OPTIONS };
