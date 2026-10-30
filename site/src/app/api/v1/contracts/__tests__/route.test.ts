import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearProviderUnavailable, getProviderUnavailableSeconds } from '@/lib/llm/availability';

const PAYER = '0x' + 'a'.repeat(40);
const TX_HASH = '0x' + 'ab'.repeat(32);

let templateRow: Record<string, unknown> | null;

const authenticateRequest = vi.fn();
const buildPaymentChallenge = vi.fn();
const linkPaymentToContract = vi.fn();
const generateContract = vi.fn();
const decrementCredits = vi.fn();
const grantCredits = vi.fn();
const storeContract = vi.fn();
const logAudit = vi.fn();
const accountPrincipalWallet = vi.fn();

// The creating account's proven wallet (lib/contract/account-wallets.ts has its own tests).
vi.mock('@/lib/contract/account-wallets', () => ({
  accountPrincipalWallet: (...a: unknown[]) => accountPrincipalWallet(...a),
}));
vi.mock('@/lib/x402/middleware', () => ({
  authenticateRequest: (...a: unknown[]) => authenticateRequest(...a),
  buildPaymentChallenge: (...a: unknown[]) => buildPaymentChallenge(...a),
  linkPaymentToContract: (...a: unknown[]) => linkPaymentToContract(...a),
}));
vi.mock('@/lib/llm/generate-contract', () => ({
  generateContract: (...a: unknown[]) => generateContract(...a),
}));
vi.mock('@/lib/contract-engine', () => ({
  hashContract: () => 'hash',
  generateContractId: async () => 'AMB-2026-0001',
  storeContract: (...a: unknown[]) => storeContract(...a),
  decrementCredits: (...a: unknown[]) => decrementCredits(...a),
  grantCredits: (...a: unknown[]) => grantCredits(...a),
}));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
// The x402 cases share one payer wallet; the 10/min limit is not under test here.
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ allowed: true, resetAt: 0 }),
  getClientIp: () => '127.0.0.1',
}));
vi.mock('@/lib/api-auth', () => ({ validateApiKey: vi.fn().mockResolvedValue(null) }));
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
vi.mock('@/lib/supabase-admin', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    single: async () => ({ data: templateRow }),
    insert: async () => ({ error: null }),
  };
  return { getSupabaseAdmin: () => ({ from: () => chain }) };
});

const validBody = {
  template: 'a1-service-purchase',
  parameters: { service: 'x' },
  principal_declaration: { agent_id: PAYER, principal_name: 'Acme', principal_type: 'company' },
};

