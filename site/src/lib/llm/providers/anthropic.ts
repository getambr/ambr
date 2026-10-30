/**
 * Anthropic adapter — wraps @anthropic-ai/sdk to expose the UnifiedLLMResponse
 * shape used by the chat router.
 *
 * This is the original implementation lifted out of the chat route, refactored
 * to a single callAnthropic() entry point. The Anthropic SDK is also still
 * imported elsewhere (contract-engine.ts uses it directly for Ricardian text
 * generation) — we don't break that path, we just add an adapter for chat.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  CallChatParams,
  UnifiedLLMResponse,
  UnifiedToolChoice,
} from './types';

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return _client;
}

function mapToolChoice(choice: UnifiedToolChoice): { type: 'auto' } | { type: 'any' } | { type: 'tool'; name: string } {
  if (choice === 'auto') return { type: 'auto' };
  if (choice === 'required') return { type: 'any' };
  return { type: 'tool', name: choice.name };
}

export async function callAnthropic(params: CallChatParams): Promise<UnifiedLLMResponse> {
  const client = getClient();
  // Per-call timeout. Mirrors the Moonshot adapter so both providers fail in
  // a controlled window before Vercel's maxDuration kill. The Anthropic SDK
  // exposes a `timeout` option (ms) in the request-options arg; it raises an
  // APIConnectionTimeoutError that we re-throw as a recognisable Error so the
  // route's catch path can render the friendly fallback message.
  const fetchTimeoutMs = params.timeoutMs ?? 45_000;
  const startedAt = Date.now();
  let response;
  try {
    response = await client.messages.create(
      {
        model: params.model,
        max_tokens: params.maxTokens ?? 1024,
        // Sonnet 5 defaults to ADAPTIVE thinking when `thinking` is omitted, which would
        // add latency + output tokens to every interactive classifier turn, so it gets an
        // explicit disable. Fable 5/5.1 reject that disable with a 400 (thinking is always
        // on there), so they are deliberately left out of this match.
        ...(/^claude-sonnet-5/.test(params.model)
          ? { thinking: { type: 'disabled' as const } }
          : {}),
        system: params.system,
        messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
        tools: params.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema as Anthropic.Tool.InputSchema,
        })),
        tool_choice: mapToolChoice(params.toolChoice),
      },
      { timeout: fetchTimeoutMs },
    );
  } catch (err) {
    // Classify Anthropic SDK errors with the same .code tags Moonshot uses
    // so callChatWithFallback() can apply uniform retry policy across providers.
    // - APIConnectionTimeoutError / AbortError → TIMEOUT
    // - status 429 → RATE_LIMIT
    // - status 5xx → UPSTREAM_5XX
    // - status 401 → AUTH (don't retry — likely missing key, fallback would
    //   fail for the same reason)
    const e = err as Error & { status?: number };
    const name = e.name;
    const msg = e.message ?? '';
    // Anthropic returns 400 with "Your credit balance is too low" when the
    // account runs out of pay-as-you-go credit. That's not a transient
    // error and not a programming bug — it's an OPERATIONAL billing
    // problem that needs human action (top up the account). Tag it
    // distinctly so the wrapper doesn't try to recover via retry and the
    // user-facing message can name the specific cause.
    // The monthly spend cap answers the same way ("You have reached your
    // specified API usage limits. You will regain access on <date>"); keep that
    // message so lib/llm/availability.ts can read the regain-access time.
    const isUsageLimit = e.status === 400 && /reached your specified API usage limits/i.test(msg);
    const isBillingExhausted = e.status === 400 && /credit balance is too low/i.test(msg);
    let wrapped: Error & { code?: string };
    if (isUsageLimit) {
      wrapped = new Error(`Anthropic 400: ${msg}`) as Error & { code?: string };
      wrapped.code = 'BILLING_EXHAUSTED';
    } else if (isBillingExhausted) {
      wrapped = new Error(`Anthropic 400: credit balance too low — top up at console.anthropic.com`) as Error & { code?: string };
      wrapped.code = 'BILLING_EXHAUSTED';
    } else if (name === 'APIConnectionTimeoutError' || name === 'AbortError') {
      wrapped = new Error(
        `Anthropic request exceeded ${fetchTimeoutMs}ms — aborted to keep Vercel function alive`,
      ) as Error & { code?: string };
      wrapped.code = 'TIMEOUT';
    } else if (e.status === 429) {
      wrapped = new Error(`Anthropic 429: ${msg ?? 'rate-limited'}`) as Error & { code?: string };
      wrapped.code = 'RATE_LIMIT';
    } else if (e.status && e.status >= 500) {
      wrapped = new Error(`Anthropic ${e.status}: ${msg ?? 'upstream error'}`) as Error & { code?: string };
      wrapped.code = 'UPSTREAM_5XX';
    } else if (e.status === 401) {
      wrapped = new Error(`Anthropic 401: ${msg ?? 'auth failed'}`) as Error & { code?: string };
      wrapped.code = 'AUTH';
    } else {
      throw err; // unclassified — let the route's catch path log untagged
    }
    throw wrapped;
  }

  const toolBlock = response.content.find((b) => b.type === 'tool_use');
  const textBlock = response.content.find((b) => b.type === 'text');

  return {
    toolCall:
      toolBlock && toolBlock.type === 'tool_use'
        ? { name: toolBlock.name, input: (toolBlock.input as Record<string, unknown>) ?? {} }
        : null,
    textReply: !toolBlock && textBlock && textBlock.type === 'text' ? textBlock.text : null,
    usage: {
      input_tokens: response.usage?.input_tokens ?? null,
      output_tokens: response.usage?.output_tokens ?? null,
      // Anthropic exposes cache_read_input_tokens when explicit cache_control
      // markers are used on the system message. Not yet wired here — we'd add
      // `cache_control: { type: 'ephemeral' }` on the system block if/when
      // Anthropic returns to being a primary path. Reporting null keeps the
      // chat_usage column accurate (only Moonshot caching is active).
      cached_tokens: (response.usage as { cache_read_input_tokens?: number })?.cache_read_input_tokens ?? null,
    },
    modelUsed: response.model,
    providerUsed: 'anthropic',
    // Anthropic signals max_tokens-truncated outputs with stop_reason='max_tokens'.
    // Mirrors moonshot.ts so handleDeploy can render a friendly retry message.
    truncated: response.stop_reason === 'max_tokens',
    durationMs: Date.now() - startedAt,
  };
}
