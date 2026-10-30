import { describe, it, expect, vi, beforeEach } from 'vitest';

// rpc grant_credits_once is the single source of idempotency. The mock mimics
// the database: the first call for a marker grants, a repeat returns false.
const seenMarkers = new Set<string>();
const rpc = vi.fn(async (_fn: string, args: { p_marker: string }) => {
  if (seenMarkers.has(args.p_marker)) return { data: false, error: null };
  seenMarkers.add(args.p_marker);
  return { data: true, error: null };
});
const logAudit = vi.fn();
let nextEvent: unknown;

vi.mock('@/lib/stripe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/stripe')>()),
  getStripe: () => ({
    webhooks: { constructEvent: () => nextEvent },
    subscriptions: {
      retrieve: async () => ({ metadata: { plan: 'business', email: 'Team@Example.com' } }),
    },
  }),
}));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/api-auth', () => ({ generateApiKey: () => ({ key: 'k', hash: 'h', prefix: 'p' }) }));

const emailLookups: string[] = [];
vi.mock('@/lib/supabase-admin', () => {
  // A thenable, filterable chain: every query resolves to a harmless result,
  // api_keys lookups return an active key and record the email filter used.
  function chain(table: string) {
    const c: Record<string, unknown> = {};
    const self = () => c;
    for (const m of ['select', 'update', 'insert', 'order', 'limit', 'is', 'in']) c[m] = self;
    c.eq = (col: string, val: string) => {
      if (table === 'api_keys' && col === 'email') emailLookups.push(val);
      return c;
    };
    c.maybeSingle = async () => ({ data: table === 'api_keys' ? { id: 'key-1', key_prefix: 'amb_x' } : null });
    c.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null });
    return c;
  }
  return { getSupabaseAdmin: () => ({ from: (t: string) => chain(t), rpc }) };
});

function invoicePaid(invoiceId: string) {
  return {
    type: 'invoice.paid',
    data: {
      object: {
        id: invoiceId,
        parent: { subscription_details: { subscription: 'sub_1' } },
      },
    },
  };
}

async function deliver() {
  const { POST } = await import('../route');
  return POST(
    new Request('https://getamber.dev/api/v1/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig' },
      body: '{}',
    }),
  );
}

beforeEach(() => {
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test');
  rpc.mockClear();
  logAudit.mockClear();
  seenMarkers.clear();
  emailLookups.length = 0;
});

describe('stripe webhook invoice.paid credit grant', () => {
  it('grants through grant_credits_once with the invoice id as marker, on the normalised email', async () => {
    nextEvent = invoicePaid('in_123');

    const res = await deliver();

    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('grant_credits_once', {
      p_marker: 'in_123',
      p_api_key_id: 'key-1',
      p_amount: 3000,
    });
    expect(emailLookups).toContain('team@example.com');
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'stripe_plan_credits_granted' }));
  });

  it('a second delivery of the same invoice is acknowledged but grants nothing', async () => {
    nextEvent = invoicePaid('in_dup');

    await deliver();
    logAudit.mockClear();
    const second = await deliver();

    expect(second.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(2); // the rpc is the guard: it returned false the second time
    expect(rpc.mock.results[1]).toBeDefined();
    expect(await rpc.mock.results[1].value).toEqual({ data: false, error: null });
    expect(logAudit).not.toHaveBeenCalledWith(expect.objectContaining({ event_type: 'stripe_plan_credits_granted' }));
  });

  it('asks Stripe to retry when the grant fails', async () => {
    nextEvent = invoicePaid('in_fail');
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } } as never);

    const res = await deliver();

    expect(res.status).toBe(500);
  });
});
