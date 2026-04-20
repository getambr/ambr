/**
 * POST /api/v1/founders/enroll
 *
 * Enroll an organization in the Founder Program. Rows are created with
 * is_active=false — an admin must manually approve via dashboard before
 * the org appears on the public list or gets their benefits.
 *
 * Rate-limited and email-dedup'd to prevent spam applications.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { corsOptions } from '@/lib/cors';

const schema = z.object({
  email: z.email('Valid email required'),
  org_name: z.string().min(2).max(120),
  contact_name: z.string().min(2).max(120),
  use_case: z.string().min(10).max(2000),
  wallet_address: z
    .string()
    .regex(/^(0x)?[a-fA-F0-9]{40}$/, 'Invalid EVM wallet address')
    .optional(),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = rateLimit(`founders:${ip}`, 2, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many requests. Limit: 2/min.' },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { email, org_name, contact_name, use_case, wallet_address } = parsed.data;
  const db = getSupabaseAdmin();

  // Deduplicate by email
  const { data: existing } = await db
    .from('founder_partners')
    .select('id, is_active')
    .eq('email', email)
    .single();

  if (existing) {
    return NextResponse.json(
      {
        error: 'already_applied',
        message: existing.is_active
          ? 'This organization is already a Founding Partner.'
          : 'An application from this email is already under review.',
      },
      { status: 409 },
    );
  }

  // Check cap: stop accepting new applications if 10 active partners
  const { count: activeCount } = await db
    .from('founder_partners')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);

  if ((activeCount ?? 0) >= 10) {
    return NextResponse.json(
      {
        error: 'program_full',
        message: 'The Founder Program is currently full (10/10). Join the waitlist and we\'ll contact you if a spot opens.',
      },
      { status: 409 },
    );
  }

  const { error: insertError } = await db.from('founder_partners').insert({
    email,
    org_name,
    contact_name,
    use_case,
    wallet_address: wallet_address ?? null,
    is_active: false,
  });

  if (insertError) {
    console.error('Founder enrollment insert error:', insertError);
    return NextResponse.json(
      { error: 'db_error', message: 'Failed to submit application. Please try again.' },
      { status: 500 },
    );
  }

  logAudit({
    event_type: 'founder_program_application',
    severity: 'info',
    actor: email,
    details: { org_name, contact_name, has_wallet: !!wallet_address },
    ip_address: ip,
  });

  return NextResponse.json(
    { status: 'pending_review', message: 'Application received. We will review and get back to you within 48 hours.' },
    { status: 201 },
  );
}

export { corsOptions as OPTIONS };
