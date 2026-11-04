import { describe, it, expect, vi, beforeEach } from 'vitest';

// POST /api/v1/contracts/[id]/check: read-only, same access rule as GET.

const validateApiKey = vi.fn();
const logAudit = vi.fn();
let contractRow: Record<string, unknown> | null = null;
// Rows reachable by uuid (the version an approved amendment points at), and the proposals themselves.
let rowsById: Record<string, Record<string, unknown>> = {};
let proposals: { resulting_contract_id: string | null }[] = [];
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
      if (table === 'amendment_proposals') {
        const p: Record<string, unknown> = {};
        p.select = () => p;
        p.eq = () => p;
        p.then = (resolve: (v: unknown) => unknown) => resolve({ data: proposals, error: null });
        return p;
      }
      const q: { col?: string; val?: unknown } = {};
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (col: string, val: unknown) => {
        q.col = col;
        q.val = val;
        return chain;
      };
      chain.single = async () => {
        let data: Record<string, unknown> | null;
        if (table === 'share_tokens') data = tokenRow;
        else if (q.col === 'id') data = rowsById[q.val as string] ?? null;
        else data = contractRow;
        return { data, error: data ? null : { message: 'not found' } };
      };
      return chain;
    },
  }),
}));

const CREATOR_KEY = 'key-creator';
const APPROVER_KEY = 'key-approver';
const HASH = 'a'.repeat(64);
const HASH2 = 'b'.repeat(64);

const machineReadable = {
  financial_terms: {
    currency: 'USD',
    spending_limit_per_tx: 100,
    spending_limit_monthly: 1000,
    requires_approval_above: 500,
  },
  scope_of_delegation: { approved_categories: ['compute'] },
};

const FULL = { currency: 'USD', category: 'compute', period_spent: 0 };

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

/** An amended original (amb-2026-0001) and its replacement. */
function amend(child: Record<string, unknown> = {}, opts: { approved?: boolean } = {}) {
  contractRow!.status = 'amended';
  rowsById['row-2'] = {
    id: 'row-2',
    contract_id: 'amb-2026-0002',
    status: 'active',
    sha256_hash: HASH2,
    parent_contract_hash: HASH,
    amendment_type: 'amendment',
    // The counterparty approves, so the new version is stored under their key.
    api_key_id: APPROVER_KEY,
    visibility: 'private',
    machine_readable: { financial_terms: { currency: 'USD', spending_limit_per_tx: 500 } },
    ...child,
  };
  proposals = opts.approved === false ? [] : [{ resulting_contract_id: 'row-2' }];
}

beforeEach(() => {
  validateApiKey.mockReset();
  logAudit.mockReset();
  validateApiKey.mockResolvedValue({ keyId: CREATOR_KEY });
  logAudit.mockResolvedValue(undefined);
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
  rowsById = {};
  proposals = [];
  tokenRow = null;
});

describe('POST /api/v1/contracts/[id]/check', () => {
  it('answers in_scope for a payment inside the agreement', async () => {
    const res = await check({ ...FULL, amount: 40, period_spent: 200 });
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
    const res = await check({ amount: 900, currency: 'USD' });
    expect((await res.json()).verdict).toBe('needs_approval');
  });

  it('answers incomplete, not in_scope, when an input the agreement limits is missing', async () => {
    const json = await (await check({ amount: 40, currency: 'USD', category: 'compute' })).json();
    expect(json.verdict).toBe('incomplete');
    expect(json.reasons.join(' ')).toMatch(/period_spent/);
  });

  it('answers incomplete for an agreement with no limits', async () => {
    contractRow!.machine_readable = { scope_of_delegation: { purpose: 'anything' } };
    const json = await (await check({ amount: 40 })).json();
    expect(json.verdict).toBe('incomplete');
    expect(json.reasons).toEqual(['The agreement sets no limits to check against.']);
  });

  describe('amended agreements', () => {
    it('checks the newest version, reached through an approved amendment', async () => {
      amend();
      const json = await (await check({ amount: 300, currency: 'USD' })).json();
      expect(json).toMatchObject({
        verdict: 'in_scope',
        contract_id: 'amb-2026-0001',
        effective_contract_id: 'amb-2026-0002',
        sha256_hash: HASH2,
      });
    });

    it('ignores a forged child row that only claims the parent hash', async () => {
      // No approved proposal points at it, so it is unreachable.
      amend({}, { approved: false });
      const json = await (await check({ ...FULL, amount: 300 })).json();
      expect(json.verdict).toBe('out_of_scope');
      expect(json.effective_contract_id).toBe('amb-2026-0001');
      expect(json.checks[0]).toMatchObject({ rule: 'version', result: 'fail' });
      expect(json.reasons[0]).toMatch(/no approved amendment/);
    });

    it('evaluates an amendment stored under the approver key normally, for the creator and the approver', async () => {
      amend();
      for (const keyId of [CREATOR_KEY, APPROVER_KEY]) {
        validateApiKey.mockResolvedValue({ keyId });
        contractRow!.visibility = 'private';
        const res = await check({ amount: 300, currency: 'USD' });
        // the approver is not the original's creator and holds no token: only the creator may ask
        if (keyId === APPROVER_KEY) {
          expect(res.status).toBe(403);
        } else {
          expect((await res.json())).toMatchObject({ verdict: 'in_scope', effective_contract_id: 'amb-2026-0002' });
        }
      }
      // a public original lets the approver in, and the version is evaluated
      contractRow!.visibility = 'public';
      validateApiKey.mockResolvedValue({ keyId: APPROVER_KEY });
      expect((await (await check({ amount: 300, currency: 'USD' })).json()).verdict).toBe('in_scope');
    });

    it('fails closed when the replacement does not name the original as its parent', async () => {
      amend({ parent_contract_hash: 'c'.repeat(64) });
      const json = await (await check({ ...FULL, amount: 10 })).json();
      expect(json.verdict).toBe('out_of_scope');
      expect(json.checks[0].rule).toBe('version');
    });

    it('refuses to show a stricter amendment to a caller who could not read it', async () => {
      contractRow!.visibility = 'public';
      amend({ visibility: 'private' });
      validateApiKey.mockResolvedValue(null);
      const anon = await check({ amount: 10, currency: 'USD' }, { key: null });
      expect(anon.status).toBe(403);
      validateApiKey.mockResolvedValue({ keyId: 'someone-else' });
      expect((await check({ amount: 10, currency: 'USD' })).status).toBe(403);
      expect(logAudit).not.toHaveBeenCalled();
      // the original's creator and the approver may both check it
      for (const keyId of [CREATOR_KEY, APPROVER_KEY]) {
        validateApiKey.mockResolvedValue({ keyId });
        const res = await check({ amount: 10, currency: 'USD' });
        expect(res.status, keyId).toBe(200);
        expect((await res.json()).effective_contract_id).toBe('amb-2026-0002');
      }
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
