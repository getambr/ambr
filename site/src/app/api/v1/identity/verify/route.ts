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
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const attestation = body as IdentityAttestationPayload;
  if (!attestation.proof || !attestation.public_signals || !attestation.nullifier_hash || !attestation.merkle_root) {
    return NextResponse.json(
      { error: 'validation_error', message: 'Required: proof, public_signals, nullifier_hash, merkle_root' },
      { status: 400 },
    );
  }

  const result = await verifyZKIdentityProof(attestation);

  return NextResponse.json({
    valid: result.valid,
    nullifier_hash: result.nullifier,
    merkle_root: result.merkleRoot,
    ...(result.error ? { error: result.error } : {}),
  }, { status: result.valid ? 200 : 400 });
}

export { corsOptions as OPTIONS };
