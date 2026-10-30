/**
 * Shared by the REST and MCP doors: what a failed or late x402 settlement may
 * say to the payer, and when settlement must not be attempted at all.
 */

/** A facilitator-declared failure code ("insufficient_funds"), as opposed to raw error text. */
export function isCodedReason(reason: string | undefined): reason is string {
  return typeof reason === 'string' && /^[a-z0-9_]+$/.test(reason);
}

// Read from @x402/evm 2.28.0 (exact/facilitator/errors.ts): the EIP-3009 checks that fail
// BEFORE anything is broadcast. Left out on purpose: invalid_exact_evm_transaction_failed,
// invalid_exact_evm_transfer_event_mismatch, invalid_transaction_state, settlement_pending,
// smart_wallet_deployment_failed (all after a broadcast) and every unexpected_* / unknown code.
// Also left out: invalid_exact_evm_nonce_already_used. Verify passed moments earlier, so a used
// nonce at settle means this authorization was spent in between, most likely by our own settle.
const PRE_BROADCAST_DECLINES: ReadonlySet<string> = new Set([
  'invalid_exact_evm_scheme',
  'invalid_exact_evm_network_mismatch',
  'invalid_exact_evm_missing_eip712_domain',
  'invalid_exact_evm_recipient_mismatch',
  'invalid_exact_evm_signature',
  'invalid_exact_evm_failed_to_parse_signature',
  'invalid_exact_evm_payload_authorization_valid_before',
  'invalid_exact_evm_payload_authorization_valid_after',
  'invalid_exact_evm_authorization_value',
  'invalid_exact_evm_payload_authorization_value_mismatch',
  'invalid_exact_evm_token_name_mismatch',
  'invalid_exact_evm_token_version_mismatch',
  'invalid_exact_evm_eip3009_not_supported',
  'invalid_exact_evm_insufficient_balance',
  'invalid_exact_evm_transaction_simulation_failed',
  'unsupported_payload_type',
]);

/**
 * True only when a failed settle provably moved nothing: no transaction hash AND
 * a code that by construction fails before broadcast. Everything else (a
 * settlement_pending, an unexpected_* 5xx body, an unknown code, any hash) is
 * ambiguous and must not tell the payer to pay again.
 */
export function isDeclinedSettle(reason: string | undefined, transaction: string | undefined): boolean {
  return !transaction && typeof reason === 'string' && PRE_BROADCAST_DECLINES.has(reason);
}

/** Reason that is safe to put in a response, or undefined. */
export function publicSettleReason(reason: string | undefined): string | undefined {
  return isCodedReason(reason) ? reason : undefined;
}

/**
 * Never settle when the function could be killed before the contract insert:
 * the payer would be charged for nothing. Margin covers settle (25 s) + insert.
 */
export const SETTLE_DEADLINE_MARGIN_MS = 35_000;

export function pastSettleDeadline(startedAt: number, maxDurationSeconds: number, now: number = Date.now()): boolean {
  return now - startedAt > maxDurationSeconds * 1000 - SETTLE_DEADLINE_MARGIN_MS;
}

export function paymentStatusUnknownBody(nonce: string | undefined) {
  return {
    error: 'payment_status_unknown',
    message:
      'We could not confirm whether the payment settled. Do not pay again: contact support quoting the authorization nonce.',
    ...(nonce ? { nonce } : {}),
  };
}

/** Body for a generation that finished too late to settle safely. */
export const GENERATION_TIMEOUT_RETRY_AFTER_SECONDS = 30;
export function generationTimeoutBody() {
  return {
    error: 'generation_timeout',
    message: 'Contract generation took too long. Nothing was charged. Retry.',
    retry_after: GENERATION_TIMEOUT_RETRY_AFTER_SECONDS,
  };
}
