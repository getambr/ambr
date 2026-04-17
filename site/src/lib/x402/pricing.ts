import { getSupabaseAdmin } from '@/lib/supabase-admin';

/** Cached template prices (slug → price in USDC 6 decimals) */
let priceCache: Map<string, bigint> | null = null;
let cacheExpiry = 0;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get the USDC price for a template slug.
 * Returns price in USDC with 6 decimals (e.g., 3_000000n for $3.00).
 * Falls back to hardcoded defaults if DB query fails.
 */
export async function getTemplatePrice(templateSlug: string): Promise<bigint> {
  if (!priceCache || Date.now() > cacheExpiry) {
    await refreshPriceCache();
  }

  const price = priceCache?.get(templateSlug);
  if (price !== undefined) return price;

  // Fallback defaults by category (USDC 6 decimals)
  // d-series (delegation): $0.50, c-series (commerce): $1.00, d3 fleet: $2.50
  const defaults: Record<string, bigint> = {
    'd1-general-auth': 500000n,       // $0.50
    'd2-limited-service': 500000n,    // $0.50
    'd3-fleet-auth': 2_500000n,       // $2.50
    'c1-api-access': 1_000000n,       // $1.00
    'c2-compute-sla': 1_000000n,      // $1.00
    'c3-task-execution': 1_000000n,   // $1.00
    'a1-service-purchase': 300000n,   // $0.30
    'a2-ai-subscription': 300000n,    // $0.30
    'a3-warranty-liability': 300000n, // $0.30
  };

  return defaults[templateSlug] ?? 1_000000n; // default $1 if unknown
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
 */
export async function getAllPrices(): Promise<Record<string, string>> {
  if (!priceCache || Date.now() > cacheExpiry) {
    await refreshPriceCache();
  }

  const result: Record<string, string> = {};
  if (priceCache) {
    for (const [slug, price] of priceCache) {
      result[slug] = `$${(Number(price) / 1_000_000).toFixed(2)}`;
    }
  }
  return result;
}
