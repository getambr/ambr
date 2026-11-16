import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkTransaction, termsFromAgreement, type CheckOutcome, type CheckTransaction } from '../check-terms';
import { COMMON_ANSWERS, TEMPLATE_RULES } from '../check-template-map';
import { MAX_DEPTH, MAX_NODES } from '../check-accounting';
import { goldens, NOW, type Golden } from './check-fixtures';

// The payment check reads limits from a contract's form answers and cross-checks
// machine_readable. These tests run realistic agreements (one per template the
// check reads) through the whole path: terms, then verdict.

type Json = Record<string, unknown>;
const clone = <T,>(v: T): T => structuredClone(v);
/** A letters-only tag for a key name: a digit in a key is a figure. */
const tag = (i: number) => String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + (Math.floor(i / 26) % 26));

function run(g: Golden, edit: { parameters?: (p: Json) => void; mr?: (m: Json) => void; tx?: Partial<CheckTransaction>; createdAt?: string } = {}, status = 'active'): CheckOutcome {
  const parameters = clone(g.parameters);
  const machineReadable = clone(g.machineReadable);
  edit.parameters?.(parameters);
  edit.mr?.(machineReadable);
  const terms = termsFromAgreement({ templateSlug: g.slug, parameters, machineReadable, createdAt: edit.createdAt ?? g.createdAt });
  return checkTransaction(terms, status, { ...g.tx, ...edit.tx }, NOW);
}

const all = Object.values(goldens());
const line = (r: CheckOutcome, rule: string) => r.checks.filter((c) => c.rule === rule);

describe('golden agreements, one per template', () => {
  for (const g of all) {
    describe(g.slug, () => {
      it('is within_limits for a payment inside every limit, with every figure accounted for', () => {
        const r = run(g);
        expect(r.reasons).toEqual([]);
        expect(r.verdict).toBe('within_limits');
        expect(r.checks.some((c) => c.result === 'pass' && ['per_transaction_limit', 'monthly_limit', 'total_budget', 'price'].includes(c.rule))).toBe(true);
      });

      it('is incomplete when the agreement text states a figure no form answer explains', () => {
        const r = run(g, { mr: (m) => { m.payment_terms = { max_per_invoice: 500 }; } });
        expect(r.verdict).toBe('incomplete');
        expect(r.reasons.join(' ')).toContain('payment_terms.max_per_invoice');
      });

      it('is incomplete when the form answers hold a key the check does not know', () => {
        const r = run(g, { parameters: (p) => { p.daily_limit = 100; } });
        expect(r.verdict).toBe('incomplete');
        expect(r.reasons.join(' ')).toContain('daily_limit');
      });
    });
  }

  it('d1: over the per-transaction cap is out_of_scope', () => {
    const r = run(goldens()['d1-general-auth'], { tx: { amount: 150 } });
    expect(r.verdict).toBe('out_of_scope');
    expect(line(r, 'per_transaction_limit')[0].result).toBe('fail');
  });

  it('d1: over the monthly cap is out_of_scope', () => {
    expect(run(goldens()['d1-general-auth'], { tx: { amount: 50, period_spent: 980 } }).verdict).toBe('out_of_scope');
  });

  it('d1: a category outside the form answers is out_of_scope', () => {
    expect(run(goldens()['d1-general-auth'], { tx: { category: 'gambling' } }).verdict).toBe('out_of_scope');
  });

  it('p2: a payment over its optional cap is out_of_scope, and one over the approval threshold needs approval', () => {
    const g = goldens()['p2-power-of-attorney'];
    expect(run(g, { tx: { amount: 150 } }).verdict).toBe('out_of_scope');
    expect(run(g, { tx: { amount: 70 } }).verdict).toBe('needs_approval');
  });

  it('p2: with no limits in the form answers nothing can be evaluated, so it is never within_limits', () => {
    const r = run(goldens()['p2-power-of-attorney'], {
      parameters: (p) => { delete p.spending_limit_per_tx; delete p.spending_limit_monthly; delete p.requires_approval_above; },
      mr: (m) => { m.financial_terms = { currency: 'USD' }; },
    });
    expect(r.verdict).toBe('incomplete');
    expect(r.reasons.join(' ')).toContain('no spending limit or price');
  });

  it('d1: needs_approval above the approval threshold, inside the caps', () => {
    const r = run(goldens()['d1-general-auth'], { tx: { amount: 70 } });
    expect(r.verdict).toBe('needs_approval');
    expect(line(r, 'approval_threshold')[0].value).toBe(70);
  });

  it('d2: over the total budget is out_of_scope; the request carries no counterparty, so named ones are incomplete', () => {
    const g = goldens()['d2-limited-service'];
    expect(run(g, { tx: { amount: 400, period_spent: 4700 } }).verdict).toBe('out_of_scope');
    expect(run(g, { tx: { amount: 6000, period_spent: undefined } }).verdict).toBe('out_of_scope');
    const named = run(g, { parameters: (p) => { p.permitted_counterparties = ['Vendor One']; } });
    expect(named.verdict).toBe('incomplete');
    expect(line(named, 'counterparty')[0].result).toBe('not_evaluated');
    expect(run(g, { tx: { period_spent: undefined } }).verdict).toBe('incomplete');
  });

  it('d3: over the per-agent cap is out_of_scope; over the escalation threshold needs approval', () => {
    const g = goldens()['d3-fleet-auth'];
    expect(run(g, { tx: { amount: 600 } }).verdict).toBe('out_of_scope');
    const r = run(g, { tx: { amount: 400 } });
    expect(r.verdict).toBe('needs_approval');
    expect(line(r, 'escalation_threshold')[0].value).toBe(400);
  });

  it('c1: a payment that is a whole number of calls passes; a fraction of a call over the price cannot be placed', () => {
    const g = goldens()['c1-api-access'];
    expect(run(g, { tx: { amount: 0.03 } }).verdict).toBe('within_limits');
    const odd = run(g, { tx: { amount: 0.025 } });
    expect(odd.verdict).toBe('incomplete');
    expect(line(odd, 'price')[0].result).toBe('not_evaluated');
    expect(run(g, { tx: { amount: 0.05, period_spent: 499.99 } }).verdict).toBe('out_of_scope');
  });

  it('c1: a model other than per-call has no price per call the check can compare', () => {
    const r = run(goldens()['c1-api-access'], { parameters: (p) => { p.pricing_model = 'monthly-subscription'; }, mr: (m) => { (m.api as Json).pricing_model = 'monthly-subscription'; } });
    expect(r.verdict).toBe('incomplete');
    expect(r.reasons.join(' ')).toContain('per-call pricing model');
  });

  it('c2: over the monthly fee is out_of_scope; a fee that scales is not a ceiling', () => {
    const g = goldens()['c2-compute-sla'];
    expect(run(g, { tx: { amount: 1200, period_spent: 1000 } }).verdict).toBe('out_of_scope');
    const scaling = run(g, { parameters: (p) => { p.auto_scaling = true; p.max_scaling_multiplier = 2; } });
    expect(scaling.verdict).toBe('incomplete');
  });

  it('c3: over the total price is out_of_scope; milestones are a schedule the check does not match', () => {
    const g = goldens()['c3-task-execution'];
    expect(run(g, { tx: { amount: 800, period_spent: 100 } }).verdict).toBe('out_of_scope');
    const m = run(g, { parameters: (p) => { p.milestones = [{ name: 'First half', amount: 400, deadline: '2026-07-01' }]; } });
    expect(m.verdict).toBe('incomplete');
  });

  it('a status or window failure is still out_of_scope whatever else could not be read', () => {
    const g = goldens()['d1-general-auth'];
    expect(run(g, {}, 'terminated').verdict).toBe('out_of_scope');
    const unknown = checkTransaction(termsFromAgreement({ templateSlug: 'a1-service-purchase', parameters: { fee: 1 } }), 'expired', { amount: 1 }, NOW);
    expect(unknown.verdict).toBe('out_of_scope');
  });
});

