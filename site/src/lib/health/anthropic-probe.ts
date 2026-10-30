// /v1/models answers 200 even when the account's monthly spend limit is hit, so
// it said "ok" on 2026-10-25 while every generation failed. This asks for one
// token of a real Messages call instead, and reads the answer with the same
// classifier the contract doors use. Lives in lib/ so it can be exercised
// directly.
import { CONTRACT_GENERATION_MODEL } from '@/lib/llm/models';
import {
  classifyGenerationError,
  getProviderUnavailableSeconds,
  markProviderUnavailable,
} from '@/lib/llm/availability';

export interface AnthropicCheckResult {
  status: 'ok' | 'degraded' | 'down';
  latency_ms?: number;
  detail?: string;
}

/** A probe spends tokens, so a public ping may not trigger one more than this often per instance. */
export const ANTHROPIC_PROBE_TTL_MS = 10 * 60 * 1000;
/** A failed probe is kept only briefly, so a blip of seconds does not read as a ten-minute outage. */
export const ANTHROPIC_PROBE_FAILURE_TTL_MS = 60 * 1000;

let probeCache: { at: number; result: AnthropicCheckResult } | null = null;

/** Test hook: forget the memoised probe. */
export function clearAnthropicProbeCache(): void {
  probeCache = null;
}

function untilText(seconds: number, now: number): string {
  return `until ${new Date(now + seconds * 1000).toISOString()}`;
}

/** One-token Messages call; classifies a failure with availability.ts. Not memoised. */
export async function probeAnthropicGeneration(
  key: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<AnthropicCheckResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: CONTRACT_GENERATION_MODEL,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
      signal: controller.signal,
    });
    const latency_ms = Date.now() - start;
    if (res.ok) return { status: 'ok', latency_ms, detail: 'generation probe ok' };

    let message = '';
    try {
      const body = await res.json();
      message = typeof body?.error?.message === 'string' ? body.error.message : '';
    } catch {
      // non-JSON body: classify on the status alone
    }
    const failure = classifyGenerationError({ status: res.status, message }, now);
    if (failure.unavailable) {
      // Arm the guard too, so the doors stop before touching payments.
      markProviderUnavailable(failure.retryAfterSeconds, now);
      return {
        status: 'degraded',
        latency_ms,
        detail: `usage limit reached, generation unavailable ${untilText(failure.retryAfterSeconds, now)}`,
      };
    }
    return { status: 'degraded', latency_ms, detail: `generation probe HTTP ${res.status}` };
  } catch (e) {
    const aborted = controller.signal.aborted;
    return { status: 'down', detail: aborted ? 'timeout' : e instanceof Error ? e.message : 'unknown' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The anthropic health entry. A recorded outage (the guard in availability.ts)
 * wins without spending a token; otherwise the probe runs at most once per
 * `ANTHROPIC_PROBE_TTL_MS` per instance (a failure for `ANTHROPIC_PROBE_FAILURE_TTL_MS`),
 * and an admin call (`fresh`) asks afresh.
 */
export async function checkAnthropicGeneration(
  key: string | undefined,
  timeoutMs: number,
  fresh = false,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<AnthropicCheckResult> {
  if (!key) return { status: 'down', detail: 'no API key configured' };
  const outage = getProviderUnavailableSeconds(now);
  if (outage !== null) {
    return {
      status: 'degraded',
      detail: `generation unavailable ${untilText(outage, now)} (provider usage limit)`,
    };
  }
  if (!fresh && probeCache) {
    const ttl = probeCache.result.status === 'ok' ? ANTHROPIC_PROBE_TTL_MS : ANTHROPIC_PROBE_FAILURE_TTL_MS;
    if (now - probeCache.at < ttl) return probeCache.result;
  }
  const result = await probeAnthropicGeneration(key, timeoutMs, fetchImpl, now);
  probeCache = { at: now, result };
  return result;
}
