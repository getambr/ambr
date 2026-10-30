/**
 * Ambr MCP Server — JSON-RPC protocol handler.
 *
 * Implements the Model Context Protocol over Streamable HTTP (stateless, JSON mode).
 * Wraps existing Ambr API functions as MCP tools so AI agents can create,
 * retrieve, and verify contracts programmatically.
 */

import { createHash } from 'crypto';
import { getSupabase } from '@/lib/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { contractRefColumn, INVALID_CONTRACT_REF } from '@/lib/contract/lookup';
import { evaluateContractValidity } from '@/lib/contract/validity';
import { effectivePrincipalWallet, findPartyWalletProblem } from '@/lib/contract/same-wallet';
import { mcpNextStepLines } from '@/lib/contract/next-step';
import { accountPrincipalWallet } from '@/lib/contract/account-wallets';
import { resolveOversight, applyThresholdToDocument } from '@/lib/compliance/oversight-gate';
import { generateContract } from '@/lib/llm/generate-contract';
import {
  hashContract,
  verifyContractHash,
  generateContractId,
  storeContract,
  decrementCredits,
  grantCredits,
} from '@/lib/contract-engine';
import { hasEnoughCredits, UNLIMITED_CREDITS } from '@/lib/credits';
import { logAudit } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { linkPaymentToContract } from '@/lib/x402/middleware';
import {
  generationUnavailableBody,
  getProviderUnavailableSeconds,
  recordGenerationFailure,
  recordGenerationSuccess,
} from '@/lib/llm/availability';
import {
  generationTimeoutBody,
  paymentStatusUnknownBody,
  pastSettleDeadline,
  publicSettleReason,
} from '@/lib/x402/settle-failure';

/** Keep equal to `maxDuration` in app/api/mcp/route.ts (Next needs that one as a literal). */
const MCP_MAX_DURATION_SECONDS = 300;
import type { AuthContext } from '@/lib/adapters/payment/index';
import { checkAgentLimit, incrementAgentUsage } from '@/lib/agent-limits';
import { LEGIBILITY_CLAUSE } from '@/lib/governance/principle';
import { deriveCapabilities } from '@/lib/contract-capabilities';

/**
 * Compact, machine-readable "binding terms" block so a counterparty agent can
 * read exactly what the delegated agent may/may not do and act within it.
 * Returns an empty array for contracts that carry no delegation-style scope.
 */
