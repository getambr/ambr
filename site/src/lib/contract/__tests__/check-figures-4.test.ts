import { describe, expect, it } from 'vitest';
import { goldens, runGolden, type Golden } from './check-fixtures';

// Money context: a figure keeps no exemption when a limit key, an amount wrapper or a currency sits
// anywhere above it, whatever the shape of the value or the depth it was moved to. A shape exempts a
// value only under the exact keys that name that kind of value, and never inside a money context.

type Json = Record<string, unknown>;
const g = goldens();
const all = Object.values(g);
const d1 = g['d1-general-auth'];
const d2 = g['d2-limited-service'];
const ft = (m: Json) => m.financial_terms as Json;
const d2tx = { amount: 2500, period_spent: 1000 };

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const notComplete = (r: { verdict: string }) => expect(r.verdict).not.toBe('within_limits');

describe('every golden still reaches within_limits', () => {
  it('with nothing the caller must fix', () => {
    for (const golden of all) {
      const r = runGolden(golden);
      expect(r.verdict, golden.slug).toBe('within_limits');
      expect(r.reasons, golden.slug).toEqual([]);
    }
  });

  it('with a limit written as an object that holds its amount, its currency and a period word', () => {
    const r = runGolden(d1, { mr: (m) => { ft(m).spending_limit_monthly = { amount: '1000.00', currency: 'USD', period: 'calendar month' }; } });
    expect(r.reasons).toEqual([]);
    expect(r.verdict).toBe('within_limits');
  });
});

describe('digits in a limit period one level down are a figure', () => {
  const d1cases: [string, unknown][] = [
    ['spending_limit_monthly', { amount: '1000.00', period: { value: '12 months' } }],
    ['spending_limit_monthly', { amount: '1000.00', currency: 'USD', period: { type: 'rolling', length: '30 days' } }],
    ['spending_limit_monthly', { amount: '1000.00', period: ['12 months'] }],
    ['spending_limit_monthly', { amount: '1000.00', reset: { period: '12 months' } }],
    ['spending_limit_monthly', { amount: '1000.00', currency: 'USD', terms: { period: '90 days' } }],
    ['limit_rules', { period: '12 months' }],
  ];
  for (const [key, value] of d1cases) {
    it(`${key} ${JSON.stringify(value)} is not within_limits`, () => {
      notComplete(runGolden(d1, { mr: (m) => { ft(m)[key] = value; } }));
    });
  }

  const d2cases: [string, unknown][] = [
    ['budget_usd', { amount: '5000.00', window: { length: '7 days' } }],
    ['budget_usd', { amount: '5000.00', reset: { period: '7 days' } }],
  ];
  for (const [key, value] of d2cases) {
    it(`${key} ${JSON.stringify(value)} is not within_limits`, () => {
      notComplete(runGolden(d2, { mr: (m) => { ft(m)[key] = value; } }));
    });
  }

  it('a period given only in words that the check cannot read is unread wording: incomplete, and listed', () => {
    const r = runGolden(d1, { mr: (m) => { ft(m).spending_limit_monthly = { amount: '1000.00', period: { unit: 'year' } }; } });
    expect(r.verdict).toBe('incomplete');
    expect(r.not_checked.some((n) => n.path.endsWith('period.unit'))).toBe(true);
  });

  it('a period in words that names the limit\'s own period still reads', () => {
    const r = runGolden(d1, { mr: (m) => { ft(m).spending_limit_monthly = { amount: '1000.00', currency: 'USD', terms: { period: 'calendar month' } }; } });
    expect(r.verdict).toBe('within_limits');
  });
});