describe('no form answers, or a template the check does not read, are never within_limits', () => {
  const g = goldens()['d1-general-auth'];
  const verdict = (input: Parameters<typeof termsFromAgreement>[0]) =>
    checkTransaction(termsFromAgreement({ machineReadable: g.machineReadable, createdAt: g.createdAt, ...input }), 'active', g.tx, NOW);

  it.each([
    ['null parameters', { templateSlug: g.slug, parameters: null }],
    ['missing parameters', { templateSlug: g.slug }],
    ['parameters that are not an object', { templateSlug: g.slug, parameters: 'cap 100' }],
    ['parameters that are a list', { templateSlug: g.slug, parameters: [100] }],
    ['an unknown template', { templateSlug: 'a1-service-purchase', parameters: g.parameters }],
    ['no template', { parameters: g.parameters }],
    ['an object-prototype name as the template', { templateSlug: 'constructor', parameters: g.parameters }],
  ] as const)('%s', (_name, input) => {
    const r = verdict(input);
    expect(r.verdict).toBe('incomplete');
    expect(r.checks.some((c) => c.rule === 'agreement_terms' && c.result === 'not_evaluated')).toBe(true);
    expect(r.reasons.length).toBeGreaterThan(0);
  });
});

describe('form answers are read as the kind of answer the template says', () => {
  const g = goldens()['d1-general-auth'];
  const withAnswer = (key: string, value: unknown) => run(g, { parameters: (p) => { p[key] = value; } });

  it('reads a plain decimal string as an amount and rejects every other string', () => {
    expect(withAnswer('spending_limit_per_tx', '100').verdict).toBe('within_limits');
    for (const bad of ['5e2', '$100', '1,000', '100 USD', 'abc', ' ', '-5', '0x10']) {
      const r = withAnswer('spending_limit_per_tx', bad);
      expect(r.verdict, bad).toBe('incomplete');
      expect(r.reasons.join(' '), bad).toContain('spending_limit_per_tx');
    }
  });

  it('rejects NaN, Infinity, a list and an object as an amount', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, [100], { amount: 100 }, true]) {
      expect(withAnswer('spending_limit_monthly', bad).verdict).toBe('incomplete');
    }
  });

  it('reports a required answer that is not stored', () => {
    const r = run(g, { parameters: (p) => { delete p.spending_limit_monthly; } });
    expect(r.verdict).toBe('incomplete');
    expect(r.reasons.join(' ')).toContain('spending_limit_monthly (required, but not stored)');
  });

  it('a cap of zero or less is a placeholder: incomplete, never a winning cap', () => {
    for (const bad of [0, -1]) {
      for (const key of ['spending_limit_per_tx', 'spending_limit_monthly']) {
        const r = withAnswer(key, bad);
        expect(r.verdict, `${key}=${bad}`).toBe('incomplete');
        expect(r.reasons.join(' ')).toContain(key);
      }
    }
  });

  it('an approval threshold of zero means every payment above nothing needs approval', () => {
    const r = run(g, { parameters: (p) => { p.requires_approval_above = 0; }, mr: (m) => { (m.financial_terms as Json).requires_approval_above = 0; } });
    expect(r.verdict).toBe('needs_approval');
    expect(run(g, { parameters: (p) => { p.requires_approval_above = 0; }, mr: (m) => { (m.financial_terms as Json).requires_approval_above = 0; }, tx: { amount: 0 } }).verdict).toBe('within_limits');
  });

  it('a negative approval or escalation threshold is invalid: incomplete', () => {
    expect(withAnswer('requires_approval_above', -5).verdict).toBe('incomplete');
    const d3 = goldens()['d3-fleet-auth'];
    const r = run(d3, { parameters: (p) => { p.escalation_threshold = -1; } });
    expect(r.verdict).toBe('incomplete');
    expect(r.reasons.join(' ')).toContain('escalation_threshold (negative)');
  });

  it('reports a list answer that is not a list of text, and a flag that is not yes or no', () => {
    expect(withAnswer('categories', 'procurement').verdict).toBe('incomplete');
    expect(withAnswer('categories', ['procurement', 7]).verdict).toBe('incomplete');
    expect(withAnswer('sub_delegation_allowed', 'no').verdict).toBe('incomplete');
  });

  it('free text with a figure in it is a figure the check cannot place', () => {
    const r = withAnswer('scope', 'Pay vendors up to 500 per invoice');
    expect(r.verdict).toBe('incomplete');
    expect(r.reasons.join(' ')).toContain('scope (text with a figure in it');
  });

  it('names at most 20 unusable answers, and survives a list answer of 200,000 entries', () => {
    const r = run(g, {
      parameters: (p) => {
        for (let i = 0; i < 30; i++) p[`unknown_${i}`] = i + 1;
        p.categories = ['procurement', ...Array.from({ length: 200_000 }, (_, i) => `category_${i.toString(21).replace(/[0-9a-k]/g, (c) => 'bcdfghjklmnpqrstvwxzy'[parseInt(c, 21)])}`)];
      },
    });
    expect(r.verdict).toBe('incomplete');
    expect(r.reasons.join(' ')).toContain('(and 10 more)');
  });

  it('an object-prototype name as an answer key is an unknown key, not a known one', () => {
    const params = JSON.parse(`{"constructor": 5, "__proto__": 7}`);
    const r = run(g, { parameters: (p) => { Object.assign(p, params); } });
    expect(r.verdict).toBe('incomplete');
    expect(r.reasons.join(' ')).toContain('constructor');
  });
});

