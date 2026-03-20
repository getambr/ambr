import type { IdentityAdapter, IdentityResult } from './index';

/**
 * Wallet Identity Adapter — base ECDSA identity (always available).
 * The wallet address itself is the identity. No enrichment.
 */
export class WalletIdentityAdapter implements IdentityAdapter {
  name = 'wallet';

  async verify(_token: string, walletAddress: string): Promise<IdentityResult | null> {
    // Wallet identity is always valid if address is present
    if (!walletAddress) return null;

    return {
      verified: true,
      provider: 'wallet',
      address: walletAddress.toLowerCase(),
      linked_identities: {},
    };
  }
}
