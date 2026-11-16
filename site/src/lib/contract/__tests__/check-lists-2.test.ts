import { describe, expect, it } from 'vitest';
import { goldens, runGolden } from './check-fixtures';

// Payment check, lists: a figure that sits in a list entry must never be within_limits just because it
// is in a list. An entry with a number in it is a name only when it has the positive shape of one, and
// only a list the templates define as a list of names may hold a name with digits.

type Json = Record<string, unknown>;
type Outcome = ReturnType<typeof runGolden>;
const g = goldens();
const d1 = g['d1-general-auth'];
const c1 = g['c1-api-access'];
const c3 = g['c3-task-execution'];
const obj = (m: Json, k: string) => m[k] as Json;

const within = (r: Outcome) => {
  expect(r.reasons).toEqual([]);
  expect(r.verdict).toBe('within_limits');
};
const notWithin = (r: Outcome, label: string) => expect(r.verdict, label).not.toBe('within_limits');

/** The entry as a category in the answers and in the text, as a capability, and as a deliverable. */
const asCategory = (entry: string) =>
  runGolden(d1, {
    parameters: (p) => { p.categories = ['procurement', entry]; },
    mr: (m) => { obj(m, 'scope_of_delegation').approved_categories = ['procurement', entry]; },
  });
const asCapability = (entry: string) => runGolden(c1, { mr: (m) => { m.service = { capabilities: ['Level 2 order book', entry] }; } });
const asDeliverable = (entry: string) =>
  runGolden(c3, {
    parameters: (p) => { p.deliverables = ['Labelled images', entry]; },
    mr: (m) => { obj(m, 'task').deliverables = ['Labelled images', entry]; },
  });

describe('a number word in a list entry is a figure unless the entry is a name', () => {
  const limits = [
    'cloud (ceiling of thirty)',
    'thirty or less',
    'thirty tops',
    'thirty total',
    'nothing beyond thirty',
    'twenty apiece',
    'thirty',
    'thirty monthly ceiling',
    'purchases of thirty or less',
    'thirty a head',
    'twenty-five',
    'hardware within thirty',
    'Thirty Tops',
    'Ceiling Of Thirty',
    'Thirty Or Less',
    'Thirty a head',
    'THIRTY TOTAL',
    'Twenty Five',
    'Five hundred per order',
  ];
  for (const entry of limits) {
    it(`"${entry}" is not within_limits as a category answer, a capability or a deliverable`, () => {
      notWithin(asCategory(entry), `category ${entry}`);
      notWithin(asCapability(entry), `capability ${entry}`);
      notWithin(asDeliverable(entry), `deliverable ${entry}`);
    });
  }

  it('a note that spells a limit out is not within_limits', () => {
    notWithin(runGolden(d1, { mr: (m) => { m.notes = ['thirty monthly ceiling']; } }), 'notes');
  });

  const names = ['Three Rivers Ltd', 'One-stop shop', 'THREE RIVERS LTD'];
  for (const entry of names) {
    it(`"${entry}" stays a name in all three lists`, () => {
      within(asCategory(entry));
      within(asCapability(entry));
      within(asDeliverable(entry));
    });
  }

  // A strong number word needs a company word at the end or a party name to repeat: these were names before.
  for (const entry of ['Seven Seas Logistics', 'Seven Eleven supplies']) {
    it(`"${entry}" is a figure in all three lists`, () => {
      notWithin(asCategory(entry), `category ${entry}`);
      notWithin(asCapability(entry), `capability ${entry}`);
      notWithin(asDeliverable(entry), `deliverable ${entry}`);
    });
  }
});

describe('digits in a list entry are a figure unless they are part of a name or a standard', () => {
  const names = ['Level 2 order book', 'Top 100 symbols', 'Microsoft 365 licences', 'B2B SaaS', 'Web3 infrastructure', 'AWS EC2 instances', 'Tier 1 suppliers', 'ISO 27001 certified vendors'];
  for (const entry of names) {
    it(`"${entry}" stays a name in a list of names`, () => {
      within(asCategory(entry));
      within(asCapability(entry));
    });
  }

  const figures = ['3M Company', 'Acme 500', 'Summit 2026', 'Level 2 30 or less', 'Tier 1 cap', 'ISO 27001 plus 500', '30', '2000', '１２'];
  for (const entry of figures) {
    it(`"${entry}" is not within_limits in a list of names`, () => {
      notWithin(asCategory(entry), `category ${entry}`);
      notWithin(asCapability(entry), `capability ${entry}`);
    });
  }
});

