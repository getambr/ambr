import { describe, it, expect, vi, beforeEach } from 'vitest';

type R = { status: 'ok' | 'degraded' | 'down'; detail?: string };
const results: Record<string, R> = {};
const fresh: Record<string, boolean> = {};
const validateApiKey = vi.fn();

vi.mock('@/lib/health/checks', () => ({
  checkSupabase: async () => results.supabase,
  checkBaseRpc: async () => results.base_rpc,
  checkAnthropic: async (f: boolean) => ((fresh.anthropic = f), results.anthropic),
  checkOpsAgent: async () => results.ops_agent,
  checkResend: async () => results.resend,
  checkStripe: async () => results.stripe,
  checkCnftContract: async () => results.cnft_contract,
  checkX402Facilitator: async (f: boolean) => ((fresh.x402 = f), results.x402_facilitator),
}));
vi.mock('@/lib/health/inbound-mail', () => ({ checkInboundMail: async () => ({ status: 'degraded', detail: 'spam' }) }));
vi.mock('@/lib/api-auth', () => ({
  validateApiKey: (r: Request) => validateApiKey(r),
  isAdmin: (email: string) => email === 'admin@example.test',
}));

import { GET } from '../route';
import type { NextRequest } from 'next/server';

const call = (headers: Record<string, string> = {}) =>
  GET(new Request('http://localhost/api/health', { headers }) as unknown as NextRequest);

describe('GET /api/health (checks moved to lib/health/checks)', () => {
  beforeEach(() => {
    for (const k of ['supabase', 'base_rpc', 'anthropic', 'ops_agent', 'resend', 'stripe', 'cnft_contract', 'x402_facilitator']) {
      results[k] = { status: 'ok', detail: 'secret-ish detail' };
    }
    fresh.anthropic = fresh.x402 = false;
    validateApiKey.mockReset();
  });

  it('public callers get statuses only, a public cache header and CORS', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=30');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const body = await res.json();
    expect(body.services).toEqual({
      supabase: 'ok', base_rpc: 'ok', anthropic: 'ok', ops_agent: 'ok',
      resend: 'ok', stripe: 'ok', cnft_contract: 'ok', x402_facilitator: 'ok',
    });
    expect(body.checks).toBeUndefined();
    expect(fresh).toEqual({ anthropic: false, x402: false });
  });

  it('admin callers get the detail, no-store, fresh probes and the inbound-mail entry', async () => {
    validateApiKey.mockResolvedValue({ email: 'admin@example.test' });
    const res = await call({ 'x-api-key': 'k' });
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(Object.keys(body.checks)).toEqual([
      'supabase', 'base_rpc', 'anthropic', 'ops_agent', 'resend', 'stripe', 'cnft_contract', 'x402_facilitator', 'inbound_mail',
    ]);
    expect(body.checks.supabase.detail).toBe('secret-ish detail');
    expect(fresh).toEqual({ anthropic: true, x402: true });
    // inbound_mail is shown but never counted.
    expect(body.status).toBe('healthy');
  });

  it('a down counted service is a 503, a down ops_agent or x402 is not', async () => {
    results.ops_agent = { status: 'down' };
    results.x402_facilitator = { status: 'down' };
    expect((await call()).status).toBe(200);
    results.stripe = { status: 'down' };
    const res = await call();
    expect(res.status).toBe(503);
    expect((await res.json()).status).toBe('unhealthy');
  });
});
