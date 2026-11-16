import { describe, it, expect } from 'vitest';
import {
  checkTransaction,
  validateTransaction,
  CheckInputError,
  type CheckTerms,
  type CheckTransaction,
} from '../check-terms';
import type { Money } from '@/lib/contract-capabilities';
import { followAmendments, type CheckContractRow, type NextVersion } from '../check-payment';

// The evaluator on its own: terms in, verdict out. How terms are read from an
// agreement (form answers, machine_readable accounting) is in check-agreement.test.ts.

const NOW = new Date('2026-11-04T12:00:00Z');
const usd = (amount: number): Money => ({ amount, currency: 'USD' });
const T = (o: Partial<CheckTerms> = {}): CheckTerms => ({ mayDo: [], mayNotDo: [], categories: [], ...o });
const run = (terms: CheckTerms, tx: Partial<CheckTransaction> = {}, status = 'active') =>
  checkTransaction(terms, status, { amount: 1, currency: 'USD', ...tx }, NOW);
const rule = (r: ReturnType<typeof checkTransaction>, name: string) => r.checks.find((c) => c.rule === name)!;
const LIMITS = T({ perTxLimit: usd(100), monthlyLimit: usd(300) });

describe('checkTransaction', () => {
  it('passes a payment inside every limit', () => {
    const r = run(LIMITS, { amount: 50, period_spent: 100 });
    expect(r).toMatchObject({ verdict: 'within_limits', reasons: [] });
    expect(rule(r, 'monthly_limit')).toMatchObject({ result: 'pass', value: 150 });
  });

  it.each(['draft', 'terminated', 'expired', 'amended'])('fails an agreement that is %s', (status) => {
    const r = run(LIMITS, { period_spent: 0 }, status);
    expect(r.verdict).toBe('out_of_scope');
    expect(rule(r, 'status').result).toBe('fail');
  });

  describe('validity window', () => {
    it('fails before the start and after the end, and a date-only end runs to the end of that day', () => {
      const t = T({ ...LIMITS, startDate: '2026-11-05', endDate: '2027-06-06' });
      expect(rule(run(t, { period_spent: 0 }), 'validity_window').result).toBe('fail');
      const dated = T({ ...LIMITS, endDate: '2026-11-04' });
      expect(rule(run(dated, { period_spent: 0 }), 'validity_window').result).toBe('pass');
      expect(rule(checkTransaction(dated, 'active', { amount: 1, currency: 'USD', period_spent: 0 }, new Date('2026-11-05T00:00:01Z')), 'validity_window').result).toBe('fail');
    });

    it('uses the expiry date, then months from creation', () => {
      expect(rule(run(T({ ...LIMITS, expiryDate: '2026-11-01T00:00:00Z' }), { period_spent: 0 }), 'validity_window').result).toBe('fail');
      const months = T({ ...LIMITS, durationMonths: 12, createdAt: '2026-06-01T00:00:00Z' });
      expect(rule(run(months, { period_spent: 0 }), 'validity_window')).toMatchObject({ result: 'pass', limit: '- to 2027-06-01' });
      expect(rule(run({ ...months, createdAt: '2025-01-01T00:00:00Z' }, { period_spent: 0 }), 'validity_window').result).toBe('fail');
      expect(rule(run(T({ ...LIMITS, durationMonths: 12 }), { period_spent: 0 }), 'validity_window').result).toBe('not_evaluated');
    });

    it('says so when the agreement has no readable dates', () => {
      expect(rule(run(LIMITS, { period_spent: 0 }), 'validity_window').result).toBe('not_evaluated');
    });
  });

  it('compares the per-transaction limit at the boundary', () => {
    expect(rule(run(LIMITS, { amount: 100, period_spent: 0 }), 'per_transaction_limit').result).toBe('pass');
    const over = run(LIMITS, { amount: 100.01, period_spent: 0 });
    expect(over.verdict).toBe('out_of_scope');
    expect(over.reasons[0]).toMatch(/per-transaction limit of 100/);
  });

  describe('monthly limit', () => {
    it('adds period_spent to the payment', () => {
      expect(run(LIMITS, { amount: 50, period_spent: 250 }).verdict).toBe('within_limits');
      const over = run(LIMITS, { amount: 50, period_spent: 251 });
      expect(over.verdict).toBe('out_of_scope');
      expect(over.reasons[0]).toMatch(/would reach 301/);
    });

    it('fails one payment above the monthly limit without period_spent, and otherwise asks for it', () => {
      const alone = run(T({ monthlyLimit: usd(300) }), { amount: 400 });
      expect(alone.verdict).toBe('out_of_scope');
      const unknown = run(T({ monthlyLimit: usd(300) }), { amount: 40 });
      expect(unknown.verdict).toBe('incomplete');
      expect(unknown.reasons.join(' ')).toMatch(/No period_spent/);
    });
  });

  describe('total budget and price', () => {
    const budget = T({ totalBudget: usd(5000) });
    it('is cumulative over the agreement, and a payment above it alone fails without period_spent', () => {
      expect(run(budget, { amount: 400, period_spent: 1000 }).verdict).toBe('within_limits');
      expect(run(budget, { amount: 400, period_spent: 4700 }).verdict).toBe('out_of_scope');
      expect(run(budget, { amount: 6000 }).verdict).toBe('out_of_scope');
      expect(run(budget, { amount: 400 }).verdict).toBe('incomplete');
    });

    it('a monthly fee is cumulative over the month', () => {
      const fee = T({ price: { kind: 'monthly_fee', amount: usd(2000) } });
      expect(run(fee, { amount: 500, period_spent: 1000 }).verdict).toBe('within_limits');
      expect(run(fee, { amount: 1500, period_spent: 1000 }).verdict).toBe('out_of_scope');
    });
  });

  describe('currency', () => {
    it('counts USDC as USD and compares nothing in another currency', () => {
      expect(run(LIMITS, { currency: 'usdc', period_spent: 0 }).verdict).toBe('within_limits');
      const eth = run(LIMITS, { currency: 'ETH', amount: 5000, period_spent: 0 });
      expect(eth.verdict).toBe('incomplete');
      expect(rule(eth, 'currency').result).toBe('not_evaluated');
      expect(rule(eth, 'per_transaction_limit').result).toBe('not_evaluated');
    });

    it('asks for the currency when the agreement names one and none was sent', () => {
      const r = checkTransaction(LIMITS, 'active', { amount: 10, period_spent: 0 }, NOW);
      expect(r.verdict).toBe('incomplete');
      expect(r.reasons.join(' ')).toMatch(/No currency was sent/);
      expect(checkTransaction(LIMITS, 'active', { amount: 1000, period_spent: 0 }, NOW).verdict).toBe('out_of_scope');
    });
  });

  describe('categories', () => {
    const cats = T({ ...LIMITS, categories: ['Cloud compute', 'Marketing'] });
    it('match case-insensitively, fail outside the list, and are asked for when missing', () => {
      expect(run(cats, { category: 'cloud_compute', period_spent: 0 }).verdict).toBe('within_limits');
      expect(run(cats, { category: 'Gambling', period_spent: 0 }).verdict).toBe('out_of_scope');
      const none = run(cats, { period_spent: 0 });
      expect(none.verdict).toBe('incomplete');
      expect(none.reasons.join(' ')).toMatch(/No category was sent/);
    });
  });

  describe('actions', () => {
    const acts = T({ ...LIMITS, mayDo: ['pay_invoice'], restrictedActions: ['change_limits'], mayNotDo: [] });
    it('lets a listed action through and fails an unlisted one', () => {
      expect(run(acts, { action: 'Pay invoice', period_spent: 0 }).verdict).toBe('within_limits');
      expect(run(acts, { action: 'transfer_funds', period_spent: 0 }).verdict).toBe('out_of_scope');
    });

    it('asks for the action when the agreement restricts actions', () => {
      expect(run(acts, { period_spent: 0 }).verdict).toBe('incomplete');
    });

    it('does not let a lead-agent-only action through on its own word', () => {
      const r = run(T({ ...LIMITS, mayDo: ['pay_invoice', 'change_limits'], restrictedActions: ['change_limits'] }), { action: 'change_limits', period_spent: 0 });
      expect(r.verdict).toBe('incomplete');
      expect(r.reasons.join(' ')).toMatch(/lead agent/);
    });

    it('boundaries written as prose never decide the verdict', () => {
      const r = run(T({ ...LIMITS, mayNotDo: ['Do not exceed the agreed budget'] }), { period_spent: 0 });
      expect(r.verdict).toBe('within_limits');
    });

    it('matches a prohibited entry after its leading negation, and a permitted one exactly', () => {
      const t = T({ ...LIMITS, mayDo: ['pay_invoice'], prohibitedActions: ['Prohibited: wire transfers', 'Do not gamble'] });
      expect(run(t, { action: 'Wire-Transfers', period_spent: 0 }).verdict).toBe('out_of_scope');
      expect(run(t, { action: 'gamble', period_spent: 0 }).verdict).toBe('out_of_scope');
      const r = run(t, { action: 'pay_invoice', period_spent: 0 });
      expect(r.verdict).toBe('within_limits');
      expect(r.not_checked.map((n) => n.kind)).toEqual(['list_entry']);
    });

    it('a miss on a permitted list taken from the agreement text is incomplete, and from the form answers is out_of_scope', () => {
      const text = run(T({ ...LIMITS, mayDo: ['pay_invoice'], mayDoSource: 'text' }), { action: 'refund', period_spent: 0 });
      expect(text.verdict).toBe('incomplete');
      const form = run(T({ ...LIMITS, mayDo: ['pay_invoice'], mayDoSource: 'form' }), { action: 'refund', period_spent: 0 });
      expect(form.verdict).toBe('out_of_scope');
      expect(form.reasons[0]).toContain("not on the agreement's list (matched exactly)");
    });
  });

  describe('what the check could not read or evaluate', () => {
    it('is never within_limits, and each reason is reported', () => {
      const r = run(T({ ...LIMITS, unevaluated: [{ rule: 'geographic', note: 'EU only.' }], unreadable: ['Template unknown.'] }), { period_spent: 0 });
      expect(r.verdict).toBe('incomplete');
      expect(r.reasons).toEqual(expect.arrayContaining(['EU only.', 'Template unknown.']));
      expect(rule(r, 'geographic').result).toBe('not_evaluated');
      expect(rule(r, 'agreement_terms').result).toBe('not_evaluated');
    });

    it('is never within_limits when no spending limit or price was evaluated', () => {
      const r = run(T({ categories: ['a'] }), { category: 'a' });
      expect(r.verdict).toBe('incomplete');
      expect(r.reasons.join(' ')).toMatch(/no spending limit or price/);
    });
  });

  describe('verdict precedence', () => {
    const approving = T({ ...LIMITS, approvalAbove: usd(50) });
    it('out_of_scope beats needs_approval', () => {
      expect(run(approving, { amount: 150, period_spent: 0 }).verdict).toBe('out_of_scope');
    });

    it('needs_approval beats incomplete, and still lists what was missing', () => {
      const r = run(T({ ...approving, unevaluated: [{ rule: 'counterparty', note: 'Counterparty not sent.' }] }), { amount: 70, period_spent: 0 });
      expect(r.verdict).toBe('needs_approval');
      expect(r.reasons.join(' ')).toMatch(/Counterparty not sent/);
      expect(r.also_incomplete).toBe(true);
    });

    it('needs_approval with nothing else missing does not say also_incomplete', () => {
      const r = run(approving, { amount: 70, period_spent: 0 });
      expect(r.verdict).toBe('needs_approval');
      expect(r.also_incomplete).toBeUndefined();
    });

    it('out_of_scope never carries also_incomplete', () => {
      const r = run(T({ ...approving, unreadable: ['Something unexplained.'] }), { amount: 150, period_spent: 0 });
      expect(r.verdict).toBe('out_of_scope');
      expect(r.also_incomplete).toBeUndefined();
    });

    it('needs_approval when the only rule is an approval threshold', () => {
      expect(run(T({ approvalAbove: usd(5) }), { amount: 10 }).verdict).toBe('needs_approval');
    });
  });

  it('a limit of the agreement in USD for a payment of zero or more, but never a negative or non-finite amount', () => {
    for (const amount of [-1, Number.NaN, Number.POSITIVE_INFINITY, '5' as unknown as number]) {
      expect(() => run(LIMITS, { amount })).toThrow(CheckInputError);
    }
    expect(() => run(LIMITS, { period_spent: -5 })).toThrow(CheckInputError);
    expect(validateTransaction({ amount: 0 })).toBeNull();
  });
});

