/**
 * MCP Endpoint — Streamable HTTP (JSON mode, stateless).
 *
 * POST /api/mcp — handles MCP JSON-RPC requests (initialize, tools/list, tools/call)
 * GET  /api/mcp — returns server info for discovery (cached)
 * DELETE /api/mcp — returns 405 (session termination not applicable in stateless mode)
 *
 * Paid tool calls (e.g. ambr_create_contract) support dual auth:
 *   - X-API-Key header (existing API key flow)
 *   - X-Payment header with Base L2 USDC tx hash (x402 pay-per-call)
 * If neither is present, returns HTTP 402 with payment instructions in the JSON-RPC error body.
 */

import { NextResponse } from 'next/server';
import { handleMcpMessage } from '@/lib/mcp/server';
import { authenticateRequest, buildPaymentRequired } from '@/lib/x402/middleware';
import { getAllPrices } from '@/lib/x402/pricing';

export const maxDuration = 60;

// Tools that require payment (API key or x402)
const PAID_TOOLS = new Set(['ambr_create_contract']);

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

  // Detect if this is a tools/call for a paid tool
  const isToolsCall = body?.method === 'tools/call';
  const toolName = body?.params?.name as string | undefined;
  const isPaidTool = isToolsCall && !!toolName && PAID_TOOLS.has(toolName);
  const jsonRpcId = body?.id ?? null;

  // For paid tools: run dual auth (API key OR x402) at the route layer
  // so we can return HTTP 402 with payment instructions when auth fails.
  if (isPaidTool) {
    const templateSlug = (body?.params?.arguments?.template as string) || undefined;
    const authCtx = await authenticateRequest(request, templateSlug);

    if (!authCtx) {
      // No API key, no valid x402 payment — return 402 with payment instructions
      const paymentInfo = await buildPaymentRequired(templateSlug);
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id: jsonRpcId,
          error: {
            code: -32001,
            message: paymentInfo.message,
            data: paymentInfo.x402,
          },
        },
        {
          status: 402,
          headers: {
            'Content-Type': 'application/json',
            'X-Payment-Required': '1',
            'X-Payment-Version': paymentInfo.x402.version,
          },
        },
      );
    }

    // Auth succeeded (api_key or x402). Thread authCtx through to the handler.
    const result = await handleMcpMessage(body, apiKey, authCtx);
    if (result === null) {
      return new Response(null, { status: 202 });
    }
    return NextResponse.json(result, {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Unpaid tools and protocol methods — existing flow
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
  // Include pricing in discovery response so agents know costs before calling.
  // Pricing is cached internally by getAllPrices() for 5min.
  const pricing = await getAllPrices().catch(() => ({}));

  return NextResponse.json(
    {
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
        'ambr_agent_handshake',
      ],
      payment: {
        methods: ['api_key', 'x402'],
        x402: {
          chain: 'base',
          recipient: process.env.NEXT_PUBLIC_WALLET_ADDRESS || '',
          accepts: ['USDC', 'USDbC', 'DAI', 'ETH', 'WETH', 'cbETH', 'cbBTC'],
          header: 'X-Payment',
        },
        pricing,
      },
      paid_tools: Array.from(PAID_TOOLS),
      docs: 'https://ambr.run/developers',
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
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
