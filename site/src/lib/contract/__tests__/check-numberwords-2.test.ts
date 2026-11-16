import { describe, expect, it } from 'vitest';
import { goldens, runGolden } from './check-fixtures';

// Payment check, number words, second round: a limit written in words must still fail closed where the
// first round let it through. In a money context every number word and "half" is a figure, a number word
// in an object key is one, a limit in an identity or choice answer is one, a duration unit only counts
// when plain spacing joins it to its number, "half" is a number word outside money too, and a party's own
// name that holds a number word ("Three Rivers Ltd") is a name.

type Json = Record<string, unknown>;
type Outcome = ReturnType<typeof runGolden>;
const g = goldens();
const all = Object.values(g);
const d1 = g['d1-general-auth'];
const c1 = g['c1-api-access'];
const c3 = g['c3-task-execution'];
const obj = (m: Json, k: string) => m[k] as Json;

const ok = (r: Outcome) => {
  expect(r.reasons).toEqual([]);
  expect(r.verdict).toBe('within_limits');
};
const notOk = (r: Outcome, label: string) => expect(r.verdict, label).not.toBe('within_limits');

const asBoundary = (entry: string) =>
  runGolden(d1, { mr: (m) => { obj(m, 'scope_of_delegation').boundaries = ['The Agent may not enter long-term leases.', entry]; } });

describe('a number word or "half" in a money context is a figure', () => {
  const schedules = [
    'Half on signing, half on completion.',
    'Half of the total price on signing, the rest on completion.',
    'A quarter of the price up front.',
    'Fivehundred on signing.',
    'A third up front, the balance on completion.',
    'One half on signing, one half on completion.',
  ];
  for (const text of schedules) {
    it(`"${text}" as the payment schedule of c3, in the financial terms or at the root`, () => {
      notOk(runGolden(c3, { mr: (m) => { obj(m, 'financial_terms').payment_schedule = text; } }), 'financial_terms');
      notOk(runGolden(c3, { mr: (m) => { m.payment_schedule = text; } }), 'root');
    });
  }

  it('a limit written as a fraction in the financial terms of d1', () => {
    notOk(runGolden(d1, { mr: (m) => { obj(m, 'financial_terms').notes = 'Single purchases capped at half of the approval threshold'; } }), 'notes');
    notOk(runGolden(d1, { mr: (m) => { obj(m, 'financial_terms').payment_timing = 'Half up front, half on delivery'; } }), 'payment_timing');
    notOk(runGolden(d1, { mr: (m) => { obj(m, 'financial_terms').payment_timing = 'Half of each invoice up front'; } }), 'half of');
  });

  it('a billing period named "quarter" is still only wording, and plain timing stays within_limits', () => {
    ok(runGolden(d1, { mr: (m) => { obj(m, 'financial_terms').payment_timing = 'As invoiced'; } }));
    ok(runGolden(d1, { mr: (m) => { obj(m, 'financial_terms').payment_timing = 'Invoiced at the end of each quarter'; } }));
  });
});

describe('a number word in an object key is a figure, whatever the value is', () => {
  const keys: [string, unknown][] = [
    ['thirty_per_order', true],
    ['purchases_to_thirty', true],
    ['orders_capped_at_thirty', 'applies'],
    ['max_thirty_per_purchase', 'yes'],
  ];
  for (const [key, value] of keys) {
    it(`"${key}" under the scope of d1 and at the root`, () => {
      notOk(runGolden(d1, { mr: (m) => { obj(m, 'scope_of_delegation')[key] = value; } }), 'scope');
      notOk(runGolden(d1, { mr: (m) => { m[key] = value; } }), 'root');
    });
  }

  it('a number word as the whole key, and nested one level down', () => {
    notOk(runGolden(d1, { mr: (m) => { m.restrictions = { thirty: 'per order' }; } }), 'thirty');
    notOk(runGolden(d1, { mr: (m) => { m.restrictions = { per_order: { thirty: true } }; } }), 'nested');
  });

  it('keys without a number word, or with a duration in them, stay within_limits', () => {
    ok(runGolden(d1, { mr: (m) => { obj(m, 'scope_of_delegation').tenant_scope = 'None'; } }));
    ok(runGolden(d1, { mr: (m) => { obj(m, 'revocation').thirty_day_notice = 'Applies'; } }));
  });
});

