/**
 * Inbound-mail health check.
 *
 * Looks at recent inbound mail and at the number of messages in the spam folder,
 * both read from the ops service. It reports a problem when messages sit in spam
 * or when no mail has been logged for a week.
 *
 * Deliberately NOT part of /api/health's overall status roll-up. Mail sitting in
 * spam is a data-quality signal, not a service outage; including it would 503 the
 * endpoint and alarm external uptime monitors while the site is perfectly healthy.
 *
 * Lives here rather than inline in the route so it can be exercised in tests.
 */
import { NonJsonAnswer, readJson, validHttpStatus } from '@/lib/health/fetch-json';

export interface HealthCheckResult {
  status: 'ok' | 'degraded' | 'down';
  latency_ms?: number;
  detail?: string;
}

const SPAM_QUERY = 'in:spam to:(@ambr.run)';
const SPAM_MAX = 25;
const QUIET_MS = 7 * 24 * 60 * 60 * 1000;
// The ops service is slower than the other dependencies; the 5s budget used for the
// rest of /api/health is too short for it.
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
 * waiting for a real failure. Production calls pass nothing.
 */
export async function checkInboundMail(
  opts: { spamQuery?: string; quietMs?: number; timeoutMs?: number } = {},
): Promise<HealthCheckResult> {
  const base = process.env.OPS_BASE;
  const key = process.env.OPS_KEY;
  if (!base || !key) return { status: 'down', detail: 'OPS_BASE or OPS_KEY not configured' };

  const spamQuery = opts.spamQuery ?? SPAM_QUERY;
  const quietMs = opts.quietMs ?? QUIET_MS;
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  const start = Date.now();
  let handle: ReturnType<typeof setTimeout> | undefined;

  try {
    // The signal ends the sockets too, not just the wait for them.
    const signal = AbortSignal.timeout(timeoutMs);
    const get = async (url: string) => readJson(await fetch(url, { signal }));
    const work = Promise.all([
      get(`${base}?action=gmail_search&q=${encodeURIComponent(spamQuery)}&max=${SPAM_MAX}&key=${key}`),
      // The parameter is `max`, not `maxRows` — `maxRows` is silently ignored and
      // returns the full default page.
      get(`${base}?action=email_log&max=10&key=${key}`),
    ]);
    const timer = new Promise<never>((_, reject) => {
      handle = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    });
    const [spam, log] = await Promise.race([work, timer]);
    const latency_ms = Date.now() - start;

    if (spam?.error || log?.error) {
      return { status: 'degraded', latency_ms, detail: `ops error: ${spam?.error || log?.error}` };
    }

    const problems: string[] = [];

    // `count` is capped by `max`, so a full page is a floor rather than a total.
    // Report "25+" instead of "25" so nobody reads it as the real number.
    const spamCount: number | null = typeof spam?.count === 'number' ? spam.count : null;
    if (spamCount === null) {
      problems.push('spam probe returned no count');
    } else if (spamCount > 0) {
      const shown = spamCount >= SPAM_MAX ? `${SPAM_MAX}+` : String(spamCount);
      problems.push(`${shown} company message${spamCount === 1 ? '' : 's'} in Spam`);
    }

    // email_log rows are NOT date-sorted — a real response came back
    // 13:26, 08:36, 11:06, 09:10. emails[0] is not the newest; take the max.
    const rows: Array<{ date?: string }> = Array.isArray(log?.emails) ? log.emails : [];
    const newest = rows.reduce((max, row) => {
      const t = Date.parse(row?.date ?? '');
      return Number.isFinite(t) && t > max ? t : max;
    }, 0);

    if (newest === 0) {
      problems.push('no inbound mail logged at all');
    } else if (Date.now() - newest > quietMs) {
      problems.push(`no inbound mail logged in ${formatAge(Date.now() - newest)}`);
    }

    if (problems.length) {
      return { status: 'degraded', latency_ms, detail: problems.join('; ') };
    }

    // Say something specific when healthy — a check that only ever prints "ok"
    // is one people stop reading.
    return {
      status: 'ok',
      latency_ms,
      detail: `spam clear, last inbound ${formatAge(Date.now() - newest)} ago`,
    };
  } catch (e) {
    // A slow or unreachable ops service means "could not check", not "mail is broken".
    // The request URL carries the ops key and a URL error repeats it, so the
    // error's own text is never passed on.
    // Only the HTTP status number of a non-JSON answer is passed on.
    const timedOut = e instanceof Error && (e.message === 'timeout' || e.name === 'TimeoutError' || e.name === 'AbortError');
    let detail = 'Could not reach the ops assistant.';
    if (timedOut) detail = 'ops timeout';
    else if (e instanceof NonJsonAnswer) {
      detail = `The ops assistant sent a non-JSON answer${validHttpStatus(e.httpStatus) ? ` (${e.httpStatus})` : ''}.`;
    }
    return { status: 'degraded', latency_ms: Date.now() - start, detail };
  } finally {
    clearTimeout(handle);
  }
}
