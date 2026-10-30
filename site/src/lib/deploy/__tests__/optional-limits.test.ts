import { describe, it, expect } from 'vitest';
import {
  CAPS_OFFER_MARKER,
  CAPS_OFFER_MESSAGE,
  capsDeclined,
  capsPhrase,
  formatLimit,
  isNoLimitValue,
  normalizeLimitParams,
  normalizeOptionalLimit,
  shouldOfferCaps,
} from '../optional-limits';
import { buildDeployRequestBody } from '../request';

describe('normalizeOptionalLimit', () => {
  it.each(['none', 'None', 'No per-transaction limit', 'no limit', 'unlimited', 'n/a', '', '  ', 'abc'])(
    'treats %j as no cap',
    (v) => expect(normalizeOptionalLimit(v)).toBeUndefined(),
  );

  it.each([null, undefined, 0, '0', -5, Number.NaN, Number.POSITIVE_INFINITY, {}, true])(
    'treats %j as no cap',
    (v) => expect(normalizeOptionalLimit(v)).toBeUndefined(),
  );

  it.each([
    [50, 50],
    ['50', 50],
    ['$50', 50],
    ['$1,500', 1500],
    ['50 USD', 50],
    ['USD 1000', 1000],
    ['1500USD', 1500],
    ['5k', 5000],
    ['12.5', 12.5],
  ])('reads %j as %d', (v, n) => expect(normalizeOptionalLimit(v)).toBe(n));
});

describe('isNoLimitValue', () => {
  it('is true for a stated refusal and false for an amount or an absent value', () => {
    expect(isNoLimitValue('none')).toBe(true);
    expect(isNoLimitValue(0)).toBe(true);
    expect(isNoLimitValue(50)).toBe(false);
    expect(isNoLimitValue('')).toBe(false);
    expect(isNoLimitValue(undefined)).toBe(false);
  });
});

describe('normalizeLimitParams', () => {
  it('drops a cap that is not an amount and turns numeric strings into numbers', () => {
    const out = normalizeLimitParams({ scope: 's', spending_limit_per_tx: 'none', spending_limit_monthly: '50' });
    expect(out).toEqual({ scope: 's', spending_limit_monthly: 50 });
  });

  it('returns the same object when nothing changes', () => {
    const params = { scope: 's', spending_limit_monthly: 50 };
    expect(normalizeLimitParams(params)).toBe(params);
  });
});

describe('capsPhrase', () => {
  it('prints no clause when neither cap is an amount', () => {
    expect(capsPhrase('none', undefined)).toBe('');
    expect(capsPhrase('none', 'no limit')).toBe('');
  });

  it('never prints a non-amount as a cap', () => {
    expect(capsPhrase('none', 50)).toBe('capped at $50 per month');
    expect(capsPhrase('none', 50)).not.toContain('none');
  });

  it('prints one clause per real cap', () => {
    expect(capsPhrase(500, undefined)).toBe('capped at $500 per transaction');
    expect(capsPhrase(500, 5000)).toBe('capped at $500 per transaction and $5,000 per month');
  });
});

describe('formatLimit', () => {
  it('formats an amount and gives nothing for a non-amount', () => {
    expect(formatLimit('1500')).toBe('$1,500');
    expect(formatLimit('none')).toBe('');
  });
});

describe('deploy request body', () => {
  it('sends caps as numbers and leaves out one that is not an amount', () => {
    const out = buildDeployRequestBody({
      template: 'p2-power-of-attorney',
      params: { principal_name: 'A', spending_limit_per_tx: 'none', spending_limit_monthly: '50' },
      effectiveWallet: null,
      draftId: null,
    });
    expect(out.parameters).toEqual({ principal_name: 'A', spending_limit_monthly: 50 });
  });
});

