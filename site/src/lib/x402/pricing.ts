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

  // Fallback defaults (cents → USDC 6 decimals: multiply by 10000)
  const defaults: Record<string, bigint> = {
    'd1-general-auth': 2_000000n,
    'd2-limited-service': 1_500000n,
    'd3-fleet-auth': 5_000000n,
    'c1-api-access': 3_000000n,
    'c2-compute-sla': 4_000000n,
    'c3-task-execution': 3_500000n,
  };

  return defaults[templateSlug] ?? 3_000000n; // default $3 if unknown
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
