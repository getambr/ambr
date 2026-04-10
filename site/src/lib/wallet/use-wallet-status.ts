'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/** Custom event name for same-tab wallet changes */
export const WALLET_CHANGE_EVENT = 'ambr-wallet-change';

const NFT_WALLET_KEY = 'ambr_nft_wallet';
const CACHE_TTL = 60_000; // 1 minute

interface WalletStatus {
  wallet: string | null;
  nftCount: number;
  pendingActions: number;
  hasZkIdentity: boolean;
  loading: boolean;
  disconnect: () => void;
}

export function useWalletStatus(): WalletStatus {
  const [wallet, setWallet] = useState<string | null>(null);
  const [nftCount, setNftCount] = useState(0);
  const [pendingActions, setPendingActions] = useState(0);
  const [hasZkIdentity, setHasZkIdentity] = useState(false);
  const [loading, setLoading] = useState(false);
  const lastFetch = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Read wallet from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(NFT_WALLET_KEY);
      setWallet(stored);
    } catch {
      // localStorage unavailable
    }
  }, []);

  // Listen for cross-tab (storage event) and same-tab (custom event) changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onStorage = (e: StorageEvent) => {
      if (e.key === NFT_WALLET_KEY) {
        setWallet(e.newValue);
      }
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
      window.dispatchEvent(new Event(WALLET_CHANGE_EVENT));
    } catch {
      // ignore
    }
    setWallet(null);
  }, []);

  return { wallet, nftCount, pendingActions, hasZkIdentity, loading, disconnect };
}
