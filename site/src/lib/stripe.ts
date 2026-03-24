import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('Missing STRIPE_SECRET_KEY');
    _stripe = new Stripe(key);
  }
  return _stripe;
}

export const TIER_PRICES: Record<string, { cents: number; credits: number; label: string }> = {
  starter: { cents: 2900, credits: 50, label: 'Starter' },
  builder: { cents: 9900, credits: 250, label: 'Builder' },
  enterprise: { cents: 29900, credits: -1, label: 'Enterprise' },
};
