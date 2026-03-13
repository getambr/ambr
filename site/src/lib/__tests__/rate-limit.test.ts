import { describe, it, expect, beforeEach, vi } from 'vitest';
import { rateLimit, getClientIp } from '../rate-limit';

describe('rateLimit', () => {
  beforeEach(() => {
    // Reset the internal hitMap by advancing time past any window
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 999_999_999);
    // Trigger cleanup by calling with a dummy key
    rateLimit('__cleanup__', 1, 1);
    vi.useRealTimers();
  });

  it('allows first request', () => {
    const result = rateLimit('test-key', 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('decrements remaining on each call', () => {
    const r1 = rateLimit('dec-test', 3, 60_000);
    expect(r1.remaining).toBe(2);

    const r2 = rateLimit('dec-test', 3, 60_000);
    expect(r2.remaining).toBe(1);

    const r3 = rateLimit('dec-test', 3, 60_000);
    expect(r3.remaining).toBe(0);
  });

  it('blocks when limit exceeded', () => {
    rateLimit('block-test', 2, 60_000);
    rateLimit('block-test', 2, 60_000);
    const r3 = rateLimit('block-test', 2, 60_000);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it('resets after window expires', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    rateLimit('reset-test', 1, 1_000);
    const blocked = rateLimit('reset-test', 1, 1_000);
    expect(blocked.allowed).toBe(false);

    // Advance past window
    vi.setSystemTime(now + 1_001);
    const allowed = rateLimit('reset-test', 1, 1_000);
    expect(allowed.allowed).toBe(true);

    vi.useRealTimers();
  });

  it('tracks different keys independently', () => {
    rateLimit('key-a', 1, 60_000);
    const blockedA = rateLimit('key-a', 1, 60_000);
    expect(blockedA.allowed).toBe(false);

    const allowedB = rateLimit('key-b', 1, 60_000);
    expect(allowedB.allowed).toBe(true);
  });

  it('returns resetAt timestamp', () => {
    const result = rateLimit('ts-test', 5, 60_000);
    expect(result.resetAt).toBeGreaterThan(Date.now() - 1000);
  });
});

describe('getClientIp', () => {
  it('extracts IP from x-forwarded-for', () => {
    const request = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' },
    });
    expect(getClientIp(request)).toBe('192.168.1.1');
  });

  it('extracts IP from x-real-ip', () => {
    const request = new Request('http://localhost', {
      headers: { 'x-real-ip': '10.0.0.5' },
    });
    expect(getClientIp(request)).toBe('10.0.0.5');
  });

  it('prefers x-forwarded-for over x-real-ip', () => {
    const request = new Request('http://localhost', {
      headers: {
        'x-forwarded-for': '192.168.1.1',
        'x-real-ip': '10.0.0.5',
      },
    });
    expect(getClientIp(request)).toBe('192.168.1.1');
  });

  it('returns unknown when no IP headers present', () => {
    const request = new Request('http://localhost');
    expect(getClientIp(request)).toBe('unknown');
  });
});
