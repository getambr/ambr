/**
 * Minimal Resend wrapper — no dependency. Uses Resend's REST API directly.
 * Returns the Resend message id on success, or throws on failure.
 *
 * Required env: RESEND_API_KEY
 * Sender domain must be DKIM/SPF/DMARC-verified on Resend before calling.
 */

export interface SendEmailParams {
  from: string;          // e.g. 'Ambr <hello@ambr.run>'
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SendEmailResult {
  resendId: string;
}

export async function sendViaResend(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
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

/**
 * Sender-domain health check. Hits Resend's /domains endpoint to confirm
 * the given root domain (e.g. 'ambr.run') is verified with all three SPF /
 * DKIM / DMARC records valid.
 */
export async function checkResendDomainHealth(rootDomain: string): Promise<{
  verified: boolean;
  spf: 'verified' | 'not_started' | 'pending' | 'failed' | 'unknown';
  dkim: 'verified' | 'not_started' | 'pending' | 'failed' | 'unknown';
  dmarc: 'verified' | 'not_started' | 'pending' | 'failed' | 'unknown';
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

  const response = await fetch('https://api.resend.com/domains', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    return {
      verified: false,
      spf: 'unknown',
      dkim: 'unknown',
      dmarc: 'unknown',
      detail: `Resend /domains ${response.status}`,
    };
  }

  const body = await response.json().catch(() => null) as { data?: Array<{ name: string; status: string; records?: Array<{ record: string; status: string }> }> } | null;
  const domain = body?.data?.find((d) => d.name === rootDomain);
  if (!domain) {
    return {
      verified: false,
      spf: 'unknown',
      dkim: 'unknown',
      dmarc: 'unknown',
      detail: `${rootDomain} not found in Resend domains`,
    };
  }

  const recordStatus = (recordType: string): 'verified' | 'not_started' | 'pending' | 'failed' | 'unknown' => {
    const record = domain.records?.find((r) => r.record?.toUpperCase().includes(recordType));
    if (!record) return 'unknown';
    const s = record.status?.toLowerCase();
    if (s === 'verified' || s === 'pending' || s === 'failed' || s === 'not_started') return s;
    return 'unknown';
  };

  return {
    verified: domain.status?.toLowerCase() === 'verified',
    spf: recordStatus('SPF'),
    dkim: recordStatus('DKIM'),
    dmarc: recordStatus('DMARC'),
  };
}
