/**
 * The message a failed API response carries, to show as it is. The server says
 * why a wallet may not sign (principal_slot_restricted, counterparty_invite_required,
 * slot_taken, ...); passing that through sanitizeWalletError, which exists for
 * wallet-provider errors, turned every one of those into "Wallet connection failed".
 */
export function serverErrorMessage(data: unknown, fallback = 'Signing failed'): string {
  const message = (data as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
}
