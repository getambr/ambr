import { describe, it, expect, vi } from 'vitest';
import { AmbrClient, PaymentRequiredError, AmbrApiError, buildSignMessage } from '../index';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ADDR = '0x' + '1'.repeat(40);
const COUNTERPARTY = '0x' + '2'.repeat(40);
const HASH = 'a'.repeat(64);

describe('AmbrClient.createAgreement', () => {
  it('maps the response and sends API key + mapped principal_declaration', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse(
        {
          contract_id: 'amb-2026-0099',
          sha256_hash: HASH,
          status: 'draft',
          visibility: 'private',
          payment_method: 'api_key',
          reader_url: `https://getamber.dev/reader/${HASH}`,
          sign_url: 'https://getamber.dev/api/v1/contracts/amb-2026-0099/sign',
          handshake_url: 'https://getamber.dev/api/v1/contracts/amb-2026-0099/handshake',
          created_at: '2026-06-17T00:00:00Z',
          credits_remaining: 24,
        },
        201,
      );
    }) as unknown as typeof fetch;

    const ambr = new AmbrClient({ apiKey: 'amb_test', fetch: fetchImpl });
    const a = await ambr.createAgreement({
      template: 'demo-template',
      parameters: { value_usd: 100 },
      principal: { agentId: ADDR, principalName: 'Acme', principalType: 'company' },
      principalWallet: ADDR,
    });

    expect(a.contractId).toBe('amb-2026-0099');
    expect(a.hash).toBe(HASH);
    expect(a.creditsRemaining).toBe(24);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://getamber.dev/api/v1/contracts');
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers['X-API-Key']).toBe('amb_test');
    const sent = JSON.parse(String(calls[0].init?.body));
    expect(sent.principal_declaration).toEqual({
      agent_id: ADDR,
      principal_name: 'Acme',
      principal_type: 'company',
    });
    expect(sent.principal_wallet).toBe(ADDR);
  });

  it('throws PaymentRequiredError on 402 and carries the payment info', async () => {
    const paymentInfo = { accepts: [{ scheme: 'x402', amount: '0.20' }] };
    const fetchImpl = (async () => jsonResponse(paymentInfo, 402)) as unknown as typeof fetch;
    const ambr = new AmbrClient({ fetch: fetchImpl });

    const err = await ambr
      .createAgreement({
        template: 't',
        parameters: {},
        principal: { agentId: ADDR, principalName: 'A', principalType: 'individual' },
      })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PaymentRequiredError);
    expect((err as PaymentRequiredError).paymentInfo).toEqual(paymentInfo);
  });

  it('throws AmbrApiError on a validation error', async () => {
    const fetchImpl = (async () =>
      jsonResponse({ error: 'validation_error', message: 'bad template' }, 400)) as unknown as typeof fetch;
    const ambr = new AmbrClient({ apiKey: 'amb_test', fetch: fetchImpl });

    await expect(
      ambr.createAgreement({
        template: '',
        parameters: {},
        principal: { agentId: ADDR, principalName: 'A', principalType: 'individual' },
      }),
    ).rejects.toBeInstanceOf(AmbrApiError);
  });
});

describe('AmbrClient.sign', () => {
  it('embeds the hash in the signed message and posts the signature (hash passed directly)', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse({
        contract_id: 'amb-2026-0099',
        signer: COUNTERPARTY,
        status: 'pending_signature',
        message: 'Contract signed successfully',
      });
    }) as unknown as typeof fetch;

    const ambr = new AmbrClient({ fetch: fetchImpl });
    const signed: string[] = [];
    const result = await ambr.sign(HASH, {
      walletAddress: COUNTERPARTY,
      signMessage: (m) => {
        signed.push(m);
        return '0xsignature';
      },
    });

    expect(result.status).toBe('pending_signature');
    // A 64-hex hash was passed directly → no status lookup → single call.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/sign');
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.wallet_address).toBe(COUNTERPARTY);
    expect(body.message).toContain(HASH);
    expect(signed[0]).toContain(HASH);
  });

  it('resolves the hash via status when given a contract id', async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(url);
      if (url.endsWith('/status')) {
        return jsonResponse({
          contract_id: 'amb-2026-0099',
          status: 'draft',
          is_currently_valid: false,
          is_expired: false,
          visibility: 'private',
          sha256_hash: HASH,
          signature_count: 0,
        });
      }
      return jsonResponse({ contract_id: 'amb-2026-0099', signer: ADDR, status: 'pending_signature', message: 'ok' });
    }) as unknown as typeof fetch;

    const ambr = new AmbrClient({ fetch: fetchImpl });
    await ambr.sign('amb-2026-0099', {
      walletAddress: ADDR,
      signMessage: () => '0xsig',
    });

    expect(urls[0]).toContain('/status');
    expect(urls[1]).toContain('/sign');
  });
});

describe('buildSignMessage', () => {
  it('embeds the hash', () => {
    expect(buildSignMessage('amb-2026-0001', HASH)).toContain(HASH);
  });
});
