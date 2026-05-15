/**
 * Daily cost kill-switch for the Ambr Agent chat.
 *
 * Tracks per-day estimated cost via the chat_usage audit table and
 * short-circuits POST /api/v1/chat if today's spend exceeds the cap.
 * Cap is configured via AMBR_AGENT_DAILY_USD_CAP env var (default $25).
 *
 * Cost estimates use list pricing per 1M tokens. Re-tune if Anthropic
 * pricing changes.
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin';

interface ModelPricing {
  inPerM: number;   // USD per 1M input tokens
  outPerM: number;  // USD per 1M output tokens
}

const PRICING: Record<string, ModelPricing> = {
  'claude-haiku-4-5-20251001': { inPerM: 1.00, outPerM: 5.00 },
  'claude-sonnet-4-6': { inPerM: 3.00, outPerM: 15.00 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] ?? PRICING['claude-haiku-4-5-20251001'];
  return (inputTokens / 1_000_000) * p.inPerM + (outputTokens / 1_000_000) * p.outPerM;
}

function defaultCap(): number {
  const raw = process.env.AMBR_AGENT_DAILY_USD_CAP;
  if (!raw) return 25;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 25;
}

/**
 * Return current day's cost spent on chat, in USD. If the audit table
 * is unavailable, returns 0 (fail-open — we'd rather over-serve than
 * outage the agent when our own logging breaks).
 */
export async function getTodaysSpendUsd(): Promise<number> {
  try {
    const db = getSupabaseAdmin();
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { data, error } = await db
      .from('chat_usage')
      .select('cost_usd')
      .gte('created_at', todayStart.toISOString());
    if (error || !data) return 0;
    return data.reduce((sum: number, row: { cost_usd: number | null }) => sum + (row.cost_usd ?? 0), 0);
  } catch {
    return 0;
  }
}

export async function isBudgetExhausted(): Promise<{ exhausted: boolean; spent: number; cap: number }> {
  const cap = defaultCap();
  const spent = await getTodaysSpendUsd();
  return { exhausted: spent >= cap, spent, cap };
}

export function dailyCapUsd(): number {
  return defaultCap();
}
