/**
 * One run of the daily report: the same dependency checks /api/health makes,
 * plus the mail checks that endpoint does not cover (inbound delivery, Resend's
 * view of our domain, and the DNS records mail depends on).
 *
 * Every probe is guarded, so one that throws becomes a red item instead of
 * losing the whole report, and one that is still running at the deadline becomes
 * an amber item. Nothing here sends mail. The AI check makes one minimal model
 * call, the same probe System Health uses.
 */
import {
  checkSupabase,
  checkBaseRpc,
  checkAnthropic,
  checkOpsAgent,
  checkResend,
  checkStripe,
  checkCnftContract,
  checkX402Facilitator,
  type CheckResult,
} from './checks';
import { checkInboundMail } from './inbound-mail';
import { checkOutboundMail } from './outbound-mail';
import { checkMailDns } from './mail-dns';
import { worstStatus, type ReportItem, type ReportStatus } from './report-model';

export interface DailyReport {
  overall: ReportStatus;
  items: ReportItem[];
  duration_ms: number;
}

// Probe details can carry raw upstream error text, and a malformed URL error
// repeats the URL with its query string (the ops key travels there). Reports
// may be kept, so the detail keeps only plain words. The probes
// already return fixed phrases for caught errors; this is the backstop for
// anything that still gets through: the live value of each secret the app holds,
// then the shape of common keys and tokens.
const DETAIL_MAX = 200;
const SECRET_ENV_VARS = [
  'RESEND_API_KEY',
  'STRIPE_SECRET_KEY',
  'ANTHROPIC_API_KEY',
  'OPS_KEY',
  'CDP_API_KEY_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY',
];
const MIN_SECRET_LENGTH = 8;

function hideEnvSecrets(text: string): string {
  let out = text;
  for (const name of SECRET_ENV_VARS) {
    const raw = process.env[name];
    // fetch trims header values, so the trimmed form is what an error repeats.
    const value = raw?.trim();
    if (!raw || !value || value.length < MIN_SECRET_LENGTH) continue;
    // The URL-encoded form is how a secret looks inside a query string.
    const forms = new Set([raw, value, encodeURIComponent(raw), encodeURIComponent(value)]);
    for (const form of forms) out = out.split(form).join('[hidden]');
  }
  return out;
}

export function scrubDetail(detail: string): string {
  // Bounded before the patterns run, so a huge upstream body cannot make them slow.
  const hidden = hideEnvSecrets(detail);
  // A cut can split a key below the length its pattern needs, so a cut input
  // also loses its partial last word.
  const bounded = hidden.length > DETAIL_MAX * 5 ? hidden.slice(0, DETAIL_MAX * 5).replace(/\S*$/, '') : hidden;
  const clean = bounded
    // A PEM block, also with its line breaks written as the two characters
    // backslash and n (JSON-escaped). An unterminated block runs to the end.
    .replace(/-----BEGIN [A-Z0-9 ]+-----[\s\S]*?(?:-----END [A-Z0-9 ]+-----|$)/g, '[hidden]')
    // JSON pairs ("api_key": "...") run before the URL rule, so a URL value goes too.
    .replace(
      /\\{0,2}"([\w.-]*(?:key|token|secret|password)[\w.-]*)\\{0,2}"\s*:\s*(?:\\{0,2}"(?:[^"\\]|\\[^"])*\\{0,2}"|[^\s,}\]]+)/gi,
      '"$1": "[hidden]"',
    )
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, '[url]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [hidden]')
    // Basic credentials are plain base64. The lookahead wants a digit, a base64
    // symbol or a capital after the first letter, so "Basic authentication" stays.
    .replace(/\bBasic\s+(?=[A-Za-z0-9+/]*[0-9+/=]|[A-Za-z0-9+/]+[A-Z])[A-Za-z0-9+/]{8,}={0,2}/g, 'Basic [hidden]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '[hidden]')
    .replace(/\bsk-ant-[A-Za-z0-9_-]+/g, '[hidden]')
    .replace(/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_]+/g, '[hidden]')
    .replace(/\bre_[A-Za-z0-9_-]{8,}/g, '[hidden]')
    .replace(/\bwhsec_[A-Za-z0-9_+/=-]{8,}/g, '[hidden]')
    .replace(/\bgh[pousr]_[A-Za-z0-9]{8,}/g, '[hidden]')
    .replace(/\bgithub_pat_[A-Za-z0-9_]+/g, '[hidden]')
    .replace(/\b([\w-]*(?:key|token|secret|signature|password)|sig)=[^&\s]+/gi, '$1=[hidden]')
    // key: value and key = value, with a quoted value taken whole.
    .replace(/\b([\w-]*(?:key|token|secret|password)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&]+)/gi, '$1[hidden]')
    // user:pass@host without a scheme (with one, the URL rule above took it).
    .replace(/\b[\w.+-]+:[^\s@/:]+@(?=[A-Za-z0-9[])/g, '[hidden]@')
    // Long runs that are surely a key or digest: 32+ hex, or 40+ base64url.
    .replace(/[0-9a-fA-F]{32,}/g, '[hidden]')
    .replace(/[A-Za-z0-9_-]{40,}/g, '[hidden]')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > DETAIL_MAX ? `${clean.slice(0, DETAIL_MAX - 1)}…` : clean;
}