describe('a limit in number words in a form answer that is an identity or a choice is not within_limits', () => {
  it('the governing law, the principal type and the principal name', () => {
    notOk(runGolden(d1, { parameters: (p) => { p.governing_law = 'Singapore; purchases capped at thirty'; } }), 'governing_law');
    notOk(runGolden(d1, { parameters: (p) => { p.principal_type = 'corporation, purchases capped at thirty'; } }), 'principal_type');
    notOk(runGolden(d1, { parameters: (p) => { p.principal_name = 'Acme Corp (purchases capped at thirty)'; } }), 'principal_name');
  });

  it('half, a third and one beside limit wording in an identity answer', () => {
    const phrases = [
      'Singapore; no single purchase above a third of the per-transaction limit',
      'Singapore; half the monthly budget per purchase at most',
      'Singapore; at most one purchase a day',
    ];
    for (const v of phrases) {
      notOk(runGolden(d1, { parameters: (p) => { p.governing_law = v; } }), `governing_law: ${v}`);
      notOk(runGolden(d1, { parameters: (p) => { p.principal_name = `Acme Corp (${v})`; } }), `principal_name: ${v}`);
      notOk(runGolden(c1, { parameters: (p) => { p.seller_name = `Acme Corp (${v})`; } }), `seller_name: ${v}`);
    }
  });

  it('a choice that spells a number, alone and repeated in the text', () => {
    notOk(runGolden(d1, { parameters: (p) => { p.agent_type = 'supervised, at most thirty a purchase'; } }), 'answer only');
    notOk(
      runGolden(d1, {
        parameters: (p) => { p.agent_type = 'supervised, at most thirty a purchase'; },
        mr: (m) => { obj(m, 'agent_identification').agent_type = 'supervised, at most thirty a purchase'; },
      }),
      'answer and text',
    );
  });

  it('an identity answer that holds a number word and no limit wording is still read', () => {
    ok(runGolden(d1, { parameters: (p) => { p.governing_law = 'Laws of the Seven Kingdoms'; } }));
    ok(runGolden(d1, { parameters: (p) => { p.principal_name = 'Three Rivers Ltd'; } }));
  });
});

describe('a duration unit counts only when plain spacing joins it to its number', () => {
  const split = [
    'purchases capped at thirty; business days only',
    'purchases capped at thirty. Days are counted in UTC.',
    'purchases capped at thirty, days are counted in UTC',
    'purchases capped at thirty: days of supply',
    'purchases capped at thirty (days are counted in UTC)',
    'purchases capped at thirty; five days',
  ];
  for (const text of split) {
    it(`"${text}" is not within_limits`, () => {
      notOk(asBoundary(text), 'boundary');
      notOk(runGolden(d1, { mr: (m) => { m.notes = text; } }), 'notes');
    });
  }

  const joined = [
    "thirty days' notice",
    'thirty days’ notice',
    'two business days',
    'Twenty-four hour support',
    'thirty-day notice',
    'half-day workshops',
    'half an hour',
    'half a day',
    'a hundred and twenty days',
  ];
  for (const text of joined) {
    it(`"${text}" stays within_limits`, () => {
      ok(asBoundary(text));
      ok(runGolden(d1, { mr: (m) => { m.notes = text; } }));
    });
  }
});

