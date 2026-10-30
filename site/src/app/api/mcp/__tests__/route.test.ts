import { describe, it, expect, vi, beforeEach } from 'vitest';

const W = '0x' + 'd'.repeat(40);

let templateRow: Record<string, unknown> | null;
const authenticateRequest = vi.fn();
const handleMcpMessage = vi.fn();

vi.mock('@/lib/x402/middleware', () => ({
  authenticateRequest: (...a: unknown[]) => authenticateRequest(...a),
}));
vi.mock('@/lib/mcp/server', () => ({
  handleMcpMessage: (...a: unknown[]) => handleMcpMessage(...a),
}));
vi.mock('@/lib/supabase-admin', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    single: async () => ({ data: templateRow }),
  };
  return { getSupabaseAdmin: () => ({ from: () => chain }) };
});

function createCall(args: Record<string, unknown>) {
  return new Request('https://getamber.dev/api/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'ambr_create_contract', arguments: args },
    }),
  });
}

async function post(args: Record<string, unknown>) {
  const { POST } = await import('../route');
  return POST(createCall(args));
}

beforeEach(() => {
  templateRow = { is_one_sided: false };
  authenticateRequest.mockReset();
  handleMcpMessage.mockReset();
  authenticateRequest.mockResolvedValue({ challenge: { status: 402, headers: {}, body: { message: 'pay' } } });
});

describe('POST /api/mcp ambr_create_contract: same wallet on both sides', () => {
  const conflict = {
    template: 'a1-service-purchase',
    principal_wallet: W,
    parameters: { provider_agent_id: W },
  };

  it('answers 400 before the payment is verified', async () => {
    const res = await post(conflict);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.id).toBe(7);
    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent.error).toBe('same_wallet_both_parties');
    expect(authenticateRequest).not.toHaveBeenCalled();
    expect(handleMcpMessage).not.toHaveBeenCalled();
  });

  it('exempts one-sided templates', async () => {
    templateRow = { is_one_sided: true };
    const res = await post({ ...conflict, template: 'p2-power-of-attorney' });
    expect(res.status).toBe(402);
    expect(authenticateRequest).toHaveBeenCalled();
  });

  it('lets distinct wallets through to the payment check', async () => {
    const res = await post({ ...conflict, parameters: { provider_agent_id: '0x' + 'e'.repeat(40) } });
    expect(res.status).toBe(402);
    expect(authenticateRequest).toHaveBeenCalled();
  });
});

describe('POST /api/mcp ambr_create_contract: one-sided template needs a signer wallet', () => {
  beforeEach(() => {
    templateRow = { is_one_sided: true };
  });

  it('answers 400 principal_wallet_required before the payment is verified', async () => {
    const res = await post({ template: 'p2-power-of-attorney', parameters: { agent_id: W } });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.result.structuredContent.error).toBe('principal_wallet_required');
    expect(authenticateRequest).not.toHaveBeenCalled();
    expect(handleMcpMessage).not.toHaveBeenCalled();
  });

  it('passes with principal_agent_id', async () => {
    const res = await post({ template: 'p2-power-of-attorney', parameters: { principal_agent_id: W, agent_id: '0x' + 'e'.repeat(40) } });
    expect(res.status).toBe(402);
    expect(authenticateRequest).toHaveBeenCalled();
  });
});

describe('POST /api/mcp deadline clock', () => {
  it('hands the handler the time the request started, before the payment was verified', async () => {
    const before = Date.now();
    authenticateRequest.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 30)); // verification takes time
      return { auth: { type: 'api_key', keyId: 'k', credits: 100, email: 'a@b.c' } };
    });
    handleMcpMessage.mockResolvedValue({ jsonrpc: '2.0', id: 7, result: { content: [] } });
    templateRow = { is_one_sided: false };

    const res = await post({ template: 'a1-service-purchase', parameters: {} });
    expect(res.status).toBe(200);

    const startedAt = handleMcpMessage.mock.calls[0][3] as number;
    expect(typeof startedAt).toBe('number');
    expect(startedAt).toBeGreaterThanOrEqual(before);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(30);
  });
});
