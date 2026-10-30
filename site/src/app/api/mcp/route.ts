/**
 * MCP Endpoint — Streamable HTTP (JSON mode, stateless).
 *
 * POST /api/mcp — handles MCP JSON-RPC requests (initialize, tools/list, tools/call)
 * GET  /api/mcp — returns server info for discovery (cached)
 * DELETE /api/mcp — returns 405 (session termination not applicable in stateless mode)
 *
 * Paid tool calls (e.g. ambr_create_contract) support dual auth:
 *   - X-API-Key header (existing API key flow)
 *   - x402 v2 payment: PAYMENT-SIGNATURE header from a standard x402 client
 *     (USDC on Base, settled through the configured facilitator)
 * If neither is present, returns HTTP 402 with the PAYMENT-REQUIRED header and
 * payment instructions in the JSON-RPC error body (HTTP 503 if x402 is down).
 */

import { NextResponse } from 'next/server';
import { handleMcpMessage } from '@/lib/mcp/server';
import { authenticateRequest } from '@/lib/x402/middleware';
import { findPartyWalletProblem } from '@/lib/contract/same-wallet';
import {
  generationUnavailableBody,
  getProviderUnavailableSeconds,
  requestCarriesCredentials,
} from '@/lib/llm/availability';

// ambr_create_contract generates a contract with the LLM (40-80 s), so the old
// 60 s cap could kill the function after the payment had already settled.
export const maxDuration = 300; // keep equal to MCP_MAX_DURATION_SECONDS in lib/mcp/server.ts

// Tools that require payment (API key or x402)
const PAID_TOOLS = new Set(['ambr_create_contract']);

export async function POST(request: Request) {
  // The function's clock starts here, before any payment is verified: the
  // handler's pre-settle deadline counts from this, not from its own start.
  const requestStartedAt = Date.now();
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
    // A contract nobody could sign (one wallet on both sides, or a one-sided
    // template with no signer wallet): refuse before any payment is verified or
    // credit burned (same guard as POST /api/v1/contracts).
    const createArgs = (body?.params?.arguments ?? {}) as Record<string, unknown>;
    if (toolName === 'ambr_create_contract' && typeof createArgs.template === 'string') {
      const walletProblem = await findPartyWalletProblem({
        template: createArgs.template,
        principal_wallet: typeof createArgs.principal_wallet === 'string' ? createArgs.principal_wallet : null,
        parameters: (createArgs.parameters ?? null) as Record<string, unknown> | null,
      });
      if (walletProblem) {
        return NextResponse.json(
          {
            jsonrpc: '2.0',
            id: jsonRpcId,
            result: {
              content: [{ type: 'text', text: `Error: ${walletProblem.error}. ${walletProblem.message}` }],
              isError: true,
              structuredContent: { ...walletProblem },
            },
          },
          { status: 400 },
        );
      }
    }

    // Provider known to be out of quota: 503 before verifying or charging
    // anything. A bare request still gets the 402 challenge below.
    const providerDownSeconds = getProviderUnavailableSeconds();
    if (providerDownSeconds !== null && requestCarriesCredentials(request)) {
      const unavailable = generationUnavailableBody(providerDownSeconds);
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id: jsonRpcId,
          error: { code: -32002, message: unavailable.message, data: unavailable },
        },
        { status: 503, headers: { 'Retry-After': String(providerDownSeconds) } },
      );
    }

    const templateSlug = (body?.params?.arguments?.template as string) || undefined;
    const authResult = await authenticateRequest(request, templateSlug);

    if (!authResult.auth) {
      // No API key, no valid x402 payment: 402 (PAYMENT-REQUIRED header) or 503
      const { challenge } = authResult;
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id: jsonRpcId,
          error: {
            code: -32001,
            message: challenge.body.message as string,
            data: challenge.body.x402,
          },
        },
        { status: challenge.status, headers: challenge.headers },
      );
    }
    const authCtx = authResult.auth;

    // Auth succeeded (api_key or x402). Thread authCtx through to the handler.
    const result = await handleMcpMessage(body, apiKey, authCtx, requestStartedAt);
    if (result === null) {
      return new Response(null, { status: 202 });
    }
    // A generation outage (provider usage limit) is an HTTP 503 with Retry-After
    // too; the tool result carries the retry time in structuredContent.
    const unavailable = (
      result.result as { structuredContent?: { error?: string; retry_after?: number } } | undefined
    )?.structuredContent;
    if (unavailable?.error === 'generation_unavailable' || unavailable?.error === 'generation_timeout') {
      return NextResponse.json(result, {
        status: 503,
        headers: { 'Retry-After': String(unavailable.retry_after ?? 600) },
      });
    }
    // Settlement outcome unknown: 503 with no Retry-After, the payer must not pay again.
    if (unavailable?.error === 'payment_status_unknown') {
      return NextResponse.json(result, { status: 503 });
    }
    return NextResponse.json(result, {
      headers: {
        'Content-Type': 'application/json',
        ...authCtx.paymentResponseHeaders,
      },
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

export async function GET(request: Request) {
  // MCP Streamable-HTTP clients open this GET with `Accept: text/event-stream`
  // to start a server->client SSE stream. We run a stateless JSON-mode server
  // (no server-initiated SSE), so per the MCP spec we MUST return 405 here.
  // Without it, an SSE client receives JSON, the handshake fails, and it
  // reconnects in a tight loop — each hit a billed function invocation
  // (cost-leak incident 2026-06-20). 405 makes a compliant client fall back to
  // POST and stop retrying the stream.
  const accept = request.headers.get('accept') || '';
  if (accept.includes('text/event-stream')) {
    return new NextResponse(null, {
      status: 405,
      headers: {
        Allow: 'POST',
        Vary: 'Accept',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // Plain discovery for non-SSE callers (browsers, agents). No per-request DB
  // call — pricing is referenced by URL (getAllPrices() previously forced this
  // route dynamic and was hit on every request).
  return NextResponse.json(
    {
      name: 'ambr-mcp-server',
      version: '1.0.0',
      description:
        'Ambr MCP Server — create, verify, and manage Agent Mandates (Ricardian contracts) for AI agents. Stateless JSON-RPC over POST.',
      protocol: 'mcp',
      // Kept for anything already parsing the singular field; the array is the
      // truth. Both are hand-maintained here — if SUPPORTED_PROTOCOL_VERSIONS in
      // lib/mcp/server.ts changes, change these too.
      protocolVersion: '2026-07-28',
      protocolVersions: ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'],
      transport: 'streamable-http',
      transport_note:
        'Stateless JSON mode: send JSON-RPC requests via POST. Server-initiated SSE is not offered — GET with Accept: text/event-stream returns 405.',
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
          version: 2,
          scheme: 'exact',
          network: process.env.X402_NETWORK || (process.env.NODE_ENV === 'production' ? 'eip155:8453' : 'eip155:84532'),
          asset: 'USDC',
          recipient: process.env.NEXT_PUBLIC_WALLET_ADDRESS || '',
          request_header: 'PAYMENT-SIGNATURE',
          challenge_header: 'PAYMENT-REQUIRED',
        },
        pricing_url: 'https://getamber.dev/api/v1/pricing',
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