describe('what an approval and an escalation threshold do', () => {
  const base = { mayDo: [], mayNotDo: [], categories: [] };
  const usd = (amount: number) => ({ amount, currency: 'USD' });
  const run2 = (terms: object, tx: CheckTransaction) => checkTransaction({ ...base, ...terms }, 'active', tx, NOW);

  it('evaluates both, each on its own basis, and needs approval when either is exceeded', () => {
    const terms = { perTxLimit: usd(1000), approvalAbove: usd(500), escalationAbove: usd(200) };
    const onlyEscalation = run2(terms, { amount: 300, currency: 'USD' });
    expect(onlyEscalation.verdict).toBe('needs_approval');
    expect(line(onlyEscalation, 'approval_threshold')[0].result).toBe('pass');
    expect(line(onlyEscalation, 'escalation_threshold')[0].value).toBe(300);
    const both = run2(terms, { amount: 600, currency: 'USD' });
    expect(both.reasons.filter((r) => /threshold/.test(r))).toHaveLength(2);
    expect(run2(terms, { amount: 100, currency: 'USD' }).verdict).toBe('within_limits');
  });

  it('judges a threshold on the period as well when its basis is unclear, and otherwise on the payment', () => {
    const terms = { perTxLimit: usd(1000), escalationAbove: usd(500), escalationStrict: true };
    expect(run2(terms, { amount: 100, currency: 'USD', period_spent: 450 }).verdict).toBe('needs_approval');
    expect(run2(terms, { amount: 100, currency: 'USD' }).verdict).toBe('incomplete');
    expect(run2({ ...terms, escalationStrict: undefined }, { amount: 100, currency: 'USD', period_spent: 450 }).verdict).toBe('within_limits');
  });

  it('applies the strictest reading when the agreement text puts basis wording beside the escalation threshold (d3)', () => {
    const g = goldens()['d3-fleet-auth'];
    const r = run(g, { mr: (m) => { (m.financial_terms as Json).escalation_required_above = 'monthly_aggregate'; }, tx: { amount: 100, period_spent: 250 } });
    expect(r.verdict).toBe('needs_approval');
  });
});

describe('currency', () => {
  const g = goldens()['d1-general-auth'];

  it('never compares a payment in another currency with a USD limit', () => {
    for (const currency of ['ETH', 'GBP', 'EUR']) {
      const r = run(g, { tx: { currency, amount: 40 } });
      expect(r.verdict, currency).toBe('incomplete');
      expect(line(r, 'currency')[0].result).toBe('not_evaluated');
      expect(line(r, 'per_transaction_limit')[0].result).toBe('not_evaluated');
      expect(line(r, 'monthly_limit')[0].result).toBe('not_evaluated');
      // Even a huge amount is not called out_of_scope against a different currency.
      expect(run(g, { tx: { currency, amount: 1_000_000 } }).verdict).toBe('incomplete');
    }
  });

  it('counts USD and USDC as one', () => {
    expect(run(g, { tx: { currency: 'usdc' } }).verdict).toBe('within_limits');
  });

  it('compares a price in the template currency only with a payment in that currency', () => {
    const c1 = goldens()['c1-api-access'];
    const eur = { parameters: (p: Json) => { p.currency = 'EUR'; }, mr: (m: Json) => { (m.financial_terms as Json).currency = 'EUR'; } };
    const r = run(c1, { ...eur, tx: { currency: 'EUR', amount: 0.03 } });
    expect(line(r, 'price')[0].result).toBe('pass');
    expect(line(r, 'monthly_limit')[0].result).toBe('not_evaluated');
    expect(r.verdict).toBe('incomplete');
  });
});

describe('restrictions written in words in the agreement text', () => {
  const g = goldens()['d1-general-auth'];
  const withScope = (extra: Json) => run(g, { mr: (m) => { Object.assign(m.scope_of_delegation as Json, extra); } });
  const paths = (r: CheckOutcome) => r.not_checked.map((n) => n.path);

  it.each([
    ['geographic_limitations', 'EU vendors only'],
    ['excluded_counterparties', ['Casino Ltd']],
    ['permitted_vendors', ['Vendor One']],
    ['exclusions', 'no gambling'],
    ['geographic_restrictions', { regions: ['EU'] }],
  ])('%s never decides the verdict and is handed back by path', (key, value) => {
    const r = withScope({ [key]: value });
    expect(r.verdict).toBe('within_limits');
    expect(paths(r)).toContain(`scope_of_delegation.${key}`);
  });

  it('an empty restriction is nothing to evaluate and is not listed', () => {
    const r = withScope({ geographic_limitations: '', excluded_counterparties: [] });
    expect(r.verdict).toBe('within_limits');
    expect(paths(r).filter((p) => /geographic|excluded/.test(p))).toEqual([]);
  });

  it('digit-free text that carries no restriction does not matter', () => {
    const r = withScope({ notes: 'Prepared for the finance team' });
    expect(r.verdict).toBe('within_limits');
    expect(paths(r)).not.toContain('scope_of_delegation.notes');
  });

  it('a list of categories in the text must equal the form answers as a set', () => {
    expect(withScope({ approved_categories: ['Cloud', 'procurement'] }).verdict).toBe('within_limits');
    for (const list of [['procurement', 'cloud', 'travel'], ['procurement']]) {
      const r = withScope({ approved_categories: list });
      expect(r.verdict).toBe('incomplete');
      expect(r.reasons.join(' ')).toContain('differs from the form answers');
    }
  });
});

