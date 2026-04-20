import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

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
    const db = getSupabase();
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

export async function GET(request: Request) {
  const start = Date.now();

  const [supabase, baseRpc, anthropic, opsAgent] = await Promise.all([
    checkSupabase(),
    checkBaseRpc(),
    checkAnthropic(),
    checkOpsAgent(),
  ]);

  const checks = { supabase, base_rpc: baseRpc, anthropic, ops_agent: opsAgent };
  const allOk = Object.values(checks).every((c) => c.status === 'ok');
  const anyDown = Object.values(checks).some((c) => c.status === 'down');

  const overall = anyDown ? 'unhealthy' : allOk ? 'healthy' : 'degraded';

  const apiKey = request.headers.get('x-api-key');
  if (!apiKey) {
    return NextResponse.json(
      { status: overall, version: '0.3.0', timestamp: new Date().toISOString() },
      { status: overall === 'healthy' ? 200 : 503, headers: { 'Cache-Control': 'public, s-maxage=30' } },
    );
  }

  return NextResponse.json(
    {
      status: overall,
      version: '0.3.0',
      timestamp: new Date().toISOString(),
      total_latency_ms: Date.now() - start,
      checks,
    },
    {
      status: overall === 'healthy' ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
