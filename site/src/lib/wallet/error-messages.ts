/**
 * Wallet Error Sanitizer
 *
 * Maps raw wallet provider errors to user-friendly messages.
 * Never exposes stack traces or extension internals to the UI.
 */

const ERROR_PATTERNS: [RegExp, string][] = [
  [/user rejected|user denied|ACTION_REJECTED/i, 'Request cancelled. You declined the transaction in your wallet.'],
  [/personal_sign|eth_sign|method not supported/i, 'Your wallet does not support message signing. Try a different wallet.'],
  [/insufficient funds/i, 'Insufficient funds in your wallet.'],
  [/chain mismatch|wrong network|chainId/i, 'Please switch your wallet to the Base network.'],
  [/already processing|pending request/i, 'Your wallet has a pending request. Please check your wallet.'],
  [/disconnected|not connected/i, 'Wallet disconnected. Please reconnect.'],
  [/timeout|timed out/i, 'Wallet request timed out. Please try again.'],
  [/Cannot read properties of undefined/i, 'Wallet connection failed. Your wallet may not be fully compatible. Please try a different wallet.'],
  [/account.*not found|no account/i, 'No account found in your wallet. Please unlock it and try again.'],
];

const DEFAULT_MESSAGE = 'Wallet connection failed. Please try again or use a different wallet.';

export function sanitizeWalletError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err);

  // Log the full error for debugging — never expose to UI
  console.error('[wallet]', err);

  for (const [pattern, friendly] of ERROR_PATTERNS) {
    if (pattern.test(raw)) return friendly;
  }

  return DEFAULT_MESSAGE;
}

/**
 * Check if a wallet error is a user-initiated rejection (should not show error UI).
 */
export function isUserRejection(err: unknown): boolean {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err);

  return /user rejected|user denied|ACTION_REJECTED/i.test(raw);
}
