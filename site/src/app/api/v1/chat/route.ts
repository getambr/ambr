import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { z } from 'zod';
import { getChatDeployModel, getChatAskModel } from '@/lib/llm/models';
import {
  CHAT_DEPLOY_PROMPT,
  CHAT_CLASSIFIER_TOOL,
  CHAT_ASK_PROMPT,
  CHAT_ASK_TOOL,
} from '@/lib/llm/prompts';
import { callChat, callChatWithFallback, type UnifiedTool } from '@/lib/llm/providers';
import { normalizeCoolingOff } from '@/lib/jurisdiction/cooling-off';
import { validateApiKey, type ApiKeyContext } from '@/lib/api-auth';
import { checkBetaAccess } from '@/lib/auth/beta-access';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { corsOptions, withCors } from '@/lib/cors';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { estimateCostUsd, isBudgetExhausted } from '@/lib/llm/chat-budget';
import { inferExplicitTemplate, notReadyQuestion } from '@/lib/deploy/infer-template';
import { mergeClassifiedTurn } from '@/lib/deploy/chat-turn';
import { CAPS_OFFER_MESSAGE, shouldOfferCaps } from '@/lib/deploy/optional-limits';
import { applyStatedWallets } from '@/lib/deploy/wallet-intent';

// 60s timeout — Kimi K2.6 multi-turn extractions with 2K+ input tokens can
// run 25–40s. The prior 30s cap was occasionally timing out chat turns and
// surfacing "Unexpected token 'A'..." JSON parse errors to the client.
export const maxDuration = 60;

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(8000),
  // True for a user-role message the assistant wrote (the intent handed over
  // from the global agent). Its words are never read as the user's statements.
  fromModel: z.boolean().optional(),
});

const requestSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('deploy'),
    messages: z.array(messageSchema).min(1).max(80),
    extracted_params: z.record(z.string(), z.unknown()).nullable().optional(),
    template: z.string().nullable().optional(),
    // Fields set via explicit UI controls (WalletFieldControl, etc.). These
    // beat LLM extraction — the server preserves the user-supplied value
    // even if Kimi returns a different one for the same key. Prevents the
    // 2026-05-26 "user types 'this same', Kimi extracts wrong wallet,
    // user's explicit choice gets clobbered" class of bugs.
    confirmed_fields: z.array(z.string()).optional(),
  }),
  z.object({
    mode: z.literal('ask'),
    messages: z.array(messageSchema).min(1).max(80),
    context: z.object({
      wallet: z.string().nullable().optional(),
      tier: z.string().nullable().optional(),
      nft_count: z.number().optional(),
      pending_actions: z.number().optional(),
    }).nullable().optional(),
  }),
]);

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_MS = 60 * 1000;

/**
 * Context-window capacity per model — used by the client-side token chip to
 * render `12.4k / 128k` progress. Keep in sync with model docs; if a model
 * isn't listed, falls back to 128k (safest lower bound for our active set).
 */
function contextWindowMax(modelId: string): number {
  if (modelId.startsWith('kimi-')) return 128_000;
  if (modelId.includes('sonnet') || modelId.includes('haiku') || modelId.includes('opus')) return 200_000;
  return 128_000;
}

/**
 * Build the `usage` block returned to the client on every chat response.
 * Lets the client maintain a session-cumulative token counter + cost chip
 * without re-deriving from logs. All fields nullable when the provider
 * didn't report them (rare — both Moonshot and Anthropic always include).
 */
function usageBlock(
  inTok: number | null,
  outTok: number | null,
  costUsd: number | null,
  modelUsed: string,
) {
  return {
    turn_input_tokens: inTok,
    turn_output_tokens: outTok,
    turn_cost_usd: costUsd,
    model: modelUsed,
    context_window_max: contextWindowMax(modelUsed),
  };
}
// Bumped 50→500 for the beta-testing window (2026-05-25).
// AMBR_AGENT_DAILY_USD_CAP remains the absolute guardrail.
const FREE_TIER_DAILY = 500;
const PAID_TIER_BURST = 50;
const LARGE_VALUE_USD_THRESHOLD = 10_000;

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?previous/i,
  /override\s+(system|previous|above)/i,
  /system\s*:\s*/i,
  /forget\s+(everything|your\s+instructions)/i,
  /\brole\s*:\s*system\b/i,
  /\bpretend\s+(to\s+be|you\s+are)\b/i,
];

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

const V1_REQUIRED_FIELDS: Record<string, string[]> = {
  'a1-service-purchase': ['consumer_name', 'consumer_email', 'provider_name', 'provider_agent_id', 'service_description', 'fee', 'currency', 'delivery_timeline', 'refund_policy', 'governing_law'],
  // d1 template schema requires `agent_type` (enum: autonomous|supervised|semi-autonomous)
  // — synced with templates.parameter_schema.required in the DB.
  'd1-general-auth': ['principal_name', 'principal_type', 'principal_registration_number', 'principal_address', 'agent_id', 'agent_type', 'scope', 'categories', 'spending_limit_per_tx', 'spending_limit_monthly', 'duration_months', 'governing_law'],
  'c1-api-access': ['buyer_name', 'buyer_agent_id', 'seller_name', 'api_endpoint', 'pricing_model', 'price_per_call', 'currency', 'sla_uptime_percent', 'governing_law'],
  // p2 = one-sided power of attorney. Mirrors d1 minus categories +
  // spending_limit_* (those are optional here — POA is broader than a
  // capped delegation). Synced with templates.parameter_schema.required
  // in migration 20260526180000_p2_power_of_attorney.sql.
  'p2-power-of-attorney': ['principal_name', 'principal_type', 'principal_registration_number', 'principal_address', 'agent_id', 'agent_type', 'scope', 'duration_months', 'governing_law'],
  // c3 = Task Execution, surfaced to users as "A2A — Agent-to-Agent". Two agents
  // transact: a requester engages an executor for a deliverable, payment on
  // completion. Synced with templates.parameter_schema.required for c3.
  'c3-task-execution': ['requester_name', 'requester_agent_id', 'executor_name', 'executor_agent_id', 'task_description', 'deliverables', 'acceptance_criteria', 'total_price', 'currency', 'deadline', 'governing_law'],
};

// Plain-English labels for D1 fields. Used by the next_question override
// (handleDeploy classify_and_extract branch) to ask about the actually-missing
// field in human terms — Kimi sometimes asks about a different field that's
// already filled (visually-salient wallets > abstract registration_number).
// Mirrors the preview pane's hint text where possible. (2026-05-26 test)
const D1_FIELD_LABELS: Record<string, string> = {
  principal_name: "the Authorizer's full name",
  principal_type: "whether the Authorizer is an individual or a company",
  principal_registration_number: "the Authorizer's registration number (national ID for individuals; company registration number for businesses)",
  principal_address: "the Authorizer's legal address",
  agent_id: "the AI agent's wallet — a separate address on Base L2 from your own",
  agent_type: "the agent type (autonomous, supervised, or semi-autonomous)",
  scope: "what the agent is allowed to do",
  categories: "the allowed activity categories (comma-separated)",
  spending_limit_per_tx: "the per-transaction spending limit",
  spending_limit_monthly: "the monthly spending cap",
  duration_months: "how many months the authorization is valid for",
  governing_law: "the governing jurisdiction (e.g. EU, Singapore, US, Latvia)",
};

