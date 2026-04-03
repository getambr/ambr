/**
 * ZK Identity Types — Groth16/BN128 proof structures for DemosSDK integration.
 */

export interface ZKProof {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
  protocol: string;
}

export interface IdentityAttestationPayload {
  nullifier_hash: string;
  merkle_root: string;
  proof: ZKProof;
  public_signals: string[];
  provider: string;
}

export interface ZKVerificationResult {
  valid: boolean;
  nullifier: string;
  merkleRoot: string;
  error?: string;
}