describe('exact price arithmetic', () => {
  const perCall = T({ price: { kind: 'per_call', amount: usd(0.01) } });
  const priceLine = (amount: number) => rule(run(perCall, { amount }), 'price');

  it('passes a whole number of calls, however many, and nothing else', () => {
    expect(priceLine(0.01).result).toBe('pass');
    expect(priceLine(0.07).result).toBe('pass');
    expect(priceLine(400.01).result).toBe('pass');
    expect(priceLine(0.015).result).toBe('not_evaluated');
    expect(priceLine(400.005).result).toBe('not_evaluated');
  });

  it('is incomplete when the payment is below the price of one call, or is zero', () => {
    expect(run(perCall, { amount: 0.005 }).verdict).toBe('incomplete');
    expect(run(perCall, { amount: 0 }).verdict).toBe('incomplete');
  });

  it('does not let a tolerance grow with the number of calls', () => {
    // One millionth over a million calls is not a whole number of calls.
    expect(priceLine(10000.000001).result).toBe('not_evaluated');
    expect(priceLine(10000).result).toBe('pass');
  });

  it('ignores floating point noise far below a millionth', () => {
    const tenth = T({ price: { kind: 'per_call', amount: usd(0.1) } });
    expect(rule(run(tenth, { amount: 0.1 + 0.2 }), 'price').result).toBe('pass');
  });

  it('a price with more than six decimals cannot be compared exactly', () => {
    const fine = T({ price: { kind: 'per_call', amount: usd(0.0000001) } });
    expect(run(fine, { amount: 1 }).verdict).toBe('incomplete');
  });
});

