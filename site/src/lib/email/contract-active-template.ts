/**
 * Email sent to BOTH parties when a contract transitions to `active`
 * (both signatures landed; cNFT mint kicked off async on Base mainnet).
 *
 * Trigger: POST /api/v1/contracts/[id]/sign on second signature land
 * (status pending_signature → active).
 * From: Ambr <hello@ambr.run>.
 */

export interface ContractActiveParams {
  recipientEmail: string;
  recipientRole: 'sender' | 'counterparty';
  contractIdLabel: string;
  contractHash: string;
  readerUrl: string;             // public reader URL with token (works for both sides)
  activatedAtISO: string;
}

export function renderContractActive(params: ContractActiveParams): {
  subject: string;
  text: string;
  html: string;
} {
  const { recipientRole, contractIdLabel, contractHash, readerUrl, activatedAtISO } = params;
  const subject = `Contract active — ${contractIdLabel}`;
  const greeting = recipientRole === 'sender'
    ? `Your contract is now active.`
    : `The contract you signed is now active.`;
  const mintNote = `A paired cNFT pair is minting on Base mainnet — visible in the dashboard / reader within a minute or two.`;

  const text = [
    greeting,
    ``,
    `Both sides have signed. Activated at ${new Date(activatedAtISO).toUTCString()}.`,
    mintNote,
    ``,
    `Open the contract:`,
    readerUrl,
    ``,
    `Contract ID: ${contractIdLabel}`,
    `Hash: ${contractHash.slice(0, 16)}…`,
    ``,
    `— Ambr`,
    `https://ambr.run`,
  ].join('\n');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; line-height: 1.55; color: #1a1a1a; max-width: 540px; margin: 32px auto; padding: 0 16px;">
  <p style="font-size: 16px;"><strong>${greeting}</strong></p>
  <p>Both sides have signed. Activated at ${new Date(activatedAtISO).toUTCString()}.</p>
  <p style="color: #555;">${mintNote}</p>
  <p style="margin: 18px 0;">
    <a href="${readerUrl}" style="display: inline-block; background: #c6a87c; color: #0a0a0a; text-decoration: none; padding: 12px 22px; font-family: 'JetBrains Mono', monospace; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em;">Open contract</a>
  </p>
  <p style="color: #555; font-size: 13px;">
    <strong>Contract ID:</strong> ${contractIdLabel}<br/>
    <strong>Hash:</strong> <code style="font-family: monospace;">${contractHash.slice(0, 16)}…</code>
  </p>
  <p style="color: #888; font-size: 12px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 12px;">
    — <strong>Ambr</strong> · <a href="https://ambr.run" style="color: #c6a87c;">ambr.run</a>
  </p>
</body>
</html>`;

  return { subject, text, html };
}
