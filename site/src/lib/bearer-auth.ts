import { createHash, timingSafeEqual } from 'crypto';

/**
 * Checks an `Authorization: Bearer <secret>` header against a shared secret.
 *
 * Fails closed: with the secret unset or empty nothing is authorised, since the
 * alternative is a route anyone on the internet can call. The comparison runs
 * over fixed-length digests so it takes the same time wherever the values differ
 * and timingSafeEqual cannot throw on a length mismatch.
 */
export function isBearerAuthorized(request: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const header = request.headers.get('authorization');
  if (!header) return false;
  const digest = (v: string) => createHash('sha256').update(v).digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