// P2 reuses all D1's overlapping field labels verbatim — the principal/agent
// identification + scope/duration/governing_law copy is identical. P2 doesn't
// expose categories or spending limits as required, so those rows from D1
// simply never get asked. Kept as a separate constant for explicitness so a
// future divergence (e.g. POA-specific "scope" wording) is a one-line edit.
const P2_FIELD_LABELS: Record<string, string> = D1_FIELD_LABELS;

// A2A (c3-task-execution) — two agents transact. Friendly labels so the
// next-question override asks in human terms (mirrors the preview hints).
const C3_FIELD_LABELS: Record<string, string> = {
  requester_name: "the requester's name (who's commissioning the task)",
  requester_agent_id: "the requester agent's wallet (0x… on Base L2)",
  executor_name: "the executor's name (the agent doing the work)",
  executor_agent_id: "the executor agent's wallet (0x… on Base L2)",
  task_description: "what the task is",
  deliverables: "the deliverables (what the executor must produce)",
  acceptance_criteria: "how the deliverables will be judged complete",
  total_price: "the total price",
  currency: "the currency (USD, USDC, EUR…)",
  deadline: "the deadline",
  governing_law: "the governing jurisdiction (e.g. EU, Singapore, US, Latvia)",
};

/** Resolve a friendly label for `field` under the current template. Returns
 *  null when the template doesn't have a label map, so the caller can fall
 *  back to its underscore-to-space heuristic. */
function getFieldLabel(template: string | null | undefined, field: string): string | null {
  if (template === 'd1-general-auth') return D1_FIELD_LABELS[field] ?? null;
  if (template === 'p2-power-of-attorney') return P2_FIELD_LABELS[field] ?? null;
  if (template === 'c3-task-execution') return C3_FIELD_LABELS[field] ?? null;
  return null;
}

function sanitizeMessage(content: string): string {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      throw new Error(
        'Your message contains an instruction-override pattern that Ambr Agent does not accept. Please rephrase as a contract request.',
      );
    }
  }
  return content.slice(0, 8000);
}

function identityHash(apiKeyId: string | null, ip: string): string {
  return createHash('sha256').update(`${apiKeyId ?? 'anon'}|${ip}`).digest('hex').slice(0, 32);
}

interface UsageLog {
  mode: 'deploy' | 'ask';
  identity_hash: string;
  api_key_id: string | null;
  message_count: number;
  total_input_chars: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  model: string;
  status: 'ok' | 'rate_limited' | 'budget_exhausted' | 'injection_blocked' | 'llm_error' | 'validation_error' | 'access_denied';
  error_code: string | null;
  /**
   * Wall-clock duration in ms of the LLM call (sum across primary + fallback
   * if the wrapper retried). Added 2026-05-26 to monitor Kimi p95 + verify
   * the provider-fallback path stays within Vercel's 60s ceiling.
   */
  duration_ms?: number | null;
  /**
   * True when the primary provider failed and the secondary rescued this turn.
   * Lets us track: status=ok + fallback_used=true means user didn't see "I hit
   * a snag" because the auto-fallback succeeded transparently.
   */
  fallback_used?: boolean;
  /**
   * Input tokens served from the provider's prompt cache. cached_tokens /
   * input_tokens = cache-hit ratio. Moonshot reports this automatically when
   * the system-prompt prefix matches a prior request; >0 confirms caching is
   * actually working in prod. Null when the provider doesn't report it.
   */
  cached_tokens?: number | null;
}

async function recordUsage(row: UsageLog): Promise<void> {
  try {
    const db = getSupabaseAdmin();
    await db.from('chat_usage').insert(row);
  } catch {
    // Fail-open: never let logging break the chat endpoint.
  }
}

// Server-side validation: even if the LLM claims ready_to_deploy=true, we
// re-validate before passing the claim back to the client. The client's
// Deploy button gates on this flag, so if Haiku/Sonnet were hijacked into
// claiming readiness on a contract that's actually missing fields, the
// server would catch it.
function validateReadyState(
  template: string | null | undefined,
  extracted: Record<string, unknown>,
): { ready: boolean; missing: string[]; warnings: string[] } {
  if (!template || !V1_REQUIRED_FIELDS[template]) {
    // Empty warnings array — the "unknown template" state is captured by
    // ready=false + missing=[] which the caller already uses to gate the
    // Deploy button and show the template-picker chips. Previously this
    // emitted 'unknown template — cannot validate' which the client now
    // surfaces as a ⚠ chat bubble (added 2026-05-26 for D1 agent_id and
    // cooling-off warnings). That bubble was confusing in mid-flow when
    // bug B nulled the template on a low-confidence turn — user saw
    // "unknown template" while their D1 preview was 10/11 filled.
    // Reported in testing 2026-05-26.
    return { ready: false, missing: [], warnings: [] };
  }
  const required = V1_REQUIRED_FIELDS[template];
  const missing = required.filter((k) => {
    const v = extracted[k];
    return v === null || v === undefined || v === '';
  });

  const warnings: string[] = [];

  // D1-only bilateral guard: the AGENT being authorized MUST be a different
  // wallet from the PRINCIPAL. Both equal → meaningless self-authorization
  // for a BILATERAL delegation (D1 expects an agent with its own key that
  // signs as counterparty). For P2 (one-sided POA), same-wallet IS allowed
  // — the common case is a user delegating their LOCAL AI agent which signs
  // from the principal's wallet; the contract is a public scope declaration
  // rather than a true POA. Rule scope corrected 2026-05-27 once the
  // same-wallet use case was clarified.
  if (template === 'd1-general-auth') {
    const agentId = (extracted.agent_id as string | undefined)?.toLowerCase();
    const principalId = (extracted.principal_agent_id as string | undefined)?.toLowerCase();
    if (agentId && principalId && agentId === principalId) {
      if (!missing.includes('agent_id')) missing.push('agent_id');
      warnings.push(
        `Agent wallet must be a SEPARATE wallet from your Authorizer wallet (${principalId}). ` +
        `D1 Delegation is bilateral — it authorizes an AI agent with its own wallet to act on your ` +
        `behalf. If you want to declare scope for an AI running on YOUR wallet, use P2 ` +
        `Power of Attorney instead (one-sided, same wallet is fine).`
      );
    }
  }

  // Wallet shape validation — anything claimed as agent_id / *_agent_id must look like 0x + 40 hex.
  for (const k of ['agent_id', 'provider_agent_id', 'buyer_agent_id']) {
    const v = extracted[k];
    if (typeof v === 'string' && v && !WALLET_RE.test(v)) {
      missing.push(k);
      warnings.push(`${k} must be a valid Ethereum address (0x + 40 hex chars)`);
    }
  }

  return { ready: missing.length === 0, missing, warnings };
}

function highValueConfirmationNeeded(extracted: Record<string, unknown>): { needed: boolean; field?: string; value?: number } {
  for (const k of ['spending_limit_monthly', 'spending_limit_per_tx', 'total_price', 'monthly_fee', 'fee', 'budget_usd', 'shared_budget_monthly']) {
    const v = extracted[k];
    if (v !== undefined && v !== null && v !== '') {
      const n = Number(v);
      if (Number.isFinite(n) && n >= LARGE_VALUE_USD_THRESHOLD) {
        return { needed: true, field: k, value: n };
      }
    }
  }
  return { needed: false };
}

