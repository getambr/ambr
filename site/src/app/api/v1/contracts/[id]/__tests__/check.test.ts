import { describe, it, expect, vi, beforeEach } from 'vitest';

// POST /api/v1/contracts/[id]/check: read-only, same access rule as GET.

const validateApiKey = vi.fn();
const logAudit = vi.fn();
let contractRow: Record<string, unknown> | null = null;
let childRows: Record<string, unknown>[] = [];
let tokenRow: Record<string, unknown> | null = null;

vi.mock('@/lib/api-auth', () => ({ validateApiKey: (...a: unknown[]) => validateApiKey(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ allowed: true, remaining: 59, resetAt: Date.now() + 60_000 }),
  getClientIp: () => '203.0.113.9',
}));
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.order = () => chain;
      // child lookup (amendment chain) ends in limit(); the first lookup ends in single()
      chain.limit = async () => ({ data: childRows, error: null });
      chain.single = async () => {
        const data = table === 'share_tokens' ? tokenRow : contractRow;
        return { data, error: data ? null : { message: 'not found' } };
      };
      return chain;
    },
  }),
}));

const CREATOR_KEY = 'key-creator';
const HASH = 'a'.repeat(64);

const machineReadable = {
  financial_terms: {
    currency: 'USD',
    spending_limit_per_tx: 100,
    spending_limit_monthly: 1000,
    requires_approval_above: 500,
  },
  scope_of_delegation: { approved_categories: ['compute'] },
};

async function check(body: unknown, opts: { id?: string; key?: string | null; query?: string; raw?: string } = {}) {
  const { POST } = await import('../check/route');
  const id = opts.id ?? 'amb-2026-0001';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.key !== null) headers['X-API-Key'] = opts.key ?? 'k';
  const req = new Request(`https://getamber.dev/api/v1/contracts/${id}/check${opts.query ?? ''}`, {
    method: 'POST',
    headers,
    body: opts.raw ?? JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  validateApiKey.mockReset();
  logAudit.mockReset();
  validateApiKey.mockResolvedValue({ keyId: CREATOR_KEY });
  contractRow = {
    id: 'row-1',
    contract_id: 'amb-2026-0001',
    status: 'active',
    sha256_hash: HASH,
    api_key_id: CREATOR_KEY,
    visibility: 'private',
    machine_readable: machineReadable,
    expiry_date: null,
  };
  childRows = [];
  tokenRow = null;
});

describe('POST /api/v1/contracts/[id]/check', () => {
  it('answers in_scope for a payment inside the agreement', async () => {
    const res = await check({ amount: 40, currency: 'USD', category: 'compute', period_spent: 200 });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      verdict: 'in_scope',
      reasons: [],
      contract_id: 'amb-2026-0001',
      effective_contract_id: 'amb-2026-0001',
      sha256_hash: HASH,
      reader_url: `https://getamber.dev/reader/${HASH}`,
    });
    expect(Number.isNaN(Date.parse(json.checked_at))).toBe(false);
    expect(json.checks.find((c: { rule: string }) => c.rule === 'monthly_limit')).toMatchObject({ result: 'pass', value: 240 });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'contract_check', actor: CREATOR_KEY }));
  });

  it('answers out_of_scope with the reasons', async () => {
    const res = await check({ amount: 150, category: 'gambling' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.verdict).toBe('out_of_scope');
    expect(json.reasons).toHaveLength(2);
  });

  it('answers needs_approval above the approval threshold', async () => {
    contractRow!.machine_readable = { financial_terms: { currency: 'USD', requires_approval_above: 500 } };
    const res = await check({ amount: 900 });
    expect((await res.json()).verdict).toBe('needs_approval');
  });

  it('checks the newest version of an amended agreement', async () => {
    contractRow!.status = 'amended';
    childRows = [{
      id: 'row-2',
      contract_id: 'amb-2026-0002',
      status: 'active',
      sha256_hash: 'b'.repeat(64),
      parent_contract_hash: HASH,
      amendment_type: 'amendment',
      machine_readable: { financial_terms: { currency: 'USD', spending_limit_per_tx: 500 } },
    }];
    const json = await (await check({ amount: 300 })).json();
    expect(json).toMatchObject({
      verdict: 'in_scope',
      contract_id: 'amb-2026-0001',
      effective_contract_id: 'amb-2026-0002',
      sha256_hash: 'b'.repeat(64),
    });
  });

  it('returns 403 for another key and for no key', async () => {
    validateApiKey.mockResolvedValue({ keyId: 'someone-else' });
    const other = await check({ amount: 1 });
    expect(other.status).toBe(403);
    validateApiKey.mockResolvedValue(null);
    const anon = await check({ amount: 1 }, { key: null });
    expect(anon.status).toBe(403);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('lets a valid share token in, and refuses an expired one', async () => {
    validateApiKey.mockResolvedValue(null);
    tokenRow = { id: 't1', expires_at: null };
    expect((await check({ amount: 1 }, { key: null, query: '?token=abc' })).status).toBe(200);
    tokenRow = { id: 't1', expires_at: '2020-01-01T00:00:00Z' };
    expect((await check({ amount: 1 }, { key: null, query: '?token=abc' })).status).toBe(403);
  });

  it('lets anyone check a public contract', async () => {
    validateApiKey.mockResolvedValue(null);
    contractRow!.visibility = 'public';
    expect((await check({ amount: 1 }, { key: null })).status).toBe(200);
  });

  it('returns 404 for an unknown contract', async () => {
    contractRow = null;
    const res = await check({ amount: 1 });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });

  it('returns 400 for bad input', async () => {
    for (const body of [{ amount: -5 }, { amount: '5' }, {}, { amount: 1, period_spent: -1 }, { amount: 1, category: '' }]) {
      const res = await check(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((await res.json()).error).toBe('invalid_request');
    }
    expect((await check(null, { raw: 'not json' })).status).toBe(400);
    const badRef = await check({ amount: 1 }, { id: 'uuid-example' });
    expect(badRef.status).toBe(400);
    expect((await badRef.json()).error).toBe('invalid_contract_id');
  });

  it('answers CORS preflight', async () => {
    const { OPTIONS } = await import('../check/route');
    expect(OPTIONS(new Request('https://getamber.dev/x', { method: 'OPTIONS' })).status).toBe(204);
  });
});
