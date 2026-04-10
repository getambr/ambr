'use client';

import { useState, useEffect, useRef } from 'react';
import { BrowserProvider } from 'ethers';
import { useWalletProviders, type EIP6963ProviderDetail } from '@/lib/wallet/providers';
import WalletPicker from '@/components/wallet/WalletPicker';

type AuthState = 'idle' | 'detected' | 'connecting' | 'verifying' | 'authorized' | 'unauthorized' | 'error';

interface WalletConnectProps {
  contractId: string;
  contractUuid: string;
  onAuthorized: (data: {
    contract: Record<string, unknown>;
    signatures: { signer_wallet: string; signed_at: string }[];
    handshakes: { wallet_address: string; intent: string; message?: string; visibility_preference?: string; created_at: string }[];
  }) => void;
}

export default function WalletConnect({ contractId, contractUuid, onAuthorized }: WalletConnectProps) {
  const [state, setState] = useState<AuthState>('idle');
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [detectedProvider, setDetectedProvider] = useState<EIP6963ProviderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const walletProviders = useWalletProviders();
  const autoDetectRan = useRef(false);

  // Auto-detect already-connected wallet on mount (passive, no popup)
  useEffect(() => {
    if (autoDetectRan.current || state !== 'idle') return;
    autoDetectRan.current = true;

    async function detect() {
      for (const wp of walletProviders) {
        try {
          // eth_accounts is passive — returns connected accounts without prompting
          const accounts = await wp.provider.request({ method: 'eth_accounts' }) as string[];
          if (accounts?.length > 0) {
            setWalletAddress(accounts[0]);
            setDetectedProvider(wp);
            setState('detected');
            return;
          }
        } catch {
          // Provider doesn't support eth_accounts or not connected — skip
        }
      }
    }

    if (walletProviders.length > 0) detect();
  }, [walletProviders, state]);

  const connect = async (picked: EIP6963ProviderDetail) => {
    setState('connecting');
    setError(null);

    try {
      const provider = new BrowserProvider(picked.provider);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      setWalletAddress(address);

      setState('verifying');

      const timestamp = new Date().toISOString();
      const message = [
        `Ambr wallet verification for contract ${contractId}`,
        '',
        `Timestamp: ${timestamp}`,
      ].join('\n');

      const signature = await signer.signMessage(message);

      const res = await fetch(`/api/v1/contracts/${contractUuid}/wallet-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: address,
          signature,
          message,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403) {
          setState('unauthorized');
          return;
        }
        throw new Error(data.message || 'Verification failed');
      }

      setState('authorized');
      onAuthorized(data);
    } catch (err) {
      if ((err as Error).message?.includes('user rejected')) {
        setState('idle');
        return;
      }
      setError(err instanceof Error ? err.message : 'Connection failed');
      setState('error');
    }
  };

  const disconnect = () => {
    setState('idle');
    setWalletAddress(null);
    setError(null);
  };

  if (state === 'authorized') {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
        <div className="h-2 w-2 rounded-full bg-emerald-500" />
        <span className="font-mono text-xs text-emerald-300">
          {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
        </span>
        <span className="text-xs text-emerald-400">Verified</span>
        <button
          onClick={disconnect}
          className="ml-auto text-xs text-stone-500 hover:text-stone-400"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
        </svg>
        <h2 className="text-lg font-semibold text-text-primary">Wallet Access</h2>
      </div>

      {state === 'detected' && walletAddress && detectedProvider && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="font-mono text-xs text-text-primary">
              {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
            </span>
            <span className="text-xs text-text-secondary">detected</span>
          </div>
          <p className="text-sm text-text-secondary">
            Wallet already connected. Verify access to unlock the contract.
          </p>
          <button
            onClick={() => connect(detectedProvider)}
            className="rounded-lg bg-amber/15 px-4 py-2.5 text-sm font-medium text-amber hover:bg-amber/25 transition-colors"
          >
            Verify Access
          </button>
          <button
            onClick={() => { setState('idle'); setDetectedProvider(null); setWalletAddress(null); }}
            className="ml-3 text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            Use a different wallet
          </button>
        </div>
      )}

      {state === 'idle' && (
        <>
          <p className="text-sm text-text-secondary mb-4">
            Connect your Ethereum wallet to verify access. If your wallet is associated with this contract, the full text will be unlocked.
          </p>
          <WalletPicker providers={walletProviders} onPick={connect} variant="reader" />
        </>
      )}

      {state === 'connecting' && (
        <p className="text-sm text-stone-400">Connecting wallet...</p>
      )}

      {state === 'verifying' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="font-mono text-xs text-stone-300">
              {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
            </span>
          </div>
          <p className="text-sm text-stone-400">Sign the verification message in your wallet...</p>
        </div>
      )}

      {state === 'unauthorized' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-stone-500" />
            <span className="font-mono text-xs text-stone-300">
              {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
            </span>
          </div>
          <p className="text-sm text-stone-400">
            This wallet is not associated with this contract. You need a share link from one of the contract parties, or handshake/sign with this wallet first.
          </p>
          <button
            onClick={disconnect}
            className="text-xs text-stone-500 underline hover:text-stone-400"
          >
            Try a different wallet
          </button>
        </div>
      )}

      {state === 'error' && (
        <div className="space-y-2">
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={disconnect}
            className="text-xs text-stone-500 underline hover:text-stone-400"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
