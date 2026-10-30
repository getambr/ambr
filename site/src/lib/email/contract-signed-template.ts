/**
 * Email sent to the sender when the counterparty has signed (status flipped
 * to `pending_signature`, awaiting the sender's own counter-signature).
 *
 * Trigger: POST /api/v1/contracts/[id]/sign on first signature land.
 * From: Ambr <hello@ambr.run>.
 */

export interface ContractSignedParams {
  recipientEmail: string;        // sender
  contractIdLabel: string;
  contractHash: string;
  contractUrl: string;           // dashboard contract-detail URL
  signerWalletShort?: string;    // first 6 chars of counterparty wallet, for context
  signedAtISO: string;
}

export function renderContractSigned(params: ContractSignedParams): {
  subject: string;
  text: string;
  html: string;
} {
  const { contractIdLabel, contractHash, contractUrl, signerWalletShort, signedAtISO } = params;
  const subject = `Counterparty signed — ${contractIdLabel}`;
  const signerLine = signerWalletShort
    ? `Counterparty wallet ${signerWalletShort}… signed at ${new Date(signedAtISO).toUTCString()}.`
    : `Counterparty signed at ${new Date(signedAtISO).toUTCString()}.`;

  const text = [
    `Your counterparty has signed contract ${contractIdLabel}.`,
    ``,
    signerLine,
    ``,
    `Open the contract to add your signature — both sides need to sign before the contract activates and the paired cNFT mints on Base mainnet.`,
    ``,
    contractUrl,
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
  <p>Your counterparty has signed contract <strong>${contractIdLabel}</strong>.</p>
  <p style="color: #555;">${signerLine}</p>
  <p>Open the contract to add your signature — both sides need to sign before it activates and the paired cNFT mints on Base mainnet.</p>
  <p style="margin: 18px 0;">
    <a href="${contractUrl}" style="display: inline-block; background: #c6a87c; color: #0a0a0a; text-decoration: none; padding: 12px 22px; font-family: 'JetBrains Mono', monospace; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em;">Add your signature</a>
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