/**
 * Shared readiness check used by every handleDeploy branch (text_reply,
 * answer_question, classify_and_extract). Without this, the text_reply and
 * answer_question branches were returning hardcoded `ready_to_deploy: false`,
 * which the client wrote into its state and used to disable the Deploy button.
 * Result: every chat turn after a successful classify silently re-locked Deploy
 * even though the params object was still fully populated server-side.
 * Computes readiness purely from the params the client passed back this turn.
 */
function computeReadyFromExisting(
  template: string | null,
  extracted: Record<string, unknown>,
): boolean {
  if (!template) return false;
  const v = validateReadyState(template, extracted);
  const hv = highValueConfirmationNeeded(extracted);
  return v.ready && !hv.needed;
}

/** Mirror of computeReadyFromExisting for the missing-fields list. */
function deriveMissing(
  template: string | null,
  extracted: Record<string, unknown>,
): string[] {
  if (!template) return [];
  return validateReadyState(template, extracted).missing;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return withCors(
      NextResponse.json({ error: 'bad_request', message: 'Invalid JSON body' }, { status: 400 }),
      request,
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    // Build a human-readable summary of the first 3 issues so the client can
    // surface it in the chat UI instead of a generic "Chat failed".
    const summary = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join(' · ');
    return withCors(
      NextResponse.json(
        {
          error: 'validation_error',
          message: `Request did not match the expected shape — ${summary}`,
          details: parsed.error.issues,
        },
        { status: 400 },
      ),
      request,
    );
  }

  const { mode, messages } = parsed.data;

  // Sanitize user messages — injection patterns
  let sanitizedMessages;
  try {
    sanitizedMessages = messages.map((m) => ({
      role: m.role,
      content: m.role === 'user' ? sanitizeMessage(m.content) : m.content.slice(0, 8000),
      ...(m.fromModel ? { fromModel: true } : {}),
    }));
  } catch (err) {
    const apiCtx = await validateApiKey(request);
    const ip = getClientIp(request);
    await recordUsage({
      mode,
      identity_hash: identityHash(apiCtx?.keyId ?? null, ip),
      api_key_id: apiCtx?.keyId ?? null,
      message_count: messages.length,
      total_input_chars: messages.reduce((s, m) => s + m.content.length, 0),
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
      model: mode === 'deploy' ? getChatDeployModel() : getChatAskModel(),
      status: 'injection_blocked',
      error_code: null,
    });
    return withCors(
      NextResponse.json({ error: 'injection_blocked', message: (err as Error).message }, { status: 400 }),
      request,
    );
  }

  const apiCtx = await validateApiKey(request);
  const ip = getClientIp(request);
  const ident = identityHash(apiCtx?.keyId ?? null, ip);

  // Beta-access gate — first authorization check. Admins (per admin-emails.ts)
  // and api_keys with beta_features.ai_chat === true pass; everyone else is
  // rejected with 403 before any LLM call. This closes the gap where the
  // chat surface was client-side-only gated, so a non-admin with a valid
  // API key could otherwise have hit /api/v1/chat directly.
  const accessCheck = checkBetaAccess(apiCtx, 'ai_chat');
  if (!accessCheck.allowed) {
    await recordUsage({
      mode,
      identity_hash: ident,
      api_key_id: apiCtx?.keyId ?? null,
      message_count: messages.length,
      total_input_chars: messages.reduce((s, m) => s + m.content.length, 0),
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
      model: mode === 'deploy' ? getChatDeployModel() : getChatAskModel(),
      status: 'access_denied',
      error_code: 'no_beta_access',
    });
    return withCors(
      NextResponse.json(
        {
          error: 'access_denied',
          message: 'Ambr Agent is in private beta. Request access at hello@ambr.run.',
        },
        { status: 403 },
      ),
      request,
    );
  }

  // Budget kill-switch — applies to both modes.
  const budget = await isBudgetExhausted();
  if (budget.exhausted) {
    await recordUsage({
      mode,
      identity_hash: ident,
      api_key_id: apiCtx?.keyId ?? null,
      message_count: messages.length,
      total_input_chars: messages.reduce((s, m) => s + m.content.length, 0),
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
      model: mode === 'deploy' ? getChatDeployModel() : getChatAskModel(),
      status: 'budget_exhausted',
      error_code: null,
    });
    return withCors(
      NextResponse.json(
        {
          error: 'budget_exhausted',
          message: budget.configured
            ? `Ambr Agent's daily budget has been reached for ${new Date().toUTCString().slice(0, 16)} UTC. Service resumes at 00:00 UTC.`
            : 'Ambr Agent is not available right now. Please try again later.',
        },
        { status: 503 },
      ),
      request,
    );
  }

  if (mode === 'deploy') {
    const isPaidTier = apiCtx?.tier && !['developer', 'alpha'].includes(apiCtx.tier);
    if (isPaidTier) {
      const rl = rateLimit(`chat:deploy:paid:${apiCtx!.keyId}`, PAID_TIER_BURST, MIN_MS);
      if (!rl.allowed) {
        await recordUsage({
          mode, identity_hash: ident, api_key_id: apiCtx?.keyId ?? null,
          message_count: messages.length,
          total_input_chars: messages.reduce((s, m) => s + m.content.length, 0),
          input_tokens: null, output_tokens: null, cost_usd: null,
          model: getChatDeployModel(), status: 'rate_limited', error_code: 'paid_burst',
        });
        return withCors(NextResponse.json({ error: 'rate_limited', message: `Burst limit reached (${PAID_TIER_BURST}/min).` }, { status: 429 }), request);
      }
    } else {
      const id = apiCtx ? apiCtx.keyId : ip;
      const rl = rateLimit(`chat:deploy:free:${id}`, FREE_TIER_DAILY, DAY_MS);
      if (!rl.allowed) {
        await recordUsage({
          mode, identity_hash: ident, api_key_id: apiCtx?.keyId ?? null,
          message_count: messages.length,
          total_input_chars: messages.reduce((s, m) => s + m.content.length, 0),
          input_tokens: null, output_tokens: null, cost_usd: null,
          model: getChatDeployModel(), status: 'rate_limited', error_code: 'free_daily',
        });
        return withCors(NextResponse.json({
          error: 'rate_limited',
          message: `Free tier limit reached (${FREE_TIER_DAILY} AI messages/day). Upgrade at /pricing for unlimited.`,
          limit: FREE_TIER_DAILY, window: 'day',
        }, { status: 429 }), request);
      }
    }

    return handleDeploy(request, sanitizedMessages, parsed.data.extracted_params ?? {}, parsed.data.template ?? null, parsed.data.confirmed_fields ?? [], apiCtx, ident);
  }

  // mode === 'ask'
  const rl = rateLimit(`chat:ask:${apiCtx?.keyId ?? ip}`, 30, MIN_MS);
  if (!rl.allowed) {
    await recordUsage({
      mode, identity_hash: ident, api_key_id: apiCtx?.keyId ?? null,
      message_count: messages.length,
      total_input_chars: messages.reduce((s, m) => s + m.content.length, 0),
      input_tokens: null, output_tokens: null, cost_usd: null,
      model: getChatAskModel(), status: 'rate_limited', error_code: 'ask_burst',
    });
    return withCors(NextResponse.json({ error: 'rate_limited', message: 'Slow down a moment (30 questions/min).' }, { status: 429 }), request);
  }

  return handleAsk(request, sanitizedMessages, parsed.data.context ?? {}, apiCtx, ident);
}