function bindingTermsBlock(machineReadable: Record<string, unknown> | null): string[] {
  const cap = deriveCapabilities(machineReadable);
  if (!cap) return [];
  return [
    '',
    '## Binding Terms (machine-readable)',
    '',
    'An agent acting under this contract must stay within these terms:',
    '```json',
    JSON.stringify(cap, null, 2),
    '```',
  ];
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface ApiKeyContext {
  keyId: string;
  email: string;
  credits: number;
  tier: string;
  principalWallet: string | null;
  delegationScope: { actions: string[]; templates?: string[] } | null;
  agentDailyLimit: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Newest first. `initialize` negotiates within this set; `server/discover`
// advertises the whole list.
//
// 2026-07-28 is claimed deliberately and it is honest for THIS server: that
// revision's headline change is making MCP stateless, and this endpoint has been
// stateless since it was written — no sessions, no Mcp-Session-Id, no
// server-initiated SSE. It offers only tools, so the parts we do not implement
// (MRTR, sampling, elicitation, roots, logging) are parts a tools-only server is
// never asked for.
const SUPPORTED_PROTOCOL_VERSIONS = [
  '2026-07-28',
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
] as const;

// What `initialize` falls back to when a client asks for something we do not
// speak. Kept at the oldest for maximum compatibility with existing integrations.
const PROTOCOL_VERSION = '2025-03-26';

const SERVER_INFO = {
  name: 'ambr-mcp-server',
  version: '1.0.0',
};

// ---------------------------------------------------------------------------
// Tool definitions (MCP JSON Schema format)
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'ambr_list_templates',
    description: `List available contract templates on Ambr.

Returns all active Ricardian Contract templates with their slugs, names, descriptions,
categories, parameter schemas, and pricing. Use this to discover which templates are
available before creating a contract with ambr_create_contract.

No authentication required.

Returns: Array of template objects with slug, name, description, category,
parameter_schema, price_cents, and version fields.

Legibility: templates are the parameter schema for the dual-format contracts you create — starting here keeps your request conformant and your output defensible.`,
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'ambr_create_contract',
    description: `Generate a Ricardian Contract from a template.

Creates a dual-format contract (human-readable legal text + machine-parsable JSON)
using AI, linked by SHA-256 hash. The contract is stored on Ambr and accessible
via the Reader Portal.

Requires a valid API key (X-API-Key header on the HTTP request) with available credits.
Use ambr_list_templates first to discover templates and their required parameters.

Args:
  - template (string, required): Template slug (e.g. "d1-general-auth")
  - parameters (object, required): Template-specific parameters matching the schema
  - principal_declaration (object, required): { agent_id, principal_name, principal_type }
  - principal_wallet (string, optional): the deploying party's own wallet. It must differ from the
    counterparty wallet in parameters (same_wallet_both_parties otherwise); left out, the first
    wallet that signs fills the principal side
  - parent_contract_hash (string, optional): SHA-256 hash of parent contract for amendments
  - oversight_threshold_usd (number, optional): spending level above which work created under
    this contract needs human approval. Children exceeding it halt at awaiting_principal_approval.
  - amendment_type (string, optional): "original" | "amendment" | "extension"

Returns:
  - contract_id: Unique ID (e.g. "amb-2026-0042")
  - sha256_hash: SHA-256 hash for verification
  - status: Contract status
  - reader_url: URL to view in Reader Portal
  - credits_remaining: Remaining API credits

Legibility: ${LEGIBILITY_CLAUSE}`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        template: {
          type: 'string',
          description: 'Template slug from ambr_list_templates',
        },
        parameters: {
          type: 'object',
          description: 'Template-specific parameters',
          additionalProperties: true,
        },
        principal_declaration: {
          type: 'object',
          properties: {
            agent_id: { type: 'string', description: 'Agent identifier' },
            principal_name: {
              type: 'string',
              description: 'Name of the principal (person or company)',
            },
            principal_type: {
              type: 'string',
              enum: ['company', 'individual'],
              description: 'Type of principal',
            },
          },
          required: ['agent_id', 'principal_name', 'principal_type'],
        },
        principal_wallet: {
          type: 'string',
          description:
            "The deploying party's own wallet (0x…). Must differ from the counterparty wallet in parameters.",
        },
        parent_contract_hash: {
          type: 'string',
          description: 'SHA-256 hash of parent contract (for amendments)',
        },
        oversight_threshold_usd: {
          type: 'number',
          description:
            'Spending level above which work created UNDER this contract requires human approval. ' +
            'A child contract exceeding the parent threshold is held at awaiting_principal_approval ' +
            'until a human signs, and cannot be signed or activated before then (EU AI Act Art. 14).',
        },
        amendment_type: {
          type: 'string',
          enum: ['original', 'amendment', 'extension'],
        },
      },
      required: ['template', 'parameters', 'principal_declaration'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'ambr_get_contract',
    description: `Retrieve a contract by ID, SHA-256 hash, or UUID.

With a valid API key (contract creator): returns the full contract including
human-readable text, machine-readable JSON, status, and principal declaration.
Without authentication: returns metadata only (contract_id, status, hash, dates).

Supports three lookup formats:
  - Contract ID: "amb-2026-0042"
  - SHA-256 hash: 64-character hex string
  - UUID: Standard UUID format

Args:
  - id (string, required): Contract ID, SHA-256 hash, or UUID

Returns: Full contract (if authorized) or metadata-only response.

Legibility: retrieval preserves the dual-format pairing — prose and JSON always replay to the same SHA-256.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string',
          description: 'Contract ID (amb-YYYY-NNNN), SHA-256 hash, or UUID',
        },
      },
      required: ['id'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'ambr_get_contract_status',
    description: `Check the status of a contract and its amendment chain.

Returns the current status and any linked amendments (parent or child contracts).
Useful for verifying if a contract is active, amended, or terminated.

Args:
  - id (string, required): Contract ID, SHA-256 hash, or UUID

Returns:
  - contract_id, status, created_at
  - amendment_type, parent_contract_hash
  - amendments: Array of child contracts (if any)

Legibility: amendments are bilateral and themselves dual-format — the chain stays legible from original through every revision.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string',
          description: 'Contract ID (amb-YYYY-NNNN), SHA-256 hash, or UUID',
        },
      },
      required: ['id'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'ambr_verify_hash',
    description: `Verify a contract's SHA-256 hash to confirm document integrity.

Checks whether the provided hash matches a contract stored on Ambr. Returns
verification status, contract metadata, and Reader Portal URL if found.

Args:
  - hash (string, required): SHA-256 hash (64-character hex string)

Returns:
  - verified: boolean
  - contract_id: string (if found)
  - status: string (if found)
  - reader_url: string (if found)

Legibility: verification is the point at which legibility becomes provable — matching hash means the prose a human reads and the JSON a machine parses are the same document that was originally signed.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        hash: {
          type: 'string',
          description: 'SHA-256 hash to verify (64-character hex)',
        },
      },
      required: ['hash'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'ambr_agent_handshake',
    description: `Initiate a handshake on a contract on behalf of your delegating principal.

Requires an API key with an active delegation (principal wallet registered via /api/v1/delegations).
Records the agent's intent to accept, reject, or request changes on the contract.
The principal must separately approve via wallet signature on the Reader Portal.

Args:
  - contract_id (string, required): Contract ID (amb-YYYY-NNNN), SHA-256 hash, or UUID
  - intent (string, required): "accept" | "reject" | "request_changes"
  - message (string, optional): Note for the counterparty
  - visibility_preference (string, optional): "private" | "metadata_only" | "public" | "encrypted"

Returns: Handshake status and next steps for principal approval.

Legibility: the handshake itself is auditable — delegation scope, agent identity, and principal approval are recorded alongside the contract hash.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        contract_id: {
          type: 'string',
          description: 'Contract ID, SHA-256 hash, or UUID',
        },
        intent: {
          type: 'string',
          enum: ['accept', 'reject', 'request_changes'],
          description: 'Handshake intent',
        },
        message: {
          type: 'string',
          description: 'Optional note for counterparty',
        },
        visibility_preference: {
          type: 'string',
          enum: ['private', 'metadata_only', 'public', 'encrypted'],
          description: 'Optional visibility preference for negotiation',
        },
      },
      required: ['contract_id', 'intent'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];

// ---------------------------------------------------------------------------
// API key validation (extracted from api-auth.ts for direct use)
// ---------------------------------------------------------------------------

async function validateApiKeyDirect(
  apiKey: string,
): Promise<ApiKeyContext | null> {
  const keyHash = createHash('sha256').update(apiKey).digest('hex');
  const db = getSupabaseAdmin();

  const { data, error } = await db
    .from('api_keys')
    .select('id, email, credits, tier, is_active, principal_wallet, delegation_scope, agent_daily_limit')
    .eq('key_hash', keyHash)
    .single();

  if (error || !data || !data.is_active) return null;

  await db
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id);

  return {
    keyId: data.id,
    email: data.email,
    credits: data.credits,
    tier: data.tier,
    principalWallet: data.principal_wallet || null,
    delegationScope: data.delegation_scope as { actions: string[]; templates?: string[] } | null,
    agentDailyLimit: data.agent_daily_limit ?? 10,
  };
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

