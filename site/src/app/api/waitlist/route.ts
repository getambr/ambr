import { NextResponse } from 'next/server';
import { waitlistFormSchema } from '@/lib/validation';
import { getSupabase } from '@/lib/supabase';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(request: Request) {
  // Rate limit: 5 requests/min per IP
  const ip = getClientIp(request);
  const rl = rateLimit(`waitlist:${ip}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  try {
    const body = await request.json();
    const parsed = waitlistFormSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid form data', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { email, name, role, message } = parsed.data;

    const { error } = await getSupabase()
      .from('waitlist_submissions')
      .insert({ email, name: name || null, role: role || null, message: message || null });

    if (error) {
      // Duplicate email — treat as success for UX
      if (error.code === '23505') {
        return NextResponse.json({ success: true, message: 'Already registered' });
      }
      console.error('Supabase insert error:', error);
      return NextResponse.json({ error: 'Failed to save submission' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
