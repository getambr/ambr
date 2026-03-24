import { getSupabaseAdmin } from './supabase-admin';
import { logAudit } from './audit';

const MAX_TX_PER_HOUR = 50;
const MAX_USD_PER_HOUR = 10_000;

interface VelocityResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if a wallet exceeds velocity thresholds.
 * Tracks per-wallet transaction count and USD volume per hour.
 */
export async function checkVelocity(
  wallet: string,
  usdAmount: number,
): Promise<VelocityResult> {
  const db = getSupabaseAdmin();
  const addr = wallet.toLowerCase();

  // Current hour window (truncated to hour)
  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());

  // Check if wallet is paused
  const { data: paused } = await db
    .from('velocity_tracking')
    .select('is_paused')
    .eq('wallet_address', addr)
    .eq('is_paused', true)
    .limit(1)
    .single();

  if (paused) {
    return { allowed: false, reason: 'Wallet paused due to velocity breach' };
  }

  // Upsert current window
  const { data: current, error } = await db
    .from('velocity_tracking')
    .upsert(
      {
        wallet_address: addr,
        window_start: windowStart.toISOString(),
        tx_count_hour: 1,
        usd_volume_hour: usdAmount,
      },
      { onConflict: 'wallet_address,window_start' },
    )
    .select('tx_count_hour, usd_volume_hour')
    .single();

  if (error) {
    // On conflict, increment instead
    const { data: existing } = await db
      .from('velocity_tracking')
      .select('tx_count_hour, usd_volume_hour')
      .eq('wallet_address', addr)
      .eq('window_start', windowStart.toISOString())
      .single();

    if (!existing) return { allowed: true };

    const newCount = existing.tx_count_hour + 1;
    const newVolume = Number(existing.usd_volume_hour) + usdAmount;

    // Check thresholds before incrementing
    if (newCount > MAX_TX_PER_HOUR || newVolume > MAX_USD_PER_HOUR) {
      // Pause wallet
      await db
        .from('velocity_tracking')
        .update({
          tx_count_hour: newCount,
          usd_volume_hour: newVolume,
          is_paused: true,
          paused_at: new Date().toISOString(),
        })
        .eq('wallet_address', addr)
        .eq('window_start', windowStart.toISOString());

      const reason = newCount > MAX_TX_PER_HOUR
        ? `Transaction count exceeded (${newCount}/${MAX_TX_PER_HOUR}/hr)`
        : `USD volume exceeded ($${newVolume.toFixed(2)}/$${MAX_USD_PER_HOUR}/hr)`;

      logAudit({
        event_type: 'velocity_breach',
        severity: 'error',
        actor: addr,
        details: { tx_count: newCount, usd_volume: newVolume, threshold_type: newCount > MAX_TX_PER_HOUR ? 'count' : 'volume' },
      });

      return { allowed: false, reason };
    }

    // Increment counters
    await db
      .from('velocity_tracking')
      .update({ tx_count_hour: newCount, usd_volume_hour: newVolume })
      .eq('wallet_address', addr)
      .eq('window_start', windowStart.toISOString());

    return { allowed: true };
  }

  // First tx in this window — check if immediately over threshold
  if (usdAmount > MAX_USD_PER_HOUR) {
    await db
      .from('velocity_tracking')
      .update({ is_paused: true, paused_at: new Date().toISOString() })
      .eq('wallet_address', addr)
      .eq('window_start', windowStart.toISOString());

    logAudit({
      event_type: 'velocity_breach',
      severity: 'error',
      actor: addr,
      details: { usd_volume: usdAmount, threshold_type: 'volume' },
    });

    return { allowed: false, reason: `USD volume exceeded ($${usdAmount.toFixed(2)}/$${MAX_USD_PER_HOUR}/hr)` };
  }

  return { allowed: true };
}
