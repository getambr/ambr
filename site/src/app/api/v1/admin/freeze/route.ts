import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { logAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/rate-limit';
import { corsOptions } from '@/lib/cors';

export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization');
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { action, target } = body as { action?: string; target?: string };

  if (!action || !target) {
    return NextResponse.json(
      { error: 'Required: action (deactivate_key | freeze_wallet), target' },
      { status: 400 },
    );
  }

  const db = getSupabaseAdmin();
  const ip = getClientIp(request);

  if (action === 'deactivate_key') {
    // Match by key prefix or UUID
    const column = target.startsWith('amb_') ? 'key_prefix' : 'id';
    const { data, error } = await db
      .from('api_keys')
      .update({ is_active: false })
      .eq(column, target)
      .select('id, key_prefix, email')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Key not found' }, { status: 404 });
    }

    logAudit({
      event_type: 'key_deactivated',
      severity: 'warn',
      actor: 'admin',
      details: { key_prefix: data.key_prefix, email: data.email, target },
      ip_address: ip,
    });

    return NextResponse.json({ ok: true, deactivated: data.key_prefix });
  }

  if (action === 'freeze_wallet') {
    const addr = target.toLowerCase();

    // Pause all velocity windows for this wallet
    const { error } = await db
      .from('velocity_tracking')
      .update({ is_paused: true, paused_at: new Date().toISOString() })
      .eq('wallet_address', addr);

    // Also insert a paused entry for current window if none exists
    const now = new Date();
    const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());

    await db.from('velocity_tracking').upsert(
      {
        wallet_address: addr,
        window_start: windowStart.toISOString(),
        tx_count_hour: 0,
        usd_volume_hour: 0,
        is_paused: true,
        paused_at: new Date().toISOString(),
      },
      { onConflict: 'wallet_address,window_start' },
    );

    logAudit({
      event_type: 'wallet_frozen',
      severity: 'warn',
      actor: 'admin',
      details: { wallet: addr },
      ip_address: ip,
    });

    return NextResponse.json({ ok: true, frozen: addr });
  }

  return NextResponse.json(
    { error: 'Unknown action. Use: deactivate_key | freeze_wallet' },
    { status: 400 },
  );
}

export { corsOptions as OPTIONS };
