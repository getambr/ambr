/**
 * Email sent to a counterparty when the sender shares a contract for review.
 *
 * Trigger: POST /api/v1/contracts/[id]/share with recipient_email.
 * From: Ambr <hello@ambr.run> (Resend-verified, DKIM/SPF/DMARC clean).
 */

export interface ShareInviteParams {
  recipientEmail: string;
  contractIdLabel: string;       // human-readable like "amb-2026-0001"
  contractHash: string;          // SHA-256
  readerUrl: string;             // https://getamber.dev/reader/<hash>?token=<token>
  senderName?: string;           // sender's email or display name
  expiresAt?: string;            // ISO timestamp the share token expires
}

export function renderShareInvite(params: ShareInviteParams): {
  subject: string;
  text: string;
  html: string;
} {
  const { contractIdLabel, contractHash, readerUrl, senderName, expiresAt } = params;
  const senderLine = senderName
    ? `${senderName} has sent you an Ambr contract to review.`
    : `An Ambr contract has been sent to you for review.`;
  const expiresLine = expiresAt
    ? `Link expires: ${new Date(expiresAt).toUTCString()}`
    : 'Link is time-limited — please review soon.';

  const subject = `Contract for your review — ${contractIdLabel}`;

  const text = [
    `Hi,`,
    ``,
    senderLine,
    ``,
    `Open and review the contract:`,
    readerUrl,
    ``,
    `Contract ID: ${contractIdLabel}`,
    `Hash: ${contractHash.slice(0, 16)}…`,
    expiresLine,
    ``,
    `What happens next:`,
    `- The reader page lets you read the full Ricardian contract terms.`,
    `- If you accept, connect a wallet and sign with one click — both sides need to sign for the contract to activate.`,
    `- Once both sides sign, a paired compressed-NFT pair mints on Base mainnet as cryptographic proof.`,
    ``,
    `Questions? Reply to this email and the team will respond.`,
    ``,
    `— Ambr`,
    `https://ambr.run`,
  ].join('\n');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; line-height: 1.55; color: #1a1a1a; max-width: 540px; margin: 32px auto; padding: 0 16px;">
  <p>Hi,</p>
  <p>${senderLine}</p>
  <p style="margin: 18px 0;">
    <a href="${readerUrl}" style="display: inline-block; background: #c6a87c; color: #0a0a0a; text-decoration: none; padding: 12px 22px; font-family: 'JetBrains Mono', monospace; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em;">Review &amp; sign contract</a>
  </p>
  <p style="color: #555; font-size: 13px;">
    <strong>Contract ID:</strong> ${contractIdLabel}<br/>
    <strong>Hash:</strong> <code style="font-family: monospace;">${contractHash.slice(0, 16)}…</code><br/>
    <strong>Link:</strong> <a href="${readerUrl}" style="color: #c6a87c; word-break: break-all;">${readerUrl}</a><br/>
    <strong>${expiresLine}</strong>
  </p>
  <p style="color: #555; font-size: 13px;"><strong>What happens next:</strong></p>
  <ul style="color: #555; font-size: 13px;">
    <li>The reader page shows the full Ricardian contract terms.</li>
    <li>If you accept, connect a wallet and sign — both sides need to sign for the contract to activate.</li>
    <li>Once both sides sign, a paired cNFT mints on Base mainnet as cryptographic proof.</li>
  </ul>
  <p style="color: #555; font-size: 13px;">Questions? Reply to this email and the team will respond.</p>
  <p style="color: #888; font-size: 12px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 12px;">
    — <strong>Ambr</strong> · <a href="https://ambr.run" style="color: #c6a87c;">ambr.run</a>
  </p>
</body>
</html>`;

  return { subject, text, html };
}