async function handleListTemplates(): Promise<{
  content: { type: string; text: string }[];
}> {
  const db = getSupabase();
  const { data, error } = await db
    .from('templates')
    .select(
      'slug, name, description, category, parameter_schema, price_cents, version',
    )
    .eq('is_active', true)
    .order('category');

  if (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error fetching templates: ${error.message}`,
        },
      ],
    };
  }

  const lines = ['# Available Contract Templates', ''];
  for (const t of data ?? []) {
    lines.push(`## ${t.name} (\`${t.slug}\`)`);
    lines.push(`- **Category:** ${t.category}`);
    lines.push(`- **Description:** ${t.description}`);
    lines.push(`- **Cost:** ${t.price_cents} credits (1 credit = 1 US cent)`);
    lines.push(`- **Version:** ${t.version}`);
    if (t.parameter_schema) {
      lines.push(
        `- **Parameters:** \`${JSON.stringify(t.parameter_schema)}\``,
      );
    }
    lines.push('');
  }

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

/**
 * Tool result for a provider usage-limit outage. structuredContent carries the
 * retry time so /api/mcp can answer HTTP 503 with a Retry-After header.
 */
function generationUnavailableResult(retryAfterSeconds: number) {
  const body = generationUnavailableBody(retryAfterSeconds);
  return {
    content: [
      {
        type: 'text',
        text: `Error: ${body.error}. ${body.message} Retry after ${retryAfterSeconds}s.`,
      },
    ],
    isError: true,
    structuredContent: body as Record<string, unknown>,
  };
}

async function handleCreateContract(
  args: Record<string, unknown>,
  apiKey: string | undefined,
  authCtx?: AuthContext,
  requestStartedAt?: number,
): Promise<{
  content: { type: string; text: string }[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
}> {
  // The route's start time when it passed one: payment verification (up to the
  // facilitator timeout plus a cold start) has already used part of maxDuration
  // by the time this handler runs.
  const startedAt = requestStartedAt ?? Date.now();
  // Provider known to be out of quota: refuse before charging or settling anything.
  const providerDownSeconds = getProviderUnavailableSeconds();
  if (providerDownSeconds !== null) return generationUnavailableResult(providerDownSeconds);

  // Auth: prefer authCtx if provided (threaded from route), otherwise validate apiKey
  let apiKeyCtx: ApiKeyContext | null = null;

  if (authCtx?.type === 'api_key') {
    // Reconstruct ApiKeyContext from AuthContext for existing code paths
    apiKeyCtx = {
      keyId: authCtx.keyId!,
      email: authCtx.email!,
      credits: authCtx.credits!,
      tier: authCtx.tier!,
      principalWallet: authCtx.principalWallet || null,
      delegationScope: null,
      agentDailyLimit: authCtx.agentDailyLimit ?? 10,
    };
  } else if (!authCtx && apiKey) {
    // Fallback: route didn't thread authCtx; validate apiKey ourselves
    apiKeyCtx = await validateApiKeyDirect(apiKey);
    if (!apiKeyCtx) {
      return {
        content: [{ type: 'text', text: 'Error: Invalid or inactive API key.' }],
        isError: true,
      };
    }
  } else if (!authCtx) {
    return {
      content: [
        {
          type: 'text',
          text: 'Error: API key or x402 payment required. Pass X-API-Key header, or pay with a standard x402 v2 client (the 402 response carries a PAYMENT-REQUIRED header; retry with PAYMENT-SIGNATURE).',
        },
      ],
      isError: true,
    };
  }
  // else: authCtx.type === 'x402' — payment verified at route layer

  // Rate limit (by key ID for API users, by wallet for x402 payers)
  const rlKey = apiKeyCtx
    ? `mcp:${apiKeyCtx.keyId}`
    : `mcp:x402:${authCtx!.payerWallet}`;
  const rl = rateLimit(rlKey, 10, 60_000);
  if (!rl.allowed) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: Rate limit exceeded. Retry after ${Math.ceil((rl.resetAt - Date.now()) / 1000)}s.`,
        },
      ],
      isError: true,
    };
  }

  // Agent daily limit (delegated agents only, API key path only)
  if (apiKeyCtx && apiKeyCtx.principalWallet) {
    const agentCheck = await checkAgentLimit(
      apiKeyCtx.keyId,
      apiKeyCtx.principalWallet,
      apiKeyCtx.agentDailyLimit,
    );
    if (!agentCheck.allowed) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: Agent daily limit reached (${agentCheck.used}/${agentCheck.limit}). Resets at midnight UTC.`,
          },
        ],
        isError: true,
      };
    }
  }

  // Validate args
  const template = args.template as string | undefined;
  const parameters = args.parameters as Record<string, unknown> | undefined;
  const principalDecl = args.principal_declaration as
    | Record<string, unknown>
    | undefined;

  if (!template || !parameters || !principalDecl) {
    return {
      content: [
        {
          type: 'text',
          text: 'Error: Missing required fields: template, parameters, principal_declaration.',
        },
      ],
      isError: true,
    };
  }

  if (
    !principalDecl.agent_id ||
    !principalDecl.principal_name ||
    !principalDecl.principal_type
  ) {
    return {
      content: [
        {
          type: 'text',
          text: 'Error: principal_declaration requires agent_id, principal_name, and principal_type.',
        },
      ],
      isError: true,
    };
  }

  const principalWallet = typeof args.principal_wallet === 'string' ? args.principal_wallet.trim() : null;
  if (principalWallet && !/^0x[a-fA-F0-9]{40}$/.test(principalWallet)) {
    return {
      content: [{ type: 'text', text: 'Error: principal_wallet must be a valid Ethereum address.' }],
      isError: true,
    };
  }

  // A contract nobody could sign (one wallet on both sides, or a one-sided
  // template with no signer wallet): refuse before any credit is burned or
  // payment settled. (The HTTP route runs the same guard even earlier, before
  // an x402 payment is verified.)
  const walletProblem = await findPartyWalletProblem({ template, principal_wallet: principalWallet, parameters });
  if (walletProblem) {
    return {
      content: [{ type: 'text', text: `Error: ${walletProblem.error}. ${walletProblem.message}` }],
      isError: true,
      structuredContent: { ...walletProblem },
    };
  }

  // Lookup template
  const db = getSupabaseAdmin();
  const { data: tmpl } = await db
    .from('templates')
    .select('id, slug, category, price_cents, is_one_sided')
    .eq('slug', template)
    .eq('is_active', true)
    .single();

  if (!tmpl) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: Template '${template}' not found. Use ambr_list_templates to see available templates.`,
        },
      ],
      isError: true,
    };
  }

  // Credits check (API key path only — x402 already paid). 1 credit = 1 cent.
  const priceCents = tmpl.price_cents as number;
  if (apiKeyCtx && !hasEnoughCredits(apiKeyCtx.credits, priceCents)) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: insufficient_credits. This template costs ${priceCents} credits (1 credit = 1 US cent) and the key has ${apiKeyCtx.credits}. Pay per-contract via x402 (PAYMENT-SIGNATURE header) or purchase more at ambr.run.`,
        },
      ],
      isError: true,
    };
  }

  // EU AI Act Article 14. This door must apply the oversight gate: passing
  // parent_contract_hash through to storeContract without looking at the
  // parent's threshold would let an agent creating a mandate over MCP or A2A
  // get a plain draft while the identical request over REST halts for approval.
  // That is backwards — a person at a dashboard is already the human in the
  // loop; an agent acting alone is the case Article 14 exists for. Shared
  // with the REST route so the two cannot diverge. Read-only, so it runs
  // before any money moves.
  let oversight: Awaited<ReturnType<typeof resolveOversight>>;
  try {
    oversight = await resolveOversight({
      declaredThresholdUsd:
        typeof args.oversight_threshold_usd === 'number' ? args.oversight_threshold_usd : null,
      parentContractHash: (args.parent_contract_hash as string | undefined) ?? null,
      parameters,
    });
  } catch (err) {
    console.error('[mcp] oversight check failed:', err);
    return {
      content: [{ type: 'text', text: 'Error: Contract generation failed. Please try again.' }],
      isError: true,
    };
  }

  // api key: atomic burn before the work, so a call that races the pre-check
  // above cannot get a contract for free (refunded in the catch below when
  // generation fails). An x402 payment is NOT taken here: it settles after the
  // contract has been generated.
  let burnedBalance: number | null = null;
  if (apiKeyCtx) {
    burnedBalance = await decrementCredits(apiKeyCtx.keyId, priceCents);
    if (burnedBalance === null) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: insufficient_credits. This template costs ${priceCents} credits (1 credit = 1 US cent). Pay per-contract via x402 (PAYMENT-SIGNATURE header) or purchase more at ambr.run.`,
          },
        ],
        isError: true,
      };
    }
  }

  let contractStored = false;
  let x402Settled = false;
  try {
    const contractId = await generateContractId();
    const { humanReadable, machineReadable } = await generateContract({
      templateSlug: tmpl.slug,
      parameters,
      principalDeclaration: {
        agent_id: principalDecl.agent_id as string,
        principal_name: principalDecl.principal_name as string,
        principal_type: principalDecl.principal_type as string,
      },
      contractId,
    });
    recordGenerationSuccess();

    // Before hashing: the limit must be inside the document the SHA-256 commits to.
    applyThresholdToDocument(machineReadable as Record<string, unknown>, oversight.oversightThresholdUsd);

    const sha256Hash = hashContract(humanReadable, machineReadable);

    // x402: settle the verified payment now that the contract exists. The result
    // is written onto authCtx (txHash, paymentResponseHeaders) because the route
    // reads the PAYMENT-RESPONSE header from the same object once this returns.
    // If it does not settle, the generated contract is discarded and nothing is
    // stored.
    if (authCtx?.type === 'x402') {
      // Never settle when the function could be killed before the insert below.
      if (pastSettleDeadline(startedAt, MCP_MAX_DURATION_SECONDS)) {
        await logAudit({
          event_type: 'x402_generation_failed_not_settled',
          severity: 'warn',
          actor: authCtx.payerWallet ?? 'unknown',
          details: {
            payer: authCtx.payerWallet,
            amount_usdc: authCtx.amountUsdc,
            resource: authCtx.resource,
            template: tmpl.slug,
            money_moved: false,
            reason: 'deadline',
            elapsed_ms: Date.now() - startedAt,
            via: 'mcp',
          },
        });
        const body = generationTimeoutBody();
        return {
          content: [{ type: 'text', text: `Error: ${body.error}. ${body.message}` }],
          isError: true,
          structuredContent: body as Record<string, unknown>,
        };
      }
      const settled = authCtx.settle ? await authCtx.settle() : null;
      if (!settled || !settled.ok) {
        // A missing settle() moved nothing; otherwise trust the middleware's flag.
        const ambiguous = settled?.ambiguous === true;
        // One audit row per settle failure. The raw reason stays here; the tool
        // result only ever carries a facilitator code.
        await logAudit({
          event_type: 'x402_settle_failed',
          severity: ambiguous ? 'error' : 'warn',
          actor: authCtx.payerWallet ?? 'unknown',
          details: {
            payer: authCtx.payerWallet,
            template: tmpl.slug,
            amount_usdc: authCtx.amountUsdc,
            resource: authCtx.resource,
            reason: settled?.reason ?? 'settle unavailable',
            money_moved: ambiguous ? 'unknown' : false,
            nonce: settled?.nonce,
            via: 'mcp',
          },
        });
        if (ambiguous) {
          const body = paymentStatusUnknownBody(settled?.nonce);
          return {
            content: [{ type: 'text', text: `Error: ${body.error}. ${body.message}` }],
            isError: true,
            structuredContent: body as Record<string, unknown>,
          };
        }
        const reason = publicSettleReason(settled?.reason);
        return {
          content: [
            {
              type: 'text',
              text: `Error: payment_settlement_failed${reason ? ` (${reason})` : ''}. The x402 payment did not settle and nothing was charged. Retry with a fresh PAYMENT-SIGNATURE.`,
            },
          ],
          isError: true,
        };
      }
      x402Settled = true;
      authCtx.payerWallet = settled.payerWallet;
      authCtx.txHash = settled.txHash;
      authCtx.paymentResponseHeaders = settled.headers;
    }

    const isX402 = authCtx?.type === 'x402';
    const contract = await storeContract({
      contractId,
      templateId: tmpl.id,
      contractType: tmpl.category,
      humanReadable,
      machineReadable,
      sha256Hash,
      principalDeclaration: principalDecl,
      parameters,
      apiKeyId: apiKeyCtx?.keyId,
      payerWallet: isX402 ? authCtx!.payerWallet : undefined,
      paymentMethod: isX402 ? 'x402' : 'api_key',
      parentContractHash: args.parent_contract_hash as string | undefined,
      oversightThresholdUsd: oversight.oversightThresholdUsd,
      principalApprovalRequired: oversight.requiresPrincipalApproval,
      initialStatus: oversight.requiresPrincipalApproval ? 'awaiting_principal_approval' : undefined,
      principalWallet: effectivePrincipalWallet(
        { principal_wallet: principalWallet, parameters },
        Boolean(tmpl.is_one_sided),
        // The creating account's wallet when the request names no principal
        // side (lib/contract/account-wallets.ts); an x402 payer has no account.
        apiKeyCtx && !principalWallet && !tmpl.is_one_sided
          ? await accountPrincipalWallet(apiKeyCtx.keyId, principalDecl.agent_id)
          : null,
      ),
      isOneSided: Boolean(tmpl.is_one_sided),
      amendmentType: args.amendment_type as
        | 'original'
        | 'amendment'
        | 'extension'
        | undefined,
    });

    contractStored = true;

    // The contract exists from here on: a throw in these steps must not land in
    // the generation-failed branch and report failure for a stored contract.
    try {
      // Post-creation: track agent usage (api_key) or link payment (x402);
      // credits were burned before generation.
      if (apiKeyCtx) {
        if (apiKeyCtx.principalWallet) {
          await incrementAgentUsage(apiKeyCtx.keyId, apiKeyCtx.principalWallet);
        }
      }
      if (isX402 && authCtx!.txHash) {
        await linkPaymentToContract(authCtx!.txHash, contract.id);
      }

      const creditsLine = apiKeyCtx
        ? `- **Credits remaining:** ${burnedBalance === UNLIMITED_CREDITS ? 'unlimited' : burnedBalance ?? 0}`
        : `- **Payment:** x402 (USDC on Base) \`${authCtx!.txHash}\``;

      const result = {
        contract_id: contract.contract_id,
        sha256_hash: contract.sha256_hash,
        status: contract.status,
        reader_url: `https://getamber.dev/reader/${contract.sha256_hash}`,
        sign_url: `https://getamber.dev/api/v1/contracts/${contract.contract_id}/sign`,
        created_at: contract.created_at,
      };

      return {
        content: [
          {
            type: 'text',
            text: [
              oversight.requiresPrincipalApproval
                ? '# Contract Created — Human Approval Required'
                : '# Contract Created (Draft)',
              '',
              `- **Contract ID:** ${result.contract_id}`,
              `- **SHA-256 Hash:** \`${result.sha256_hash}\``,
              `- **Status:** ${result.status}`,
              `- **Reader URL:** ${result.reader_url}`,
              `- **Sign URL:** ${result.sign_url}`,
              creditsLine,
              '',
              ...(oversight.requiresPrincipalApproval
                ? [
                    `- **Oversight threshold:** $${oversight.governingThresholdUsd}`,
                    `- **This contract's value:** $${oversight.transactionValueUsd}`,
                    `- **Approve URL:** https://getamber.dev/api/v1/contracts/${result.contract_id}/approve`,
                    '',
                    '**This contract cannot proceed to signing yet.** It exceeds the oversight',
                    'threshold set by its parent mandate, so EU AI Act Article 14 human approval is',
                    'required first. A human principal must POST a wallet signature to the Approve URL;',
                    'the signed message must contain the contract SHA-256 hash and state approval intent.',
                    'An agent cannot clear this gate on its own behalf.',
                  ]
                : mcpNextStepLines(Boolean(tmpl.is_one_sided))),
            ].join('\n'),
          },
        ],
      };
    } catch (postErr) {
      console.error('[mcp] post-store step failed', contract.contract_id, postErr);
      await logAudit({
        event_type: 'post_store_step_failed',
        severity: 'error',
        actor: apiKeyCtx?.keyId ?? authCtx?.payerWallet ?? 'unknown',
        details: {
          contract_id: contract.contract_id,
          tx_hash: authCtx?.txHash,
          via: 'mcp',
          message: postErr instanceof Error ? postErr.message : String(postErr),
        },
      });
      return {
        content: [
          {
            type: 'text',
            text: [
              '# Contract Created (Draft)',
              '',
              `- **Contract ID:** ${contract.contract_id}`,
              `- **SHA-256 Hash:** \`${contract.sha256_hash}\``,
              `- **Reader URL:** https://getamber.dev/reader/${contract.sha256_hash}`,
              `- **Sign URL:** https://getamber.dev/api/v1/contracts/${contract.contract_id}/sign`,
            ].join('\n'),
          },
        ],
      };
    }
  } catch (err) {
    // Upstream error text stays in the log and the audit details, never in the
    // tool result.
    console.error('[mcp] contract creation failed:', err);
    const failure = recordGenerationFailure(err);
    const upstream = { error_class: failure.errorClass, error_message: failure.errorMessage.slice(0, 500) };
    // Credits were burned before generation: give them back. An x402 payment is
    // settled only after generation, so before that nothing needs refunding.
    let refundNote = '';
    if (!contractStored) {
      if (apiKeyCtx) {
        const refunded = (await grantCredits(apiKeyCtx.keyId, priceCents)) !== null;
        await logAudit({
          event_type: 'credits_refunded_generation_failed',
          severity: refunded ? 'warn' : 'error',
          actor: apiKeyCtx.keyId,
          details: { template: tmpl.slug, credits: priceCents, refunded, via: 'mcp', ...upstream },
        });
      } else if (authCtx?.type === 'x402' && x402Settled) {
        // Narrow case: the payment settled but the contract could not be stored.
        await logAudit({
          event_type: 'x402_settled_no_contract',
          severity: 'error',
          actor: authCtx.payerWallet ?? 'unknown',
          details: {
            tx_hash: authCtx.txHash,
            payer: authCtx.payerWallet,
            amount_usdc: authCtx.amountUsdc,
            resource: authCtx.resource,
            template: tmpl.slug,
            via: 'mcp',
            ...upstream,
          },
        });
        refundNote = ` The payment settled (tx ${authCtx.txHash}); support will refund it.`;
      } else if (authCtx?.type === 'x402') {
        await logAudit({
          event_type: 'x402_generation_failed_not_settled',
          severity: failure.unavailable ? 'warn' : 'error',
          actor: authCtx.payerWallet ?? 'unknown',
          details: {
            payer: authCtx.payerWallet,
            amount_usdc: authCtx.amountUsdc,
            resource: authCtx.resource,
            template: tmpl.slug,
            money_moved: false,
            via: 'mcp',
            ...upstream,
          },
        });
      }
    }
    if (failure.unavailable && !refundNote) return generationUnavailableResult(failure.retryAfterSeconds);
    return {
      content: [
        {
          type: 'text',
          text: refundNote
            ? `Error: The payment settled but the contract could not be stored.${refundNote}`
            : 'Error: Contract generation failed. Please try again.',
        },
      ],
      isError: true,
    };
  }
}

