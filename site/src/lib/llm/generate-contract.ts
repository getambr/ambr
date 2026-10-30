import { callChat, type UnifiedTool } from './providers';
import { getContractModel } from './models';
import { getTemplatePrompt } from './prompts';

interface GenerateContractParams {
  templateSlug: string;
  parameters: Record<string, unknown>;
  principalDeclaration: {
    agent_id: string;
    principal_name: string;
    principal_type: string;
  };
  contractId: string;
}

interface GeneratedContract {
  humanReadable: string;
  machineReadable: Record<string, unknown>;
}

// ─── Prompt injection defense ──────────────────────────
// Patterns that indicate an attempt to override LLM instructions
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?previous/i,
  /override\s+(system|previous|above)/i,
  /you\s+are\s+now\s+a/i,
  /forget\s+(everything|all|your\s+instructions)/i,
  /new\s+instructions?\s*:/i,
  /system\s*:\s*/i,
  /\bdo\s+not\s+follow\b/i,
  /\bpretend\s+(to\s+be|you\s+are)\b/i,
  /\brole\s*:\s*system\b/i,
];

const MAX_STRING_LENGTH = 2000;

/**
 * Sanitize user-supplied parameters before passing to the LLM.
 * Rejects values containing prompt injection patterns and truncates
 * excessively long strings. Returns a clean copy — never mutates input.
 */
function sanitizeParameters(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    // Block prototype pollution keys
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }

    if (typeof value === 'string') {
      // Check for injection patterns
      for (const pattern of INJECTION_PATTERNS) {
        if (pattern.test(value)) {
          throw new Error(
            `Parameter '${key}' contains a disallowed pattern. ` +
            'Contract parameters must contain only business terms, not instructions.',
          );
        }
      }
      // Truncate overly long strings
      clean[key] = value.slice(0, MAX_STRING_LENGTH);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      clean[key] = value;
    } else if (Array.isArray(value)) {
      // Allow simple arrays (e.g., categories, scope lists)
      clean[key] = value.map((v) =>
        typeof v === 'string' ? v.slice(0, MAX_STRING_LENGTH) : v,
      );
    } else if (value != null && typeof value === 'object') {
      // Recursively sanitize nested objects
      clean[key] = sanitizeParameters(value as Record<string, unknown>);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

/**
 * Fix common UTF-8 mojibake patterns. This happens when UTF-8 bytes are
 * re-interpreted as Windows-1252/Latin-1 (e.g., em-dash U+2014 bytes
 * E2 80 94 become â€" = U+00E2 U+20AC U+201D as three characters).
 * Must run BEFORE hashing to ensure the hash matches the clean text.
 */
function fixMojibake(text: string): string {
  return text
    // Em-dash variants
    .replace(/\u00e2\u20ac\u201d/g, '\u2014')   // â€" → —
    .replace(/\u00e2\u20ac\u201c/g, '\u2013')   // â€" variant → –
    // Curly quotes and apostrophes
    .replace(/\u00e2\u20ac\u2122/g, '\u2019')   // â€™ → '
    .replace(/\u00e2\u20ac\u0153/g, '\u201c')   // â€œ → "
    .replace(/\u00e2\u20ac[\u009c\u009d]/g, '\u201d') // â€\x9d → "
    .replace(/\u00e2\u20ac\u2018/g, '\u2018')   // â€˜ → '
    // Section sign, middle dot
    .replace(/\u00c2\u00a7/g, '\u00a7')          // Â§ → §
    .replace(/\u00c2\u00b7/g, '\u00b7')          // Â· → ·
    // Bullet
    .replace(/\u00e2\u0080\u00a2/g, '\u2022')   // â€¢ → •
    .replace(/\u00e2\u2022[\u0090-\u009f]/g, '\u2022') // other bullet mojibake → •
    // Normalize to NFC (canonical composition) for deterministic hashing
    .normalize('NFC');
}

/**
 * Strip HTML tags from LLM-generated human-readable text to prevent XSS.
 */
function stripHtml(text: string): string {
  return text
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '');
}

const CONTRACT_TOOL = {
  name: 'create_contract' as const,
  description: 'Create a dual-format Ricardian Contract with human-readable and machine-readable components.',
  input_schema: {
    type: 'object' as const,
    properties: {
      humanReadable: {
        type: 'string' as const,
        description: 'The complete human-readable legal contract text.',
      },
      machineReadable: {
        type: 'object' as const,
        description: 'Structured JSON object containing all contract terms.',
      },
    },
    required: ['humanReadable', 'machineReadable'],
  },
};

