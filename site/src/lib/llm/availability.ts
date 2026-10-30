/**
 * LLM availability: classify generation failures and remember, per server
 * instance, that the provider refuses work until a given time.
 *
 * Why: the contract LLM can refuse every call for days (the Anthropic account
 * hit its monthly usage limit on 2026-10-25). Paid doors must not take money, or
 * even verify a payment, while that is known. A usage-limit error sets
 * "unavailable until T"; the doors read it before touching payments. State is
 * module-level, so it is per instance and resets on a cold start: the first
 * failed generation after one re-arms it, which costs one LLM call and no money
 * (generation runs before any x402 settlement).
 *
 * Responses never carry upstream error text or request ids. Callers log them and
 * keep them in audit details (see `GenerationFailure`).
 */

/** Used when the error names no "regain access" time. */
export const DEFAULT_RETRY_AFTER_SECONDS = 600;
/** Longest we trust a provider's own "regain access on <date>" (the guard re-probes after this). */
export const MAX_RETRY_AFTER_SECONDS = 24 * 60 * 60;

/** What every door says when the provider is out of quota. */
export const GENERATION_UNAVAILABLE_MESSAGE =
  'Contract generation is temporarily unavailable. You have not been charged. Retry after the indicated time.';

let unavailableUntilMs = 0;

/** Seconds until the provider is expected back, or null when it is not known to be down. */
export function getProviderUnavailableSeconds(now: number = Date.now()): number | null {
  if (unavailableUntilMs <= now) return null;
  return Math.max(1, Math.ceil((unavailableUntilMs - now) / 1000));
}

/**
 * The guard window is shorter than the advertised retry time: after an hour the
 * next request probes again (one LLM call, no money), so a limit lifted early
 * does not keep the doors shut, and a still-active one re-arms the guard.
 */
export const GUARD_MAX_SECONDS = 60 * 60;

export function markProviderUnavailable(retryAfterSeconds: number, now: number = Date.now()): void {
  unavailableUntilMs = now + Math.min(retryAfterSeconds, GUARD_MAX_SECONDS) * 1000;
}

/** Test hook: forget a recorded outage. */
export function clearProviderUnavailable(): void {
  unavailableUntilMs = 0;
}

/** A generation succeeded, so the provider is back: drop the guard. */
export function recordGenerationSuccess(): void {
  clearProviderUnavailable();
}

/**
 * True when the request carries something a paid door would verify or charge
 * (an API key or a PAYMENT-SIGNATURE). A bare request still gets the normal 402
 * challenge, so price discovery and the Bazaar keep working during an outage.
 */
export function requestCarriesCredentials(request: Request): boolean {
  const h = request.headers;
  return Boolean(h.get('PAYMENT-SIGNATURE') || h.get('X-API-Key') || h.get('Authorization'));
}

export interface GenerationFailure {
  /** Provider usage limit / billing / quota: nothing will work until it is lifted. */
  unavailable: boolean;
  /** Seconds to wait (only when `unavailable`). */
  retryAfterSeconds: number;
  /** Server-side only: log and audit these, never put them in a response. */
  errorClass: string;
  errorMessage: string;
}

const USAGE_LIMIT_PATTERN = /usage limits?|credit balance|quota|billing/i;

function isUsageLimitError(err: unknown): boolean {
  const e = err as { code?: string; status?: number; message?: string } | null;
  if (!e) return false;
  if (e.code === 'BILLING_EXHAUSTED') return true;
  const quotaShaped =
    e.code === 'RATE_LIMIT' || e.status === 400 || e.status === 402 || e.status === 429;
  return quotaShaped && USAGE_LIMIT_PATTERN.test(e.message ?? '');
}

/**
 * Seconds until the "You will regain access on 2026-11-01 at 00:00 UTC" time in
 * an upstream error, capped at 24h; the default when there is none or it has
 * already passed.
 */
export function retryAfterFromMessage(message: string, now: number = Date.now()): number {
  const m = message.match(/regain access on ([^.\n"]+?)(?:\.\s|\.?"|\.?$)/i);
  if (m) {
    const text = m[1].trim().replace(/\s+at\s+/i, ' ');
    const iso = text.match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2})(?::\d{2})?)?/);
    const at = iso ? Date.parse(`${iso[1]}T${iso[2] ?? '00:00'}:00Z`) : Date.parse(text);
    const seconds = Math.ceil((at - now) / 1000);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds, MAX_RETRY_AFTER_SECONDS);
    }
  }
  return DEFAULT_RETRY_AFTER_SECONDS;
}

/** Pure classification of a generation error. */
export function classifyGenerationError(err: unknown, now: number = Date.now()): GenerationFailure {
  const errorClass = (err as Error)?.constructor?.name ?? 'Error';
  const errorMessage = (err as Error)?.message ?? String(err);
  const unavailable = isUsageLimitError(err);
  return {
    unavailable,
    retryAfterSeconds: unavailable ? retryAfterFromMessage(errorMessage, now) : 0,
    errorClass,
    errorMessage,
  };
}

/**
 * Classify a generation error and, for a usage-limit one, arm the guard.
 * Call once per failure, in the door's catch.
 */
export function recordGenerationFailure(err: unknown): GenerationFailure {
  const failure = classifyGenerationError(err);
  if (failure.unavailable) markProviderUnavailable(failure.retryAfterSeconds);
  return failure;
}

/** Body of the 503 every door sends for `generation_unavailable`. */
export function generationUnavailableBody(retryAfterSeconds: number) {
  return {
    error: 'generation_unavailable',
    message: GENERATION_UNAVAILABLE_MESSAGE,
    retry_after: retryAfterSeconds,
  };
}
