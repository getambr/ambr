/**
 * Can Resend send for ambr.run? Asks Resend's domains API whether the domain is
 * verified. Nothing is sent. checkResend (lib/health/checks) only counts
 * verified domains in the account; this one is about our domain, because a
 * domain that falls out of verification keeps the API key valid while mail
 * stops being delivered.
 */
import { MAIL_DOMAIN } from './mail-dns';
import type { ReportItem } from './report-model';

const TIMEOUT_MS = 5000;
const KEY = 'outbound_mail';
const LABEL = `Outbound mail: ${MAIL_DOMAIN} verified at Resend`;

export async function checkOutboundMail(fetchImpl: typeof fetch = fetch): Promise<ReportItem> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { key: KEY, label: LABEL, status: 'down', detail: 'No Resend API key is configured, so the platform cannot send mail.' };
  }
  const start = Date.now();
  try {
    const res = await fetchImpl('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const latency_ms = Date.now() - start;
    // Resend allows two requests a second and checkResend asks at the same moment,
    // so a 429 is "could not check", not proof that anything is wrong.
    if (res.status === 429) {
      return { key: KEY, label: LABEL, status: 'degraded', latency_ms, detail: 'Resend is rate limiting; could not check.' };
    }
    if (!res.ok) {
      return { key: KEY, label: LABEL, status: 'down', latency_ms, detail: `Resend refused the request (HTTP ${res.status}).` };
    }
    const body = await res.json().catch(() => null);
    // Without a list there is nothing to search: that is not the same as the domain being absent.
    if (!Array.isArray(body?.data)) {
      return { key: KEY, label: LABEL, status: 'degraded', latency_ms, detail: 'Resend gave an unexpected answer, so the domain could not be checked.' };
    }
    const domains: Array<{ name?: string; status?: string }> = body.data;
    const domain = domains.find((d) => d.name === MAIL_DOMAIN);
    if (!domain) {
      return { key: KEY, label: LABEL, status: 'down', latency_ms, detail: `${MAIL_DOMAIN} is not set up in Resend.` };
    }
    if (domain.status === 'verified') {
      return { key: KEY, label: LABEL, status: 'ok', latency_ms, detail: 'Verified; Resend can send for this domain.' };
    }
    // Resend reports not_started / pending while it re-checks the records, and
    // failed / temporary_failure when it could not find them.
    const pending = domain.status === 'pending' || domain.status === 'not_started';
    return {
      key: KEY,
      label: LABEL,
      status: pending ? 'degraded' : 'down',
      latency_ms,
      detail: pending
        ? 'Resend is still verifying the domain.'
        : `Resend does not consider the domain verified (status: ${domain.status ?? 'unknown'}).`,
    };
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return {
      key: KEY,
      label: LABEL,
      status: 'down',
      detail: timedOut ? 'Resend did not answer in time.' : 'Could not reach Resend.',
    };
  }
}
