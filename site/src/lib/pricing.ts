/**
 * Single source of truth for Ambr pricing.
 *
 * 1 credit = 1 US cent. A contract burns its template's `price_cents`
 * (the templates table is the only place per-contract prices live).
 * Everything else: free tier, packs, Team, Enterprise, Founder, is defined
 * here and read by the pricing API, Stripe config, key grants and the UI.
 * Do not repeat these numbers elsewhere.
 */

export const TAGLINE = 'The liability record for autonomous agents';

export const CREDIT_UNIT = 'cent' as const;

/** Granted once per verified-email key. Not a plan; never renews. */
export const FREE_TIER_CREDITS = 500;

export interface CreditPack {
  slug: 'startup' | 'scale';
  label: string;
  price_cents: number;
  credits: number;
}

export const PACKS: readonly CreditPack[] = [
  { slug: 'startup', label: 'Starter Pack', price_cents: 4900, credits: 4900 },
  { slug: 'scale', label: 'Scale Pack', price_cents: 19900, credits: 21900 },
];

/**
 * Team (formerly Business). The slug stays `business` because it is the
 * Stripe subscription metadata key and the `subscriptions.plan` value.
 */
export const TEAM = {
  slug: 'business',
  label: 'Team',
  price_cents_monthly: 2900,
  credits_per_month: 3000,
  ai_messages_limit: -1,
} as const;

export const ENTERPRISE = {
  label: 'Enterprise',
  price_cents_yearly: 480000,
  credits: 24000,
  includes: ['Private verifier', 'DPA', 'Audit export'],
  contact: true,
} as const;

export const FOUNDER = {
  label: 'Founding Partner',
  spots_total: 10,
  credits: 24000,
  discount_percent: 50,
  discount_months: 24,
  benefits: [
    '24,000 credits once',
    '50% off self-serve list prices for 24 months',
    'Public listing',
  ],
} as const;

/** "$29", "$0.50", "$4,800": whole dollars drop the cents. */
export function formatUsd(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString('en-US', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

interface TemplateRow {
  slug: string;
  name: string;
  category: string;
  price_cents: number;
  is_active: boolean;
}

/**
 * Builds the object GET /api/v1/pricing returns. Per-contract tiers come from
 * the `templates` table; the rest from the constants above. Throws on a
 * database error (the route turns that into a 500).
 */
export async function getPricing() {
  // Dynamic import keeps the Supabase client out of bundles of components that
  // only need the constants.
  const { getSupabase } = await import('@/lib/supabase');
  const db = getSupabase();
  const { data, error } = await db
    .from('templates')
    .select('slug, name, category, price_cents, is_active')
    .eq('is_active', true)
    .order('category')
    .order('price_cents');

  if (error) throw new Error(error.message);

  const templates = (data ?? []) as TemplateRow[];

  // Group by display tier
  const grouped: Record<
    string,
    { tier: string; label: string; price_cents: number; price_display: string; templates: { slug: string; name: string }[] }
  > = {};

  for (const t of templates) {
    // Display tier: by category + price band
    let tier: string;
    let label: string;

    // Display labels follow the on-pitch authority taxonomy (2026-07-16):
    // Personal / Delegation / Agent-to-Agent / Fleet. Tier KEYS are unchanged
    // (consumer/delegation/commerce/fleet) so existing consumers that key by
    // `tier` keep working. NOTE: "A2A" now means agent-to-agent (c3) only,
    // the old "Delegation (A2A)" label was a naming collision.
    if (t.category === 'consumer' || t.slug === 'p2-power-of-attorney') {
      // p2 is a $0.20 one-sided gateway template; band it with the $0.20 tier so it does
      // not drag the Delegation tier's displayed price down to its floor (D1/D2 are $0.50).
      tier = 'consumer';
      label = 'Personal';
    } else if (t.category === 'delegation' && t.price_cents <= 50) {
      tier = 'delegation';
      label = 'Delegation';
    } else if (t.category === 'delegation') {
      tier = 'fleet';
      label = 'Fleet Multi-Agent';
    } else if (t.category === 'commerce') {
      tier = 'commerce';
      label = 'Agent-to-Agent';
    } else {
      tier = t.category;
      label = t.category;
    }

    if (!grouped[tier]) {
      grouped[tier] = {
        tier,
        label,
        price_cents: t.price_cents,
        price_display: `$${(t.price_cents / 100).toFixed(2)}`,
        templates: [],
      };
    }
    grouped[tier].templates.push({ slug: t.slug, name: t.name });
  }

  // Ordered display tiers for marketing
  const displayOrder = ['consumer', 'delegation', 'commerce', 'fleet'];
  const tiers = displayOrder.map((key) => grouped[key]).filter(Boolean);

  return {
    currency: 'USD',
    unit: 'per contract',
    credit_unit: CREDIT_UNIT,
    tagline: TAGLINE,
    tiers,
    packs: PACKS.map((p) => ({ ...p })),
    subscriptions: [
      {
        slug: TEAM.slug,
        label: TEAM.label,
        price_cents_monthly: TEAM.price_cents_monthly,
        price_display_monthly: `${formatUsd(TEAM.price_cents_monthly)}/mo`,
        credits_per_month: TEAM.credits_per_month,
        ai_messages_limit: TEAM.ai_messages_limit,
        note: 'Credits are granted per paid invoice. Overage: buy a pack.',
        purchase_at: '/activate',
      },
    ],
    enterprise: {
      label: ENTERPRISE.label,
      price_cents_yearly: ENTERPRISE.price_cents_yearly,
      price_display_yearly: `${formatUsd(ENTERPRISE.price_cents_yearly)}/year`,
      credits: ENTERPRISE.credits,
      includes: [...ENTERPRISE.includes],
      purchase_at: 'contact',
    },
    free_tier: {
      label: 'Developer',
      credits_per_key: FREE_TIER_CREDITS,
      credit_unit: CREDIT_UNIT,
      renews: false,
      requires: ['verified_email'],
      note: `${FREE_TIER_CREDITS} credits once per verified-email key, no renewal.`,
    },
    founder_program: {
      label: FOUNDER.label,
      spots_total: FOUNDER.spots_total,
      credits: FOUNDER.credits,
      discount_percent: FOUNDER.discount_percent,
      discount_months: FOUNDER.discount_months,
      benefits: [...FOUNDER.benefits],
    },
  };
}
