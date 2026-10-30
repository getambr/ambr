/**
 * Single-use email-verification tokens for claiming or rotating a free
 * developer key.
 *
 * The raw token exists in exactly two places: the URL in the email, and the
 * request that redeems it. Only its SHA-256 is persisted, mirroring how
 * api_keys stores key_hash — a database read cannot mint a working link.
 *
 * The TTL is what makes an intercepted or forwarded email stop being a
 * credential; single-use is what stops the same link being replayed.
 */

import { createHash, randomBytes } from 'crypto';

/** Long enough to absorb slow mail delivery, short enough to limit exposure. */
export const CLAIM_TOKEN_TTL_MINUTES = 30;

/** Per-address request cap, on top of the per-IP limit in the route. */
export const CLAIM_REQUESTS_PER_EMAIL = 3;
export const CLAIM_EMAIL_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const PLATFORM_URL = process.env.NEXT_PUBLIC_PLATFORM_URL || 'https://getamber.dev';

export interface ClaimToken {
  token: string;
  tokenHash: string;
  expiresAt: string;
}

/**
 * 32 bytes of CSPRNG entropy, base64url — same construction as generateApiKey.
 */
export function generateClaimToken(now: number = Date.now()): ClaimToken {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashClaimToken(token),
    expiresAt: new Date(now + CLAIM_TOKEN_TTL_MINUTES * 60_000).toISOString(),
  };
}

export function hashClaimToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Emails are compared and stored lowercase. Without this, 'User@x.com' and
 * 'user@x.com' were two separate free keys, and the duplicate check missed it.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function buildClaimUrl(token: string): string {
  return `${PLATFORM_URL}/activate/reveal?token=${encodeURIComponent(token)}`;
}
