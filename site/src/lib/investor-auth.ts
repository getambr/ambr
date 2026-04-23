/**
 * Investor page auth — HMAC-signed cookie with 7-day TTL.
 *
 * Flow:
 *   1. User submits password → /api/v1/investors/verify hashes + compares
 *      against INVESTOR_ACCESS_PASSWORD_HASH (constant-time)
 *   2. On match, we issue a cookie: `{issuedAt}.{sig}` where sig =
 *      HMAC-SHA256(INVESTOR_COOKIE_SECRET, issuedAt)
 *   3. On every authed request, we re-verify HMAC and check age < 7 days
 *   4. Rotating INVESTOR_COOKIE_SECRET invalidates ALL outstanding cookies
 *
 * The cookie does NOT contain a user identity — it's just proof that
 * someone holding the password issued it within the last 7 days. That's
 * sufficient for v1 (single shared password).
 */

import { createHash, createHmac, timingSafeEqual } from 'crypto';

export const INVESTOR_COOKIE_NAME = 'ambr_investor_auth';
export const INVESTOR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

/**
 * SHA-256 hash of a password (hex string), for comparison against env hash.
 */
export function hashPassword(password: string): string {
  return createHash('sha256').update(password, 'utf8').digest('hex');
}

/**
 * Timing-safe compare of two hex strings.
 * Returns false if lengths differ (no throw).
 */
export function safeCompareHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Sign a cookie payload with HMAC-SHA256.
 * Returns `${issuedAt}.${sig}`.
 */
export function signCookie(issuedAt: number, secret: string): string {
  const sig = createHmac('sha256', secret)
    .update(String(issuedAt), 'utf8')
    .digest('hex');
  return `${issuedAt}.${sig}`;
}

/**
 * Verify a cookie string. Returns the issuedAt timestamp if valid, null otherwise.
 * Checks:
 *   - Format `${issuedAt}.${sig}`
 *   - HMAC matches
 *   - Not older than 7 days
 *   - issuedAt not in the future (clock skew tolerance: 60s)
 */
export function verifyCookie(
  cookieValue: string | undefined,
  secret: string,
  now: number = Date.now(),
): number | null {
  if (!cookieValue || typeof cookieValue !== 'string') return null;

  const parts = cookieValue.split('.');
  if (parts.length !== 2) return null;

  const [issuedAtStr, providedSig] = parts;
  const issuedAt = Number(issuedAtStr);
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) return null;

  // Age check: not older than 7d, not more than 60s in the future
  const ageMs = now - issuedAt;
  if (ageMs < -60_000) return null;
  if (ageMs > INVESTOR_COOKIE_MAX_AGE_SECONDS * 1000) return null;

  // HMAC check
  const expectedSig = createHmac('sha256', secret)
    .update(String(issuedAt), 'utf8')
    .digest('hex');

  if (!safeCompareHex(providedSig, expectedSig)) return null;

  return issuedAt;
}

/**
 * Extract the investor auth cookie from a Request's Cookie header.
 * Returns the raw cookie VALUE (not verified yet).
 */
export function extractInvestorCookie(request: Request): string | undefined {
  const header = request.headers.get('cookie');
  if (!header) return undefined;

  for (const part of header.split(';')) {
    const [name, ...valueParts] = part.trim().split('=');
    if (name === INVESTOR_COOKIE_NAME) {
      return valueParts.join('=');
    }
  }
  return undefined;
}

/**
 * Full gate: extract + verify cookie in one call. Returns true if authenticated.
 */
export function isInvestorAuthenticated(request: Request): boolean {
  const secret = process.env.INVESTOR_COOKIE_SECRET;
  if (!secret) return false;

  const cookieValue = extractInvestorCookie(request);
  if (!cookieValue) return false;

  return verifyCookie(cookieValue, secret) !== null;
}

/**
 * Build a Set-Cookie header value for the auth cookie.
 */
export function buildAuthSetCookie(cookieValue: string, clear: boolean = false): string {
  const maxAge = clear ? 0 : INVESTOR_COOKIE_MAX_AGE_SECONDS;
  const value = clear ? '' : cookieValue;
  return [
    `${INVESTOR_COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ].join('; ');
}
