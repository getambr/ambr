/**
 * The context a contract's ZK identity attestation is proved under.
 *
 * The nullifier is Poseidon(provider_id, secret, context), so putting the
 * contract in the context gives one identity a different nullifier on every
 * contract, and a proof made for one contract does not verify for another.
 * The signer's client proves under this string and the server checks the
 * proof's public context signal against it.
 */
export function contractAttestationContext(contractId: string): string {
  return `ambr_contract:${contractId}`;
}