describe('"half" and a third are number words outside a money context too', () => {
  it('a fraction in a note of c3 or a boundary of d1', () => {
    notOk(runGolden(c3, { mr: (m) => { obj(m, 'acceptance').notes = 'One half on signing, one half on completion.'; } }), 'one half');
    notOk(asBoundary('No single purchase may exceed half the approval threshold.'), 'half the');
    notOk(asBoundary('Half on signing, half on completion.'), 'plain half');
    notOk(asBoundary('Payment in halves.'), 'halves');
    notOk(asBoundary('No single purchase may exceed a third of the approval threshold.'), 'a third of');
    notOk(asBoundary('A third up front, the balance on completion.'), 'a third');
    notOk(asBoundary('Two thirds on signing.'), 'two thirds');
  });

  it('as a free-text answer', () => {
    notOk(runGolden(d1, { parameters: (p) => { p.scope = 'Buy office supplies; no purchase above half the approval threshold'; } }), 'half');
  });

  it('a half duration, a third party and a billing quarter stay within_limits', () => {
    ok(asBoundary('Half-day workshops are allowed.'));
    ok(asBoundary('A third party may countersign.'));
    ok(asBoundary('Invoiced at the end of each quarter.'));
    ok(asBoundary('Billed per quarter.'));
  });
});

describe("a party's own name that holds a number word is a name", () => {
  it('the principal of d1', () => {
    ok(
      runGolden(d1, {
        parameters: (p) => { p.principal_name = 'Three Rivers Ltd'; },
        mr: (m) => { m.principal = { ...obj(m, 'principal'), name: 'Three Rivers Ltd' }; },
      }),
    );
  });

  it('the seller of c1', () => {
    ok(
      runGolden(c1, {
        parameters: (p) => { p.seller_name = 'Seven Seas Ltd'; },
        mr: (m) => { m.parties = { ...obj(m, 'parties'), seller: 'Seven Seas Ltd' }; },
      }),
    );
  });

  it('the executor of c3', () => {
    ok(
      runGolden(c3, {
        parameters: (p) => { p.executor_name = 'Two Pines Ltd'; },
        mr: (m) => { m.parties = { ...obj(m, 'parties'), executor: 'Two Pines Ltd' }; },
      }),
    );
  });

  it('the same case and spacing is read as the name', () => {
    ok(
      runGolden(d1, {
        parameters: (p) => { p.principal_name = 'Three Rivers Ltd'; },
        mr: (m) => { m.principal = { ...obj(m, 'principal'), name: '  THREE   rivers ltd ' }; },
      }),
    );
  });

  it('a name that is not the answer, or sits anywhere but under a party key, is still a figure', () => {
    notOk(runGolden(d1, { mr: (m) => { m.principal = { ...obj(m, 'principal'), name: 'Three Rivers Ltd' }; } }), 'not the answer');
    notOk(
      runGolden(d1, {
        parameters: (p) => { p.principal_name = 'Three Rivers Ltd'; },
        mr: (m) => { m.notes = 'Three Rivers Ltd'; },
      }),
      'a note',
    );
    notOk(
      runGolden(d1, {
        parameters: (p) => { p.principal_name = 'Three Rivers Ltd'; },
        mr: (m) => { obj(m, 'financial_terms').payment_timing = 'Three Rivers Ltd'; },
      }),
      'under money',
    );
  });

  it('a party name answer that carries limit wording is not a name', () => {
    const limits = ['Thirty Per Order Ltd', 'Max Thirty Inc', 'Buys Up To Thirty Ltd', 'Sub Thirty Buys', 'Thirty Or Cheaper', 'Stop At Thirty', 'Beneath Thirty Inc', 'Short Of Thirty Ltd'];
    for (const name of limits) {
      notOk(
        runGolden(d1, {
          parameters: (p) => { p.principal_name = name; },
          mr: (m) => { m.principal = { ...obj(m, 'principal'), name }; },
        }),
        `d1 ${name}`,
      );
      notOk(
        runGolden(c1, {
          parameters: (p) => { p.seller_name = name; },
          mr: (m) => { m.parties = { ...obj(m, 'parties'), seller: name }; m.service = { capabilities: ['Level 2 order book', name] }; },
        }),
        `c1 ${name}`,
      );
    }
  });
});

describe('every template golden stays within_limits', () => {
  it('all of them', () => {
    for (const golden of all) ok(runGolden(golden));
  });
});
