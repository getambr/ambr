import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { z } from 'zod';
import { getAnthropicClient } from '@/lib/llm/client';
import { CHAT_DEPLOY_MODEL, CHAT_ASK_MODEL } from '@/lib/llm/models';
import {
  CHAT_DEPLOY_PROMPT,
  CHAT_CLASSIFIER_TOOL,
  CHAT_ASK_PROMPT,
  CHAT_ASK_TOOL,
} from '@/lib/llm/prompts';
import { validateApiKey, type ApiKeyContext } from '@/lib/api-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { corsOptions, withCors } from '@/lib/cors';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { estimateCostUsd, isBudgetExhausted, dailyCapUsd } from '@/lib/llm/chat-budget';

export const maxDuration = 30;

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(8000),
});

const requestSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('deploy'),
    messages: z.array(messageSchema).min(1).max(40),
    extracted_params: z.record(z.string(), z.unknown()).optional(),
    template: z.string().optional(),
  }),
  z.object({
    mode: z.literal('ask'),
    messages: z.array(messageSchema).min(1).max(40),
    context: z.object({
      wallet: z.string().nullable().optional(),
      tier: z.string().nullable().optional(),
      nft_count: z.number().optional(),
      pending_actions: z.number().optional(),
    }).optional(),
  }),
]);

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_MS = 60 * 1000;
const FREE_TIER_DAILY = 5;
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
  'd1-general-auth': ['principal_name', 'principal_type', 'principal_registration_number', 'principal_address', 'agent_id', 'scope', 'categories', 'spending_limit_per_tx', 'spending_limit_monthly', 'duration_months', 'governing_law'],
  'c1-api-access': ['buyer_name', 'buyer_agent_id', 'seller_name', 'api_endpoint', 'pricing_model', 'price_per_call', 'currency', 'sla_uptime_percent', 'governing_law'],
};

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
  status: 'ok' | 'rate_limited' | 'budget_exhausted' | 'injection_blocked' | 'llm_error' | 'validation_error';
  error_code: string | null;
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
    return { ready: false, missing: [], warnings: ['unknown template — cannot validate'] };
  }
  const required = V1_REQUIRED_FIELDS[template];
  const missing = required.filter((k) => {
    const v = extracted[k];
    return v === null || v === undefined || v === '';
  });

  const warnings: string[] = [];
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
    return withCors(
      NextResponse.json({ error: 'validation_error', details: parsed.error.issues }, { status: 400 }),
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
      model: mode === 'deploy' ? CHAT_DEPLOY_MODEL : CHAT_ASK_MODEL,
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
      model: mode === 'deploy' ? CHAT_DEPLOY_MODEL : CHAT_ASK_MODEL,
      status: 'budget_exhausted',
      error_code: null,
    });
    return withCors(
      NextResponse.json(
        {
          error: 'budget_exhausted',
          message: `Ambr Agent's daily budget cap of $${budget.cap.toFixed(2)} has been reached for ${new Date().toUTCString().slice(0, 16)} UTC. Service resumes at 00:00 UTC. If this is a production incident, raise AMBR_AGENT_DAILY_USD_CAP in the Vercel dashboard.`,
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
          model: CHAT_DEPLOY_MODEL, status: 'rate_limited', error_code: 'paid_burst',
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
          model: CHAT_DEPLOY_MODEL, status: 'rate_limited', error_code: 'free_daily',
        });
        return withCors(NextResponse.json({
          error: 'rate_limited',
          message: `Free tier limit reached (${FREE_TIER_DAILY} AI messages/day). Upgrade at /pricing for unlimited.`,
          limit: FREE_TIER_DAILY, window: 'day',
        }, { status: 429 }), request);
      }
    }

    return handleDeploy(request, sanitizedMessages, parsed.data.extracted_params ?? {}, parsed.data.template ?? null, apiCtx, ident);
  }

  // mode === 'ask'
  const rl = rateLimit(`chat:ask:${apiCtx?.keyId ?? ip}`, 30, MIN_MS);
  if (!rl.allowed) {
    await recordUsage({
      mode, identity_hash: ident, api_key_id: apiCtx?.keyId ?? null,
      message_count: messages.length,
      total_input_chars: messages.reduce((s, m) => s + m.content.length, 0),
      input_tokens: null, output_tokens: null, cost_usd: null,
      model: CHAT_ASK_MODEL, status: 'rate_limited', error_code: 'ask_burst',
    });
    return withCors(NextResponse.json({ error: 'rate_limited', message: 'Slow down a moment (30 questions/min).' }, { status: 429 }), request);
  }

  return handleAsk(request, sanitizedMessages, parsed.data.context ?? {}, apiCtx, ident);
}