describe('a payment on completion', () => {
  const total = T({ totalBudget: usd(800), onCompletion: true });

  it('must equal what is left of the total, with nothing spent counted as none', () => {
    expect(run(total, { amount: 800 }).verdict).toBe('within_limits');
    expect(run(total, { amount: 700, period_spent: 100 }).verdict).toBe('within_limits');
    const part = run(total, { amount: 300, period_spent: 100 });
    expect(part.verdict).toBe('out_of_scope');
    expect(part.reasons[0]).toContain('exactly what is left of the total (700)');
    expect(run(total, { amount: 800, period_spent: 100 }).verdict).toBe('out_of_scope');
  });
});

describe('the validity window never throws', () => {
  const months = (durationMonths: number, createdAt: string | null = '2026-06-01T00:00:00Z') => T({ ...LIMITS, durationMonths, createdAt });

  it.each([1e15, Number.MAX_SAFE_INTEGER, 100000, 1.5, 0, -3, Number.NaN])('a duration of %s months is reported, not thrown', (n) => {
    const r = run(months(n), { period_spent: 0 });
    expect(r.verdict).toBe('incomplete');
    expect(rule(r, 'validity_window').result).toBe('not_evaluated');
  });

  it.each(['not a date', '', '0000-00-00', '275760-09-14T00:00:00Z'])('a creation date of %j is reported, not thrown', (createdAt) => {
    expect(() => run(months(12, createdAt), { period_spent: 0 })).not.toThrow();
    expect(run(months(12, createdAt), { period_spent: 0 }).verdict).toBe('incomplete');
  });

  it('a creation date at the end of what a Date holds, with months added, is reported, not thrown', () => {
    expect(() => run(months(999, '+275760-09-13T00:00:00.000Z'), { period_spent: 0 })).not.toThrow();
  });

  it('the earliest end wins when several are known', () => {
    const t = T({ ...LIMITS, endDate: '2027-01-01', expiryDate: '2026-11-01T00:00:00Z' });
    expect(rule(run(t, { period_spent: 0 }), 'validity_window').result).toBe('fail');
  });
});

