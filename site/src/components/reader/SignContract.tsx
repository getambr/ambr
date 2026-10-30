'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { BrowserProvider } from 'ethers';
import ZKIdentityBadge from './ZKIdentityBadge';
import type { IdentityAttestationPayload } from '@/lib/zk/types';
import { useWalletProviders, type EIP6963ProviderDetail } from '@/lib/wallet/providers';
import { validateSigner } from '@/lib/wallet/validate-signer';
import { sanitizeWalletError, isUserRejection } from '@/lib/wallet/error-messages';
import { serverErrorMessage } from '@/lib/wallet/server-error';
import WalletPicker from '@/components/wallet/WalletPicker';

const ZKIdentityVerify = dynamic(() => import('./ZKIdentityVerify'), { ssr: false });

type SignState = 'idle' | 'connecting' | 'connected' | 'signing' | 'submitting' | 'success' | 'error';

interface Signature {
  signer_wallet: string;
  signed_at: string;
  signer_identity?: Record<string, unknown> | null;
}

interface SignContractProps {
  contractId: string;
  contractUuid: string;
  sha256Hash: string;
  status: string;
  existingSignatures: Signature[];
  requireZkIdentity?: boolean;
  /** The reader page's ?token=. The sign route needs it to fill an open counterparty slot. */
  shareToken?: string;
}

// The dashboard session ({ method, apiKey, wallet, ts }, 24h TTL, see the
// dashboard page). Its key lets the creator fill an open principal slot; the
// sign route ignores it for everyone else.
function sessionApiKey(): string | null {
  try {
    const raw = localStorage.getItem('ambr_dashboard_session');
    if (!raw) return null;
    const s = JSON.parse(raw) as { apiKey?: unknown; ts?: unknown };
    if (typeof s.ts !== 'number' || Date.now() - s.ts > 86_400_000) return null;
    return typeof s.apiKey === 'string' && s.apiKey ? s.apiKey : null;
  } catch {
    return null;
  }
}

