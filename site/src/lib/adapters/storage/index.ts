/**
 * Storage Adapter Interface — pluggable contract storage for Ambr.
 *
 * Adapters: Supabase (default), IPFS (Phase 2), Demos DAHR (Phase 3), Base L2 (Phase 4)
 */

export interface ContractData {
  contractId: string;
  templateId: string | null;
  humanReadable: string;
  machineReadable: Record<string, unknown>;
  sha256Hash: string;
  principalDeclaration: Record<string, unknown>;
  parameters: Record<string, unknown>;
  status: string;
  visibility: 'private' | 'metadata_only' | 'public' | 'encrypted';
  apiKeyId?: string;
  payerWallet?: string;
  paymentMethod: 'api_key' | 'x402' | 'usdc_direct';
  parentContractHash?: string;
  amendmentType?: 'original' | 'amendment' | 'extension';
  encryptionMetadata?: Record<string, unknown> | null;
}

export interface StorageResult {
  adapter: string;
  reference: string;
  proof?: string;
  stored_at: string;
}

export interface StorageAdapter {
  name: string;
  store(contract: ContractData): Promise<StorageResult>;
  retrieve(ref: string): Promise<ContractData | null>;
  verify(ref: string, expectedHash: string): Promise<boolean>;
}
