import { describe, expect, it } from 'vitest';
import { hasDigit, isEmptyTerm, normEntry, textFigure } from '../check-text';
import { goldens, runGolden } from './check-fixtures';

type Json = Record<string, unknown>;
const g = goldens();
const d1 = g['d1-general-auth'];
const ft = (m: Json) => m.financial_terms as Json;

/** Put a value at a plain key of the text, or under financial_terms when the place is dotted. */
const put = (m: Json, where: string, value: unknown) => {
  if (where.includes('.')) ft(m)[where.split('.')[1]] = value;
  else m[where] = value;
};

describe('a currency, a unit or a number written glued to digits is a figure, not an identifier', () => {
  const glued = ['500CHF', 'CHF500', '500JPY', '5ETH', '5BTC', '500sats', '500dollars', '500bucks', '50cents', '5bn', '5mm', '1e3', '2.5E+3', '3 million'];

  for (const text of glued) {
    it(`"${text}" is a figure`, () => {
      expect(textFigure(text)).toBe(true);
      expect(textFigure(text, { limitKey: true })).toBe(true);
    });
    it(`"${text}" in the agreement text is never within_limits`, () => {
      for (const where of ['note', 'financial_terms.ceiling', 'financial_terms.per_order_ceiling']) {
        expect(runGolden(d1, { mr: (m) => put(m, where, text) }).verdict, `${where}: ${text}`).not.toBe('within_limits');
      }
    });
    it(`"${text}" in an enum or identity answer is never within_limits`, () => {
      expect(runGolden(d1, { parameters: (p) => { p.governing_law = text; } }).verdict).not.toBe('within_limits');
      expect(runGolden(d1, { parameters: (p) => { p.agent_type = text; } }).verdict).not.toBe('within_limits');
    });
  }

  it('a glued amount in a wrapped value or an object key is never within_limits', () => {
    expect(runGolden(d1, { mr: (m) => { ft(m).ceiling = { value: '1e3', currency: 'USD' }; } }).verdict).not.toBe('within_limits');
    expect(runGolden(d1, { mr: (m) => { ft(m)['500CHF'] = 'applies'; } }).verdict).not.toBe('within_limits');
  });

  it('an identifier is exempt only when the letters before its digits are a known identifier prefix', () => {
    // An identifier is exempt under an id key only; the same token under any other key is a figure.
    for (const ok of ['x402_enabled', 'procurement-bot-v2', 'sha256-hash-binding', 'ietf-adp-v1', 'md5', 'ipv4', 'ed25519', 'rfc9110']) {
      expect(textFigure(ok, { key: 'agent_class' }), ok).toBe(false);
      expect(textFigure(ok, { key: 'remarks_on_things' }), `${ok} under another key`).toBe(true);
    }
    for (const bad of ['usd500', 'chf30', 'sats500', 'eth5', 'bucks30', 'cap500', 'allowance30', '30x', '500v1']) {
      expect(textFigure(bad, { key: 'agent_class' }), bad).toBe(true);
    }
  });
});

describe('a number under a key is a metric only for the exact keys the generator writes', () => {
  const keys = ['allowance_per_month', 'retainer_per_month', 'ceiling_per_day', 'stipend_per_week', 'payout_per_month', 'reward_hours', 'grace_period_days', 'wallet_top_up_days'];

  for (const key of keys) {
    it(`a bare number at ${key} is a figure, with or without a currency beside it`, () => {
      expect(runGolden(d1, { mr: (m) => { ft(m)[key] = 30; } }).verdict, 'bare').not.toBe('within_limits');
      expect(runGolden(d1, { mr: (m) => { ft(m)[key] = 30; ft(m)[`${key.split('_')[0]}_currency`] = 'USD'; } }).verdict, 'currency beside').not.toBe('within_limits');
      expect(runGolden(d1, { mr: (m) => { ft(m)[key] = { value: 30 }; } }).verdict, 'wrapped').not.toBe('within_limits');
      expect(runGolden(d1, { mr: (m) => { ft(m)[key] = { value: 30, currency: 'USD' }; } }).verdict, 'wrapped with currency').not.toBe('within_limits');
    });
  }

  it('the generator\'s own notice, retention and cooling-off keys stay metrics', () => {
    for (const key of ['cooling_off_days', 'cancellation_notice_days', 'claim_deadline_days', 'data_retention_days', 'surviving_obligations_months', 'notice_period_hours']) {
      // The notice in hours is the revocation notice the form answers state (24): another number is a conflict.
      expect(runGolden(d1, { mr: (m) => { m[key] = key === 'notice_period_hours' ? 24 : 14; } }).verdict, key).toBe('within_limits');
    }
  });

  it('a version is a version only under an exact version key', () => {
    expect(runGolden(d1, { mr: (m) => { m.version = 2; } }).verdict).toBe('within_limits');
    expect(runGolden(d1, { mr: (m) => { m.schema_version = 2; } }).verdict).toBe('within_limits');
    expect(runGolden(d1, { mr: (m) => { m.pricing_version = '30'; } }).verdict).not.toBe('within_limits');
    expect(runGolden(d1, { mr: (m) => { m.pricing_version = 30; } }).verdict).not.toBe('within_limits');
  });
});