export default function SignContract({
  contractId,
  contractUuid,
  sha256Hash,
  status,
  existingSignatures,
  requireZkIdentity,
  shareToken,
}: SignContractProps) {
  const [state, setState] = useState<SignState>('idle');
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    status: string;
    nft_mint_status?: string;
    zk_identity?: { verified: boolean; provider: string };
  } | null>(null);
  const [identityAttestation, setIdentityAttestation] = useState<IdentityAttestationPayload | null>(null);
  const [pickedProvider, setPickedProvider] = useState<EIP6963ProviderDetail | null>(null);
  // Optional email — used to send the signer an "activation" notification
  // once both sides have signed. Stored on contracts.counterparty_email if
  // this signer isn't the original sender.
  const [signerEmail, setSignerEmail] = useState<string>('');
  const walletProviders = useWalletProviders();

  const canSign = ['draft', 'handshake', 'pending_signature'].includes(status);
  const alreadySigned = useCallback(
    (addr: string) =>
      existingSignatures.some((s) => s.signer_wallet === addr.toLowerCase()),
    [existingSignatures],
  );

  const connectWallet = async (picked: EIP6963ProviderDetail) => {
    setState('connecting');
    setError(null);
    setPickedProvider(picked);

    try {
      const provider = new BrowserProvider(picked.provider);
      const signer = await validateSigner(provider);
      const address = await signer.getAddress();
      setWalletAddress(address);

      if (alreadySigned(address)) {
        setError('This wallet has already signed this contract.');
        setState('error');
        return;
      }

      setState('connected');
    } catch (err) {
      if (isUserRejection(err)) { setState('idle'); return; }
      setError(sanitizeWalletError(err));
      setState('error');
    }
  };

  const signContract = async () => {
    if (!walletAddress || !pickedProvider) return;

    setState('signing');
    setError(null);

    try {
      const provider = new BrowserProvider(pickedProvider.provider);
      const signer = await validateSigner(provider);
      const timestamp = new Date().toISOString();

      const message = [
        `I am signing Ambr contract ${contractId}`,
        '',
        `Contract SHA-256: ${sha256Hash}`,
        '',
        `Timestamp: ${timestamp}`,
      ].join('\n');

      const signature = await signer.signMessage(message);

      setState('submitting');

      const trimmedEmail = signerEmail.trim();
      const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail) ? trimmedEmail : undefined;

      const apiKey = sessionApiKey();
      const res = await fetch(`/api/v1/contracts/${contractUuid}/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'X-API-Key': apiKey } : {}),
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
          signature,
          message,
          ...(shareToken ? { share_token: shareToken } : {}),
          ...(identityAttestation ? { identity_attestation: identityAttestation } : {}),
          ...(validEmail ? { signer_email: validEmail } : {}),
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        // The server's own words go to the user as they are; sanitizeWalletError
        // below is for errors thrown by the wallet.
        setError(serverErrorMessage(data));
        setState('error');
        return;
      }

      setResult(data);
      setState('success');
    } catch (err) {
      if (isUserRejection(err)) { setState('connected'); return; }
      setError(sanitizeWalletError(err));
      setState('error');
    }
  };

  if (!canSign && state !== 'success') return null;

  return (
    <div className="rounded-xl border border-amber-600/20 bg-stone-900/50 p-6">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-500">
        Sign Contract
      </h3>

      {existingSignatures.length > 0 && (
        <div className="mt-3 space-y-1">
          <p className="text-xs text-stone-500">Existing signatures:</p>
          {existingSignatures.map((sig) => (
            <div key={sig.signer_wallet} className="flex items-center gap-2 text-xs text-stone-400">
              <span className="font-mono">
                {sig.signer_wallet.slice(0, 6)}...{sig.signer_wallet.slice(-4)}
              </span>
              {sig.signer_identity && <ZKIdentityBadge compact />}
              <span className="text-stone-600">
                {new Date(sig.signed_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4">
        {state === 'idle' && (
          <WalletPicker providers={walletProviders} onPick={connectWallet} variant="reader" />
        )}

        {state === 'connecting' && (
          <p className="text-sm text-stone-400">Connecting wallet...</p>
        )}

        {state === 'connected' && walletAddress && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="font-mono text-xs text-stone-300">
                {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </span>
            </div>

            {requireZkIdentity && !identityAttestation && (
              <ZKIdentityVerify
                walletAddress={walletAddress}
                contractId={contractId}
                onVerified={setIdentityAttestation}
              />
            )}

            {requireZkIdentity && identityAttestation && (
              <div className="flex items-center gap-2">
                <ZKIdentityBadge />
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-xs uppercase tracking-wider text-stone-500" htmlFor="signer-email">
                Your email <span className="text-stone-600 normal-case">(optional — for activation notification)</span>
              </label>
              <input
                id="signer-email"
                type="email"
                value={signerEmail}
                onChange={(e) => setSignerEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-md border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
              />
            </div>

            <button
              onClick={signContract}
              disabled={requireZkIdentity && !identityAttestation}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Confirm Signature
            </button>
          </div>
        )}

        {(state === 'signing' || state === 'submitting') && (
          <p className="text-sm text-stone-400">
            {state === 'signing' ? 'Sign the message in your wallet...' : 'Submitting signature...'}
          </p>
        )}

        {state === 'success' && result && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-green-400">Contract signed.</p>
            <p className="text-xs text-stone-400">
              Status: <span className="text-stone-300">{result.status}</span>
            </p>
            {result.nft_mint_status && (
              <p className="text-xs text-amber-400">
                cNFT minting to your wallet...
              </p>
            )}
          </div>
        )}

        {state === 'error' && error && (
          <div className="space-y-2">
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={() => {
                setState('idle');
                setError(null);
                setWalletAddress(null);
              }}
              className="text-xs text-stone-500 underline hover:text-stone-400"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
