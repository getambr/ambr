import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_RETRY_AFTER_SECONDS,
  GUARD_MAX_SECONDS,
  MAX_RETRY_AFTER_SECONDS,
  classifyGenerationError,
  clearProviderUnavailable,
  getProviderUnavailableSeconds,
  markProviderUnavailable,
  recordGenerationFailure,
  recordGenerationSuccess,
  requestCarriesCredentials,
  retryAfterFromMessage,
} from '../llm/availability';

const NOW = Date.parse('2026-10-25T12:00:00Z');
const USAGE_LIMIT =
  'You have reached your specified API usage limits. You will regain access on 2026-10-26 at 00:00 UTC.';

beforeEach(() => clearProviderUnavailable());

describe('retryAfterFromMessage', () => {
  it('reads the regain-access time out of the upstream message', () => {
    expect(retryAfterFromMessage(USAGE_LIMIT, NOW)).toBe(12 * 3600);
  });

  it('reads it from inside the SDK JSON wrapper', () => {
    const wrapped = `400 {"error":{"message":"${USAGE_LIMIT}"},"request_id":"req_x"}`;
    expect(retryAfterFromMessage(wrapped, NOW)).toBe(12 * 3600);
  });

  it('caps at 24h', () => {
    expect(retryAfterFromMessage(USAGE_LIMIT.replace('2026-10-26', '2026-11-01'), NOW)).toBe(MAX_RETRY_AFTER_SECONDS);
  });

  it('falls back to the default with no time, an unparsable one, or one in the past', () => {
    expect(retryAfterFromMessage('credit balance is too low', NOW)).toBe(DEFAULT_RETRY_AFTER_SECONDS);
    expect(retryAfterFromMessage('You will regain access on someday soon.', NOW)).toBe(DEFAULT_RETRY_AFTER_SECONDS);
    expect(retryAfterFromMessage(USAGE_LIMIT.replace('2026-10-26', '2026-10-01'), NOW)).toBe(DEFAULT_RETRY_AFTER_SECONDS);
  });
});

describe('classifyGenerationError', () => {
  it('treats the adapter-tagged billing error as a usage limit', () => {
    const err = Object.assign(new Error('Anthropic 400: credit balance too low'), { code: 'BILLING_EXHAUSTED' });
    expect(classifyGenerationError(err, NOW)).toMatchObject({ unavailable: true, retryAfterSeconds: DEFAULT_RETRY_AFTER_SECONDS });
  });

  it('treats the raw SDK usage-limit 400 as a usage limit', () => {
    const err = Object.assign(new Error(`400 ${USAGE_LIMIT}`), { status: 400 });
    expect(classifyGenerationError(err, NOW)).toMatchObject({ unavailable: true, retryAfterSeconds: 12 * 3600 });
  });

  it('treats a quota-type 429 as a usage limit but a plain rate limit as an ordinary failure', () => {
    const quota = Object.assign(new Error('You exceeded your current quota'), { status: 429 });
    const rate = Object.assign(new Error('Anthropic 429: rate-limited, slow down'), { code: 'RATE_LIMIT' });
    expect(classifyGenerationError(quota, NOW).unavailable).toBe(true);
    expect(classifyGenerationError(rate, NOW).unavailable).toBe(false);
  });

  it('treats other errors as ordinary failures and keeps class and message for the audit', () => {
    const failure = classifyGenerationError(new TypeError('no usable response'), NOW);
    expect(failure).toMatchObject({ unavailable: false, errorClass: 'TypeError', errorMessage: 'no usable response' });
  });
});

describe('provider-down guard', () => {
  it('is clear by default, arms on a usage-limit failure and expires', () => {
    expect(getProviderUnavailableSeconds(NOW)).toBeNull();

    recordGenerationFailure(Object.assign(new Error(USAGE_LIMIT), { status: 400 }));
    expect(getProviderUnavailableSeconds()).toBeGreaterThan(0);

    markProviderUnavailable(60, NOW);
    expect(getProviderUnavailableSeconds(NOW)).toBe(60);
    expect(getProviderUnavailableSeconds(NOW + 61_000)).toBeNull();
  });

  it('is not armed by an ordinary failure', () => {
    recordGenerationFailure(new Error('boom'));
    expect(getProviderUnavailableSeconds()).toBeNull();
  });
});

describe('guard window and reset', () => {
  it('caps the window at one hour whatever the advertised retry time', () => {
    markProviderUnavailable(MAX_RETRY_AFTER_SECONDS, NOW);
    expect(getProviderUnavailableSeconds(NOW)).toBe(GUARD_MAX_SECONDS);
    expect(getProviderUnavailableSeconds(NOW + GUARD_MAX_SECONDS * 1000 + 1)).toBeNull();
  });

  it('clears on the first successful generation', () => {
    markProviderUnavailable(600);
    recordGenerationSuccess();
    expect(getProviderUnavailableSeconds()).toBeNull();
  });
});

describe('requestCarriesCredentials', () => {
  const req = (headers: Record<string, string>) => new Request('https://getamber.dev/api/v1/contracts', { method: 'POST', headers });

  it('is true for a payment signature, an API key or a bearer token, false for a bare request', () => {
    expect(requestCarriesCredentials(req({ 'PAYMENT-SIGNATURE': 's' }))).toBe(true);
    expect(requestCarriesCredentials(req({ 'X-API-Key': 'k' }))).toBe(true);
    expect(requestCarriesCredentials(req({ Authorization: 'Bearer k' }))).toBe(true);
    expect(requestCarriesCredentials(req({}))).toBe(false);
  });
});