describe('a list that is not a list of names reads every entry as a plain string', () => {
  const limits = ['Monthly ceiling: 30', 'Orders of 30 or less', 'single purchases of 30 or less', 'thirty monthly ceiling', 'thirty or less'];
  // Under these keys the check hands words back to the caller unread, so only an entry with a digit in it is decided.
  const wordKeys = ['special_terms', 'additional_terms', 'limitations'];
  const keys = ['notes', 'remarks', 'obligations', 'agent_obligations', 'key_terms', 'summary_points', 'scope_notes', ...wordKeys];

  for (const key of keys) {
    it(`${key} at the top and under the scope is not within_limits`, () => {
      for (const entry of limits.filter((e) => !wordKeys.includes(key) || /\d/.test(e))) {
        notWithin(runGolden(d1, { mr: (m) => { m[key] = [entry]; } }), `top ${key} ${entry}`);
        notWithin(runGolden(d1, { mr: (m) => { obj(m, 'scope_of_delegation')[key] = [entry]; } }), `scope ${key} ${entry}`);
      }
    });
  }

  it('service.features and other lists of c1 are not within_limits', () => {
    for (const key of ['features', 'highlights', 'benefits']) {
      for (const entry of limits) {
        notWithin(runGolden(c1, { mr: (m) => { m.service = { [key]: [entry] }; } }), `${key} ${entry}`);
      }
    }
  });

  it('the same text as a plain string is not within_limits either', () => {
    for (const entry of ['Monthly ceiling: 30', 'Orders of 30 or less']) {
      notWithin(runGolden(d1, { mr: (m) => { m.notes = entry; } }), entry);
    }
  });

  it('a name with digits is a figure there, and a name without digits stays words', () => {
    notWithin(runGolden(d1, { mr: (m) => { m.notes = ['Level 2 order book']; } }), 'digits');
    notWithin(runGolden(c1, { mr: (m) => { m.service = { features: ['Level 2 order book'] }; } }), 'digits under features');
    within(runGolden(c1, { mr: (m) => { m.service = { features: ['Order book', 'Rivers Ltd'] }; } }));
    notWithin(runGolden(c1, { mr: (m) => { m.service = { features: ['Order book', 'Three Rivers Ltd'] }; } }), 'a number word under features');
  });

  it('a list of names that the templates define may hold a name with digits', () => {
    within(runGolden(c1, { mr: (m) => { m.service = { capabilities: ['Level 2 order book', 'Top 100 symbols'] }; } }));
    within(runGolden(d1, { mr: (m) => { obj(m, 'agent_identification').capabilities = { supported: ['Level 2 order book'] }; } }));
  });
});

describe('a number word in a list entry under a restriction-like key is a figure like its digit form', () => {
  const entries = ['thirty or less', 'Five hundred per order', 'purchases of thirty or less', 'single purchases of thirty or less', 'thirty tops', 'nothing beyond thirty', 'twenty-five', 'thirty', 'hardware within thirty'];
  const lists: [string, string, (m: Json, list: string[]) => void][] = [
    ['scope_of_delegation.boundaries', 'boundaries', (m, list) => { obj(m, 'scope_of_delegation').boundaries = ['The Agent may not enter long-term leases.', ...list]; }],
    ['conditions', 'conditions', (m, list) => { m.conditions = list; }],
    ['scope_of_delegation.conditions', 'conditions', (m, list) => { obj(m, 'scope_of_delegation').conditions = list; }],
    ['scope_of_delegation.enumerated_actions', 'enumerated_actions', (m, list) => { obj(m, 'scope_of_delegation').enumerated_actions = ['pay_invoice', 'purchase_compute', ...list]; }],
  ];
  for (const [path, , edit] of lists) {
    it(`${path}: an entry that reads as a limit is incomplete and its list is handed back`, () => {
      for (const entry of entries) {
        const r = runGolden(d1, { mr: (m) => edit(m, [entry]) });
        expect(r.verdict, `${path} ${entry}`).toBe('incomplete');
        expect(r.not_checked.map((n) => n.path), `${path} ${entry}`).toContain(path);
      }
    });

    it(`${path}: the digit form and a name behave as before`, () => {
      expect(runGolden(d1, { mr: (m) => edit(m, ['purchases of 30 or less']) }).verdict).toBe('incomplete');
      expect(runGolden(d1, { mr: (m) => edit(m, ['Seven Eleven supplies']) }).verdict).toBe('incomplete');
      expect(runGolden(d1, { mr: (m) => edit(m, ['Rivers supplies']) }).verdict).toBe('within_limits');
    });
  }
});

describe('a plain string that spells a number in words is a figure', () => {
  const limits = ['thirty monthly ceiling', 'no more than thirty per order', 'up to twenty', 'a ceiling of thirty', 'maximum of thirty', 'capped at forty', 'twenty tops', 'thirty total', 'thirty or less', 'under thirty', 'budget of fifty', 'thirty per transaction', 'Ceiling: Thirty'];
  for (const key of ['notes', 'remarks', 'description', 'summary_note']) {
    it(`${key} = a limit in words is not within_limits`, () => {
      for (const text of limits) {
        notWithin(runGolden(d1, { mr: (m) => { m[key] = text; } }), `top ${key} ${text}`);
        notWithin(runGolden(c1, { mr: (m) => { m.service = { [key]: text }; } }), `c1 ${key} ${text}`);
      }
    });
  }

  it('a free-text answer that spells a limit in words is not within_limits', () => {
    for (const text of limits) notWithin(runGolden(d1, { parameters: (p) => { p.scope = `Buy office supplies, ${text}`; } }), text);
  });

  it('a duration, or prose without a number word, stays as it was', () => {
    for (const text of ["thirty days' notice", 'thirty days written notice', 'Rivers Ltd is the supplier', 'monthly reports']) {
      within(runGolden(d1, { mr: (m) => { m.notes = text; } }));
    }
  });

  it('a number word without limit wording is a figure too, like its digit form', () => {
    for (const text of ['Two parties agree to this', 'Seven Eleven supplies', 'Three Rivers Ltd is the supplier', 'twenty monthly reports']) {
      notWithin(runGolden(d1, { mr: (m) => { m.notes = text; } }), text);
    }
  });
});