describe('words-only wording nested under any limit of any golden is unread wording', () => {
  it('a period object that names a unit, a cadence or nothing the check can read is incomplete, with its path listed', () => {
    for (const golden of all) {
      for (const key of limitKeys(golden)) {
        for (const nested of [{ unit: 'year' }, { cadence: 'weekly' }, { type: 'sliding' }, { kind: 'fiscal quarter' }]) {
          const r = runGolden(golden, { mr: (m) => { ft(m)[key] = { amount: ft(m)[key], currency: 'USD', period: nested }; } });
          expect(r.verdict, `${golden.slug} ${key} ${JSON.stringify(nested)}`).not.toBe('within_limits');
          expect(r.not_checked.some((n) => n.path.includes(`${key}.period.`)), `${golden.slug} ${key} ${JSON.stringify(nested)} listed`).toBe(true);
        }
      }
    }
  });
});

describe('a number spelled out in words under a money context is a figure', () => {
  it('beside a currency, below a limit, in a list or in a wrapper', () => {
    for (const words of ['two thousand', 'twelve', 'a hundred and fifty', 'thirty']) {
      notComplete(runGolden(d2, { tx: d2tx, mr: (m) => { ft(m).per_order = words; } }));
      notComplete(runGolden(d2, { tx: d2tx, mr: (m) => { ft(m).orders = { per_order: { amount: words } }; } }));
      notComplete(runGolden(d2, { tx: d2tx, mr: (m) => { ft(m).budget_usd = { amount: '5000.00', window: [words] }; } }));
      notComplete(runGolden(d2, { tx: d2tx, mr: (m) => { m.extra = { currency: { code: 'USD' }, a: { b: words } }; } }));
    }
  });

  it('with no money above they are a figure all the same, a duration and wording without a number are not', () => {
    expect(runGolden(d2, { mr: (m) => { m.misc = { remarks_on_things: 'reviewed by two staff' }; } }).verdict).not.toBe('within_limits');
    expect(runGolden(d2, { mr: (m) => { m.misc = { remarks_on_things: 'reviewed by staff within thirty days' }; } }).verdict).toBe('within_limits');
    expect(runGolden(d2, { mr: (m) => { m.misc = { remarks_on_things: 'reviewed by staff' }; } }).verdict).toBe('within_limits');
  });
});

describe('a number written as hex is a figure', () => {
  it('a padded on-chain amount is not a wallet or a digest, in or out of a money context', () => {
    const amount = `0x${'0'.repeat(60)}07d0`;
    const digest = `${'0'.repeat(60)}07d0`;
    for (const value of [amount, digest, `0x${'0'.repeat(24)}7d0`]) {
      notComplete(runGolden(d1, { mr: (m) => { ft(m).spending_limit_monthly = { amount: '1000.00', limit: value }; } }));
      notComplete(runGolden(d1, { mr: (m) => { ft(m).extra = value; } }));
      notComplete(runGolden(d1, { mr: (m) => { m.misc = { agent_id: value }; } }));
    }
  });
});

