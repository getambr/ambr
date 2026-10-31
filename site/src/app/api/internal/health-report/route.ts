/**
 * Machine-only health report.
 *
 * The admin console fetches this server to server, so it can show the scrubbed
 * health report without holding the platform's payment and API keys. The shared
 * secret (HEALTH_REPORT_SECRET) lives only in the platform's and the console's
 * Production environments. It writes nothing and does not log the report.
 */
import { NextResponse } from 'next/server';
import { isBearerAuthorized } from '@/lib/bearer-auth';
import { runDailyReport } from '@/lib/health/daily-report';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
};

export async function GET(request: Request) {
  // Trimmed: a value pasted with a trailing newline would otherwise never match the header.
  const secret = process.env.HEALTH_REPORT_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503, headers: HEADERS });
  }
  if (!isBearerAuthorized(request, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: HEADERS });
  }

  const { overall, items, duration_ms } = await runDailyReport();
  return NextResponse.json({ overall, items, duration_ms }, { status: 200, headers: HEADERS });
}
