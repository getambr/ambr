import { getSupabaseAdmin } from '@/lib/supabase-admin';

/** Cached template prices (slug → price in USDC 6 decimals) */
let priceCache: Map<string, bigint> | null = null;
let cacheExpiry = 0;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Fallback defaults by category (USDC 6 decimals) — value-identical to the DB
// seed. Module-scoped so both getTemplatePrice and getAllPrices can guarantee
// a complete catalog even when the DB cache is empty or a slug is missing.
// d-series (delegation): $0.50, c-series (commerce): $1.00, d3 fleet: $2.50
const DEFAULT_PRICES: Record<string, bigint> = {
  'd1-general-auth': 500000n,       // $0.50
  'd2-limited-service': 500000n,    // $0.50
  'd3-fleet-auth': 2_500000n,       // $2.50
  'c1-api-access': 1_000000n,       // $1.00
  'c2-compute-sla': 1_000000n,      // $1.00
  'c3-task-execution': 1_000000n,   // $1.00
  'a1-service-purchase': 200000n,   // $0.20
  'a2-ai-subscription': 200000n,    // $0.20
  'a3-warranty-liability': 200000n, // $0.20
  'p1-nda': 500000n,                 // $0.50
  'p2-power-of-attorney': 200000n,   // $0.20 — A-tier floor; one-sided POA gateway template (priced to encourage adoption)
};

/**
 * Get the USDC price for a template slug.
 * Returns price in USDC with 6 decimals (e.g., 3_000000n for $3.00), or null
 * for a slug that is neither in the active catalog nor in the hardcoded
 * defaults. There is deliberately no default price: an unknown slug must be
 * rejected before a payment challenge is built, never charged at a guess.
 * Falls back to hardcoded defaults if the DB query fails.
 */
export async function getTemplatePrice(templateSlug: string): Promise<bigint | null> {
  if (!priceCache || Date.now() > cacheExpiry) {
    await refreshPriceCache();
  }

  const price = priceCache?.get(templateSlug);
  if (price !== undefined) return price;

  return DEFAULT_PRICES[templateSlug] ?? null;
}

async function refreshPriceCache(): Promise<void> {
  try {
    const db = getSupabaseAdmin();
    const { data } = await db
      .from('templates')
      .select('slug, price_cents')
      .eq('is_active', true);

    priceCache = new Map();
    if (data) {
      for (const t of data) {
        // price_cents is in cents (e.g., 300 = $3.00)
        // Convert to USDC 6 decimals: cents * 10000
        priceCache.set(t.slug, BigInt(t.price_cents) * 10000n);
      }
    }
    cacheExpiry = Date.now() + CACHE_TTL_MS;
  } catch {
    // Keep existing cache on failure
    if (!priceCache) priceCache = new Map();
  }
}

/**
 * Get all template prices for the 402 response.
 * Seeded from DEFAULT_PRICES then overlaid with the live DB cache, so the map
 * is guaranteed complete (incl. p2) even when the cache is cold — the A2A
 * message/send payment branch previously duplicated this map by hand and
 * drifted 3-5x off canonical (fixed 2026-07-18).
 */
export async function getAllPrices(): Promise<Record<string, string>> {
  if (!priceCache || Date.now() > cacheExpiry) {
    await refreshPriceCache();
  }

  const fmt = (price: bigint) => `$${(Number(price) / 1_000_000).toFixed(2)}`;
  const result: Record<string, string> = {};
  for (const [slug, price] of Object.entries(DEFAULT_PRICES)) {
    result[slug] = fmt(price);
  }
  if (priceCache) {
    for (const [slug, price] of priceCache) {
      result[slug] = fmt(price);
    }
  }
  return result;
}