describe('a recital holds statute citations only', () => {
  const recital = 'electronic_formation_recital';
  const appended = [
    'Orders above 2000 need sign-off.',
    'Each order is subject to cap 30.',
    'Orders above 30/40 need sign-off.',
    'Orders over 1999 need sign-off.',
    'Orders up to 2000 per month.',
    'Spending is capped at 2000.',
  ];

  for (const text of appended) {
    it(`"${text}" after the recital is never within_limits`, () => {
      expect(runGolden(d1, { mr: (m) => { m[recital] = `${m[recital]} ${text}`; } }).verdict).not.toBe('within_limits');
    });
  }

  it('a limit written under a recital key is a figure', () => {
    const cases: [string, unknown][] = [
      ['recitals', { spending_limit: '2000' }],
      ['recitals', { requires_approval_above: 'No. 30' }],
      ['recitals', { limits: { per_order: 'cap 30' } }],
      ['recital_spending_cap', 'cap 30'],
      ['recitals', ['WHEREAS the Principal authorizes the Agent to make purchases of up to 2000 per month.']],
      ['recitals', ['Orders above 1999 need sign-off.']],
    ];
    for (const [key, value] of cases) {
      expect(runGolden(d1, { mr: (m) => { m[key] = value; } }).verdict, `${key}: ${JSON.stringify(value)}`).not.toBe('within_limits');
    }
  });

  it('only a statute noun gives a year its citation context', () => {
    const ok = 'This contract is formed pursuant to the Electronic Communications Act 2000, Section 7, and the Law of 2015 No. 5.';
    expect(textFigure(ok, { recital: true })).toBe(false);
    expect(textFigure('Orders above 2000 need sign-off.', { recital: true })).toBe(true);
    expect(textFigure('Purchases of 2000 per month.', { recital: true })).toBe(true);
    expect(textFigure('A contract made in 2026.', { recital: true })).toBe(true);
  });

  it('a limit key is tested before the recital and the rate shape', () => {
    expect(textFigure('cap 30', { limitKey: true, recital: true })).toBe(true);
    expect(textFigure('Section 15', { limitKey: true, recital: true })).toBe(true);
    expect(textFigure('30 requests per minute', { limitKey: true, ruleKey: true })).toBe(true);
    expect(textFigure('30 requests per minute', { limitKey: true })).toBe(true);
    expect(textFigure('30 requests per minute', { key: 'rate_limit' })).toBe(false);
    expect(textFigure('30 requests per minute', { key: 'rate_limit', money: true })).toBe(true);
  });

  it('an approval threshold written as a rate is a figure', () => {
    for (const key of ['requires_approval_above', 'spending_limit_per_tx', 'escalation_threshold', 'spending_limit']) {
      const r = runGolden(d1, { mr: (m) => { ft(m)[key] = '30 requests per minute'; }, tx: { amount: 40, period_spent: 0 } });
      expect(r.verdict, key).toBe('incomplete');
      expect(r.reasons.join(' '), key).toContain(`financial_terms.${key}`);
    }
  });

  it('a recital that holds real citations still leaves an agreement within_limits', () => {
    const eu =
      'This contract is formed under eIDAS Regulation (EU) 910/2014. Pursuant to Article 25, an electronic signature shall not be denied legal effect solely on the grounds that it is in electronic form. The signature is an ECDSA signature over the SHA-256 hash of this contract, which the parties adopt as their signature; this recital asserts no particular eIDAS assurance level. The Principal Declaration attributes the wallet signature to the Principal as the natural or legal person under Article 3(9).';
    expect(runGolden(d1, { mr: (m) => { m[recital] = eu; } }).verdict).toBe('within_limits');
    for (const x of Object.values(g)) expect(runGolden(x).verdict, x.slug).toBe('within_limits');
  });
});

