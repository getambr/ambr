/**
 * The overall status of /api/health, and with it the HTTP code external uptime
 * monitors alert on.
 *
 * Keys listed in `reportOnly` are still checked and shown in the body but do not
 * count. ops_agent is one: it is the internal ops Apps Script, and its cold starts
 * turned the endpoint 503 three times in a row on 2026-10-16 while the product was
 * up. A problem there shows in its own entry, never in the top-level status.
 *
 * anthropic counts on purpose: contract creation is the paid product, and on
 * 2026-10-25 a spend cap stopped it for days while this endpoint said healthy.
 * Reading, verifying and signing keep working during such an outage; the body
 * says so per entry.
 */

export type OverallStatus = 'healthy' | 'degraded' | 'unhealthy';

export function overallStatus(
  checks: Record<string, { status: 'ok' | 'degraded' | 'down' }>,
  reportOnly: readonly string[] = [],
): OverallStatus {
  const counted = Object.entries(checks)
    .filter(([name]) => !reportOnly.includes(name))
    .map(([, check]) => check.status);
  if (counted.some((s) => s === 'down')) return 'unhealthy';
  if (counted.every((s) => s === 'ok')) return 'healthy';
  return 'degraded';
}