function post(body: unknown = validBody, headers: Record<string, string> = {}) {
  return new Request('https://getamber.dev/api/v1/contracts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function apiKeyAuth(keyId: string, credits = 1000) {
  return { auth: { type: 'api_key', keyId, credits, email: 'a@b.c' } };
}

function x402Auth(settle: () => Promise<unknown>) {
  return {
    auth: { type: 'x402', payerWallet: PAYER, amountUsdc: 0.2, resource: 'https://getamber.dev/api/v1/contracts', settle },
  };
}

async function callPost(body?: unknown, headers?: Record<string, string>) {
  const { POST } = await import('../route');
  return POST(post(body, headers));
}

// What Anthropic answers when the account hits its monthly spend cap (the shape
// of the SDK's APIError message, request id included).
const USAGE_LIMIT_ERROR = Object.assign(
  new Error(
    '400 {"type":"error","error":{"type":"invalid_request_error","message":"You have reached your specified API usage limits. You will regain access on 2999-01-01 at 00:00 UTC."},"request_id":"req_SECRET123"}',
  ),
  { status: 400 },
);

beforeEach(() => {
  clearProviderUnavailable();
  templateRow = {
    id: 'tpl-1',
    slug: 'a1-service-purchase',
    category: 'consumer',
    parameter_schema: { required: ['service'] },
    is_one_sided: false,
    price_cents: 20,
  };
  for (const m of [authenticateRequest, buildPaymentChallenge, linkPaymentToContract, generateContract, decrementCredits, grantCredits, storeContract, logAudit, accountPrincipalWallet]) {
    m.mockReset();
  }
  accountPrincipalWallet.mockResolvedValue(null);
  buildPaymentChallenge.mockResolvedValue({ status: 402, headers: {}, body: { error: 'payment_required' } });
  generateContract.mockResolvedValue({ humanReadable: 'h', machineReadable: {} });
  storeContract.mockResolvedValue({ id: 'row-1', contract_id: 'AMB-2026-0001', sha256_hash: 'hash', status: 'draft', created_at: 'now' });
});

describe('POST /api/v1/contracts credits: burn before generate', () => {
  it('answers 402 insufficient_credits and never generates when the burn finds too little', async () => {
    authenticateRequest.mockResolvedValue(apiKeyAuth('key-burn-null'));
    decrementCredits.mockResolvedValue(null); // lost the race after the pre-check passed

    const res = await callPost();
    const body = await res.json();

    expect(res.status).toBe(402);
    expect(body.error).toBe('insufficient_credits');
    expect(body.required).toBe(20);
    expect(decrementCredits).toHaveBeenCalledWith('key-burn-null', 20);
    expect(generateContract).not.toHaveBeenCalled();
    expect(storeContract).not.toHaveBeenCalled();
  });

  it('burns before generating and returns the new balance', async () => {
    authenticateRequest.mockResolvedValue(apiKeyAuth('key-happy'));
    decrementCredits.mockResolvedValue(980);

    const res = await callPost();
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.credits_remaining).toBe(980);
    expect(decrementCredits.mock.invocationCallOrder[0]).toBeLessThan(
      generateContract.mock.invocationCallOrder[0],
    );
    expect(grantCredits).not.toHaveBeenCalled();
  });

  it('refunds the same amount and audits when generation throws after the burn', async () => {
    authenticateRequest.mockResolvedValue(apiKeyAuth('key-gen-fails'));
    decrementCredits.mockResolvedValue(980);
    generateContract.mockRejectedValue(new Error('llm down'));
    grantCredits.mockResolvedValue(1000);

    const res = await callPost();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('generation_failed');
    expect(JSON.stringify(body)).not.toContain('llm down');
    expect(grantCredits).toHaveBeenCalledWith('key-gen-fails', 20);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'credits_refunded_generation_failed',
        details: expect.objectContaining({ error_message: 'llm down' }),
      }),
    );
  });
});

