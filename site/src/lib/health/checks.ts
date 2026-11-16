/**
 * The dependency probes behind /api/health. They live here so the daily report
 * runs the very same checks as the health endpoint instead of a second copy
 * that could drift.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { checkAnthropicGeneration } from '@/lib/health/anthropic-probe';
import { NonJsonAnswer, readJson, validHttpStatus } from '@/lib/health/fetch-json';
import { resolveX402Config, createFacilitatorClient } from '@/lib/x402/facilitator';

const BASE_RPC = 'https://mainnet.base.org';
const TIMEOUT_MS = 5000;

export interface CheckResult {
  status: 'ok' | 'degraded' | 'down';
  latency_ms?: number;
  detail?: string;
}

export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const timer = new Promise<never>((_, reject) => {
    handle = setTimeout(() => reject(new Error('timeout')), ms);
  });
  try {
    return await Promise.race([promise, timer]);
  } finally {
    clearTimeout(handle);
  }
}

// The timeout above covers only what is awaited inside it. A fetch() resolves
// when the headers arrive, and the body can stall for minutes after that
// (undici's own body timeout is 300 s). So the request and the body read run
// inside one timeout, and the signal also aborts the socket behind them.
function within<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  return withTimeout(run(AbortSignal.timeout(ms)), ms);
}

// Caught errors can carry secrets: undici repeats an invalid header value, key
// included, in its TypeError. Reports and the admin view of /api/health show
// only these fixed phrases, never the error's own text.
function isTimeout(e: unknown): boolean {
  return e instanceof Error && (e.message === 'timeout' || e.name === 'TimeoutError' || e.name === 'AbortError');
}

// Safe facts only: the HTTP status number and the fact of a non-JSON answer. A
// reply that is not JSON is a fault at the other end, not a network failure.
function unreachable(who: string, e: unknown): CheckResult {
  const subject = who.charAt(0).toUpperCase() + who.slice(1);
  if (isTimeout(e)) return { status: 'down', detail: `${subject} did not answer in time.` };
  if (e instanceof NonJsonAnswer) {
    const code = validHttpStatus(e.httpStatus) ? ` (${e.httpStatus})` : '';
    return { status: 'down', detail: `${subject} sent a non-JSON answer${code}.` };
  }
  return { status: 'down', detail: `Could not reach ${who}.` };
}

export async function checkSupabase(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const db = getSupabaseAdmin();
    const result = await withTimeout(
      Promise.resolve(db.from('contracts').select('*', { count: 'exact', head: true })),
      TIMEOUT_MS,
    );
    if (result.error) {
      const code = validHttpStatus(result.status) ? ` (${result.status})` : '';
      return { status: 'down', detail: `The database refused the request${code}.` };
    }
    return { status: 'ok', latency_ms: Date.now() - start, detail: `${result.count ?? 0} contracts` };
  } catch (e) {
    return unreachable('the database', e);
  }
}

export async function checkBaseRpc(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const data = await within(TIMEOUT_MS, async (signal) => {
      const res = await fetch(BASE_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
        signal,
      });
      return readJson(res);
    });
    if (!data.result) return { status: 'down', detail: 'no block number' };
    const block = parseInt(data.result, 16);
    return { status: 'ok', latency_ms: Date.now() - start, detail: `block ${block}` };
  } catch (e) {
    return unreachable('the Base network', e);
  }
}

// Reachability alone is not health: the account's spend limit leaves /v1/models
// answering while every generation fails. Unlike ops_agent, this one counts
// toward the overall status, because contract generation depends on it. The
// probe is memoised for ten minutes per instance (see lib/health/anthropic-probe).
export async function checkAnthropic(fresh: boolean): Promise<CheckResult> {
  return checkAnthropicGeneration(process.env.ANTHROPIC_API_KEY, TIMEOUT_MS, fresh);
}

// The ops service can take longer than the 5s budget the other checks use, which
// would flap the whole endpoint to unhealthy. Same budget as the inbound-mail check.
const OPS_TIMEOUT_MS = 15000;

export async function checkOpsAgent(): Promise<CheckResult> {
  const base = process.env.OPS_BASE;
  const key = process.env.OPS_KEY;
  if (!base || !key) return { status: 'down', detail: 'OPS_BASE or OPS_KEY not configured' };
  const start = Date.now();
  try {
    const data = await within(OPS_TIMEOUT_MS, async (signal) => {
      const res = await fetch(`${base}?action=draft_queue&key=${key}`, { signal });
      return readJson(res);
    });
    if (data.error) return { status: 'down', detail: data.error };
    return {
      status: 'ok',
      latency_ms: Date.now() - start,
      detail: `${data.count ?? 0} pending drafts`,
    };
  } catch (e) {
    // No answer even after the longer budget: slow, not proven down. A refused
    // connection, an error body or a non-JSON page is still reported as down.
    // Neither changes the overall status or the HTTP code; both show in the body.
    if (isTimeout(e)) {
      return {
        status: 'degraded',
        latency_ms: Date.now() - start,
        detail: `no answer within ${OPS_TIMEOUT_MS / 1000}s`,
      };
    }
    // The request URL carries the ops key, and a URL error repeats it.
    return unreachable('the ops assistant', e);
  }
}

export async function checkResend(): Promise<CheckResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { status: 'down', detail: 'no API key configured' };
  const start = Date.now();
  try {
    const { res, data } = await within(TIMEOUT_MS, async (signal) => {
      const res = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${key}` },
        signal,
      });
      return { res, data: res.ok ? await res.json() : null };
    });
    if (!res.ok) {
      return { status: 'down', latency_ms: Date.now() - start, detail: `HTTP ${res.status}` };
    }
    const domains = Array.isArray(data?.data) ? data.data : [];
    const verified = domains.filter((d: { status?: string }) => d.status === 'verified').length;
    return {
      status: 'ok',
      latency_ms: Date.now() - start,
      detail: `${verified}/${domains.length} verified`,
    };
  } catch (e) {
    return unreachable('Resend', e);
  }
}

export async function checkStripe(): Promise<CheckResult> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { status: 'down', detail: 'no API key configured' };
  const start = Date.now();
  try {
    const res = await withTimeout(
      fetch('https://api.stripe.com/v1/balance', {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }),
      TIMEOUT_MS,
    );
    if (!res.ok) {
      return { status: 'down', latency_ms: Date.now() - start, detail: `HTTP ${res.status}` };
    }
    const mode = key.startsWith('sk_live_') ? 'live' : 'test';
    return { status: 'ok', latency_ms: Date.now() - start, detail: `${mode} mode` };
  } catch (e) {
    return unreachable('Stripe', e);
  }
}

export async function checkCnftContract(): Promise<CheckResult> {
  const address = process.env.CNFT_CONTRACT_ADDRESS;
  if (!address) return { status: 'down', detail: 'CNFT_CONTRACT_ADDRESS not set' };
  const start = Date.now();
  try {
    const data = await within(TIMEOUT_MS, async (signal) => {
      const res = await fetch(BASE_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getCode',
          params: [address, 'latest'],
        }),
        signal,
      });
      return readJson(res);
    });
    const code: string | undefined = data?.result;
    if (!code || code === '0x') {
      return { status: 'down', latency_ms: Date.now() - start, detail: 'no contract code at address' };
    }
    const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
    return { status: 'ok', latency_ms: Date.now() - start, detail: `deployed (${short})` };
  } catch (e) {
    return unreachable('the Base network', e);
  }
}

// The 402 challenge is built locally, so a wrong or revoked CDP key would only
// surface at the first paid request, as a 503 after the buyer has signed. The
// facilitator's /supported endpoint wants the same credentials (401 without
// them), so a successful call here proves the key, not just that the env is set.
// The key behind this check is the settle key. Every public ping reaching CDP
// would let anyone spend its rate limit from the outside (the CDN cache only
// covers identical URLs), so the answer is reused for two minutes per instance;
// an admin call always asks afresh.
const X402_CHECK_TTL_MS = 120_000;
let x402CheckCache: { at: number; result: CheckResult } | null = null;

export async function checkX402Facilitator(fresh: boolean): Promise<CheckResult> {
  if (!fresh && x402CheckCache && Date.now() - x402CheckCache.at < X402_CHECK_TTL_MS) {
    return x402CheckCache.result;
  }
  const result = await probeX402Facilitator();
  x402CheckCache = { at: Date.now(), result };
  return result;
}

async function probeX402Facilitator(): Promise<CheckResult> {
  const cfg = resolveX402Config();
  if (!cfg.ok) return { status: 'down', detail: cfg.reason };
  const start = Date.now();
  try {
    const client = await createFacilitatorClient(cfg, { timeoutMs: TIMEOUT_MS });
    const supported = await withTimeout(client.getSupported(), TIMEOUT_MS);
    const kinds = supported.kinds ?? [];
    const host = new URL(cfg.facilitatorUrl).host;
    const listed = kinds.some((k) => k.network === cfg.network && k.scheme === 'exact');
    if (!listed) {
      return {
        status: 'degraded',
        latency_ms: Date.now() - start,
        detail: `${host} does not list exact/${cfg.network} (${kinds.length} kinds)`,
      };
    }
    return { status: 'ok', latency_ms: Date.now() - start, detail: `${host}, exact/${cfg.network}` };
  } catch (e) {
    return facilitatorFailure(e);
  }
}

// The library throws "Facilitator getSupported failed (401): <body excerpt>". The
// status number is the one safe fact in it: it separates a refused key from an
// outage. Nothing else from the message is passed on.
function facilitatorFailure(e: unknown): CheckResult {
  if (isTimeout(e)) return unreachable('the payment facilitator', e);
  const match = e instanceof Error ? /\((\d{3})\)/.exec(e.message) : null;
  const status = match ? Number(match[1]) : NaN;
  if (!validHttpStatus(status)) return unreachable('the payment facilitator', e);
  if (status === 401 || status === 403) {
    return { status: 'down', detail: `The payment facilitator refused the key (${status}).` };
  }
  return { status: 'down', detail: `The payment facilitator answered with an error (${status}).` };
}
