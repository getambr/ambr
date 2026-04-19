/**
 * Hybrid rate limiter: in-memory for speed + Supabase for persistence across instances.
 * Falls back to in-memory only if Supabase is unavailable.
 */

import { getSupabaseAdmin } from './supabase-admin';

const hitMap = new Map<string, { count: number; resetAt: number }>();

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const entry = hitMap.get(key);

  if (!entry || now > entry.resetAt) {
    hitMap.set(key, { count: 1, resetAt: now + windowMs });
    rateLimitPersist(key, maxRequests, windowMs).catch(() => {});
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  entry.count++;
  rateLimitPersist(key, maxRequests, windowMs).catch(() => {});

  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}

/**
 * Persistent rate limit check via Supabase.
 * Updates the in-memory map with the authoritative count so that
 * distributed instances converge on the real number.
 */
async function rateLimitPersist(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<void> {
  try {
    const db = getSupabaseAdmin();
    const windowStart = new Date(Date.now() - windowMs).toISOString();

    const { count } = await db
      .from('rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('key', key)
      .gte('created_at', windowStart);

    const realCount = count ?? 0;

    await db.from('rate_limits').insert({ key, created_at: new Date().toISOString() });

    // Sync in-memory with persistent count
    const entry = hitMap.get(key);
    if (entry && realCount > entry.count) {
      entry.count = realCount;
    }

    // Cleanup old entries (fire-and-forget)
    db.from('rate_limits')
      .delete()
      .lt('created_at', new Date(Date.now() - windowMs * 2).toISOString())
      .then(() => {});
  } catch {
    // Supabase unavailable — in-memory rate limit still active
  }
}

/**
 * Get client IP from request headers (works on Vercel).
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}
