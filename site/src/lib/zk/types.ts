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
  /** demosdk 4.x order: [nullifier, context, merkleRoot] (2.x was [nullifier, merkleRoot, context]). */
  public_signals: string[];
  provider: string;
}

export type ZKVerificationErrorCode =
  | 'zk_missing_fields'
  | 'zk_bad_signals'
  | 'zk_signal_mismatch'
  | 'zk_context_mismatch'
  | 'zk_proof_invalid'
  | 'zk_root_unverified'
  | 'zk_root_mismatch';

/**
 * Outcome of verifyZKIdentityProof. `nullifier` and `merkleRoot` are read from
 * the proof's public signals and are set only when `valid` is true.
 */
export interface ZKVerificationResult {
  valid: boolean;
  nullifier: string;
  merkleRoot: string;
  error?: string;
  code?: ZKVerificationErrorCode;
}
