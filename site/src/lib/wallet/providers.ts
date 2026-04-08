'use client';

import { useEffect, useState } from 'react';
import type { Eip1193Provider } from 'ethers';

/**
 * EIP-6963 Multi Injected Provider Discovery
 * https://eips.ethereum.org/EIPS/eip-6963
 *
 * Modern wallets (SafePal, Rabby, Rainbow, current MetaMask, Coinbase Wallet,
 * Brave Wallet, Trust Wallet, etc.) announce themselves via `eip6963:announceProvider`
 * events instead of fighting for `window.ethereum`. This hook discovers them and
 * falls back to `window.ethereum` for legacy wallets.
 */

export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: Eip1193Provider;
}

interface EIP6963AnnounceEvent extends CustomEvent {
  detail: EIP6963ProviderDetail;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
  interface WindowEventMap {
    'eip6963:announceProvider': EIP6963AnnounceEvent;
  }
}

/**
 * Discover injected Ethereum wallet providers. Returns a deduplicated list
 * via EIP-6963 (modern) with a `window.ethereum` fallback (legacy).
 *
 * Empty array means no wallet extension is installed or active. Wallet chain
 * is not checked here — chain switching is the caller's responsibility if
 * needed, but Ambr's dashboard flow works with any EVM chain since it only
 * does getAddress + signMessage (both chain-agnostic).
 */
export function useWalletProviders(): EIP6963ProviderDetail[] {
  const [providers, setProviders] = useState<EIP6963ProviderDetail[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const discovered = new Map<string, EIP6963ProviderDetail>();

    const onAnnounce = (event: Event) => {
      const detail = (event as EIP6963AnnounceEvent).detail;
      if (!detail?.info?.uuid || !detail?.provider) return;
      const key = detail.info.rdns || detail.info.uuid;
      discovered.set(key, detail);
      setProviders(Array.from(discovered.values()));
    };

    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    // Fallback: if no EIP-6963 providers announced within 400ms AND window.ethereum
    // is set, add it as a legacy provider. This covers older wallets that only
    // use the legacy injection pattern.
    const fallbackTimer = setTimeout(() => {
      if (discovered.size === 0 && window.ethereum) {
        discovered.set('legacy:window.ethereum', {
          info: {
            uuid: 'legacy-window-ethereum',
            name: 'Browser Wallet',
            icon: '',
            rdns: 'legacy',
          },
          provider: window.ethereum,
        });
        setProviders(Array.from(discovered.values()));
      }
    }, 400);

    return () => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce);
      clearTimeout(fallbackTimer);
    };
  }, []);

  return providers;
}
