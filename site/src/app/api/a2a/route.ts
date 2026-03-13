import { NextResponse } from 'next/server';
import { handleA2AMessage } from '@/lib/a2a/handler';

/**
 * A2A JSON-RPC Endpoint
 *
 * Handles Google Agent-to-Agent protocol requests.
 * POST: Process JSON-RPC messages (message/send, tasks/get, tasks/cancel)
 * GET: Return server info for discovery
 *
 * Auth: API key via X-API-Key header or Authorization: Bearer <key>
 */

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json(
      { jsonrpc: '2.0', error: { code: -32700, message: 'Parse error: invalid JSON' }, id: null },
      { status: 400 },
    );
  }

  const apiKey =
    request.headers.get('x-api-key') ||
    request.headers.get('authorization')?.replace('Bearer ', '') ||
    undefined;

  const result = await handleA2AMessage(body, apiKey);

  return NextResponse.json(result, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization',
    },
  });
}

export async function GET() {
  return NextResponse.json(
    {
      name: 'Ambr A2A Server',
      version: '1.0.0',
      description: 'Legal framework for AI agents — create and verify Ricardian Contracts via A2A protocol.',
      protocol: 'A2A',
      methods: ['message/send', 'tasks/get', 'tasks/cancel'],
      agent_card: '/.well-known/agent.json',
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization',
    },
  });
}
