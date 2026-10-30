/**
 * Minimal Resend wrapper — no dependency. Uses Resend's REST API directly.
 * Returns the Resend message id on success, or throws on failure.
 *
 * Required env: RESEND_API_KEY
 * Sender domain must be DKIM/SPF/DMARC-verified on Resend before calling.
 */

export interface ResendTag {
  name: string;
  value: string;
}

export interface SendEmailParams {
  from: string;          // e.g. 'Ambr <hello@ambr.run>'
  to: string;
  subject: string;
  text: string;
  html?: string;
  /**
   * Resend tags — echoed back on every webhook event for this message, so
   * they are the only way to know what a later open/click actually refers to.
   * Tag a campaign here (e.g. `{ name: 'campaign', value: 'investor' }`) or the
   * event is anonymous once it reaches /api/v1/resend/webhook.
   */
  tags?: ResendTag[];
  /** Custom RFC-5322 headers (e.g. List-Unsubscribe). */
  headers?: Record<string, string>;
}

export interface SendEmailResult {
  resendId: string;
}

/**
 * Resend restricts tag names and values to ASCII letters, digits, `_` and `-`.
 * A violation is rejected by their API with a 422 that surfaces as a generic
 * send failure, so validate up front where the error can name the offender.
 */
const TAG_PATTERN = /^[A-Za-z0-9_-]+$/;

export function assertValidTags(tags: ResendTag[]): void {
  for (const tag of tags) {
    if (!TAG_PATTERN.test(tag.name) || !TAG_PATTERN.test(tag.value)) {
      throw new Error(
        `Invalid Resend tag ${JSON.stringify(tag)} — name and value may contain only ASCII letters, digits, underscores and dashes`,
      );
    }
  }
}

export async function sendViaResend(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  if (params.tags?.length) {
    assertValidTags(params.tags);
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      text: params.text,
      ...(params.html ? { html: params.html } : {}),
      ...(params.tags?.length ? { tags: params.tags } : {}),
      ...(params.headers && Object.keys(params.headers).length
        ? { headers: params.headers }
        : {}),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'unknown');
    throw new Error(`Resend ${response.status}: ${errorBody.slice(0, 200)}`);
  }

  const data = await response.json().catch(() => null);
  const resendId = data?.id;
  if (typeof resendId !== 'string') {
    throw new Error('Resend response missing message id');
  }

  return { resendId };
}

type RecordStatus = 'verified' | 'not_started' | 'pending' | 'failed' | 'unknown';

function coerceRecordStatus(s: string | undefined): RecordStatus {
  const v = s?.toLowerCase();
  if (v === 'verified' || v === 'pending' || v === 'failed' || v === 'not_started') return v;
  return 'unknown';
}

/**
 * Sender-domain health check.
 *
 * Two-step fetch — Resend's `/domains` list endpoint returns only the
 * domain-level `status`; the per-record SPF/DKIM/DMARC status lives at
 * `/domains/{id}`. We call both: domain-level status acts as the verified
 * boolean and as the fallback for each record if the detail call fails or
 * returns a shape we don't recognise.
 */
export async function checkResendDomainHealth(rootDomain: string): Promise<{
  verified: boolean;
  spf: RecordStatus;
  dkim: RecordStatus;
  dmarc: RecordStatus;
  detail?: string;
}> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      verified: false,
      spf: 'unknown',
      dkim: 'unknown',
      dmarc: 'unknown',
      detail: 'no Resend API key configured',
    };
  }

  // Step 1 — list domains, find ours.
  const listResp = await fetch('https://api.resend.com/domains', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!listResp.ok) {
    return {
      verified: false,
      spf: 'unknown',
      dkim: 'unknown',
      dmarc: 'unknown',
      detail: `Resend /domains ${listResp.status}`,
    };
  }

  const listBody = await listResp.json().catch(() => null) as
    | { data?: Array<{ id?: string; name?: string; status?: string }> }
    | null;
  const domainSummary = listBody?.data?.find((d) => d.name === rootDomain);
  if (!domainSummary || !domainSummary.id) {
    return {
      verified: false,
      spf: 'unknown',
      dkim: 'unknown',
      dmarc: 'unknown',
      detail: `${rootDomain} not found in Resend domains`,
    };
  }

  const domainLevel = coerceRecordStatus(domainSummary.status);
  const verified = domainLevel === 'verified';
  // If Resend returns a status string we don't recognise (e.g., "active"
  // instead of "verified"), capture the raw value so we can update the
  // coerce mapping. Without this, the badge would show all-unknown with
  // no detail and we couldn't tell whether the issue was a network failure
  // or a vocabulary mismatch.
  const detail: string | undefined = domainLevel === 'unknown'
    ? `Resend status: ${JSON.stringify(domainSummary.status)}`
    : undefined;
  // Default each record to the domain-level state — when Resend says the
  // domain is "verified" overall, that means all three records passed.
  let spf: RecordStatus = domainLevel;
  let dkim: RecordStatus = domainLevel;
  let dmarc: RecordStatus = domainLevel;

  // Step 2 — try to enrich with per-record detail.
  try {
    const detailResp = await fetch(`https://api.resend.com/domains/${domainSummary.id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (detailResp.ok) {
      const detailBody = await detailResp.json().catch(() => null) as
        | { records?: Array<{ record?: string; type?: string; name?: string; status?: string }> }
        | null;
      const recs = detailBody?.records ?? [];
      const findFor = (needles: string[]): RecordStatus => {
        const match = recs.find((r) => {
          const hay = `${r.record ?? ''} ${r.type ?? ''} ${r.name ?? ''}`.toUpperCase();
          return needles.some((n) => hay.includes(n));
        });
        if (!match) return domainLevel;
        return coerceRecordStatus(match.status);
      };
      // Resend returns DMARC, SPF (often as TXT), and DKIM records. Detect
      // by either the `record` label or by record type/name substrings.
      spf = findFor(['SPF']);
      dkim = findFor(['DKIM']);
      dmarc = findFor(['DMARC']);
    }
  } catch {
    // Fall through with domain-level fallback already in place.
  }

  return { verified, spf, dkim, dmarc, ...(detail ? { detail } : {}) };
}
