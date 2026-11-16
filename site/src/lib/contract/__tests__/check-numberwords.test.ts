import { describe, expect, it } from 'vitest';
import { goldens, runGolden } from './check-fixtures';

// Payment check, number words: a figure written in words must fail closed exactly like a digit. A strong
// number word (two to nineteen, the tens, hundred and up, dozen, grand, a hyphenated compound) is a figure
// in a plain string and in a free-text answer unless a duration unit follows it directly. In a list of
// names it is a name only when it ends in a company word or repeats a party name of the agreement.

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

describe('a limit in number words in a free-text answer is not within_limits', () => {
  const scope = 'Buy office supplies and cloud services; single purchases top out at thirty';
  it('the scope answer of d1, alone and repeated in the text', () => {
    notOk(runGolden(d1, { parameters: (p) => { p.scope = scope; } }), 'answer only');
    notOk(
      runGolden(d1, { parameters: (p) => { p.scope = scope; }, mr: (m) => { obj(m, 'scope_of_delegation').purpose = scope; } }),
      'answer and purpose',
    );
  });

  it('the task description of c3, in the answer and in the text', () => {
    const task = 'Label the product images; the whole job is seven hundred or lower';
    notOk(runGolden(c3, { parameters: (p) => { p.task_description = task; }, mr: (m) => { obj(m, 'task').description = task; } }), 'task');
    const acceptance = 'Reviewed and approved by the requester; no invoice past seven hundred';
    notOk(runGolden(c3, { parameters: (p) => { p.acceptance_criteria = acceptance; }, mr: (m) => { obj(m, 'acceptance').acceptance_criteria = acceptance; } }), 'acceptance');
  });
});

describe('a limit in number words in a plain string of the agreement text is not within_limits', () => {
  const strings = [
    'no single purchase may go past thirty',
    'purchases stop at thirty',
    'thirty is the most any one purchase may be',
    'single buys to thirty',
    'thirty or lower',
    'fifty percent of each order',
    'twenty-five percent of the per-transaction limit',
    'half of each order',
    'a quarter of the monthly spend',
    'thirty-five',
    'thirty, no more',
    'a hundred a purchase',
    'two dozen a purchase',
    'five grand',
    'hundreds',
    'Two parties agree to this',
    'twenty monthly reports',
    'thirty days, then no more than thirty a purchase',
  ];
  for (const text of strings) {
    it(`"${text}" as notes, a boundaries string and a boundaries entry`, () => {
      notOk(runGolden(d1, { mr: (m) => { m.notes = text; } }), 'notes');
      notOk(runGolden(d1, { mr: (m) => { obj(m, 'scope_of_delegation').boundaries = text; } }), 'boundaries string');
      notOk(runGolden(d1, { mr: (m) => { obj(m, 'scope_of_delegation').boundaries = ['The Agent may not enter long-term leases.', text]; } }), 'boundaries entry');
      notOk(runGolden(c1, { tx: { amount: 40 }, mr: (m) => { m.service = { features: ['Order book', text] }; } }), 'features entry');
      notOk(runGolden(c3, { mr: (m) => { obj(m, 'acceptance').notes = text; } }), 'acceptance notes');
    });
  }

  it('the same text as a free-text answer', () => {
    for (const text of strings) notOk(runGolden(d1, { parameters: (p) => { p.scope = `Buy office supplies; ${text}`; } }), text);
  });

  it('a number word in a compound without a hyphen is a figure too', () => {
    for (const text of ['thirtyfive', 'fivehundred', 'Twenty-One']) notOk(runGolden(d1, { mr: (m) => { m.notes = text; } }), text);
  });

  it('a very long text with a number word in it is a figure', () => {
    notOk(runGolden(d1, { mr: (m) => { m.notes = `${'plain words '.repeat(300)}thirty`; } }), 'long');
  });
});

