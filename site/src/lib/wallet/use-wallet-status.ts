'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useWalletProviders, type EIP6963ProviderDetail } from './providers';

/** Custom event name for same-tab wallet changes */
export const WALLET_CHANGE_EVENT = 'ambr-wallet-change';

const NFT_WALLET_KEY = 'ambr_nft_wallet';
const PREFERRED_RDNS_KEY = 'ambr_preferred_wallet_rdns';
const CACHE_TTL = 60_000; // 1 minute

interface WalletStatus {
  wallet: string | null;
  nftCount: number;
  pendingActions: number;
  hasZkIdentity: boolean;
  loading: boolean;
  /** Disconnect: clears the persisted wallet + preferred-provider choice. */
  disconnect: () => void;
  /** All injected EIP-1193 providers discovered via EIP-6963. */
  providers: EIP6963ProviderDetail[];
  /** The currently-active provider (preferred OR first with accounts). */
  preferredProvider: EIP6963ProviderDetail | null;
  /**
   * Set the active provider by rdns. Persists to localStorage so subsequent
   * page loads use the same wallet. Pass null to clear and let the hook
   * auto-pick again.
   */
  setPreferredProvider: (rdns: string | null) => void;
  /**
   * Prompt the active provider's account picker via wallet_requestPermissions
   * (falls back to eth_requestAccounts for wallets that don't support
   * permissions). Returns the address picked, or null if cancelled.
   */
  requestAccount: () => Promise<string | null>;
}

interface Eip1193 {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

/**
 * Wallet state + provider selection for the Ambr dashboard. EIP-6963
 * multi-provider aware (handles SafePal + MetaMask + Rabby co-installed).
 *
 * Selection logic on mount:
 *   1. If localStorage has a preferred-provider rdns AND that provider
 *      announced via EIP-6963, use it.
 *   2. Else, iterate all announced providers; pick the FIRST that returns
 *      accounts from `eth_accounts` (silent — no popup).
 *   3. Else, return wallet=null and let the UI prompt the user to pick.
 *
 * The chat header chip + the NFT viewer's "Add to wallet" button both call
 * `requestAccount()` on this hook so the prompt always goes to the user's
 * chosen wallet, not whichever extension hijacked `window.ethereum`.
 */
export function useWalletStatus(): WalletStatus {
  const providers = useWalletProviders();
  const [wallet, setWallet] = useState<string | null>(null);
  const [preferredRdns, setPreferredRdnsState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try { return localStorage.getItem(PREFERRED_RDNS_KEY); } catch { return null; }
  });
  const [nftCount, setNftCount] = useState(0);
  const [pendingActions, setPendingActions] = useState(0);
  const [hasZkIdentity, setHasZkIdentity] = useState(false);
  const [loading, setLoading] = useState(false);
  const lastFetch = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Resolve the preferred provider object from the discovered set. If the
  // preferred rdns isn't (yet) in providers, this returns null and the
  // first-with-accounts auto-pick effect below kicks in.
  const preferredProvider = useMemo<EIP6963ProviderDetail | null>(() => {
    if (!preferredRdns) return null;
    return providers.find((p) => p.info.rdns === preferredRdns) ?? null;
  }, [providers, preferredRdns]);

  const setPreferredProvider = useCallback((rdns: string | null) => {
    try {
      if (rdns) localStorage.setItem(PREFERRED_RDNS_KEY, rdns);
      else localStorage.removeItem(PREFERRED_RDNS_KEY);
    } catch {
      // ignore
    }
    setPreferredRdnsState(rdns);
  }, []);

