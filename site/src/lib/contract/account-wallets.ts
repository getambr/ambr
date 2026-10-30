import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { normalizeWallet } from './signers';

/**
 * The account_wallets sources that carry proof: `auto_wallet_auth` verifies an
 * ECDSA signature before it writes, `manual` is a deliberate act by the account
 * holder. The other sources prove nothing: `auto_backfill` bound counterparties
 * who happened to sign under a key, and `auto_deploy` binds whatever
 * principal_wallet a caller typed. One list for every reader of the table
 * (the dashboard, Article 14 approval, the sign route), so they cannot differ.
 */
export const PROVEN_BINDING_SOURCES = ['auto_wallet_auth', 'manual'];

/**
 * The wallets that belong to the account behind an API key: its PROVEN
 * account_wallets bindings plus api_keys.principal_wallet (set only by a
 * verified delegation). The same set approval-auth.ts calls the account's
 * wallets, and for the same reason the AGENT is left out of it:
 * principal_declaration.agent_id names the agent, which is never the principal.
 * The zero address is never a wallet (normalizeWallet).
 *
 * Used twice, so the two cannot disagree:
 *   - at creation, to declare the principal wallet when the request names none
 *   - at signing, to decide who may fill an open principal slot
 */
export interface AccountWallets {
  /** Lowercased, deduplicated, without the agent. */
  all: string[];
  /** api_keys.principal_wallet, when set and not the agent. */
  delegated: string | null;
}

/** Throws on a failed read: at signing a blind spot must refuse, not fall back to the key. */
export async function loadAccountWallets(apiKeyId: string, agentWallet?: unknown): Promise<AccountWallets> {
  const db = getSupabaseAdmin();
  const [bound, key] = await Promise.all([
    db
      .from('account_wallets')
      .select('wallet_address')
      .eq('api_key_id', apiKeyId)
      .in('source', PROVEN_BINDING_SOURCES),
    db.from('api_keys').select('principal_wallet').eq('id', apiKeyId).single(),
  ]);
  if (bound.error) throw new Error(`account_wallets read failed: ${bound.error.message}`);

  const agent = normalizeWallet(agentWallet);
  const usable = (w: unknown) => {
    const n = normalizeWallet(w);
    return n && n !== agent ? n : null;
  };
  const delegated = usable(key.data?.principal_wallet);
  const all = new Set<string>();
  if (delegated) all.add(delegated);
  for (const row of bound.data ?? []) {
    const n = usable(row.wallet_address);
    if (n) all.add(n);
  }
  return { all: [...all], delegated };
}

/**
 * The wallet to declare as a new contract's principal when the request names
 * none: the delegated wallet, else the account's only bound wallet. With
 * several bound wallets none of them is the principal by itself, so the slot
 * stays open and signing is limited to them (see the sign route).
 */
export function creationPrincipalWallet(w: AccountWallets): string | null {
  return w.delegated ?? (w.all.length === 1 ? w.all[0] : null);
}

/** creationPrincipalWallet for an API key, or null when it cannot be read: the slot then stays open. */
export async function accountPrincipalWallet(apiKeyId: string, agentWallet?: unknown): Promise<string | null> {
  try {
    return creationPrincipalWallet(await loadAccountWallets(apiKeyId, agentWallet));
  } catch (err) {
    console.error('[account-wallets] principal wallet lookup failed:', err);
    return null;
  }
}
