'use client';

import { useState } from 'react';
import { ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import type { IdentityAttestationPayload } from '@/lib/zk/types';

type VerifyState = 'idle' | 'generating' | 'verified' | 'error';

interface ZKIdentityVerifyProps {
  walletAddress: string;
  contractId: string;
  onVerified: (attestation: IdentityAttestationPayload) => void;
}

export default function ZKIdentityVerify({
  walletAddress,
  contractId,
  onVerified,
}: ZKIdentityVerifyProps) {
  const [state, setState] = useState<VerifyState>('idle');
  const [error, setError] = useState<string | null>(null);

  const verifyIdentity = async () => {
    setState('generating');
    setError(null);

    try {
      // Dynamic import with variable to bypass webpack static analysis
      // The SDK's root export pulls in chain bridges (rubic-sdk, etc.)
      // that have broken deps; this defers resolution to runtime
      const sdkPath = '@kynesyslabs/demosdk';
      const sdk = await import(/* webpackIgnore: true */ sdkPath);
      const { ZKIdentity } = sdk.encryption.zK.identity;

      // Create identity from wallet address as provider ID
      const providerId = `wallet:${walletAddress.toLowerCase()}`;
      const identity = ZKIdentity.generate(providerId);

      // Store secret in sessionStorage for this session
      const exported = identity.export();
      try {
        sessionStorage.setItem(`ambr_zk_${walletAddress.toLowerCase()}`, JSON.stringify(exported));
      } catch {
        // Non-critical — session backup failed
      }

      // Submit commitment to Demos node
      const rpcUrl = 'https://rpc.demos.sh';
      await identity.createCommitmentTransaction(rpcUrl);

      // Generate attestation (ZK proof)
      const context = `ambr_contract:${contractId}`;
      const attestation = await identity.createAttestationTransaction(rpcUrl, context);

      // Verify locally before submitting
      const locallyValid = await ZKIdentity.verifyAttestation(attestation);
      if (!locallyValid) {
        throw new Error('Local proof verification failed. Try again.');
      }

      setState('verified');
      onVerified(attestation);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Identity verification failed');
      setState('error');
    }
  };

  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="h-4 w-4 text-amber-500" />
        <h4 className="text-sm font-medium text-amber-400">ZK Identity Verification</h4>
      </div>

      <p className="text-xs text-stone-400 mb-4">
        This contract requires privacy-preserving identity verification.
        Your identity is proven cryptographically without revealing personal data.
      </p>

      {state === 'idle' && (
        <button
          onClick={verifyIdentity}
          className="rounded-lg bg-amber-600/20 px-4 py-2 text-sm font-medium text-amber-400 transition-colors hover:bg-amber-600/30 border border-amber-600/30"
        >
          Verify Identity
        </button>
      )}

      {state === 'generating' && (
        <div className="flex items-center gap-2 text-sm text-stone-400">
          <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
          <span>Generating ZK proof... This may take a few seconds.</span>
        </div>
      )}

      {state === 'verified' && (
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-sm text-emerald-400">Identity verified</span>
          <span className="text-xs text-stone-500 font-mono">Groth16/BN128</span>
        </div>
      )}

      {state === 'error' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-red-400">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => { setState('idle'); setError(null); }}
            className="text-xs text-stone-500 underline hover:text-stone-400"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