describe('a year-shaped string is a figure under a money context', () => {
  const cases: [string, unknown][] = [
    ['per_order', { amount: '2000' }],
    ['per_order', { value: '1999' }],
    ['per_order', { amount: '2000', currency: { code: 'USD' } }],
    ['per_order', { amount: '2000', asset: { symbol: 'USD' } }],
    ['per_order', [{ amount: '2000' }]],
    ['orders', { per_order: '2000' }],
    ['order_limits', { per_order: { amount: '2000' } }],
  ];
  for (const [key, value] of cases) {
    it(`financial_terms.${key} = ${JSON.stringify(value)} is not within_limits`, () => {
      notComplete(runGolden(d2, { tx: d2tx, mr: (m) => { ft(m)[key] = value; } }));
    });
  }

  it('a top-level block with a currency beside, or none at all, is not within_limits', () => {
    notComplete(runGolden(d2, { tx: d2tx, mr: (m) => { m.order_rules = { currency: 'USD', per_order: { amount: '2000' } }; } }));
    notComplete(runGolden(d2, { tx: d2tx, mr: (m) => { m.order_rules = { per_order: { amount: '2000' } }; } }));
  });

  it('a currency of any value type, at a parent or a grandparent, makes everything below it money', () => {
    for (const currency of ['USD', { code: 'USD' }, ['USD'], { name: 'US dollar', decimals: 2 }]) {
      notComplete(runGolden(d2, { tx: d2tx, mr: (m) => { m.extra = { currency, orders: { per_order: '2000' } }; } }));
      notComplete(runGolden(d2, { tx: d2tx, mr: (m) => { m.extra = { currency, a: { b: { per_order: '1999' } } }; } }));
    }
  });

  it('a currency written as a symbol or a lower-case code makes everything beside it money', () => {
    for (const block of [{ symbol: '$' }, { sign: '€' }, { unit: 'usd' }, { unit: { name: 'dollars' } }, { units: ['USD'] }]) {
      notComplete(runGolden(d2, { mr: (m) => { m.extra = { ...block, year: '2000' }; } }));
      notComplete(runGolden(d2, { mr: (m) => { m.extra = { ...block, notice: '30 days' }; } }));
    }
  });

  it('a year beside no money at all stays unexplained, but a year under a year key is not a figure', () => {
    notComplete(runGolden(d2, { mr: (m) => { m.misc = { per_order: '2000' }; } }));
    expect(runGolden(d2, { mr: (m) => { m.misc = { year: '2026' }; } }).verdict).toBe('within_limits');
    expect(runGolden(d2, { mr: (m) => { m.misc = { year_of_issue: '2026' }; } }).verdict).toBe('within_limits');
  });

  it('a year under a year key is a figure once a currency or a limit sits above it', () => {
    notComplete(runGolden(d2, { mr: (m) => { ft(m).year = '2000'; } }));
    notComplete(runGolden(d2, { mr: (m) => { m.extra = { currency: 'USD', year: '2000' }; } }));
    notComplete(runGolden(d2, { mr: (m) => { ft(m).budget_usd = { amount: '5000.00', year: '2000' }; } }));
  });

  it('the control just above the year range is a figure too', () => {
    const r = runGolden(d2, { tx: d2tx, mr: (m) => { ft(m).per_order = { amount: '2100' }; } });
    expect(r.verdict).toBe('incomplete');
  });
});

describe('an exemption shape is anchored to its exact key and to no money above it', () => {
  it('an identifier token is exempt under an id key and not under any other key', () => {
    expect(runGolden(d1, { mr: (m) => { m.agent_class = 'procurement-bot-v2'; } }).verdict).toBe('within_limits');
    expect(runGolden(d1, { mr: (m) => { m.remarks_on_things = 'procurement-bot-v2'; } }).verdict).toBe('incomplete');
    notComplete(runGolden(d1, { mr: (m) => { m.misc = { per_order: 'x2000' }; } }));
    notComplete(runGolden(d1, { mr: (m) => { ft(m).agent_class = 'x2000'; } }));
  });

  it('a notice or uptime is exempt under a notice key outside money, and a figure inside it', () => {
    expect(runGolden(d1, { mr: (m) => { (m.revocation as Json).notice = '30 days written notice'; } }).verdict).toBe('within_limits');
    notComplete(runGolden(d1, { mr: (m) => { m.misc = { per_order: '30 days' }; } }));
    notComplete(runGolden(d1, { mr: (m) => { ft(m).notice = '30 days written notice'; } }));
    notComplete(runGolden(d1, { mr: (m) => { m.extra = { currency: 'USD', notice: '30 days' }; } }));
  });

  it('a wallet or a hash is exempt in any context, because no amount can be spelled like one', () => {
    const wallet = `0x${'ab12'.repeat(10)}`;
    expect(runGolden(d1, { mr: (m) => { ft(m).payee_wallet = wallet; } }).verdict).toBe('within_limits');
    expect(runGolden(d1, { mr: (m) => { ft(m).payee_wallet = `${wallet} 2000`; } }).verdict).not.toBe('within_limits');
  });

  it('an identity answer repeated in the text never explains a figure in a money context', () => {
    const edit = { parameters: (p: Json) => { p.principal_registration_number = '2000'; }, tx: d2tx };
    // outside money the echo is the registration number
    expect(runGolden(d2, { ...edit, mr: (m) => { m.misc = { registration_number: '2000' }; } }).verdict).toBe('within_limits');
    notComplete(runGolden(d2, { ...edit, mr: (m) => { ft(m).per_order = { amount: '2000', currency: 'USD' }; } }));
    notComplete(runGolden(d2, { ...edit, mr: (m) => { ft(m).budget_usd = { amount: '5000.00', note: '2000' }; } }));
  });
});

