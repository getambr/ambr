import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  LEGIBILITY_PRINCIPLE,
  LEGIBILITY_CLAUSE,
  GOVERNANCE_NAMESPACE,
  RICARDIAN_URN,
} from '@/lib/governance/principle';

/** A2A Agent Card — /.well-known/agent.json discovery endpoint */

const PLATFORM_URL = process.env.NEXT_PUBLIC_PLATFORM_URL || 'https://getamber.dev';
const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL || 'https://ambr.run';
const PLATFORM_VERSION = '0.3.0';
const PLATFORM_RELEASED_AT = '2026-04-20T00:00:00Z';

export async function buildAgentCard() {
  // Live stats from Supabase
  let totalContracts = 0;
  let activeContracts = 0;

  try {
    const db = getSupabaseAdmin();
    const [totalResult, activeResult] = await Promise.all([
      db.from('contracts').select('id', { count: 'exact', head: true }),
      db.from('contracts').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    ]);
    totalContracts = totalResult.count ?? 0;
    activeContracts = activeResult.count ?? 0;
  } catch {
    // Supabase unavailable — return card with zero stats
  }

  const a2aUrl = `${PLATFORM_URL}/api/a2a`;

  return {
    name: 'Ambr',
    description:
      'Legal framework for AI agents — create, sign, and verify Ricardian Contracts for delegation and commerce. Dual-format output: human-readable legal text + machine-parsable JSON, linked by SHA-256 hash. Legible by construction.',
    url: a2aUrl,
    version: '1.0.0',
    apiVersion: '1.0.0',
    platformVersion: PLATFORM_VERSION,
    releasedAt: PLATFORM_RELEASED_AT,
    documentationUrl: `${MARKETING_URL}/llms.txt`,
    provider: {
      organization: 'Ambr',
      url: MARKETING_URL,
    },
    supported_interfaces: [
      {
        url: a2aUrl,
        protocol_binding: 'jsonrpc/http',
        protocol_version: '1.0.0',
      },
    ],
    additionalInterfaces: [
      {
        url: `${PLATFORM_URL}/api/mcp`,
        kind: 'mcp',
        protocolVersion: '2025-03-26',
        description: 'Model Context Protocol (Streamable HTTP, stateless JSON mode).',
      },
      {
        url: `${PLATFORM_URL}/api/health`,
        kind: 'health',
        description: 'Public health endpoint — readiness probe for dependencies.',
      },
    ],
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
      extendedAgentCard: false,
    },
    pricing: {
      source: `${PLATFORM_URL}/api/v1/pricing`,
      currency: 'USD',
      unit: 'per contract',
      freeTier: {
        contractsPerMonth: 25,
        requires: ['verified_email'],
      },
      note: 'Canonical live pricing lives at the source URL. Do not hardcode prices from this card.',
    },
    compliesWith: [RICARDIAN_URN],
    implementsSpec: `${MARKETING_URL}/spec/ricardian-v1`,
    skills: [
      {
        id: 'create_contract',
        name: 'Create Ricardian Contract',
        description:
          `Generate a legally-structured dual-format Ricardian Contract from a template. Requires template slug, parameters, and principal declaration. Costs 1 credit per contract. ${LEGIBILITY_CLAUSE}`,
        tags: ['legal', 'contracts', 'delegation', 'commerce', 'ricardian', 'ai-agents'],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
        examples: [
          'Create a delegation contract authorizing agent X to make purchases up to $500',
          'Generate an API access agreement for compute services between Company A and Agent B',
          'Draft a task execution contract with a 30-day duration and $1000 spending cap',
        ],
      },
      {
        id: 'list_templates',
        name: 'Browse Contract Templates',
        description:
          'List available contract templates with parameter schemas. Categories: delegation (d1-d3), commerce (c1-c3), and consumer (a1-a3). Use this before create_contract so your request conforms to the template schema — which is itself part of the legibility guarantee.',
        tags: ['templates', 'catalog', 'browse'],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
        examples: [
          'What contract templates are available?',
          'Show me delegation contract templates',
        ],
      },
      {
        id: 'get_contract',
        name: 'Get Contract Details',
        description:
          `Retrieve a contract by ID (amb-YYYY-NNNN), SHA-256 hash, or UUID. Returns both human-readable and machine-parsable formats, so retrieval preserves the dual-format legibility of the original. ${LEGIBILITY_CLAUSE}`,
        tags: ['contracts', 'retrieval', 'verification'],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
        examples: [
          'Get contract amb-2026-0042',
          'Retrieve the contract with hash abc123...',
        ],
      },
      {
        id: 'verify_hash',
        name: 'Verify Contract Integrity',
        description:
          "Verify a contract's SHA-256 hash to confirm it hasn't been tampered with. Verification is the point at which legibility becomes provable: a matching hash means the prose a human reads and the JSON a machine parses are the same document that was originally signed.",
        tags: ['verification', 'integrity', 'hash', 'security'],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
        examples: [
          'Verify that hash abc123... matches a valid contract',
        ],
      },
      {
        id: 'get_status',
        name: 'Check Contract Status',
        description:
          'Check contract lifecycle status (draft/active/terminated/etc) and amendment chain. Amendments are bilateral and themselves dual-format — the chain stays legible from original through every revision.',
        tags: ['status', 'lifecycle', 'amendments'],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
        examples: [
          'What is the status of contract amb-2026-0042?',
          'Check if contract abc123... is still active',
        ],
      },
      {
        id: 'agent_handshake',
        name: 'Agent Handshake',
        description:
          'Initiate a handshake on a contract on behalf of the delegating principal. Requires API key with registered delegation. Principal must approve separately. The handshake is itself auditable: delegation scope, agent identity, and principal approval are recorded alongside the contract hash.',
        tags: ['delegation', 'handshake', 'agent', 'intent'],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
        examples: [
          'Accept contract amb-2026-0042 on behalf of my principal',
          'Handshake contract abc123... with intent to accept',
          'Reject contract amb-2026-0015 and request changes',
        ],
      },
    ],
    securitySchemes: {
      apiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'Pre-registered API key for businesses with credit-based access',
      },
      x402: {
        type: 'http',
        scheme: 'x402',
        description: 'Pay-per-contract via USDC on Base L2. Send payment, include tx hash in X-Payment header.',
      },
    },
    security_schemes: {
      apiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'Pre-registered API key for businesses with credit-based access',
      },
      x402: {
        type: 'http',
        scheme: 'x402',
        description: 'Pay-per-contract via USDC on Base L2. Send payment, include tx hash in X-Payment header.',
      },
    },
    security: [{ apiKey: [] }, { x402: [] }],
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
    default_input_modes: ['application/json'],
    default_output_modes: ['application/json'],
    extensions: {
      [GOVERNANCE_NAMESPACE]: {
        principle: LEGIBILITY_PRINCIPLE.title,
        summary: LEGIBILITY_PRINCIPLE.summary,
        basisFor: LEGIBILITY_PRINCIPLE.basisFor,
        spec: `${MARKETING_URL}/spec/ricardian-v1`,
        urn: RICARDIAN_URN,
      },
    },
    stats: {
      total_contracts_served: totalContracts,
      active_contracts: activeContracts,
      skills_count: 6,
    },
  };
}

export async function GET() {
  const agentCard = await buildAgentCard();

  return NextResponse.json(agentCard, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
