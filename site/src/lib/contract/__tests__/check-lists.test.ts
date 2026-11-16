import { describe, expect, it } from 'vitest';
import { goldens, runGolden } from './check-fixtures';

type Json = Record<string, unknown>;
const g = goldens();
const p2 = g['p2-power-of-attorney'];
const d1 = g['d1-general-auth'];
const d3 = g['d3-fleet-auth'];
const paths = (r: ReturnType<typeof runGolden>) => r.not_checked.map((n) => n.path);

describe('a prohibited list is compared with the category as well as the action', () => {
  it('a category that is on a prohibited list is out_of_scope', () => {
    for (const entry of ['gambling', 'No gambling', 'Do not gamble: gambling']) {
      const r = runGolden(p2, { mr: (m) => { (m.scope_of_authority as Json).prohibited_actions = [entry]; }, tx: { category: 'gambling', action: 'pay_invoice' } });
      if (entry.startsWith('Do not gamble')) expect(r.verdict, entry).not.toBe('out_of_scope');
      else {
        expect(r.verdict, entry).toBe('out_of_scope');
        expect(r.reasons.join(' ')).toContain('The category "gambling" is prohibited');
      }
    }
  });

  it('a prohibited entry wins over the same category on the approved list', () => {
    const r = runGolden(d1, { mr: (m) => { (m.scope_of_delegation as Json).prohibited_actions = ['procurement']; } });
    expect(r.verdict).toBe('out_of_scope');
    expect(r.reasons.join(' ')).toContain('prohibited');
  });

  it('an entry that matches neither the action nor the category is handed back, not decided', () => {
    const r = runGolden(p2, { mr: (m) => { (m.scope_of_authority as Json).prohibited_actions = ['gambling']; }, tx: { category: 'office_supplies', action: 'pay_invoice' } });
    expect(r.verdict).toBe('within_limits');
    expect(paths(r)).toContain('scope_of_authority.prohibited_actions');
  });
});

describe('prohibited lists under other names, at any depth', () => {
  const shapes: [string, (m: Json) => void][] = [
    ['top-level prohibited', (m) => { m.prohibited = ['gambling']; }],
    ['prohibited_activities', (m) => { m.prohibited_activities = ['gambling']; }],
    ['forbiddenActions', (m) => { m.forbiddenActions = ['gambling']; }],
    ['banned', (m) => { m.banned = ['gambling']; }],
    ['denylist', (m) => { m.denylist = ['gambling']; }],
    ['restrictions.prohibited_actions', (m) => { m.restrictions = { prohibited_actions: ['gambling'] }; }],
    ['scope.prohibited_actions', (m) => { m.scope = { prohibited_actions: ['gambling'] }; }],
    ['nested rules', (m) => { m.terms = { rules: { Prohibited: ['gambling'] } }; }],
  ];
  for (const slug of ['d1-general-auth', 'd2-limited-service', 'c1-api-access', 'c3-task-execution'] as const) {
    for (const [name, edit] of shapes) {
      it(`${slug}: ${name}`, () => {
        const golden = g[slug];
        const r = runGolden(golden, { mr: edit, tx: { action: 'gambling', category: undefined } });
        expect(r.verdict).toBe('out_of_scope');
      });
    }
  }

  it('a prohibited list of places or parties is words: handed back and never matched', () => {
    for (const key of ['prohibited_regions', 'forbidden_countries', 'banned_vendors', 'prohibited_counterparties']) {
      const r = runGolden(p2, { mr: (m) => { m[key] = ['gambling']; }, tx: { action: 'gambling' } });
      expect(r.verdict, key).not.toBe('out_of_scope');
      expect(paths(r), key).toContain(key);
    }
  });

  it('a prohibited list under another word key is words', () => {
    const r = runGolden(p2, { mr: (m) => { m.geographic_limitations = { prohibited: ['gambling'] }; }, tx: { action: 'gambling' } });
    expect(r.verdict).not.toBe('out_of_scope');
  });
});

describe('a category list that only the agreement text holds', () => {
  const lists: [string, typeof d3, (m: Json) => void][] = [
    ['d3 top-level categories', d3, (m) => { m.categories = ['compute']; }],
    ['p2 under scope_of_delegation', p2, (m) => { m.scope_of_delegation = { approved_categories: ['compute'] }; }],
    ['p2 under scope_of_authority', p2, (m) => { (m.scope_of_authority as Json).approved_categories = ['compute']; }],
  ];

  for (const [name, golden, edit] of lists) {
    it(`${name}: a category that is not on it is incomplete, never within_limits`, () => {
      const r = runGolden(golden, { mr: edit, tx: { category: 'gambling' } });
      expect(r.verdict).toBe('incomplete');
      expect(r.reasons.join(' ')).toContain('approved list in the agreement text');
      expect(paths(r).some((p) => /categories$/.test(p))).toBe(true);
    });

    it(`${name}: no category sent is incomplete`, () => {
      const r = runGolden(golden, { mr: edit, tx: { category: undefined } });
      expect(r.verdict).toBe('incomplete');
      expect(r.reasons.join(' ')).toContain('No category was sent');
    });

    it(`${name}: a category on it passes`, () => {
      const r = runGolden(golden, { mr: edit, tx: { category: 'Compute' } });
      expect(r.verdict).toBe('within_limits');
    });
  }

  it('two lists that differ are incomplete', () => {
    const r = runGolden(d3, { mr: (m) => { m.categories = ['compute']; m.scope_of_delegation = { ...(m.scope_of_delegation as Json), approved_categories: ['storage'] }; }, tx: { category: 'compute' } });
    expect(r.verdict).toBe('incomplete');
  });

  it('the form answers list decides when the template has one, and the text must repeat it', () => {
    expect(runGolden(d1, { tx: { category: 'gambling' } }).verdict).toBe('out_of_scope');
    expect(runGolden(d1, { mr: (m) => { (m.scope_of_delegation as Json).approved_categories = ['gambling']; } }).verdict).toBe('incomplete');
  });
});