export async function generateContract(
  params: GenerateContractParams,
): Promise<GeneratedContract> {
  const systemPrompt = getTemplatePrompt(params.templateSlug);

  // Sanitize user-supplied parameters before they reach the LLM
  const safeParams = sanitizeParameters(params.parameters);

  const userInput = JSON.stringify({
    contract_id: params.contractId,
    template: params.templateSlug,
    parameters: safeParams,
    principal_declaration: params.principalDeclaration,
    generated_at: new Date().toISOString(),
  });

  // Two-mode call:
  // - On Moonshot (Kimi K2.6): response_format JSON mode forces structured
  //   output that we parse from message.content. Tools are still passed but
  //   Moonshot ignores them when response_format is set. JSON mode is Kimi's
  //   documented structured-output path — far more reliable than tool_use
  //   for complex one-shot generation tasks.
  // - On Anthropic (Claude Haiku): tool_choice forces the create_contract
  //   function call; response_format is silently ignored.
  // The text-JSON fallback below handles either output shape uniformly.
  const response = await callChat({
    model: getContractModel(),
    system: systemPrompt,
    messages: [{ role: 'user', content: userInput }],
    tools: [CONTRACT_TOOL as unknown as UnifiedTool],
    toolChoice: { name: 'create_contract' },
    maxTokens: 8192,
    responseFormat: { type: 'json_object' },
    // Contract-gen route runs at maxDuration=300s. Give the LLM a generous
    // 250s ceiling for complex contracts but still cut before Vercel kills us.
    timeoutMs: 250_000,
  });

  // Preferred path: tool-call result. Anthropic forces this via tool_choice,
  // Kimi follows the updated BASE_INSTRUCTIONS that explicitly tells it to
  // call create_contract instead of emitting JSON as text.
  let input: Record<string, unknown> | undefined = response.toolCall?.input;

  // Fallback: when Kimi backslides to text JSON (it sometimes does despite
  // the prompt — RLHF inertia), try to parse the text body as the expected
  // schema. Cheaper than retrying a whole LLM call. Tolerates ```json fences
  // and a single bare JSON object.
  if (!input && response.textReply) {
    const stripped = response.textReply
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '');
    try {
      const parsed = JSON.parse(stripped) as Record<string, unknown>;
      if (
        parsed &&
        typeof parsed.humanReadable === 'string' &&
        parsed.machineReadable &&
        typeof parsed.machineReadable === 'object'
      ) {
        input = parsed;
        console.warn(
          `[contract-gen] LLM (${response.modelUsed}) bypassed tool_use; ` +
          `parsed text body as JSON fallback. Consider tightening prompt.`,
        );
      }
    } catch {
      // Fall through to the throw below
    }
  }

  if (!input) {
    // No tool_call and JSON-text fallback didn't find usable JSON.
    // Dump everything we have so a screenshot from the user tells us
    // exactly what Kimi returned — no more guessing.
    const debug = {
      model: response.modelUsed,
      provider: response.providerUsed,
      truncated: response.truncated ?? false,
      tokens_in: response.usage?.input_tokens,
      tokens_out: response.usage?.output_tokens,
      textReply_length: response.textReply?.length ?? 0,
      textReply_preview: response.textReply
        ? response.textReply.slice(0, 300)
        : '(null/empty)',
    };
    console.error('[contract-gen] failed with empty/unparseable response:', JSON.stringify(debug));
    throw new Error(
      `Contract LLM (${response.modelUsed}) returned no usable response. ` +
      `truncated=${debug.truncated} tokens_out=${debug.tokens_out} reply_len=${debug.textReply_length} preview="${debug.textReply_preview}"`,
    );
  }

  if (!input.humanReadable || !input.machineReadable) {
    throw new Error(
      'LLM response missing humanReadable or machineReadable fields',
    );
  }

  // ─── Output validation ────────────────────────────────

  // Fix encoding mojibake + strip HTML (order matters: fix encoding first,
  // then strip tags, so the hash is computed on clean, correct text)
  const humanReadable = stripHtml(fixMojibake(input.humanReadable as string));

  // Validate machine-readable structure — reject prototype pollution
  const machineReadable = input.machineReadable as Record<string, unknown>;
  for (const key of Object.keys(machineReadable)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      delete machineReadable[key];
    }
  }

  // Cross-check: verify LLM didn't alter critical financial parameters.
  // If the user submitted spending_limit_monthly=5000 but the LLM output
  // has spending_limit_monthly=999999, something went wrong (injection or
  // hallucination). Log the mismatch but don't block — the hash verification
  // on the reader portal is the final integrity check.
  const financialKeys = [
    'spending_limit_per_tx', 'spending_limit_monthly', 'total_price',
    'monthly_fee', 'price_per_call', 'budget_usd', 'shared_budget_monthly',
  ];
  for (const fk of financialKeys) {
    if (
      safeParams[fk] !== undefined &&
      machineReadable[fk] !== undefined &&
      String(safeParams[fk]) !== String(machineReadable[fk])
    ) {
      console.warn(
        `[SECURITY] LLM altered financial parameter '${fk}': ` +
        `input=${safeParams[fk]}, output=${machineReadable[fk]}. ` +
        `Contract ${params.contractId}. Possible injection or hallucination.`,
      );
    }
  }

  // Enrich machine-readable layer with oversight metadata
  machineReadable.schema_version = '1.0.0';

  machineReadable.compliance = {
    ...(machineReadable.compliance as Record<string, unknown> || {}),
    human_oversight_method: params.templateSlug.startsWith('d')
      ? 'pre-authorized delegation'
      : 'delegated authority',
    oversight_framework: 'eu_ai_act_article_14',
    delegation_chain_auditable: true,
    revocation_capable: true,
  };

  return {
    humanReadable,
    machineReadable,
  };
}