describe('POST /api/v1/contracts x402: settle only after the cheap checks and a successful generation', () => {
  it('does not settle when the template is unknown', async () => {
    const settle = vi.fn();
    authenticateRequest.mockResolvedValue(x402Auth(settle));
    templateRow = null;

    const res = await callPost();

    expect(res.status).toBe(404);
    expect(settle).not.toHaveBeenCalled();
    expect(generateContract).not.toHaveBeenCalled();
  });

  it('does not settle when required parameters are missing', async () => {
    const settle = vi.fn();
    authenticateRequest.mockResolvedValue(x402Auth(settle));

    const res = await callPost({ ...validBody, parameters: {} });

    expect(res.status).toBe(400);
    expect(settle).not.toHaveBeenCalled();
    expect(generateContract).not.toHaveBeenCalled();
  });

  it('generates, then settles exactly once, then stores, and echoes PAYMENT-RESPONSE', async () => {
    const settle = vi.fn().mockResolvedValue({
      ok: true,
      txHash: TX_HASH,
      payerWallet: PAYER,
      headers: { 'PAYMENT-RESPONSE': 'receipt' },
    });
    authenticateRequest.mockResolvedValue(x402Auth(settle));

    const res = await callPost();

    expect(res.status).toBe(201);
    expect(res.headers.get('PAYMENT-RESPONSE')).toBe('receipt');
    expect(settle).toHaveBeenCalledTimes(1);
    expect(generateContract.mock.invocationCallOrder[0]).toBeLessThan(settle.mock.invocationCallOrder[0]);
    expect(settle.mock.invocationCallOrder[0]).toBeLessThan(storeContract.mock.invocationCallOrder[0]);
    expect(storeContract).toHaveBeenCalledWith(expect.objectContaining({ payerWallet: PAYER }));
    expect(linkPaymentToContract).toHaveBeenCalledWith(TX_HASH, 'row-1');
    expect(decrementCredits).not.toHaveBeenCalled();
  });

  it('still returns 201 with the contract id when a post-store step throws', async () => {
    const settle = vi.fn().mockResolvedValue({ ok: true, txHash: TX_HASH, payerWallet: PAYER, headers: {} });
    authenticateRequest.mockResolvedValue(x402Auth(settle));
    linkPaymentToContract.mockRejectedValue(new Error('db down'));

    const res = await callPost();
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.contract_id).toBeDefined();
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'post_store_step_failed' }));
    expect(logAudit).not.toHaveBeenCalledWith(expect.objectContaining({ event_type: 'x402_settled_no_contract' }));
  });

  it('discards the contract, stores nothing and answers 402 when settlement fails after generation', async () => {
    const settle = vi.fn().mockResolvedValue({
      ok: false,
      reason: 'insufficient_funds',
      challenge: { status: 402, headers: { 'PAYMENT-REQUIRED': 'old' }, body: { error: 'payment_required' } },
    });
    authenticateRequest.mockResolvedValue(x402Auth(settle));
    buildPaymentChallenge.mockResolvedValue({
      status: 402,
      headers: { 'PAYMENT-REQUIRED': 'fresh' },
      body: { error: 'payment_required', x402: { version: 2 } },
    });

    const res = await callPost();
    const body = await res.json();

    expect(res.status).toBe(402);
    expect(res.headers.get('PAYMENT-REQUIRED')).toBe('fresh');
    expect(res.headers.get('PAYMENT-RESPONSE')).toBeNull();
    expect(body.error).toBe('payment_settlement_failed');
    expect(body.reason).toBe('insufficient_funds');
    expect(logAudit.mock.calls.filter(([a]) => a.event_type === 'x402_settle_failed')).toHaveLength(1);
    expect(generateContract).toHaveBeenCalledTimes(1);
    expect(storeContract).not.toHaveBeenCalled();
    expect(linkPaymentToContract).not.toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'x402_settle_failed',
        details: expect.objectContaining({
          payer: PAYER,
          template: 'a1-service-purchase',
          amount_usdc: 0.2,
          reason: 'insufficient_funds',
          money_moved: false,
        }),
      }),
    );
  });

  it('does not settle when generation fails, and never promises a refund', async () => {
    const settle = vi.fn();
    authenticateRequest.mockResolvedValue(x402Auth(settle));
    generateContract.mockRejectedValue(new Error('llm down'));

    const res = await callPost();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('generation_failed');
    expect(JSON.stringify(body)).not.toMatch(/refund|llm down/i);
    expect(settle).not.toHaveBeenCalled();
    expect(storeContract).not.toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'x402_generation_failed_not_settled',
        details: expect.objectContaining({ payer: PAYER, money_moved: false, error_message: 'llm down' }),
      }),
    );
    expect(logAudit).not.toHaveBeenCalledWith(expect.objectContaining({ event_type: 'x402_settled_no_contract' }));
  });

  it('keeps the x402_settled_no_contract audit and refund note when the insert fails after settle', async () => {
    const settle = vi.fn().mockResolvedValue({ ok: true, txHash: TX_HASH, payerWallet: PAYER, headers: {} });
    authenticateRequest.mockResolvedValue(x402Auth(settle));
    storeContract.mockRejectedValue(new Error('db down'));

    const res = await callPost();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.message).toContain('Support will refund');
    expect(body.payment_tx).toBe(TX_HASH);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'x402_settled_no_contract',
        details: expect.objectContaining({
          tx_hash: TX_HASH,
          payer: PAYER,
          amount_usdc: 0.2,
          resource: 'https://getamber.dev/api/v1/contracts',
        }),
      }),
    );
  });
});

