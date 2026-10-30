import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { validateApiKey, isAdmin } from '@/lib/api-auth';
// Lives in lib/ rather than inline with the other checks so it can be exercised
// directly — a monitor nobody has watched fail is not known to work.
import { checkInboundMail } from '@/lib/health/inbound-mail';
import { checkAnthropicGeneration } from '@/lib/health/anthropic-probe';
import { overallStatus } from '@/lib/health/rollup';
import { resolveX402Config, createFacilitatorClient } from '@/lib/x402/facilitator';
import { PLATFORM_VERSION } from '@/lib/version';

const BASE_RPC = 'https://mainnet.base.org';
const TIMEOUT_MS = 5000;

interface CheckResult {
  status: 'ok' | 'degraded' | 'down';
  latency_ms?: number;
  detail?: string;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timer = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), ms),
  );
  return Promise.race([promise, timer]);
}

async function checkSupabase(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const db = getSupabaseAdmin();
    const result = await withTimeout(
      Promise.resolve(db.from('contracts').select('*', { count: 'exact', head: true })),
      TIMEOUT_MS,
    );
    if (result.error) return { status: 'down', detail: result.error.message };
    return { status: 'ok', latency_ms: Date.now() - start, detail: `${result.count ?? 0} contracts` };
  } catch (e) {
    return { status: 'down', detail: e instanceof Error ? e.message : 'unknown' };
  }
}

async function checkBaseRpc(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const res = await withTimeout(
      fetch(BASE_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
      }),
      TIMEOUT_MS,
    );
    const data = await res.json();
    if (!data.result) return { status: 'down', detail: 'no block number' };
    const block = parseInt(data.result, 16);
    return { status: 'ok', latency_ms: Date.now() - start, detail: `block ${block}` };
  } catch (e) {
    return { status: 'down', detail: e instanceof Error ? e.message : 'unknown' };
  }
}

// Reachability alone is not health: the account's spend limit leaves /v1/models
// answering while every generation fails. Unlike ops_agent, this one counts
// toward the overall status, because contract generation depends on it. The
// probe is memoised for ten minutes per instance (see lib/health/anthropic-probe).
async function checkAnthropic(fresh: boolean): Promise<CheckResult> {
  return checkAnthropicGeneration(process.env.ANTHROPIC_API_KEY, TIMEOUT_MS, fresh);
}

// Apps Script cold starts routinely run past the 5s budget the other checks use,
// which flapped the whole endpoint to unhealthy. Same budget as the inbound-mail
// check, which hit the same false alarms.
const OPS_TIMEOUT_MS = 15000;

