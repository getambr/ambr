'use client';

interface NftStatusProps {
  mintStatus: string | null;
  tokenId: number | null;
  txHash: string | null;
  holderWallet: string | null;
  counterpartyWallet: string | null;
}

export default function NftStatus({
  mintStatus,
  tokenId,
  txHash,
  holderWallet,
  counterpartyWallet,
}: NftStatusProps) {
  if (!mintStatus) return null;

  return (
    <div className="rounded-xl border border-amber-600/20 bg-stone-900/50 p-6">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-500">
        Contract NFT
      </h3>

      <div className="mt-3 space-y-2">
        {mintStatus === 'pending' && (
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
            <p className="text-sm text-stone-400">NFT minting in progress...</p>
          </div>
        )}

        {mintStatus === 'minted' && (
          <>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <p className="text-sm text-emerald-400">Minted</p>
              {tokenId != null && (
                <span className="text-xs text-stone-500">Token #{tokenId}</span>
              )}
            </div>

            {txHash && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-stone-500">Tx:</span>
                <a
                  href={`https://basescan.org/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-amber-400 hover:underline"
                >
                  {txHash.slice(0, 10)}...{txHash.slice(-8)}
                </a>
              </div>
            )}

            {txHash && (
              <a
                href={`https://basescan.org/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/20"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                Verify on Basescan
              </a>
            )}

            {holderWallet && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-stone-500">Holder:</span>
                <span className="font-mono text-stone-300">
                  {holderWallet.slice(0, 6)}...{holderWallet.slice(-4)}
                </span>
              </div>
            )}

            {counterpartyWallet && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-stone-500">Counterparty:</span>
                <span className="font-mono text-stone-300">
                  {counterpartyWallet.slice(0, 6)}...{counterpartyWallet.slice(-4)}
                </span>
              </div>
            )}
          </>
        )}

        {mintStatus === 'failed' && (
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-red-500" />
            <p className="text-sm text-red-400">NFT minting failed. Contact support.</p>
          </div>
        )}
      </div>
    </div>
  );
}
