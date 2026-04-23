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
import { generateContract } from '@/lib/llm/generate-contract';
import {
  hashContract,
  generateContractId,
  storeContract,
  decrementCredits,
} from '@/lib/contract-engine';
import { rateLimit } from '@/lib/rate-limit';
import { linkPaymentToContract } from '@/lib/x402/middleware';
import type { AuthContext } from '@/lib/adapters/payment/index';
import { checkAgentLimit, incrementAgentUsage } from '@/lib/agent-limits';
import { LEGIBILITY_CLAUSE } from '@/lib/governance/principle';

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
  - template (string, required): Template slug (e.g. "c1-agent-delegation")
  - parameters (object, required): Template-specific parameters matching the schema
  - principal_declaration (object, required): { agent_id, principal_name, principal_type }
  - parent_contract_hash (string, optional): SHA-256 hash of parent contract for amendments
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
        parent_contract_hash: {
          type: 'string',
          description: 'SHA-256 hash of parent contract (for amendments)',
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
    lines.push(`- **Cost:** ${t.price_cents / 100} credits`);
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

async function handleCreateContract(
  args: Record<string, unknown>,
  apiKey: string | undefined,
  authCtx?: AuthContext,
): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
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
          text: 'Error: API key or x402 payment required. Pass X-API-Key header, or send a USDC payment on Base to the recipient address and retry with X-Payment header containing the tx hash.',
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

  // Credits check (API key path only — x402 already paid)
  if (apiKeyCtx && apiKeyCtx.credits === 0) {
    return {
      content: [
        {
          type: 'text',
          text: 'Error: No credits remaining. Pay per-contract via x402 (send X-Payment header) or purchase more at ambr.run.',
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

  // Lookup template
  const db = getSupabaseAdmin();
  const { data: tmpl } = await db
    .from('templates')
    .select('id, slug')
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

    const sha256Hash = hashContract(humanReadable, machineReadable);

    const isX402 = authCtx?.type === 'x402';
    const contract = await storeContract({
      contractId,
      templateId: tmpl.id,
      humanReadable,
      machineReadable,
      sha256Hash,
      principalDeclaration: principalDecl,
      parameters,
      apiKeyId: apiKeyCtx?.keyId,
      payerWallet: isX402 ? authCtx!.payerWallet : undefined,
      paymentMethod: isX402 ? 'x402' : 'api_key',
      parentContractHash: args.parent_contract_hash as string | undefined,
      amendmentType: args.amendment_type as
        | 'original'
        | 'amendment'
        | 'extension'
        | undefined,
    });

    // Post-creation: deduct credits (api_key) or link payment (x402)
    if (apiKeyCtx) {
      await decrementCredits(apiKeyCtx.keyId, apiKeyCtx.credits);
      if (apiKeyCtx.principalWallet) {
        await incrementAgentUsage(apiKeyCtx.keyId, apiKeyCtx.principalWallet);
      }
    }
    if (isX402 && authCtx!.txHash) {
      await linkPaymentToContract(authCtx!.txHash, contract.id);
    }

    const creditsLine = apiKeyCtx
      ? `- **Credits remaining:** ${apiKeyCtx.credits === -1 ? 'unlimited' : apiKeyCtx.credits - 1}`
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
            '# Contract Created (Draft)',
            '',
            `- **Contract ID:** ${result.contract_id}`,
            `- **SHA-256 Hash:** \`${result.sha256_hash}\``,
            `- **Status:** ${result.status}`,
            `- **Reader URL:** ${result.reader_url}`,
            `- **Sign URL:** ${result.sign_url}`,
            creditsLine,
            '',
            '**Next step:** Both parties must sign with ECDSA wallet signatures to activate.',
            'POST to the Sign URL with: `{ wallet_address, signature, message }`',
            'The message must contain the contract SHA-256 hash.',
          ].join('\n'),
        },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: Contract generation failed. ${err instanceof Error ? err.message : 'Please try again.'}`,
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

  if (id.startsWith('amb-')) {
    query = query.eq('contract_id', id);
  } else if (/^[a-f0-9]{64}$/.test(id)) {
    query = query.eq('sha256_hash', id);
  } else {
    query = query.eq('id', id);
  }

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
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
    };
  }

  // Metadata-only response (GDPR Art. 5 data-minimization aligned)
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
      'contract_id, status, created_at, amendment_type, parent_contract_hash, sha256_hash',
    );

  if (id.startsWith('amb-')) {
    query = query.eq('contract_id', id);
  } else if (/^[a-f0-9]{64}$/.test(id)) {
    query = query.eq('sha256_hash', id);
  } else {
    query = query.eq('id', id);
  }

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

  const lines = [
    `# Contract Status: ${contract.contract_id}`,
    '',
    `- **Status:** ${contract.status}`,
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
    .select('contract_id, status, created_at, sha256_hash')
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
  const isHash = /^[a-f0-9]{64}$/.test(contractId);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}/.test(contractId);
  const column = isHash ? 'sha256_hash' : isUuid ? 'id' : 'contract_id';

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

  // Update contract status to handshake if currently draft and intent is accept
  if (contract.status === 'draft' && intent === 'accept') {
    await db.from('contracts').update({ status: 'handshake' }).eq('id', contract.id);
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
): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
  switch (name) {
    case 'ambr_list_templates':
      return handleListTemplates();
    case 'ambr_create_contract':
      return handleCreateContract(args, apiKey, authCtx);
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
  return { jsonrpc: '2.0', id: id ?? null, result };
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
): Promise<JsonRpcResponse | null> {
  if (!body || typeof body !== 'object' || !('method' in body)) {
    return jsonRpcError(null, -32600, 'Invalid Request');
  }

  const req = body as JsonRpcRequest;
  const id = req.id ?? null;

  switch (req.method) {
    case 'initialize':
      return jsonRpcOk(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: SERVER_INFO,
      });

    case 'notifications/initialized':
      return null; // Notification — no response

    case 'tools/list':
      return jsonRpcOk(id, { tools: TOOLS });

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
      );
      return jsonRpcOk(id, result);
    }

    case 'ping':
      return jsonRpcOk(id, {});

    default:
      return jsonRpcError(id, -32601, `Method not found: ${req.method}`);
  }
}