describe('a list answer entry is a figure only with a money signal, money in words or limit wording', () => {
  const names = ['Microsoft 365 licences', 'B2B SaaS', 'Web3 infrastructure', 'AWS EC2 instances', 'Tier 1 suppliers', 'ISO 27001 certified vendors'];
  for (const name of names) {
    it(`"${name}" is a name`, () => {
      const r = runGolden(d1, {
        parameters: (p) => { p.categories = ['procurement', 'cloud', name]; },
        mr: (m) => { (m.scope_of_delegation as Json).approved_categories = ['procurement', 'cloud', name]; },
      });
      expect(r.reasons).toEqual([]);
      expect(r.verdict).toBe('within_limits');
    });
  }

  it('an entry with a currency, a bound or a bare number is a figure', () => {
    for (const entry of ['USD 500 gift cards', 'orders over 2000', 'up to 5 vendors', '2000', '12 months', 'vendors, max 30', 'at most two hundred USD', 'a 500 order each month']) {
      const r = runGolden(d1, {
        parameters: (p) => { p.categories = ['procurement', 'cloud', entry]; },
        mr: (m) => { delete (m.scope_of_delegation as Json).approved_categories; },
      });
      expect(r.verdict, entry).not.toBe('within_limits');
    }
  });
});

describe('the generator\'s own notice wording is a metric under a notice key', () => {
  it('"72 hours per GDPR Art. 33" under a notice key, outside money', () => {
    const r = runGolden(d1, { mr: (m) => { m.data_protection = { breach_notification_hours: 72, notice: '72 hours per GDPR Art. 33' }; } });
    expect(r.reasons).toEqual([]);
    expect(r.verdict).toBe('within_limits');
  });

  it('business, calendar and working days and hours, with or without a citation', () => {
    for (const text of ['5 business days', '10 calendar days', '3 working days', '48 hours', '72 hours per GDPR Art. 33', '30 days per Article 22(1)', '72 hours pursuant to Section 7']) {
      expect(runGolden(d1, { mr: (m) => { m.data_protection = { notice: text }; } }).verdict, text).toBe('within_limits');
    }
  });

  it('never under another key, with money, or inside a money context', () => {
    notComplete(runGolden(d1, { mr: (m) => { m.data_protection = { remarks_on_things: '72 hours per GDPR Art. 33' }; } }));
    notComplete(runGolden(d1, { mr: (m) => { m.data_protection = { notice: '72 hours per GDPR Art. 33, fee USD 500' }; } }));
    notComplete(runGolden(d1, { mr: (m) => { m.data_protection = { notice: '72 hours per fee Art. 33' }; } }));
    notComplete(runGolden(d1, { mr: (m) => { ft(m).notice = '72 hours per GDPR Art. 33'; } }));
    notComplete(runGolden(d1, { mr: (m) => { m.data_protection = { currency: 'USD', notice: '72 hours per GDPR Art. 33' }; } }));
    notComplete(runGolden(d1, { mr: (m) => { m.data_protection = { notice: '72 hours per GDPR Art. 2000' }; } }));
  });
});

describe('words are read after combining marks and format characters are dropped', () => {
  const spellings = ['thirty dol͏lars', 'thiŕty dollars', 'thirty dollarś', 'thirty͏ dollars per order', 'twen̈ty euros'];
  it('money in words stays a figure in a list entry and in the text', () => {
    for (const spelling of spellings) {
      notComplete(runGolden(d1, {
        parameters: (p) => { p.categories = ['procurement', 'cloud', spelling]; },
        mr: (m) => { delete (m.scope_of_delegation as Json).approved_categories; },
      }));
      notComplete(runGolden(d1, { mr: (m) => { m.misc = { remarks_on_things: spelling }; } }));
      notComplete(runGolden(d1, { mr: (m) => { ft(m).payment_timing = spelling; } }));
    }
  });
});

