import type { IdentityAdapter, IdentityResult } from './index';
import type { IdentityAttestationPayload } from '@/lib/zk/types';
import { verifyZKIdentityProof } from '@/lib/zk/verify-identity-proof';

/**
 * Demos Identity Adapter — ZK identity verification via Groth16/Poseidon proofs.
 *
 * The token parameter is a JSON-serialized IdentityAttestationPayload containing
 * the nullifier hash, merkle root, and Groth16 proof generated client-side by
 * the DemosSDK.
 */
export class DemosIdentityAdapter implements IdentityAdapter {
  name = 'demos';

  async verify(token: string, walletAddress: string): Promise<IdentityResult | null> {
    if (!token || !walletAddress) return null;

    let attestation: IdentityAttestationPayload;
    try {
      attestation = JSON.parse(token);
    } catch {
      return null;
    }

    if (!attestation.proof || !attestation.public_signals || !attestation.nullifier_hash) {
      return null;
    }

    const result = await verifyZKIdentityProof(attestation);
    if (!result.valid) return null;

    return {
      verified: true,
      provider: 'demos',
      address: walletAddress.toLowerCase(),
      linked_identities: {},
      metadata: {
        nullifier_hash: attestation.nullifier_hash,
        merkle_root: attestation.merkle_root,
        proof_protocol: 'groth16',
        provider: attestation.provider || 'demos',
        verified_at: new Date().toISOString(),
      },
    };
  }
}
