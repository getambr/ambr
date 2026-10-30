import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearProviderUnavailable } from '@/lib/llm/availability';

const PAYER = '0x' + 'a'.repeat(40);
const TX_HASH = '0x' + 'ab'.repeat(32);

const generateContract = vi.fn();
const storeContract = vi.fn();
const linkPaymentToContract = vi.fn();
const logAudit = vi.fn();

vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({}) }));
let tplRow: Record<string, unknown> = { id: 'tpl-1', slug: 'a1-service-purchase', category: 'consumer', price_cents: 20 };

vi.mock('@/lib/supabase-admin', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    single: async () => ({ data: tplRow }),
  };
  return { getSupabaseAdmin: () => ({ from: () => chain }) };
});
vi.mock('@/lib/llm/generate-contract', () => ({
  generateContract: (...a: unknown[]) => generateContract(...a),
}));
vi.mock('@/lib/contract-engine', () => ({
  hashContract: () => 'hash',
  generateContractId: async () => 'AMB-2026-0001',
  storeContract: (...a: unknown[]) => storeContract(...a),
  decrementCredits: vi.fn(),
  grantCredits: vi.fn(),
}));
// The payer wallet is shared by every case; the 10/min limit is not under test here.
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ allowed: true, resetAt: 0 }) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/x402/middleware', () => ({
  linkPaymentToContract: (...a: unknown[]) => linkPaymentToContract(...a),
}));
vi.mock('@/lib/agent-limits', () => ({
  checkAgentLimit: vi.fn().mockResolvedValue({ allowed: true }),
  incrementAgentUsage: vi.fn(),
}));
vi.mock('@/lib/compliance/oversight-gate', () => ({
  resolveOversight: vi.fn().mockResolvedValue({
    oversightThresholdUsd: null,
    requiresPrincipalApproval: false,
  }),
  applyThresholdToDocument: vi.fn(),
}));

const USAGE_LIMIT_ERROR = Object.assign(
  new Error(
    '400 {"error":{"message":"You have reached your specified API usage limits. You will regain access on 2999-01-01 at 00:00 UTC."},"request_id":"req_SECRET123"}',
  ),
  { status: 400 },
);

function createCall() {
  return {
    jsonrpc: '2.0' as const,
    id: 1,
    method: 'tools/call',
    params: {
      name: 'ambr_create_contract',
      arguments: {
        template: 'a1-service-purchase',
        parameters: { service: 'x' },
        principal_declaration: { agent_id: PAYER, principal_name: 'Acme', principal_type: 'company' },
      },
    },
  };
}

function x402Ctx(settle: () => Promise<unknown>) {
  return { type: 'x402' as const, payerWallet: PAYER, amountUsdc: 0.2, resource: 'https://getamber.dev/api/mcp', settle };
}

async function call(authCtx: ReturnType<typeof x402Ctx>) {
  const { handleMcpMessage } = await import('../server');
  const res = await handleMcpMessage(createCall(), undefined, authCtx as never);
  return { res, result: res?.result as { content: { text: string }[]; isError?: boolean; structuredContent?: Record<string, unknown> } };
}

beforeEach(() => {
  tplRow = { id: 'tpl-1', slug: 'a1-service-purchase', category: 'consumer', price_cents: 20 };
  clearProviderUnavailable();
  for (const m of [generateContract, storeContract, linkPaymentToContract, logAudit]) m.mockReset();
  generateContract.mockResolvedValue({ humanReadable: 'h', machineReadable: {} });
  storeContract.mockResolvedValue({ id: 'row-1', contract_id: 'AMB-2026-0001', sha256_hash: 'hash', status: 'draft', created_at: 'now' });
});