async function handleDeploy(
  request: Request,
  messages: { role: 'user' | 'assistant'; content: string; fromModel?: boolean }[],
  extractedSoFar: Record<string, unknown>,
  templateSoFar: string | null,
  /** Fields the user set via an explicit UI control (e.g. WalletFieldControl).
   *  These keys are protected from LLM-extraction overwrite — the user's
   *  click wins even if Kimi extracts a different value from their reply. */
  confirmedFieldsFromClient: string[],
  apiCtx: ApiKeyContext | null,
  ident: string,
) {
  const model = getChatDeployModel();
  const totalChars = messages.reduce((s, m) => s + m.content.length, 0);
  // Captured ABOVE the try so the catch block can compute duration even when
  // both providers fail (the fallbackOutcome variable lives only inside the
  // try and the previous catch logged null duration_ms — making it hard to
  // see how long users wait before seeing the error). 2026-05-26.
  const handlerStartedAt = Date.now();

  const contextSummary =
    Object.keys(extractedSoFar).length > 0 || templateSoFar
      ? `\n\nCONTEXT FROM PRIOR TURNS (do not re-ask):\n${JSON.stringify({ template: templateSoFar, extracted_params: extractedSoFar }, null, 2)}`
      : '';

  try {
    // Provider-neutral call. Returns UnifiedLLMResponse with either toolCall
    // OR textReply set. Multi-tool routing: the LLM picks classify_and_extract
    // for clear contract intent or answer_question for meta/clarifying. Plain
    // text response is also handled (Kimi K2.6 only supports tool_choice='auto'
    // and 'none', and Claude likewise — common ground.)
    // Tool-set strategy: if the user is already in an active template flow,
    // restrict tools to the classifier only. Kimi K2.6 with `tool_choice: 'auto'`
    // and multiple tools available defaults to chatty text replies even on
    // obvious parameter values ("1 USDC" gets acknowledged in prose instead of
    // extracted). Single-tool list forces extraction because there's no other
    // tool to pick AND no force-specific tool support on Moonshot.
    // Initial turns (no template yet) keep both tools so greetings and
    // "explain the templates" Q&A still work naturally before commitment.
    const inFlow = Boolean(templateSoFar);
    const deployTools: UnifiedTool[] = inFlow
      ? [CHAT_CLASSIFIER_TOOL as unknown as UnifiedTool]
      : [CHAT_CLASSIFIER_TOOL as unknown as UnifiedTool, CHAT_ASK_TOOL as unknown as UnifiedTool];

    // Primary call goes through callChatWithFallback so a Moonshot timeout/429
    // automatically retries on Anthropic before the user ever sees "I hit a
    // snag". When LLM_FALLBACK_ENABLED is unset/false the wrapper collapses
    // to single-call behaviour, so this is a zero-impact swap until we flip
    // the flag in prod.
    //
    // Primary timeout reduced from 45s → 25s so there's ~30s of headroom
    // inside the 60s Vercel maxDuration for the fallback attempt. Verified
    // safe: Kimi's observed p95 is well below 25s when it doesn't outright
    // hang, and a 25s+ Kimi response was already failing 50% of the time
    // (chat_usage 2026-05-26 baseline).
    const fallbackOutcome = await callChatWithFallback({
      mode: 'deploy',
      model,
      system: CHAT_DEPLOY_PROMPT + contextSummary,
      messages,
      tools: deployTools,
      toolChoice: 'auto',
      // 2000 leaves headroom for verbose classifier outputs + occasional
      // plain-text answers. The 1024 default cap was hitting mid-sentence on
      // long opening messages (see a 2026-05-17 19:39 UTC session —
      // output_tokens=1024 dead on the cap, UI showed truncated wall of text).
      maxTokens: 2000,
      timeoutMs: 25_000,
    });
    let response = fallbackOutcome.response;

    // ───────── text_reply retry ─────────
    // Kimi K2.6 with tool_choice='auto' sometimes returns plain text
    // ("Got it — SAAS and trading tools noted") instead of calling the
    // classify_and_extract tool, even when the user gave a valid parameter
    // value. Surfacing that text immediately as a fallback ("I hit a snag")
    // stalls the chat. Try ONE retry with a stricter system addition before
    // falling back. A retry costs little and fixes most stalls, above all
    // on multi-value answers in mid-flow.
    // Reported by a tester on 2026-05-25 ("SAAS, trading tools" stall in D1).
    //
    // FIRST-TURN gap (2026-06-02): the retry used to require `inFlow`
    // (templateSoFar set). But if Kimi prose-replies on turn 1 ("Got it — P2
    // Power of Attorney. What's your name?") the template never locks, inFlow
    // stays false forever, the retry NEVER fires, and the preview pane stays
    // empty the whole session. So ALSO retry when the reply or the user's last
    // message clearly signals contract intent — that forces classify_and_extract
    // and locks the template so the preview renders.
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const CONTRACT_INTENT_RE =
      /power of attorney|service purchase|delegation|api access|\bP2\b|\bA1\b|\bD1\b|\bC1\b|authorize|delegate|buy a service|subscription|warranty|draft (a|the|an) (contract|agreement)/i;
    const looksLikeContractIntent =
      CONTRACT_INTENT_RE.test(response.textReply ?? '') || CONTRACT_INTENT_RE.test(lastUserMsg);
    if (
      !response.toolCall && response.textReply !== null && !response.truncated &&
      (inFlow || looksLikeContractIntent)
    ) {
      try {
        const retried = await callChat({
          model,
          system: CHAT_DEPLOY_PROMPT + contextSummary +
            "\n\nCRITICAL: Your previous reply was plain text instead of a tool call. " +
            "The user is mid-flow. The template is ALREADY SET to '" + (templateSoFar ?? 'unknown') + "' — " +
            "DO NOT ask 'which contract type?' or re-classify. Look at the extracted_params in " +
            "CONTEXT to see what's already filled. Call classify_and_extract NOW with parameters " +
            "from the user's last message. If no new parameter was given, use the tool to " +
            "acknowledge + ask for the next missing required field. Do not respond in plain text " +
            "— only invoke the tool.",
          messages,
          tools: deployTools,
          toolChoice: 'auto',
          maxTokens: 2000,
          // Tighter timeout for retry — first call already burned budget.
          timeoutMs: 20_000,
        });
        if (retried.toolCall) {
          // Retry produced a tool call — replace response, downstream handles it
          // normally. Log a small marker so chat_usage shows the retry happened.
          // duration_ms = primary fallback total + retry duration (cumulative
          // wall clock for the user's perceived turn time). fallback_used
          // reflects the PRIMARY call's fallback state — the retry itself
          // uses raw callChat and doesn't trigger another fallback.
          await recordUsage({
            mode: 'deploy', identity_hash: ident, api_key_id: apiCtx?.keyId ?? null,
            message_count: messages.length, total_input_chars: totalChars,
            input_tokens: retried.usage.input_tokens, output_tokens: retried.usage.output_tokens,
            cost_usd: retried.usage.input_tokens !== null && retried.usage.output_tokens !== null
              ? estimateCostUsd(retried.modelUsed, retried.usage.input_tokens, retried.usage.output_tokens)
              : null,
            model: retried.modelUsed, status: 'ok',
            error_code: 'text_reply_retried_ok',
            duration_ms: fallbackOutcome.totalDurationMs + (retried.durationMs ?? 0),
            fallback_used: fallbackOutcome.usedFallback,
            cached_tokens: retried.usage.cached_tokens,
          });
          response = retried;
        }
        // If retried also returned text, fall through to the existing
        // text-reply handler below (no extra log — keeps chat_usage clean).
      } catch (retryErr) {
        // Retry failed for any reason (timeout, provider error). Keep the
        // original response and fall through to the existing handler.
        console.warn('chat retry on text_reply failed', retryErr);
      }
    }

    // ───────── Plain-text reply (no tool used) ─────────
    if (!response.toolCall && response.textReply !== null) {
      // When the model ran out of token budget mid-stream the text is
      // unreliable (cut off mid-sentence). Swap in a friendly retry message
      // so the user gets actionable guidance instead of garbled prose.
      // Context-aware: first-turn users get the "start over in one sentence"
      // nudge; mid-flow users (template already chosen, preview populated)
      // get a reassurance that nothing was lost — preview is intact.
      const reply = response.truncated
        ? (templateSoFar
            ? "Sorry — that response ran long and got cut off. Your preview is still up to date. What would you like to ask or change?"
            : "I started a longer response than I should — let's keep it focused. In one sentence, what kind of contract do you want? I'll guide you through it step by step.")
        : response.textReply;

      // Mid-flow re-classification guard (2026-05-26, test feedback).
      // The text-reply branch is an ENTIRELY SEPARATE code path from the
      // tool-call branch where the validation_warnings + nextQuestion override
      // logic lives. When Kimi ignores the locked-in template and types
      // "which contract type?" in plain text, none of those overrides fire
      // and the user sees a question that contradicts their own footer
      // showing "D1 · 10 of 11 filled." Detect that pattern + replace the
      // reply with the server-derived next-missing-field question.
      let finalReply = reply;
      // Mid-flow is signalled by EITHER a locked template OR any extracted
      // params. The A1/D1/C1 picker must never reach a user who has already
      // started — even on a turn where the template lock was transiently lost
      // to a client/server state desync (a tester's P2 at 9/9, 2026-06-01: footer
      // showed "P2 · 9 of 9" but the server saw templateSoFar=null that turn,
      // so the old `if (templateSoFar)` guard skipped and the raw picker
      // reached the user).
      const midFlow = Boolean(templateSoFar) || Object.keys(extractedSoFar).length > 0;
      if (midFlow && !response.truncated && typeof reply === 'string') {
        const looksLikeReclassification =
          /which contract type|service purchase|agent authorization|api access/i.test(reply) ||
          /\bA1\b[^a-z0-9]*\bD1\b[^a-z0-9]*\bC1\b/i.test(reply);
        if (looksLikeReclassification) {
          if (templateSoFar) {
            const v = validateReadyState(templateSoFar, extractedSoFar);
            if (v.missing.length > 0) {
              const next = v.missing[0];
              const label = getFieldLabel(templateSoFar, next) ?? next.replace(/_/g, ' ');
              finalReply = `One more thing — what's ${label}?`;
            } else if (v.ready) {
              // N/N fields filled but Kimi confused itself and re-classified.
              finalReply = "All set — click Deploy when you're ready.";
            } else {
              finalReply = "Got it — tell me the next detail, or click Deploy if everything looks right.";
            }
          } else {
            // Template lock lost this turn but params exist → still mid-flow.
            // Suppress the picker; never ask a mid-flow user to start over.
            finalReply = "You've already started filling this in — tell me the next detail, or click Deploy if everything looks right.";
          }
        }
      }

      const inTok = response.usage.input_tokens;
      const outTok = response.usage.output_tokens;
      const costUsd = inTok !== null && outTok !== null ? estimateCostUsd(response.modelUsed, inTok, outTok) : null;
      await recordUsage({
        mode: 'deploy', identity_hash: ident, api_key_id: apiCtx?.keyId ?? null,
        message_count: messages.length, total_input_chars: totalChars,
        input_tokens: inTok, output_tokens: outTok, cost_usd: costUsd,
        model: response.modelUsed, status: 'ok',
        error_code: response.truncated ? 'text_reply_truncated' : 'text_reply',
        duration_ms: fallbackOutcome.totalDurationMs,
        fallback_used: fallbackOutcome.usedFallback,
        cached_tokens: response.usage.cached_tokens,
      });
      // A prose reply locks a template only when the user named it outright (a
      // locked template is never replaced, and a reply to a question must not
      // pick one), and carries the wallets the user stated, so the preview is
      // not left empty.
      const textTemplate = templateSoFar ?? inferExplicitTemplate(messages);
      const textExtracted = applyStatedWallets({
        template: textTemplate,
        params: extractedSoFar,
        messages,
        confirmedFields: new Set(confirmedFieldsFromClient),
      });
      return withCors(
        NextResponse.json({
          template: textTemplate,
          confidence: 0,
          extracted_params: textExtracted,
          // Preserve readiness from existing state — a conversational reply
          // doesn't invalidate previously-extracted params. Without this,
          // every text turn disabled the Deploy button mid-flow even when
          // the preview was 10/10 (root cause of a 2026-05-17 session
          // where 40 chat turns kept re-locking Deploy).
          missing_params: deriveMissing(textTemplate, textExtracted),
          validation_warnings: [],
          next_question: '',
          ready_to_deploy: computeReadyFromExisting(textTemplate, textExtracted),
          assistant_message: finalReply,
          usage: usageBlock(inTok, outTok, costUsd, response.modelUsed),
        }),
        request,
      );
    }

    if (!response.toolCall) {
      throw new Error('LLM returned neither tool_call nor text');
    }

    const toolCall = response.toolCall;

    // ───────── answer_question branch (conversational reply) ─────────
    if (toolCall.name === 'answer_question') {
      const input = toolCall.input;
      const reply = typeof input.reply === 'string' ? input.reply : '';
      const suggestDeploy = input.suggest_deploy as { template?: string; intent?: string } | undefined;

      // Seed template only when the model explicitly suggests a deploy
      // handoff. Otherwise preserve whatever the client already had.
      const seededTemplate = suggestDeploy?.template ?? templateSoFar ?? null;

      const inTok = response.usage.input_tokens;
      const outTok = response.usage.output_tokens;
      const costUsd = inTok !== null && outTok !== null ? estimateCostUsd(response.modelUsed, inTok, outTok) : null;
      await recordUsage({
        mode: 'deploy', identity_hash: ident, api_key_id: apiCtx?.keyId ?? null,
        message_count: messages.length, total_input_chars: totalChars,
        input_tokens: inTok, output_tokens: outTok, cost_usd: costUsd,
        model: response.modelUsed, status: 'ok', error_code: 'tool:answer_question',
        duration_ms: fallbackOutcome.totalDurationMs,
        fallback_used: fallbackOutcome.usedFallback,
        cached_tokens: response.usage.cached_tokens,
      });

      return withCors(
        NextResponse.json({
          template: seededTemplate,
          confidence: suggestDeploy ? 0.7 : 0,
          extracted_params: extractedSoFar,
          // Same readiness preservation as the text_reply branch — the user
          // asking a clarifying question shouldn't disable Deploy on a
          // complete preview. Without this every Q&A reply re-locks Deploy.
          missing_params: deriveMissing(seededTemplate, extractedSoFar),
          validation_warnings: [],
          next_question: '',
          ready_to_deploy: computeReadyFromExisting(seededTemplate, extractedSoFar),
          assistant_message: reply,
          usage: usageBlock(inTok, outTok, costUsd, response.modelUsed),
        }),
        request,
      );
    }

    // ───────── classify_and_extract branch (extraction) ─────────
    const input = toolCall.input;
    const rawTemplate = typeof input.template === 'string' ? input.template : null;
    const confidence = typeof input.confidence === 'number' ? input.confidence : 0;

    // Low-confidence safeguard: defense-in-depth alongside the multi-tool
    // routing. If the model still picks classify_and_extract on a weak
    // signal (confidence < 0.4), reject the new extracted params (avoids
    // contaminating fields with noisy data).
    //
    // TEMPLATE PERSISTENCE (2026-05-26 fix): high-confidence LLM extraction
    // wins → uses LLM's classification (lets user pivot templates mid-flow if
    // they explicitly change intent). Low confidence → preserve the client's
    // locked-in templateSoFar. Kimi's confidence dips when answering narrow
    // sub-questions (e.g. "what's your registration number?") even when the
    // overall contract intent hasn't changed. Without this fallback, a
    // confidence dip on ANY turn wipes the template and the chat re-asks
    // "which contract type?" — exact bug hit in testing with a 10/11-filled D1
    // draft. Client always sends templateSoFar so we trust it as the prior
    // state.
    const CONFIDENCE_FLOOR = 0.4;
    // TEMPLATE LOCK (2026-07-15): the contract template is chosen ONCE — the
    // first classification, or the chip the user explicitly picked (the client
    // sends it as templateSoFar). After it is set it is NEVER auto-switched by a
    // per-turn reclassification: a confident-but-accidental re-read must not
    // change the contract type the user is already filling in (the P2<->C1/D1
    // flip a tester hit). To switch, the user picks a different chip,
    // which resets state client-side and sends the new template as templateSoFar.
    // (The earlier "high-confidence LLM pick wins mid-flow" behaviour was the bug
    // itself — the model has no reliable signal that the user MEANT to switch.)
    // CONFIDENCE_FLOOR still gates param-extraction quality below.
    // The turn's template and merged parameters come from one pure helper so the
    // rules (lock, model template validated, inference from the user's words and
    // from the collected fields, UI-confirmed fields protected, labelled wallets
    // taken from the user's text, caps as numbers) are testable without a model.
    const newExtracted = (input.extracted_params as Record<string, unknown>) ?? {};
    const confirmedFields = new Set<string>(confirmedFieldsFromClient);
    const turn = mergeClassifiedTurn({
      messages,
      templateSoFar,
      rawTemplate,
      confidence,
      confidenceFloor: CONFIDENCE_FLOOR,
      extractedSoFar,
      newExtracted,
      confirmedFields,
    });
    const template = turn.template;
    const mergedRaw = turn.merged;

    // Jurisdiction-aware default for cooling_off_days on A1 contracts. Replaces
    // the previous hardcoded 14-day assumption that was wrong for US/SG/AU
    // (no general regime) and China (7 days). See lib/jurisdiction/cooling-off.ts
    // for the full matrix + rationale. Emits a validation_warning so the user
    // sees WHY the value was set — helps catch wrong governing_law selections.
    let merged = mergedRaw;
    const coolingOffWarnings: string[] = [];
    // Only derive the cooling-off default + surface the note ONCE the user has
    // set a governing_law. Two reasons (2026-06-02): (1) no scary
    // "unspecified → EU 14-day" warning on turn 1 before any field is given;
    // (2) correctness — normalizeCoolingOff short-circuits once cooling_off_days
    // has a value, so a premature turn-1 default of 14 would STICK even after
    // the user later sets a jurisdiction with a different (or no) cooling-off
    // regime. Gating on governing_law means we derive the RIGHT value.
    if (template === 'a1-service-purchase') {
      const hasJurisdiction =
        typeof mergedRaw.governing_law === 'string' && mergedRaw.governing_law.trim() !== '';
      if (hasJurisdiction) {
        const norm = normalizeCoolingOff(mergedRaw);
        merged = norm.params;
        coolingOffWarnings.push(...norm.warnings);
      }
    }

    // Server-side re-validation overrides the LLM's claim.
    // IMPORTANT: validation runs BEFORE the duplicate-wallet strip below, so
    // that validateReadyState() sees both `agent_id` and `principal_agent_id`
    // and pushes its explanatory warning into `v.warnings` (which becomes
    // `validation_warnings` in the response → a ⚠ chat bubble for the user).
    // If we strip first (as we did in an earlier 2026-05-26 pass), the
    // duplicate-detection branch in validateReadyState() finds agent_id
    // missing and silently moves on — no warning, user sees the question
    // re-asked with no explanation. Reported in testing 2026-05-27.
    const v = validateReadyState(template, merged);

    // D1-only duplicate-wallet cleanup: bilateral delegation requires two
    // different wallets. Strip the duplicate agent_id from `merged` so the
    // preview shows it missing and Kimi re-asks. P2 (one-sided POA) allows
    // same-wallet by design — see validateReadyState comment above.
    //
    // EXCEPTION: if the user explicitly confirmed agent_id via the
    // WalletFieldControl "Continue anyway" path, confirmedFields will
    // include 'agent_id' and we respect that override.
    if (template === 'd1-general-auth') {
      const agentId = (merged.agent_id as string | undefined)?.toLowerCase();
      const principalId = (merged.principal_agent_id as string | undefined)?.toLowerCase();
      if (agentId && principalId && agentId === principalId && !confirmedFields.has('agent_id')) {
        merged = { ...merged };
        delete merged.agent_id;
      }
    }

    const highValue = highValueConfirmationNeeded(merged);
    const llmReady = Boolean(input.ready_to_deploy);
    const serverReady = v.ready && !highValue.needed;

    let nextQuestion = typeof input.next_question === 'string' ? input.next_question : '';
    let assistantMessage = typeof input.assistant_message === 'string' ? input.assistant_message : '';

    // P2 caps offer: deterministic and one-shot. The agent catalog instructs the
    // model to offer optional spending caps once a POA's required fields are
    // filled, but that is advisory, and a trading POA was once deployed without
    // the offer. shouldOfferCaps guarantees it server-side: it fires once (the
    // offer's marker in the transcript prevents repeats), never blocks Deploy,
    // and skips when a cap is set or the user already declined caps in their own
    // words, in any earlier turn.
    // The offer goes in assistant_message, NOT next_question: the client drops
    // next_question whenever ready_to_deploy is true (the double-bubble fix), and
    // this offer fires exactly when the contract is ready. As a '?'-terminated
    // assistant_message the client renders it and suppresses the "ready to
    // deploy" tail.
    if (shouldOfferCaps({ template, ready: v.ready, highValueNeeded: highValue.needed, params: merged, messages })) {
      assistantMessage = CAPS_OFFER_MESSAGE;
      nextQuestion = '';
    }

    // If the LLM thought we were ready but we have a large value, inject a confirmation turn.
    if (llmReady && highValue.needed) {
      nextQuestion = `One confirmation before deploy — you're authorizing $${highValue.value!.toLocaleString()} on "${highValue.field}". Confirm this is correct?`;
      assistantMessage = '';
    }

    // If the LLM claims ready but server validation disagrees, ask for the missing field.
    if (llmReady && !v.ready) {
      const next = v.missing[0];
      // Corner case: validateReadyState returns `{ready: false, missing: []}`
      // when the template is null/unknown (early-return at its first if-block).
      // With a locked template the nudge keeps the user moving; with none, the
      // question is which template this is, never a generic "next detail" that
      // leaves the preview empty. The A1/D1/C1 picker text must not reach a user
      // who has already filled fields, so the question says their answers are kept.
      nextQuestion = notReadyQuestion({ nextField: next, template });
      assistantMessage = '';
    }

    // D1 wrong-field-question override (reported in testing 2026-05-26).
    // The server knows what's actually missing. The LLM sometimes asks about
    // a more visually salient field (wallet addresses) instead of the
    // abstract required field (e.g. principal_registration_number). When
    // the LLM's next_question doesn't reference the actually-missing field,
    // override it with a friendlier server-generated question. Skip the
    // override when the LLM happens to already ask about the right field —
    // preserves Kimi's natural phrasing in the common case.
    if (v.missing.length > 0 && (template === 'd1-general-auth' || template === 'p2-power-of-attorney')) {
      const next = v.missing[0];
      const nextNorm = next.toLowerCase();
      const questionNorm = nextQuestion.toLowerCase();
      const llmAlreadyAsksAboutIt =
        questionNorm.includes(nextNorm.replace(/_/g, ' ')) ||
        questionNorm.includes(nextNorm.replace(/_/g, '')) ||
        questionNorm.includes(nextNorm);
      if (!llmAlreadyAsksAboutIt) {
        const label = getFieldLabel(template, next) ?? next.replace(/_/g, ' ');
        nextQuestion = `One more thing — what's ${label}?`;
        assistantMessage = '';
      }
    }

    // Usage logging
    const inTok = response.usage.input_tokens;
    const outTok = response.usage.output_tokens;
    const costUsd = inTok !== null && outTok !== null ? estimateCostUsd(response.modelUsed, inTok, outTok) : null;
    await recordUsage({
      mode: 'deploy', identity_hash: ident, api_key_id: apiCtx?.keyId ?? null,
      message_count: messages.length, total_input_chars: totalChars,
      input_tokens: inTok, output_tokens: outTok, cost_usd: costUsd,
      model: response.modelUsed, status: 'ok', error_code: null,
      duration_ms: fallbackOutcome.totalDurationMs,
      fallback_used: fallbackOutcome.usedFallback,
      cached_tokens: response.usage.cached_tokens,
    });

    return withCors(
      NextResponse.json({
        template,
        confidence: input.confidence ?? null,
        extracted_params: merged,
        missing_params: v.missing,
        validation_warnings: [...v.warnings, ...coolingOffWarnings],
        next_question: nextQuestion,
        ready_to_deploy: serverReady,
        assistant_message: assistantMessage,
        usage: usageBlock(inTok, outTok, costUsd, response.modelUsed),
      }),
      request,
    );
  } catch (err) {
    // Log metadata only — never the prompt content.
    const e = err as Error & { code?: string; primaryError?: { code: string | null; message: string } };
    const errClass = e?.constructor?.name ?? 'unknown';
    const errMsg = e?.message ?? '';
    // The provider adapters tag errors with .code (TIMEOUT, RATE_LIMIT,
    // UPSTREAM_5XX, AUTH, BAD_REQUEST). callChatWithFallback attaches the
    // primary's error to the secondary's exception when BOTH fail, so we can
    // tell "Kimi timed out but Anthropic also timed out" apart from "Kimi
    // timed out and we surfaced Anthropic's success".
    const errCode = e?.code ?? null;
    const primaryErr = e?.primaryError ?? null;
    console.error('[chat:deploy] LLM call failed', {
      ident,
      api_key_id: apiCtx?.keyId ?? null,
      message_count: messages.length,
      total_chars: totalChars,
      error_class: errClass,
      error_code: errCode,
      error_message: errMsg.slice(0, 200),
      primary_error_code: primaryErr?.code ?? null,
      primary_error_message: primaryErr?.message?.slice(0, 200) ?? null,
    });
    await recordUsage({
      mode: 'deploy', identity_hash: ident, api_key_id: apiCtx?.keyId ?? null,
      message_count: messages.length, total_input_chars: totalChars,
      input_tokens: null, output_tokens: null, cost_usd: null,
      model, status: 'llm_error',
      // Encode the error code + both primary & secondary failure reasons so
      // future analytics can break down by failure class without parsing free
      // text. Format: `${code}|secondary=${msg}|primary=${primaryMsg}`
      error_code: [
        errCode ? `code=${errCode}` : null,
        `secondary=${errClass}:${errMsg.slice(0, 150)}`,
        primaryErr ? `primary=${primaryErr.code}:${primaryErr.message.slice(0, 150)}` : null,
      ].filter(Boolean).join('|').slice(0, 300),
      // Wall-clock from handler entry to catch — captures the user's perceived
      // wait time even on dual-provider failure (was NULL in earlier rows
      // because the wrapper's outcome variable lives only inside the try
      // block and isn't accessible from catch).
      duration_ms: Date.now() - handlerStartedAt,
      fallback_used: primaryErr !== null,
    });

    // Error-class-aware fallback messages. Honest > vague.
    // BILLING_EXHAUSTED (either provider): operational issue, user can't fix.
    //   Tell them clearly + suggest manual builder + give support contact.
    // TIMEOUT both providers: capacity issue, suggest retry + manual builder.
    // RATE_LIMIT both providers: someone-else's-problem, suggest brief wait.
    // BAD_REQUEST/AUTH: programming error or env issue — generic apology.
    // Other / unclassified: keep the existing "hit a snag" wording.
    const inFlowFallback = Boolean(templateSoFar) || Object.keys(extractedSoFar).length > 0;
    const anyBillingExhausted = errCode === 'BILLING_EXHAUSTED' || primaryErr?.code === 'BILLING_EXHAUSTED';
    const bothTimedOut = errCode === 'TIMEOUT' && primaryErr?.code === 'TIMEOUT';
    const bothRateLimited = errCode === 'RATE_LIMIT' && primaryErr?.code === 'RATE_LIMIT';
    const fallbackAssistantMessage =
      anyBillingExhausted
        ? (inFlowFallback
            ? "The AI service is temporarily unavailable due to a billing issue on Ambr's side — we've been notified. Your work is safe in the preview on the left; you can fill remaining fields manually and hit Deploy, or use the Manual Builder."
            : "The AI chat is temporarily unavailable due to a billing issue on Ambr's side — we've been notified. Please use the Manual Builder (top-right link) for now.")
      : bothTimedOut
        ? (inFlowFallback
            ? "Both AI models are slow right now — your work is safe in the preview on the left. Give it a moment and try again, or fill the remaining fields manually and hit Deploy."
            : "Both AI models are slow to respond right now. Try again in a moment, or use the Manual Builder (top-right link) to skip the chat.")
      : bothRateLimited
        ? "The AI is at capacity right now. Try again in 30 seconds — your work is safe."
      : errCode === 'BAD_REQUEST' || errCode === 'AUTH'
        ? "Something's misconfigured on Ambr's side — please reach out via support@ambr.run. Your work is preserved in the preview."
      : inFlowFallback
        ? "I hit a snag understanding that — could you rephrase, or use the preview to fill any remaining fields? Everything we've covered so far is still in the preview on the left."
        : "Here are the Agent Mandates I can deploy:\n\n• P2 — Power of Attorney (one-sided grant to your own agent, $0.20)\n• D1 — Delegation (you authorize an AI agent to act on your behalf, $0.50)\n• A2A — Agent-to-Agent (one agent hires another for a task, payment on completion, $1.00)\n\nTell me which one fits in your own words, or click a chip above.";
    const fallbackNextQuestion = inFlowFallback ? '' : 'Which one fits — P2, D1, or A2A?';
    return withCors(
      NextResponse.json({
        // Preserve the template choice across the failed turn instead of
        // clearing it. The catch was forcing the user back to "no template"
        // even when they'd already locked A1.
        template: templateSoFar ?? inferExplicitTemplate(messages),
        confidence: 0,
        extracted_params: extractedSoFar,
        missing_params: [],
        validation_warnings: [],
        next_question: fallbackNextQuestion,
        ready_to_deploy: false,
        assistant_message: fallbackAssistantMessage,
      }),
      request,
    );
  }
}

