/**
 * MCP Endpoint — Streamable HTTP (JSON mode, stateless).
 *
 * POST /api/mcp — handles MCP JSON-RPC requests (initialize, tools/list, tools/call)
 * GET  /api/mcp — returns server info for discovery
 * DELETE /api/mcp — returns 405 (session termination not applicable in stateless mode)
 */

import { NextResponse } from 'next/server';
import { handleMcpMessage } from '@/lib/mcp/server';

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: { code: -32700, message: 'Parse error: invalid JSON' },
        id: null,
      },
      { status: 400 },
    );
  }

  const apiKey =
    request.headers.get('x-api-key') ||
    request.headers.get('authorization')?.replace('Bearer ', '') ||
    undefined;

  const result = await handleMcpMessage(body, apiKey);

  // Notifications have no response — return 202 Accepted
  if (result === null) {
    return new Response(null, { status: 202 });
  }

  return NextResponse.json(result, {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET() {
  return NextResponse.json({
    name: 'ambr-mcp-server',
    version: '1.0.0',
    description:
      'Ambr MCP Server — create, verify, and manage Ricardian Contracts for AI agents.',
    protocol: 'mcp',
    protocolVersion: '2025-03-26',
    transport: 'streamable-http',
    tools: [
      'ambr_list_templates',
      'ambr_create_contract',
      'ambr_get_contract',
      'ambr_get_contract_status',
      'ambr_verify_hash',
    ],
    docs: 'https://ambr.run/developers',
  });
}

export async function DELETE() {
  return NextResponse.json(
    {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Session termination not supported (stateless server)',
      },
      id: null,
    },
    { status: 405 },
  );
}