describe('MCP ambr_create_contract x402: generate, then settle, then store', () => {
  it('generates before settling, settles before storing, and writes the receipt onto authCtx', async () => {
    const settle = vi.fn().mockResolvedValue({ ok: true, txHash: TX_HASH, payerWallet: PAYER, headers: { 'PAYMENT-RESPONSE': 'receipt' } });
    const ctx = x402Ctx(settle);

    const { result } = await call(ctx);

    expect(result.isError).toBeUndefined();
    expect(generateContract.mock.invocationCallOrder[0]).toBeLessThan(settle.mock.invocationCallOrder[0]);
    expect(settle.mock.invocationCallOrder[0]).toBeLessThan(storeContract.mock.invocationCallOrder[0]);
    expect((ctx as { paymentResponseHeaders?: unknown }).paymentResponseHeaders).toEqual({ 'PAYMENT-RESPONSE': 'receipt' });
    expect(linkPaymentToContract).toHaveBeenCalledWith(TX_HASH, 'row-1');
  });

  it('does not settle when generation fails, and says nothing about a refund or the upstream error', async () => {
    const settle = vi.fn();
    generateContract.mockRejectedValue(new Error('llm down'));

    const { result } = await call(x402Ctx(settle));

    expect(result.isError).toBe(true);
    expect(result.content[0].text).not.toMatch(/refund|llm down/i);
    expect(settle).not.toHaveBeenCalled();
    expect(storeContract).not.toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'x402_generation_failed_not_settled' }));
  });

  it('stores nothing, audits x402_settle_failed and reports nothing was charged when settlement fails', async () => {
    const settle = vi.fn().mockResolvedValue({ ok: false, reason: 'insufficient_funds', challenge: { status: 402, headers: {}, body: {} } });

    const { result } = await call(x402Ctx(settle));

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('nothing was charged');
    expect(storeContract).not.toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'x402_settle_failed',
        details: expect.objectContaining({ payer: PAYER, amount_usdc: 0.2, reason: 'insufficient_funds', money_moved: false }),
      }),
    );
  });

  it('answers payment_status_unknown, audits once and stores nothing when settle is ambiguous', async () => {
    const settle = vi.fn().mockResolvedValue({ ok: false, ambiguous: true, nonce: '0xnonce1', reason: 'socket hang up secret', challenge: { status: 503, headers: {}, body: {} } });

    const { result } = await call(x402Ctx(settle));

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ error: 'payment_status_unknown', nonce: '0xnonce1' });
    expect(JSON.stringify(result)).not.toMatch(/secret|nothing was charged/);
    expect(storeContract).not.toHaveBeenCalled();
    const rows = logAudit.mock.calls.filter(([a]) => /^x402_settle/.test(a.event_type));
    expect(rows).toHaveLength(1);
    expect(rows[0][0].details).toMatchObject({ money_moved: 'unknown', nonce: '0xnonce1' });
  });

  it('does not leak a non-coded reason when settlement fails with a plain refusal', async () => {
    const settle = vi.fn().mockResolvedValue({ ok: false, reason: 'Facilitator settle failed (502): excerpt', challenge: { status: 402, headers: {}, body: {} } });

    const { result } = await call(x402Ctx(settle));

    expect(result.content[0].text).toContain('nothing was charged');
    expect(result.content[0].text).not.toContain('excerpt');
  });

  it('skips settle past the deadline and stores nothing', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const settle = vi.fn();
      generateContract.mockImplementation(async () => {
        vi.setSystemTime(Date.now() + 270_000);
        return { humanReadable: 'h', machineReadable: {} };
      });

      const { result } = await call(x402Ctx(settle));

      expect(result.structuredContent).toMatchObject({ error: 'generation_timeout' });
      expect(settle).not.toHaveBeenCalled();
      expect(storeContract).not.toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({ event_type: 'x402_generation_failed_not_settled', details: expect.objectContaining({ reason: 'deadline' }) }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the refund note only when the insert fails after settle', async () => {
    const settle = vi.fn().mockResolvedValue({ ok: true, txHash: TX_HASH, payerWallet: PAYER, headers: {} });
    storeContract.mockRejectedValue(new Error('db down'));

    const { result } = await call(x402Ctx(settle));

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('support will refund it');
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'x402_settled_no_contract' }));
  });

  it('maps a usage-limit error to generation_unavailable with retry_after and no upstream text, then refuses early', async () => {
    const settle = vi.fn();
    generateContract.mockRejectedValue(USAGE_LIMIT_ERROR);

    const first = await call(x402Ctx(settle));
    expect(first.result.isError).toBe(true);
    expect(first.result.structuredContent).toMatchObject({ error: 'generation_unavailable', retry_after: 86400 });
    expect(JSON.stringify(first.result)).not.toMatch(/usage limits|req_SECRET123/i);
    expect(settle).not.toHaveBeenCalled();

    // Guard is armed: the next call is refused before anything else happens.
    generateContract.mockClear();
    const second = await call(x402Ctx(settle));
    expect(second.result.structuredContent).toMatchObject({ error: 'generation_unavailable' });
    expect(generateContract).not.toHaveBeenCalled();
    expect(settle).not.toHaveBeenCalled();
  });
});