describe('a duration, "one", a protocol and prose without a number word stay within_limits', () => {
  const durations = [
    "thirty days' notice",
    'thirty days’ notice',
    'thirty days written notice',
    'twenty-four hours',
    'thirty business days',
    'sixty calendar days after receipt',
    'a hundred and twenty days',
    'thirty-day notice',
    'two weeks',
    'twelve months',
    'five working days',
  ];
  for (const text of durations) {
    it(`"${text}" as notes`, () => {
      ok(runGolden(d1, { mr: (m) => { m.notes = text; } }));
    });
  }

  it('a duration in a free-text answer', () => {
    ok(runGolden(d1, { parameters: (p) => { p.scope = "Buy office supplies; thirty days' notice to end the agreement"; } }));
  });

  it('a duration beside a figure is still a figure', () => {
    notOk(runGolden(d1, { mr: (m) => { m.notes = 'thirty days, thirty a purchase'; } }), 'two numbers');
    notOk(runGolden(d1, { mr: (m) => { m.notes = 'thirty business purchases'; } }), 'business is not a unit here');
  });

  it('"one", "zero" and the protocol names keep their handling', () => {
    ok(runGolden(d1, { mr: (m) => { m.notes = 'One-stop shop'; } }));
    ok(runGolden(d1, { mr: (m) => { m.notes = 'a one-time setup'; } }));
    notOk(runGolden(d1, { mr: (m) => { m.notes = 'one per order'; } }), 'one per order');
    ok(runGolden(c1, { mr: (m) => { m.payment_terms = { protocol: 'x402', payment_timing: 'Per call via HTTP 402' }; } }));
  });

  it('every template golden', () => {
    for (const golden of all) ok(runGolden(golden));
  });
});

describe('an entry of a list of names with a number word is a figure unless it is a company name', () => {
  const asCategory = (entry: string) =>
    runGolden(d1, {
      parameters: (p) => { p.categories = ['procurement', entry]; },
      mr: (m) => { obj(m, 'scope_of_delegation').approved_categories = ['procurement', entry]; },
    });
  const asBoundary = (entry: string) =>
    runGolden(d1, { mr: (m) => { obj(m, 'scope_of_delegation').boundaries = ['The Agent may not enter long-term leases.', entry]; } });
  const asNote = (entry: string) => runGolden(d1, { mr: (m) => { m.notes = entry; } });
  const asCapability = (entry: string) => runGolden(c1, { tx: { amount: 40 }, mr: (m) => { m.service = { capabilities: ['Level 2 order book', entry] }; } });
  const asDeliverable = (entry: string) =>
    runGolden(c3, {
      parameters: (p) => { p.deliverables = ['Labelled images', entry]; },
      mr: (m) => { obj(m, 'task').deliverables = ['Labelled images', entry]; },
    });

  const limits = [
    'Thirty Or Lower',
    'Single Buys To Thirty',
    'Sub-Thirty Buys',
    'Sub Thirty Buys',
    'Thirty Highest',
    'Thirty-Five Hard Stop',
    'Hard Stop Thirty Five',
    'Not Past Thirty',
    'Buys Until Thirty',
    'Thirty And No Further',
    'Thirty A Buy',
    'Top 30 Or Lower',
    'Q1 Thirty Or Lower',
    'Max Thirty',
    'Thirty Cap Ltd',
    'Thirty Or Lower Ltd',
    'Thirty Ltd',
    'Seven Eleven supplies',
    'Seven Seas Logistics',
    'Two design mockups',
    'Five blog posts',
  ];
  for (const entry of limits) {
    it(`"${entry}" is not within_limits as a category, a capability, a deliverable, a boundary or a note`, () => {
      notOk(asCategory(entry), 'category in the answers and the text');
      notOk(asBoundary(entry), 'boundary');
      notOk(asNote(entry), 'note');
      notOk(asCapability(entry), 'capability');
      notOk(asDeliverable(entry), 'deliverable');
    });
  }

  const names = ['Three Rivers Ltd', 'THREE RIVERS LTD', 'Three Rivers Limited', 'Seven Seas Logistics Inc.', 'Two Harbours GmbH', 'Nine Lives Pty Ltd', 'Five Stars Co'];
  for (const entry of names) {
    it(`"${entry}" stays a name in all three lists of names`, () => {
      ok(asCategory(entry));
      ok(asCapability(entry));
      ok(asDeliverable(entry));
    });
  }

  it('a name that repeats a party name of the agreement is a name, anywhere else it is a figure', () => {
    ok(
      runGolden(c1, {
        parameters: (p) => { p.seller_name = 'Seven Seas'; },
        mr: (m) => { m.service = { capabilities: ['Level 2 order book', 'seven seas'] }; },
      }),
    );
    notOk(runGolden(c1, { mr: (m) => { m.service = { capabilities: ['Level 2 order book', 'seven seas'] }; } }), 'not a party name');
    notOk(
      runGolden(c1, {
        parameters: (p) => { p.seller_name = 'Thirty Or Lower'; },
        mr: (m) => { m.service = { capabilities: ['Level 2 order book', 'Thirty Or Lower'] }; },
      }),
      'a party name that reads as a limit',
    );
  });

  it('a name with an anchored digit and no number word stays a name', () => {
    for (const entry of ['Level 2 order book', 'Top 100 symbols', 'Microsoft 365 licences', 'ISO 27001 certified vendors', 'Tier 1 suppliers']) {
      ok(asCategory(entry));
      ok(asCapability(entry));
    }
  });
});
