import { NextResponse } from 'next/server';
import { buildAgentCard } from '../agent.json/route';

/**
 * A2A Agent Card — alternate well-known path
 *
 * Community convention uses /.well-known/agent-card.json
 * This serves the same agent card as /.well-known/agent.json
 */

export async function GET() {
  const agentCard = await buildAgentCard();

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
