/**
 * Credit arithmetic. 1 credit = 1 US cent; a contract burns its template's
 * `price_cents`. A balance of -1 is the legacy "unlimited" marker and is
 * never decremented.
 *
 * Pure helpers (no I/O) so the burn rules can be unit-tested; the atomic
 * database write lives in `decrementCredits` (lib/contract-engine.ts).
 */

export const UNLIMITED_CREDITS = -1;

/** True when the key can pay `priceCents` (legacy unlimited keys always can). */
export function hasEnoughCredits(credits: number, priceCents: number): boolean {
  return credits === UNLIMITED_CREDITS || credits >= priceCents;
}

/** Balance after burning `priceCents`, or null when the balance is too low. */
export function creditsAfterBurn(credits: number, priceCents: number): number | null {
  if (credits === UNLIMITED_CREDITS) return UNLIMITED_CREDITS;
  if (credits < priceCents) return null;
  return credits - priceCents;
}

/** Body of the HTTP 402 returned when a key cannot pay for a contract. */
export function insufficientCreditsBody(priceCents: number, available: number) {
  return { error: 'insufficient_credits', required: priceCents, available };
}
