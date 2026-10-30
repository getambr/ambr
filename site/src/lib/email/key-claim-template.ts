/**
 * Email sent when someone requests a free developer key, or requests a
 * replacement for one they lost.
 *
 * Trigger: POST /api/v1/keys with tier 'developer'.
 * From: Ambr <hello@ambr.run> (Resend-verified, DKIM/SPF/DMARC clean).
 *
 * The key itself is deliberately NOT in this email — the link leads to a
 * one-time reveal page instead, so a live credential never persists in an
 * inbox. Clicking the link is also what proves the mailbox is real, which is
 * the `verified_email` requirement published by /api/v1/pricing.
 */

export interface KeyClaimParams {
  claimUrl: string;              // https://getamber.dev/activate/reveal?token=<token>
  purpose: 'claim' | 'rotate';   // 'rotate' when this email already has an active key
  existingPrefix?: string;       // e.g. 'amb_a1b2' — only set when rotating
  expiresMinutes: number;
}

export function renderKeyClaim(params: KeyClaimParams): {
  subject: string;
  text: string;
  html: string;
} {
  const { claimUrl, purpose, existingPrefix, expiresMinutes } = params;
  const rotating = purpose === 'rotate';

  const subject = rotating
    ? 'Replace your Ambr API key'
    : 'Verify your email to get your Ambr API key';

  const lead = rotating
    ? `You asked for a replacement API key. This link will issue a new one and stop your current key${existingPrefix ? ` (${existingPrefix}…)` : ''} from working.`
    : `Confirm this address to activate your free developer key — 500 credits, no card required.`;

  const cta = rotating ? 'Replace my key' : 'Verify and reveal my key';

  const text = [
    `Hi,`,
    ``,
    lead,
    ``,
    cta + ':',
    claimUrl,
    ``,
    `This link works once and expires in ${expiresMinutes} minutes.`,
    ``,
    rotating
      ? `Your existing key keeps working until you open the link and confirm the replacement. Nothing changes if you ignore this email.`
      : `Your key is shown once on that page and is not stored anywhere we can read, so save it somewhere safe when you get there.`,
    ``,
    `If you didn't request this, you can ignore this email — no key is issued and nothing changes.`,
    ``,
    `— Ambr`,
    `https://ambr.run`,
  ].join('\n');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; line-height: 1.55; color: #1a1a1a; max-width: 540px; margin: 32px auto; padding: 0 16px;">
  <p>Hi,</p>
  <p>${lead}</p>
  <p style="margin: 18px 0;">
    <a href="${claimUrl}" style="display: inline-block; background: #c6a87c; color: #0a0a0a; text-decoration: none; padding: 12px 22px; font-family: 'JetBrains Mono', monospace; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em;">${cta}</a>
  </p>
  <p style="color: #555; font-size: 13px;">
    This link works once and expires in <strong>${expiresMinutes} minutes</strong>.<br/>
    <a href="${claimUrl}" style="color: #c6a87c; word-break: break-all;">${claimUrl}</a>
  </p>
  <p style="color: #555; font-size: 13px;">${
    rotating
      ? 'Your existing key keeps working until you open the link and confirm the replacement. Nothing changes if you ignore this email.'
      : 'Your key is shown once on that page and is not stored anywhere we can read, so save it somewhere safe when you get there.'
  }</p>
  <p style="color: #888; font-size: 12px;">If you didn't request this, ignore this email — no key is issued and nothing changes.</p>
  <p style="color: #888; font-size: 12px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 12px;">
    — <strong>Ambr</strong> · <a href="https://ambr.run" style="color: #c6a87c;">ambr.run</a>
  </p>
</body>
</html>`;

  return { subject, text, html };
}
