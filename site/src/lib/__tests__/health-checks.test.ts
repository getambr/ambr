import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const supabase = vi.hoisted(() => ({ get: vi.fn() }));
const x402 = vi.hoisted(() => ({
  config: vi.fn(() => ({ ok: false, reason: 'not configured' }) as Record<string, unknown>),
  getSupported: vi.fn(),
}));
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase.get() }));
vi.mock('@/lib/x402/facilitator', () => ({
  resolveX402Config: () => x402.config(),
  createFacilitatorClient: async () => ({ getSupported: x402.getSupported }),
}));

import {
  checkBaseRpc,
  checkCnftContract,
  checkOpsAgent,
  checkResend,
  checkStripe,
  checkSupabase,
  checkX402Facilitator,
} from '@/lib/health/checks';
import { checkInboundMail } from '@/lib/health/inbound-mail';
import { probeAnthropicGeneration } from '@/lib/health/anthropic-probe';

const FAKE_KEY = 're_FAKEFAKEFAKE1234';
// What undici throws for a header value it rejects: the value is in the message.
const headerError = () => new TypeError(`Invalid value "Bearer ${FAKE_KEY}" for header "Authorization"`);

// A response whose headers arrive but whose body never does.
const stalledBody = () => ({ ok: true, status: 200, json: () => new Promise(() => {}) });

const SAVED = {
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  CNFT_CONTRACT_ADDRESS: process.env.CNFT_CONTRACT_ADDRESS,
  OPS_BASE: process.env.OPS_BASE,
  OPS_KEY: process.env.OPS_KEY,
};

function restoreEnv() {
  for (const [name, value] of Object.entries(SAVED)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

describe('health checks: a stalled response body', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    process.env.RESEND_API_KEY = FAKE_KEY;
    process.env.CNFT_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000001';
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    restoreEnv();
  });

  it.each([
    ['checkBaseRpc', checkBaseRpc],
    ['checkResend', checkResend],
    ['checkCnftContract', checkCnftContract],
  ])('%s gives up at its timeout instead of waiting for the body', async (_name, check) => {
    vi.stubGlobal('fetch', vi.fn(async () => stalledBody()));
    let settled = false;
    const run = check().then((r) => {
      settled = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(4999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    const result = await run;
    expect(result.status).toBe('down');
    expect(result.detail).toMatch(/did not answer in time\.$/);
  });
});

describe('health checks: caught errors never reach the detail', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = FAKE_KEY;
    process.env.STRIPE_SECRET_KEY = 'sk_test_FAKEFAKEFAKE1234';
    process.env.OPS_BASE = 'https://ops.example/exec';
    process.env.OPS_KEY = 'FAKEOPSKEY12345';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    restoreEnv();
  });

  it('Resend', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw headerError(); }));
    const r = await checkResend();
    expect(r).toEqual({ status: 'down', detail: 'Could not reach Resend.' });
  });

  it('Stripe', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw headerError(); }));
    const r = await checkStripe();
    expect(r).toEqual({ status: 'down', detail: 'Could not reach Stripe.' });
  });

  it('the database, for a thrown error and for an error result', async () => {
    supabase.get.mockImplementation(() => { throw new Error(`bad key ${FAKE_KEY}`); });
    const thrown = await checkSupabase();
    expect(thrown).toEqual({ status: 'down', detail: 'Could not reach the database.' });

    supabase.get.mockImplementation(() => ({
      from: () => ({ select: async () => ({ error: { message: `denied for ${FAKE_KEY}` }, count: null }) }),
    }));
    const refused = await checkSupabase();
    expect(refused.status).toBe('down');
    expect(JSON.stringify(refused)).not.toContain(FAKE_KEY);
  });

  it('the ops assistant, whose URL carries the key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError(`Failed to parse URL from ${process.env.OPS_BASE}?key=${process.env.OPS_KEY}`); }));
    const r = await checkOpsAgent();
    expect(r).toEqual({ status: 'down', detail: 'Could not reach the ops assistant.' });
  });

  it('the Anthropic probe', async () => {
    const failing = (async () => { throw headerError(); }) as unknown as typeof fetch;
    const r = await probeAnthropicGeneration('k', 1000, failing);
    expect(r).toEqual({ status: 'down', detail: 'Could not reach Anthropic.' });
  });
});

// A reply that is not JSON is a fault at the other end, not a network failure.
// The parser's own message can repeat the body, so only the status number is shown.
const notJson = (status: number) => ({
  ok: false,
  status,
  json: async () => {
    throw new SyntaxError(`Unexpected token < in JSON at position 0 ${FAKE_KEY}`);
  },
});