  // Read initial wallet from localStorage cache for instant first-paint.
  // The provider iteration below will overwrite when accurate live data arrives.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(NFT_WALLET_KEY);
      if (stored) setWallet(stored);
    } catch {
      // ignore
    }
  }, []);

  // Iterate all providers + pick the right wallet to display.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (providers.length === 0) return; // wait for EIP-6963 discovery
    let cancelled = false;

    (async () => {
      // If a preferred provider is set AND announced, use it exclusively.
      // Otherwise scan all providers for the first with authorized accounts.
      const orderedToTry: EIP6963ProviderDetail[] =
        preferredProvider ? [preferredProvider] : providers;

      let foundWallet: string | null = null;
      let foundRdns: string | null = null;

      for (const wp of orderedToTry) {
        try {
          const accounts = (await (wp.provider as unknown as Eip1193).request({
            method: 'eth_accounts',
          })) as string[] | undefined;
          const first = accounts?.[0]?.toLowerCase() ?? null;
          if (first) {
            foundWallet = first;
            foundRdns = wp.info.rdns;
            break;
          }
        } catch {
          // Provider doesn't support eth_accounts or rejected — try next.
        }
      }

      if (cancelled) return;

      if (foundWallet) {
        // Persist the wallet (so subsequent renders before EIP-6963 fires get
        // an accurate cache) and the rdns of the provider it came from (so we
        // remember which wallet "wins" across page loads if no preference set).
        try {
          localStorage.setItem(NFT_WALLET_KEY, foundWallet);
          if (!preferredRdns && foundRdns) {
            localStorage.setItem(PREFERRED_RDNS_KEY, foundRdns);
            setPreferredRdnsState(foundRdns);
          }
        } catch {
          // ignore
        }
        setWallet(foundWallet);
        window.dispatchEvent(new Event(WALLET_CHANGE_EVENT));
      } else if (preferredProvider) {
        // Preferred provider has no authorized accounts (user revoked or
        // hasn't connected yet). Show empty so the UI can prompt.
        setWallet(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [providers, preferredProvider, preferredRdns]);

  // Listen for cross-tab (storage event) and same-tab (custom event) changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onStorage = (e: StorageEvent) => {
      if (e.key === NFT_WALLET_KEY) setWallet(e.newValue);
      if (e.key === PREFERRED_RDNS_KEY) setPreferredRdnsState(e.newValue);
    };

    const onCustom = () => {
      try {
        setWallet(localStorage.getItem(NFT_WALLET_KEY));
      } catch {
        // ignore
      }
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener(WALLET_CHANGE_EVENT, onCustom);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(WALLET_CHANGE_EVENT, onCustom);
    };
  }, []);

  // Subscribe to accountsChanged on the SELECTED provider (not window.ethereum).
  // Re-subscribes when preferredProvider changes. Without this, switching the
  // active wallet (e.g., SafePal → MetaMask via the picker) left a dangling
  // listener on the old extension and missed live switches on the new one.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!preferredProvider) return;
    const eth = preferredProvider.provider as unknown as Eip1193;
    if (!eth.on) return;

    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[] | undefined;
      const next = accounts?.[0]?.toLowerCase() ?? null;
      try {
        if (next) localStorage.setItem(NFT_WALLET_KEY, next);
        else localStorage.removeItem(NFT_WALLET_KEY);
      } catch {
        // ignore
      }
      setWallet(next);
      window.dispatchEvent(new Event(WALLET_CHANGE_EVENT));
    };

    eth.on('accountsChanged', onAccountsChanged);
    return () => {
      eth.removeListener?.('accountsChanged', onAccountsChanged);
    };
  }, [preferredProvider]);

  // Fetch live stats when wallet changes
  useEffect(() => {
    if (!wallet) {
      setNftCount(0);
      setPendingActions(0);
      setHasZkIdentity(false);
      return;
    }

    // Throttle: don't re-fetch within CACHE_TTL
    if (Date.now() - lastFetch.current < CACHE_TTL) return;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    fetch(`/api/v1/dashboard/wallet-status?wallet=${encodeURIComponent(wallet)}`, {
      signal: ac.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || ac.signal.aborted) return;
        setNftCount(data.nft_count ?? 0);
        setPendingActions(data.pending_actions ?? 0);
        setHasZkIdentity(data.has_zk_identity ?? false);
        lastFetch.current = Date.now();
      })
      .catch(() => {
        // Network failure — keep stale data
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, [wallet]);

  const disconnect = useCallback(() => {
    try {
      localStorage.removeItem(NFT_WALLET_KEY);
      localStorage.removeItem(PREFERRED_RDNS_KEY);
      window.dispatchEvent(new Event(WALLET_CHANGE_EVENT));
    } catch {
      // ignore
    }
    setWallet(null);
    setPreferredRdnsState(null);
  }, []);

  const requestAccount = useCallback(async (): Promise<string | null> => {
    if (!preferredProvider) return null;
    const eth = preferredProvider.provider as unknown as Eip1193;
    if (!eth.request) return null;
    try {
      await eth.request({
        method: 'wallet_requestPermissions',
        params: [{ eth_accounts: {} }],
      });
    } catch {
      // Wallet doesn't support permissions or user cancelled — try the older
      // eth_requestAccounts as a fallback (supported by every EIP-1193 wallet).
      try {
        await eth.request({ method: 'eth_requestAccounts' });
      } catch {
        return null;
      }
    }
    try {
      const accounts = (await eth.request({ method: 'eth_accounts' })) as string[] | undefined;
      const next = accounts?.[0]?.toLowerCase() ?? null;
      if (next) {
        try { localStorage.setItem(NFT_WALLET_KEY, next); } catch { /* ignore */ }
        setWallet(next);
        window.dispatchEvent(new Event(WALLET_CHANGE_EVENT));
      }
      return next;
    } catch {
      return null;
    }
  }, [preferredProvider]);

  return {
    wallet,
    nftCount,
    pendingActions,
    hasZkIdentity,
    loading,
    disconnect,
    providers,
    preferredProvider,
    setPreferredProvider,
    requestAccount,
  };
}
