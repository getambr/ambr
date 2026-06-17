import { describe, it, expect } from 'vitest';
import {
  attachAgreement,
  parseContractGated402,
  isContractGated402,
  type PaymentRequired402,
} from '../x402';

const HASH = 'a'.repeat(64);

const base402: PaymentRequired402 = {
  error: 'payment_required',
  message: 'Payment required. Send a supported token on Base, then retry with X-Payment.',
  x402: {
    version: '2',
    currency: 'USD',
    chain: 'base',
    recipient: '0x' + '9'.repeat(40),
    description: 'Create Ricardian Contract',
    accepts: ['exact', 'overpay'],
    accepted_tokens: [{ symbol: 'USDC', address: '0x' + 'a'.repeat(40), decimals: 6, stable: true }],
    pricing: { 'a2c-purchase': '0.20' },
    price: '0.20',
  },
};

describe('attachAgreement', () => {
  it('produces a contract-gated 402 that keeps payment AND adds the agreement', () => {
    const gated = attachAgreement(base402, { hash: HASH, readerUrl: `https://getamber.dev/reader/${HASH}` });

    expect(gated.x402).toEqual(base402.x402); // payment requirements preserved
    expect(gated.agreement.hash).toBe(HASH);
    expect(gated.agreement.reader_url).toBe(`https://getamber.dev/reader/${HASH}`);
    expect(gated.agreement.terms).toBeUndefined();
    expect(gated.error).toBe('payment_required');
  });

  it('includes terms when provided', () => {
    const gated = attachAgreement(
      base402,
      { hash: HASH, readerUrl: 'https://getamber.dev/reader/x' },
      { terms: { mayDo: ['purchase'], spendCapUsd: 100 } },
    );
    expect(gated.agreement.terms).toEqual({ mayDo: ['purchase'], spendCapUsd: 100 });
  });
});

describe('isContractGated402 / parseContractGated402', () => {
  it('detects and splits a contract-gated 402', () => {
    const gated = attachAgreement(base402, { hash: HASH, readerUrl: 'https://getamber.dev/reader/x' });
    expect(isContractGated402(gated)).toBe(true);

    const parsed = parseContractGated402(gated);
    expect(parsed).not.toBeNull();
    expect(parsed!.payment.chain).toBe('base');
    expect(parsed!.agreement.hash).toBe(HASH);
  });

  it('returns null / false for a plain payment-only 402', () => {
    expect(isContractGated402(base402)).toBe(false);
    expect(parseContractGated402(base402)).toBeNull();
  });

  it('returns null / false for garbage', () => {
    expect(isContractGated402(null)).toBe(false);
    expect(isContractGated402({ foo: 1 })).toBe(false);
    expect(parseContractGated402('nope')).toBeNull();
  });
});
