/**
 * The creation response's next-step hint. A one-sided template (the P2 power of
 * attorney) has only a principal slot, so the principal's signature alone
 * activates it; saying "both parties" there sends a caller looking for a
 * counterparty who does not exist.
 */
export function nextStepAfterCreate(oneSided: boolean): string {
  return oneSided
    ? 'Contract created as draft. Only the principal signs (ECDSA); that signature activates it, and there is no counterparty signature.'
    : 'Contract created as draft. Optionally handshake first, then both parties must sign (ECDSA) to activate.';
}

/** The same hint for the MCP door's text answer. */
export function mcpNextStepLines(oneSided: boolean): string[] {
  return [
    oneSided
      ? '**Next step:** Only the principal signs, with an ECDSA wallet signature; that signature activates the contract.'
      : '**Next step:** Both parties must sign with ECDSA wallet signatures to activate.',
    'POST to the Sign URL with: `{ wallet_address, signature, message }`',
    'The message must contain the contract SHA-256 hash.',
  ];
}