async function guarded(
  key: string,
  label: string,
  probe: () => Promise<CheckResult | ReportItem>,
): Promise<ReportItem> {
  try {
    const { status, detail, latency_ms } = await probe();
    return { key, label, status, ...(detail ? { detail: scrubDetail(detail) } : {}), ...(latency_ms != null ? { latency_ms } : {}) };
  } catch {
    return { key, label, status: 'down', detail: 'The check crashed before it could report.' };
  }
}

/** The route may run for 60 s; stop waiting well before that so a partial report can still be stored. */
export const REPORT_DEADLINE_MS = 45_000;

const lateItem = (key: string, label: string): ReportItem => ({
  key,
  label,
  status: 'degraded',
  detail: 'The check did not finish in time.',
});

export async function runDailyReport(opts: { deadlineMs?: number } = {}): Promise<DailyReport> {
  const start = Date.now();
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    deadlineTimer = setTimeout(resolve, opts.deadlineMs ?? REPORT_DEADLINE_MS);
  });
  // A probe still pending at the deadline is abandoned and reported as such.
  const guardedByDeadline = (key: string, label: string, probe: () => Promise<CheckResult | ReportItem>) =>
    Promise.race([guarded(key, label, probe), deadline.then(() => lateItem(key, label))]);

  try {
    const [singles, dns] = await Promise.all([
      Promise.all([
        guardedByDeadline('supabase', 'Database', () => checkSupabase()),
        guardedByDeadline('base_rpc', 'Base network connection', () => checkBaseRpc()),
        // fresh = true: the report run is admin-equivalent, so it must not be handed a cached answer from an earlier public ping.
        guardedByDeadline('anthropic', 'AI contract generation', () => checkAnthropic(true)),
        guardedByDeadline('ops_agent', 'Ops assistant (company mail and calendar)', () => checkOpsAgent()),
        guardedByDeadline('resend', 'Email provider account', () => checkResend()),
        guardedByDeadline('stripe', 'Card payments (Stripe)', () => checkStripe()),
        guardedByDeadline('cnft_contract', 'Certificate NFT contract', () => checkCnftContract()),
        guardedByDeadline('x402_facilitator', 'Crypto payment facilitator', () => checkX402Facilitator(true)),
        guardedByDeadline('inbound_mail', 'Inbound company mail', () => checkInboundMail()),
        guardedByDeadline('outbound_mail', 'Outbound mail: ambr.run verified at Resend', () => checkOutboundMail()),
      ]),
      Promise.race([
        checkMailDns().catch((): ReportItem[] => [
          {
            key: 'dns',
            label: 'Mail records (DNS)',
            status: 'degraded',
            detail: 'The DNS checks crashed before they could report.',
          },
        ]),
        deadline.then((): ReportItem[] => [lateItem('dns', 'Mail records (DNS)')]),
      ]),
    ]);
    const items = [...singles, ...dns];
    return { overall: worstStatus(items), items, duration_ms: Date.now() - start };
  } finally {
    clearTimeout(deadlineTimer);
  }
}
