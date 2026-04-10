import { getAnthropicClient, CONTRACT_MODEL } from './client';
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
  const client = getAnthropicClient();
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

  const response = await client.messages.create({
    model: CONTRACT_MODEL,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: userInput }],
    tools: [CONTRACT_TOOL],
    tool_choice: { type: 'tool', name: 'create_contract' },
  });

  // Extract tool use result — guaranteed valid JSON by the API
  const toolBlock = response.content.find((b) => b.type === 'tool_use');
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error('LLM did not return tool_use response');
  }

  const input = toolBlock.input as Record<string, unknown>;

  if (!input.humanReadable || !input.machineReadable) {
    throw new Error(
      'LLM response missing humanReadable or machineReadable fields',
    );
  }

  // ─── Output validation ────────────────────────────────

  // Strip HTML from human-readable text (prevent XSS if rendered in browser)
  const humanReadable = stripHtml(input.humanReadable as string);

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
