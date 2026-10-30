/**
 * GET /api/v1/analytics
 *
 * Server-side aggregations for the dashboard Analytics section. Returns
 * roll-ups that the client can't derive from its 100-contract sample
 * (chat_usage, audit_log timelines, broad table counts, etc.).
 *
 * Why a separate endpoint:
 * - /api/v1/dashboard already returns raw contracts (100 rows). Adding
 *   chat_usage roll-ups there would mean re-aggregating on every page
 *   load even when Analytics isn't open.
 * - Aggregations need their own caching (60s) independent of the
 *   per-request contracts list.
 * - Future: this endpoint can grow without bloating the dashboard route.
 *
 * Auth: same as /api/v1/dashboard — requires a valid API key. Aggregations
 * are scoped to the calling api_key_id so users see THEIR usage, not the
 * platform's. Admin api_keys (when we add that role) can request global
 * rollups via ?scope=global; non-admins always get scoped data.
 *
 * Cache: response sets s-maxage=60 + stale-while-revalidate=300. Vercel's
 * edge cache + Next.js's built-in cache handle the bulk of repeat loads.
 *
 * Initial shape (commit 1 — must-fix tier):
 *   {
 *     chat_usage_summary: {
 *       last_30d_cost_usd: number,
 *       last_30d_turns: number,
 *       by_model: Record<string, number>,
 *       by_status: Record<string, number>,
 *       cache_hit_rate: number,    // cached_tokens / input_tokens, last 30d
 *       fallback_rate: number,     // fallback_used=true / total, last 30d
 *       daily: Array<{ day: string; cost_usd: number; turns: number; errors: number }>,
 *     }
 *   }
 *
 * Commits 2 + 3 extend this with handshakes_summary, amendments_summary,
 * mint_pipeline_daily, signatures_summary, audit_log_summary, etc.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { corsOptions } from '@/lib/cors';

interface ChatUsageRow {
  created_at: string;
  cost_usd: number | null;
  model: string | null;
  status: string | null;
  cached_tokens: number | null;
  input_tokens: number | null;
  fallback_used: boolean | null;
}

interface ChatUsageSummary {
  last_30d_cost_usd: number;
  last_30d_turns: number;
  by_model: Record<string, number>;
  by_status: Record<string, number>;
  cache_hit_rate: number;
  fallback_rate: number;
  daily: Array<{ day: string; cost_usd: number; turns: number; errors: number }>;
}

const DAY_MS = 86_400_000;
const DAYS = 30;

function summarizeChatUsage(rows: ChatUsageRow[]): ChatUsageSummary {
  // Initialize 30-day buckets so days with zero activity still appear.
  const dailyMap = new Map<string, { cost_usd: number; turns: number; errors: number }>();
  const now = new Date();
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY_MS);
    const key = d.toISOString().slice(0, 10);
    dailyMap.set(key, { cost_usd: 0, turns: 0, errors: 0 });
  }

  let totalCost = 0;
  let totalTurns = 0;
  let totalCached = 0;
  let totalInput = 0;
  let fallbackHits = 0;
  const byModel: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  for (const r of rows) {
    const day = r.created_at.slice(0, 10);
    const bucket = dailyMap.get(day);
    const cost = typeof r.cost_usd === 'number' ? r.cost_usd : 0;
    const isError = r.status !== null && r.status !== 'ok';

    if (bucket) {
      bucket.cost_usd += cost;
      bucket.turns += 1;
      if (isError) bucket.errors += 1;
    }

    totalCost += cost;
    totalTurns += 1;
    totalCached += typeof r.cached_tokens === 'number' ? r.cached_tokens : 0;
    totalInput += typeof r.input_tokens === 'number' ? r.input_tokens : 0;
    if (r.fallback_used) fallbackHits += 1;

    const model = r.model ?? 'unknown';
    byModel[model] = (byModel[model] || 0) + 1;

    const status = r.status ?? 'unknown';
    byStatus[status] = (byStatus[status] || 0) + 1;
  }

  // Round daily costs and totals for stable display.
  const daily = Array.from(dailyMap.entries()).map(([day, v]) => ({
    day,
    cost_usd: Math.round(v.cost_usd * 10000) / 10000,
    turns: v.turns,
    errors: v.errors,
  }));

  return {
    last_30d_cost_usd: Math.round(totalCost * 10000) / 10000,
    last_30d_turns: totalTurns,
    by_model: byModel,
    by_status: byStatus,
    // input_tokens may be null for some early rows — guard against div-by-zero.
    cache_hit_rate: totalInput > 0 ? Math.round((totalCached / totalInput) * 1000) / 1000 : 0,
    fallback_rate: totalTurns > 0 ? Math.round((fallbackHits / totalTurns) * 1000) / 1000 : 0,
    daily,
  };
}

export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (!auth) {
    return NextResponse.json(
      { error: 'Invalid or missing API key' },
      { status: 401 },
    );
  }

  const db = getSupabaseAdmin();
  const sinceIso = new Date(Date.now() - DAYS * DAY_MS).toISOString();

  // Pull the last 30 days of chat_usage rows for THIS api_key. Limit is
  // generous (10k) — at current pricing/volume, a single account hitting
  // that ceiling in 30d is an order of magnitude above the heaviest
  // observed beta user. If we ever cross it, switch to server-side
  // aggregation via an RPC function.
  const { data: chatRows, error: chatErr } = await db
    .from('chat_usage')
    .select('created_at, cost_usd, model, status, cached_tokens, input_tokens, fallback_used')
    .eq('api_key_id', auth.keyId)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: true })
    .limit(10000);

  if (chatErr) {
    // Non-fatal — return an empty summary so the Analytics page still
    // renders the rest. Log for ops triage.
    console.error('[analytics] chat_usage query failed:', chatErr.message);
  }

  const chat_usage_summary = summarizeChatUsage((chatRows ?? []) as ChatUsageRow[]);

  return NextResponse.json(
    { chat_usage_summary },
    {
      headers: {
        'Content-Type': 'application/json',
        // 60s cache at the edge with 5min stale-while-revalidate. Per-key
        // (private) since the response is scoped to api_key_id.
        'Cache-Control': 'private, s-maxage=60, stale-while-revalidate=300',
      },
    },
  );
}

export { corsOptions as OPTIONS };