describe('digits that are not \\p{Nd}', () => {
  it('superscripts, Roman numerals and circled digits are digits', () => {
    for (const s of ['³⁰', '²⁰ USD', 'Ⅹ USD per order', '½', '①']) expect(hasDigit(s), s).toBe(true);
    expect(hasDigit('plain words')).toBe(false);
  });

  it('they are figures in text, in answers and in the oversight and escalation keys', () => {
    expect(runGolden(d1, { mr: (m) => { m.note = 'Cap ³⁰ USD per order'; } }).verdict).not.toBe('within_limits');
    expect(runGolden(d1, { parameters: (p) => { p.scope = 'Buy supplies, max ³⁰ USD per order'; } }).verdict).not.toBe('within_limits');
    expect(runGolden(d1, { mr: (m) => { ft(m).order_rule = 'Ⅹ USD per order'; } }).verdict).not.toBe('within_limits');
    for (const text of ['³⁰', '²⁰ USD']) {
      const r = runGolden(d1, { mr: (m) => { ft(m).requires_approval_above = text; }, tx: { amount: 40, period_spent: 0 } });
      expect(r.verdict, text).not.toBe('within_limits');
    }
    const d3 = g['d3-fleet-auth'];
    const r = runGolden(d3, { mr: (m) => { ft(m).escalation_threshold = '³⁰'; }, tx: { period_spent: 0 } });
    expect(r.verdict).not.toBe('within_limits');
  });
});

describe('money written in number words is a figure', () => {
  const words = ['thirty dollars per order', 'at most thirty dollars each', 'twenty euros', 'one hundred USD', 'a thousand bucks', 'ten credits per call', 'pay two hundred'];

  for (const text of words) {
    it(`"${text}" is a figure, and never within_limits in the text or the answers`, () => {
      expect(textFigure(text)).toBe(true);
      for (const where of ['note', 'financial_terms.order_rule', 'financial_terms.requires_approval_above']) {
        expect(runGolden(d1, { mr: (m) => put(m, where, text) }).verdict, where).not.toBe('within_limits');
      }
      expect(runGolden(d1, { parameters: (p) => { p.scope = `Buy supplies, ${text}`; } }).verdict).not.toBe('within_limits');
    });
  }

  it('money in number words in an object key is a figure too', () => {
    expect(runGolden(d1, { mr: (m) => { ft(m).thirty_dollars_per_order = 'applies'; } }).verdict).not.toBe('within_limits');
    expect(runGolden(d1, { mr: (m) => { ft(m).twentyEurosEach = true; } }).verdict).not.toBe('within_limits');
    expect(runGolden(d1, { mr: (m) => { ft(m).one_time_setup = 'performed by the Agent'; } }).verdict).toBe('within_limits');
  });

  it('a number word without money, or money without a number word, is not a figure', () => {
    for (const ok of ['Buy office supplies and cloud services', 'one-time setup performed by the Agent', 'The Principal pays on receipt', 'three agents share the work', 'Reviewed and approved by the requester']) {
      expect(textFigure(ok), ok).toBe(false);
    }
  });

  it('the money in basis wording is a figure, and number words without money are unreadable wording', () => {
    const money = runGolden(d1, {
      mr: (m) => { ft(m).spending_limit_monthly = { amount: '1000.00', basis: 'per calendar month, and at most thirty dollars per order' }; },
    });
    expect(money.verdict).toBe('incomplete');
    expect(money.reasons.join(' ')).toContain('financial_terms.spending_limit_monthly.basis');
    const threshold = runGolden(d1, {
      mr: (m) => { ft(m).requires_approval_above = { amount: '50.00', basis: 'per transaction, or twenty dollars for new vendors' }; },
    });
    expect(threshold.verdict).toBe('incomplete');
    expect(threshold.reasons.join(' ')).toContain('financial_terms.requires_approval_above.basis');
    const plain = runGolden(d1, { mr: (m) => { ft(m).spending_limit_monthly = { amount: '1000.00', basis: 'per month, reviewed every thirty days' }; } });
    expect(plain.verdict).toBe('incomplete');
    expect(plain.not_checked.map((n) => n.path)).toContain('financial_terms.spending_limit_monthly.basis');
  });
});

