/**
 * GET /what-it-is
 *
 * The plain-language explainer, served UNGATED and deliberately so — this is
 * the one investor-facing document built to be forwarded onward, and it carries
 * no confidential mark. Everything gated (deck, brief, model, slides) stays
 * behind isInvestorAuthenticated at /api/v1/investors/*; do not add this pattern
 * there.
 *
 * Why a route and not /public: the file carries raise figures, and /public is
 * committed — this repo's remote is public, so a PDF in /public is a PDF on
 * GitHub. Reading it from private-assets (gitignored) gives it a URL without
 * ever putting it in git.
 *
 * The on-disk name is UNVERSIONED on purpose: replacing the file ships a new
 * revision without invalidating a link that is already out in someone's inbox.
 *
 * The bundling entry in next.config.ts (outputFileTracingIncludes) is what
 * makes this work in production. Without it the route 404s in prod ONLY, never
 * locally, which is the least helpful possible failure mode.
 */

import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { logAudit } from '@/lib/audit';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'private-assets', 'ambr-what-it-is.pdf');
    const buffer = await readFile(filePath);

    // Counted, but anonymous. audit_log is service-role only; still keep
    // addresses out of it, so nothing identifying goes into new calls. A share count is the whole point here
    // and needs no subject.
    logAudit({
      event_type: 'explainer_viewed',
      severity: 'info',
      details: { size_bytes: buffer.length },
    });

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        // inline: it should open in the browser, not land in Downloads.
        'Content-Disposition': 'inline; filename="ambr-what-it-is.pdf"',
        'Content-Length': String(buffer.length),
        // Public and shareable, but short-lived so a replacement propagates
        // within minutes rather than sitting stale in a CDN.
        'Cache-Control': 'public, max-age=600, must-revalidate',
        // Shareable is not the same as searchable. Anyone with the link can
        // read it; it should not turn up in results for the company name.
        'X-Robots-Tag': 'noindex, nofollow',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('explainer read error:', err);
    return NextResponse.json(
      { error: 'not_found', message: 'Not available.' },
      { status: 404 },
    );
  }
}
