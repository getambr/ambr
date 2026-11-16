import { describe, expect, it } from 'vitest';
import { goldens, runGolden } from './check-fixtures';

type Json = Record<string, unknown>;
const g = goldens();
const d1 = g['d1-general-auth'];
const d2 = g['d2-limited-service'];
const d3 = g['d3-fleet-auth'];
const ft = (m: Json) => m.financial_terms as Json;

describe('digits in the wording beside a limit are a figure', () => {
  const cases: [string, unknown, string][] = [
    ['spending_limit_per_tx', { amount: '100.00', basis: 'per 30 days' }, 'd1'],
    ['requires_approval_above', { amount: '50.00', basis: 'per 30 days' }, 'd1'],
    ['spending_limit_monthly', { amount: '1000.00', period: '30 days' }, 'd1'],
    ['spending_limit_monthly', { amount: '1000.00', period: 'monthly (30 days)' }, 'd1'],
    ['spending_limit_monthly', { amount: '1000.00', period: '12 months' }, 'd1'],
    ['spending_limit_monthly', { amount: '1000.00', period: '90 days' }, 'd1'],
    ['spending_limit_monthly', { amount: '1000.00', basis: 'per 365 days' }, 'd1'],
    ['budget_usd', { amount: '5000.00', period: '7 days' }, 'd2'],
    ['escalation_threshold', { amount: '300.00', basis: 'per 24 hours' }, 'd3'],
  ];
  for (const [key, value, which] of cases) {
    it(`${key} ${JSON.stringify(value)} is never within_limits`, () => {
      const golden = which === 'd1' ? d1 : which === 'd2' ? d2 : d3;
      const r = runGolden(golden, { mr: (m) => { ft(m)[key] = value; } });
      expect(r.verdict).not.toBe('within_limits');
    });
  }

  it('a threshold with digit wording is not within_limits even with nothing spent', () => {
    const r = runGolden(d1, { mr: (m) => { ft(m).requires_approval_above = { amount: '50.00', basis: 'per 30 days' }; }, tx: { period_spent: 0 } });
    expect(r.verdict).not.toBe('within_limits');
  });
});

describe('every list answer is checked for figures', () => {
  it('a figure in a category entry is never within_limits', () => {
    for (const entry of ['max 30 USD per order', 'nothing over thirty dollars']) {
      const r = runGolden(d1, {
        parameters: (p) => { p.categories = ['procurement', 'cloud', entry]; },
        mr: (m) => { delete (m.scope_of_delegation as Json).approved_categories; },
      });
      expect(r.verdict, entry).not.toBe('within_limits');
    }
  });

  it('a figure in a restricted or permitted action entry is never within_limits', () => {
    const a = runGolden(d3, {
      parameters: (p) => { p.restricted_actions = ['change_limits', 'purchases above 100 USD']; },
      mr: (m) => { delete (m.scope_of_delegation as Json).restricted_actions; },
    });
    expect(a.verdict).not.toBe('within_limits');
    const b = runGolden(d3, {
      parameters: (p) => { p.permitted_actions = ['purchase_compute', 'pay_invoice', 'no single payment above 150 USD']; },
      mr: (m) => { delete (m.scope_of_delegation as Json).enumerated_actions; },
    });
    expect(b.verdict).not.toBe('within_limits');
  });

  it('a figure in a counterparty entry is never within_limits', () => {
    const r = runGolden(d2, {
      parameters: (p) => { p.permitted_counterparties = ['Vendor A, up to 100 USD']; },
      mr: (m) => { m.permitted_counterparties = ['Vendor A, up to 100 USD']; },
    });
    expect(r.verdict).not.toBe('within_limits');
  });

  it('plain entries still reach within_limits', () => {
    const r = runGolden(d1, { parameters: (p) => { p.categories = ['procurement', 'cloud', 'software']; }, mr: (m) => { (m.scope_of_delegation as Json).approved_categories = ['procurement', 'cloud', 'software']; } });
    expect(r.verdict).toBe('within_limits');
  });
});

