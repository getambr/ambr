/**
 * Moonshot adapter — talks to https://api.moonshot.ai/v1/chat/completions
 * using the OpenAI-compatible function-calling format.
 *
 * No SDK dependency. We use `fetch` directly to stay lightweight and avoid
 * pulling in `openai` just for one endpoint. Auth via `MOONSHOT_API_KEY`.
 *
 * Translation contract:
 *   - UnifiedTool {name, description, input_schema}
 *     → OpenAI {type:'function', function:{name, description, parameters}}
 *   - UnifiedToolChoice 'auto'    → "auto"
 *   - UnifiedToolChoice 'required'→ "auto"  (K2.6 only supports auto/none; downgrade gracefully)
 *   - UnifiedToolChoice {name}    → "auto"  (same — K2.6 can't force-specific)
 *   - response.choices[0].message.tool_calls[0] → UnifiedToolCall
 *   - response.choices[0].message.content (when no tool_calls) → textReply
 *
 * Per Moonshot docs (verified 2026-05): kimi-k2.6 base URL is the .ai endpoint,
 * NOT the .cn one. Pricing $0.16/M input cache-hit, $0.95/M
 * input cache-miss, $4/M output.
 */

import type {
  CallChatParams,
  UnifiedLLMResponse,
  UnifiedToolChoice,
} from './types';

const MOONSHOT_BASE_URL = 'https://api.moonshot.ai/v1';

// Kimi K2.6 only accepts 'auto' or 'none' for tool_choice. We downgrade any
// stronger constraint to 'auto' rather than failing — the system prompt has
// already done the tool-selection steering and 'auto' aligns with how the
// Anthropic side ended up working too.
function mapToolChoice(choice: UnifiedToolChoice): 'auto' | 'none' {
  if (choice === 'auto') return 'auto';
  // 'required' and { name } both degrade to 'auto' on Moonshot
  return 'auto';
}

interface MoonshotToolCall {
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
}

interface MoonshotMessage {
  role?: string;
  content?: string | null;
  tool_calls?: MoonshotToolCall[];
  // K2.6 auto-enables thinking mode for complex tasks. When that happens the
  // model's actual output lands in `reasoning_content` and `content` is empty.
  // We read it as a fallback so contract-gen doesn't see "empty response" when
  // Kimi was actually thinking + producing output the whole time.
  reasoning_content?: string | null;
  refusal?: string | null;
}

interface MoonshotResponse {
  id?: string;
  model?: string;
  choices?: Array<{
    index?: number;
    message?: MoonshotMessage;
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    /**
     * Number of input tokens served from Moonshot's automatic context cache.
     * Per platform.kimi.ai docs, the API auto-caches the system-prompt
     * prefix when the same content is sent in consecutive requests. The
     * cached_tokens count is included in the usage object on cache hits;
     * pricing is ~75% lower for cached vs uncached input tokens.
     */
    cached_tokens?: number;
  };
}