async function handleAsk(
  request: Request,
  messages: { role: 'user' | 'assistant'; content: string }[],
  context: { wallet?: string | null; tier?: string | null; nft_count?: number; pending_actions?: number },
  apiCtx: ApiKeyContext | null,
  ident: string,
) {
  const model = getChatAskModel();
  const totalChars = messages.reduce((s, m) => s + m.content.length, 0);
  // Wall-clock start so the catch block can record duration_ms even when
  // both providers fail. Mirrors handleDeploy.
  const handlerStartedAt = Date.now();

  const contextSummary =
    context && Object.keys(context).length > 0
      ? `\n\nUSER CONTEXT:\n${JSON.stringify(context, null, 2)}`
      : '';

  try {
    // Same provider-neutral call via the fallback wrapper. Ask mode wants the
    // answer_question tool specifically — Anthropic supports the `{name}`
    // tool_choice for that, Moonshot downgrades to 'auto' (the system prompt
    // only describes one tool so the model will pick it anyway).
    // Primary timeout reduced from 45s → 25s so the wrapper has budget left
    // for the fallback provider attempt inside the 60s Vercel maxDuration.
    const askOutcome = await callChatWithFallback({
      mode: 'ask',
      model,
      system: CHAT_ASK_PROMPT + contextSummary,
      messages,
      tools: [CHAT_ASK_TOOL as unknown as UnifiedTool],
      toolChoice: { name: 'answer_question' },
      maxTokens: 800,
      timeoutMs: 25_000,
    });
    const response = askOutcome.response;

    if (!response.toolCall) {
      // Plain-text reply when the model didn't pick the tool. Treat its
      // text as the reply directly; no suggest_deploy.
      const reply = response.textReply ?? '';
      const inTok = response.usage.input_tokens;
      const outTok = response.usage.output_tokens;
      const costUsd = inTok !== null && outTok !== null ? estimateCostUsd(response.modelUsed, inTok, outTok) : null;
      await recordUsage({
        mode: 'ask', identity_hash: ident, api_key_id: apiCtx?.keyId ?? null,
        message_count: messages.length, total_input_chars: totalChars,
        input_tokens: inTok, output_tokens: outTok, cost_usd: costUsd,
        model: response.modelUsed, status: 'ok', error_code: 'text_reply',
        duration_ms: askOutcome.totalDurationMs,
        fallback_used: askOutcome.usedFallback,
        cached_tokens: response.usage.cached_tokens,
      });
      return withCors(
        NextResponse.json({
          reply,
          suggest_deploy: null,
          usage: usageBlock(inTok, outTok, costUsd, response.modelUsed),
        }),
        request,
      );
    }

    const input = response.toolCall.input;

    const inTok = response.usage.input_tokens;
    const outTok = response.usage.output_tokens;
    const costUsd = inTok !== null && outTok !== null ? estimateCostUsd(response.modelUsed, inTok, outTok) : null;
    await recordUsage({
      mode: 'ask', identity_hash: ident, api_key_id: apiCtx?.keyId ?? null,
      message_count: messages.length, total_input_chars: totalChars,
      input_tokens: inTok, output_tokens: outTok, cost_usd: costUsd,
      model: response.modelUsed, status: 'ok', error_code: null,
      duration_ms: askOutcome.totalDurationMs,
      fallback_used: askOutcome.usedFallback,
      cached_tokens: response.usage.cached_tokens,
    });

    return withCors(
      NextResponse.json({
        reply: input.reply,
        suggest_deploy: input.suggest_deploy ?? null,
        usage: usageBlock(inTok, outTok, costUsd, response.modelUsed),
      }),
      request,
    );
  } catch (err) {
    const e = err as Error & { code?: string; primaryError?: { code: string | null; message: string } };
    const errClass = e?.constructor?.name ?? 'unknown';
    const errMsg = e?.message ?? '';
    const errCode = e?.code ?? null;
    const primaryErr = e?.primaryError ?? null;
    console.error('[chat:ask] LLM call failed', {
      ident,
      api_key_id: apiCtx?.keyId ?? null,
      message_count: messages.length,
      total_chars: totalChars,
      error_class: errClass,
      error_code: errCode,
      error_message: errMsg.slice(0, 200),
      primary_error_code: primaryErr?.code ?? null,
      primary_error_message: primaryErr?.message?.slice(0, 200) ?? null,
    });
    await recordUsage({
      mode: 'ask', identity_hash: ident, api_key_id: apiCtx?.keyId ?? null,
      message_count: messages.length, total_input_chars: totalChars,
      input_tokens: null, output_tokens: null, cost_usd: null,
      model, status: 'llm_error',
      error_code: [
        errCode ? `code=${errCode}` : null,
        `secondary=${errClass}:${errMsg.slice(0, 150)}`,
        primaryErr ? `primary=${primaryErr.code}:${primaryErr.message.slice(0, 150)}` : null,
      ].filter(Boolean).join('|').slice(0, 300),
      duration_ms: Date.now() - handlerStartedAt,
      fallback_used: primaryErr !== null,
    });
    // Ask-mode error response: honest classification so the user knows
    // whether to retry or wait for an operational fix. Mirrors handleDeploy.
    const anyBillingExhausted = errCode === 'BILLING_EXHAUSTED' || primaryErr?.code === 'BILLING_EXHAUSTED';
    const userMessage =
      anyBillingExhausted
        ? "Ambr Agent is temporarily unavailable due to a billing issue on our side — we've been notified."
        : "Ambr Agent had a hiccup. Please try again.";
    return withCors(
      NextResponse.json({ error: 'chat_failed', message: userMessage }, { status: 500 }),
      request,
    );
  }
}

export { corsOptions as OPTIONS };