describe('actions', () => {
  const g = goldens()['d1-general-auth'];
  const withActions = (authority: Json, action: string) =>
    run(g, {
      mr: (m) => { delete (m.scope_of_delegation as Json).enumerated_actions; m.scope_of_authority = authority; },
      tx: { action },
    });

  it.each([
    [['Transfer funds'], 'transfer_funds'],
    [['transfer_funds'], 'Transfer funds'],
    [['No gambling'], 'gambling'],
    [['Do not transfer funds'], 'Transfer funds'],
    [['never gamble.'], 'gamble'],
    [["Don't withdraw"], 'withdraw'],
    [['Avoid: wire transfers'], 'wire-transfers'],
    [['Not allowed'], 'allowed'],
    [['without refunds'], 'refunds'],
    [['Prohibited: gambling'], 'Gambling'],
  ])('a prohibited entry %j matches the action %s: out_of_scope', (entries, action) => {
    const r = withActions({ prohibited_actions: entries }, action);
    expect(r.verdict).toBe('out_of_scope');
    expect(line(r, 'action')[0].result).toBe('fail');
  });

  it('a prohibited list of plain names does not block an action that is not on it', () => {
    expect(withActions({ prohibited_actions: ['Transfer funds', 'Gambling'], permitted_actions: ['purchase_compute'] }, 'purchase_compute').verdict).toBe('within_limits');
  });

  it('recognises action lists under camelCase and capitalised keys', () => {
    const r = run(g, { mr: (m) => { m.ScopeOfAuthority = { ProhibitedActions: ['Prohibited: Gambling'] }; }, tx: { action: 'gambling' } });
    expect(r.verdict).toBe('out_of_scope');
    const camel = run(g, { mr: (m) => { m.scopeOfAuthority = { prohibitedActions: ['do not gamble'] }; }, tx: { action: 'gamble' } });
    expect(camel.verdict).toBe('out_of_scope');
  });

  it('a prohibited entry that does not match exactly never decides, and is handed back to compare', () => {
    const r = withActions({ prohibited_actions: ['Do not exceed the agreed budget without written approval'] }, 'pay_invoice');
    expect(r.verdict).toBe('within_limits');
    expect(r.not_checked).toContainEqual(expect.objectContaining({ kind: 'list_entry', path: 'scope_of_authority.prohibited_actions' }));
  });

  it('a prohibited entry the action does not match leaves it unconfirmed but not blocked', () => {
    expect(withActions({ prohibited_actions: ['No gambling'] }, 'pay_invoice').verdict).toBe('within_limits');
  });

  it('an action that is not on a permitted list found only in the agreement text is incomplete, never a verdict on words', () => {
    const r = withActions({ permitted_actions: ['purchase_compute'] }, 'pay_invoice');
    expect(r.verdict).toBe('incomplete');
    expect(r.not_checked).toContainEqual(expect.objectContaining({ kind: 'list_entry', path: 'scope_of_authority.permitted_actions' }));
  });

  it('an action that is not on a permitted list from the form answers is out_of_scope, matched exactly', () => {
    const d3 = goldens()['d3-fleet-auth'];
    const r = run(d3, { tx: { action: 'wire_transfer' } });
    expect(r.verdict).toBe('out_of_scope');
    expect(r.reasons.join(' ')).toContain("not on the agreement's list (matched exactly)");
    expect(run(d3, { tx: { action: 'Purchase Compute' } }).verdict).toBe('within_limits');
  });

  it('a category that is not on the form answers list is out_of_scope with the same reason', () => {
    const r = run(g, { tx: { category: 'travel' } });
    expect(r.verdict).toBe('out_of_scope');
    expect(r.reasons.join(' ')).toContain("not on the agreement's list (matched exactly)");
  });

  it('an action object whose description holds a figure or a condition is incomplete', () => {
    for (const description of ['Pay approved vendors up to $500 per invoice', 'Requires principal approval', 'Only for vendors in the EU']) {
      const r = withActions({ permitted_actions: [{ action: 'pay_vendor', description }] }, 'pay_vendor');
      expect(r.verdict, description).toBe('incomplete');
    }
    expect(withActions({ permitted_actions: [{ action: 'pay_vendor', notes: 'Requires principal approval above 1000 USD' }] }, 'pay_vendor').verdict).toBe('incomplete');
  });

  it('an action object with a plain description is its action', () => {
    expect(withActions({ permitted_actions: [{ action: 'pay_vendor', description: 'Pay vendors' }] }, 'pay_vendor').verdict).toBe('within_limits');
  });

  it('a condition written in words outside an action list is handed back, not decided', () => {
    const r = run(g, { mr: (m) => { m.approval_requirements = { description: 'Principal approval is required for large payments' }; } });
    expect(r.verdict).toBe('within_limits');
    expect(r.not_checked.map((n) => n.path)).toContain('approval_requirements');
  });
});

describe('fail-closed accounting', () => {
  const g = goldens()['d1-general-auth'];

  it('the same figure under another name is not explained', () => {
    const r = run(g, { mr: (m) => { (m.financial_terms as Json).max_daily = 100; } });
    expect(r.verdict).toBe('incomplete');
    expect(r.reasons.join(' ')).toContain('financial_terms.max_daily');
  });

  it('a figure equal to the per-transaction answer is explained only under that rule\'s names or as an amount inside one', () => {
    expect(run(g, { mr: (m) => { (m.financial_terms as Json).spending_limit_per_tx = { amount: 100, currency: 'USD' }; } }).verdict).toBe('within_limits');
    expect(run(g, { mr: (m) => { (m.financial_terms as Json).spending_limit_per_tx = 90; } }).verdict).toBe('incomplete');
    // 1000 is the monthly answer; written as the per-transaction limit it is another figure.
    expect(run(g, { mr: (m) => { (m.financial_terms as Json).spending_limit_per_tx = 1000; } }).verdict).toBe('incomplete');
  });

  it('text with digits is not explained unless it is a date, an id, or repeats a form answer', () => {
    expect(run(g, { mr: (m) => { m.notes_for_agent = 'up to 500 per invoice'; } }).verdict).toBe('incomplete');
    expect(run(g, { mr: (m) => { m.effective = '2026-06-01'; m.tx_hash = `0x${'c'.repeat(64)}`; } }).verdict).toBe('within_limits');
  });

  it('names at most 20 paths and counts the rest', () => {
    const many: Json = {};
    for (let i = 0; i < 30; i++) many[`k${i}`] = 7000 + i;
    const r = run(g, { mr: (m) => { m.extras = many; } });
    const reason = r.reasons.find((x) => x.includes('extras.k0')) ?? '';
    expect(reason).toContain('extras.k19');
    expect(reason).not.toContain('extras.k20,');
    expect(reason).toContain('and 10 more');
  });

  it('a nesting deeper than the cap is incomplete, not "nothing found"', () => {
    let deep: Json = { leaf: true };
    for (let i = 0; i < MAX_DEPTH + 5; i++) deep = { n: deep };
    const r = run(g, { mr: (m) => { m.deep = deep; } });
    expect(r.verdict).toBe('incomplete');
    expect(r.reasons.join(' ')).toMatch(/nested more than/);
  });

  it('a limit nested just inside the cap is still found', () => {
    let deep: Json = { cap: 123456 };
    for (let i = 0; i < MAX_DEPTH - 3; i++) deep = { n: deep };
    const r = run(g, { mr: (m) => { m.deep = deep; } });
    expect(r.verdict).toBe('incomplete');
    expect(r.reasons.join(' ')).toContain('.cap');
  });

  it('a very large agreement text is incomplete, not "nothing found"', () => {
    const r = run(g, { mr: (m) => { m.bulk = Array.from({ length: MAX_NODES + 10 }, () => true); } });
    expect(r.verdict).toBe('incomplete');
    expect(r.reasons.join(' ')).toMatch(/more than/);
  });

  it('survives a huge flat list without spreading it onto the stack', () => {
    const r = run(g, { mr: (m) => { m.flags = new Array(300_000).fill(false); } });
    expect(r.verdict).toBe('incomplete');
  });

  it('survives keys that look like object-prototype names', () => {
    const polluted = JSON.parse('{"__proto__": {"a": 1}, "constructor": {"prototype": 2}}');
    const r = run(g, { mr: (m) => { m.odd = polluted; } });
    expect(r.verdict).toBe('incomplete');
  });
});

