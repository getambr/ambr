import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { normalizeWallet, principalWalletFromKey, sharedWalletBothSides } from './signers';

/**
 * Creation-time guard shared by the REST and MCP doors: refuse a two-sided
 * contract that names one wallet on both sides. It could never be completed
 * (the wallet fills one slot, nobody else can fill the other), and by the time
 * that shows, the payment has settled. Runs with the request validation,
 * before any payment is verified or credit burned.
 */

export const SAME_WALLET_ERROR = 'same_wallet_both_parties';

export const SAME_WALLET_MESSAGE =
  'The same wallet is named on both sides of this contract. Each side needs its own wallet, ' +
  'otherwise nobody could ever countersign. Use a different wallet for the other party and try again. ' +
  'Nothing was charged.';

export const PRINCIPAL_WALLET_REQUIRED_ERROR = 'principal_wallet_required';

export const PRINCIPAL_WALLET_REQUIRED_MESSAGE =
  'This template is signed by one party only, and no wallet is named for that party. ' +
  'Send principal_wallet (your signing wallet), or set principal_agent_id to your wallet address. ' +
  'Nothing was charged.';

export interface PartyWalletProblem {
  error: typeof SAME_WALLET_ERROR | typeof PRINCIPAL_WALLET_REQUIRED_ERROR;
  message: string;
  /** Set for same_wallet_both_parties. */
  wallet?: string;
}

/**
 * The wallet that signs a one-sided contract: principal_wallet, else the
 * authorizer named in the parameters. Null when neither is a usable address.
 */
export function oneSidedPrincipalWallet(input: {
  principal_wallet?: string | null;
  parameters?: Record<string, unknown> | null;
}): string | null {
  return (
    normalizeWallet(input.principal_wallet) ?? normalizeWallet(input.parameters?.principal_agent_id) ?? null
  );
}

/**
 * Wallet to store as contracts.principal_wallet: what the caller sent, and for
 * a one-sided template the authorizer from the parameters when none was sent.
 * On a two-sided contract that names no principal-side wallet at all, the
 * creating key's own wallet (api_keys.principal_wallet) stands in, so the
 * principal slot is not left open to whoever signs first; see
 * principalWalletFromKey for when it does not. An x402 creator has no key, so
 * its principal_wallet is exactly what it sent.
 */
export function effectivePrincipalWallet(
  input: { principal_wallet?: string | null; parameters?: Record<string, unknown> | null },
  oneSided: boolean,
  keyPrincipalWallet?: string | null,
): string | null {
  if (oneSided) return oneSidedPrincipalWallet(input);
  return input.principal_wallet ?? principalWalletFromKey(input, keyPrincipalWallet);
}

/**
 * Wallet problems that make a contract unusable, found before anything is paid:
 *   - a two-sided contract with one wallet on both sides (can never complete);
 *   - a one-sided template with no wallet for its signer (nobody could sign).
 * One-sided templates are exempt from the first. The template is read only when
 * a problem is possible, so the common path costs no extra query.
 */
export async function findPartyWalletProblem(input: {
  template: string;
  principal_wallet?: string | null;
  parameters?: Record<string, unknown> | null;
}): Promise<PartyWalletProblem | null> {
  const shared = sharedWalletBothSides(input);
  const hasPrincipalWallet = oneSidedPrincipalWallet(input) !== null;
  if (!shared && hasPrincipalWallet) return null;

  const { data: template } = await getSupabaseAdmin()
    .from('templates')
    .select('is_one_sided')
    .eq('slug', input.template)
    .single();
  const oneSided = Boolean(template?.is_one_sided);

  if (oneSided) {
    return hasPrincipalWallet
      ? null
      : { error: PRINCIPAL_WALLET_REQUIRED_ERROR, message: PRINCIPAL_WALLET_REQUIRED_MESSAGE };
  }
  return shared ? { error: SAME_WALLET_ERROR, message: SAME_WALLET_MESSAGE, wallet: shared } : null;
}
