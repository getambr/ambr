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

export const SUBSCRIPTION_PLANS: Record<string, {
  cents_monthly: number;
  label: string;
  contracts_limit: number;
  ai_messages_limit: number;
  overage_cents: number;
}> = {
  personal: {
    cents_monthly: 900,
    label: 'Personal',
    contracts_limit: 25,
    ai_messages_limit: -1,
    overage_cents: 20,
  },
  business: {
    cents_monthly: 2900,
    label: 'Business',
    contracts_limit: 100,
    ai_messages_limit: -1,
    overage_cents: 15,
  },
};
