/**
 * GET /api/v1/investors/onepager
 *
 * Serves the investor brief PDF rendered by scripts/render-brief.mjs from
 * /investors/brief, so the emailed attachment and the live gated page are the
 * same document.
 *
 * The file lives in private-assets/, which is gitignored — it reaches
 * production only via `outputFileTracingIncludes` in next.config.ts. Without
 * that entry this route 404s in production while working perfectly locally.
 */

import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { isInvestorAuthenticated } from '@/lib/investor-auth';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isInvestorAuthenticated(request)) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Investor access required.' },
      { status: 401, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(path.join(process.cwd(), 'private-assets', 'investor-brief.pdf'));
  } catch {
    // Most likely cause in production is a missing outputFileTracingIncludes
    // entry rather than a genuinely absent file — say so rather than 404ing mutely.
    console.error('investor-brief.pdf not found — check outputFileTracingIncludes in next.config.ts');
    return NextResponse.json(
      { error: 'not_available', message: 'The brief is not available right now.' },
      { status: 404, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  logAudit({
    event_type: 'investor_onepager_downloaded',
    severity: 'info',
    // No actor and no IP. audit_log's public-read policy was dropped on
    // 2026-07-28, but metadata-only stays the habit for anything investor-side.
    actor: 'investors-route',
    details: { size_bytes: buffer.length },
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="ambr-investor-brief.pdf"',
      'Cache-Control': 'private, no-store',
    },
  });
}
