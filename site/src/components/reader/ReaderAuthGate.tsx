'use client';

import { useState, useCallback } from 'react';
import WalletConnect from './WalletConnect';
import HandshakeActions from './HandshakeActions';
import SignContract from './SignContract';
import NftStatus from './NftStatus';
import ContractViewer from '@/app/(platform)/reader/[hashOrId]/ContractViewer';
import ExportButtons from '@/app/(platform)/reader/[hashOrId]/ExportButtons';

interface ContractData {
  id: string;
  contract_id: string;
  status: string;
  sha256_hash: string;
  human_readable: string;
  machine_readable: Record<string, unknown>;
  principal_declaration: Record<string, string> | null;
  visibility: string;
  amendment_type: string;
  parent_contract_hash: string | null;
  nft_token_id: number | null;
  nft_tx_hash: string | null;
  nft_mint_status: string | null;
  nft_holder_wallet: string | null;
  nft_counterparty_wallet: string | null;
  require_zk_identity: boolean;
  created_at: string;
}

interface Signature {
  signer_wallet: string;
  signed_at: string;
}

interface Handshake {
  wallet_address: string;
  intent: string;
  message?: string;
  visibility_preference?: string;
  created_at: string;
}

interface ReaderAuthGateProps {
  contractId: string;
  contractUuid: string;
}

export default function ReaderAuthGate({ contractId, contractUuid }: ReaderAuthGateProps) {
  const [contract, setContract] = useState<ContractData | null>(null);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [handshakes, setHandshakes] = useState<Handshake[]>([]);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  const handleAuthorized = useCallback((data: {
    contract: Record<string, unknown>;
    signatures: Signature[];
    handshakes: Handshake[];
  }) => {
    setContract(data.contract as unknown as ContractData);
    setSignatures(data.signatures);
    setHandshakes(data.handshakes);
    // Extract wallet address from the auth response
    const addr = (data.contract as Record<string, unknown>).payer_wallet as string
      || data.signatures[0]?.signer_wallet
      || data.handshakes[0]?.wallet_address
      || null;
    setWalletAddress(addr);
  }, []);

  const refreshData = useCallback(async () => {
    if (!walletAddress) return;
    // Re-fetch via wallet-auth to get updated state
    try {
      if (!window.ethereum) return;
      const { BrowserProvider } = await import('ethers');
      const { validateSigner } = await import('@/lib/wallet/validate-signer');
      const provider = new BrowserProvider(window.ethereum);
      const signer = await validateSigner(provider);
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
        body: JSON.stringify({ wallet_address: walletAddress, signature, message }),
      });

      if (res.ok) {
        const data = await res.json();
        setContract(data.contract as ContractData);
        setSignatures(data.signatures);
        setHandshakes(data.handshakes);
      }
    } catch (err) {
      // Silent fail on refresh — user can manually reload
      console.warn('[reader] refresh failed:', err instanceof Error ? err.message : err);
    }
  }, [contractId, contractUuid, walletAddress]);

  if (!contract) {
    return (
      <WalletConnect
        contractId={contractId}
        contractUuid={contractUuid}
        onAuthorized={(data) => {
          handleAuthorized(data);
          // Also capture the wallet from the connect flow
          // The wallet address is embedded in the first matching field
          const c = data.contract as Record<string, unknown>;
          const w = data.signatures[0]?.signer_wallet
            || data.handshakes[0]?.wallet_address
            || (c.payer_wallet as string)
            || (c.nft_holder_wallet as string)
            || (c.nft_counterparty_wallet as string);
          if (w) setWalletAddress(w);
        }}
      />
    );
  }

  const isSignable = ['draft', 'handshake', 'pending_signature'].includes(contract.status);
  const isHandshakeable = ['draft', 'handshake'].includes(contract.status);

  return (
    <div className="space-y-6">
      {/* Wallet status bar */}
      {walletAddress && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
          <div className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="font-mono text-xs text-emerald-300">
            {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
          </span>
          <span className="text-xs text-emerald-400">Wallet verified</span>
        </div>
      )}

      {/* Principal Declaration */}
      {contract.principal_declaration && (
        <div className="rounded-lg border border-border bg-surface-elevated px-4 py-3">
          <p className="text-xs font-medium text-amber mb-1">
            Principal Declaration
          </p>
          <p className="text-sm text-text-primary">
            Agent{' '}
            <code className="font-mono text-amber-light">
              {contract.principal_declaration.agent_id}
            </code>{' '}
            acts on behalf of{' '}
            <span className="font-medium">
              {contract.principal_declaration.principal_name}
            </span>{' '}
            <span className="text-text-secondary">
              ({contract.principal_declaration.principal_type})
            </span>
          </p>
        </div>
      )}

      {/* Export buttons */}
      <ExportButtons
        contractId={contract.contract_id}
        humanReadable={contract.human_readable}
        machineReadable={contract.machine_readable}
        sha256Hash={contract.sha256_hash}
      />

      {/* Handshake actions */}
      {isHandshakeable && walletAddress && (
        <HandshakeActions
          contractUuid={contract.id}
          contractVisibility={contract.visibility}
          walletAddress={walletAddress}
          handshakes={handshakes}
          onHandshakeComplete={refreshData}
        />
      )}

      {/* Signing */}
      {isSignable && (
        <SignContract
          contractId={contract.contract_id}
          contractUuid={contract.id}
          sha256Hash={contract.sha256_hash}
          status={contract.status}
          existingSignatures={signatures}
          requireZkIdentity={contract.require_zk_identity}
        />
      )}

      {/* NFT status */}
      <NftStatus
        mintStatus={contract.nft_mint_status}
        tokenId={contract.nft_token_id}
        txHash={contract.nft_tx_hash}
        holderWallet={contract.nft_holder_wallet}
        counterpartyWallet={contract.nft_counterparty_wallet}
      />

      {/* Contract content */}
      <ContractViewer
        humanReadable={contract.human_readable}
        machineReadable={contract.machine_readable}
      />
    </div>
  );
}
