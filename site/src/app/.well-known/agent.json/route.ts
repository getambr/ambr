import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/** A2A Agent Card — /.well-known/agent.json discovery endpoint */

const PLATFORM_URL = process.env.NEXT_PUBLIC_PLATFORM_URL || 'https://getamber.dev';
const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL || 'https://ambr.run';

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
      'Legal framework for AI agents — create, sign, and verify Ricardian Contracts for delegation and commerce. Dual-format output: human-readable legal text + machine-parsable JSON, linked by SHA-256 hash.',
    url: a2aUrl,
    version: '1.0.0',
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
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extendedAgentCard: false,
    },
    skills: [
      {
        id: 'create_contract',
        name: 'Create Ricardian Contract',
        description:
          'Generate a legally-structured dual-format Ricardian Contract from a template. Requires template slug, parameters, and principal declaration. Costs 1 credit per contract.',
        tags: ['legal', 'contracts', 'delegation', 'commerce', 'ricardian', 'ai-agents'],
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
          'List available contract templates with parameter schemas. Categories: delegation (d1-d3) and commerce (c1-c3).',
        tags: ['templates', 'catalog', 'browse'],
        examples: [
          'What contract templates are available?',
          'Show me delegation contract templates',
        ],
      },
      {
        id: 'get_contract',
        name: 'Get Contract Details',
        description:
          'Retrieve a contract by ID (amb-YYYY-NNNN), SHA-256 hash, or UUID. Returns both human-readable and machine-parsable formats.',
        tags: ['contracts', 'retrieval', 'verification'],
        examples: [
          'Get contract amb-2026-0042',
          'Retrieve the contract with hash abc123...',
        ],
      },
      {
        id: 'verify_hash',
        name: 'Verify Contract Integrity',
        description:
          "Verify a contract's SHA-256 hash to confirm it hasn't been tampered with.",
        tags: ['verification', 'integrity', 'hash', 'security'],
        examples: [
          'Verify that hash abc123... matches a valid contract',
        ],
      },
      {
        id: 'get_status',
        name: 'Check Contract Status',
        description:
          'Check contract lifecycle status (draft/active/terminated/etc) and amendment chain.',
        tags: ['status', 'lifecycle', 'amendments'],
        examples: [
          'What is the status of contract amb-2026-0042?',
          'Check if contract abc123... is still active',
        ],
      },
      {
        id: 'agent_handshake',
        name: 'Agent Handshake',
        description:
          'Initiate a handshake on a contract on behalf of the delegating principal. Requires API key with registered delegation. Principal must approve separately.',
        tags: ['delegation', 'handshake', 'agent', 'intent'],
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
