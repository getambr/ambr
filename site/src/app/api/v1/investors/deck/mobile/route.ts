/**
 * GET /api/v1/investors/deck/mobile
 *
 * Serve the phone-shaped pitch deck. Same 14 topics and the same figures as
 * /api/v1/investors/deck, laid out at 405x720pt instead of 960x540pt.
 *
 * Why a second file rather than a responsive one: a PDF has fixed page
 * geometry. The landscape deck fits a ~390px phone at 0.41x, which renders its
 * 7-21pt type at 3-9pt — illegible, and no amount of bumping sizes fixes a 16:9
 * page on a portrait screen. This one fits at ~0.96x.
 *
 * The file lives in private-assets/, which is gitignored — it reaches
 * production only via outputFileTracingIncludes in next.config.ts. Without that
 * entry this route 404s in production while working perfectly locally.
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
    const filePath = path.join(process.cwd(), 'private-assets', 'investor-deck-mobile.pdf');
    const buffer = await readFile(filePath);

    // Distinct event type from the landscape deck on purpose: which shape
    // investors actually open is the only evidence we will get about whether
    // this was worth building.
    logAudit({
      event_type: 'investor_deck_mobile_downloaded',
      severity: 'info',
      actor: getClientIp(request),
      details: { size_bytes: buffer.length },
      ip_address: getClientIp(request),
    });

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="ambr-pitch-deck-mobile.pdf"',
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('investor mobile deck read error:', err);
    return NextResponse.json(
      { error: 'not_found', message: 'Deck not available.' },
      { status: 404 },
    );
  }
}
