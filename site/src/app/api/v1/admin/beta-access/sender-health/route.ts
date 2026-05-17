/**
 * GET /api/v1/admin/beta-access/sender-health
 *
 * Admin-only. Checks Resend's /domains endpoint to confirm ambr.run is
 * still verified for DKIM / SPF / DMARC. Surfaces in the admin UI as a
 * green / red indicator so we don't accidentally send invites from a
 * broken sender.
 */

import { NextResponse } from 'next/server';
import { validateApiKey, isAdmin } from '@/lib/api-auth';
import { checkResendDomainHealth } from '@/lib/email/send-via-resend';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await validateApiKey(request);
  if (!auth || !isAdmin(auth.email)) {
    return NextResponse.json(
      { error: 'forbidden' },
      { status: 403, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  const health = await checkResendDomainHealth('ambr.run');
  return NextResponse.json(health, {
    headers: { 'Cache-Control': 'private, max-age=300' },
  });
}