describe('MCP ambr_create_contract party wallets', () => {
  const W = '0x' + 'd'.repeat(40);

  async function callWith(args: Record<string, unknown>, settle: () => Promise<unknown>) {
    const { handleMcpMessage } = await import('../server');
    const body = createCall();
    body.params.arguments = { ...body.params.arguments, ...args } as typeof body.params.arguments;
    const res = await handleMcpMessage(body, undefined, x402Ctx(settle) as never);
    return res?.result as { content: { text: string }[]; isError?: boolean; structuredContent?: Record<string, unknown> };
  }

  it('rejects the same wallet on both sides before generating, settling or storing', async () => {
    const settle = vi.fn();
    const result = await callWith({ principal_wallet: W, parameters: { provider_agent_id: W } }, settle);

    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error).toBe('same_wallet_both_parties');
    expect(settle).not.toHaveBeenCalled();
    expect(generateContract).not.toHaveBeenCalled();
    expect(storeContract).not.toHaveBeenCalled();
  });

  it('passes principalWallet and isOneSided to storeContract', async () => {
    const settle = vi.fn().mockResolvedValue({ ok: true, txHash: TX_HASH, payerWallet: PAYER, headers: {} });
    const result = await callWith({ principal_wallet: W, parameters: { provider_agent_id: '0x' + 'e'.repeat(40) } }, settle);

    expect(result.isError).toBeUndefined();
    expect(storeContract).toHaveBeenCalledWith(expect.objectContaining({ principalWallet: W, isOneSided: false }));
  });

  it('rejects a principal_wallet that is not an address', async () => {
    const result = await callWith({ principal_wallet: 'nope' }, vi.fn());
    expect(result.isError).toBe(true);
    expect(generateContract).not.toHaveBeenCalled();
  });
});

describe('MCP ambr_create_contract one-sided templates and the deadline clock', () => {
  const W = '0x' + 'd'.repeat(40);

  async function callRaw(args: Record<string, unknown>, settle: () => Promise<unknown>, startedAt?: number) {
    const { handleMcpMessage } = await import('../server');
    const body = createCall();
    body.params.arguments = { ...body.params.arguments, ...args } as typeof body.params.arguments;
    const res = await handleMcpMessage(body, undefined, x402Ctx(settle) as never, startedAt);
    return res?.result as { content: { text: string }[]; isError?: boolean; structuredContent?: Record<string, unknown> };
  }

  it('rejects a one-sided template with no signer wallet before generating or settling', async () => {
    tplRow = { ...tplRow, is_one_sided: true };
    const settle = vi.fn();
    const result = await callRaw({ parameters: { agent_id: W } }, settle);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('principal_wallet_required');
    expect(generateContract).not.toHaveBeenCalled();
    expect(settle).not.toHaveBeenCalled();
  });

  it('stores principal_agent_id as the principal wallet for a one-sided template', async () => {
    tplRow = { ...tplRow, is_one_sided: true };
    const settle = vi.fn().mockResolvedValue({ ok: true, txHash: TX_HASH, payerWallet: PAYER, headers: {} });
    const result = await callRaw({ parameters: { principal_agent_id: W } }, settle);
    expect(result.isError).toBeUndefined();
    expect(storeContract).toHaveBeenCalledWith(expect.objectContaining({ principalWallet: W, isOneSided: true }));
  });

  it('counts the pre-settle deadline from the route start time, not the handler start', async () => {
    const settle = vi.fn();
    // The route started 270 s ago (payment verification was slow): past maxDuration - 35 s.
    const result = await callRaw({ parameters: { service: 'x' } }, settle, Date.now() - 270_000);
    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error).toBe('generation_timeout');
    expect(settle).not.toHaveBeenCalled();
    expect(storeContract).not.toHaveBeenCalled();
  });

  it('settles when the route start time leaves enough room', async () => {
    const settle = vi.fn().mockResolvedValue({ ok: true, txHash: TX_HASH, payerWallet: PAYER, headers: {} });
    const result = await callRaw({ parameters: { service: 'x' } }, settle, Date.now() - 20_000);
    expect(result.isError).toBeUndefined();
    expect(settle).toHaveBeenCalledTimes(1);
  });
});

describe('MCP ambr_create_contract stores the template category as contract_type', () => {
  it('passes templates.category to storeContract', async () => {
    tplRow = { ...tplRow, category: 'delegation' };
    const settle = vi.fn().mockResolvedValue({ ok: true, txHash: TX_HASH, payerWallet: PAYER, headers: {} });
    const { result } = await call(x402Ctx(settle));
    expect(result.isError).toBeUndefined();
    expect(storeContract).toHaveBeenCalledWith(expect.objectContaining({ contractType: 'delegation' }));
  });
});