describe('POST /api/v1/contracts x402: ambiguous settlement and the deadline', () => {
  it('answers 503 payment_status_unknown, audits once with the nonce, and stores nothing when settle is ambiguous', async () => {
    const settle = vi.fn().mockResolvedValue({
      ok: false,
      ambiguous: true,
      nonce: '0xnonce1',
      reason: 'Facilitator settle failed (502): <html>upstream secret</html>',
      challenge: { status: 503, headers: {}, body: {} },
    });
    authenticateRequest.mockResolvedValue(x402Auth(settle));

    const res = await callPost();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toBe('payment_status_unknown');
    expect(body.nonce).toBe('0xnonce1');
    expect(body.message).toMatch(/do not pay again/i);
    expect(JSON.stringify(body)).not.toMatch(/upstream secret|502/);
    expect(buildPaymentChallenge).not.toHaveBeenCalled();
    expect(storeContract).not.toHaveBeenCalled();
    const rows = logAudit.mock.calls.filter(([a]) => /^x402_settle/.test(a.event_type));
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toMatchObject({
      event_type: 'x402_settle_failed',
      details: { money_moved: 'unknown', nonce: '0xnonce1', payer: PAYER, amount_usdc: 0.2 },
    });
  });

  it('never puts a non-coded reason in the 402 body', async () => {
    const settle = vi.fn().mockResolvedValue({
      ok: false,
      reason: 'Facilitator settle failed (502): excerpt',
      challenge: { status: 402, headers: {}, body: {} },
    });
    authenticateRequest.mockResolvedValue(x402Auth(settle));

    const res = await callPost();
    const body = await res.json();

    expect(res.status).toBe(402);
    expect(body.error).toBe('payment_settlement_failed');
    expect(body.reason).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('excerpt');
  });

  it('skips settle past the deadline, discards the contract and audits reason deadline', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const settle = vi.fn();
      authenticateRequest.mockResolvedValue(x402Auth(settle));
      generateContract.mockImplementation(async () => {
        vi.setSystemTime(Date.now() + 270_000); // 300 s function, 35 s margin
        return { humanReadable: 'h', machineReadable: {} };
      });

      const res = await callPost();
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body.error).toBe('generation_timeout');
      expect(res.headers.get('Retry-After')).toBe('30');
      expect(settle).not.toHaveBeenCalled();
      expect(storeContract).not.toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'x402_generation_failed_not_settled',
          details: expect.objectContaining({ reason: 'deadline', money_moved: false }),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('POST /api/v1/contracts provider usage limit', () => {
  it('answers 503 generation_unavailable with Retry-After, no upstream text, and does not settle', async () => {
    const settle = vi.fn();
    authenticateRequest.mockResolvedValue(x402Auth(settle));
    generateContract.mockRejectedValue(USAGE_LIMIT_ERROR);

    const res = await callPost();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toBe('generation_unavailable');
    expect(body.retry_after).toBe(86400); // regain-access date is far away: capped at 24h
    expect(res.headers.get('Retry-After')).toBe('86400');
    expect(JSON.stringify(body)).not.toMatch(/usage limits|req_SECRET123|Anthropic/i);
    expect(settle).not.toHaveBeenCalled();
    expect(getProviderUnavailableSeconds()).not.toBeNull();
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'x402_generation_failed_not_settled',
        details: expect.objectContaining({ error_message: expect.stringContaining('req_SECRET123') }),
      }),
    );
  });

  it('refunds credits and answers 503 on the credits path', async () => {
    authenticateRequest.mockResolvedValue(apiKeyAuth('key-limit'));
    decrementCredits.mockResolvedValue(980);
    grantCredits.mockResolvedValue(1000);
    generateContract.mockRejectedValue(USAGE_LIMIT_ERROR);

    const res = await callPost();

    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('generation_unavailable');
    expect(grantCredits).toHaveBeenCalledWith('key-limit', 20);
  });

  it('with the guard set, answers 503 before verifying or charging anything', async () => {
    authenticateRequest.mockResolvedValue(apiKeyAuth('key-guard'));
    generateContract.mockRejectedValueOnce(USAGE_LIMIT_ERROR);
    decrementCredits.mockResolvedValue(980);
    grantCredits.mockResolvedValue(1000);
    await callPost(); // arms the guard
    authenticateRequest.mockClear();
    decrementCredits.mockClear();
    generateContract.mockClear();

    const paid = await callPost(undefined, { 'PAYMENT-SIGNATURE': 'sig' });
    expect(paid.status).toBe(503);
    expect(paid.headers.get('Retry-After')).toBe('3600'); // guard window is capped at 1h
    expect((await paid.json()).error).toBe('generation_unavailable');
    expect(authenticateRequest).not.toHaveBeenCalled();
    expect(decrementCredits).not.toHaveBeenCalled();
    expect(generateContract).not.toHaveBeenCalled();

    const keyed = await callPost(undefined, { 'X-API-Key': 'k' });
    expect(keyed.status).toBe(503);
    expect(authenticateRequest).not.toHaveBeenCalled();

    // A bare probe still reaches the 402 challenge.
    authenticateRequest.mockResolvedValue({ challenge: { status: 402, headers: {}, body: { error: 'payment_required' } } });
    const bare = await callPost();
    expect(bare.status).toBe(402);
  });
});

