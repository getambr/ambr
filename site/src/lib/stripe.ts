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
  startup: { cents: 4900, credits: 200, label: 'Startup' },
  scale: { cents: 19900, credits: 1000, label: 'Scale' },
  enterprise: { cents: 0, credits: -1, label: 'Enterprise' }, // custom pricing
};
