import { describe, it, expect, beforeEach } from 'vitest';
import { checkAnthropicGeneration, clearAnthropicProbeCache } from '@/lib/health/anthropic-probe';
import { clearProviderUnavailable, getProviderUnavailableSeconds, markProviderUnavailable } from '@/lib/llm/availability';

const limitBody = {
  type: 'error',
  error: {
    type: 'invalid_request_error',
    message: 'You have reached your specified API usage limits. You will regain access on 2026-11-01 at 00:00 UTC.',
  },
};
const reply = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('checkAnthropicGeneration', () => {
  beforeEach(() => {
    clearProviderUnavailable();
    clearAnthropicProbeCache();
  });

  it('reports degraded with the until time when the guard is set, without calling the API', async () => {
    markProviderUnavailable(3600);
    let called = false;
    const spy = (async () => { called = true; return new Response('{}'); }) as unknown as typeof fetch;
    const r = await checkAnthropicGeneration('k', 1000, false, spy);
    expect(r.status).toBe('degraded');
    expect(r.detail).toMatch(/until \d{4}-\d{2}-\d{2}T/);
    expect(called).toBe(false);
  });

  it('classifies a usage-limit answer as degraded and arms the guard', async () => {
    const now = Date.parse('2026-10-31T12:00:00Z');
    const r = await checkAnthropicGeneration('k', 1000, false, reply(400, limitBody), now);
    expect(r.status).toBe('degraded');
    expect(r.detail).toContain('2026-11-01');
    expect(getProviderUnavailableSeconds(now)).not.toBeNull();
  });

  it('is ok on a 200 and memoises for ten minutes unless asked fresh', async () => {
    let calls = 0;
    const f = (async () => { calls++; return new Response('{}', { status: 200 }); }) as unknown as typeof fetch;
    const t = 1_000_000;
    expect((await checkAnthropicGeneration('k', 1000, false, f, t)).status).toBe('ok');
    await checkAnthropicGeneration('k', 1000, false, f, t + 599_000);
    expect(calls).toBe(1);
    await checkAnthropicGeneration('k', 1000, false, f, t + 601_000);
    expect(calls).toBe(2);
    await checkAnthropicGeneration('k', 1000, true, f, t + 602_000);
    expect(calls).toBe(3);
  });

  it('keeps a failed probe for one minute only', async () => {
    let calls = 0;
    const f = (async () => { calls++; return new Response('{}', { status: 529 }); }) as unknown as typeof fetch;
    const t = 1_000_000;
    expect((await checkAnthropicGeneration('k', 1000, false, f, t)).status).toBe('degraded');
    await checkAnthropicGeneration('k', 1000, false, f, t + 59_000);
    expect(calls).toBe(1);
    await checkAnthropicGeneration('k', 1000, false, f, t + 61_000);
    expect(calls).toBe(2);
  });

  it('does not arm the guard for an unrelated error', async () => {
    const r = await checkAnthropicGeneration('k', 1000, false, reply(500, { error: { message: 'overloaded' } }));
    expect(r.status).toBe('degraded');
    expect(getProviderUnavailableSeconds()).toBeNull();
  });

  it('is down without a key', async () => {
    expect((await checkAnthropicGeneration(undefined, 1000)).status).toBe('down');
  });
});
