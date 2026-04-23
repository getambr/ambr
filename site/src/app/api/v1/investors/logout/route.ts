/**
 * POST /api/v1/investors/logout
 *
 * Clear the investor auth cookie.
 */

import { NextResponse } from 'next/server';
import { buildAuthSetCookie } from '@/lib/investor-auth';
import { corsOptions } from '@/lib/cors';

export async function POST() {
  return NextResponse.json(
    { status: 'logged_out' },
    {
      status: 200,
      headers: {
        'Set-Cookie': buildAuthSetCookie('', true),
        'Cache-Control': 'private, no-store',
      },
    },
  );
}

export { corsOptions as OPTIONS };
