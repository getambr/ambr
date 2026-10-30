/**
 * GET /api/v1/investors/slide/[n]
 *
 * Serve pitch deck slide N as PNG. Auth-gated by investor cookie.
 * Expects n in [1..14]. Files at private-assets/investor-slides/slide-NN.png.
 */

import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { isInvestorAuthenticated } from '@/lib/investor-auth';

const MAX_SLIDE = 14;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ n: string }> },
) {
  if (!isInvestorAuthenticated(request)) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Authentication required.' },
      { status: 401, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  const { n } = await params;
  const idx = parseInt(n, 10);

  if (!Number.isInteger(idx) || idx < 1 || idx > MAX_SLIDE) {
    return NextResponse.json(
      { error: 'bad_request', message: `Slide number must be 1-${MAX_SLIDE}.` },
      { status: 400 },
    );
  }

  try {
    const filename = `slide-${String(idx).padStart(2, '0')}.png`;
    const filePath = path.join(process.cwd(), 'private-assets', 'investor-slides', filename);
    const buffer = await readFile(filePath);

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(buffer.length),
        // Slides don't change frequently — safe to cache briefly in private browser cache
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('investor slide read error:', err);
    return NextResponse.json(
      { error: 'not_found', message: 'Slide not available.' },
      { status: 404 },
    );
  }
}