/** Small deterministic generator: the same seed gives the same agreements and the same insertions. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Every object and list in a value, as a way to reach it. */
function containers(root: unknown): { node: Json | unknown[] }[] {
  const out: { node: Json | unknown[] }[] = [];
  const walk = (v: unknown) => {
    if (v && typeof v === 'object') {
      out.push({ node: v as Json | unknown[] });
      for (const child of Object.values(v as object)) walk(child);
    }
  };
  walk(root);
  return out;
}

describe('property: a limit-like value inserted anywhere is never within_limits', () => {
  const insertions: ((i: number) => unknown)[] = [
    (i) => 1000 + i,
    () => 37,
    (i) => `up to ${500 + i} per invoice`,
    () => 'max 250 USD',
    (i) => ({ max: 500 + i }),
    () => ({ cap: { amount: 250, currency: 'USD' } }),
    (i) => [10 + i, 20],
  ];

  it('starts from agreements that are within_limits', () => {
    for (const g of all) expect(run(g).verdict, g.slug).toBe('within_limits');
  });

  it('holds over 200 seeded insertions into the golden agreements', () => {
    const rand = mulberry32(20261109);
    for (let i = 0; i < 200; i++) {
      const g = all[i % all.length];
      const machineReadable = clone(g.machineReadable);
      const spots = containers(machineReadable);
      const { node } = spots[Math.floor(rand() * spots.length)];
      const value = insertions[Math.floor(rand() * insertions.length)](i);
      if (Array.isArray(node)) node.splice(Math.floor(rand() * (node.length + 1)), 0, value);
      else node[`extra_${tag(i)}`] = value;
      const terms = termsFromAgreement({ templateSlug: g.slug, parameters: g.parameters, machineReadable, createdAt: g.createdAt });
      const r = checkTransaction(terms, 'active', g.tx, NOW);
      expect(r.verdict, `${g.slug} #${i}: ${JSON.stringify(value)}`).not.toBe('within_limits');
    }
  });

  it('holds when the inserted text is appended to the form answers that are free text, a label or an identity', () => {
    const rand = mulberry32(7);
    let appended = 0;
    for (let i = 0; i < 60; i++) {
      const g = all[i % all.length];
      const parameters = clone(g.parameters);
      const slots = Object.keys(parameters).filter((k) => typeof parameters[k] === 'string' && !/registration|address/.test(k));
      const key = slots[Math.floor(rand() * slots.length)];
      const inserted = insertions[Math.floor(rand() * insertions.length)](i);
      const text = typeof inserted === 'string' ? inserted : JSON.stringify(inserted);
      parameters[key] = `${parameters[key] as string} ${text}`;
      appended++;
      const r = checkTransaction(termsFromAgreement({ templateSlug: g.slug, parameters, machineReadable: g.machineReadable, createdAt: g.createdAt }), 'active', g.tx, NOW);
      expect(r.verdict, `${g.slug} ${key} #${i}`).not.toBe('within_limits');
    }
    expect(appended).toBe(60);
  });
});

const paths = (r: CheckOutcome) => r.not_checked.map((n) => n.path);
const reasons = (r: CheckOutcome) => r.reasons.join(' ');

describe('the validity window comes from the form answers', () => {
  const d2 = goldens()['d2-limited-service'];
  const dates = (start: string, end: string) => ({
    parameters: (p: Json) => { p.start_date = start; p.end_date = end; },
    mr: (m: Json) => { m.duration = { start_date: start, end_date: end }; },
  });

  it('is out_of_scope before the start date and after the end date of a limited service agreement', () => {
    const early = run(d2, dates('2026-07-01', '2026-12-31'));
    expect(early.verdict).toBe('out_of_scope');
    expect(reasons(early)).toContain('has not started');
    const late = run(d2, dates('2026-01-01', '2026-06-10'));
    expect(late.verdict).toBe('out_of_scope');
    expect(reasons(late)).toContain('ended on 2026-06-10');
  });

  it('counts a compute agreement term in months from the creation time', () => {
    const c2 = goldens()['c2-compute-sla'];
    const old = run(c2, { createdAt: '2025-01-01T00:00:00Z' });
    expect(old.verdict).toBe('out_of_scope');
    expect(line(old, 'validity_window')[0].result).toBe('fail');
    expect(run(c2, { createdAt: '2026-01-01T00:00:00Z' }).verdict).toBe('within_limits');
  });

  it('lets an end date in the agreement text make the window stricter, never longer', () => {
    const r = run(d2, { mr: (m) => { (m.duration as Json).end_date = '2026-06-30'; } });
    expect(r.verdict).toBe('incomplete');
    expect(reasons(r)).toContain('differs from the form answers');
    expect(String(line(r, 'validity_window')[0].limit)).toContain('2026-06-30');
    const longer = run(d2, { ...{ parameters: (p: Json) => { p.end_date = '2026-06-10'; } }, mr: (m) => { (m.duration as Json).end_date = '2027-01-01'; } });
    expect(longer.verdict).toBe('out_of_scope');
  });

  it('is incomplete when the agreement text states a start date that contradicts the answer', () => {
    const r = run(d2, { mr: (m) => { (m.duration as Json).start_date = '2026-05-01'; } });
    expect(r.verdict).toBe('incomplete');
    expect(reasons(r)).toContain('start date');
  });

  it('never throws on a duration that cannot be an end date: it is incomplete', () => {
    const g = goldens()['d1-general-auth'];
    for (const months of [1e15, Number.MAX_SAFE_INTEGER, 100000, 1.5, 0]) {
      const edit = { parameters: (p: Json) => { p.duration_months = months; }, mr: (m: Json) => { (m.duration as Json).duration_months = months; } };
      expect(() => run(g, edit), String(months)).not.toThrow();
      expect(run(g, edit).verdict, String(months)).toBe('incomplete');
    }
  });

  it('never throws on a creation time that is not a date: it is incomplete', () => {
    const g = goldens()['d1-general-auth'];
    for (const createdAt of ['not a date', '', '275760-09-14T00:00:00Z']) {
      expect(() => run(g, { createdAt })).not.toThrow();
      expect(run(g, { createdAt }).verdict).toBe('incomplete');
    }
  });

  it('is not evaluated, without making the answer incomplete, when the agreement has no window at all', () => {
    const c1 = goldens()['c1-api-access'];
    const r = run(c1);
    expect(line(r, 'validity_window')[0].result).toBe('not_evaluated');
    expect(r.verdict).toBe('within_limits');
  });
});

