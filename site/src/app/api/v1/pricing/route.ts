/**
 * GET /api/v1/pricing
 *
 * Single source of truth for pricing across all surfaces (homepage,
 * /activate, dashboard, MCP discovery). Values come from the `templates`
 * table via getAllPrices() which is cached 5min internally.
 *
 * Grouped by category so the marketing page can render clean tiers
 * without having to know every slug.
 *
 * Public endpoint, no auth required, edge-cached 1h.
 */

import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

interface TemplateRow {
  slug: string;
  name: string;
  category: string;
  price_cents: number;
  is_active: boolean;
}

export async function GET() {
  const db = getSupabase();
  const { data, error } = await db
    .from('templates')
    .select('slug, name, category, price_cents, is_active')
    .eq('is_active', true)
    .order('category')
    .order('price_cents');

  if (error) {
    return NextResponse.json(
      { error: 'failed_to_load_pricing', detail: error.message },
      { status: 500 },
    );
  }

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

    if (t.category === 'consumer') {
      tier = 'consumer';
      label = 'Consumer (A2C)';
    } else if (t.category === 'delegation' && t.price_cents <= 50) {
      tier = 'delegation';
      label = 'Delegation (A2A)';
    } else if (t.category === 'delegation') {
      tier = 'fleet';
      label = 'Fleet Multi-Agent';
    } else if (t.category === 'commerce') {
      tier = 'commerce';
      label = 'Commerce (B2A)';
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
  const tiers = displayOrder
    .map((key) => grouped[key])
    .filter(Boolean);

  return NextResponse.json(
    {
      currency: 'USD',
      unit: 'per contract',
      tiers,
      packs: [
        { slug: 'starter', price_cents: 4900, credits: 200, label: 'Starter Pack' },
        { slug: 'scale', price_cents: 19900, credits: 1000, label: 'Scale Pack' },
      ],
      free_tier: {
        label: 'Developer',
        credits_per_key: 25,
        requires: ['verified_email'],
        note: 'Free forever for developers — create and test contracts.',
      },
      founder_program: {
        label: 'Founding Partner',
        spots_total: 10,
        benefits: ['1000 contracts free', '50% off per-contract forever', 'Public listing'],
      },
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}