describe('recitals: below, and a dotted part longer than two digits, are not citations', () => {
  const recital = (m: Json, text: string) => { m.electronic_formation_recital = text; };
  it('orders below a number, and a section with a long dotted part, are figures', () => {
    notComplete(runGolden(d1, { mr: (m) => recital(m, 'Orders below No. 500 go through without review.') }));
    notComplete(runGolden(d1, { mr: (m) => recital(m, 'Orders of Rule 5.2000 only.') }));
    notComplete(runGolden(d1, { mr: (m) => recital(m, 'Section 15, and orders of Rule 5.2000 only.') }));
  });

  it('citations with short dotted parts, letters and ranges are still citations', () => {
    for (const text of ['Section 5.2 and Article 9-16 of the Act.', 'Section 15A applies, with Article 5(1)(a).', 'Rule 5.2.1 and Clause 14.3(b).']) {
      expect(runGolden(d1, { mr: (m) => recital(m, text) }).verdict, text).toBe('within_limits');
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Generative: a money figure nested at depth 1 to 3 under a limit, in every wrapper and container.
// ---------------------------------------------------------------------------------------------

const CONTAINERS = ['period', 'reset', 'terms', 'window', 'rules'];
const FIGURES = ['2000', '1999', '12 months', '30 days', 'x2000', '7 days'];
const WRAPS: [string, (f: string) => unknown][] = [
  ['plain', (f) => f],
  ['value', (f) => ({ value: f })],
  ['amount', (f) => ({ amount: f })],
  ['list', (f) => [f]],
  ['list of objects', (f) => [{ amount: f }]],
  ['length', (f) => ({ length: f })],
];
const CURRENCIES: [string, Json][] = [
  ['no currency', {}],
  ['a currency beside', { currency: 'USD' }],
  ['a currency object beside', { currency: { code: 'USD' } }],
  ['a currency list beside', { asset: ['USD'] }],
  ['a code beside', { ccy: 'USD' }],
];

/** The keys of a golden's financial terms whose value is a plain amount: the limits and prices. */
function limitKeys(golden: Golden): string[] {
  return Object.entries(golden.machineReadable.financial_terms as Json)
    .filter(([, v]) => typeof v === 'string' && /^\d+(\.\d+)?$/.test(v))
    .map(([k]) => k);
}

describe('a money figure nested under a limit is never within_limits', () => {
  it('at depth 1 to 3, in every wrapper, container and currency placement, over 1500 seeded insertions', () => {
    const rand = mulberry32(20261115);
    const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)];
    for (let i = 0; i < 1500; i++) {
      const golden = pick(all);
      const key = pick(limitKeys(golden));
      const depth = 1 + Math.floor(rand() * 3);
      const [wrapName, wrap] = pick(WRAPS);
      const figure = pick(FIGURES);
      const [currencyName, currency] = pick(CURRENCIES);
      // A number leaf as often as a string: {amount: 2000}, [30], {value: 12}.
      const asNumber = /^\d+$/.test(figure) && rand() < 0.5;
      const where = Math.floor(rand() * depth); // which level of the nesting holds the currency
      let nested: unknown = (asNumber ? (f: string) => wrap(f) : wrap)(figure);
      if (asNumber) nested = JSON.parse(JSON.stringify(nested).replace(`"${figure}"`, figure));
      for (let level = depth - 1; level >= 0; level--) {
        nested = { [pick(CONTAINERS)]: nested, ...(level === where ? currency : {}) };
      }
      const label = `${golden.slug} ${key} depth ${depth} ${wrapName} ${figure} ${currencyName} at level ${where}`;
      const r = runGolden(golden, { mr: (m) => { ft(m)[key] = { amount: ft(m)[key], ...(nested as Json) }; } });
      expect(r.verdict, label).not.toBe('within_limits');
    }
  });

  it('under a container that is not a limit at all, with a currency at its parent or its grandparent', () => {
    const rand = mulberry32(77);
    const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)];
    for (let i = 0; i < 600; i++) {
      const golden = pick(all);
      const depth = 1 + Math.floor(rand() * 3);
      const [wrapName, wrap] = pick(WRAPS);
      const figure = pick(FIGURES);
      const [, currency] = pick(CURRENCIES.slice(1));
      let nested: unknown = { per_order: wrap(figure) };
      for (let level = 1; level < depth; level++) nested = { [pick(CONTAINERS)]: nested };
      const label = `${golden.slug} depth ${depth} ${wrapName} ${figure}`;
      const r = runGolden(golden, { mr: (m) => { m.extra_block = { ...currency, ...(nested as Json) }; } });
      expect(r.verdict, label).not.toBe('within_limits');
    }
  });

  it('a block that names a currency and holds only words, with no limit above them, does not stop within_limits', () => {
    for (const golden of all) {
      const r = runGolden(golden, { mr: (m) => { m.extra_block = { currency: 'USD', reset: { period: 'calendar month' } }; } });
      expect(r.verdict, golden.slug).toBe('within_limits');
    }
  });
});

describe('a money figure under an exact non-money key with a currency above it is never within_limits', () => {
  // Each key is one a shape exemption is anchored to, with a value of that shape that holds a figure.
  const probes: [string, string | number][] = [
    ['year', '2000'],
    ['year_of_issue', '1999'],
    ['effective_date', '2000'],
    ['agent_class', 'x2000'],
    ['agent_id', 'v1'],
    ['registration_number', '2000'],
    ['principal_address', '2000'],
    ['phone', '+371 20000000'],
    ['notice', '30 days'],
    ['notice_period', '72 hours per GDPR Art. 33'],
    ['uptime_commitment', '99.9% monthly uptime'],
    ['retention_notice', '30 days after termination'],
    ['rate_limit', '60 requests per minute'],
    ['breach_notification_hours', 73],
    ['cooling_off_days', 15],
    ['sla_response_ms', 801],
    ['version', '1.0'],
    ['schema_version', '1.0.0'],
    ['recital', 'Article 5(1)'],
    ['standard_reference', 'ISO 27001'],
  ];

  it('in financial terms and in any block that names a currency, at depth 1 and 2', () => {
    const rand = mulberry32(5150);
    const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)];
    // A bare number under one of the generator's exact metric keys keeps its exemption inside a money section (a notice or a
    // cooling-off period in the financial terms); the strings that carry money under those keys are in check-figures-5.
    const moneyProbes = probes.filter(([, value]) => typeof value !== 'number');
    for (let i = 0; i < 800; i++) {
      const golden = pick(all);
      const [key, value] = pick(moneyProbes);
      const depth = 1 + Math.floor(rand() * 2);
      const [currencyName, currency] = pick(CURRENCIES.slice(1));
      let nested: unknown = { [key]: value };
      if (depth === 2) nested = { [pick(CONTAINERS)]: nested };
      const inTerms = rand() < 0.5;
      const label = `${golden.slug} ${key} = ${value} depth ${depth} ${currencyName} ${inTerms ? 'in financial terms' : 'in a block'}`;
      const r = runGolden(golden, {
        mr: (m) => {
          if (inTerms) Object.assign(ft(m), nested);
          else m.extra_block = { ...currency, ...(nested as Json) };
        },
      });
      expect(r.verdict, label).not.toBe('within_limits');
    }
  });

  it('and the same keys outside any money context keep their exemption, so the shapes are not just always figures', () => {
    for (const [key, value] of probes) {
      if (key === 'registration_number' || key === 'principal_address' || key === 'phone' || key === 'recital') continue;
      const r = runGolden(d1, { mr: (m) => { m.misc_block = { [key]: value }; } });
      expect(r.verdict, key).toBe('within_limits');
    }
  });
});