describe('currency contradictions', () => {
  it('is incomplete when the agreement text states another currency than the form answers', () => {
    const d1 = goldens()['d1-general-auth'];
    const r = run(d1, { mr: (m) => { (m.financial_terms as Json).currency = 'EUR'; } });
    expect(r.verdict).toBe('incomplete');
    expect(reasons(r)).toContain('currency');
    expect(run(d1, { mr: (m) => { (m.financial_terms as Json).currency = 'usdc'; } }).verdict).toBe('within_limits');
  });

  it('uses the schema default currency for a commerce agreement with no stored currency answer', () => {
    const c1 = goldens()['c1-api-access'];
    const noAnswer = { parameters: (p: Json) => { delete p.currency; } };
    expect(run(c1, noAnswer).verdict).toBe('within_limits');
    const euro = run(c1, { ...noAnswer, mr: (m) => { (m.financial_terms as Json).currency = 'EUR'; } });
    expect(euro.verdict).toBe('incomplete');
    const c3 = goldens()['c3-task-execution'];
    expect(run(c3, { parameters: (p) => { delete p.currency; } }).verdict).toBe('within_limits');
    expect(run(c3, { parameters: (p) => { delete p.currency; }, tx: { currency: 'EUR' } }).verdict).toBe('incomplete');
  });

  it('is incomplete when the form answers state another currency than the agreement text', () => {
    const c2 = goldens()['c2-compute-sla'];
    expect(run(c2, { parameters: (p) => { p.currency = 'EUR'; } }).verdict).toBe('incomplete');
  });
});

describe('per-call price arithmetic through the whole path', () => {
  const c1 = goldens()['c1-api-access'];

  it('needs at least one call and an exact multiple of the price', () => {
    for (const [amount, verdict] of [[0.01, 'within_limits'], [12.34, 'within_limits'], [400.01, 'within_limits'], [0.005, 'incomplete'], [0.015, 'incomplete'], [400.005, 'incomplete']] as const) {
      expect(run(c1, { tx: { amount, period_spent: 0 } }).verdict, String(amount)).toBe(verdict);
    }
  });

  it('applies the monthly cap on top of the price', () => {
    expect(run(c1, { tx: { amount: 0.05, period_spent: 499.97 } }).verdict).toBe('out_of_scope');
    expect(run(c1, { tx: { amount: 0.05, period_spent: 499.95 } }).verdict).toBe('within_limits');
  });
});

describe('basis wording beside a threshold or cap', () => {
  const d1 = goldens()['d1-general-auth'];
  const beside = (extra: Json) => run(d1, { mr: (m) => { Object.assign(m.financial_terms as Json, extra); } });

  it('judges an approval threshold on the period total too, and lists the wording', () => {
    const r = beside({ approval_basis: 'monthly aggregate' });
    expect(r.verdict).toBe('needs_approval');
    expect(r.not_checked).toContainEqual(expect.objectContaining({ kind: 'basis_wording', path: 'financial_terms.approval_basis' }));
  });

  it('reads a basis written where the amount would be', () => {
    const r = run(d1, { mr: (m) => { (m.financial_terms as Json).requires_approval_above = { amount: '50.00', applies_to: 'cumulative spend this month' }; } });
    expect(r.verdict).toBe('needs_approval');
  });

  it('applies a per-transaction cap to the period when the wording names a period', () => {
    const r = beside({ per_transaction_period: 'per calendar month' });
    expect(r.verdict).toBe('out_of_scope');
    expect(reasons(r)).toContain('applies to the period');
  });

  it('is incomplete for wording beside a cap that the check cannot read', () => {
    const d2 = goldens()['d2-limited-service'];
    const r = run(d2, { mr: (m) => { (m.financial_terms as Json).budget_basis = 'at the discretion of the agent'; } });
    expect(r.verdict).toBe('incomplete');
    expect(r.not_checked).toContainEqual(expect.objectContaining({ kind: 'basis_wording', path: 'financial_terms.budget_basis' }));
  });

  it('a cap with wording that cannot be read does not hide an approval that is needed: needs_approval, also_incomplete', () => {
    const r = beside({ spending_limit_basis: 'at the discretion of the agent', approval_basis: 'monthly aggregate' });
    expect(r.verdict).toBe('needs_approval');
    expect(r.also_incomplete).toBe(true);
  });

  it('stays within_limits when the wording only says the limit is per payment, and still lists it', () => {
    const r = beside({ per_transaction_basis: 'per transaction' });
    expect(r.verdict).toBe('within_limits');
    expect(paths(r)).toContain('financial_terms.per_transaction_basis');
  });
});

describe('a task paid on completion or in another way (c3)', () => {
  const c3 = goldens()['c3-task-execution'];
  const model = (value: string) => ({ parameters: (p: Json) => { p.payment_model = value; }, mr: (m: Json) => { (m.financial_terms as Json).payment_model = value; } });

  it('must pay exactly what is left of the total price, and lists the completion condition', () => {
    const ok = run(c3);
    expect(ok.verdict).toBe('within_limits');
    expect(ok.not_checked).toContainEqual(expect.objectContaining({ kind: 'condition', path: 'payment_model', why: expect.stringContaining('completion') }));
    expect(run(c3, { tx: { amount: 700, period_spent: 100 } }).verdict).toBe('within_limits');
    expect(run(c3, { tx: { amount: 300, period_spent: 0 } }).verdict).toBe('out_of_scope');
    expect(run(c3, { tx: { amount: 800, period_spent: 100 } }).verdict).toBe('out_of_scope');
    expect(run(c3, { tx: { amount: 800, period_spent: undefined } }).verdict).toBe('within_limits');
  });

  it('treats a missing payment model as the schema default, on completion', () => {
    const r = run(c3, { parameters: (p) => { delete p.payment_model; }, tx: { amount: 300 } });
    expect(r.verdict).toBe('out_of_scope');
  });

  it('is incomplete for a milestone model, with or without milestones, and for an unknown or escrow model', () => {
    for (const value of ['milestone', 'escrow', 'barter']) {
      const r = run(c3, model(value));
      expect(r.verdict, value).toBe('incomplete');
      expect(r.not_checked, value).toContainEqual(expect.objectContaining({ kind: 'condition', path: 'payment_model' }));
    }
    const withMilestones = run(c3, { ...model('milestone'), parameters: (p) => { p.payment_model = 'milestone'; p.milestones = [{ name: 'First', amount: 400 }]; } });
    expect(withMilestones.verdict).toBe('incomplete');
  });

  it('is incomplete when the agreement text names a different model than the form answers', () => {
    const r = run(c3, { mr: (m) => { (m.financial_terms as Json).payment_model = 'upfront'; } });
    expect(r.verdict).toBe('incomplete');
  });

  it('pays up front like any other total price', () => {
    expect(run(c3, { ...model('upfront'), tx: { amount: 300, period_spent: 100 } }).verdict).toBe('within_limits');
    expect(run(c3, { ...model('upfront'), tx: { amount: 800, period_spent: 100 } }).verdict).toBe('out_of_scope');
  });
});

