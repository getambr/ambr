/**
 * ZK Identity Proof Verification — server-side Groth16 verification.
 *
 * Uses the DemosSDK's built-in ProofGenerator.verifyProof which handles
 * verification key fetching from CDN and snarkjs groth16.verify internally.
 */

import type { IdentityAttestationPayload, ZKVerificationResult } from './types';

export async function verifyZKIdentityProof(
  attestation: IdentityAttestationPayload
): Promise<ZKVerificationResult> {
  try {
    const { proof, public_signals, nullifier_hash, merkle_root } = attestation;

    if (!proof || !public_signals || !nullifier_hash || !merkle_root) {
      return { valid: false, nullifier: '', merkleRoot: '', error: 'Missing attestation fields' };
    }

    // Dynamic import — server-only (listed in serverExternalPackages).
    // ProofGenerator.verifyProof fetches the CDN verification key internally.
    const sdkPath = '@kynesyslabs/demosdk';
    const { ProofGenerator } = (await import(/* webpackIgnore: true */ sdkPath)).encryption.zK.identity;
    const valid = await ProofGenerator.verifyProof(proof, public_signals);

    return {
      valid,
      nullifier: nullifier_hash,
      merkleRoot: merkle_root,
      ...(!valid ? { error: 'Groth16 proof verification failed' } : {}),
    };
  } catch (err) {
    return {
      valid: false,
      nullifier: attestation.nullifier_hash || '',
      merkleRoot: attestation.merkle_root || '',
      error: err instanceof Error ? err.message : 'Proof verification error',
    };
  }
}
