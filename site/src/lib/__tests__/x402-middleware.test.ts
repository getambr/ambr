import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  decodePaymentRequiredHeader,
  encodePaymentSignatureHeader,
} from '@x402/core/http';

const NETWORK = 'eip155:84532';
const PAY_TO = '0x' + '1'.repeat(40);
const PAYER = '0x' + 'a'.repeat(40);
const TX_HASH = '0x' + 'ab'.repeat(32);
// USDC on Base Sepolia, shipped as a default asset by @x402/evm
const SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

const insert = vi.fn();
const facilitator = {
  getSupported: vi.fn(),
  verify: vi.fn(),
  settle: vi.fn(),
};

vi.mock('@/lib/api-auth', () => ({ validateApiKey: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({ from: () => ({ insert }) }),
}));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/velocity', () => ({ checkVelocity: vi.fn().mockResolvedValue({ allowed: true }) }));
vi.mock('../x402/pricing', () => ({
  getTemplatePrice: vi.fn().mockResolvedValue(200000n), // 20 cents
  getAllPrices: vi.fn().mockResolvedValue({ 'a1-service-purchase': '$0.20' }),
}));
vi.mock('../x402/facilitator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../x402/facilitator')>()),
  createFacilitatorClient: vi.fn(async () => facilitator),
}));

function post(headers: Record<string, string> = {}) {
  return new Request('https://getamber.dev/api/v1/contracts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: '{}',
  });
}

