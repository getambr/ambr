'use client';

import { useEffect, useState } from 'react';
import { useWalletStatus } from '@/lib/wallet/use-wallet-status';
import { LogOut } from 'lucide-react';

/**
 * Persistent wallet status bar — sits above the navigation on platform pages.
 * Self-hides when no wallet is connected or on the marketing domain.
 * Height: 32px (h-8). Sets CSS custom property for nav offset.
 */
export default function WalletStatusBar() {
  const { wallet, nftCount, pendingActions, hasZkIdentity, disconnect } = useWalletStatus();
  const [isMarketing, setIsMarketing] = useState(false);
  const [demosExpanded, setDemosExpanded] = useState(false);

  // Detect marketing domain — hide bar there
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsMarketing(window.location.hostname.includes('ambr.run'));
  }, []);

  // Set CSS custom property for nav offset
  useEffect(() => {
    const visible = !!wallet && !isMarketing;
    document.documentElement.style.setProperty(
      '--wallet-bar-offset',
      visible ? '32px' : '0px',
    );
    return () => {
      document.documentElement.style.setProperty('--wallet-bar-offset', '0px');
    };
  }, [wallet, isMarketing]);

  if (!wallet || isMarketing) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[55] h-8 bg-surface border-b border-border/50 font-mono text-[11px]"
      role="status"
      aria-label="Wallet status"
    >
      <div className="mx-auto max-w-7xl h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Left section */}
        <div className="flex items-center gap-2.5">
          {/* AMBR mark */}
          <span className="text-amber font-semibold tracking-[0.05em] text-[10px]">
            AMBR
          </span>

          <Divider />

          {/* Wallet address + green dot */}
          <div className="flex items-center gap-1.5">
            <span
              className="w-[6px] h-[6px] rounded-full bg-emerald-500 shrink-0"
              style={{ boxShadow: '0 0 4px rgba(52,211,153,0.5)' }}
            />
            <span className="text-text-secondary">
              {wallet.slice(0, 6)}...{wallet.slice(-4)}
            </span>

            {/* Demos ZK badge — compact by default, expands on hover */}
            {hasZkIdentity && (
              <button
                type="button"
                className="inline-flex items-center gap-1 px-1.5 py-px border border-amber/25 rounded bg-amber/[0.06] text-[9px] text-amber overflow-hidden transition-all duration-200 cursor-default"
                style={{ maxWidth: demosExpanded ? '140px' : '32px' }}
                onMouseEnter={() => setDemosExpanded(true)}
                onMouseLeave={() => setDemosExpanded(false)}
                tabIndex={-1}
              >
                <img
                  src="/demos-logo.svg"
                  alt=""
                  className="w-2 h-2 opacity-70 shrink-0"
                />
                <span className={`whitespace-nowrap transition-opacity duration-200 ${demosExpanded ? 'opacity-100' : 'opacity-0 w-0'}`}>
                  Demos ZK verified
                </span>
                {!demosExpanded && <span>ZK</span>}
              </button>
            )}
          </div>

          <Divider />

          {/* Chain */}
          <span className="text-emerald-500 text-[10px] hidden sm:inline">Base L2</span>
        </div>

        {/* Right section */}
        <div className="flex items-center gap-2.5">
          {/* NFT count */}
          <span className="text-text-secondary hidden sm:inline">
            <span className="text-text-primary">{nftCount}</span> NFTs
          </span>

          {/* Pending actions */}
          {pendingActions > 0 && (
            <>
              <Divider />
              <span className="text-amber flex items-center gap-1">
                <span
                  className="w-[5px] h-[5px] rounded-full bg-amber animate-pulse shrink-0"
                />
                {pendingActions} pending
              </span>
            </>
          )}

          <Divider />

          {/* Disconnect */}
          <button
            onClick={disconnect}
            className="text-text-secondary hover:text-text-primary transition-colors cursor-pointer p-0.5"
            title="Disconnect wallet"
            aria-label="Disconnect wallet"
          >
            <LogOut className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Divider() {
  return <span className="w-px h-3.5 bg-border/60 shrink-0 hidden sm:inline-block" />;
}
