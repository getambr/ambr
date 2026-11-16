import { describe, expect, it } from 'vitest';
import { hasDigit, isMetricValue, parseFigure, textFigure } from '../check-text';
import { goldens, runGolden } from './check-fixtures';

type Json = Record<string, unknown>;
const g = goldens();
const d1 = g['d1-general-auth'];
const ft = (m: Json) => m.financial_terms as Json;

describe('figures fail closed: any digit is a figure unless the whole value cannot be an amount', () => {
  const spellings = [
    'cap 500 USD',
    'Cap 30 USD per vendor',
    'USD500',
    '500EUR',
    '30USDC per order',
    '1.000.000 EUR',
    'USD 1.000.000',
    '5 000',
    "5'000",
    '1.000,00',
    '1 000 000',
    '250/500 USD',
    '５００ USD',
    '٣٠ USD',
    '5k per month',
    'max 30',
    'up to 500',
    'at most 30',
    '≤ 30',
    'Rule 500 USD',
    'No 500 USD',
    'Art. 30 USD per order',
    'Section 12 limit 40',
  ];

  for (const text of spellings) {
    it(`"${text}" is a figure`, () => {
      expect(textFigure(text, { limitKey: true })).toBe(true);
      expect(textFigure(text)).toBe(true);
    });
  }

  for (const text of spellings) {
    it(`"${text}" in the agreement text is never within_limits`, () => {
      for (const where of ['note', 'single_purchase_max', 'financial_terms.order_rule', 'mobile_spending_limit', 'notice_limit']) {
        const r = runGolden(d1, { mr: (m) => { if (where.includes('.')) ft(m).order_rule = text; else m[where] = text; } });
        expect(r.verdict, `${where}: ${text}`).not.toBe('within_limits');
      }
    });
  }

  for (const text of spellings) {
    it(`"${text}" in the free-text scope answer is never within_limits`, () => {
      const r = runGolden(d1, { parameters: (p) => { p.scope = `Buy office supplies. ${text}`; } });
      expect(r.verdict).not.toBe('within_limits');
    });
  }

  it('a digit in an enum or identity answer is a figure, and is never echoed back as an explanation', () => {
    for (const edit of [
      (p: Json) => { p.agent_type = 'supervised, max 30 USD per order'; },
      (p: Json) => { p.governing_law = 'Singapore. Purchases above 20 need approval.'; },
    ]) {
      expect(runGolden(d1, { parameters: edit }).verdict).toBe('incomplete');
      const echoed = runGolden(d1, { parameters: edit, mr: (m) => { m.extra_note = 'Singapore. Purchases above 20 need approval.'; } });
      expect(echoed.verdict).toBe('incomplete');
    }
  });

  it('a digit in an object key is a figure', () => {
    expect(runGolden(d1, { mr: (m) => { ft(m).tiers = { '20': 'requires sign-off' }; } }).verdict).toBe('incomplete');
    expect(runGolden(d1, { mr: (m) => { ft(m).over_20_usd = 'sign-off'; } }).verdict).toBe('incomplete');
    expect(runGolden(d1, { mr: (m) => { ft(m).purchases_over_20_usd_need_signoff = true; } }).verdict).toBe('incomplete');
  });

  it('a figure at a limit key is never taken as basis wording', () => {
    for (const text of ['30USD', 'USD30', 'Cap 30 USD', 'thirty dollars', 'max 30']) {
      const r = runGolden(d1, { mr: (m) => { ft(m).requires_approval_above = text; }, tx: { amount: 40, period_spent: 0 } });
      expect(r.verdict, text).toBe('incomplete');
      expect(r.reasons.join(' '), text).toContain('financial_terms.requires_approval_above');
    }
  });

  it('a currency named by any key must be the one of the form answers', () => {
    expect(runGolden(d1, { mr: (m) => { ft(m).currency_code = 'EUR'; } }).verdict).toBe('incomplete');
    expect(runGolden(d1, { mr: (m) => { ft(m).spending_limit_per_tx = { amount: 100, asset: 'EURC' }; } }).verdict).toBe('incomplete');
    expect(runGolden(d1, { mr: (m) => { ft(m).spending_limit_per_tx = { amount: 100, denomination: 'EUR' }; } }).verdict).toBe('incomplete');
    expect(runGolden(d1, { mr: (m) => { ft(m).spending_limit_per_tx = { amount: 100, asset: 'USD' }; } }).verdict).toBe('within_limits');
  });
});