describe('lists in the agreement text', () => {
  const d1 = goldens()['d1-general-auth'];

  it('must equal the form answers as a set after normalising, under any key spelling', () => {
    const spell = (key: string, value: unknown) => run(d1, { mr: (m) => { delete (m.scope_of_delegation as Json).approved_categories; (m.scope_of_delegation as Json)[key] = value; } });
    expect(spell('approvedCategories', ['Cloud', 'PROCUREMENT']).verdict).toBe('within_limits');
    for (const key of ['approvedCategories', 'Approved_Categories', 'approved-categories']) {
      const r = spell(key, ['procurement']);
      expect(r.verdict, key).toBe('incomplete');
      expect(reasons(r), key).toContain("agreement text's list");
    }
  });

  it('a list under a restriction-like parent is words, handed back, not compared', () => {
    const r = run(d1, { mr: (m) => { m.restrictions = { approved_categories: ['anything'] }; } });
    expect(r.verdict).toBe('within_limits');
    expect(paths(r)).toContain('restrictions');
  });
});

describe('the oversight threshold written by the create route', () => {
  const d1 = goldens()['d1-general-auth'];
  const oversight = (value: unknown, tx: Partial<CheckTransaction> = {}) => run(d1, { mr: (m) => { m.oversight_threshold_usd = value; }, tx });

  it('is evaluated as an approval threshold, never left unexplained', () => {
    expect(oversight(5000).verdict).toBe('within_limits');
    const single = oversight(30);
    expect(single.verdict).toBe('needs_approval');
    expect(reasons(single)).toContain('oversight threshold');
  });

  it('is read with the strictest reading: the period total counts too', () => {
    expect(oversight(250).verdict).toBe('within_limits');
    expect(oversight(230).verdict).toBe('needs_approval');
  });

  it('is incomplete when its value is not a usable amount', () => {
    for (const bad of [-1, 'abc', null === 0 ? 0 : { max: 1 }]) expect(oversight(bad).verdict).toBe('incomplete');
  });
});

describe('flags and empty words in the agreement text', () => {
  const d1 = goldens()['d1-general-auth'];
  const scope = (extra: Json, base: Golden = d1) => run(base, { mr: (m) => { Object.assign(m.scope_of_delegation as Json, extra); } });

  it.each(['requires_human_review', 'pre_approval_required', 'approval_required', 'requiresManualReview'])('a true %s is handed back as a flag, not decided', (key) => {
    const r = scope({ [key]: true });
    expect(r.verdict).toBe('within_limits');
    expect(r.not_checked).toContainEqual(expect.objectContaining({ kind: 'flag', path: `scope_of_delegation.${key}` }));
  });

  it('a false flag is not listed', () => {
    const r = scope({ requires_human_review: false });
    expect(paths(r)).not.toContain('scope_of_delegation.requires_human_review');
  });

  it('a flag the form answers also hold is not listed, and one that contradicts them is incomplete', () => {
    const d3 = goldens()['d3-fleet-auth'];
    expect(paths(run(d3))).not.toContain('audit.log_required');
    expect(run(d3, { mr: (m) => { (m.audit as Json).log_required = false; } }).verdict).toBe('incomplete');
  });

  it.each(['None', 'none.', 'N/A', 'n/a', '-', '', '  ', 'Not applicable', 'None specified', [], {}, [''], ['None']])('%j under a restriction key is not a term and is not listed', (value) => {
    const r = scope({ geographic_restrictions: value, excluded_vendors: value, special_conditions: value });
    expect(r.verdict).toBe('within_limits');
    expect(paths(r).filter((p) => /restrictions|excluded|special/.test(p))).toEqual([]);
  });
});

describe('precedence and also_incomplete', () => {
  const d1 = goldens()['d1-general-auth'];
  const unexplained = (m: Json) => { m.payment_terms = { max_per_invoice: 500 }; };

  it('needs_approval wins over unexplained figures but still carries them', () => {
    const r = run(d1, { mr: unexplained, tx: { amount: 70 } });
    expect(r.verdict).toBe('needs_approval');
    expect(r.also_incomplete).toBe(true);
    expect(reasons(r)).toContain('payment_terms.max_per_invoice');
  });

  it('out_of_scope wins over both', () => {
    const r = run(d1, { mr: unexplained, tx: { amount: 150 } });
    expect(r.verdict).toBe('out_of_scope');
    expect(r.also_incomplete).toBeUndefined();
  });

  it('incomplete wins over within_limits, and needs_approval alone has no also_incomplete', () => {
    expect(run(d1, { mr: unexplained }).verdict).toBe('incomplete');
    const r = run(d1, { tx: { amount: 70 } });
    expect(r.verdict).toBe('needs_approval');
    expect(r.also_incomplete).toBeUndefined();
  });
});

describe('not_checked', () => {
  it('always lists the free-text form answers by key and the word terms by path, never the text', () => {
    const d1 = run(goldens()['d1-general-auth']);
    expect(d1.not_checked).toContainEqual({ path: 'scope', kind: 'free_text_answer', why: expect.any(String) });
    expect(paths(d1)).toContain('scope_of_delegation.purpose');
    expect(paths(d1)).toContain('scope_of_delegation.boundaries');
    expect(JSON.stringify(d1.not_checked)).not.toContain('office supplies');
    expect(JSON.stringify(d1.not_checked)).not.toContain('long-term leases');
    const c3 = run(goldens()['c3-task-execution']);
    for (const key of ['task_description', 'deliverables', 'acceptance_criteria']) expect(c3.not_checked).toContainEqual(expect.objectContaining({ kind: 'free_text_answer', path: key }));
  });

  it('does not list the generator boilerplate: the reconciliation block, recital, principal declaration and compliance block', () => {
    for (const g of all) {
      const listed = paths(run(g)).join(' ');
      expect(listed, g.slug).not.toMatch(/dual_format|recital|principal_declaration|compliance|dispute|primacy|hash/);
    }
  });

  it('is capped at thirty entries with the total counted', () => {
    const r = run(goldens()['d1-general-auth'], { mr: (m) => { for (let i = 0; i < 40; i++) (m.scope_of_delegation as Json)[`excluded_vendors_${tag(i)}`] = 'Some vendor'; } });
    expect(r.not_checked).toHaveLength(30);
    expect(r.not_checked_count).toBeGreaterThanOrEqual(40);
    expect(r.verdict).toBe('within_limits');
  });
});