describe('cost of very long values', () => {
  const time = (fn: () => void) => {
    const t0 = performance.now();
    fn();
    return performance.now() - t0;
  };
  const long = 50_000;

  it('trimming and normalising a 50k string takes well under 100 ms', () => {
    expect(time(() => isEmptyTerm(`x${' '.repeat(long)}x`))).toBeLessThan(100);
    expect(time(() => isEmptyTerm(`x${'.'.repeat(long)}x`))).toBeLessThan(100);
    expect(time(() => normEntry(`x${'_'.repeat(long)}x`))).toBeLessThan(100);
    expect(time(() => normEntry(`${'_'.repeat(long)}x`))).toBeLessThan(100);
    expect(isEmptyTerm(`none${'.'.repeat(5)}`)).toBe(true);
    expect(isEmptyTerm('  N/A  ')).toBe(true);
    expect(normEntry('__Gambling.__')).toBe('gambling');
  });

  it('a 50k note, basis or list entry does not slow the check', () => {
    const cases: { parameters?: (p: Json) => void; mr?: (m: Json) => void }[] = [
      { mr: (m) => { m.note = `x${' '.repeat(long)}x`; } },
      { mr: (m) => { m.note = `x${'_'.repeat(long)}x`; } },
      { mr: (m) => { ft(m).spending_limit_monthly = { amount: '1000.00', basis: `month${'_'.repeat(long)}x` }; } },
      { mr: (m) => { (m.scope_of_delegation as Json).boundaries = [`x${'_'.repeat(long)}x`]; } },
      { parameters: (p) => { p.categories = ['procurement', `x${'_'.repeat(long)}x`]; } },
      { parameters: (p) => { p.scope = `x${' '.repeat(long)}x`; } },
      { mr: (m) => { m.note = '1 '.repeat(long / 2); } },
      { mr: (m) => { m.note = 'one '.repeat(long / 8) + 'dollars'; } },
      { mr: (m) => { m.note = '1'.repeat(long) + 'x'; } },
      { mr: (m) => { m.note = '1.'.repeat(long / 2) + 'e'; } },
    ];
    for (const edit of cases) expect(time(() => runGolden(d1, edit))).toBeLessThan(100);
  });
});

describe('payment terms written as net days', () => {
  it('"Net <n> days" under a payment terms or timing key is not a figure', () => {
    for (const key of ['payment_terms', 'payment_timing']) {
      for (const text of ['Net 30', 'Net 30 days', 'net 45 days', 'NET 60']) {
        expect(runGolden(d1, { mr: (m) => { ft(m)[key] = text; } }).verdict, `${key}: ${text}`).toBe('within_limits');
      }
    }
  });

  it('the shape is exact: more words, money or another key make it a figure', () => {
    for (const text of ['Net 30 days, pay 500 USD', 'Net 30 days and at most 30 per order', 'Net 3000 days', 'Net 30 thirty dollars', 'Net 30 USD']) {
      expect(runGolden(d1, { mr: (m) => { ft(m).payment_terms = text; } }).verdict, text).not.toBe('within_limits');
    }
    expect(runGolden(d1, { mr: (m) => { ft(m).order_rule = 'Net 30 days'; } }).verdict).not.toBe('within_limits');
    expect(textFigure('Net 30 days', { key: 'order_rule' })).toBe(true);
  });
});

describe('Ambr\'s own fields', () => {
  it('stay unread only while they hold no limit wording beside a digit', () => {
    for (const [key, text] of [
      ['version', '1.0 orders above 30 need sign-off'],
      ['template', 'd1-general-auth, approval needed over 30'],
      ['schema_version', '1.0.0 exceeds 30 per order'],
      ['contract_id', 'amber-2026-0001 approved up to 30'],
    ]) {
      expect(runGolden(d1, { mr: (m) => { m[key] = text; } }).verdict, key).not.toBe('within_limits');
    }
    expect(runGolden(d1, { mr: (m) => { (m.compliance as Json).oversight_framework = 'eu_ai_act_article_14 orders over 30 need sign-off'; } }).verdict).not.toBe('within_limits');
    expect(runGolden(d1).verdict).toBe('within_limits');
  });
});
