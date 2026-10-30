/**
 * Daily cost kill-switch for the Ambr Agent chat.
 *
 * Tracks per-day estimated cost via the chat_usage audit table and
 * short-circuits POST /api/v1/chat if today's spend exceeds the cap.
 * Cap is configured via AMBR_AGENT_DAILY_USD_CAP env var. There is no
 * built-in fallback: without a valid cap the chat stays off (fail closed)
 * and the server logs one warning.
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
  // Anthropic — verified against console.anthropic.com pricing
  'claude-haiku-4-5-20251001': { inPerM: 1.00, outPerM: 5.00 },
  'claude-sonnet-4-6': { inPerM: 3.00, outPerM: 15.00 },
  'kimi-k2.6': { inPerM: 0.95, outPerM: 4.00 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] ?? PRICING['claude-haiku-4-5-20251001'];
  return (inputTokens / 1_000_000) * p.inPerM + (outputTokens / 1_000_000) * p.outPerM;
}

let warnedMissingCap = false;

/** The configured daily cap in USD, or null when it is missing or invalid. */
function configuredCap(): number | null {
  const raw = process.env.AMBR_AGENT_DAILY_USD_CAP;
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return n;
  if (!warnedMissingCap) {
    warnedMissingCap = true;
    console.warn('[chat-budget] AMBR_AGENT_DAILY_USD_CAP is missing or invalid; the Ambr Agent chat stays off until it is set.');
  }
  return null;
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

/**
 * `configured: false` means no valid cap is set; the chat then counts as
 * exhausted so it never runs without a spending limit.
 */
export async function isBudgetExhausted(): Promise<{ exhausted: boolean; configured: boolean; spent: number; cap: number }> {
  const cap = configuredCap();
  if (cap === null) return { exhausted: true, configured: false, spent: 0, cap: 0 };
  const spent = await getTodaysSpendUsd();
  return { exhausted: spent >= cap, configured: true, spent, cap };
}

/** Test hook: lets the missing-cap warning fire again. */
export function resetCapWarningForTests(): void {
  warnedMissingCap = false;
}