describe('what is not a figure, by the shape of the whole value', () => {
  it('dates, years, hashes, wallets, identifiers and ISO standards', () => {
    for (const ok of ['2026-06-01', '2026-06-01T00:00:00Z', `0x${'a'.repeat(40)}`, 'a'.repeat(31) + 'b' + 'c', 'ISO 8601']) {
      expect(textFigure(ok), ok).toBe(false);
    }
    // A bare year and an identifier token are exempt only under their own keys.
    expect(textFigure('2026', { key: 'year' })).toBe(false);
    expect(textFigure('2026', { key: 'effective_date' })).toBe(false);
    expect(textFigure('2026')).toBe(true);
    expect(textFigure('2026', { key: 'per_order' })).toBe(true);
    for (const ok of ['sha256-hash-binding', 'ietf-adp-v1', 'x402_enabled', 'procurement-bot-v2']) {
      expect(textFigure(ok, { key: 'reconciliation_method' }), ok).toBe(false);
      expect(textFigure(ok), ok).toBe(true);
    }
  });

  it('an identifier that names a limit or holds a number of its own is a figure', () => {
    for (const bad of ['max-30', 'cap500', 'limit-v2', 'order-30', '30', '2026 USD']) expect(textFigure(bad), bad).toBe(true);
  });

  it('a version is exempt only under a version key', () => {
    expect(textFigure('1.0.0', { versionKey: true })).toBe(false);
    expect(textFigure('1.0.0')).toBe(true);
  });

  it('a legal citation is exempt only inside a recital key, and never with money beside it', () => {
    const recital = 'This contract is formed pursuant to the Electronic Transactions Act (Cap. 88), Section 15 and eIDAS Regulation (EU) 910/2014, Article 3(9).';
    expect(textFigure(recital, { recital: true })).toBe(false);
    expect(textFigure(recital)).toBe(true);
    expect(textFigure(`${recital} The cap is 500 USD.`, { recital: true })).toBe(true);
    expect(textFigure('Section 15. Spending is capped at 500 per month.', { recital: true })).toBe(true);
  });

  it('a phone number is exempt only under an exact contact key and only with a phone shape', () => {
    expect(textFigure('+371 2000 0000', { key: 'phone' })).toBe(false);
    expect(textFigure('+371 2000 0000', { key: 'mobile_spending_limit' })).toBe(true);
    expect(textFigure('30 USD per day', { key: 'mobile' })).toBe(true);
    expect(textFigure('mobile 30', { key: 'phone' })).toBe(true);
  });

  it('an address or registration number is exempt only under its own key and with no limit wording', () => {
    expect(textFigure('1 Example Street, Example City', { key: 'principal_address' })).toBe(false);
    expect(textFigure('REG-000000', { key: 'registration_number' })).toBe(false);
    expect(textFigure('1 Example Street, max 30 per order', { key: 'principal_address' })).toBe(true);
    expect(textFigure('1 Example Street', { key: 'governing_law' })).toBe(true);
  });

  it('a duration, an uptime or a rate is a metric by shape, but never with a currency or credit wording', () => {
    for (const ok of ['24 hours written notice', '30 days after termination', '99.9% monthly uptime', '800 ms', '600 requests per minute', '60 rpm']) {
      expect(isMetricValue(ok) || /requests|rpm/.test(ok), ok).toBe(true);
      // A metric is exempt under the exact notice, uptime, response and rate keys only.
      expect(textFigure(ok, { key: /requests|rpm/.test(ok) ? 'rate_limit' : 'notice_period' }), ok).toBe(false);
      expect(textFigure(ok), ok).toBe(true);
    }
    for (const bad of ['500 USD per breach', 'credit of 10% of the monthly fee', 'refund 200 USD if missed', '10% service credit', '30 days, fee 20', '5 days penalty']) {
      expect(textFigure(bad, { key: 'notice_period' }), bad).toBe(true);
    }
  });

  it('a rate restated in words is exempt under the exact rate keys only, and never under a limit key or money', () => {
    expect(textFigure('600 requests per minute', { key: 'rate_limit' })).toBe(false);
    expect(textFigure('600 requests per minute', { key: 'rate_limit', limitKey: true })).toBe(true);
    expect(textFigure('600 requests per minute USD', { key: 'rate_limit' })).toBe(true);
    expect(textFigure('30 days', { limitKey: true })).toBe(true);
  });
});

describe('metrics under keys of the agreement text', () => {
  it('notice, breach, sla and response keys explain nothing that is money', () => {
    const cases: [string, unknown][] = [
      ['notice_required_above', 20],
      ['approval_notice', { amount: 20, currency: 'USD' }],
      ['mobile_spending_limit', '30 USD per day'],
      ['breach', '500 USD per breach'],
      ['sla', 'credit of 10% of the monthly fee'],
      ['response_time', 'refund 200 USD if missed'],
      ['breach_remedy', '10% service credit'],
      ['sla_penalty_amount', '500 USD'],
    ];
    for (const [key, value] of cases) {
      const r = runGolden(d1, { mr: (m) => { ft(m)[key] = value; } });
      expect(r.verdict, key).toBe('incomplete');
    }
  });

  it('a number under one of the generator\'s own unit keys is a metric, unless a currency is written beside the value', () => {
    expect(runGolden(d1, { mr: (m) => { m.cooling_off_days = 5; } }).verdict).toBe('within_limits');
    // Under financial_terms the exact key keeps its exemption for a bare number (the prompts ask for notices there); a currency beside the value itself does not.
    expect(runGolden(d1, { mr: (m) => { ft(m).cooling_off_days = 5; } }).verdict).toBe('within_limits');
    expect(runGolden(d1, { mr: (m) => { ft(m).cooling_off_days = { amount: 5, currency: 'USD' }; } }).verdict).toBe('incomplete');
    expect(runGolden(d1, { mr: (m) => { ft(m).grace_period_days = 5; } }).verdict).toBe('incomplete');
  });
});