async function handleDeploy(
  request: Request,
  messages: { role: 'user' | 'assistant'; content: string }[],
  extractedSoFar: Record<string, unknown>,
  templateSoFar: string | null,
  apiCtx: ApiKeyContext | null,
  ident: string,
) {
  const client = getAnthropicClient();
  const totalChars = messages.reduce((s, m) => s + m.content.length, 0);

  const contextSummary =
    Object.keys(extractedSoFar).length > 0 || templateSoFar
      ? `\n\nCONTEXT FROM PRIOR TURNS (do not re-ask):\n${JSON.stringify({ template: templateSoFar, extracted_params: extractedSoFar }, null, 2)}`
      : '';

  try {
    const response = await client.messages.create({
      model: CHAT_DEPLOY_MODEL,
      max_tokens: 1024,
      system: CHAT_DEPLOY_PROMPT + contextSummary,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      tools: [CHAT_CLASSIFIER_TOOL],
      tool_choice: { type: 'tool', name: 'classify_and_extract' },
    });

    const toolBlock = response.content.find((b) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      throw new Error('LLM did not return tool_use response');
    }
    const input = toolBlock.input as Record<string, unknown>;
    const template = typeof input.template === 'string' ? input.template : null;
    const newExtracted = (input.extracted_params as Record<string, unknown>) ?? {};
    const merged = { ...extractedSoFar, ...newExtracted };

    // Server-side re-validation overrides the LLM's claim.
    const v = validateReadyState(template, merged);
    const highValue = highValueConfirmationNeeded(merged);
    const llmReady = Boolean(input.ready_to_deploy);
    const serverReady = v.ready && !highValue.needed;

    let nextQuestion = typeof input.next_question === 'string' ? input.next_question : '';
    let assistantMessage = typeof input.assistant_message === 'string' ? input.assistant_message : '';

    // If the LLM thought we were ready but we have a large value, inject a confirmation turn.
    if (llmReady && highValue.needed) {
      nextQuestion = `One confirmation before deploy — you're authorizing $${highValue.value!.toLocaleString()} on "${highValue.field}". Confirm this is correct?`;
      assistantMessage = '';
    }

    // If the LLM claims ready but server validation disagrees, ask for the missing field.
    if (llmReady && !v.ready) {
      const next = v.missing[0];
      nextQuestion = `One more thing — what's the ${next.replace(/_/g, ' ')}?`;
      assistantMessage = '';
    }

    // Usage logging
    const inTok = response.usage?.input_tokens ?? null;
    const outTok = response.usage?.output_tokens ?? null;
    const costUsd = inTok !== null && outTok !== null ? estimateCostUsd(CHAT_DEPLOY_MODEL, inTok, outTok) : null;
    await recordUsage({
      mode: 'deploy', identity_hash: ident, api_key_id: apiCtx?.keyId ?? null,
      message_count: messages.length, total_input_chars: totalChars,
      input_tokens: inTok, output_tokens: outTok, cost_usd: costUsd,
      model: CHAT_DEPLOY_MODEL, status: 'ok', error_code: null,
    });

    return withCors(
      NextResponse.json({
        template,
        confidence: input.confidence ?? null,
        extracted_params: merged,
        missing_params: v.missing,
        validation_warnings: v.warnings,
        next_question: nextQuestion,
        ready_to_deploy: serverReady,
        assistant_message: assistantMessage,
        budget_remaining_usd: Math.max(0, dailyCapUsd() - (costUsd ?? 0)),
      }),
      request,
    );
  } catch (err) {
    // Log metadata only — never the prompt content.
    console.error('[chat:deploy] LLM call failed', {
      ident,
      api_key_id: apiCtx?.keyId ?? null,
      message_count: messages.length,
      total_chars: totalChars,
      error_class: (err as Error)?.constructor?.name,
    });
    await recordUsage({
      mode: 'deploy', identity_hash: ident, api_key_id: apiCtx?.keyId ?? null,
      message_count: messages.length, total_input_chars: totalChars,
      input_tokens: null, output_tokens: null, cost_usd: null,
      model: CHAT_DEPLOY_MODEL, status: 'llm_error',
      error_code: (err as Error)?.constructor?.name ?? 'unknown',
    });
    return withCors(
      NextResponse.json({ error: 'chat_failed', message: 'Ambr Agent had a hiccup. Please try again.' }, { status: 500 }),
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
  const client = getAnthropicClient();
  const totalChars = messages.reduce((s, m) => s + m.content.length, 0);

  const contextSummary =
    context && Object.keys(context).length > 0
      ? `\n\nUSER CONTEXT:\n${JSON.stringify(context, null, 2)}`
      : '';

  try {
    const response = await client.messages.create({
      model: CHAT_ASK_MODEL,
      max_tokens: 800,
      system: CHAT_ASK_PROMPT + contextSummary,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      tools: [CHAT_ASK_TOOL],
      tool_choice: { type: 'tool', name: 'answer_question' },
    });

    const toolBlock = response.content.find((b) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      throw new Error('LLM did not return tool_use response');
    }
    const input = toolBlock.input as Record<string, unknown>;

    const inTok = response.usage?.input_tokens ?? null;
    const outTok = response.usage?.output_tokens ?? null;
    const costUsd = inTok !== null && outTok !== null ? estimateCostUsd(CHAT_ASK_MODEL, inTok, outTok) : null;
    await recordUsage({
      mode: 'ask', identity_hash: ident, api_key_id: apiCtx?.keyId ?? null,
      message_count: messages.length, total_input_chars: totalChars,
      input_tokens: inTok, output_tokens: outTok, cost_usd: costUsd,
      model: CHAT_ASK_MODEL, status: 'ok', error_code: null,
    });

    return withCors(
      NextResponse.json({
        reply: input.reply,
        suggest_deploy: input.suggest_deploy ?? null,
      }),
      request,
    );
  } catch (err) {
    console.error('[chat:ask] LLM call failed', {
      ident,
      api_key_id: apiCtx?.keyId ?? null,
      message_count: messages.length,
      total_chars: totalChars,
      error_class: (err as Error)?.constructor?.name,
    });
    await recordUsage({
      mode: 'ask', identity_hash: ident, api_key_id: apiCtx?.keyId ?? null,
      message_count: messages.length, total_input_chars: totalChars,
      input_tokens: null, output_tokens: null, cost_usd: null,
      model: CHAT_ASK_MODEL, status: 'llm_error',
      error_code: (err as Error)?.constructor?.name ?? 'unknown',
    });
    return withCors(
      NextResponse.json({ error: 'chat_failed', message: 'Ambr Agent had a hiccup. Please try again.' }, { status: 500 }),
      request,
    );
  }
}

export { corsOptions as OPTIONS };