async function handleGetContract(
  args: Record<string, unknown>,
  apiKey: string | undefined,
): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
  const id = args.id as string | undefined;
  if (!id) {
    return {
      content: [{ type: 'text', text: 'Error: id is required.' }],
      isError: true,
    };
  }

  const db = getSupabaseAdmin();
  let query = db.from('contracts').select('*');

  const column = contractRefColumn(id);
  if (!column) {
    return {
      content: [{ type: 'text', text: `Error: ${INVALID_CONTRACT_REF.message}` }],
      isError: true,
    };
  }
  query = query.eq(column, id);

  const { data: contract, error } = await query.single();

  if (error || !contract) {
    return {
      content: [{ type: 'text', text: `Error: Contract '${id}' not found.` }],
      isError: true,
    };
  }

  // Check if caller is authorized for full text (contract creator via API key)
  let authorized = false;
  if (apiKey) {
    const apiCtx = await validateApiKeyDirect(apiKey);
    if (apiCtx && apiCtx.keyId === contract.api_key_id) {
      authorized = true;
    }
  }

  if (authorized) {
    return {
      content: [
        {
          type: 'text',
          text: [
            `# Contract: ${contract.contract_id}`,
            '',
            `- **Status:** ${contract.status}`,
            `- **SHA-256:** \`${contract.sha256_hash}\``,
            `- **Created:** ${contract.created_at}`,
            `- **Amendment type:** ${contract.amendment_type || 'original'}`,
            contract.parent_contract_hash
              ? `- **Parent hash:** \`${contract.parent_contract_hash}\``
              : '',
            `- **Reader URL:** https://getamber.dev/reader/${contract.sha256_hash}`,
            '',
            '## Human-Readable Contract',
            '',
            contract.human_readable,
            '',
            '## Machine-Readable (JSON)',
            '',
            '```json',
            JSON.stringify(contract.machine_readable, null, 2),
            '```',
            ...bindingTermsBlock(contract.machine_readable),
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
    };
  }

  // Metadata-only response (GDPR Art. 5 data-minimization aligned). The binding
  // terms (what the agent may/may not do) are exposed to unauthenticated callers
  // only when the contract's visibility is meant to be shareable — so a
  // counterparty agent can read the scope it must respect without seeing the
  // full prose / party PII.
  const termsVisible = contract.visibility === 'public' || contract.visibility === 'metadata_only';
  return {
    content: [
      {
        type: 'text',
        text: [
          `# Contract: ${contract.contract_id} (Metadata Only)`,
          '',
          `- **Status:** ${contract.status}`,
          `- **SHA-256:** \`${contract.sha256_hash}\``,
          `- **Created:** ${contract.created_at}`,
          `- **Amendment type:** ${contract.amendment_type || 'original'}`,
          contract.parent_contract_hash
            ? `- **Parent hash:** \`${contract.parent_contract_hash}\``
            : '',
          `- **Reader URL:** https://getamber.dev/reader/${contract.sha256_hash}`,
          ...(termsVisible ? bindingTermsBlock(contract.machine_readable) : []),
          '',
          '*Full contract text requires authentication. Pass your API key (contract creator) in the X-API-Key HTTP header.*',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
  };
}

async function handleGetContractStatus(
  args: Record<string, unknown>,
): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
  const id = args.id as string | undefined;
  if (!id) {
    return {
      content: [{ type: 'text', text: 'Error: id is required.' }],
      isError: true,
    };
  }

  const db = getSupabaseAdmin();
  let query = db
    .from('contracts')
    .select(
      'id, contract_id, status, created_at, amendment_type, parent_contract_hash, sha256_hash, revoked_at, revocation_reason, expiry_date, visibility, human_readable, machine_readable, principal_wallet, is_one_sided, parameters',
    );

  const column = contractRefColumn(id);
  if (!column) {
    return {
      content: [{ type: 'text', text: `Error: ${INVALID_CONTRACT_REF.message}` }],
      isError: true,
    };
  }
  query = query.eq(column, id);

  const { data: contract, error } = await query.single();

  if (error || !contract) {
    return {
      content: [{ type: 'text', text: `Error: Contract '${id}' not found.` }],
      isError: true,
    };
  }

  // Find amendments (child contracts referencing this hash)
  const { data: amendments } = await db
    .from('contracts')
    .select('contract_id, status, amendment_type, created_at, sha256_hash')
    .eq('parent_contract_hash', contract.sha256_hash)
    .order('created_at', { ascending: true });

  // Validity is derived at read time by the same rule as GET /contracts/:id/status
  // (lib/contract/validity.ts): active, not revoked, not expired, every required
  // signature on file, stored text matching its creation hash.
  const { data: signatureRows } = await db
    .from('signatures')
    .select('signer_wallet')
    .eq('contract_id', contract.id);
  const validity = await evaluateContractValidity(
    db,
    contract as unknown as Parameters<typeof evaluateContractValidity>[1],
    (signatureRows ?? []).map((r) => r.signer_wallet as string),
  );
  const { isCurrentlyValid, isExpired } = validity;
  // This handler is reachable without auth — the free-text revocation reason
  // is only shown for contracts whose metadata is meant to be public.
  const showReason =
    contract.visibility === 'public' || contract.visibility === 'metadata_only';

  const lines = [
    `# Contract Status: ${contract.contract_id}`,
    '',
    `- **Status:** ${contract.status}`,
    `- **Currently valid:** ${isCurrentlyValid ? 'yes' : 'no'}`,
    validity.reasons.length > 0 ? `- **Not valid because:** ${validity.reasons.join(', ')}` : '',
    validity.missingSigners.length > 0
      ? `- **Waiting for signature:** ${validity.missingSigners.join(', ')}`
      : '',
    contract.revoked_at
      ? `- **Revoked:** ${contract.revoked_at}${showReason && contract.revocation_reason ? ` — ${contract.revocation_reason}` : ''}`
      : '',
    contract.expiry_date
      ? `- **${isExpired ? 'Expired' : 'Expires'}:** ${contract.expiry_date}`
      : '',
    `- **Created:** ${contract.created_at}`,
    `- **Amendment type:** ${contract.amendment_type || 'original'}`,
    contract.parent_contract_hash
      ? `- **Parent hash:** \`${contract.parent_contract_hash}\``
      : '',
    `- **SHA-256:** \`${contract.sha256_hash}\``,
  ];

  if (amendments && amendments.length > 0) {
    lines.push('', '## Amendment Chain', '');
    for (const a of amendments) {
      lines.push(
        `- **${a.contract_id}** (${a.amendment_type}) — ${a.status} — ${a.created_at}`,
      );
    }
  }

  return { content: [{ type: 'text', text: lines.filter(Boolean).join('\n') }] };
}

async function handleVerifyHash(
  args: Record<string, unknown>,
): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
  const hash = args.hash as string | undefined;
  if (!hash || !/^[a-f0-9]{64}$/.test(hash)) {
    return {
      content: [
        {
          type: 'text',
          text: 'Error: hash must be a 64-character hex SHA-256 string.',
        },
      ],
      isError: true,
    };
  }

  const db = getSupabaseAdmin();
  const { data: contract } = await db
    .from('contracts')
    .select('contract_id, status, created_at, sha256_hash, human_readable, machine_readable')
    .eq('sha256_hash', hash)
    .single();

  if (!contract) {
    return {
      content: [
        {
          type: 'text',
          text: [
            '# Hash Verification: NOT FOUND',
            '',
            `Hash \`${hash}\` does not match any contract in the Ambr system.`,
            'The document may have been modified or was not created through Ambr.',
          ].join('\n'),
        },
      ],
    };
  }

  // The hash is a stored value: check it still describes the stored text, with
  // the same two-scheme rule as the reader and the status endpoint.
  if (!verifyContractHash(contract)) {
    return {
      content: [
        {
          type: 'text',
          text: [
            '# Hash Verification: MISMATCH',
            '',
            `- **Contract ID:** ${contract.contract_id}`,
            `- **Status:** ${contract.status}`,
            '',
            'The hash is on file, but the stored contract text no longer produces it. Do not rely on this contract.',
          ].join('\n'),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: [
          '# Hash Verification: VERIFIED',
          '',
          `- **Contract ID:** ${contract.contract_id}`,
          `- **Status:** ${contract.status}`,
          `- **Created:** ${contract.created_at}`,
          `- **Reader URL:** https://getamber.dev/reader/${contract.sha256_hash}`,
          '',
          'This hash matches a contract stored on Ambr. The document has not been modified since creation.',
        ].join('\n'),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Agent handshake handler
// ---------------------------------------------------------------------------

async function handleAgentHandshake(
  args: Record<string, unknown>,
  apiKey: string | undefined,
): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
  if (!apiKey) {
    return {
      content: [{ type: 'text', text: 'Error: API key required for agent handshake.' }],
      isError: true,
    };
  }

  const apiCtx = await validateApiKeyDirect(apiKey);
  if (!apiCtx) {
    return {
      content: [{ type: 'text', text: 'Error: Invalid or inactive API key.' }],
      isError: true,
    };
  }

  if (!apiCtx.principalWallet) {
    return {
      content: [{
        type: 'text',
        text: 'Error: No delegation registered. The principal must first register their wallet at POST /api/v1/delegations with this API key.',
      }],
      isError: true,
    };
  }

  const scope = apiCtx.delegationScope;
  if (scope && !scope.actions.includes('handshake')) {
    return {
      content: [{ type: 'text', text: 'Error: Delegation scope does not include handshake permission.' }],
      isError: true,
    };
  }

  const contractId = args.contract_id as string;
  const intent = args.intent as string;
  const message = (args.message as string) || '';
  const visibilityPref = args.visibility_preference as string | undefined;

  if (!contractId || !intent) {
    return {
      content: [{ type: 'text', text: 'Error: contract_id and intent are required.' }],
      isError: true,
    };
  }

  if (!['accept', 'reject', 'request_changes'].includes(intent)) {
    return {
      content: [{ type: 'text', text: 'Error: intent must be accept, reject, or request_changes.' }],
      isError: true,
    };
  }

  const db = getSupabaseAdmin();

  // Find contract
  const column = contractRefColumn(contractId);
  if (!column) {
    return {
      content: [{ type: 'text', text: `Error: ${INVALID_CONTRACT_REF.message}` }],
      isError: true,
    };
  }

  const { data: contract } = await db
    .from('contracts')
    .select('id, contract_id, status, sha256_hash')
    .eq(column, contractId)
    .single();

  if (!contract) {
    return {
      content: [{ type: 'text', text: `Error: Contract not found: ${contractId}` }],
      isError: true,
    };
  }

  if (!['draft', 'handshake'].includes(contract.status)) {
    return {
      content: [{ type: 'text', text: `Error: Contract status is '${contract.status}' — handshake only allowed on draft or handshake contracts.` }],
      isError: true,
    };
  }

  // Upsert handshake
  const handshakeData: Record<string, unknown> = {
    contract_id: contract.id,
    wallet_address: apiCtx.principalWallet.toLowerCase(),
    intent,
    message,
    source: 'agent',
    agent_api_key_id: apiCtx.keyId,
    principal_approved: false,
  };
  if (visibilityPref) handshakeData.visibility_preference = visibilityPref;

  const { error: hsError } = await db
    .from('handshakes')
    .upsert(handshakeData, { onConflict: 'contract_id,wallet_address' });

  if (hsError) {
    return {
      content: [{ type: 'text', text: `Error recording handshake: ${hsError.message}` }],
      isError: true,
    };
  }

  // Update contract status to handshake if currently draft and intent is accept.
  // Surface a failure — otherwise the output below would report a state the
  // database refused to record.
  if (contract.status === 'draft' && intent === 'accept') {
    const { error: transitionError } = await db
      .from('contracts')
      .update({ status: 'handshake' })
      .eq('id', contract.id);
    if (transitionError) {
      return {
        content: [{ type: 'text', text: `Handshake recorded, but the contract status update failed: ${transitionError.message}` }],
        isError: true,
      };
    }
  }

  const readerUrl = `https://getamber.dev/reader/${contract.sha256_hash}`;

  return {
    content: [{
      type: 'text',
      text: [
        '# Agent Handshake Recorded',
        '',
        `- **Contract:** ${contract.contract_id}`,
        `- **Intent:** ${intent}`,
        `- **On behalf of:** ${apiCtx.principalWallet}`,
        `- **Source:** agent (API key ${apiCtx.email})`,
        `- **Principal approved:** No (pending)`,
        '',
        '## Next Step',
        `The principal must approve this handshake by connecting their wallet at:`,
        readerUrl,
        '',
        'Once approved, the contract can proceed to signing.',
      ].join('\n'),
    }],
  };
}

// ---------------------------------------------------------------------------
// Tool dispatcher
// ---------------------------------------------------------------------------

async function callTool(
  name: string,
  args: Record<string, unknown>,
  apiKey: string | undefined,
  authCtx?: AuthContext,
  requestStartedAt?: number,
): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
  switch (name) {
    case 'ambr_list_templates':
      return handleListTemplates();
    case 'ambr_create_contract':
      return handleCreateContract(args, apiKey, authCtx, requestStartedAt);
    case 'ambr_get_contract':
      return handleGetContract(args, apiKey);
    case 'ambr_get_contract_status':
      return handleGetContractStatus(args);
    case 'ambr_verify_hash':
      return handleVerifyHash(args);
    case 'ambr_agent_handshake':
      return handleAgentHandshake(args, apiKey);
    default:
      return {
        content: [{ type: 'text', text: `Error: Unknown tool '${name}'.` }],
        isError: true,
      };
  }
}

// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------

function jsonRpcOk(id: string | number | null, result: unknown): JsonRpcResponse {
  // 2026-07-28 requires `resultType` on every result. Older clients ignore the
  // extra field and newer ones are told to treat its absence as 'complete', so
  // adding it is safe in both directions. We never return 'input_required' —
  // that is the MRTR path, and this server does no sampling or elicitation.
  const body =
    result && typeof result === 'object' && !Array.isArray(result)
      ? { resultType: 'complete', ...(result as Record<string, unknown>) }
      : result;
  return { jsonrpc: '2.0', id: id ?? null, result: body };
}

function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message, data } };
}

// ---------------------------------------------------------------------------
// Main message handler
// ---------------------------------------------------------------------------

export async function handleMcpMessage(
  body: unknown,
  apiKey: string | undefined,
  authCtx?: AuthContext,
  requestStartedAt?: number,
): Promise<JsonRpcResponse | null> {
  if (!body || typeof body !== 'object' || !('method' in body)) {
    return jsonRpcError(null, -32600, 'Invalid Request');
  }

  const req = body as JsonRpcRequest;
  const id = req.id ?? null;

  switch (req.method) {
    // 2026-07-28 removes `initialize`, so a client on that revision has no
    // handshake and learns what we speak from here instead. Without it such a
    // client has no route to discover the server at all — which is what made the
    // missing `resultType` matter, since the compatibility rule for omitting it
    // depends on the client knowing the server is on an earlier revision.
    case 'server/discover':
      return jsonRpcOk(id, {
        protocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      });

    case 'initialize': {
      // Negotiate rather than hardcode: answer with the client's version when we
      // speak it, otherwise with our fallback. Previously this replied
      // '2025-03-26' even to a client asking for something newer.
      const asked = (req.params as { protocolVersion?: string } | undefined)
        ?.protocolVersion;
      const agreed =
        asked && (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(asked)
          ? asked
          : PROTOCOL_VERSION;
      return jsonRpcOk(id, {
        protocolVersion: agreed,
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: SERVER_INFO,
      });
    }

    case 'notifications/initialized':
      return null; // Notification — no response

    case 'tools/list':
      // ttlMs + cacheScope satisfy CacheableResult in 2026-07-28 and are ignored
      // by older clients. The tool list is static, so an hour is honest. Public
      // because the list is identical for every caller — auth affects whether a
      // tool SUCCEEDS, never whether it is listed.
      return jsonRpcOk(id, { tools: TOOLS, ttlMs: 3_600_000, cacheScope: 'public' });

    case 'tools/call': {
      const params = req.params as
        | { name: string; arguments?: Record<string, unknown> }
        | undefined;
      if (!params?.name) {
        return jsonRpcError(id, -32602, 'Missing tool name in params');
      }
      const result = await callTool(
        params.name,
        params.arguments ?? {},
        apiKey,
        authCtx,
        requestStartedAt,
      );
      return jsonRpcOk(id, result);
    }

    case 'ping':
      return jsonRpcOk(id, {});

    default:
      return jsonRpcError(id, -32601, `Method not found: ${req.method}`);
  }
}
