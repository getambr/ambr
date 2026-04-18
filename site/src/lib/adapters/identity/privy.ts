import type { IdentityAdapter, IdentityResult } from './index';

interface PrivyLinkedAccount {
  type: string;
  address?: string;
  email?: string;
  username?: string;
  name?: string;
  subject?: string;
  verified_at?: number;
}

interface PrivyUser {
  id: string;
  created_at: number;
  linked_accounts: PrivyLinkedAccount[];
  wallet?: { address: string };
}

/**
 * Privy Identity Adapter — email/social login → embedded smart wallet.
 *
 * Token is a Privy auth token (JWT). Verified server-side via Privy API.
 * Requires PRIVY_APP_ID and PRIVY_APP_SECRET env vars.
 */
export class PrivyIdentityAdapter implements IdentityAdapter {
  name = 'privy';

  private appId: string;
  private appSecret: string;

  constructor() {
    const appId = process.env.PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    if (!appId || !appSecret) {
      throw new Error('PRIVY_APP_ID and PRIVY_APP_SECRET must be set');
    }
    this.appId = appId;
    this.appSecret = appSecret;
  }

  async verify(token: string, walletAddress: string): Promise<IdentityResult | null> {
    if (!token || !walletAddress) return null;

    let user: PrivyUser;
    try {
      user = await this.verifyAuthToken(token);
    } catch {
      return null;
    }

    const privyWallet = user.wallet?.address?.toLowerCase();
    if (privyWallet && privyWallet !== walletAddress.toLowerCase()) {
      return null;
    }

    const linkedIdentities = this.extractLinkedIdentities(user.linked_accounts);

    return {
      verified: true,
      provider: 'privy',
      address: walletAddress.toLowerCase(),
      linked_identities: linkedIdentities,
      metadata: {
        privy_user_id: user.id,
        privy_created_at: new Date(user.created_at * 1000).toISOString(),
        linked_account_types: user.linked_accounts.map((a) => a.type),
        verified_at: new Date().toISOString(),
      },
    };
  }

  private async verifyAuthToken(token: string): Promise<PrivyUser> {
    const verifyUrl = `https://auth.privy.io/api/v1/users/me`;
    const response = await fetch(verifyUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'privy-app-id': this.appId,
      },
    });

    if (!response.ok) {
      throw new Error(`Privy token verification failed: ${response.status}`);
    }

    return response.json() as Promise<PrivyUser>;
  }

  private extractLinkedIdentities(
    accounts: PrivyLinkedAccount[],
  ): Record<string, string> {
    const identities: Record<string, string> = {};

    for (const account of accounts) {
      switch (account.type) {
        case 'email':
          if (account.email) identities.email = account.email;
          break;
        case 'google_oauth':
          if (account.email) identities.google = account.email;
          break;
        case 'apple_oauth':
          if (account.subject) identities.apple = account.subject;
          break;
        case 'twitter_oauth':
          if (account.username) identities.twitter = account.username;
          break;
        case 'discord_oauth':
          if (account.username) identities.discord = account.username;
          break;
        case 'github_oauth':
          if (account.username) identities.github = account.username;
          break;
        case 'wallet':
          if (account.address) identities.wallet = account.address.toLowerCase();
          break;
      }
    }

    return identities;
  }
}
