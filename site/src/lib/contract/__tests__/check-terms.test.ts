import { describe, it, expect } from 'vitest';
import {
  checkTransaction,
  termsFromMachineReadable,
  validateTransaction,
  CheckInputError,
  type CheckTerms,
} from '../check-terms';
import { followAmendments, type CheckContractRow } from '../check-payment';

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

const terms = (): CheckTerms => termsFromMachineReadable(machineReadable);
const rule = (r: ReturnType<typeof checkTransaction>, name: string) => r.checks.find((c) => c.rule === name)!;

describe('checkTransaction', () => {
  it('passes a payment that fits every rule', () => {
    const r = checkTransaction(terms(), 'active', {
      amount: 50,
      currency: 'usdt',
      category: 'cloud compute',
      action: 'pay_invoice',
      period_spent: 100,
    }, NOW);
    expect(r.verdict).toBe('in_scope');
    expect(r.reasons).toEqual([]);
    expect(r.checks.map((c) => c.result)).not.toContain('fail');
    expect(rule(r, 'monthly_limit')).toMatchObject({ result: 'pass', value: 150, limit: 300 });
  });

  it('fails when the status is not active', () => {
    for (const status of ['draft', 'pending_signature', 'revoked', 'terminated', 'expired', 'amended']) {
      const r = checkTransaction(terms(), status, { amount: 1 }, NOW);
      expect(r.verdict).toBe('out_of_scope');
      expect(rule(r, 'status')).toMatchObject({ result: 'fail', value: status });
    }
  });

  it('fails before the start date and after the end date', () => {
    const before = checkTransaction(terms(), 'active', { amount: 1 }, new Date('2026-06-05T23:59:59Z'));
    expect(rule(before, 'validity_window').result).toBe('fail');
    const after = checkTransaction(terms(), 'active', { amount: 1 }, new Date('2027-06-07T00:00:01Z'));
    expect(rule(after, 'validity_window').result).toBe('fail');
    expect(after.verdict).toBe('out_of_scope');
  });

  it('treats a date-only end date as running to the end of that day', () => {
    const lastDay = checkTransaction(terms(), 'active', { amount: 1 }, new Date('2027-06-06T18:00:00Z'));
    expect(rule(lastDay, 'validity_window').result).toBe('pass');
  });

  it('fails after the expiry_date column even when the end date is open', () => {
    const t = termsFromMachineReadable({ financial_terms: { spending_limit_per_tx: 10 } }, '2026-11-01T00:00:00Z');
    expect(rule(checkTransaction(t, 'active', { amount: 1 }, NOW), 'validity_window').result).toBe('fail');
    expect(rule(checkTransaction(t, 'active', { amount: 1 }, new Date('2026-10-31T00:00:00Z')), 'validity_window').result).toBe('pass');
  });

  it('still reads dates and an approval threshold from an agreement with no other terms', () => {
    const t = termsFromMachineReadable({ duration: { end_date: '2026-01-01' }, financial_terms: { requires_approval_above: 5 } });
    expect(rule(checkTransaction(t, 'active', { amount: 10 }, NOW), 'validity_window').result).toBe('fail');
    expect(checkTransaction(t, 'active', { amount: 10 }, new Date('2025-12-01T00:00:00Z')).verdict).toBe('needs_approval');
    expect(termsFromMachineReadable(null).categories).toEqual([]);
  });

  it('does not evaluate the window when the agreement has no dates', () => {
    const t = termsFromMachineReadable({ financial_terms: { spending_limit_per_tx: 10 } });
    expect(rule(checkTransaction(t, 'active', { amount: 1 }, NOW), 'validity_window').result).toBe('not_evaluated');
  });

  it('fails a different currency, case-insensitively matches the same one, and skips amount rules on a mismatch', () => {
    const wrong = checkTransaction(terms(), 'active', { amount: 1, currency: 'EUR' }, NOW);
    expect(wrong.verdict).toBe('out_of_scope');
    expect(rule(wrong, 'currency')).toMatchObject({ result: 'fail', limit: 'USDT', value: 'EUR' });
    expect(rule(wrong, 'per_transaction_limit').result).toBe('not_evaluated');
    expect(rule(wrong, 'monthly_limit').result).toBe('not_evaluated');
    expect(rule(checkTransaction(terms(), 'active', { amount: 1, currency: 'UsDt' }, NOW), 'currency').result).toBe('pass');
  });

  it('does not evaluate the currency when none is given or none is named', () => {
    expect(rule(checkTransaction(terms(), 'active', { amount: 1 }, NOW), 'currency').result).toBe('not_evaluated');
    const t = termsFromMachineReadable({ scope_of_delegation: { approved_categories: ['a'] } });
    expect(rule(checkTransaction(t, 'active', { amount: 1, currency: 'USD' }, NOW), 'currency').result).toBe('not_evaluated');
  });

  it('allows an amount equal to the per-transaction limit and fails one cent above', () => {
    const at = checkTransaction(terms(), 'active', { amount: 100 }, NOW);
    expect(rule(at, 'per_transaction_limit').result).toBe('pass');
    const over = checkTransaction(terms(), 'active', { amount: 100.01 }, NOW);
    expect(over.verdict).toBe('out_of_scope');
    expect(rule(over, 'per_transaction_limit')).toMatchObject({ result: 'fail', limit: 100, value: 100.01 });
  });

  it('checks the monthly limit only with period_spent', () => {
    const none = checkTransaction(terms(), 'active', { amount: 50 }, NOW);
    expect(rule(none, 'monthly_limit').result).toBe('not_evaluated');
    expect(rule(none, 'monthly_limit').note).toMatch(/does not track spend/);
    const over = checkTransaction(terms(), 'active', { amount: 50, period_spent: 251 }, NOW);
    expect(over.verdict).toBe('out_of_scope');
    expect(rule(over, 'monthly_limit')).toMatchObject({ result: 'fail', value: 301, limit: 300 });
    expect(rule(checkTransaction(terms(), 'active', { amount: 50, period_spent: 250 }, NOW), 'monthly_limit').result).toBe('pass');
  });

  it('checks the category, and does not evaluate it when none is given', () => {
    const bad = checkTransaction(terms(), 'active', { amount: 1, category: 'Gambling' }, NOW);
    expect(bad.verdict).toBe('out_of_scope');
    expect(rule(bad, 'category').result).toBe('fail');
    const missing = checkTransaction(terms(), 'active', { amount: 1 }, NOW);
    expect(rule(missing, 'category')).toMatchObject({ result: 'not_evaluated', limit: ['Cloud compute', 'Marketing'] });
    expect(missing.verdict).toBe('in_scope');
  });

  it('checks the action against the enumerated actions', () => {
    const bad = checkTransaction(terms(), 'active', { amount: 1, action: 'transfer_funds' }, NOW);
    expect(bad.verdict).toBe('out_of_scope');
    expect(rule(bad, 'action').result).toBe('fail');
    expect(rule(checkTransaction(terms(), 'active', { amount: 1, action: 'Pay_Invoice' }, NOW), 'action').result).toBe('pass');
    expect(rule(checkTransaction(terms(), 'active', { amount: 1 }, NOW), 'action').result).toBe('not_evaluated');
  });

  it('never passes a rule the agreement sets no limit for', () => {
    const empty = termsFromMachineReadable({ scope_of_delegation: { purpose: 'anything' } });
    const r = checkTransaction(empty, 'active', { amount: 1_000_000, currency: 'USD', category: 'x', action: 'y', period_spent: 5 }, NOW);
    expect(r.verdict).toBe('in_scope');
    for (const name of ['validity_window', 'per_transaction_limit', 'monthly_limit', 'category', 'action', 'approval_threshold', 'currency']) {
      expect(rule(r, name).result, name).toBe('not_evaluated');
    }
  });

  it('gives needs_approval above the approval threshold when nothing fails', () => {
    const r = checkTransaction(terms(), 'active', { amount: 90, category: 'Marketing' }, NOW);
    expect(r.verdict).toBe('needs_approval');
    expect(r.reasons[0]).toMatch(/approval threshold of 80/);
    expect(rule(r, 'approval_threshold')).toMatchObject({ limit: 80, value: 90 });
    expect(checkTransaction(terms(), 'active', { amount: 80 }, NOW).verdict).toBe('in_scope');
  });

  it('lets a failed rule beat the approval threshold', () => {
    const r = checkTransaction(terms(), 'active', { amount: 90, category: 'Gambling' }, NOW);
    expect(r.verdict).toBe('out_of_scope');
  });

  it('reads flat legacy fields through the shared parser', () => {
    const t = termsFromMachineReadable({ categories: ['compute'], spending_limit_per_tx: 10, currency: 'USD' });
    expect(checkTransaction(t, 'active', { amount: 11, category: 'compute' }, NOW).verdict).toBe('out_of_scope');
    expect(checkTransaction(t, 'active', { amount: 10, category: 'compute' }, NOW).verdict).toBe('in_scope');
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

describe('followAmendments', () => {
  const row = (n: number, status: string, parent: string | null): CheckContractRow => ({
    id: `row-${n}`,
    contract_id: `amb-2026-000${n}`,
    status,
    sha256_hash: `h${n}`,
    parent_contract_hash: parent,
    amendment_type: parent ? 'amendment' : null,
  });
  const finder = (rows: CheckContractRow[]) => async (parentHash: string) =>
    rows.find((r) => r.parent_contract_hash === parentHash) ?? null;

  it('returns a contract that was never amended as it is', async () => {
    const a = row(1, 'active', null);
    expect(await followAmendments(a, finder([a]))).toBe(a);
  });

  it('follows a chain to the newest version', async () => {
    const v1 = row(1, 'amended', null);
    const v2 = row(2, 'amended', 'h1');
    const v3 = row(3, 'active', 'h2');
    expect((await followAmendments(v1, finder([v1, v2, v3]))).contract_id).toBe('amb-2026-0003');
  });

  it('stops at the amended row when no newer version is found', async () => {
    const v1 = row(1, 'amended', null);
    expect(await followAmendments(v1, finder([v1]))).toBe(v1);
  });

  it('stops at a cycle', async () => {
    const v1 = row(1, 'amended', 'h2');
    const v2 = row(2, 'amended', 'h1');
    const out = await followAmendments(v1, finder([v1, v2]));
    expect(out).toBe(v2);
  });

  it('stops after 20 hops', async () => {
    const chain = Array.from({ length: 40 }, (_, i) => row(i + 1, 'amended', i === 0 ? null : `h${i}`));
    const out = await followAmendments(chain[0], finder(chain));
    expect(out.sha256_hash).toBe('h21');
  });
});
