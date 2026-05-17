/**
 * Beta-invite email content. Plain-text + minimal HTML so it lands in the
 * inbox (not "promotions") and renders identically across clients.
 *
 * Sender: Ambr <hello@ambr.run> (Resend-verified, DKIM/SPF/DMARC clean).
 */

export interface BetaInviteParams {
  recipientEmail: string;
  feature: 'ai_chat';
}

const FEATURE_COPY = {
  ai_chat: {
    headline: 'Beta access: Ambr Agent',
    description:
      'Chat-driven contract deployment for the A1, D1, and C1 Ricardian contract templates.',
    bullets: [
      'Describe the agreement you want and the agent drafts a contract.',
      'Review the structured fields, edit anything, then deploy in one click.',
      'Drafts auto-save locally — nothing leaves your browser until you deploy.',
    ],
  },
} as const;

export function renderBetaInvite(params: BetaInviteParams): {
  subject: string;
  text: string;
  html: string;
} {
  const copy = FEATURE_COPY[params.feature];

  const subject = copy.headline;

  const text = [
    `Hi,`,
    ``,
    `Your Ambr account now has access to the ${copy.headline.replace('Beta access: ', '')} beta — ${copy.description}`,
    ``,
    `Sign in: https://getamber.dev/dashboard`,
    `Look for the "Ambr Agent" pill on any section header.`,
    ``,
    `What you can do:`,
    ...copy.bullets.map((b) => `- ${b}`),
    ``,
    `This is a controlled rollout — we are collecting feedback before opening`,
    `it to public API key holders. Bug reports + observations welcome:`,
    `reply to this email and it lands with the team.`,
    ``,
    `— Ambr`,
    `https://ambr.run`,
  ].join('\n');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${copy.headline}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; line-height: 1.55; color: #1a1a1a; max-width: 540px; margin: 32px auto; padding: 0 16px;">
  <p>Hi,</p>
  <p>Your Ambr account now has access to the <strong>${copy.headline.replace('Beta access: ', '')}</strong> beta — ${copy.description}</p>
  <p style="margin: 18px 0;">
    <a href="https://getamber.dev/dashboard" style="display: inline-block; background: #c6a87c; color: #0a0a0a; text-decoration: none; padding: 10px 18px; font-family: 'JetBrains Mono', monospace; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em;">Open dashboard</a>
  </p>
  <p style="color: #555;">Look for the &ldquo;Ambr Agent&rdquo; pill on any section header.</p>
  <p><strong>What you can do:</strong></p>
  <ul>
    ${copy.bullets.map((b) => `<li>${b}</li>`).join('\n    ')}
  </ul>
  <p style="color: #555; font-size: 13px; margin-top: 24px;">
    This is a controlled rollout. Bug reports and observations welcome — reply to this email and it lands with the team.
  </p>
  <p style="color: #888; font-size: 12px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 12px;">
    — <strong>Ambr</strong> · <a href="https://ambr.run" style="color: #c6a87c;">ambr.run</a>
  </p>
</body>
</html>`;

  return { subject, text, html };
}