describe('a realistic agreement stays reachable', () => {
  it('a duration written in words is explained by the duration answer', () => {
    expect(runGolden(d1, { mr: (m) => { (m.duration as Json).duration_months = '12 months'; } }).verdict).toBe('within_limits');
    expect(runGolden(d1, { mr: (m) => { m.term = { duration: '12 months' }; } }).verdict).toBe('within_limits');
    expect(runGolden(d1, { mr: (m) => { m.term = { duration: '1 year' }; } }).verdict).toBe('within_limits');
    expect(runGolden(d1, { mr: (m) => { m.term = { duration: '18 months' }; } }).verdict).toBe('incomplete');
    expect(runGolden(d1, { mr: (m) => { m.duration = { term: 12 }; } }).verdict).toBe('within_limits');
    const p2 = g['p2-power-of-attorney'];
    expect(runGolden(p2, { mr: (m) => { m.duration = '6 months'; } }).verdict).toBe('within_limits');
  });

  it('renamed limit keys whose figures equal the answers reach within_limits', () => {
    const r = runGolden(d1, {
      mr: (m) => {
        m.financial_terms = {
          currency: 'USD',
          per_transaction_cap: '100.00 USD',
          monthly_aggregate_cap: '1,000.00 USD per month',
          approval: { threshold: { amount: '50.00' } },
        };
      },
    });
    expect(r.reasons).toEqual([]);
    expect(r.verdict).toBe('within_limits');
    expect(runGolden(d1, { mr: (m) => { m.financial_terms = { currency: 'USD', per_transaction_cap: '500.00 USD' }; } }).verdict).toBe('incomplete');
  });

  it('nested limit names are read together with their parent', () => {
    const p2 = g['p2-power-of-attorney'];
    const r = runGolden(p2, { mr: (m) => { m.spending_limits = { per_transaction: { amount: '100.00' }, monthly: { amount: '1000.00' } }; delete m.financial_terms; } });
    expect(r.verdict).toBe('within_limits');
    const d3 = g['d3-fleet-auth'];
    expect(runGolden(d3, { mr: (m) => { m.financial_terms = { currency: 'USD', escalation: { threshold: { amount: '300.00' } } }; } }).verdict).toBe('within_limits');
  });

  it('a generic limit key is read with the period beside it', () => {
    const ok = runGolden(d1, { mr: (m) => { m.scope = { spending_limit: { amount: 1000, currency: 'USD', period: 'month' } }; } });
    expect(ok.verdict).toBe('within_limits');
    const wrong = runGolden(d1, { mr: (m) => { m.scope = { spending_limit: { amount: 1000, currency: 'USD', period: 'transaction' } }; } });
    expect(wrong.verdict).toBe('incomplete');
    const none = runGolden(d1, { mr: (m) => { m.scope = { spending_limit: { amount: 1000, currency: 'USD' } }; } });
    expect(none.verdict).toBe('incomplete');
  });

  it('an amount with its own period at its own key is explained only when the period is the rule\'s', () => {
    const month = runGolden(d1, { mr: (m) => { ft(m).spending_limit_monthly = '1000.00 USD per month'; } });
    expect(month.verdict).toBe('within_limits');
    const quarter = runGolden(d1, { mr: (m) => { ft(m).spending_limit_monthly = '1000.00 USD per quarter'; } });
    expect(quarter.verdict).toBe('incomplete');
  });

  it('a spelled-out currency that matches is the same currency', () => {
    expect(runGolden(d1, { mr: (m) => { ft(m).currency = 'US Dollars'; } }).verdict).toBe('within_limits');
    expect(runGolden(d1, { mr: (m) => { ft(m).currency = 'Euros'; } }).verdict).toBe('incomplete');
  });

  it('a rate limit restated in words equals no money figure', () => {
    const c1 = g['c1-api-access'];
    expect(runGolden(c1, { mr: (m) => { (m.api as Json).rate_limit = '60 requests per minute'; } }).verdict).toBe('within_limits');
    expect(runGolden(c1, { mr: (m) => { (m.api as Json).rate_limit = 60; } }).verdict).toBe('within_limits');
  });

  it('every golden keeps its notice periods, recitals and identifiers without a figure', () => {
    for (const x of Object.values(g)) expect(runGolden(x).verdict, x.slug).toBe('within_limits');
  });
});

describe('cost', () => {
  it('a long string is scanned in linear time and a long digit-bearing one is a figure without being analysed', () => {
    const t0 = Date.now();
    for (const n of [4000, 64_000, 400_000]) {
      expect(textFigure(`1${' '.repeat(n)}x`)).toBe(true);
      expect(hasDigit(`${' '.repeat(n)}`)).toBe(false);
      expect(parseFigure(`${'9'.repeat(n)} USD`)).toBeUndefined();
    }
    expect(textFigure('Section '.repeat(300_000))).toBe(false);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
