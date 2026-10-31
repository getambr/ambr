/**
 * DNS checks for ambr.run's mail setup, for the daily report.
 *
 * Looks up the records mail depends on: MX and SPF at the root, the DKIM key and
 * the `send` subdomain used for outbound mail, and DMARC at `_dmarc`. A missing
 * record does not break the site; it makes mail land in spam or lets someone else
 * send as the domain, which nothing else notices.
 */
import { promises as dnsPromises } from 'node:dns';
import type { ReportItem } from './report-model';

export const MAIL_DOMAIN = 'ambr.run';
const DKIM_HOST = `resend._domainkey.${MAIL_DOMAIN}`;
const SEND_HOST = `send.${MAIL_DOMAIN}`;
const DMARC_HOST = `_dmarc.${MAIL_DOMAIN}`;

/** The slice of node:dns/promises used here, so tests can pass a fake. */
export interface MailResolver {
  resolveMx(host: string): Promise<Array<{ exchange: string; priority: number }>>;
  resolveTxt(host: string): Promise<string[][]>;
}

type Lookup<T> = { ok: true; value: T } | { ok: false };

// "No such record" is an answer; a timeout or SERVFAIL is not. Reporting the
// second as a missing record would paint the report red on a resolver hiccup.
const NO_RECORD = new Set(['ENODATA', 'ENOTFOUND', 'NXDOMAIN']);

async function lookup<T>(run: () => Promise<T>, empty: T): Promise<Lookup<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code && NO_RECORD.has(code)) return { ok: true, value: empty };
    return { ok: false };
  }
}

const mx = (r: MailResolver, host: string) => lookup(() => r.resolveMx(host), []);
// A TXT record can arrive split into several strings; they are one value.
const txt = async (r: MailResolver, host: string): Promise<Lookup<string[]>> => {
  const res = await lookup(() => r.resolveTxt(host), [] as string[][]);
  return res.ok ? { ok: true, value: res.value.map((parts) => parts.join('')) } : res;
};

const lookupFailed = (key: string, label: string): ReportItem => ({
  key,
  label,
  status: 'degraded',
  detail: 'The DNS lookup itself failed, so this could not be checked.',
});

/** Pure: what a set of TXT records at `_dmarc` means. */
export function evaluateDmarc(records: readonly string[]): Pick<ReportItem, 'status' | 'detail'> {
  const found = records.filter((r) => /^\s*v\s*=\s*DMARC1\s*(;|$)/i.test(r));
  if (found.length === 0) {
    return { status: 'down', detail: 'No DMARC record. Anyone can send mail that claims to be from this domain.' };
  }
  if (found.length > 1) {
    return { status: 'degraded', detail: 'More than one DMARC record, so receivers ignore all of them.' };
  }
  const record = found[0];
  const policy = /(?:^|;)\s*p\s*=\s*([a-z]+)/i.exec(record)?.[1]?.toLowerCase();
  const pct = /(?:^|;)\s*pct\s*=\s*(\d+)/i.exec(record)?.[1];
  if ((policy === 'reject' || policy === 'quarantine') && pct !== undefined && Number(pct) === 0) {
    return { status: 'degraded', detail: `DMARC policy is ${policy}, but it applies to none of the mail (pct=0).` };
  }
  if (policy === 'reject' || policy === 'quarantine') {
    return { status: 'ok', detail: `DMARC policy is ${policy}: spoofed mail is blocked.` };
  }
  if (policy === 'none') {
    return { status: 'degraded', detail: 'DMARC only monitors; spoofed mail is not rejected.' };
  }
  return { status: 'degraded', detail: 'The DMARC record has no valid policy, so receivers may ignore it.' };
}

/** Pure: is there exactly one SPF record among these TXT values. Two or more is a permanent SPF error. */
export function hasSpf(records: readonly string[]): boolean {
  return records.filter((r) => /^\s*v=spf1(\s|$)/i.test(r)).length === 1;
}

// Short per-query timeout and a single try, so a resolver that never answers
// costs about 3 s per nameserver instead of holding the whole run.
function defaultResolver(): MailResolver {
  return new dnsPromises.Resolver({ timeout: 3000, tries: 1 });
}

export async function checkMailDns(resolver: MailResolver = defaultResolver()): Promise<ReportItem[]> {
  const [rootMx, rootTxt, dkimTxt, sendMx, sendTxt, dmarcTxt] = await Promise.all([
    mx(resolver, MAIL_DOMAIN),
    txt(resolver, MAIL_DOMAIN),
    txt(resolver, DKIM_HOST),
    mx(resolver, SEND_HOST),
    txt(resolver, SEND_HOST),
    txt(resolver, DMARC_HOST),
  ]);
  const items: ReportItem[] = [];

  const mxLabel = 'Mail records: incoming mail server';
  items.push(
    !rootMx.ok
      ? lookupFailed('dns_mx', mxLabel)
      : rootMx.value.length > 0
        ? { key: 'dns_mx', label: mxLabel, status: 'ok', detail: `${rootMx.value.length} mail server record${rootMx.value.length === 1 ? '' : 's'} found.` }
        : { key: 'dns_mx', label: mxLabel, status: 'down', detail: 'No mail server record. Incoming mail has nowhere to go.' },
  );

  const spfLabel = 'Mail records: SPF (who may send as the domain)';
  items.push(
    !rootTxt.ok
      ? lookupFailed('dns_spf', spfLabel)
      : hasSpf(rootTxt.value)
        ? { key: 'dns_spf', label: spfLabel, status: 'ok', detail: 'SPF record found.' }
        : { key: 'dns_spf', label: spfLabel, status: 'down', detail: 'No single SPF record (none, or more than one). Receivers may treat our mail as forged.' },
  );

  const dkimLabel = 'Mail records: DKIM signature key (Resend)';
  items.push(
    !dkimTxt.ok
      ? lookupFailed('dns_dkim', dkimLabel)
      : dkimTxt.value.some((r) => /(^|;)\s*p\s*=\s*[^;\s]+/i.test(r))
        ? { key: 'dns_dkim', label: dkimLabel, status: 'ok', detail: 'Signature key found.' }
        : { key: 'dns_dkim', label: dkimLabel, status: 'down', detail: 'No signature key. Mail sent through Resend cannot be signed and may land in spam.' },
  );

  const sendLabel = 'Mail records: Resend bounce address (send subdomain)';
  if (!sendMx.ok || !sendTxt.ok) {
    items.push(lookupFailed('dns_send', sendLabel));
  } else {
    const missing = [
      sendMx.value.length === 0 ? 'mail server' : null,
      hasSpf(sendTxt.value) ? null : 'SPF',
    ].filter((m): m is string => m !== null);
    items.push(
      missing.length === 0
        ? { key: 'dns_send', label: sendLabel, status: 'ok', detail: 'Mail server and SPF found.' }
        : { key: 'dns_send', label: sendLabel, status: 'degraded', detail: `Missing on the send subdomain: ${missing.join(' and ')}. Bounces may not reach Resend.` },
    );
  }

  const dmarcLabel = 'Mail records: DMARC (what to do with forged mail)';
  items.push(
    dmarcTxt.ok
      ? { key: 'dns_dmarc', label: dmarcLabel, ...evaluateDmarc(dmarcTxt.value) }
      : lookupFailed('dns_dmarc', dmarcLabel),
  );

  return items;
}
