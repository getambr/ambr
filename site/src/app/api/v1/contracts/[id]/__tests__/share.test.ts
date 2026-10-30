import { describe, it, expect, vi, beforeEach } from 'vitest';

// What kind of link POST /share makes. Only an invite lets its holder fill an
// open counterparty slot (lib/contract/share-token.ts); the dashboard asks for
// a 'deployer' link for the creator's own Sign and Open in Reader buttons.

const validateApiKey = vi.fn();
const notifyContract = vi.fn();
let contractRow: Record<string, unknown> | null = null;
let inserted: Record<string, unknown>[] = [];

vi.mock('@/lib/api-auth', () => ({ validateApiKey: (...a: unknown[]) => validateApiKey(...a) }));
vi.mock('@/lib/email/notify-contract', () => ({ notifyContract: (...a: unknown[]) => notifyContract(...a) }));
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'share_tokens') {
        return {
          insert: async (row: Record<string, unknown>) => {
            inserted.push(row);
            return { error: null };
          },
        };
      }
      // contracts: the lookup, and the counterparty_email write on the email path.
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.update = () => chain;
      chain.eq = () => chain;
      chain.is = async () => ({ error: null });
      chain.single = async () => ({ data: contractRow, error: contractRow ? null : { message: 'not found' } });
      return chain;
    },
  }),
}));

const CREATOR_KEY = 'key-creator';

async function share(body: unknown) {
  const { POST } = await import('../share/route');
  const req = new Request('https://getamber.dev/api/v1/contracts/amb-2026-0001/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': 'k' },
    body: JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({ id: 'amb-2026-0001' }) });
}

beforeEach(() => {
  validateApiKey.mockReset();
  notifyContract.mockReset();
  validateApiKey.mockResolvedValue({ keyId: CREATOR_KEY, email: 'creator@example.com' });
  notifyContract.mockResolvedValue({ ok: true });
  contractRow = { id: 'row-1', contract_id: 'amb-2026-0001', sha256_hash: 'a'.repeat(64), api_key_id: CREATOR_KEY };
  inserted = [];
});

describe('POST /api/v1/contracts/[id]/share: purpose', () => {
  it('makes an invite by default', async () => {
    const res = await share({});
    expect(res.status).toBe(200);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ purpose: 'invite', access_level: 'full' });
    expect((await res.json()).purpose).toBe('invite');
  });

  it("makes the creator's own link for purpose 'deployer'", async () => {
    const res = await share({ purpose: 'deployer' });
    expect(res.status).toBe(200);
    expect(inserted[0]).toMatchObject({ purpose: 'deployer', access_level: 'full' });
    expect((await res.json()).purpose).toBe('deployer');
  });

  it.each(['admin', 'Deployer', 'deployer ', 'view', true])('refuses purpose %j and makes no token', async (purpose) => {
    const res = await share({ purpose });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_purpose');
    expect(inserted).toHaveLength(0);
  });

  it('makes an emailed link an invite', async () => {
    const res = await share({ recipient_email: 'Counterparty@Example.com' });
    expect(res.status).toBe(200);
    expect(inserted[0]).toMatchObject({ purpose: 'invite' });
    expect(notifyContract).toHaveBeenCalledWith(expect.objectContaining({ recipientEmail: 'counterparty@example.com' }));
  });

  it("refuses a 'deployer' link with a recipient_email, and sends nothing", async () => {
    const res = await share({ purpose: 'deployer', recipient_email: 'counterparty@example.com' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('purpose_conflict');
    expect(inserted).toHaveLength(0);
    expect(notifyContract).not.toHaveBeenCalled();
  });

  it('stores a scope link as deployer, never an invite', async () => {
    const res = await share({ access_level: 'scope' });
    expect(res.status).toBe(200);
    expect(inserted[0]).toMatchObject({ purpose: 'deployer', access_level: 'scope' });
  });

  it('refuses an invite with scope access', async () => {
    const res = await share({ purpose: 'invite', access_level: 'scope' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('purpose_conflict');
    expect(inserted).toHaveLength(0);
  });

  it('keeps a deployer link when recipient_email is not an address, and sends nothing', async () => {
    await share({ purpose: 'deployer', recipient_email: 'not-an-email' });
    expect(inserted[0]).toMatchObject({ purpose: 'deployer' });
    expect(notifyContract).not.toHaveBeenCalled();
  });

  it('refuses a key that did not create the contract and makes no token', async () => {
    validateApiKey.mockResolvedValue({ keyId: 'key-other', email: 'other@example.com' });
    const res = await share({ purpose: 'deployer' });
    expect(res.status).toBe(403);
    expect(inserted).toHaveLength(0);
  });
});
