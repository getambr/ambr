import { describe, it, expect } from 'vitest';
import {
  checkTransaction,
  termsFromMachineReadable,
  validateTransaction,
  CheckInputError,
  type CheckTerms,
} from '../check-terms';
import { followAmendments, type CheckContractRow, type NextVersion } from '../check-payment';

const NOW = new Date('2026-11-04T12:00:00Z');

// The production shape used by contract-capabilities.test.ts, with simpler limits.
const machineReadable = {
  duration: { start_date: '2026-06-06', end_date: '2027-06-06' },
  financial_terms: {
    currency: 'USDT',
    spending_limit_per_tx: { amount: 100, currency: 'USDT' },
    spending_limit_monthly: { amount: 300, currency: 'USDT' },
    requires_approval_above: 80,
  },
  scope_of_delegation: {
    enumerated_actions: ['pay_invoice', 'renew_subscription'],
    approved_categories: ['Cloud compute', 'Marketing'],
  },
};

// A payment that sends every input the agreement above limits.
const FULL = { currency: 'USDT', category: 'Cloud compute', action: 'pay_invoice', period_spent: 0 };

const terms = (): CheckTerms => termsFromMachineReadable(machineReadable);
const rule = (r: ReturnType<typeof checkTransaction>, name: string) => r.checks.find((c) => c.rule === name)!;

