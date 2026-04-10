import { NextResponse } from 'next/server';

const ALLOWED_ORIGINS = [
  'https://getamber.dev',
  'https://ambr.run',
  'https://www.ambr.run',
  'https://getamber.dev',
  'http://localhost:3000',
  'http://localhost:3001',
];

function getAllowedOrigin(request?: Request): string {
  const origin = request?.headers.get('Origin') ?? '';
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  // In production, reject unknown origins. In development, allow localhost.
  if (process.env.NODE_ENV === 'development' && origin.startsWith('http://localhost:')) {
    return origin;
  }
  return ALLOWED_ORIGINS[0]; // Default to primary domain
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, X-Payment, Authorization',
};

export function corsOptions(request?: Request) {
  const origin = getAllowedOrigin(request as Request | undefined);
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...corsHeaders,
      'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin',
    },
  });
}

export function withCors(response: NextResponse, request?: Request): NextResponse {
  const origin = getAllowedOrigin(request as Request | undefined);
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
  response.headers.set('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);
  response.headers.set('Vary', 'Origin');
  return response;
}
