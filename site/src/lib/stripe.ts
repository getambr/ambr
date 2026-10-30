import Stripe from 'stripe';
import { PACKS, TEAM, ENTERPRISE } from './pricing';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('Missing STRIPE_SECRET_KEY');
    _stripe = new Stripe(key);
  }
  return _stripe;
}

// Prices and credit amounts live in ./pricing (1 credit = 1 US cent).
export const TIER_PRICES: Record<string, { cents: number; credits: number; label: string }> = {
  ...Object.fromEntries(
    PACKS.map((p) => [p.slug, { cents: p.price_cents, credits: p.credits, label: p.label }]),
  ),
  enterprise: { cents: 0, credits: ENTERPRISE.credits, label: ENTERPRISE.label }, // contact-only, never billed via checkout (see checkout route guard)
};

// Keyed by the Stripe subscription metadata `plan` value. `business` is the
// Team plan; the key is kept so existing subscriptions keep resolving.
export const SUBSCRIPTION_PLANS: Record<string, {
  cents_monthly: number;
  label: string;
  credits_per_month: number;
  ai_messages_limit: number;
}> = {
  [TEAM.slug]: {
    cents_monthly: TEAM.price_cents_monthly,
    label: TEAM.label,
    credits_per_month: TEAM.credits_per_month,
    ai_messages_limit: TEAM.ai_messages_limit,
  },
};
