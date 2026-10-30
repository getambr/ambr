/**
 * Inbound-mail health check.
 *
 * Company mail reaches the dashboard through a forwarder, so a break anywhere on
 * that path (a forward that stops, mail filtered away before it is logged) shows
 * up only as silence, while every other check on /api/health stays green. This is
 * the check that goes red in that case: nothing new in the mail log for a week.
 *
 * Deliberately NOT part of that endpoint's overall status roll-up. Quiet mail is a
 * data-quality signal, not a service outage; including it would 503 the endpoint
 * and alarm external uptime monitors while the site is perfectly healthy.
 *
 * Lives here rather than inline in the route so it can actually be exercised. A check
 * nobody has watched fail is not known to work.
 */

export interface HealthCheckResult {
  status: 'ok' | 'degraded' | 'down';
  latency_ms?: number;
  detail?: string;
}

const QUIET_MS = 7 * 24 * 60 * 60 * 1000;
// Apps Script is slower than the other dependencies; the 5s budget used for the
// rest of /api/health produces false alarms here.
const TIMEOUT_MS = 15000;

export function formatAge(ms: number): string {
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * `opts` exists so the failure branches can be provoked against live data without
 * waiting for a real incident.
 * Production calls pass nothing.
 */
export async function checkInboundMail(
  opts: { quietMs?: number; timeoutMs?: number } = {},
): Promise<HealthCheckResult> {
  const base = process.env.OPS_BASE;
  const key = process.env.OPS_KEY;
  if (!base || !key) return { status: 'down', detail: 'OPS_BASE or OPS_KEY not configured' };

  const quietMs = opts.quietMs ?? QUIET_MS;
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  const start = Date.now();

  try {
    // The parameter is `max`, not `maxRows` — `maxRows` is silently ignored and
    // returns the full default page.
    const work = fetch(`${base}?action=email_log&max=10&key=${key}`).then((r) => r.json());
    const timer = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), timeoutMs),
    );
    const log = await Promise.race([work, timer]);
    const latency_ms = Date.now() - start;

    if (log?.error) {
      return { status: 'degraded', latency_ms, detail: `ops error: ${log.error}` };
    }

    // email_log rows are NOT date-sorted — a real response came back
    // 13:26, 08:36, 11:06, 09:10. emails[0] is not the newest; take the max.
    const rows: Array<{ date?: string }> = Array.isArray(log?.emails) ? log.emails : [];
    const newest = rows.reduce((max, row) => {
      const t = Date.parse(row?.date ?? '');
      return Number.isFinite(t) && t > max ? t : max;
    }, 0);

    if (newest === 0) {
      return { status: 'degraded', latency_ms, detail: 'no inbound mail logged at all' };
    }
    const age = Date.now() - newest;
    if (age > quietMs) {
      return { status: 'degraded', latency_ms, detail: `no inbound mail logged in ${formatAge(age)}` };
    }

    // Say something specific when healthy — a check that only ever prints "ok"
    // is one people stop reading.
    return { status: 'ok', latency_ms, detail: `last inbound ${formatAge(age)} ago` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    // A slow or unreachable Apps Script means "could not check", not "mail is broken".
    return {
      status: 'degraded',
      latency_ms: Date.now() - start,
      detail: msg === 'timeout' ? 'ops timeout' : msg,
    };
  }
}