type AnyResult = Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function load() {
  vi.resetModules();
  const mod = await import('../x402/middleware');
  return {
    authenticateRequest: mod.authenticateRequest as (r: Request, s?: string) => AnyResult,
    DISCOVERY_DESCRIPTION: mod.DISCOVERY_DESCRIPTION,
  };
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_WALLET_ADDRESS', PAY_TO);
  vi.stubEnv('X402_NETWORK', NETWORK);
  vi.stubEnv('X402_FACILITATOR_URL', 'https://facilitator.test');
  insert.mockReset().mockResolvedValue({ error: null });
  facilitator.getSupported.mockReset().mockResolvedValue({
    kinds: [{ x402Version: 2, scheme: 'exact', network: NETWORK }],
    extensions: [],
    signers: { 'eip155:*': [PAYER] },
  });
  facilitator.verify.mockReset().mockResolvedValue({ isValid: true, payer: PAYER });
  facilitator.settle.mockReset().mockResolvedValue({
    success: true,
    transaction: TX_HASH,
    network: NETWORK,
    payer: PAYER,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function challengeRequirements(authenticateRequest: (r: Request, s?: string) => AnyResult) {
  const res = await authenticateRequest(post(), 'a1-service-purchase');
  const required = decodePaymentRequiredHeader(res.challenge.headers['PAYMENT-REQUIRED']);
  return { res, required };
}

describe('x402 v2 authenticateRequest', () => {
  it('answers a keyless, unsigned request with 402 and a PAYMENT-REQUIRED header', async () => {
    const { authenticateRequest } = await load();
    const { res, required } = await challengeRequirements(authenticateRequest);

    expect(res.challenge.status).toBe(402);
    expect(res.challenge.body.error).toBe('payment_required');
    expect(res.challenge.body.message).toContain('PAYMENT-SIGNATURE');

    expect(required.x402Version).toBe(2);
    expect(required.resource.url).toBe('https://getamber.dev/api/v1/contracts');
    const [accept] = required.accepts;
    expect(accept.scheme).toBe('exact');
    expect(accept.network).toBe(NETWORK);
    expect(accept.asset).toBe(SEPOLIA_USDC);
    expect(accept.payTo).toBe(PAY_TO);
    expect(accept.amount).toBe('200000'); // $0.20 in USDC base units
    // the contract-creation resource is declared to the Bazaar index
    expect(required.extensions).toHaveProperty('bazaar');
    expect(facilitator.verify).not.toHaveBeenCalled();
  });

  it('lists the contract resource under the Ambr name with one description for every template', async () => {
    const { authenticateRequest, DISCOVERY_DESCRIPTION } = await load();
    const { required } = await challengeRequirements(authenticateRequest);

    expect(required.resource.description).toBe(DISCOVERY_DESCRIPTION);
    expect(DISCOVERY_DESCRIPTION).toContain('Ambr');
    expect(DISCOVERY_DESCRIPTION.length).toBeLessThanOrEqual(500);
    expect(required.resource.serviceName).toBe('Ambr');
    expect(required.resource.tags).toContain('contracts');
    expect(required.resource.tags!.length).toBeLessThanOrEqual(5);
    expect(required.resource.iconUrl).toBe('https://getamber.dev/icon-512.png');

    const other = await authenticateRequest(post(), 'd1-general-auth');
    const otherRequired = decodePaymentRequiredHeader(other.challenge!.headers['PAYMENT-REQUIRED']);
    expect(otherRequired.resource.description).toBe(DISCOVERY_DESCRIPTION);
  });

  it('verifies a signed payment but settles only when the route calls settle()', async () => {
    const { authenticateRequest } = await load();
    const { required } = await challengeRequirements(authenticateRequest);

    const signature = encodePaymentSignatureHeader({
      x402Version: 2,
      resource: required.resource,
      accepted: required.accepts[0],
      payload: { authorization: { from: PAYER }, signature: '0xsig' },
    });
    const res = await authenticateRequest(
      post({ 'PAYMENT-SIGNATURE': signature }),
      'a1-service-purchase',
    );

    // verified, NOT settled: no money has moved and nothing is recorded yet
    expect(res.challenge).toBeUndefined();
    expect(res.auth).toMatchObject({ type: 'x402', payerWallet: PAYER, amountUsdc: 0.2 });
    expect(res.auth.txHash).toBeUndefined();
    expect(facilitator.verify).toHaveBeenCalledTimes(1);
    expect(facilitator.settle).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();

    const settled = await res.auth.settle();
    expect(settled).toMatchObject({ ok: true, txHash: TX_HASH, payerWallet: PAYER });
    expect(settled.headers).toHaveProperty('PAYMENT-RESPONSE');
    // settle() is idempotent: a second call does not move money twice
    await res.auth.settle();
    expect(facilitator.settle).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tx_hash: TX_HASH,
        payer_wallet: PAYER,
        amount_usdc: 0.2,
        template_slug: 'a1-service-purchase',
        network: NETWORK,
        resource: 'https://getamber.dev/api/v1/contracts',
      }),
    );
  });

  it('returns 402 and settles nothing when the facilitator rejects the payment', async () => {
    facilitator.verify.mockResolvedValue({ isValid: false, invalidReason: 'invalid_signature' });
    const { authenticateRequest } = await load();
    const { required } = await challengeRequirements(authenticateRequest);

    const signature = encodePaymentSignatureHeader({
      x402Version: 2,
      resource: required.resource,
      accepted: required.accepts[0],
      payload: { authorization: { from: PAYER }, signature: '0xbad' },
    });
    const res = await authenticateRequest(
      post({ 'PAYMENT-SIGNATURE': signature }),
      'a1-service-purchase',
    );

    expect(res.auth).toBeUndefined();
    expect(res.challenge.status).toBe(402);
    expect(res.challenge.headers['PAYMENT-REQUIRED']).toBeTruthy();
    expect(res.challenge.body.reason).toBe('invalid_signature');
    expect(facilitator.settle).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('returns a 402 challenge from settle() when the facilitator refuses to settle', async () => {
    facilitator.settle.mockResolvedValue({
      success: false,
      errorReason: 'invalid_exact_evm_insufficient_balance',
      transaction: '',
      network: NETWORK,
    });
    const { authenticateRequest } = await load();
    const { required } = await challengeRequirements(authenticateRequest);
    const signature = encodePaymentSignatureHeader({
      x402Version: 2,
      resource: required.resource,
      accepted: required.accepts[0],
      payload: { authorization: { from: PAYER }, signature: '0xsig' },
    });
    const res = await authenticateRequest(post({ 'PAYMENT-SIGNATURE': signature }), 'a1-service-purchase');

    const settled = await res.auth.settle();
    expect(settled.ok).toBe(false);
    expect(settled.challenge.status).toBe(402);
    expect(settled.reason).toBe('invalid_exact_evm_insufficient_balance');
    expect(settled.ambiguous).toBeUndefined(); // allowlisted pre-broadcast code, no transaction: nothing moved
    expect(insert).not.toHaveBeenCalled();
  });

  it.each([
    ['a raw facilitator error text', () => facilitator.settle.mockResolvedValue({ success: false, errorReason: 'Facilitator settle failed (502): bad gateway', transaction: '', network: NETWORK })],
    ['settlement_pending (broadcast, unconfirmed)', () => facilitator.settle.mockResolvedValue({ success: false, errorReason: 'settlement_pending', transaction: '', network: NETWORK })],
    ['an unexpected_settle_error coded 5xx body', () => facilitator.settle.mockResolvedValue({ success: false, errorReason: 'unexpected_settle_error', transaction: '', network: NETWORK })],
    ['an unknown snake_case code', () => facilitator.settle.mockResolvedValue({ success: false, errorReason: 'some_new_code', transaction: '', network: NETWORK })],
    ['a declined code that carries a transaction hash', () => facilitator.settle.mockResolvedValue({ success: false, errorReason: 'invalid_exact_evm_insufficient_balance', transaction: TX_HASH, network: NETWORK })],
    ['a post-broadcast code (transaction_failed)', () => facilitator.settle.mockResolvedValue({ success: false, errorReason: 'invalid_exact_evm_transaction_failed', transaction: '', network: NETWORK })],
    ['a rejected facilitator call', () => facilitator.settle.mockRejectedValue(new Error('socket hang up'))],
  ])('flags settle as ambiguous, with the nonce, on %s', async (_label, arrange) => {
    arrange();
    const { authenticateRequest } = await load();
    const { required } = await challengeRequirements(authenticateRequest);
    const signature = encodePaymentSignatureHeader({
      x402Version: 2,
      resource: required.resource,
      accepted: required.accepts[0],
      payload: { authorization: { from: PAYER, nonce: '0xnonce1' }, signature: '0xsig' },
    });
    const res = await authenticateRequest(post({ 'PAYMENT-SIGNATURE': signature }), 'a1-service-purchase');

    const settled = await res.auth.settle();
    expect(settled).toMatchObject({ ok: false, ambiguous: true, nonce: '0xnonce1' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('denies a verified payment whose payer cannot be identified', async () => {
    const { authenticateRequest } = await load();
    const { required } = await challengeRequirements(authenticateRequest);
    const signature = encodePaymentSignatureHeader({
      x402Version: 2,
      resource: required.resource,
      accepted: required.accepts[0],
      payload: { signature: '0xsig' },
    });
    const res = await authenticateRequest(post({ 'PAYMENT-SIGNATURE': signature }), 'a1-service-purchase');

    expect(res.auth).toBeUndefined();
    expect(res.challenge.status).toBe(402);
    expect(res.challenge.body.reason).toBe('payer_unknown');
    expect(facilitator.settle).not.toHaveBeenCalled();
  });

  it('rejects an unknown template with 404 and builds no challenge', async () => {
    const { authenticateRequest } = await load();
    const pricing = await import('../x402/pricing');
    vi.mocked(pricing.getTemplatePrice).mockResolvedValueOnce(null);

    const res = await authenticateRequest(post(), 'no-such-template');

    expect(res.auth).toBeUndefined();
    expect(res.challenge.status).toBe(404);
    expect(res.challenge.body.error).toBe('unknown_template');
    expect(res.challenge.headers['PAYMENT-REQUIRED']).toBeUndefined();
    expect(facilitator.getSupported).not.toHaveBeenCalled();
    expect(facilitator.verify).not.toHaveBeenCalled();
  });

  it('rejects a request with no template slug the same way', async () => {
    const { authenticateRequest } = await load();
    const res = await authenticateRequest(post(), undefined);

    expect(res.challenge.status).toBe(404);
    expect(res.challenge.headers['PAYMENT-REQUIRED']).toBeUndefined();
  });

  it('refuses a testnet network in production unless X402_ALLOW_TESTNET=1', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('X402_NETWORK', 'eip155:84532');
    const { authenticateRequest } = await load();

    const blocked = await authenticateRequest(post(), 'a1-service-purchase');
    expect(blocked.challenge.status).toBe(503);
    expect(blocked.challenge.headers['PAYMENT-REQUIRED']).toBeUndefined();

    vi.stubEnv('X402_ALLOW_TESTNET', '1');
    const allowed = await authenticateRequest(post(), 'a1-service-purchase');
    expect(allowed.challenge.status).toBe(402);
  });

  it('fails closed with 503 when the facilitator URL is malformed', async () => {
    vi.stubEnv('X402_FACILITATOR_URL', 'not a url');
    const { authenticateRequest } = await load();
    const res = await authenticateRequest(post(), 'a1-service-purchase');

    expect(res.challenge.status).toBe(503);
  });

  it('fails closed with 503 in production when no facilitator is configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('X402_FACILITATOR_URL', '');
    vi.stubEnv('X402_NETWORK', '');
    const { authenticateRequest } = await load();
    const res = await authenticateRequest(post(), 'a1-service-purchase');

    expect(res.auth).toBeUndefined();
    expect(res.challenge.status).toBe(503);
    expect(res.challenge.body.error).toBe('payment_unavailable');
    expect(res.challenge.headers['PAYMENT-REQUIRED']).toBeUndefined();
    expect(facilitator.getSupported).not.toHaveBeenCalled();
  });
});
