/**
 * x402 adapter — agreement-gated payments (an x402 extension).
 *
 * x402 answers "did they pay?". It does NOT answer "under what terms / whose
 * authority?". This module defines a small, x402-compatible convention that
 * carries an Ambr agreement *inside* the 402 handshake: the 402 body keeps its
 * normal x402 payment requirements AND gains an `agreement` reference (readable
 * terms + hash). The agent reads the agreement, accepts/signs it, and retries
 * with both the payment proof (X-Payment) and the acceptance.
 *
 * This is an EXTENSION on top of x402 — and gateway-agnostic (the same envelope
 * works regardless of how payment settles, including AP2/Stripe) — NOT a
 * competing rail. Pure functions, zero dependencies.
 */

/** The payment-requirements block Ambr returns in a 402 body (the `x402` field). */
export interface X402PaymentRequirements {
  version: string;
  currency: string;
  chain: string;
  recipient: string;
  description: string;
  accepts: string[];
  accepted_tokens: { symbol: string; address: string; decimals: number; stable: boolean }[];
  pricing: Record<string, string>;
  price?: string;
}

/** Reference to an Ambr agreement carried alongside the payment requirement. */
export interface AgreementRef {
  hash: string;
  reader_url: string;
  /** Optional machine-readable binding terms (what the agent may / may not do). */
  terms?: unknown;
}

/** A base Ambr 402 body (payment-only), as returned by the contracts API. */
export interface PaymentRequired402 {
  error: string;
  message: string;
  x402: X402PaymentRequirements;
}

/** A 402 body that gates the response on BOTH payment AND an Ambr agreement. */
export interface ContractGated402 extends PaymentRequired402 {
  agreement: AgreementRef;
}

/**
 * Server side: attach an Ambr agreement to a standard Ambr 402 body, producing
 * a contract-gated 402. The agent must then both pay AND accept the agreement.
 * `agreement` accepts anything with a `hash` + `readerUrl` (e.g. the value
 * returned by `AmbrClient.createAgreement`).
 */
export function attachAgreement(
  base: PaymentRequired402,
  agreement: { hash: string; readerUrl: string },
  opts: { terms?: unknown; message?: string } = {},
): ContractGated402 {
  return {
    error: base.error,
    message:
      opts.message ??
      `${base.message} This endpoint also requires accepting an agreement (${agreement.hash}).`,
    x402: base.x402,
    agreement: {
      hash: agreement.hash,
      reader_url: agreement.readerUrl,
      ...(opts.terms !== undefined ? { terms: opts.terms } : {}),
    },
  };
}

/** True if `body` is a contract-gated 402 (has both x402 payment AND an agreement ref). */
export function isContractGated402(body: unknown): body is ContractGated402 {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  if (!b.x402 || typeof b.x402 !== 'object') return false;
  const a = b.agreement as Record<string, unknown> | undefined;
  return (
    !!a &&
    typeof a === 'object' &&
    typeof a.hash === 'string' &&
    typeof a.reader_url === 'string'
  );
}

/**
 * Client side: split a contract-gated 402 into its payment requirement and
 * agreement reference. Returns null if `body` is not a contract-gated 402
 * (e.g. a plain payment-only 402, or anything else).
 */
export function parseContractGated402(
  body: unknown,
): { payment: X402PaymentRequirements; agreement: AgreementRef } | null {
  if (!isContractGated402(body)) return null;
  return { payment: body.x402, agreement: body.agreement };
}