describe('normalizeOptionalLimit amount formats', () => {
  it.each([
    ['5 million', 5_000_000],
    ['$5M', 5_000_000],
    ['5m', 5_000_000],
    ['2 thousand', 2000],
    ['1,500', 1500],
    ['1 500', 1500],
    ['1 500', 1500],
    ['1.500.000', 1_500_000],
    ['1,500,000', 1_500_000],
    ['1.500,00', 1500],
    ['1,500.50', 1500.5],
    ['$1.5k', 1500],
    ['$1.5K', 1500],
    ['12,5', 12.5],
    ['500 per transaction', 500],
    ['$5,000 monthly', 5000],
    ['500 USD.', 500],
    ['$1,500.', 1500],
  ])('reads %j as %d', (v, n) => expect(normalizeOptionalLimit(v)).toBe(n));

  it.each([
    'no limit, max 2 per day',
    'No limit, but max $2',
    'unlimited, 5 a day',
    '2 per day',
    '$50 daily',
    '5,000 per week',
    '1.500',
    '100-200',
    '$500 per tx, $5,000 monthly',
    '5%',
    '1,5,5',
    '12 345 6',
    'about five hundred',
  ])('treats the ambiguous or non-cap value %j as absent', (v) => expect(normalizeOptionalLimit(v)).toBeUndefined());

  it('keeps a period that does not fit the field out of that field', () => {
    expect(normalizeOptionalLimit('5,000 monthly', 'per_tx')).toBeUndefined();
    expect(normalizeOptionalLimit('500 per transaction', 'monthly')).toBeUndefined();
    expect(normalizeOptionalLimit('500 per transaction', 'per_tx')).toBe(500);
    expect(normalizeOptionalLimit('5,000 monthly', 'monthly')).toBe(5000);
  });

  it('reads a value that carries both caps for its own field only', () => {
    expect(normalizeOptionalLimit('$500 per tx, no monthly cap', 'per_tx')).toBe(500);
    expect(normalizeOptionalLimit('$500 per tx, no monthly cap', 'monthly')).toBeUndefined();
    expect(normalizeOptionalLimit('5,000 a month, no per-transaction limit', 'monthly')).toBe(5000);
    expect(normalizeOptionalLimit('5,000 a month, no per-transaction limit', 'per_tx')).toBeUndefined();
    expect(normalizeOptionalLimit('$500 per transaction and $5,000 monthly', 'per_tx')).toBe(500);
    expect(normalizeOptionalLimit('$500 per transaction and $5,000 monthly', 'monthly')).toBe(5000);
    expect(normalizeOptionalLimit('no limit, max 2 per day', 'per_tx')).toBeUndefined();
  });

  it('keeps the caps a mixed value sets when the parameters are normalized', () => {
    const out = normalizeLimitParams({ spending_limit_per_tx: '$500 per tx, no monthly cap' });
    expect(out).toEqual({ spending_limit_per_tx: 500 });
  });

  it('never turns a no-limit answer with an amount into a per-transaction cap', () => {
    const out = normalizeLimitParams({ spending_limit_per_tx: 'no limit, max 2 per day' });
    expect('spending_limit_per_tx' in out).toBe(false);
  });

  it('drops a monthly amount the model put in the per-transaction field', () => {
    const out = normalizeLimitParams({ spending_limit_per_tx: '5,000 monthly', spending_limit_monthly: '5,000 monthly' });
    expect(out).toEqual({ spending_limit_monthly: 5000 });
  });
});

describe('capsDeclined', () => {
  const user = (content: string, extra: object = {}) => ({ role: 'user', content, ...extra });
  const assistant = (content: string) => ({ role: 'assistant', content });

  it.each(['no caps', 'No spending limit please', 'skip the limits', "I don't need a cap", 'leave it uncapped', 'without any limit'])(
    'reads %j as a decline',
    (text) => expect(capsDeclined([user(text)])).toBe(true),
  );

  it('reads a bare no as a decline only after a question about caps', () => {
    expect(capsDeclined([assistant('Want to set a cap on spending?'), user('no')])).toBe(true);
    expect(capsDeclined([assistant('Which jurisdiction?'), user('no')])).toBe(false);
    expect(capsDeclined([user('no')])).toBe(false);
  });

  it('does not count what the model wrote, in any role', () => {
    expect(capsDeclined([user('Agent buys credits, no caps', { fromModel: true })])).toBe(false);
    expect(capsDeclined([assistant('We can leave it with no caps if you like.')])).toBe(false);
  });

  it('is false for an ordinary message', () => {
    expect(capsDeclined([user('Authorize my agent to buy credits, 50 per month')])).toBe(false);
  });
});

describe('shouldOfferCaps', () => {
  const ready = { template: 'p2-power-of-attorney', ready: true, highValueNeeded: false, params: {} as Record<string, unknown> };
  const first = [{ role: 'user', content: 'Authorize my agent to buy API credits' }];

  it('offers caps once for a ready power of attorney with none set', () => {
    expect(shouldOfferCaps({ ...ready, messages: first })).toBe(true);
  });

  it('puts the marker it checks for in the offer it sends', () => {
    expect(CAPS_OFFER_MESSAGE).toContain(CAPS_OFFER_MARKER);
  });

  it('does not offer again once the offer was made', () => {
    const messages = [...first, { role: 'assistant', content: CAPS_OFFER_MESSAGE }, { role: 'user', content: 'ok' }];
    expect(shouldOfferCaps({ ...ready, messages })).toBe(false);
  });

  it('does not offer caps the user declined in an earlier turn, even when the offer came from the model', () => {
    const messages = [
      ...first,
      { role: 'assistant', content: 'Do you want a spending cap on the agent?' },
      { role: 'user', content: 'no caps' },
      { role: 'assistant', content: 'Which jurisdiction governs this?' },
      { role: 'user', content: 'Latvia' },
    ];
    expect(shouldOfferCaps({ ...ready, messages })).toBe(false);
  });

  it('does not offer after a bare no to a question about limits', () => {
    const messages = [
      ...first,
      { role: 'assistant', content: 'Any spending limit for the agent?' },
      { role: 'user', content: 'no' },
    ];
    expect(shouldOfferCaps({ ...ready, messages })).toBe(false);
  });

  it('does not offer when a cap is set, the contract is not ready, or the template differs', () => {
    expect(shouldOfferCaps({ ...ready, params: { spending_limit_monthly: 50 }, messages: first })).toBe(false);
    expect(shouldOfferCaps({ ...ready, ready: false, messages: first })).toBe(false);
    expect(shouldOfferCaps({ ...ready, highValueNeeded: true, messages: first })).toBe(false);
    expect(shouldOfferCaps({ ...ready, template: 'd1-general-auth', messages: first })).toBe(false);
  });

  it('offers when the only cap text is one that cannot be read', () => {
    expect(shouldOfferCaps({ ...ready, params: { spending_limit_per_tx: 'no limit, max 2 per day' }, messages: first })).toBe(true);
  });
});
