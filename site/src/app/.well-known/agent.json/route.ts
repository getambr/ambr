import { NextResponse } from 'next/server';

/**
 * A2A Agent Card — Google Agent-to-Agent Protocol Discovery
 *
 * Returns a spec-compliant Agent Card at /.well-known/agent.json
 * so other AI agents can discover Ambr and delegate contract tasks.
 *
 * Spec: https://a2a-protocol.org/latest/specification/
 */

const PLATFORM_URL = process.env.NEXT_PUBLIC_PLATFORM_URL || 'https://getamber.dev';
const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL || 'https://ambr.run';

export async function GET() {
  const agentCard = {
    name: 'Ambr',
    description:
      'Legal framework for AI agents — create, sign, and verify Ricardian Contracts for delegation and commerce. Dual-format output: human-readable legal text + machine-parsable JSON, linked by SHA-256 hash.',
    url: `${PLATFORM_URL}/api/a2a`,
    provider: {
      organization: 'Ambr',
      url: MARKETING_URL,
    },
    version: '1.0.0',
    capabilities: {
      streaming: false,
      pushNotifications: false,
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
    ],
    securitySchemes: {
      apiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
      },
    },
    security: ['apiKey'],
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
  };

  return NextResponse.json(agentCard, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
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
