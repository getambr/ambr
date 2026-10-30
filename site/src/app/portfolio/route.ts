/**
 * GET /portfolio
 *
 * Ilvers's founder portfolio, served UNGATED. Investors ask for the founders'
 * background before they read a deck, and this is the document that answers it.
 * It carries career history and shipped work — no raise figures, no model, no
 * liquidity terms — so it needs no gate. Everything with numbers on it stays
 * behind the investor cookie at /api/v1/investors/*.
 *
 * Same reasoning as /what-it-is on the two structural choices: read from
 * private-assets rather than /public so the file never enters this repo's public
 * remote, and keep the on-disk name unversioned so a revision replaces it
 * without breaking a link already sent.
 */

import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { logAudit } from '@/lib/audit';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'private-assets', 'ilvers-portfolio.pdf');
    const buffer = await readFile(filePath);

    // Counted, not identified — audit_log is service-role only; still keep
    // addresses out of it, so new call sites record no actor and no address.
    logAudit({
      event_type: 'portfolio_viewed',
      severity: 'info',
      details: { size_bytes: buffer.length },
    });

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="ilvers-sermols-portfolio.pdf"',
        'Content-Length': String(buffer.length),
        'Cache-Control': 'public, max-age=600, must-revalidate',
        // Shareable, not searchable — a personal document should not be indexed.
        'X-Robots-Tag': 'noindex, nofollow',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('portfolio read error:', err);
    return NextResponse.json(
      { error: 'not_found', message: 'Not available.' },
      { status: 404 },
    );
  }
}
