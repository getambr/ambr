import { WalletIdentityAdapter } from './wallet';
import { DemosIdentityAdapter } from './demos';
import { PrivyIdentityAdapter } from './privy';

export interface IdentityResult {
  verified: boolean;
  provider: 'wallet' | 'demos' | 'privy' | 'ens' | 'lens' | string;
  address: string;
  linked_identities: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface IdentityAdapter {
  name: string;
  verify(token: string, walletAddress: string): Promise<IdentityResult | null>;
}

export type IdentityProvider = 'wallet' | 'demos' | 'privy';

export function getIdentityAdapter(provider: IdentityProvider): IdentityAdapter {
  switch (provider) {
    case 'demos':
      return new DemosIdentityAdapter();
    case 'privy':
      return new PrivyIdentityAdapter();
    case 'wallet':
    default:
      return new WalletIdentityAdapter();
  }
}

export { WalletIdentityAdapter } from './wallet';
export { DemosIdentityAdapter } from './demos';
export { PrivyIdentityAdapter } from './privy';
