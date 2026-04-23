/**
 * POST /api/v1/investors/verify
 *
 * Verify the investor password. On success, issue an HMAC-signed cookie
 * valid for 7 days. On failure, 401 + audit log entry.
 *
 * Rate-limited 5/min per IP to block brute force.
 */

import { NextResponse } from 'next/server';
import {
  hashPassword,
  safeCompareHex,
  signCookie,
  buildAuthSetCookie,
} from '@/lib/investor-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { corsOptions } from '@/lib/cors';

export async function POST(request: Request) {
  const ip = getClientIp(request);

  // Aggressive rate limit to prevent brute force
  const rl = rateLimit(`investor-verify:${ip}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: 'rate_limited',
        message: 'Too many attempts. Please wait a minute and try again.',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          'Cache-Control': 'private, no-store',
        },
      },
    );
  }

  // Parse body
  const body = await request.json().catch(() => null);
  const password = body?.password;

  if (typeof password !== 'string' || password.length === 0 || password.length > 200) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Password required' },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  const expectedHash = process.env.INVESTOR_ACCESS_PASSWORD_HASH;
  const cookieSecret = process.env.INVESTOR_COOKIE_SECRET;
  if (!expectedHash || !cookieSecret) {
    console.error('INVESTOR_ACCESS_PASSWORD_HASH or INVESTOR_COOKIE_SECRET not configured');
    return NextResponse.json(
      { error: 'server_misconfigured', message: 'Investor access is temporarily unavailable.' },
      { status: 500, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  const submittedHash = hashPassword(password);
  const ok = safeCompareHex(submittedHash, expectedHash);

  if (!ok) {
    logAudit({
      event_type: 'investor_access_denied',
      severity: 'warn',
      actor: ip,
      details: { reason: 'wrong_password' },
      ip_address: ip,
    });
    return NextResponse.json(
      { error: 'unauthorized', message: 'Invalid password.' },
      { status: 401, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  // Issue signed cookie
  const issuedAt = Date.now();
  const cookieValue = signCookie(issuedAt, cookieSecret);
  const setCookieHeader = buildAuthSetCookie(cookieValue);

  logAudit({
    event_type: 'investor_access_granted',
    severity: 'info',
    actor: ip,
    details: { issued_at: issuedAt },
    ip_address: ip,
  });

  return NextResponse.json(
    { status: 'authenticated', message: 'Welcome.' },
    {
      status: 200,
      headers: {
        'Set-Cookie': setCookieHeader,
        'Cache-Control': 'private, no-store',
      },
    },
  );
}

export { corsOptions as OPTIONS };