async function checkOpsAgent(): Promise<CheckResult> {
  const base = process.env.OPS_BASE;
  const key = process.env.OPS_KEY;
  if (!base || !key) return { status: 'down', detail: 'OPS_BASE or OPS_KEY not configured' };
  const start = Date.now();
  try {
    const data = await withTimeout(
      fetch(`${base}?action=draft_queue&key=${key}`).then((r) => r.json()),
      OPS_TIMEOUT_MS,
    );
    if (data.error) return { status: 'down', detail: data.error };
    return {
      status: 'ok',
      latency_ms: Date.now() - start,
      detail: `${data.count ?? 0} pending drafts`,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    // No answer even after the longer budget: slow, not proven down. A refused
    // connection, an error body or a non-JSON page is still reported as down.
    // Neither changes the overall status or the HTTP code; both show in the body.
    if (message === 'timeout') {
      return {
        status: 'degraded',
        latency_ms: Date.now() - start,
        detail: `no answer within ${OPS_TIMEOUT_MS / 1000}s`,
      };
    }
    return { status: 'down', detail: message };
  }
}

async function checkResend(): Promise<CheckResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { status: 'down', detail: 'no API key configured' };
  const start = Date.now();
  try {
    const res = await withTimeout(
      fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${key}` },
      }),
      TIMEOUT_MS,
    );
    if (!res.ok) {
      return { status: 'down', latency_ms: Date.now() - start, detail: `HTTP ${res.status}` };
    }
    const data = await res.json();
    const domains = Array.isArray(data?.data) ? data.data : [];
    const verified = domains.filter((d: { status?: string }) => d.status === 'verified').length;
    return {
      status: 'ok',
      latency_ms: Date.now() - start,
      detail: `${verified}/${domains.length} verified`,
    };
  } catch (e) {
    return { status: 'down', detail: e instanceof Error ? e.message : 'unknown' };
  }
}

async function checkStripe(): Promise<CheckResult> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { status: 'down', detail: 'no API key configured' };
  const start = Date.now();
  try {
    const res = await withTimeout(
      fetch('https://api.stripe.com/v1/balance', {
        headers: { Authorization: `Bearer ${key}` },
      }),
      TIMEOUT_MS,
    );
    if (!res.ok) {
      return { status: 'down', latency_ms: Date.now() - start, detail: `HTTP ${res.status}` };
    }
    const mode = key.startsWith('sk_live_') ? 'live' : 'test';
    return { status: 'ok', latency_ms: Date.now() - start, detail: `${mode} mode` };
  } catch (e) {
    return { status: 'down', detail: e instanceof Error ? e.message : 'unknown' };
  }
}

async function checkCnftContract(): Promise<CheckResult> {
  const address = process.env.CNFT_CONTRACT_ADDRESS;
  if (!address) return { status: 'down', detail: 'CNFT_CONTRACT_ADDRESS not set' };
  const start = Date.now();
  try {
    const res = await withTimeout(
      fetch(BASE_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getCode',
          params: [address, 'latest'],
        }),
      }),
      TIMEOUT_MS,
    );
    const data = await res.json();
    const code: string | undefined = data?.result;
    if (!code || code === '0x') {
      return { status: 'down', latency_ms: Date.now() - start, detail: 'no contract code at address' };
    }
    const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
    return { status: 'ok', latency_ms: Date.now() - start, detail: `deployed (${short})` };
  } catch (e) {
    return { status: 'down', detail: e instanceof Error ? e.message : 'unknown' };
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

async function checkX402Facilitator(fresh: boolean): Promise<CheckResult> {
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
    return { status: 'down', detail: e instanceof Error ? e.message : 'unknown' };
  }
}

export async function GET(request: NextRequest) {
  const start = Date.now();

  // Detail (per-service latency, counts, Stripe mode, contract totals) is
  // admin-only. Public callers still get the overall up/down status so
  // external uptime monitors keep working.
  const hasApiKey = !!request.headers.get('x-api-key') || !!request.headers.get('authorization');
  let isAdminCaller = false;
  if (hasApiKey) {
    const auth = await validateApiKey(request);
    isAdminCaller = !!auth && isAdmin(auth.email);
  }

  const [supabase, baseRpc, anthropic, opsAgent, resend, stripe, cnft, x402Facilitator, inboundMail] =
    await Promise.all([
    checkSupabase(),
    checkBaseRpc(),
    checkAnthropic(isAdminCaller),
    checkOpsAgent(),
    checkResend(),
    checkStripe(),
    checkCnftContract(),
    checkX402Facilitator(isAdminCaller),
    // Admin-only. An extra Apps Script call on every uptime-monitor ping would
    // burn URL Fetch quota for data only an admin is shown anyway.
    isAdminCaller ? checkInboundMail() : Promise.resolve(null),
  ]);

  // Services whose health means "the product is up", plus two that are shown
  // but left out of the overall status (see lib/health/rollup): ops_agent, and
  // x402_facilitator, because x402 is one of two payment rails and API keys
  // keep the product up while the facilitator is not.
  // inbound_mail is deliberately absent — see the note above checkInboundMail.
  const checks = {
    supabase,
    base_rpc: baseRpc,
    anthropic,
    ops_agent: opsAgent,
    resend,
    stripe,
    cnft_contract: cnft,
    x402_facilitator: x402Facilitator,
  };
  const overall = overallStatus(checks, ['ops_agent', 'x402_facilitator']);
  const httpStatus = overall === 'healthy' ? 200 : 503;

  if (!isAdminCaller) {
    const publicServices = Object.fromEntries(
      Object.entries(checks).map(([k, v]) => [k, v.status]),
    );
    const cnftAddress = process.env.CNFT_CONTRACT_ADDRESS;
    return NextResponse.json(
      {
        status: overall,
        version: PLATFORM_VERSION,
        timestamp: new Date().toISOString(),
        services: publicServices,
        cnft: cnftAddress
          ? {
              address: cnftAddress,
              basescan_url: `https://basescan.org/address/${cnftAddress}`,
            }
          : null,
      },
      {
        status: httpStatus,
        headers: {
          'Cache-Control': 'public, s-maxage=30',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  }

  return NextResponse.json(
    {
      status: overall,
      version: PLATFORM_VERSION,
      timestamp: new Date().toISOString(),
      total_latency_ms: Date.now() - start,
      checks: inboundMail ? { ...checks, inbound_mail: inboundMail } : checks,
    },
    {
      status: httpStatus,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
