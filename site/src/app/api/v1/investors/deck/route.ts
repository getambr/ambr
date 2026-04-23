/**
 * GET /api/v1/investors/deck
 *
 * Serve the pitch deck PDF. Auth-gated: requires valid investor cookie.
 * File is outside /public and bundled via outputFileTracingIncludes in next.config.ts.
 */

import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { isInvestorAuthenticated } from '@/lib/investor-auth';
import { logAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/rate-limit';

export async function GET(request: Request) {
  if (!isInvestorAuthenticated(request)) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Authentication required.' },
      { status: 401, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  try {
    const filePath = path.join(process.cwd(), 'private-assets', 'investor-deck.pdf');
    const buffer = await readFile(filePath);

    logAudit({
      event_type: 'investor_deck_downloaded',
      severity: 'info',
      actor: getClientIp(request),
      details: { size_bytes: buffer.length },
      ip_address: getClientIp(request),
    });

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="ambr-pitch-deck.pdf"',
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('investor deck read error:', err);
    return NextResponse.json(
      { error: 'not_found', message: 'Deck not available.' },
      { status: 404 },
    );
  }
}
