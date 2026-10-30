import { describe, it, expect } from 'vitest';
import {
  verifySvixSignature,
  computeSvixSignature,
  safeCompareBase64,
  SVIX_TOLERANCE_SECONDS,
} from '@/lib/email/verify-svix';

/**
 * Canonical Svix test vector (from Svix's own published verification example).
 * If our HMAC construction is wrong in any detail — key decoding, the
 * `id.timestamp.body` join, base64 vs hex — this vector stops matching.
 */
const VECTOR = {
  secret: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw',
  payload: '{"test": 2432232314}',
  id: 'msg_p5jXN8AQM9LWM0D4loKWxJek',
  timestamp: '1614265330',
  signature: 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=',
};

/** Pin `now` to the vector's own timestamp so the tolerance check never flakes. */
const VECTOR_NOW = Number(VECTOR.timestamp) * 1000;

function headers(over: Partial<Record<string, string>> = {}, prefix = 'svix'): Headers {
  const h = new Headers();
  const base: Record<string, string> = {
    id: VECTOR.id,
    timestamp: VECTOR.timestamp,
    signature: VECTOR.signature,
  };
  for (const [k, v] of Object.entries({ ...base, ...over })) {
    if (v !== undefined) h.set(`${prefix}-${k}`, v);
  }
  return h;
}

describe('computeSvixSignature', () => {
  it('reproduces the canonical Svix vector', () => {
    const sig = computeSvixSignature(
      VECTOR.id,
      VECTOR.timestamp,
      VECTOR.payload,
      VECTOR.secret,
    );
    expect(sig).toBe('g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=');
  });

  it('accepts a secret without the whsec_ prefix', () => {
    const withPrefix = computeSvixSignature(VECTOR.id, VECTOR.timestamp, VECTOR.payload, VECTOR.secret);
    const without = computeSvixSignature(
      VECTOR.id,
      VECTOR.timestamp,
      VECTOR.payload,
      VECTOR.secret.replace('whsec_', ''),
    );
    expect(without).toBe(withPrefix);
  });

  it('returns null for an empty secret', () => {
    expect(computeSvixSignature(VECTOR.id, VECTOR.timestamp, VECTOR.payload, '')).toBeNull();
  });
});

describe('safeCompareBase64', () => {
  it('matches identical signatures', () => {
    expect(safeCompareBase64('abcd', 'abcd')).toBe(true);
  });

  it('rejects differing signatures of equal length', () => {
    expect(safeCompareBase64('abcd', 'abce')).toBe(false);
  });

  it('rejects empty input rather than treating it as a match', () => {
    // Buffer.from('', 'base64') is zero-length; timingSafeEqual would return
    // true for two empty buffers, so an absent signature must be rejected first.
    expect(safeCompareBase64('', '')).toBe(false);
  });

  it('rejects when decoded lengths differ', () => {
    expect(safeCompareBase64('abcd', 'abcdabcd')).toBe(false);
  });
});