describe('property: a restriction written in words is handed back, and a figure inside it is never within_limits', () => {
  const keys = ['excluded_vendors', 'geographic_restrictions', 'prohibited_regions', 'blocked_counterparties', 'special_conditions', 'approvalConditions'];
  const wordValues: ((i: number) => unknown)[] = [
    () => 'Vendors in the sanctioned regions are excluded',
    () => ['Casino Ltd', 'Betting Co'],
    () => ({ regions: ['EU', 'UK'], note: 'Reviewed yearly' }),
  ];
  const figureValues: ((i: number) => unknown)[] = [
    (i) => `Vendors above ${500 + i} USD per invoice need review`,
    () => ['No more than 40 per vendor'],
    () => ({ note: 'Capped at 12% of the budget' }),
  ];
  const objects = (root: unknown) => containers(root).filter((c) => !Array.isArray(c.node)) as { node: Json }[];
  const inside = (listed: string[], path: string) => listed.some((p) => p === path || path.startsWith(`${p}.`) || path.startsWith(`${p}[`));

  it('lists the inserted path wherever it sits, over 200 seeded insertions', () => {
    const rand = mulberry32(20261115);
    for (let i = 0; i < 200; i++) {
      const g = all[i % all.length];
      const machineReadable = clone(g.machineReadable);
      const spots = objects(machineReadable);
      const spot = spots[Math.floor(rand() * spots.length)];
      const key = `${keys[Math.floor(rand() * keys.length)]}_${tag(i)}`;
      spot.node[key] = wordValues[Math.floor(rand() * wordValues.length)](i);
      const terms = termsFromAgreement({ templateSlug: g.slug, parameters: g.parameters, machineReadable, createdAt: g.createdAt });
      const r = checkTransaction(terms, 'active', g.tx, NOW);
      // The path of the inserted value: found by looking the key up in the tree.
      const where = (function find(node: unknown, prefix: string): string | undefined {
        if (!node || typeof node !== 'object') return undefined;
        for (const [k, v] of Object.entries(node as Json)) {
          const p = prefix ? `${prefix}.${k}` : k;
          if (k === key) return p;
          const hit = find(v, p);
          if (hit) return hit;
        }
        return undefined;
      })(machineReadable, '') as string;
      expect(inside(paths(r), where), `${g.slug} #${i}: ${where} in ${JSON.stringify(paths(r))}`).toBe(true);
    }
  });

  it('is never within_limits when the inserted words hold a figure, over 200 seeded insertions', () => {
    const rand = mulberry32(99);
    for (let i = 0; i < 200; i++) {
      const g = all[i % all.length];
      const machineReadable = clone(g.machineReadable);
      const spots = objects(machineReadable);
      spots[Math.floor(rand() * spots.length)].node[`${keys[Math.floor(rand() * keys.length)]}_${tag(i)}`] = figureValues[Math.floor(rand() * figureValues.length)](i);
      const terms = termsFromAgreement({ templateSlug: g.slug, parameters: g.parameters, machineReadable, createdAt: g.createdAt });
      expect(checkTransaction(terms, 'active', g.tx, NOW).verdict, `${g.slug} #${i}`).not.toBe('within_limits');
    }
  });
});

describe('the template map matches the templates in the migrations', () => {
  interface Schema {
    required?: string[];
    properties: Record<string, { type?: string; format?: string; default?: unknown }>;
  }
  const dir = join(process.cwd(), 'supabase', 'migrations');

  // The latest definition of each template: later migrations (sorted by name) win,
  // as an upsert does. Each insert is ('slug', 'name', 'description', 'category', '{schema}', ...).
  const schemas = new Map<string, Schema>();
  const insert = /\(\s*'([a-z0-9-]+)'\s*,\s*'(?:[^']|'')*'\s*,\s*'(?:[^']|'')*'\s*,\s*'[a-z]+'\s*,\s*'(\{(?:[^']|'')*\})'/g;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, file), 'utf8');
    if (!/INSERT INTO public\.templates/i.test(sql)) continue;
    for (const m of sql.matchAll(insert)) schemas.set(m[1], JSON.parse(m[2].replace(/''/g, "'")) as Schema);
  }

  it('finds the seeded templates', () => {
    expect([...schemas.keys()].sort()).toEqual(Object.keys(TEMPLATE_RULES).sort());
  });

  const typeOf = (s: Schema, key: string) => s.properties[key]?.type;
  for (const [slug, rules] of Object.entries(TEMPLATE_RULES)) {
    describe(slug, () => {
      const schema = schemas.get(slug) as Schema;
      const accounted = new Set([...Object.keys(rules.money), ...Object.keys(rules.lists), ...Object.keys(rules.other)]);

      it('uses only keys that exist in the schema, with the type the rule expects', () => {
        for (const key of Object.keys(rules.money)) expect(['number', 'integer'], `${key} is an amount`).toContain(typeOf(schema, key));
        for (const key of Object.keys(rules.lists)) expect(typeOf(schema, key), `${key} is a list`).toBe('array');
        const kinds: Record<string, string[]> = {
          identity: ['string'], enum: ['string'], currency: ['string'], date: ['string'], text: ['string'],
          flag: ['boolean'], count: ['number', 'integer'], text_list: ['array'],
        };
        for (const [key, kind] of Object.entries(rules.other)) expect(kinds[kind], `${key} is ${kind}`).toContain(typeOf(schema, key));
        if (rules.currencyKey) expect(rules.other[rules.currencyKey]).toBe('currency');
      });

      it('accounts for every key in the schema, so a new answer cannot slip by', () => {
        const unaccounted = Object.keys(schema.properties).filter((k) => !accounted.has(k));
        expect(unaccounted).toEqual([]);
      });

      it('marks required exactly the answers the schema requires', () => {
        const mapped = { ...rules.money, ...rules.lists } as Record<string, { required?: true }>;
        for (const [key, spec] of Object.entries(mapped)) {
          expect(!!spec.required, `${key} required`).toBe((schema.required ?? []).includes(key));
        }
        for (const key of schema.required ?? []) expect(accounted.has(key), `${key} accounted`).toBe(true);
      });

      it("states the schema's defaults the check relies on", () => {
        if (rules.currencyKey) expect(schema.properties[rules.currencyKey].default, `${rules.currencyKey} default`).toBe(rules.currencyDefault);
        if (rules.paymentModel) expect(schema.properties[rules.paymentModel.key].default, 'payment model default').toBe(rules.paymentModel.default);
      });

      it('reads the validity window from answers that exist, as dates or a number of months', () => {
        const { start, end, months } = rules.window ?? {};
        for (const key of [start, end]) if (key) expect(typeOf(schema, key), `${key} is a date`).toBe('string');
        if (months) expect(['number', 'integer'], `${months} is a duration`).toContain(typeOf(schema, months));
      });

      it('names a key a gate depends on that exists', () => {
        for (const spec of Object.values(rules.money)) {
          if (spec.evaluableWhen) expect(schema.properties[spec.evaluableWhen.key]).toBeDefined();
        }
      });
    });
  }

  it('lists only dashboard-filled answers outside the schema', () => {
    expect(Object.keys(COMMON_ANSWERS)).toEqual(['principal_agent_id']);
  });
});
