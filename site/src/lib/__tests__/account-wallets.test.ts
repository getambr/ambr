import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stand-in for the two reads the loader makes: account_wallets (a list) and
// api_keys (one row).
let bound: { wallet_address: string; source?: string }[] = [];
let boundError: { message: string } | null = null;
let keyRow: { principal_wallet: string | null } | null = null;
// The sources the loader asked for; the stand-in then answers like the database would.
let askedSources: string[] | null = null;

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        in: (_col: string, sources: string[]) => {
          askedSources = sources;
          return q;
        },
        single: () => Promise.resolve({ data: keyRow, error: keyRow ? null : { message: 'no row' } }),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({
            data: askedSources ? bound.filter((r) => askedSources!.includes(r.source ?? '')) : bound,
            error: boundError,
          }).then(resolve),
      };
      return q;
    },
  }),
}));

import {
  PROVEN_BINDING_SOURCES,
  accountPrincipalWallet,
  creationPrincipalWallet,
  loadAccountWallets,
} from '@/lib/contract/account-wallets';

const A = '0x' + 'a'.repeat(40);
const B = '0x' + 'b'.repeat(40);
const C = '0x' + 'c'.repeat(40);

beforeEach(() => {
  bound = [];
  askedSources = null;
  boundError = null;
  keyRow = null;
});

describe('loadAccountWallets', () => {
  it('merges the delegated wallet and the bindings, lowercased and without duplicates', async () => {
    keyRow = { principal_wallet: A.toUpperCase().replace('0X', '0x') };
    bound = [{ wallet_address: B, source: 'manual' }, { wallet_address: A, source: 'manual' }];
    expect(await loadAccountWallets('key-1')).toEqual({ all: [A, B], delegated: A });
  });

  it('leaves the agent out, wherever it came from', async () => {
    keyRow = { principal_wallet: C };
    bound = [{ wallet_address: A, source: 'manual' }, { wallet_address: B, source: 'manual' }];
    expect(await loadAccountWallets('key-1', C)).toEqual({ all: [A, B], delegated: null });
  });

  it('an account with nothing bound has no wallets', async () => {
    expect(await loadAccountWallets('key-1')).toEqual({ all: [], delegated: null });
  });

  it('throws when the bindings cannot be read, so the sign route refuses instead of trusting the key', async () => {
    boundError = { message: 'down' };
    await expect(loadAccountWallets('key-1')).rejects.toThrow(/account_wallets/);
  });
});

describe('the wallet declared at creation', () => {
  it('is the delegated wallet, else the only bound wallet, else none', () => {
    expect(creationPrincipalWallet({ all: [A, B], delegated: B })).toBe(B);
    expect(creationPrincipalWallet({ all: [A], delegated: null })).toBe(A);
    expect(creationPrincipalWallet({ all: [A, B], delegated: null })).toBeNull();
    expect(creationPrincipalWallet({ all: [], delegated: null })).toBeNull();
  });

  it('accountPrincipalWallet reads it for a key, and is null when the read fails', async () => {
    bound = [{ wallet_address: A, source: 'manual' }];
    expect(await accountPrincipalWallet('key-1')).toBe(A);

    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    boundError = { message: 'down' };
    expect(await accountPrincipalWallet('key-1')).toBeNull();
    log.mockRestore();
  });
});

describe('which bindings count', () => {
  it('asks only for proven sources, and ignores backfilled and auto-deploy rows', async () => {
    expect(PROVEN_BINDING_SOURCES).toEqual(['auto_wallet_auth', 'manual']);
    bound = [
      { wallet_address: A, source: 'auto_backfill' }, // a counterparty who signed under the key
      { wallet_address: B, source: 'auto_deploy' }, // whatever a caller typed at deploy time
      { wallet_address: C, source: 'auto_wallet_auth' },
    ];
    expect(await loadAccountWallets('key-1')).toEqual({ all: [C], delegated: null });
    expect(askedSources).toEqual(PROVEN_BINDING_SOURCES);
  });

  it('an account with only unproven bindings has no wallet, so nothing is declared at creation', async () => {
    bound = [{ wallet_address: A, source: 'auto_backfill' }, { wallet_address: B, source: 'auto_deploy' }];
    expect(await accountPrincipalWallet('key-1')).toBeNull();
  });
});