describe('verifySvixSignature', () => {
  it('accepts the canonical vector', () => {
    const result = verifySvixSignature({
      payload: VECTOR.payload,
      headers: headers(),
      secret: VECTOR.secret,
      now: VECTOR_NOW,
    });
    expect(result).toEqual({ ok: true, id: VECTOR.id, timestamp: 1614265330 });
  });

  it('accepts webhook-* header aliases', () => {
    const result = verifySvixSignature({
      payload: VECTOR.payload,
      headers: headers({}, 'webhook'),
      secret: VECTOR.secret,
      now: VECTOR_NOW,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a tampered body', () => {
    const result = verifySvixSignature({
      payload: '{"test": 2432232315}', // one digit changed
      headers: headers(),
      secret: VECTOR.secret,
      now: VECTOR_NOW,
    });
    expect(result).toEqual({ ok: false, reason: 'no_signature_match' });
  });

  it('rejects a wrong secret', () => {
    const result = verifySvixSignature({
      payload: VECTOR.payload,
      headers: headers(),
      secret: 'whsec_TWZLUTlyOEdLWXFyVHdqVVBEOElMUFpJbzJMYUxhU3c=',
      now: VECTOR_NOW,
    });
    expect(result).toEqual({ ok: false, reason: 'no_signature_match' });
  });

  it('rejects a replayed request outside the tolerance window', () => {
    const result = verifySvixSignature({
      payload: VECTOR.payload,
      headers: headers(),
      secret: VECTOR.secret,
      now: VECTOR_NOW + (SVIX_TOLERANCE_SECONDS + 1) * 1000,
    });
    expect(result).toEqual({ ok: false, reason: 'timestamp_out_of_tolerance' });
  });

  it('rejects a timestamp too far in the future', () => {
    const result = verifySvixSignature({
      payload: VECTOR.payload,
      headers: headers(),
      secret: VECTOR.secret,
      now: VECTOR_NOW - (SVIX_TOLERANCE_SECONDS + 1) * 1000,
    });
    expect(result).toEqual({ ok: false, reason: 'timestamp_out_of_tolerance' });
  });

  it('accepts a request at the edge of the tolerance window', () => {
    const result = verifySvixSignature({
      payload: VECTOR.payload,
      headers: headers(),
      secret: VECTOR.secret,
      now: VECTOR_NOW + SVIX_TOLERANCE_SECONDS * 1000,
    });
    expect(result.ok).toBe(true);
  });

  it('matches the second signature during a secret rotation', () => {
    const result = verifySvixSignature({
      payload: VECTOR.payload,
      headers: headers({ signature: `v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= ${VECTOR.signature}` }),
      secret: VECTOR.secret,
      now: VECTOR_NOW,
    });
    expect(result.ok).toBe(true);
  });

  it('ignores signature entries with an unknown version', () => {
    // A v2 entry carrying the correct v1 bytes must NOT pass — otherwise a
    // future scheme change would be silently accepted under the old HMAC.
    const result = verifySvixSignature({
      payload: VECTOR.payload,
      headers: headers({ signature: VECTOR.signature.replace('v1,', 'v2,') }),
      secret: VECTOR.secret,
      now: VECTOR_NOW,
    });
    expect(result).toEqual({ ok: false, reason: 'no_signature_match' });
  });

  it.each([
    ['id', { id: undefined }],
    ['timestamp', { timestamp: undefined }],
    ['signature', { signature: undefined }],
  ])('rejects a request missing the %s header', (_name, over) => {
    const result = verifySvixSignature({
      payload: VECTOR.payload,
      headers: headers(over),
      secret: VECTOR.secret,
      now: VECTOR_NOW,
    });
    expect(result).toEqual({ ok: false, reason: 'missing_headers' });
  });

  // Note: whitespace-padded values (' 1614265330 ') are NOT tested here — the
  // Headers API trims header values per the Fetch spec, so the padded form is
  // unreachable; it arrives at the validator already clean.
  it.each(['not-a-number', '1614265330.5', '0x10', '1e9', '+1614265330', ''])(
    'rejects a malformed timestamp: %j',
    (timestamp) => {
      const result = verifySvixSignature({
        payload: VECTOR.payload,
        headers: headers({ timestamp }),
        secret: VECTOR.secret,
        now: VECTOR_NOW,
      });
      // An empty string is dropped by the header builder, so it reads as missing.
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(['bad_timestamp', 'missing_headers']).toContain(result.reason);
      }
    },
  );

  it('reports bad_secret when the signing secret is absent', () => {
    const result = verifySvixSignature({
      payload: VECTOR.payload,
      headers: headers(),
      secret: '',
      now: VECTOR_NOW,
    });
    expect(result).toEqual({ ok: false, reason: 'bad_secret' });
  });

  it('rejects a malformed signature header with no version separator', () => {
    const result = verifySvixSignature({
      payload: VECTOR.payload,
      headers: headers({ signature: 'g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=' }),
      secret: VECTOR.secret,
      now: VECTOR_NOW,
    });
    expect(result).toEqual({ ok: false, reason: 'no_signature_match' });
  });
});