describe('thresholds read on the period', () => {
  it('an oversight threshold is always judged on the single payment and on the period total', () => {
    const t = T({ ...LIMITS, oversightAbove: usd(250) });
    expect(run(t, { amount: 40, period_spent: 100 }).verdict).toBe('within_limits');
    const total = run(t, { amount: 40, period_spent: 230 });
    expect(total.verdict).toBe('needs_approval');
    expect(total.reasons[0]).toContain('oversight threshold');
    expect(run(t, { amount: 300, period_spent: 0 }).verdict).toBe('out_of_scope');
    const unknown = run(T({ perTxLimit: usd(100), oversightAbove: usd(250) }), { amount: 40 });
    expect(unknown.verdict).toBe('incomplete');
  });

  it('wording that names a period applies a per-transaction limit to the period total', () => {
    const t = T({ perTxLimit: usd(100), perTxBasis: 'also_period' });
    expect(run(t, { amount: 40, period_spent: 50 }).verdict).toBe('within_limits');
    expect(run(t, { amount: 40, period_spent: 70 }).verdict).toBe('out_of_scope');
    expect(run(t, { amount: 40 }).verdict).toBe('incomplete');
  });
});

describe('not_checked', () => {
  it('is capped at thirty entries and counts the rest, each by kind and path only', () => {
    const notChecked = Array.from({ length: 45 }, (_, i) => ({ path: `terms.item_${i}`, kind: 'agreement_text' as const, why: 'in words' }));
    const r = run(T({ ...LIMITS, notChecked }), { period_spent: 0 });
    expect(r.not_checked).toHaveLength(30);
    expect(r.not_checked_count).toBe(45);
  });

  it('lists release conditions and list entries before free text, and drops duplicates', () => {
    const r = run(
      T({
        ...LIMITS,
        notChecked: [
          { path: 'scope', kind: 'free_text_answer', why: 'x' },
          { path: 'scope', kind: 'free_text_answer', why: 'x' },
          { path: 'payment_model', kind: 'condition', why: 'completion' },
        ],
      }),
      { period_spent: 0 },
    );
    expect(r.not_checked.map((n) => n.kind)).toEqual(['condition', 'free_text_answer']);
    expect(r.not_checked_count).toBe(2);
  });
});

