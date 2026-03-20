/**
 * Identity Adapter Interface — pluggable identity verification for Ambr.
 *
 * Adapters: Wallet/ECDSA (existing), Demos CCI (Phase 2), ENS/Lens (future)
 */

export interface IdentityResult {
  verified: boolean;
  provider: 'wallet' | 'demos' | 'ens' | 'lens' | string;
  address: string;
  linked_identities: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface IdentityAdapter {
  name: string;
  /** Verify identity from a token/proof + wallet address. Returns null if not applicable. */
  verify(token: string, walletAddress: string): Promise<IdentityResult | null>;
}
