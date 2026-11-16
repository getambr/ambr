import { describe, expect, it } from 'vitest';
import type { CheckOutcome } from '../check-terms';
import { goldens, runGolden } from './check-fixtures';

type Json = Record<string, unknown>;

const d1 = goldens()['d1-general-auth'];
const d2 = goldens()['d2-limited-service'];
const d3 = goldens()['d3-fleet-auth'];

const beside = (g: typeof d1, key: string, value: string, tx: Json = {}) =>
  runGolden(g, { mr: (m) => { (m.financial_terms as Json)[key] = value; }, tx });
const entry = (r: CheckOutcome, key: string) => r.not_checked.find((n) => n.path === `financial_terms.${key}`);

describe('period wording beside a per-transaction cap', () => {
  const KEY = 'per_transaction_period';

  it('reads the month as the period the cap also applies to', () => {
    for (const word of ['per month', 'per calendar month', 'monthly aggregate', 'cumulative']) {
      expect(beside(d1, KEY, word, { period_spent: 30 }).verdict, word).toBe('within_limits');
      expect(beside(d1, KEY, word, { period_spent: 70 }).verdict, word).toBe('out_of_scope');
      expect(beside(d1, KEY, word, { period_spent: undefined }).verdict, word).toBe('incomplete');
    }
  });

  it('is incomplete for any other period, even though the single payment is within the cap', () => {
    for (const word of ['per day', 'daily', 'per week', 'weekly', 'per quarter', 'quarterly', 'per year', 'annual', 'total', 'per agreement', 'fleet total', 'all agents', 'hourly']) {
      const r = beside(d1, KEY, word, { period_spent: 0 });
      expect(r.verdict, word).toBe('incomplete');
      expect(entry(r, KEY), word).toMatchObject({ kind: 'basis_wording' });
    }
  });

  it('keeps per transaction and per invoice as plain wording, and does not read other counterparts or scopes', () => {
    for (const word of ['per transaction', 'per invoice', 'each payment', 'single transaction']) {
      expect(beside(d1, KEY, word, { period_spent: 0 }).verdict, word).toBe('within_limits');
    }
    for (const word of ['per vendor', 'per project phase', 'at the discretion of the agent']) {
      expect(beside(d1, KEY, word, { period_spent: 0 }).verdict, word).toBe('incomplete');
    }
  });

  it('does not say the strictest reading was applied when none was', () => {
    for (const word of ['per week', 'per transaction', 'per month']) {
      const why = entry(beside(d1, KEY, word, { period_spent: 0 }), KEY)?.why ?? '';
      expect(why, word).not.toMatch(/strictest/i);
      expect(why, word).toMatch(/read the wording yourself/i);
    }
    expect(entry(beside(d1, KEY, 'per transaction', { period_spent: 0 }), KEY)?.why).toMatch(/single payment only/);
    expect(entry(beside(d1, KEY, 'per month', { period_spent: 0 }), KEY)?.why).toMatch(/period's total/);
    expect(entry(beside(d1, KEY, 'per week', { period_spent: 0 }), KEY)?.why).toMatch(/incomplete/);
  });
});

describe('period wording beside a monthly limit', () => {
  const KEY = 'spending_limit_monthly_basis';

  it('accepts wording that names the month', () => {
    for (const word of ['per month', 'monthly aggregate', 'calendar month', 'cumulative', 'rolling']) {
      expect(beside(d1, KEY, word).verdict, word).toBe('within_limits');
    }
  });

  it('is incomplete for another period, a payment basis or the whole agreement', () => {
    for (const word of ['per day', 'daily', 'per week', 'quarterly', 'annual', 'total', 'per transaction', 'per agreement', 'fleet', 'at the discretion of the agent']) {
      const r = beside(d1, KEY, word);
      expect(r.verdict, word).toBe('incomplete');
      expect(entry(r, KEY), word).toBeDefined();
    }
  });

  it('holds for a fleet budget and a monthly fee as well', () => {
    expect(beside(d3, 'shared_budget_monthly_basis', 'per week').verdict).toBe('incomplete');
    expect(beside(d3, 'shared_budget_monthly_basis', 'per month').verdict).toBe('within_limits');
    const c2 = goldens()['c2-compute-sla'];
    expect(beside(c2, 'monthly_fee_basis', 'per week').verdict).toBe('incomplete');
    expect(beside(c2, 'monthly_fee_basis', 'per month').verdict).toBe('within_limits');
  });
});

describe('period wording beside a total budget', () => {
  const KEY = 'budget_basis';

  it('accepts the whole agreement and is incomplete for a month or a payment basis', () => {
    for (const word of ['total', 'whole agreement', 'for the term of the agreement']) expect(beside(d2, KEY, word).verdict, word).toBe('within_limits');
    for (const word of ['per month', 'per week', 'per transaction']) expect(beside(d2, KEY, word).verdict, word).toBe('incomplete');
  });
});

describe('thresholds beside wording (a per-payment wording is no stricter than none)', () => {
  // d1: approval above 50, a payment of 40 and 200 already spent; d3: escalation above 300.
  const withWord = (g: typeof d1, key: string, word: string | undefined, tx: Json) =>
    runGolden(g, { mr: (m) => { if (word) (m.financial_terms as Json)[key] = word; }, tx });

  it('keeps the approval threshold on the single payment for per-payment wording, as without any wording', () => {
    const none = withWord(d1, 'approval_basis', undefined, { amount: 40, period_spent: 200 });
    expect(none.verdict).toBe('within_limits');
    for (const word of ['per transaction', 'per payment', 'each payment', 'single transaction']) {
      const r = withWord(d1, 'approval_basis', word, { amount: 40, period_spent: 200 });
      expect(r.verdict, word).toBe(none.verdict);
      expect(entry(r, 'approval_basis')?.why, word).toMatch(/single payment only/);
    }
  });

  it('judges the period total too for wording that names the month', () => {
    for (const word of ['monthly aggregate', 'per calendar month', 'cumulative']) {
      expect(withWord(d1, 'approval_basis', word, { amount: 40, period_spent: 200 }).verdict, word).toBe('needs_approval');
      expect(withWord(d1, 'approval_basis', word, { amount: 40, period_spent: 5 }).verdict, word).toBe('within_limits');
    }
  });

  it('is incomplete for wording that names another period, which period_spent does not cover', () => {
    for (const word of ['per day', 'per week', 'total', 'annual']) {
      expect(withWord(d1, 'approval_basis', word, { amount: 40, period_spent: 5 }).verdict, word).toBe('incomplete');
    }
  });

  it('does the same for the escalation threshold of a fleet', () => {
    const tx = { amount: 100, period_spent: 400 };
    expect(withWord(d3, 'escalation_basis', undefined, tx).verdict).toBe('within_limits');
    expect(withWord(d3, 'escalation_basis', 'per transaction', tx).verdict).toBe('within_limits');
    expect(withWord(d3, 'escalation_basis', 'monthly aggregate', tx).verdict).toBe('needs_approval');
  });

  it('still asks for approval when the payment itself is above the threshold, whatever the wording', () => {
    expect(withWord(d1, 'approval_basis', 'per transaction', { amount: 60, period_spent: 0 }).verdict).toBe('needs_approval');
  });
});

describe('a realistic agreement stays reachable', () => {
  it('every template golden reaches within_limits with nothing the caller must fix', () => {
    for (const [slug, g] of Object.entries(goldens())) {
      const r = runGolden(g);
      expect(r.verdict, slug).toBe('within_limits');
      expect(r.reasons, slug).toEqual([]);
    }
  });

  it('wording that fits each limit keeps the verdict, and lists the wording', () => {
    const r = runGolden(d1, {
      mr: (m) => {
        const f = m.financial_terms as Json;
        f.per_transaction_basis = 'per transaction';
        f.spending_limit_monthly_basis = 'per calendar month';
        f.approval_basis = 'per transaction';
      },
    });
    expect(r.verdict).toBe('within_limits');
    for (const key of ['per_transaction_basis', 'spending_limit_monthly_basis', 'approval_basis']) expect(entry(r, key)).toBeDefined();
    const fleet = runGolden(d3, { mr: (m) => { (m.financial_terms as Json).escalation_basis = 'per payment'; } });
    expect(fleet.verdict).toBe('within_limits');
  });
});
