/**
 * DACS (Demos Agent Commerce Standards) v0.1 — type transcriptions.
 *
 * DACS ships as a prose + embedded-TypeScript spec
 * (github.com/DACS-Agent-commerce/DACS-Standard, MIT, v0.1) with NO npm
 * package — so we hand-transcribe the subset Ambr needs. This file holds the
 * DACS-2 Vet artifacts (VerifyResult, AttestationRef, Recipe). AgreementDocument
 * (DACS-3) and AttestationBundle (DACS-5) get added here when those stages land.
 *
 * Source: SPECIFICATION.md §7.4 (Recipe) + §7.5 (VerifyResult). v0.1 is a DRAFT
 * standard — breaking changes are possible at v1.0; keep this isolated so a bump
 * is a single-file edit.
 */

/**
 * A DACS-1 claim reference (e.g. `lei:5493...`, `did:web:...`, `key:0x...`).
 * Modelled as a plain string for the MVP; the spec uses a structured ref.
 */
export type ClaimReference = string;

/** DACS-2 verification method kinds (§7.4.1). */
export type VerificationMethodKind =
  | 'verifiable-credential'
  | 'tlsnotary'
  | 'zktls'
  | 'consensus-backed-proxy'
  | 'oauth-attested'
  | 'evm-rpc'
  | 'domain-tls-control'
  | 'self-signed';

/** The consensus-backed-proxy method (the one DAHR services). */
export interface ConsensusBackedProxyMethod {
  kind: 'consensus-backed-proxy';
  endpoint: {
    method: 'GET' | 'POST';
    urlTemplate: string; // `{identifier}` placeholder substituted at call time
    headers?: Record<string, string>;
    body?: string;
  };
}

/** Parser spec for extracting a decision + fields from the fetched body (§7.4.1). */
export interface JsonParserSpec {
  format: 'json';
  /** JSONPath whose presence => "pass" (absence => "fail"). */
  successJsonPath: string;
  /** Map of output field name -> JSONPath, applied to the body for `data`. */
  dataMap?: Record<string, string>;
}

/** A DACS-2 recipe (§7.4.1) — the steward-signed verification rule per scheme. */
export interface Recipe {
  recipeVersion: number;
  scheme: string;
  defaultMethod: ConsensusBackedProxyMethod;
  defaultMaxAgeSec: number;
  parserRules: JsonParserSpec;
  /** true => a match means FAIL (OFAC-style sanctions screening). */
  negativeMatch?: boolean;
  retryClass: 'transient' | 'permanent';
}

/** Where a VerifyResult's evidence is anchored (§7.5). */
export interface AttestationRef {
  anchor: {
    kind: 'storage-program' | 'ipfs' | 'https' | 'demos-web2';
    locator: string; // tx hash / CID / URL
  };
  contentHash: string; // sha256 of the attested response (DAHR responseHash)
  signer?: ClaimReference;
}

export interface VerifyResultSignature {
  algorithm: 'ecdsa-secp256k1' | 'ed25519' | 'sr1-aggregate';
  party?: ClaimReference;
  value: string; // '' when no platform signer key is configured (MVP)
}

/** The 4-valued DACS-2 decision (§7.5). */
export type VerifyDecision = 'pass' | 'fail' | 'indeterminate' | 'error';

/** DACS-2 Vet output (§7.5). */
export interface VerifyResult {
  resultVersion: '1';
  scheme: string;
  identifier: string;
  recipeVersion: number;
  method: VerificationMethodKind;
  decision: VerifyDecision;
  reason: string;
  attestation: AttestationRef;
  data?: Record<string, unknown>;
  fetchedAt: number; // unix ms
  verifiedAt: number; // unix ms
  validUntil?: number;
  signature: VerifyResultSignature;
}