describe('home demo parity', () => {
  // The homepage demo (components/home/MandateDemo.tsx) used to decide with this logic.
  const TX = [
    { cat: 'compute', amount: 1200 },
    { cat: 'compute', amount: 800 },
    { cat: 'marketing', amount: 3000 },
    { cat: 'procurement', amount: 7500 },
    { cat: 'payroll', amount: 4200 },
  ];
  const cats = ['compute', 'marketing', 'payroll'];

  it('gives the same authorized / out-of-scope split for every cap on the slider', () => {
    for (let cap = 0; cap <= 10000; cap += 250) {
      const t: CheckTerms = {
        mayDo: [],
        mayNotDo: [],
        categories: cats,
        currency: 'USD',
        monthlyLimit: { amount: cap, currency: 'USD' },
      };
      let oldRunning = 0;
      let newRunning = 0;
      for (const tx of TX) {
        const oldAuthorized = cats.includes(tx.cat) && oldRunning + tx.amount <= cap;
        if (oldAuthorized) oldRunning += tx.amount;
        const r = checkTransaction(t, 'active', { amount: tx.amount, currency: 'USD', category: tx.cat, period_spent: newRunning }, NOW);
        const newAuthorized = r.verdict !== 'out_of_scope';
        if (newAuthorized) newRunning += tx.amount;
        expect(r.verdict === 'within_limits' || r.verdict === 'out_of_scope', `cap ${cap} ${tx.cat}`).toBe(true);
        expect(newAuthorized, `cap ${cap} ${tx.cat} ${tx.amount}`).toBe(oldAuthorized);
      }
    }
  });
});

describe('followAmendments', () => {
  const row = (n: number, status: string, parent: string | null): CheckContractRow => ({
    id: `row-${n}`,
    contract_id: `amb-2026-000${n}`,
    status,
    sha256_hash: `h${n}`,
    parent_contract_hash: parent,
    amendment_type: parent ? 'amendment' : null,
  });
  const finder = (rows: CheckContractRow[]) => async (cur: CheckContractRow): Promise<NextVersion> => {
    const next = rows.find((r) => r.parent_contract_hash === cur.sha256_hash);
    return next ? { next } : { problem: 'no approved amendment' };
  };

  it('returns a contract that was never amended as it is', async () => {
    const a = row(1, 'active', null);
    expect(await followAmendments(a, finder([a]))).toEqual({ contract: a });
  });

  it('follows a chain to the newest version', async () => {
    const v1 = row(1, 'amended', null);
    const v2 = row(2, 'amended', 'h1');
    const v3 = row(3, 'active', 'h2');
    const out = await followAmendments(v1, finder([v1, v2, v3]));
    expect(out.contract.contract_id).toBe('amb-2026-0003');
    expect(out.problem).toBeUndefined();
  });

  it('reports a problem, and the last good row, when the next version cannot be found', async () => {
    const v1 = row(1, 'amended', null);
    expect(await followAmendments(v1, finder([v1]))).toEqual({ contract: v1, problem: 'no approved amendment' });
  });

  it('reports a cycle', async () => {
    const v1 = row(1, 'amended', 'h2');
    const v2 = row(2, 'amended', 'h1');
    const out = await followAmendments(v1, finder([v1, v2]));
    expect(out.contract).toBe(v2);
    expect(out.problem).toMatch(/loops/);
  });

  it('reports a chain longer than 20 hops', async () => {
    const chain = Array.from({ length: 40 }, (_, i) => row(i + 1, 'amended', i === 0 ? null : `h${i}`));
    const out = await followAmendments(chain[0], finder(chain));
    expect(out.contract.sha256_hash).toBe('h21');
    expect(out.problem).toMatch(/longer than 20/);
  });
});

