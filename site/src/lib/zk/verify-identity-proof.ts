/**
 * ZK Identity Proof Verification — server-side Groth16 verification.
 *
 * Uses the DemosSDK's built-in ProofGenerator.verifyProof which handles
 * verification key loading (pinned ceremony key, fetched from GitHub and
 * checked against a SHA-256 digest, cached per process) and snarkjs
 * groth16.verify internally.
 *
 * A valid Groth16 proof only says the public signals are consistent with the
 * circuit; it does not say who built the Merkle tree or what context the
 * prover chose. So the public signals are the only source of truth here
 * (demosdk 4.x order: [nullifier, context, merkleRoot]), and three more things
 * are checked before an attestation counts:
 *   - the context signal is this contract's context (see ./context.ts);
 *   - the nullifier and root fields of the request, when present, equal the
 *     signals;
 *   - the root is the Demos node's current Merkle root. The SDK exposes no root
 *     history, so only the current root is accepted. Ambr never submits the
 *     attestation to a node, so nothing else ties the proof to the real tree.
 */

import type {
  IdentityAttestationPayload,
  ZKVerificationErrorCode,
  ZKVerificationResult,
} from './types';
import { contractAttestationContext } from './context';

// BN254 scalar field order: the range of every circuit signal (the same
// constant the SDK reduces its string inputs by).
const BN254_SCALAR_FIELD = BigInt(
  '21888242871839275222246405745257275088548364400416034343698204186575808495617',
);
// snarkjs emits public signals as canonical decimal strings. Anything else
// (hex, leading zeros, a sign) could be read differently by snarkjs than by the
// string comparisons below, so it is refused.
const CANONICAL_DECIMAL = /^(0|[1-9][0-9]{0,77})$/;
const HEX_ROOT = /^0x[0-9a-fA-F]{1,64}$/;

const DEFAULT_DEMOS_RPC_URL = 'https://rpc.demos.sh';
const ROOT_FETCH_TIMEOUT_MS = 5000;

function fail(code: ZKVerificationErrorCode, error: string): ZKVerificationResult {
  return { valid: false, nullifier: '', merkleRoot: '', error, code };
}

/** A canonical decimal string below the field order, or null. */
function parseFieldElement(value: unknown): bigint | null {
  if (typeof value !== 'string' || !CANONICAL_DECIMAL.test(value)) return null;
  const n = BigInt(value);
  return n < BN254_SCALAR_FIELD ? n : null;
}

/** The node's root as a field element; it may be written in decimal or hex. */
function parseNodeRoot(value: unknown): bigint | null {
  if (typeof value !== 'string') return null;
  if (HEX_ROOT.test(value)) {
    const n = BigInt(value);
    return n < BN254_SCALAR_FIELD ? n : null;
  }
  return parseFieldElement(value);
}

/** The Demos node's current Merkle root (the SDK reads it from GET /zk/merkle-root). Throws when it cannot be read. */
async function fetchNodeMerkleRoot(): Promise<bigint> {
  const base = (process.env.DEMOS_RPC_URL || DEFAULT_DEMOS_RPC_URL).replace(/\/+$/, '');
  const res = await fetch(`${base}/zk/merkle-root`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(ROOT_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Demos node answered ${res.status}`);
  const root = parseNodeRoot(((await res.json()) as { rootHash?: unknown } | null)?.rootHash);
  if (root === null) throw new Error('Demos node returned an unreadable Merkle root');
  return root;
}

/**
 * @param contractId the contract the attestation is for (`amb-YYYY-NNNN`); the
 *   proof must carry the context made from it.
 */
export async function verifyZKIdentityProof(
  attestation: IdentityAttestationPayload,
  contractId: string,
): Promise<ZKVerificationResult> {
  try {
    const { proof, public_signals, nullifier_hash, merkle_root } = attestation ?? ({} as IdentityAttestationPayload);

    if (!proof || !public_signals || typeof contractId !== 'string' || !contractId) {
      return fail('zk_missing_fields', 'Missing attestation fields');
    }

    // The public signals: exactly [nullifier, context, merkleRoot], each a field element.
    if (!Array.isArray(public_signals) || public_signals.length !== 3) {
      return fail('zk_bad_signals', 'public_signals must hold exactly 3 values: nullifier, context, merkle root');
    }
    const [nullifier, context, root] = public_signals;
    if (parseFieldElement(nullifier) === null || parseFieldElement(context) === null || parseFieldElement(root) === null) {
      return fail('zk_bad_signals', 'public_signals must be decimal field elements');
    }

    // The request's own copies of the nullifier and root must not differ from the signals.
    if ((nullifier_hash != null && nullifier_hash !== nullifier) || (merkle_root != null && merkle_root !== root)) {
      return fail('zk_signal_mismatch', 'nullifier_hash and merkle_root must match the proof public signals');
    }

    // Dynamic import — server-only (listed in serverExternalPackages).
    // ProofGenerator.verifyProof loads the pinned verification key internally.
    const sdkPath = '@kynesyslabs/demosdk';
    const { ProofGenerator, attestationContextSignal } = (await import(/* webpackIgnore: true */ sdkPath)).encryption.zK.identity;

    // The context must be this contract's, as the SDK encodes it for the circuit.
    if (context !== attestationContextSignal(contractAttestationContext(contractId))) {
      return fail('zk_context_mismatch', 'The proof was not made for this contract');
    }

    const valid = await ProofGenerator.verifyProof(proof, public_signals);
    if (!valid) return fail('zk_proof_invalid', 'Groth16 proof verification failed');

    // The root must be the node's. Fail closed when the node cannot say.
    let nodeRoot: bigint;
    try {
      nodeRoot = await fetchNodeMerkleRoot();
    } catch (err) {
      return fail(
        'zk_root_unverified',
        `Could not check the Merkle root against the Demos node: ${err instanceof Error ? err.message : 'unreachable'}`,
      );
    }
    if (nodeRoot !== BigInt(root)) {
      return fail('zk_root_mismatch', 'The proof was made against a Merkle root that is not the Demos node\'s current root');
    }

    return { valid: true, nullifier, merkleRoot: root };
  } catch (err) {
    return fail('zk_proof_invalid', err instanceof Error ? err.message : 'Proof verification error');
  }
}