describe('health checks: safe diagnostics in the fixed phrases', () => {
  beforeEach(() => {
    process.env.OPS_BASE = 'https://ops.example/exec';
    process.env.OPS_KEY = 'FAKEOPSKEY12345';
    x402.config.mockReset().mockReturnValue({
      ok: true,
      facilitatorUrl: 'https://facilitator.example/api',
      network: 'eip155:84532',
    });
    x402.getSupported.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    restoreEnv();
  });

  it('the database names the HTTP status when it has one', async () => {
    supabase.get.mockImplementation(() => ({
      from: () => ({ select: async () => ({ error: { message: `denied for ${FAKE_KEY}` }, count: null, status: 401 }) }),
    }));
    expect(await checkSupabase()).toEqual({ status: 'down', detail: 'The database refused the request (401).' });
    supabase.get.mockImplementation(() => ({
      from: () => ({ select: async () => ({ error: { message: 'x' }, count: null, status: 0 }) }),
    }));
    expect((await checkSupabase()).detail).toBe('The database refused the request.');
  });

  it('Base RPC and the contract check say a non-JSON answer with its status, not "could not reach"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => notJson(502)));
    process.env.CNFT_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000001';
    expect(await checkBaseRpc()).toEqual({ status: 'down', detail: 'The Base network sent a non-JSON answer (502).' });
    expect(await checkCnftContract()).toEqual({ status: 'down', detail: 'The Base network sent a non-JSON answer (502).' });
  });

  it('a network failure still reads "could not reach"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    expect((await checkBaseRpc()).detail).toBe('Could not reach the Base network.');
  });

  it('the ops assistant says a non-JSON answer with its status, and its request is abortable', async () => {
    const fetchMock = vi.fn(async (...args: [string, RequestInit?]) => {
      void args;
      return notJson(200);
    });
    vi.stubGlobal('fetch', fetchMock);
    const r = await checkOpsAgent();
    expect(r).toEqual({ status: 'down', detail: 'The ops assistant sent a non-JSON answer (200).' });
    expect(JSON.stringify(r)).not.toContain(FAKE_KEY);
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    [401, 'The payment facilitator refused the key (401).'],
    [403, 'The payment facilitator refused the key (403).'],
    [500, 'The payment facilitator answered with an error (500).'],
    [429, 'The payment facilitator answered with an error (429).'],
  ])('the facilitator, for a library error with status %i', async (status, detail) => {
    x402.getSupported.mockRejectedValue(new Error(`Facilitator getSupported failed (${status}): bad key ${FAKE_KEY} (999)`));
    const r = await checkX402Facilitator(true);
    expect(r).toEqual({ status: 'down', detail });
  });

  it('the facilitator, with no status in the message, is "could not reach" and repeats nothing', async () => {
    x402.getSupported.mockRejectedValue(new TypeError(`Invalid value "Bearer ${FAKE_KEY}" for header "Authorization"`));
    expect(await checkX402Facilitator(true)).toEqual({ status: 'down', detail: 'Could not reach the payment facilitator.' });
  });

  it('the facilitator ignores a number in the message that is not a three-digit status', async () => {
    x402.getSupported.mockRejectedValue(new Error('failed (12345) and (4)'));
    expect((await checkX402Facilitator(true)).detail).toBe('Could not reach the payment facilitator.');
  });
});

describe('inbound mail check', () => {
  beforeEach(() => {
    process.env.OPS_BASE = 'https://ops.example/exec';
    process.env.OPS_KEY = 'FAKEOPSKEY12345';
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    restoreEnv();
  });

  it('says a non-JSON answer with its status, never the error text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => notJson(503)));
    const r = await checkInboundMail();
    expect(r).toMatchObject({ status: 'degraded', detail: 'The ops assistant sent a non-JSON answer (503).' });
  });

  it('passes an abort signal to both requests and leaves no timer behind', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (...args: [string, RequestInit?]) => {
      void args;
      return { ok: true, status: 200, json: async () => ({ count: 0, emails: [{ date: new Date().toISOString() }] }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    const r = await checkInboundMail();
    expect(r.status).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) expect(call[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports a timeout when the answer never comes', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const run = checkInboundMail({ timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(1001);
    expect(await run).toMatchObject({ status: 'degraded', detail: 'ops timeout' });
    expect(vi.getTimerCount()).toBe(0);
  });
});
