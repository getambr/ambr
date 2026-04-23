/**
 * GET /api/v1/investors/model
 *
 * Serve the financial model (xlsx). Auth-gated: requires valid investor cookie.
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
    const filePath = path.join(process.cwd(), 'private-assets', 'investor-model.xlsx');
    const buffer = await readFile(filePath);

    logAudit({
      event_type: 'investor_model_downloaded',
      severity: 'info',
      actor: getClientIp(request),
      details: { size_bytes: buffer.length },
      ip_address: getClientIp(request),
    });

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="ambr-financial-model-v0.3.6.xlsx"',
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    console.error('investor model read error:', err);
    return NextResponse.json(
      { error: 'not_found', message: 'Financial model not available.' },
      { status: 404 },
    );
  }
}
