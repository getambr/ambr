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
