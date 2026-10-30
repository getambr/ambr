/**
 * DACS domain-separated artifact signing (§7.7).
 *
 *   signed_bytes := domain_separator || sha256_hex(JCS_canonical(artifact \ signature))
 *   signature    := sign(signed_bytes)
 *
 * SERVER-SIDE ARTIFACT signing only (VerifyResult etc.) — NOT the user
 * contract-signing path. The platform signer is read from `DACS_SIGNER_KEY`
 * (a dedicated key, deliberately NOT the cNFT minter key). When unset, artifacts
 * are returned UNSIGNED (`value: ''`) — fine for the MVP since nothing external
 * verifies them yet; wire a key before publishing artifacts for third parties.
 */

import { canonicalHash } from './canonical';
import type { VerifyResultSignature } from './types';

/** Domain separators (§7.7). Extend as more artifacts are emitted. */
export const DACS_DOMAINS = {
  verifyResult: 'dacs-verifyresult:v1:',
  composite: 'dacs-composite:v1:',
  agreement: 'dacs-agreement:v1:',
  bundle: 'dacs-bundle:v1:',
  evidence: 'dacs-evidence:v1:',
} as const;

export type DacsDomain = (typeof DACS_DOMAINS)[keyof typeof DACS_DOMAINS];

/** The exact bytes a signer commits to for a DACS artifact. */
export function dacsSignedBytes(domain: DacsDomain, artifactWithoutSignature: unknown): string {
  return domain + canonicalHash(artifactWithoutSignature);
}

/**
 * Sign a DACS artifact (the object with its `signature` field omitted). Returns
 * an unsigned marker when no `DACS_SIGNER_KEY` is configured.
 */
export async function signDacsArtifact(
  domain: DacsDomain,
  artifactWithoutSignature: unknown,
): Promise<VerifyResultSignature> {
  const key = process.env.DACS_SIGNER_KEY;
  if (!key) {
    return { algorithm: 'ecdsa-secp256k1', value: '' };
  }
  const message = dacsSignedBytes(domain, artifactWithoutSignature);
  // Dynamic import keeps ethers off any client bundle that transitively imports
  // this module.
  const { Wallet } = await import('ethers');
  const wallet = new Wallet(key);
  const value = await wallet.signMessage(message);
  return { algorithm: 'ecdsa-secp256k1', party: `key:${wallet.address}`, value };
}
