/**
 * LLM provider router for the Ambr Agent chat surface.
 *
 * Reads `LLM_PROVIDER` env var ('anthropic' | 'moonshot'). Defaults to
 * 'anthropic' when unset for backward compatibility. Switching providers
 * is a single Vercel env change — no code/redeploy after the initial
 * router lands.
 *
 * AUTO-FALLBACK (2026-05-26): `callChatWithFallback()` wraps `callChat()` and
 * retries on the SECONDARY provider when the primary throws a transient
 * error (TIMEOUT, RATE_LIMIT, UPSTREAM_5XX). Gated by env flag
 * `LLM_FALLBACK_ENABLED=true` so it's instantly reversible if the secondary
 * starts misbehaving. Reason for adding: production chat_usage showed 50%
 * timeout rate on Kimi K2.6 with users hitting the "I hit a snag" fallback.
 */

import { callAnthropic } from './anthropic';
import { callMoonshot } from './moonshot';
import { getChatAskModel, getChatDeployModel } from '../models';
import type { CallChatParams, ProviderName, UnifiedLLMResponse } from './types';

export function getActiveProvider(): ProviderName {
  const raw = process.env.LLM_PROVIDER?.toLowerCase().trim();
  return raw === 'moonshot' ? 'moonshot' : 'anthropic';
}

/**
 * The provider tried SECOND when the primary errors.
 *
 * CLAUDE-ONLY (2026-07-15): always Anthropic. The Ambr Agent runs on Claude
 * ("we run Claude"), so a transient Anthropic error retries on Anthropic —
 * never on Kimi/Moonshot. The retry machinery in callChatWithFallback still
 * gives resilience (an extra attempt within the Vercel budget); it just no
 * longer routes any turn to a non-Claude model. (LLM_PROVIDER=moonshot is for
 * local Kimi testing only; production is anthropic.)
 */
export function getFallbackProvider(): ProviderName {
  return 'anthropic';
}

