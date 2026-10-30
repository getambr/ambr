'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Wallet, Check } from 'lucide-react';
import { useWalletStatus } from '@/lib/wallet/use-wallet-status';

/**
 * ContractNftViewer — embedded paired-cNFT viewer for Ambr.
 *
 * Why this exists: external wallets (especially SafePal) don't reliably display
 * Base L2 ERC-721s in their NFT tab. Users complete bilateral signing, get
 * paired cNFTs on-chain, and then can't see them in their wallet. Ambr should
 * provide its own primary viewing surface — no wallet dependency, no chain
 * indexer lag.
 *
 * Renders inline on the reader portal AND the dashboard contract-detail page.
 * Reads the metadata JSON we already serve at /api/v1/nft/by-hash/[hash]/metadata
 * and the SVG image at /api/v1/nft/image/[hash], so this is purely a presentation
 * layer over existing infrastructure.
 *
 * Visual design (post-redesign 2026-05-19):
 * - Outer container: amber-bordered section card to set off the whole "Paired
 *   cNFTs" group from the rest of the page.
 * - Inner cards: minimal chrome — small header bar, image fills naturally, then
 *   a tight metadata strip with Lucide icons. No double-border, no aspect-square
 *   forcing empty space.
 * - All external link buttons use Lucide ExternalLink per Ambr brand guidelines
 *   (no Unicode arrows or emoji-as-icons).
 */

// Public on Base mainnet — visible on BaseScan to anyone. Safe to inline as
// a fallback so the component still renders if NEXT_PUBLIC_CNFT_CONTRACT_ADDRESS
// isn't configured for a given Vercel environment.
const CNFT_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CNFT_CONTRACT_ADDRESS
  ?? '0x20cEE8DdeB9b700dA6f9E00cD6A430Fb351DB250';

interface ContractNftViewerProps {
  sha256Hash: string;
  mintStatus: string | null;
  tokenId: number | null;
  counterpartyTokenId: number | null;
  holderWallet: string | null;
  counterpartyWallet: string | null;
  txHash: string | null;
  counterpartyTxHash: string | null;
  /** Display name of the principal party (consumer for A1, buyer for C1,
   *  principal_name for D1). Null falls back to "Principal" generic label. */
  principalName?: string | null;
  /** Display name of the counterparty (provider for A1, seller for C1).
   *  D1 contracts have no second party name so this is typically null. */
  counterpartyName?: string | null;
  /** True for P2/one-sided contracts — suppresses the empty counterparty
   *  card and relabels the principal card as "Authorization cNFT". */
  isOneSided?: boolean;
}

interface NftMetadata {
  name?: string;
  description?: string;
  image?: string;
  attributes?: Array<{ trait_type: string; value: string }>;
}

