/**
 * Provider-neutral types for the Ambr Agent chat surface.
 *
 * The chat route doesn't care whether the underlying LLM is Claude or Kimi —
 * it talks to `callChat()` which returns a UnifiedLLMResponse. Per-provider
 * adapters live in ./anthropic.ts and ./moonshot.ts and translate to/from
 * their native SDK shapes.
 *
 * Tool-choice values are deliberately limited to what BOTH providers accept:
 *   - 'auto'      → model decides whether to use a tool or reply with text
 *   - 'required'  → model must use one of the provided tools (Anthropic only;
 *                   Moonshot treats this as 'auto' since K2.6 only supports
 *                   'auto' and 'none')
 *   - { name }    → model must use the named specific tool (Anthropic only;
 *                   Moonshot falls back to 'auto')
 *
 * The router downgrades unsupported tool_choice values rather than throwing,
 * keeping the call site simple.
 */

export type ProviderName = 'anthropic' | 'moonshot';

export interface UnifiedTool {
  name: string;
  description: string;
  // JSON Schema for the tool input. Anthropic calls this `input_schema`;
  // OpenAI/Moonshot calls it `parameters`. We use Anthropic's name since
  // that's what our existing tool specs (CHAT_CLASSIFIER_TOOL, CHAT_ASK_TOOL)
  // already declare.
  input_schema: Record<string, unknown>;
}

export type UnifiedToolChoice = 'auto' | 'required' | { name: string };

export interface UnifiedToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface UnifiedLLMResponse {
  // Exactly one of toolCall OR textReply will be non-null.
  toolCall: UnifiedToolCall | null;
  textReply: string | null;
  usage: {
    input_tokens: number | null;
    output_tokens: number | null;
    /**
     * Input tokens served from the provider's prompt cache.
     * - Moonshot: auto-caches the system-prompt prefix on consecutive requests
     *   with the same content; reports `usage.cached_tokens` in the response.
     * - Anthropic: returns cache stats when explicit `cache_control` markers
     *   are used (not yet wired here).
     * Null when the provider doesn't report it.
     * Verifying this > 0 in chat_usage confirms the system-prompt cache is
     * actually hitting (75% cheaper input + lower latency on cache hits).
     */
    cached_tokens: number | null;
  };
  modelUsed: string;
  providerUsed: ProviderName;
  /**
   * True when the provider stopped because max_tokens was hit (truncated reply).
   * Both Moonshot (`finish_reason === 'length'`) and Anthropic
   * (`stop_reason === 'max_tokens'`) signal this when the model ran out of
   * output budget mid-stream. Callers should treat truncated text as
   * unreliable and surface a friendly retry message rather than the cut-off
   * prose.
   */
  truncated?: boolean;
  /**
   * Wall-clock duration of the underlying API call in ms (post-aborted timer).
   * Set by each adapter from a monotonic timestamp wrapping the fetch/SDK call.
   * Used by chat_usage.duration_ms for p50/p95 latency monitoring and by
   * callChatWithFallback() to attribute time to each attempted provider.
   */
  durationMs?: number;
  /**
   * True when this response came from the FALLBACK provider after the primary
   * threw. Set by callChatWithFallback() — adapters never set this themselves.
   * Surfaces to chat_usage.fallback_used so we can monitor how often the
   * fallback path rescues a turn from the "I hit a snag" message.
   */
  usedFallback?: boolean;
}

export interface CallChatParams {
  model: string;
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  tools: UnifiedTool[];
  toolChoice: UnifiedToolChoice;
  maxTokens?: number;
  /**
   * OpenAI-style structured-output hint. Honored by Moonshot
   * (`response_format: { type: 'json_object' }`) — forces Kimi to emit a valid
   * JSON object as the entire response (per Moonshot's JSON mode docs).
   * Ignored by Anthropic, which uses the tools mechanism for structured output.
   * Set this on surfaces where reliable JSON output matters more than free-form
   * conversational replies (e.g. contract generation on Kimi where tool_use is
   * unreliable).
   */
  responseFormat?: { type: 'json_object' | 'text' };
  /**
   * Hard per-call timeout in ms. Must be set BELOW the calling route's Vercel
   * maxDuration so the adapter's fetch aborts in time for the route's try/catch
   * to return a graceful JSON error — otherwise Vercel kills the entire function
   * and the client gets an HTML 504 page (which we then parse as JSON and fail
   * with "Server returned an unexpected response").
   *
   * Adapters wrap their underlying fetch/SDK call in an AbortController and
   * throw an Error with `name: 'AbortError'` when the deadline trips.
   *
   * Defaults: 45_000ms when omitted (sane floor for the 60s chat route; bump
   * higher from the contract-gen path which has a 300s maxDuration).
   */
  timeoutMs?: number;
}