describe('a string inside a money wrapper keeps no exemption', () => {
  const cases: [string, unknown][] = [
    ['per_order', { amount: '2000', currency: 'USD' }],
    ['per_order', { value: '1999', currency: 'USD' }],
    ['per_invoice', { amount: '2000', currency: 'USD' }],
    ['tiers', [{ up_to: '2000', currency: 'USD' }]],
    ['per_order', { amount: 'x2000', currency: 'USD' }],
    ['per_order', { amount: '30 days', currency: 'USD' }],
  ];
  for (const [key, value] of cases) {
    it(`${key} ${JSON.stringify(value)} is never within_limits`, () => {
      const r = runGolden(d2, { mr: (m) => { ft(m)[key] = value; }, tx: { amount: 2500, period_spent: 1000 } });
      expect(r.verdict).not.toBe('within_limits');
    });
  }
});
describe('a duration written as a number is compared with the answer', () => {
  it('a contradicting duration_months is incomplete', () => {
    const r = runGolden(d1, { mr: (m) => { (m.duration as Json).duration_months = 1; }, now: new Date('2026-08-15T12:00:00Z') });
    expect(r.verdict).toBe('incomplete');
  });

  it('a contradicting term_months is incomplete', () => {
    const c2 = g['c2-compute-sla'];
    const r = runGolden(c2, { mr: (m) => { (m.term as Json).term_months = 1; } });
    expect(r.verdict).toBe('incomplete');
  });

  it('the answered duration still reaches within_limits', () => {
    expect(runGolden(d1).verdict).toBe('within_limits');
    expect(runGolden(g['c2-compute-sla']).verdict).toBe('within_limits');
  });
});

describe('the notice and response figures the generator is asked for', () => {
  const c2 = g['c2-compute-sla'];
  const c3 = g['c3-task-execution'];

  it('a realistic agreement carrying the breach notice and the claim response timeline reaches within_limits', () => {
    const a = runGolden(c2, { mr: (m) => { m.data_security = { encryption: 'at rest and in transit', breach_notification_hours: 72, breach_notification: '72 hours' }; } });
    expect(a.verdict).toBe('within_limits');
    const b = runGolden(c3, { mr: (m) => { m.claim_procedure = { response_timeline_days: 14, filing: 'email to the provider' }; } });
    expect(b.verdict).toBe('within_limits');
  });

  it('only the exact keys are metrics: a key that merely ends in a unit is a figure', () => {
    for (const key of ['breach_notice_hours', 'response_days', 'support_hours', 'payment_due_days']) {
      expect(runGolden(c3, { mr: (m) => { m.claim_procedure = { [key]: 14 }; } }).verdict, key).not.toBe('within_limits');
    }
  });

  it('a currency beside the exact key makes it a figure again', () => {
    const r = runGolden(c2, { mr: (m) => { m.data_security = { breach_notification_hours: { value: 72, currency: 'USD' } }; } });
    expect(r.verdict).not.toBe('within_limits');
  });
});

describe('a recital that bounds a payment is not a citation', () => {
  const recital = 'electronic_formation_recital';
  const texts = [
    'Act 2000 a month',
    'Orders greater than Act 2000 require two signatures.',
    'Purchases over No. 30 require the Principal to sign.',
    'Orders higher than Section 15 need the Principal to consent.',
    'Payments larger than Act 2000 each year.',
    'This contract is formed pursuant to Section 7(500).',
    'This contract is formed pursuant to Article 5(1)(a) and Section 3(9) and Section 7(500).',
  ];
  for (const text of texts) {
    it(`"${text}" in a recitals list is never within_limits`, () => {
      expect(runGolden(d1, { mr: (m) => { m.recitals = [text]; } }).verdict).not.toBe('within_limits');
      expect(runGolden(d1, { mr: (m) => { m[recital] = `${m[recital]} ${text}`; } }).verdict).not.toBe('within_limits');
    });
  }

  it('real citations with sub-sections stay within_limits', () => {
    const real = 'This contract is formed pursuant to Article 5(1)(a), Article 3(9) and Section 15(2) of the Electronic Transactions Act (Cap. 88), over the SHA-256 hash of this contract.';
    expect(runGolden(d1, { mr: (m) => { m[recital] = real; } }).verdict).toBe('within_limits');
    for (const x of Object.values(g)) expect(runGolden(x).verdict, x.slug).toBe('within_limits');
  });
});

describe('zero-width and other format characters do not hide a word', () => {
  const marks = ['​', '‍', '⁠', '﻿', '­', '‎'];
  for (const mark of marks) {
    it(`U+${mark.codePointAt(0)!.toString(16).padStart(4, '0')} inside money in words is never within_limits`, () => {
      for (const text of [`thirty dol${mark}lars`, `thi${mark}rty dollars per order`, `at most twenty${mark} euros`, `one hun${mark}dred USD`]) {
        expect(runGolden(d1, { mr: (m) => { m.note = text; } }).verdict, text).not.toBe('within_limits');
        expect(runGolden(d1, { parameters: (p) => { p.scope = `Buy supplies, ${text}`; } }).verdict, text).not.toBe('within_limits');
        expect(runGolden(d1, { mr: (m) => { ft(m).spending_limit_per_tx = text; } }).verdict, text).not.toBe('within_limits');
      }
    });
  }
});