describe('POST /api/v1/contracts same wallet on both sides', () => {
  const W = '0x' + 'd'.repeat(40);
  const sameWalletBody = {
    ...validBody,
    principal_wallet: W,
    parameters: { service: 'x', provider_agent_id: W },
  };

  it('answers 400 same_wallet_both_parties before verifying, burning or generating anything', async () => {
    const res = await callPost(sameWalletBody);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('same_wallet_both_parties');
    expect(body.message).toMatch(/nothing was charged/i);
    expect(authenticateRequest).not.toHaveBeenCalled();
    expect(decrementCredits).not.toHaveBeenCalled();
    expect(generateContract).not.toHaveBeenCalled();
    expect(storeContract).not.toHaveBeenCalled();
  });

  it('never verifies or settles an x402 payment for it', async () => {
    const settle = vi.fn();
    authenticateRequest.mockResolvedValue(x402Auth(settle));
    const res = await callPost(sameWalletBody);
    expect(res.status).toBe(400);
    expect(authenticateRequest).not.toHaveBeenCalled();
    expect(settle).not.toHaveBeenCalled();
  });

  it('exempts one-sided templates', async () => {
    templateRow = { ...(templateRow as Record<string, unknown>), is_one_sided: true };
    authenticateRequest.mockResolvedValue({ challenge: { status: 402, headers: {}, body: { error: 'payment_required' } } });
    const res = await callPost({ ...sameWalletBody, template: 'p2-power-of-attorney' });
    expect(res.status).toBe(402);
    expect(authenticateRequest).toHaveBeenCalled();
  });

  it('lets a contract with distinct wallets through to the payment check', async () => {
    authenticateRequest.mockResolvedValue({ challenge: { status: 402, headers: {}, body: { error: 'payment_required' } } });
    const res = await callPost({ ...sameWalletBody, parameters: { service: 'x', provider_agent_id: '0x' + 'e'.repeat(40) } });
    expect(res.status).toBe(402);
  });
});

describe('POST /api/v1/contracts one-sided template needs a signer wallet', () => {
  const oneSidedBody = {
    ...validBody,
    template: 'p2-power-of-attorney',
    parameters: { service: 'x', agent_id: '0x' + 'e'.repeat(40) },
  };

  beforeEach(() => {
    templateRow = { ...(templateRow as Record<string, unknown>), slug: 'p2-power-of-attorney', is_one_sided: true };
    authenticateRequest.mockResolvedValue({ challenge: { status: 402, headers: {}, body: { error: 'payment_required' } } });
  });

  it('answers 400 principal_wallet_required before verifying anything', async () => {
    const res = await callPost(oneSidedBody);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe('principal_wallet_required');
    expect(authenticateRequest).not.toHaveBeenCalled();
    expect(decrementCredits).not.toHaveBeenCalled();
  });

  it('a zero principal_agent_id does not count', async () => {
    const res = await callPost({ ...oneSidedBody, parameters: { ...oneSidedBody.parameters, principal_agent_id: '0x' + '0'.repeat(40) } });
    expect(res.status).toBe(400);
  });

  it('is satisfied by principal_wallet', async () => {
    const res = await callPost({ ...oneSidedBody, principal_wallet: '0x' + 'd'.repeat(40) });
    expect(res.status).toBe(402);
    expect(authenticateRequest).toHaveBeenCalled();
  });

  it('is satisfied by principal_agent_id, which then becomes the stored principal wallet', async () => {
    const signer = '0x' + 'c'.repeat(40);
    authenticateRequest.mockResolvedValue(apiKeyAuth('key-p2'));
    decrementCredits.mockResolvedValue(900);
    const res = await callPost({ ...oneSidedBody, parameters: { ...oneSidedBody.parameters, principal_agent_id: signer } });
    expect(res.status).toBe(201);
    expect(storeContract).toHaveBeenCalledWith(expect.objectContaining({ principalWallet: signer, isOneSided: true }));
  });
});

