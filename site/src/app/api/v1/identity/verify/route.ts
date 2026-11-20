import { NextResponse } from 'next/server';
import { verifyZKIdentityProof } from '@/lib/zk/verify-identity-proof';
import type { IdentityAttestationPayload } from '@/lib/zk/types';
import { corsOptions } from '@/lib/cors';

export const runtime = 'nodejs';

/**
 * POST /api/v1/identity/verify
 *
 * Stateless ZK identity proof verification.
 * Verifies a Groth16 proof without recording the nullifier.
 * Useful for client-side pre-verification before submitting with /sign.
 *
 * `contract_id` is the contract the proof is for (amb-YYYY-NNNN): the proof's
 * context signal must be that contract's context, as /sign checks it. The
 * nullifier and root in the response are the proof's own public signals.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const attestation = body as IdentityAttestationPayload & { contract_id?: unknown };
  if (!attestation.proof || !attestation.public_signals || !attestation.nullifier_hash || !attestation.merkle_root) {
    return NextResponse.json(
      { error: 'validation_error', message: 'Required: proof, public_signals, nullifier_hash, merkle_root, contract_id' },
      { status: 400 },
    );
  }
  if (typeof attestation.contract_id !== 'string' || !attestation.contract_id) {
    return NextResponse.json(
      { error: 'validation_error', message: 'Required: contract_id (the contract the proof was made for)' },
      { status: 400 },
    );
  }

  const result = await verifyZKIdentityProof(attestation, attestation.contract_id);

  if (!result.valid) {
    return NextResponse.json({
      valid: false,
      error: result.error,
      code: result.code,
    }, { status: result.code === 'zk_root_unverified' ? 503 : 400 });
  }

  return NextResponse.json({
    valid: true,
    nullifier_hash: result.nullifier,
    merkle_root: result.merkleRoot,
  });
}

export { corsOptions as OPTIONS };
