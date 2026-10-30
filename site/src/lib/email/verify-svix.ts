/**
 * Svix webhook signature verification — no dependency.
 *
 * Resend signs webhooks with Svix (the Standard Webhooks scheme). Neither the
 * `resend` nor the `svix` package is installed here — `send-via-resend.ts` is
 * deliberately a zero-dependency REST wrapper — so this hand-rolls the same
 * HMAC the Svix library performs, using node:crypto with a timing-safe compare
 * (mirroring `src/lib/investor-auth.ts`).
 *
 * Scheme:
 *   signedContent = `${id}.${timestamp}.${rawBody}`
 *   expected      = base64( HMAC-SHA256( base64decode(secret minus 'whsec_'), signedContent ) )
 *   header        = space-delimited list of `v1,<sig>` (a secret rotation emits
 *                   more than one; a match on ANY v1 entry is a pass)
 *
 * Svix signatures are base64, NOT hex — `safeCompareHex` from investor-auth
 * cannot be reused here.
 *
 * The timestamp tolerance is what stops replay: a captured request body plus its
 * still-valid signature is otherwise reusable forever.
 *
 * Required env (in the caller): RESEND_WEBHOOK_SECRET
 */

import { createHmac, timingSafeEqual } from 'crypto';

/** Reject anything signed more than this far from now, in either direction. */
export const SVIX_TOLERANCE_SECONDS = 5 * 60;

export type SvixVerifyResult =
  | { ok: true; id: string; timestamp: number }
  | { ok: false; reason: SvixFailureReason };

export type SvixFailureReason =
  | 'missing_headers'
  | 'bad_timestamp'
  | 'timestamp_out_of_tolerance'
  | 'bad_secret'
  | 'no_signature_match';

/**
 * Timing-safe compare of two base64 signatures.
 * Compares the DECODED bytes — two different base64 spellings of the same
 * bytes are the same signature. Returns false on length mismatch (no throw).
 */
export function safeCompareBase64(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a, 'base64');
  const bb = Buffer.from(b, 'base64');
  // Zero-length would make timingSafeEqual trivially true for garbage input.
  if (ab.length === 0 || ab.length !== bb.length) return false;
  try {
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/**
 * Svix sends `svix-*` headers; the Standard Webhooks spec it derives from uses
 * `webhook-*`. Accept either so a provider-side switch doesn't silently start
 * rejecting every event.
 */
function readHeader(headers: Headers, suffix: string): string | null {
  return headers.get(`svix-${suffix}`) ?? headers.get(`webhook-${suffix}`);
}

/**
 * Derive the HMAC key from a `whsec_`-prefixed secret.
 * Returns null when the secret is absent or decodes to nothing.
 */
function deriveKey(secret: string): Buffer | null {
  if (typeof secret !== 'string' || secret.length === 0) return null;
  const raw = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  const key = Buffer.from(raw, 'base64');
  return key.length > 0 ? key : null;
}

/**
 * Compute the expected signature for a payload. Exported for tests and for
 * anything that needs to produce a signature (there is no such caller today).
 */
export function computeSvixSignature(
  id: string,
  timestamp: string,
  payload: string,
  secret: string,
): string | null {
  const key = deriveKey(secret);
  if (!key) return null;
  return createHmac('sha256', key)
    .update(`${id}.${timestamp}.${payload}`, 'utf8')
    .digest('base64');
}

/**
 * Verify a Svix-signed webhook request.
 *
 * `payload` MUST be the raw request body exactly as received — re-serialising
 * parsed JSON changes the bytes and invalidates the signature.
 */
export function verifySvixSignature(opts: {
  payload: string;
  headers: Headers;
  secret: string;
  /** Milliseconds since epoch; injectable so tests don't depend on wall clock. */
  now?: number;
}): SvixVerifyResult {
  const { payload, headers, secret } = opts;
  const now = opts.now ?? Date.now();

  const id = readHeader(headers, 'id');
  const timestampRaw = readHeader(headers, 'timestamp');
  const signatureHeader = readHeader(headers, 'signature');

  if (!id || !timestampRaw || !signatureHeader) {
    return { ok: false, reason: 'missing_headers' };
  }

  // Integer seconds only — Number() would accept '1e9', ' 12 ', '0x10'.
  if (!/^\d+$/.test(timestampRaw)) {
    return { ok: false, reason: 'bad_timestamp' };
  }
  const timestamp = Number(timestampRaw);
  if (!Number.isSafeInteger(timestamp)) {
    return { ok: false, reason: 'bad_timestamp' };
  }

  const skewSeconds = Math.abs(now / 1000 - timestamp);
  if (skewSeconds > SVIX_TOLERANCE_SECONDS) {
    return { ok: false, reason: 'timestamp_out_of_tolerance' };
  }

  // Sign over the RAW timestamp string, not the parsed number — normalising it
  // would break on any spelling the sender used that we didn't reproduce.
  const expected = computeSvixSignature(id, timestampRaw, payload, secret);
  if (!expected) {
    return { ok: false, reason: 'bad_secret' };
  }

  // `v1,<sig> v1,<sig2>` — during a secret rotation Svix signs with both.
  for (const entry of signatureHeader.split(' ')) {
    const comma = entry.indexOf(',');
    if (comma === -1) continue;
    const version = entry.slice(0, comma);
    const candidate = entry.slice(comma + 1);
    if (version !== 'v1') continue;
    if (safeCompareBase64(candidate, expected)) {
      return { ok: true, id, timestamp };
    }
  }

  return { ok: false, reason: 'no_signature_match' };
}