describe('POST /api/v1/contracts: the creating account declares the principal wallet', () => {
  const ACCOUNT_WALLET = '0x' + 'c'.repeat(40);
  const storedPrincipal = () => (storeContract.mock.calls[0][0] as { principalWallet: string | null }).principalWallet;

  beforeEach(() => {
    authenticateRequest.mockResolvedValue(apiKeyAuth('key-acct'));
    decrementCredits.mockResolvedValue(980);
  });

  it('a key whose account has a proven wallet makes it the principal when the request names none', async () => {
    accountPrincipalWallet.mockResolvedValue(ACCOUNT_WALLET);
    expect((await callPost()).status).toBe(201);
    expect(accountPrincipalWallet).toHaveBeenCalledWith('key-acct', PAYER);
    expect(storedPrincipal()).toBe(ACCOUNT_WALLET);
  });

  it('an account with no proven wallet leaves the principal slot open', async () => {
    expect((await callPost()).status).toBe(201);
    expect(storedPrincipal()).toBeNull();
  });

  it('never puts the account wallet on both sides', async () => {
    accountPrincipalWallet.mockResolvedValue(ACCOUNT_WALLET);
    const body = { ...validBody, parameters: { service: 'x', provider_agent_id: ACCOUNT_WALLET } };
    expect((await callPost(body)).status).toBe(201);
    expect(storedPrincipal()).toBeNull();
  });

  it('yields to a principal_wallet in the request, or a principal-side wallet in the parameters, without a lookup', async () => {
    accountPrincipalWallet.mockResolvedValue(ACCOUNT_WALLET);
    const sent = '0x' + 'd'.repeat(40);
    expect((await callPost({ ...validBody, principal_wallet: sent })).status).toBe(201);
    expect(storedPrincipal()).toBe(sent);
    expect(accountPrincipalWallet).not.toHaveBeenCalled();

    storeContract.mockClear();
    const named = { ...validBody, parameters: { service: 'x', consumer_agent_id: '0x' + 'e'.repeat(40) } };
    expect((await callPost(named)).status).toBe(201);
    expect(storedPrincipal()).toBe(null);
  });

  it('an x402 payer has no account: no lookup, principal_wallet stays what was sent', async () => {
    authenticateRequest.mockResolvedValue(x402Auth(async () => ({ ok: true, payerWallet: PAYER, txHash: TX_HASH, headers: {} })));
    expect((await callPost()).status).toBe(201);
    expect(accountPrincipalWallet).not.toHaveBeenCalled();
    expect(storedPrincipal()).toBeNull();
  });
});

describe('POST /api/v1/contracts stores the template category as contract_type', () => {
  it('passes templates.category to storeContract', async () => {
    authenticateRequest.mockResolvedValue(apiKeyAuth('key-type'));
    decrementCredits.mockResolvedValue(980);
    templateRow = { ...(templateRow as Record<string, unknown>), category: 'delegation' };
    expect((await callPost()).status).toBe(201);
    expect(storeContract).toHaveBeenCalledWith(expect.objectContaining({ contractType: 'delegation' }));
  });
});

describe('POST /api/v1/contracts next_step', () => {
  it('asks both parties to sign on a two-sided template', async () => {
    authenticateRequest.mockResolvedValue(apiKeyAuth('key-next-two'));
    decrementCredits.mockResolvedValue(980);
    const body = await (await callPost()).json();
    expect(body.next_step).toMatch(/both parties must sign/);
  });

  it('says only the principal signs on a one-sided template', async () => {
    authenticateRequest.mockResolvedValue(apiKeyAuth('key-next-one'));
    decrementCredits.mockResolvedValue(980);
    templateRow = { ...(templateRow as Record<string, unknown>), slug: 'p2-power-of-attorney', is_one_sided: true };
    const res = await callPost({
      ...validBody,
      template: 'p2-power-of-attorney',
      principal_wallet: '0x' + 'd'.repeat(40),
    });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.next_step).toMatch(/Only the principal signs/);
    expect(body.next_step).not.toMatch(/both parties/i);
  });
});