export function isFallbackEnabled(): boolean {
  const raw = process.env.LLM_FALLBACK_ENABLED?.toLowerCase().trim();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

export async function callChat(params: CallChatParams): Promise<UnifiedLLMResponse> {
  const provider = getActiveProvider();
  if (provider === 'moonshot') return callMoonshot(params);
  return callAnthropic(params);
}

/** Codes set by the adapters that callChatWithFallback should retry on the secondary. */
const TRANSIENT_CODES = new Set(['TIMEOUT', 'RATE_LIMIT', 'UPSTREAM_5XX']);

/**
 * Pick the right model name for a given provider + chat mode. Each provider
 * has different model IDs (kimi-k2.6 vs claude-sonnet-4-6 / claude-haiku-4-5),
 * so when we fall back from Moonshot → Anthropic we have to translate. The
 * mode arg ('deploy' | 'ask') mirrors the route's existing model getters in
 * lib/llm/models.ts — we just temporarily swap the active provider so the
 * getter returns the OTHER provider's model.
 */
function modelForProvider(provider: ProviderName, mode: 'deploy' | 'ask'): string {
  const prevEnv = process.env.LLM_PROVIDER;
  try {
    // The getters read LLM_PROVIDER via getActiveProvider(). Temporarily
    // flip the env var so they return the model for the fallback provider.
    process.env.LLM_PROVIDER = provider;
    return mode === 'deploy' ? getChatDeployModel() : getChatAskModel();
  } finally {
    if (prevEnv === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = prevEnv;
  }
}

export interface FallbackOutcome {
  response: UnifiedLLMResponse;
  /** True when the primary failed and the secondary's response is what's returned. */
  usedFallback: boolean;
  /** Whichever attempt succeeded. */
  successProvider: ProviderName;
  /** Combined wall-clock time across both attempts (ms). */
  totalDurationMs: number;
  /** When fallback was used, the primary error captured here (else null). */
  primaryError: { code: string | null; message: string } | null;
}

/**
 * Call the active provider; on transient errors, retry on the secondary.
 *
 * Behaviour:
 *  - LLM_FALLBACK_ENABLED unset/false → same as callChat() (no extra work).
 *  - Primary throws with .code in TRANSIENT_CODES → tries secondary with a
 *    tighter timeout (so the overall response stays within the route's
 *    maxDuration even if the primary burned most of its budget).
 *  - Primary throws with code AUTH/BAD_REQUEST/HTTP_ERROR or no code →
 *    re-throws without trying secondary (don't waste credits on what's
 *    almost certainly a programming error).
 *  - Both fail → re-throws the SECONDARY error so the route's catch path
 *    sees the "we tried fallback and it also failed" reality.
 *
 * The caller (route.ts handleDeploy/handleAsk) is responsible for using
 * `outcome.usedFallback` + `outcome.primaryError` to log chat_usage rows
 * accurately and produce error-class-aware user messages.
 */
export async function callChatWithFallback(
  params: CallChatParams & { mode: 'deploy' | 'ask' },
): Promise<FallbackOutcome> {
  const { mode, ...callParams } = params;
  const primary = getActiveProvider();
  const overallStart = Date.now();

  // No fallback configured — collapse to single-call behaviour.
  if (!isFallbackEnabled()) {
    const response = await callChat(callParams);
    return {
      response,
      usedFallback: false,
      successProvider: primary,
      totalDurationMs: response.durationMs ?? (Date.now() - overallStart),
      primaryError: null,
    };
  }

  try {
    const response = await callChat(callParams);
    return {
      response,
      usedFallback: false,
      successProvider: primary,
      totalDurationMs: response.durationMs ?? (Date.now() - overallStart),
      primaryError: null,
    };
  } catch (primaryErr) {
    const e = primaryErr as Error & { code?: string };
    const transient = e.code ? TRANSIENT_CODES.has(e.code) : false;
    if (!transient) {
      // Non-transient (auth/bad-request/unclassified) — surface immediately.
      throw primaryErr;
    }

    // ─── Intra-primary retry (2026-05-26) ──────────────────────────────────
    // Before falling back to the secondary provider, retry the SAME primary
    // once with a tighter timeout. Moonshot's `engine_overloaded_error` 429
    // and short network blips tend to recover within a few seconds. Costs
    // nothing if Moonshot is healthy; rescues brief hiccups even when the
    // secondary (Anthropic) is unfunded — which is the current operational
    // reality. Skip the retry if there's not enough budget left under
    // Vercel's 60s ceiling (need at least 10s).
    const elapsedAfterPrimary = Date.now() - overallStart;
    const intraRetryBudget = Math.min(15_000, 55_000 - elapsedAfterPrimary);
    if (intraRetryBudget >= 10_000) {
      try {
        const retryResponse = await callChat({
          ...callParams,
          timeoutMs: intraRetryBudget,
        });
        return {
          response: retryResponse,
          usedFallback: false,
          successProvider: primary,
          totalDurationMs: Date.now() - overallStart,
          primaryError: null,
        };
      } catch {
        // Retry also failed — fall through to the cross-provider fallback.
      }
    }

    const secondary = getFallbackProvider();
    const fallbackModel = modelForProvider(secondary, mode);
    // Budget left in the 60s Vercel function: assume caller passed ~25s for
    // primary + ~15s retry, so secondary gets the remainder. Floor at 12s so
    // a slow secondary doesn't immediately bail too.
    const remainingMs = Math.max(12_000, 55_000 - (Date.now() - overallStart));

    try {
      const fallbackResponse =
        secondary === 'moonshot'
          ? await callMoonshot({ ...callParams, model: fallbackModel, timeoutMs: remainingMs })
          : await callAnthropic({ ...callParams, model: fallbackModel, timeoutMs: remainingMs });
      return {
        response: { ...fallbackResponse, usedFallback: true },
        usedFallback: true,
        successProvider: secondary,
        totalDurationMs: Date.now() - overallStart,
        primaryError: {
          code: e.code ?? null,
          message: e.message.slice(0, 300),
        },
      };
    } catch (secondaryErr) {
      // Both failed. Re-throw the secondary error but stash the primary on it
      // so the caller can include both in chat_usage for full diagnosis.
      const se = secondaryErr as Error & { code?: string; primaryError?: { code: string | null; message: string } };
      se.primaryError = {
        code: e.code ?? null,
        message: e.message.slice(0, 300),
      };
      throw se;
    }
  }
}

export type { CallChatParams, UnifiedLLMResponse, UnifiedTool, UnifiedToolCall, UnifiedToolChoice, ProviderName } from './types';