export async function callMoonshot(params: CallChatParams): Promise<UnifiedLLMResponse> {
  const apiKey = process.env.MOONSHOT_API_KEY;
  if (!apiKey) {
    throw new Error('MOONSHOT_API_KEY is not configured');
  }

  // Prepend the system message to the messages array (OpenAI convention)
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: params.system },
    ...params.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  // JSON mode and tool_use are mutually exclusive paths on Moonshot.
  // When the caller asked for JSON mode (response_format = json_object),
  // we DROP tools + tool_choice from the request. Sending all three at once
  // appears to cause Kimi to return empty content with no tool_calls and no
  // text — Moonshot silently ignores response_format when tools is present.
  // Pure JSON-mode call is what Moonshot's own examples show.
  // No temperature override — Kimi K2.6 only accepts temperature=1 (verified
  // 2026-05-18: "invalid temperature: only 1 is allowed for this model").
  const jsonMode = params.responseFormat?.type === 'json_object';

  const body = {
    model: params.model,
    messages,
    max_tokens: params.maxTokens ?? 1024,
    // Disable Kimi K2.6 thinking mode UNCONDITIONALLY. Per Moonshot docs
    // (verified 2026-05-18): K2.6 supports `thinking: {type: 'enabled' |
    // 'disabled'}`. Default is ENABLED, which means the model burns
    // chain-of-thought tokens before producing the actual response —
    // unbounded latency (30-45s+) and token-budget exhaustion in our
    // experience.
    //
    // CHANGE 2026-05-26 (evening): Previously we left thinking at default
    // for chat (jsonMode=false), believing the classifier would benefit
    // from K2.6's reasoning. Production chat_usage proved otherwise — the
    // 50% timeout rate observed all morning + the consistent 30-45s wait
    // times during evening tests are caused by thinking-mode latency, not
    // Moonshot capacity. The classifier doesn't need chain-of-thought; the
    // tool schema + the explicit system prompt already tell it exactly
    // what to extract. Disabling thinking drops p95 latency from "30-45s
    // outliers" to the documented "4-12s typical, 30s outlier" range
    // (per the same moonshot.ts timeout comment below).
    //
    // Old behaviour preserved via env override `KIMI_THINKING_ENABLED=true`
    // if we ever want to A/B compare without redeploying.
    thinking: {
      type: process.env.KIMI_THINKING_ENABLED === 'true'
        ? ('enabled' as const)
        : ('disabled' as const),
    },
    ...(jsonMode
      ? { response_format: params.responseFormat }
      : {
          tools: params.tools.map((t) => ({
            type: 'function' as const,
            function: {
              name: t.name,
              description: t.description,
              parameters: t.input_schema,
            },
          })),
          tool_choice: mapToolChoice(params.toolChoice),
        }),
  };

  // Hard timeout BELOW the calling route's Vercel maxDuration so the route
  // gets control back in time to return graceful JSON instead of being killed
  // mid-request (which produces an HTML 504 the client can't parse). 45s is
  // the floor for the 60s chat route; contract gen (300s maxDuration) passes
  // a larger timeoutMs. Cold Kimi calls in JSON mode with thinking disabled
  // typically land in 4–12s; outliers up to 30s. Anything past 45s is dead
  // weight — better to bail and let the user retry than wait to be axed.
  //
  // With provider-fallback enabled (2026-05-26), the chat route now passes a
  // tighter 25s primary timeout so there's budget left for the Anthropic
  // fallback attempt inside the 60s Vercel ceiling.
  const fetchTimeoutMs = params.timeoutMs ?? 45_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), fetchTimeoutMs);

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(`${MOONSHOT_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      const wrapped = new Error(
        `Moonshot request exceeded ${fetchTimeoutMs}ms — aborted to keep Vercel function alive`,
      );
      // Tag the error so callChatWithFallback() can classify it as transient
      // without string-matching the message text. errClass stays 'Error' but
      // a `.code` property survives JSON-stringification into chat_usage.
      (wrapped as Error & { code?: string }).code = 'TIMEOUT';
      throw wrapped;
    }
    // Network/DNS failures fall through with their original message; the
    // fallback wrapper treats any non-tagged Error as potentially-transient.
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    const wrapped = new Error(`Moonshot ${response.status}: ${errorText.slice(0, 400)}`);
    // 429 → rate-limit; 5xx → upstream broken. Both are transient and the
    // fallback wrapper should retry on the secondary provider. 4xx other than
    // 429 (e.g. 400 bad request, 401 auth) is a programming error and should
    // NOT be retried on Anthropic — same payload would fail validation there.
    // 402 / "insufficient balance" / "out of credits" patterns are billing-
    // exhausted (parity with Anthropic). Tag distinctly so the wrapper doesn't
    // retry and the user gets a specific message.
    const isBillingExhausted =
      response.status === 402 ||
      /insufficient (balance|funds|credit)/i.test(errorText) ||
      /out of credits?/i.test(errorText) ||
      /quota exceeded/i.test(errorText);
    const code =
      isBillingExhausted ? 'BILLING_EXHAUSTED'
      : response.status === 429 ? 'RATE_LIMIT'
      : response.status >= 500 ? 'UPSTREAM_5XX'
      : response.status === 401 ? 'AUTH'
      : response.status === 400 ? 'BAD_REQUEST'
      : 'HTTP_ERROR';
    (wrapped as Error & { code?: string }).code = code;
    throw wrapped;
  }

  const data = (await response.json()) as MoonshotResponse;
  const choice = data.choices?.[0];
  const message = choice?.message;

  if (!message) {
    throw new Error('Moonshot response missing message');
  }

  // Moonshot signals max_tokens-truncated outputs with finish_reason='length'.
  // We surface it so handleDeploy can swap the cut-off prose for a friendly
  // retry message instead of confusing the user with mid-sentence garbage.
  const truncated = choice?.finish_reason === 'length';

  const toolCall = message.tool_calls?.[0];
  if (toolCall && toolCall.function?.name) {
    let parsedInput: Record<string, unknown> = {};
    try {
      parsedInput = JSON.parse(toolCall.function.arguments ?? '{}');
    } catch {
      // Moonshot occasionally emits non-JSON for badly-formed schemas; treat
      // as empty input and let the downstream validators handle it.
      parsedInput = {};
    }

    return {
      toolCall: {
        name: toolCall.function.name,
        input: parsedInput,
      },
      textReply: null,
      usage: {
        input_tokens: data.usage?.prompt_tokens ?? null,
        output_tokens: data.usage?.completion_tokens ?? null,
        cached_tokens: data.usage?.cached_tokens ?? null,
      },
      modelUsed: data.model ?? params.model,
      providerUsed: 'moonshot',
      truncated,
      durationMs: Date.now() - startedAt,
    };
  }

  // Plain-text response (no tool call) — analogous to Anthropic's text-only path.
  // Fall back through content → reasoning_content → refusal so a thinking-mode
  // response or a content-filter rejection doesn't look like empty output to
  // the caller. The downstream JSON-text fallback in generate-contract.ts can
  // then try to parse whichever field actually contained the JSON.
  const textReply =
    (typeof message.content === 'string' && message.content) ||
    (typeof message.reasoning_content === 'string' && message.reasoning_content) ||
    (typeof message.refusal === 'string' && message.refusal) ||
    '';
  return {
    toolCall: null,
    textReply,
    usage: {
      input_tokens: data.usage?.prompt_tokens ?? null,
      output_tokens: data.usage?.completion_tokens ?? null,
      cached_tokens: data.usage?.cached_tokens ?? null,
    },
    modelUsed: data.model ?? params.model,
    providerUsed: 'moonshot',
    truncated,
    durationMs: Date.now() - startedAt,
  };
}