describe('checkTransaction', () => {
  it('passes a payment that fits every rule', () => {
    const r = checkTransaction(terms(), 'active', { ...FULL, amount: 50, currency: 'usdt', period_spent: 100 }, NOW);
    expect(r.verdict).toBe('in_scope');
    expect(r.reasons).toEqual([]);
    expect(r.checks.map((c) => c.result)).not.toContain('fail');
    expect(rule(r, 'monthly_limit')).toMatchObject({ result: 'pass', value: 150, limit: 300 });
  });

  it('fails when the status is not active', () => {
    for (const status of ['draft', 'pending_signature', 'revoked', 'terminated', 'expired', 'amended']) {
      const r = checkTransaction(terms(), status, { ...FULL, amount: 1 }, NOW);
      expect(r.verdict).toBe('out_of_scope');
      expect(rule(r, 'status')).toMatchObject({ result: 'fail', value: status });
    }
  });

  describe('validity window', () => {
    it('fails before the start date and after the end date', () => {
      const before = checkTransaction(terms(), 'active', { ...FULL, amount: 1 }, new Date('2026-06-05T23:59:59Z'));
      expect(rule(before, 'validity_window').result).toBe('fail');
      const after = checkTransaction(terms(), 'active', { ...FULL, amount: 1 }, new Date('2027-06-07T00:00:01Z'));
      expect(rule(after, 'validity_window').result).toBe('fail');
      expect(after.verdict).toBe('out_of_scope');
    });

    it('treats a date-only end date as running to the end of that day', () => {
      const lastDay = checkTransaction(terms(), 'active', { ...FULL, amount: 1 }, new Date('2027-06-06T18:00:00Z'));
      expect(rule(lastDay, 'validity_window').result).toBe('pass');
    });

    it('fails after the expiry_date column even when the end date is open', () => {
      const t = termsFromMachineReadable({ financial_terms: { spending_limit_per_tx: 10 } }, '2026-11-01T00:00:00Z');
      expect(rule(checkTransaction(t, 'active', { amount: 1 }, NOW), 'validity_window').result).toBe('fail');
      expect(rule(checkTransaction(t, 'active', { amount: 1 }, new Date('2026-10-31T00:00:00Z')), 'validity_window').result).toBe('pass');
    });

    it('works out the end from duration_months and created_at, as the database does for expiry_date', () => {
      const t = termsFromMachineReadable(
        { duration: { start_date: '2026-01-31', duration_months: 1 }, financial_terms: { spending_limit_per_tx: 10 } },
        null,
        '2026-01-31T00:00:00Z',
      );
      const inside = checkTransaction(t, 'active', { amount: 1 }, new Date('2026-02-20T00:00:00Z'));
      expect(rule(inside, 'validity_window')).toMatchObject({ result: 'pass', limit: '2026-01-31 to 2026-02-28' });
      const outside = checkTransaction(t, 'active', { amount: 1 }, new Date('2026-03-01T00:00:00Z'));
      expect(rule(outside, 'validity_window').result).toBe('fail');
      expect(outside.verdict).toBe('out_of_scope');
    });

    it('does not evaluate a duration_months agreement with no creation date', () => {
      const t = termsFromMachineReadable({ duration: { duration_months: 12 }, financial_terms: { spending_limit_per_tx: 10 } });
      const line = rule(checkTransaction(t, 'active', { amount: 1 }, NOW), 'validity_window');
      expect(line.result).toBe('not_evaluated');
      expect(line.note).toMatch(/creation date/);
    });

    it('does not evaluate the window when the agreement has no dates', () => {
      const t = termsFromMachineReadable({ financial_terms: { spending_limit_per_tx: 10 } });
      expect(rule(checkTransaction(t, 'active', { amount: 1 }, NOW), 'validity_window').result).toBe('not_evaluated');
    });

    it('still reads dates and an approval threshold from an agreement with no other terms', () => {
      const t = termsFromMachineReadable({ duration: { end_date: '2026-01-01' }, financial_terms: { requires_approval_above: 5 } });
      expect(rule(checkTransaction(t, 'active', { amount: 10 }, NOW), 'validity_window').result).toBe('fail');
      expect(checkTransaction(t, 'active', { amount: 10 }, new Date('2025-12-01T00:00:00Z')).verdict).toBe('needs_approval');
      expect(termsFromMachineReadable(null).categories).toEqual([]);
    });
  });

  describe('currency', () => {
    it('fails a different currency, matches the same one case-insensitively, and skips amount rules on a mismatch', () => {
      const wrong = checkTransaction(terms(), 'active', { ...FULL, amount: 1, currency: 'EUR' }, NOW);
      expect(wrong.verdict).toBe('out_of_scope');
      expect(rule(wrong, 'currency')).toMatchObject({ result: 'fail', limit: 'USDT', value: 'EUR' });
      expect(rule(wrong, 'per_transaction_limit').result).toBe('not_evaluated');
      expect(rule(wrong, 'monthly_limit').result).toBe('not_evaluated');
      expect(rule(checkTransaction(terms(), 'active', { ...FULL, amount: 1, currency: 'UsDt' }, NOW), 'currency').result).toBe('pass');
    });

    it('compares each limit in its own currency', () => {
      const t = termsFromMachineReadable({
        financial_terms: {
          spending_limit_per_tx: { amount: 100, currency: 'USD' },
          spending_limit_monthly: { amount: 900, currency: 'EUR' },
        },
      });
      const r = checkTransaction(t, 'active', { amount: 50, currency: 'USD', period_spent: 10 }, NOW);
      expect(r.verdict).toBe('out_of_scope');
      expect(rule(r, 'currency')).toMatchObject({ result: 'fail', limit: ['USD', 'EUR'] });
      expect(rule(r, 'per_transaction_limit').result).toBe('pass');
      expect(rule(r, 'monthly_limit').result).toBe('not_evaluated');
      expect(rule(r, 'monthly_limit').note).toMatch(/different currency/);
    });

    it('does not assume USD for a bare-number limit when the agreement names no currency', () => {
      const t = termsFromMachineReadable({ financial_terms: { spending_limit_per_tx: 100 } });
      const r = checkTransaction(t, 'active', { amount: 90, currency: 'EUR' }, NOW);
      expect(rule(r, 'currency').result).toBe('not_evaluated');
      expect(rule(r, 'currency').note).toMatch(/names no currency/);
      expect(rule(r, 'per_transaction_limit').result).toBe('pass');
      expect(r.verdict).toBe('in_scope');
      expect(checkTransaction(t, 'active', { amount: 101, currency: 'EUR' }, NOW).verdict).toBe('out_of_scope');
    });

    it('does not evaluate the currency when the agreement names none', () => {
      const t = termsFromMachineReadable({ scope_of_delegation: { approved_categories: ['a'] } });
      expect(rule(checkTransaction(t, 'active', { amount: 1, currency: 'USD', category: 'a' }, NOW), 'currency').result).toBe('not_evaluated');
    });
  });

  it('allows an amount equal to the per-transaction limit and fails one cent above', () => {
    const at = checkTransaction(terms(), 'active', { ...FULL, amount: 100 }, NOW);
    expect(rule(at, 'per_transaction_limit').result).toBe('pass');
    const over = checkTransaction(terms(), 'active', { ...FULL, amount: 100.01 }, NOW);
    expect(over.verdict).toBe('out_of_scope');
    expect(rule(over, 'per_transaction_limit')).toMatchObject({ result: 'fail', limit: 100, value: 100.01 });
  });

  it('checks the monthly limit with period_spent', () => {
    const over = checkTransaction(terms(), 'active', { ...FULL, amount: 50, period_spent: 251 }, NOW);
    expect(over.verdict).toBe('out_of_scope');
    expect(rule(over, 'monthly_limit')).toMatchObject({ result: 'fail', value: 301, limit: 300 });
    expect(rule(checkTransaction(terms(), 'active', { ...FULL, amount: 50, period_spent: 250 }, NOW), 'monthly_limit').result).toBe('pass');
  });

  it('fails a category or action the agreement does not list', () => {
    const cat = checkTransaction(terms(), 'active', { ...FULL, amount: 1, category: 'Gambling' }, NOW);
    expect(cat.verdict).toBe('out_of_scope');
    expect(rule(cat, 'category').result).toBe('fail');
    const act = checkTransaction(terms(), 'active', { ...FULL, amount: 1, action: 'transfer_funds' }, NOW);
    expect(act.verdict).toBe('out_of_scope');
    expect(rule(act, 'action').result).toBe('fail');
    expect(rule(checkTransaction(terms(), 'active', { ...FULL, amount: 1, action: 'Pay_Invoice' }, NOW), 'action').result).toBe('pass');
  });

  describe('incomplete: a limit exists but its input was not sent', () => {
    it.each([
      ['category', 'category', 'No category was sent'],
      ['action', 'action', 'No action was sent'],
      ['period_spent', 'monthly_limit', 'No period_spent was sent'],
      ['currency', 'currency', 'No currency was sent'],
    ])('missing %s', (field, ruleName, reason) => {
      const tx: Record<string, unknown> = { ...FULL, amount: 10 };
      delete tx[field];
      const r = checkTransaction(terms(), 'active', tx as never, NOW);
      expect(r.verdict).toBe('incomplete');
      expect(rule(r, ruleName).result).toBe('not_evaluated');
      expect(r.reasons.join(' ')).toContain(reason);
    });

    it('lists every missing input', () => {
      const r = checkTransaction(terms(), 'active', { amount: 10 }, NOW);
      expect(r.verdict).toBe('incomplete');
      expect(r.reasons).toHaveLength(4);
    });

    it('does not ask for an input the agreement does not limit', () => {
      const t = termsFromMachineReadable({ financial_terms: { spending_limit_per_tx: { amount: 10, currency: 'USD' } } });
      expect(checkTransaction(t, 'active', { amount: 5, currency: 'USD' }, NOW).verdict).toBe('in_scope');
    });

    it('is the verdict for an agreement with no limits at all', () => {
      for (const mr of [{ scope_of_delegation: { purpose: 'anything' } }, {}, null]) {
        const r = checkTransaction(termsFromMachineReadable(mr), 'active', { amount: 1_000_000, currency: 'USD', category: 'x', action: 'y', period_spent: 5 }, NOW);
        expect(r.verdict).toBe('incomplete');
        expect(r.reasons).toEqual(['The agreement sets no limits to check against.']);
        for (const name of ['per_transaction_limit', 'monthly_limit', 'category', 'action', 'approval_threshold', 'currency']) {
          expect(rule(r, name).result, name).toBe('not_evaluated');
        }
      }
    });

    it('ranks below out_of_scope and above needs_approval', () => {
      // missing category, plus a failed per-transaction limit
      expect(checkTransaction(terms(), 'active', { ...FULL, category: undefined, amount: 150 }, NOW).verdict).toBe('out_of_scope');
      // missing category, plus an amount above the approval threshold
      const r = checkTransaction(terms(), 'active', { ...FULL, category: undefined, amount: 90 }, NOW);
      expect(r.verdict).toBe('incomplete');
      expect(r.reasons.join(' ')).toMatch(/approval threshold of 80/);
    });
  });

  it('gives needs_approval above the approval threshold when nothing fails and nothing is missing', () => {
    const r = checkTransaction(terms(), 'active', { ...FULL, amount: 90, category: 'Marketing' }, NOW);
    expect(r.verdict).toBe('needs_approval');
    expect(r.reasons[0]).toMatch(/approval threshold of 80/);
    expect(rule(r, 'approval_threshold')).toMatchObject({ limit: 80, value: 90 });
    expect(checkTransaction(terms(), 'active', { ...FULL, amount: 80 }, NOW).verdict).toBe('in_scope');
  });

  it('lets a failed rule beat the approval threshold', () => {
    expect(checkTransaction(terms(), 'active', { ...FULL, amount: 90, category: 'Gambling' }, NOW).verdict).toBe('out_of_scope');
  });

  it('reads flat legacy fields through the shared parser', () => {
    const t = termsFromMachineReadable({ categories: ['compute'], spending_limit_per_tx: 10, currency: 'USD' });
    expect(checkTransaction(t, 'active', { amount: 11, currency: 'USD', category: 'compute' }, NOW).verdict).toBe('out_of_scope');
    expect(checkTransaction(t, 'active', { amount: 10, currency: 'USD', category: 'compute' }, NOW).verdict).toBe('in_scope');
  });

  it('refuses bad input', () => {
    for (const amount of [-1, NaN, Infinity, '5' as unknown as number, undefined as unknown as number]) {
      expect(() => checkTransaction(terms(), 'active', { amount }, NOW)).toThrow(CheckInputError);
    }
    expect(() => checkTransaction(terms(), 'active', { amount: 1, period_spent: -5 }, NOW)).toThrow(CheckInputError);
    expect(() => checkTransaction(terms(), 'active', { amount: 1, period_spent: Infinity }, NOW)).toThrow(CheckInputError);
    expect(validateTransaction({ amount: 0 })).toBeNull();
    expect(validateTransaction({ amount: -0.01 })).toMatch(/amount/);
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
        expect(r.verdict === 'in_scope' || r.verdict === 'out_of_scope', `cap ${cap} ${tx.cat}`).toBe(true);
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
