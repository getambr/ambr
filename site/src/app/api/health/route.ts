import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { validateApiKey, isAdmin } from '@/lib/api-auth';

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

async function checkAnthropic(): Promise<CheckResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { status: 'down', detail: 'no API key configured' };
  const start = Date.now();
  try {
    // Just check the API is reachable (models endpoint, no tokens consumed)
    const res = await withTimeout(
      fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
      }),
      TIMEOUT_MS,
    );
    return {
      status: res.ok ? 'ok' : 'degraded',
      latency_ms: Date.now() - start,
      detail: `HTTP ${res.status}`,
    };
  } catch (e) {
    return { status: 'down', detail: e instanceof Error ? e.message : 'unknown' };
  }
}

async function checkOpsAgent(): Promise<CheckResult> {
  const base = process.env.OPS_BASE;
  const key = process.env.OPS_KEY;
  if (!base || !key) return { status: 'down', detail: 'OPS_BASE or OPS_KEY not configured' };
  const start = Date.now();
  try {
    const res = await withTimeout(
      fetch(`${base}?action=draft_queue&key=${key}`),
      TIMEOUT_MS,
    );
    const data = await res.json();
    if (data.error) return { status: 'down', detail: data.error };
    return {
      status: 'ok',
      latency_ms: Date.now() - start,
      detail: `${data.count ?? 0} pending drafts`,
    };
  } catch (e) {
    return { status: 'down', detail: e instanceof Error ? e.message : 'unknown' };
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

  const [supabase, baseRpc, anthropic, opsAgent, resend, stripe, cnft] = await Promise.all([
    checkSupabase(),
    checkBaseRpc(),
    checkAnthropic(),
    checkOpsAgent(),
    checkResend(),
    checkStripe(),
    checkCnftContract(),
  ]);

  const checks = {
    supabase,
    base_rpc: baseRpc,
    anthropic,
    ops_agent: opsAgent,
    resend,
    stripe,
    cnft_contract: cnft,
  };
  const allOk = Object.values(checks).every((c) => c.status === 'ok');
  const anyDown = Object.values(checks).some((c) => c.status === 'down');

  const overall = anyDown ? 'unhealthy' : allOk ? 'healthy' : 'degraded';
  const httpStatus = overall === 'healthy' ? 200 : 503;

  if (!isAdminCaller) {
    const publicServices = Object.fromEntries(
      Object.entries(checks).map(([k, v]) => [k, v.status]),
    );
    const cnftAddress = process.env.CNFT_CONTRACT_ADDRESS;
    return NextResponse.json(
      {
        status: overall,
        version: '0.3.2',
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
      version: '0.3.2',
      timestamp: new Date().toISOString(),
      total_latency_ms: Date.now() - start,
      checks,
    },
    {
      status: httpStatus,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
