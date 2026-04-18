import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('PrivyIdentityAdapter', () => {
  const MOCK_APP_ID = 'test-app-id';
  const MOCK_APP_SECRET = 'test-app-secret';

  beforeEach(() => {
    vi.stubEnv('PRIVY_APP_ID', MOCK_APP_ID);
    vi.stubEnv('PRIVY_APP_SECRET', MOCK_APP_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function loadAdapter() {
    const { PrivyIdentityAdapter } = await import('../privy');
    return new PrivyIdentityAdapter();
  }

  it('returns null when token is empty', async () => {
    const adapter = await loadAdapter();
    const result = await adapter.verify('', '0xabc123');
    expect(result).toBeNull();
  });

  it('returns null when walletAddress is empty', async () => {
    const adapter = await loadAdapter();
    const result = await adapter.verify('some-token', '');
    expect(result).toBeNull();
  });

  it('returns verified result with linked identities on success', async () => {
    const mockUser = {
      id: 'did:privy:user123',
      created_at: 1700000000,
      linked_accounts: [
        { type: 'email', email: 'alice@example.com' },
        { type: 'wallet', address: '0xDeaD000000000000000000000000000000000000' },
        { type: 'google_oauth', email: 'alice@gmail.com' },
      ],
      wallet: { address: '0xDeaD000000000000000000000000000000000000' },
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockUser),
      }),
    );

    const adapter = await loadAdapter();
    const result = await adapter.verify(
      'valid-token',
      '0xDeaD000000000000000000000000000000000000',
    );

    expect(result).not.toBeNull();
    expect(result!.verified).toBe(true);
    expect(result!.provider).toBe('privy');
    expect(result!.address).toBe('0xdead000000000000000000000000000000000000');
    expect(result!.linked_identities.email).toBe('alice@example.com');
    expect(result!.linked_identities.google).toBe('alice@gmail.com');
    expect(result!.linked_identities.wallet).toBe(
      '0xdead000000000000000000000000000000000000',
    );
    expect(result!.metadata).toHaveProperty('privy_user_id', 'did:privy:user123');
  });

  it('returns null when Privy wallet does not match walletAddress', async () => {
    const mockUser = {
      id: 'did:privy:user456',
      created_at: 1700000000,
      linked_accounts: [{ type: 'wallet', address: '0xAAAA' }],
      wallet: { address: '0xAAAA000000000000000000000000000000000000' },
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockUser),
      }),
    );

    const adapter = await loadAdapter();
    const result = await adapter.verify(
      'valid-token',
      '0xBBBB000000000000000000000000000000000000',
    );

    expect(result).toBeNull();
  });

  it('returns null when Privy API returns non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );

    const adapter = await loadAdapter();
    const result = await adapter.verify('bad-token', '0xabc');
    expect(result).toBeNull();
  });

  it('throws when env vars are missing', async () => {
    vi.stubEnv('PRIVY_APP_ID', '');
    vi.stubEnv('PRIVY_APP_SECRET', '');

    // Need fresh import to hit constructor check
    vi.resetModules();
    const { PrivyIdentityAdapter } = await import('../privy');
    expect(() => new PrivyIdentityAdapter()).toThrow('PRIVY_APP_ID');
  });
});
