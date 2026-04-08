'use client';

import type { EIP6963ProviderDetail } from '@/lib/wallet/providers';

interface WalletPickerProps {
  providers: EIP6963ProviderDetail[];
  onPick: (provider: EIP6963ProviderDetail) => void;
  connecting?: boolean;
  /**
   * Variant controls styling. "amber" matches the dashboard amber accent,
   * "reader" matches the reader portal's wallet-access panel style.
   */
  variant?: 'amber' | 'reader';
}

export default function WalletPicker({ providers, onPick, connecting, variant = 'amber' }: WalletPickerProps) {
  // Empty state — no wallet extension detected
  if (providers.length === 0) {
    return (
      <div className="space-y-2 text-xs text-text-secondary">
        <p className="text-red-400 font-medium">No Ethereum wallet detected.</p>
        <p>
          Install MetaMask, Rabby, Rainbow, Coinbase Wallet, or SafePal (with an EVM profile
          active, not Fiat24 or BTC-only). Brave users can enable the built-in wallet at{' '}
          <code className="rounded bg-surface px-1 py-0.5 text-[11px]">brave://wallet</code>.
        </p>
        <p className="text-text-secondary/70">
          Note: Demos is a ZK identity layer used in the Reader portal — it is not an
          Ethereum wallet.
        </p>
      </div>
    );
  }

  // Single provider — one-click connect
  if (providers.length === 1) {
    const p = providers[0];
    const className =
      variant === 'amber'
        ? 'flex items-center gap-2 rounded-lg border border-amber/30 bg-amber/10 px-4 py-2.5 text-sm font-medium text-amber hover:bg-amber/20 disabled:opacity-50 transition-colors'
        : 'flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:opacity-50';
    return (
      <button onClick={() => onPick(p)} disabled={connecting} className={className}>
        {p.info.icon && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.info.icon} alt="" className="h-5 w-5" />
        )}
        <span>
          {connecting
            ? 'Connecting...'
            : p.info.rdns === 'legacy'
              ? 'Connect Wallet'
              : `Connect with ${p.info.name}`}
        </span>
      </button>
    );
  }

  // Multiple providers — picker list
  const itemClassName =
    variant === 'amber'
      ? 'flex w-full items-center gap-3 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text-primary hover:bg-amber/10 hover:border-amber/30 disabled:opacity-50 transition-colors'
      : 'flex w-full items-center gap-3 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text-primary hover:bg-amber-600/10 hover:border-amber-600/30 disabled:opacity-50 transition-colors';

  return (
    <div className="space-y-2">
      <p className="text-xs text-text-secondary mb-2">Choose a wallet:</p>
      {providers.map((p) => (
        <button key={p.info.uuid} onClick={() => onPick(p)} disabled={connecting} className={itemClassName}>
          {p.info.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.info.icon} alt="" className="h-5 w-5" />
          ) : (
            <div className="h-5 w-5 rounded bg-amber/20" />
          )}
          <span className="flex-1 text-left">{p.info.name}</span>
          {connecting && <span className="text-xs text-text-secondary">...</span>}
        </button>
      ))}
    </div>
  );
}
