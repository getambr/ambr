/**
 * GET /api/v1/pricing
 *
 * Single source of truth for pricing across all surfaces (homepage,
 * /activate, dashboard, MCP discovery). Per-contract prices come from the
 * `templates` table, everything else from `@/lib/pricing`. Credits are cents:
 * 1 credit = 1 US cent, and a contract burns its template's price_cents.
 *
 * Grouped by category so the marketing page can render clean tiers
 * without having to know every slug.
 *
 * Public endpoint, no auth required, edge-cached 1h.
 */

import { NextResponse } from 'next/server';
import { getPricing } from '@/lib/pricing';

export async function GET() {
  let pricing;
  try {
    pricing = await getPricing();
  } catch (err) {
    return NextResponse.json(
      { error: 'failed_to_load_pricing', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  return NextResponse.json(pricing, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