function shortWallet(addr: string | null): string {
  if (!addr) return '—';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function shortTx(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

// External viewer links — centralized so future URL-shape changes are one
// place. The cNFT exists on Base mainnet at chain ID 8453.
function externalLinks(wallet: string | null, tokenId: number | null) {
  return {
    basescanToken:
      tokenId != null
        ? `https://basescan.org/token/${CNFT_CONTRACT_ADDRESS}?a=${tokenId}`
        : null,
    opensea: wallet ? `https://opensea.io/${wallet}?chain=base` : null,
    zerion: wallet ? `https://app.zerion.io/${wallet}/nfts?chain=base` : null,
  };
}

export default function ContractNftViewer({
  sha256Hash,
  mintStatus,
  tokenId,
  counterpartyTokenId,
  holderWallet,
  counterpartyWallet,
  txHash,
  counterpartyTxHash,
  principalName,
  counterpartyName,
  isOneSided = false,
}: ContractNftViewerProps) {
  const [metadata, setMetadata] = useState<NftMetadata | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  // Viewer's currently-connected wallet — drives the "Yours" badge so users
  // know at a glance which card holds the cNFT in THEIR wallet.
  // Pulled from useWalletStatus which is now EIP-6963 multi-provider aware,
  // so MetaMask/SafePal/Rabby co-installed users get the right wallet here.
  const { wallet: viewerWallet, preferredProvider } = useWalletStatus();
  const viewerLower = viewerWallet?.toLowerCase() ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!sha256Hash || mintStatus !== 'minted') return;
    fetch(`/api/v1/nft/by-hash/${sha256Hash}/metadata`, {
      headers: { Accept: 'application/json' },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data) setMetadata(data);
        else setMetaError('Metadata unavailable');
      })
      .catch(() => {
        if (!cancelled) setMetaError('Network error fetching metadata');
      });
    return () => {
      cancelled = true;
    };
  }, [sha256Hash, mintStatus]);

  if (!mintStatus) return null;

  // The SVG image route is public and cacheable — load directly as <img src=>
  // rather than waiting on metadata for the image URL.
  //
  // Versioned URL — bump SVG_VERSION whenever the SVG generator visual design
  // changes so browser caches don't serve the old version. v=2 marks the
  // 2026-05-19 brand-token redesign (commit 919d15f) that flattened the SVG,
  // switched to warm brand amber #c6a87c, and adopted the Georgia wordmark.
  // v=3 (same session) is the role-aware split: principal vs counterparty
  // SVGs now show their own role label + party name + token ID, fixing the
  // bug where both paired cNFTs displayed the principal's identity.
  const SVG_VERSION = 3;
  const principalImageSrc = `/api/v1/nft/image/${sha256Hash}?v=${SVG_VERSION}&role=principal`;
  const counterpartyImageSrc = `/api/v1/nft/image/${sha256Hash}?v=${SVG_VERSION}&role=counterparty`;

  if (mintStatus === 'pending') {
    return (
      <div className="rounded-xl border border-border bg-surface/80 p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber/30 to-transparent" />
        <p className="text-micro">Paired cNFTs</p>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-2 w-2 animate-pulse rounded-full bg-amber" />
          <p className="text-sm text-text-secondary">
            Minting paired cNFTs on Base mainnet — typically 30–60 seconds. Refresh in a moment.
          </p>
        </div>
      </div>
    );
  }

  if (mintStatus === 'failed') {
    return (
      <div className="rounded-xl border border-error/30 bg-surface/80 p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-error/40 to-transparent" />
        <p className="text-micro" style={{ color: 'var(--color-error)' }}>Paired cNFTs</p>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-error" />
          <p className="text-sm text-error">
            Mint attempt failed. Contact support — reference this contract for retry.
          </p>
        </div>
      </div>
    );
  }

  // mintStatus === 'minted'
  return (
    <div className="rounded-xl border border-border bg-surface/80 p-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber/30 to-transparent" />
      <div className="flex items-center justify-between mb-4">
        <p className="text-micro">Paired cNFTs</p>
        <span className="text-[11px] font-mono text-text-secondary/60">Base mainnet · ERC-721</span>
      </div>

      {metaError && (
        <p className="mb-2 text-[11px] text-text-secondary/60">
          (Metadata fetch failed: {metaError} — image + tx data below still valid.)
        </p>
      )}

      <div className={`grid gap-3 ${isOneSided ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
        <NftCard
          label={isOneSided ? 'Authorization cNFT' : 'Principal cNFT'}
          role="Principal"
          partyName={principalName ?? null}
          tokenId={tokenId}
          wallet={holderWallet}
          txHash={txHash}
          imageSrc={principalImageSrc}
          metadataName={metadata?.name}
          isYours={!!(viewerLower && holderWallet?.toLowerCase() === viewerLower)}
          preferredProvider={preferredProvider}
        />
        {isOneSided ? (
          <p className="text-[11px] text-text-secondary/60 leading-relaxed">
            Unilateral authorization — the agent wallet receives no cNFT. Authority flows from your signature alone.
          </p>
        ) : (
          <NftCard
            label="Counterparty cNFT"
            role="Counterparty"
            partyName={counterpartyName ?? null}
            tokenId={counterpartyTokenId}
            wallet={counterpartyWallet}
            txHash={counterpartyTxHash}
            imageSrc={counterpartyImageSrc}
            metadataName={metadata?.name}
            isYours={!!(viewerLower && counterpartyWallet?.toLowerCase() === viewerLower)}
            preferredProvider={preferredProvider}
          />
        )}
      </div>

      <p className="mt-4 text-[11px] text-text-secondary/70 leading-relaxed">
        Twin paired cNFTs anchored to the same contract hash. If your wallet
        doesn&apos;t display them (Base L2 support is patchy), use the links above
        to verify on-chain.
      </p>
    </div>
  );
}

function NftCard({
  label,
  role,
  partyName,
  tokenId,
  wallet,
  txHash,
  imageSrc,
  metadataName,
  isYours,
  preferredProvider,
}: {
  label: string;
  role: 'Principal' | 'Counterparty';
  partyName: string | null;
  tokenId: number | null;
  wallet: string | null;
  txHash: string | null;
  imageSrc: string;
  metadataName?: string;
  isYours: boolean;
  preferredProvider: import('@/lib/wallet/providers').EIP6963ProviderDetail | null;
}) {
  const links = externalLinks(wallet, tokenId);

  // Paired mint can fail independently. Show a soft "not minted" state for
  // this side rather than collapsing the card entirely.
  if (tokenId == null || !wallet) {
    return (
      <div className="rounded-lg overflow-hidden border border-border bg-background">
        <div className="px-4 py-2.5 border-b border-border bg-surface/60 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-text-secondary font-medium">
            {label}
          </span>
          <span className="text-[11px] font-mono text-text-secondary/60">—</span>
        </div>
        <div className="p-6">
          <p className="text-xs text-text-secondary">Not minted (single-party contract).</p>
        </div>
      </div>
    );
  }

  // "Yours" cards get a brighter border + success ring so the viewer can
  // instantly tell which paired cNFT is in their connected wallet. Uses the
  // brand --color-success token (not raw Tailwind emerald) for consistency
  // with the rest of the dashboard's confirm/positive states.
  const cardBorder = isYours
    ? 'border-success/40 ring-1 ring-success/20'
    : 'border-border';

  return (
    <div className={`rounded-lg overflow-hidden border bg-background ${cardBorder} transition-colors`}>
      {/* Subtle header strip — sets card identity without competing with SVG.
          Includes a "Yours" badge when this card's holder matches the
          viewer's currently-connected wallet. */}
      <div className="px-4 py-2.5 border-b border-border bg-surface/60 flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wider text-amber font-medium">
          {label}
        </span>
        <div className="flex items-center gap-2">
          {isYours && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 border border-success/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-success font-medium">
              <Check className="w-2.5 h-2.5" aria-hidden /> Yours
            </span>
          )}
          <span className="text-[11px] font-mono text-text-secondary/60">Token #{tokenId}</span>
        </div>
      </div>

      {/* SVG image — constrained max-height to keep cards compact even when
          the SVG asset is portrait-aspect. object-contain centers it within
          the bounded area; bg matches the new flat SVG background so any
          letterboxing blends seamlessly. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageSrc}
        alt={metadataName ?? `Ambr cNFT token #${tokenId}`}
        className="w-full max-h-56 object-contain block bg-background"
        loading="lazy"
      />

      {/* Tight metadata + actions strip — separates the LEGAL party (named
          in the contract) from the CRYPTOGRAPHIC signer (the wallet that
          actually owns the cNFT on-chain). These can differ when an agent
          signs on behalf of a principal, so labeling them distinctly avoids
          the confusion of "Held by <name>" displayed next to a wallet that
          isn't theirs. */}
      <div className="px-4 py-3 border-t border-border bg-surface/40 space-y-2">
        {/* Legal party — role + named party from contract parameters */}
        {partyName && (
          <div className="flex items-baseline gap-1.5 text-xs">
            <span className="text-text-secondary shrink-0 uppercase tracking-wider text-[10px]">{role}:</span>
            <span className="text-text-primary font-medium truncate">{partyName}</span>
          </div>
        )}
        {/* Signing wallet — who actually owns the cNFT on-chain. The "Yours"
            badge in the header is also driven by this wallet matching the
            viewer's connected one. */}
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="text-text-secondary shrink-0">Signed by</span>
          <Wallet className="w-3 h-3 text-text-secondary shrink-0" aria-hidden />
          <span className="font-mono text-text-primary">{shortWallet(wallet)}</span>
        </div>
        {txHash && (
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-text-secondary shrink-0">tx</span>
            <a
              href={`https://basescan.org/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-amber hover:underline truncate"
            >
              {shortTx(txHash)}
            </a>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 pt-1">
          {links.basescanToken && (
            <ViewerLink href={links.basescanToken} variant="primary">
              BaseScan
            </ViewerLink>
          )}
          {links.opensea && (
            <ViewerLink href={links.opensea} variant="secondary">
              OpenSea
            </ViewerLink>
          )}
          {links.zerion && (
            <ViewerLink href={links.zerion} variant="secondary">
              Zerion
            </ViewerLink>
          )}
          <ImportToWalletButton
            wallet={wallet}
            tokenId={tokenId}
            isYours={isYours}
            preferredProvider={preferredProvider}
          />
        </div>
        {!isYours && wallet && (
          <p className="pt-1 text-[10px] leading-tight text-text-secondary/70">
            To import this NFT, switch MetaMask to wallet{' '}
            <span className="font-mono text-text-primary">{shortWallet(wallet)}</span>{' '}
            first — your current account doesn&apos;t own it.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Adds the cNFT to the user's connected wallet via the EIP-747
 * `wallet_watchAsset` RPC. Shows a graceful fallback (copy contract + token ID
 * to clipboard) when the wallet doesn't support the asset prompt OR when the
 * current account isn't the owner. Phase C of the 2026-05-25 wallet model
 * work — addresses the recurring "which wallet, which token?" confusion.
 */
function ImportToWalletButton({
  wallet, tokenId, isYours, preferredProvider,
}: {
  wallet: string | null;
  tokenId: number | null;
  isYours: boolean;
  preferredProvider: import('@/lib/wallet/providers').EIP6963ProviderDetail | null;
}) {
  const [copied, setCopied] = useState(false);

  if (tokenId == null || !wallet) return null;

  const copyImportDetails = () => {
    const text = `Contract: ${CNFT_CONTRACT_ADDRESS}\nToken ID: ${tokenId}\nNetwork: Base (chain 8453)\nOwner wallet: ${wallet}`;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => { /* clipboard blocked — silent */ });
  };

  const importViaWallet = async () => {
    // Use the user's preferred EIP-6963 provider, NOT window.ethereum.
    // window.ethereum is whichever extension hijacked the global (often the
    // wrong one when multiple wallets are installed). preferredProvider is
    // what the user explicitly picked in the chat header chip's wallet picker.
    const eth = preferredProvider?.provider as unknown as
      | { request?: (args: { method: string; params: unknown }) => Promise<unknown> }
      | undefined;
    if (!eth?.request) {
      copyImportDetails();
      return;
    }
    try {
      await eth.request({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC721',
          options: {
            address: CNFT_CONTRACT_ADDRESS,
            tokenId: String(tokenId),
          },
        },
      });
    } catch {
      // User rejected or wallet errored (most likely: account mismatch).
      // Fall back to copy-to-clipboard so the user has the info to do it
      // manually after switching accounts.
      copyImportDetails();
    }
  };

  // When the cNFT IS in the viewer's connected wallet, the import button
  // prompts MetaMask directly (one-click add). When NOT, the button copies
  // the import details — the user needs to switch wallets first anyway, and
  // the wallet_watchAsset prompt would just fail.
  const label = copied ? 'Copied ✓' : (isYours ? 'Add to wallet' : 'Copy import details');
  return (
    <button
      type="button"
      onClick={isYours ? importViaWallet : copyImportDetails}
      className="inline-flex items-center gap-1 rounded-md border border-amber/30 bg-amber/10 px-2.5 py-1 text-[11px] font-medium text-amber hover:bg-amber/20 transition-colors"
    >
      {label}
    </button>
  );
}

function ViewerLink({
  href,
  variant,
  children,
}: {
  href: string;
  variant: 'primary' | 'secondary';
  children: React.ReactNode;
}) {
  const cls =
    variant === 'primary'
      ? 'inline-flex items-center gap-1 rounded-md border border-amber/30 bg-amber/10 px-2.5 py-1 text-[11px] font-medium text-amber hover:bg-amber/20 transition-colors'
      : 'inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-text-primary hover:bg-surface-elevated transition-colors';
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      <span>{children}</span>
      <ExternalLink className="w-3 h-3" aria-hidden />
    </a>
  );
}
