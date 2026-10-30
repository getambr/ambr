import { describe, it, expect } from 'vitest';
import { buildDeployRequestBody, NO_AGENT_WALLET, signerNotice } from '../request';

const A = '0x' + 'a'.repeat(40); // the wallet the user chose for their own side
const B = '0x' + 'b'.repeat(40); // the agent / counterparty
const BROWSER = '0x' + 'c'.repeat(40); // the wallet connected in the browser

function body(template: string, params: Record<string, unknown>, effectiveWallet: string | null = BROWSER) {
  return buildDeployRequestBody({ template, params, effectiveWallet, userEmail: 'u@example.com', draftId: 'draft-1' });
}

describe('buildDeployRequestBody wallets', () => {
  it('P2: the principal wallet is the one the user chose, not the connected wallet; the agent is the declaration agent', () => {
    const out = body('p2-power-of-attorney', { principal_agent_id: A, agent_id: B });
    expect(out.principal_wallet).toBe(A);
    expect(out.principal_declaration.agent_id).toBe(B);
  });

  it('P2: an empty own-wallet parameter falls back to the connected wallet', () => {
    const out = body('p2-power-of-attorney', { principal_agent_id: '', agent_id: B });
    expect(out.principal_wallet).toBe(BROWSER);
    expect(out.principal_declaration.agent_id).toBe(B);
  });

  it('an own-wallet parameter that is not an address or is the zero address falls back to the connected wallet', () => {
    expect(body('p2-power-of-attorney', { principal_agent_id: 'my wallet', agent_id: B }).principal_wallet).toBe(BROWSER);
    expect(body('p2-power-of-attorney', { principal_agent_id: NO_AGENT_WALLET, agent_id: B }).principal_wallet).toBe(BROWSER);
  });

  it('sends no principal wallet when none is named anywhere', () => {
    expect(body('p2-power-of-attorney', { agent_id: B }, null).principal_wallet).toBeNull();
  });

  it('never puts the principal wallet in the agent slot when no agent is named', () => {
    const out = body('p2-power-of-attorney', { principal_agent_id: A });
    expect(out.principal_declaration.agent_id).toBe(NO_AGENT_WALLET);
    expect(out.principal_declaration.agent_id).not.toBe(out.principal_wallet);
  });

  it('D1: principal_agent_id is the principal, agent_id the agent', () => {
    const out = body('d1-general-auth', { principal_agent_id: A, agent_id: B });
    expect(out.principal_wallet).toBe(A);
    expect(out.principal_declaration.agent_id).toBe(B);
  });

  it('A1: consumer_agent_id is the principal; the provider is never declared as the principal agent', () => {
    const out = body('a1-service-purchase', { consumer_agent_id: A, provider_agent_id: B });
    expect(out.principal_wallet).toBe(A);
    expect(out.principal_declaration.agent_id).toBe(NO_AGENT_WALLET);

    const noConsumer = body('a1-service-purchase', { provider_agent_id: B });
    expect(noConsumer.principal_wallet).toBe(BROWSER);
    expect(noConsumer.principal_declaration.agent_id).toBe(NO_AGENT_WALLET);

    expect(body('a1-service-purchase', { provider_agent_id: B }, null).principal_wallet).toBeNull();
  });

  it('C1 and C3 use buyer_agent_id and requester_agent_id as the principal wallet and declare no agent', () => {
    const c1 = body('c1-api-access', { buyer_agent_id: A, seller_agent_id: B });
    expect(c1.principal_wallet).toBe(A);
    expect(c1.principal_declaration.agent_id).toBe(NO_AGENT_WALLET);
    const c3 = body('c3-task-execution', { requester_agent_id: A, executor_agent_id: B });
    expect(c3.principal_wallet).toBe(A);
    expect(c3.principal_declaration.agent_id).toBe(NO_AGENT_WALLET);
  });

  it('a template the map does not know takes the first principal-side parameter present', () => {
    expect(body('c2-compute-sla', { client_agent_id: A, provider_agent_id: B }).principal_wallet).toBe(A);
  });

  it('passes the parameters through untouched', () => {
    const params = { principal_agent_id: A, agent_id: B, duration_months: 1 };
    expect(body('p2-power-of-attorney', params).parameters).toBe(params);
  });
});

describe('buildDeployRequestBody declaration and envelope', () => {
  it('names the principal from the parameters, then the account email', () => {
    expect(body('p2-power-of-attorney', { principal_name: 'Acme', principal_type: 'company' }).principal_declaration).toMatchObject({
      principal_name: 'Acme',
      principal_type: 'company',
    });
    expect(body('a1-service-purchase', { consumer_name: 'Pat' }).principal_declaration.principal_name).toBe('Pat');
    expect(body('c1-api-access', {}).principal_declaration).toMatchObject({
      principal_name: 'u@example.com',
      principal_type: 'individual',
    });
  });

  it('is a private deploy tied to the draft', () => {
    const out = body('p2-power-of-attorney', {});
    expect(out.visibility).toBe('private');
    expect(out.client_draft_id).toBe('draft-1');
  });
});

describe('signerNotice', () => {
  it('names the signer when the own-wallet field differs from the connected wallet, ignoring case', () => {
    expect(signerNotice('p2-power-of-attorney', { principal_agent_id: A }, BROWSER)).toBe(
      'This contract will be signed by 0xaaaa…aaaa, not your connected wallet.',
    );
  });

  it('is silent when the wallets match (any case), or the field is empty or invalid', () => {
    expect(signerNotice('p2-power-of-attorney', { principal_agent_id: A }, A.toUpperCase().replace('0X', '0x'))).toBeNull();
    expect(signerNotice('p2-power-of-attorney', { principal_agent_id: '' }, BROWSER)).toBeNull();
    expect(signerNotice('p2-power-of-attorney', { principal_agent_id: 'nope' }, BROWSER)).toBeNull();
  });

  it('is silent when no wallet is connected to differ from', () => {
    expect(signerNotice('p2-power-of-attorney', { principal_agent_id: A }, null)).toBeNull();
  });
});
