import { deriveCapabilities, type ContractCapabilities } from '@/lib/contract-capabilities';

/**
 * "Does this payment fit the agreement?" as a pure function. No server
 * imports, so the API route, the MCP tool and the homepage demo all answer
 * from the same code.
 *
 * Ambr never holds funds and does not track spend: the caller supplies the
 * amount already spent in the period (`period_spent`) or the monthly rule is
 * reported as not evaluated. A rule the agreement sets no limit for is never
 * reported as a pass: it is `not_evaluated`.
 */

export type CheckRule =
  | 'status'
  | 'validity_window'
  | 'currency'
  | 'per_transaction_limit'
  | 'monthly_limit'
  | 'category'
  | 'action'
  | 'approval_threshold';

export type CheckResult = 'pass' | 'fail' | 'not_evaluated';

export interface CheckLine {
  rule: CheckRule;
  result: CheckResult;
  limit?: number | string | string[];
  value?: number | string;
  note?: string;
}

export type Verdict = 'in_scope' | 'out_of_scope' | 'needs_approval';

export interface CheckOutcome {
  verdict: Verdict;
  checks: CheckLine[];
  reasons: string[];
}

export interface CheckTransaction {
  amount: number;
  currency?: string;
  category?: string;
  action?: string;
  /** Spent so far in the current month, supplied by the caller. */
  period_spent?: number;
}

/** What the agreement says, in the shape the capabilities parser already produces. */
export type CheckTerms = ContractCapabilities & {
  /** The contract's `expiry_date` column, when set. */
  expiryDate?: string | null;
};

export class CheckInputError extends Error {}

/** Terms from a contract's machine_readable JSON, via the shared parser. */
export function termsFromMachineReadable(
  machineReadable: Record<string, unknown> | null | undefined,
  expiryDate?: string | null,
): CheckTerms {
  const caps = deriveCapabilities(machineReadable, { always: true });
  return { mayDo: [], mayNotDo: [], categories: [], ...caps, expiryDate };
}

function badNumber(v: unknown): boolean {
  return typeof v !== 'number' || !Number.isFinite(v) || v < 0;
}

/** Null when the input is usable, else a plain-language reason. */
export function validateTransaction(tx: CheckTransaction): string | null {
  if (!tx || typeof tx !== 'object') return 'Transaction must be an object.';
  if (badNumber(tx.amount)) return 'amount must be a finite number, zero or more.';
  if (tx.period_spent !== undefined && badNumber(tx.period_spent)) {
    return 'period_spent must be a finite number, zero or more.';
  }
  return null;
}

const DAY_MS = 86_400_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const EPS = 1e-9;

function startMs(s: string | null | undefined): number | undefined {
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : t;
}

/** A date-only end date runs to the end of that day (UTC). */
function endMs(s: string | null | undefined): number | undefined {
  const t = startMs(s);
  if (t === undefined) return undefined;
  return DATE_ONLY.test(s as string) ? t + DAY_MS - 1 : t;
}

const norm = (s: string) => s.trim().toLowerCase();

export function checkTransaction(
  terms: CheckTerms,
  status: string,
  tx: CheckTransaction,
  now: Date,
): CheckOutcome {
  const invalid = validateTransaction(tx);
  if (invalid) throw new CheckInputError(invalid);

  const checks: CheckLine[] = [];
  const reasons: string[] = [];
  const fail = (line: CheckLine, reason: string) => {
    checks.push({ ...line, result: 'fail' });
    reasons.push(reason);
  };

  // status
  if (status === 'active') {
    checks.push({ rule: 'status', result: 'pass', limit: 'active', value: status });
  } else {
    fail(
      { rule: 'status', result: 'fail', limit: 'active', value: status },
      `The agreement is ${status}, not active.`,
    );
  }

  // validity window
  const nowMs = now.getTime();
  const from = startMs(terms.startDate);
  const until = endMs(terms.endDate);
  const expiry = endMs(terms.expiryDate);
  if (from === undefined && until === undefined && expiry === undefined) {
    checks.push({
      rule: 'validity_window',
      result: 'not_evaluated',
      note: 'The agreement sets no readable start, end or expiry date.',
    });
  } else {
    const window = `${terms.startDate ?? '-'} to ${terms.endDate ?? terms.expiryDate ?? '-'}`;
    const line: CheckLine = { rule: 'validity_window', result: 'pass', limit: window, value: now.toISOString() };
    if (from !== undefined && nowMs < from) {
      fail(line, `The agreement has not started yet (starts ${terms.startDate}).`);
    } else if (until !== undefined && nowMs > until) {
      fail(line, `The agreement ended on ${terms.endDate}.`);
    } else if (expiry !== undefined && nowMs > expiry) {
      fail(line, `The agreement expired on ${terms.expiryDate}.`);
    } else {
      checks.push(line);
    }
  }

  // currency: the one the agreement names, else the currency of its limits
  const agreementCurrency =
    terms.currency ?? terms.perTxLimit?.currency ?? terms.monthlyLimit?.currency ?? terms.approvalAbove?.currency;
  let currencyOk = true;
  if (!agreementCurrency) {
    checks.push({ rule: 'currency', result: 'not_evaluated', note: 'The agreement names no currency.' });
  } else if (!tx.currency) {
    checks.push({
      rule: 'currency',
      result: 'not_evaluated',
      limit: agreementCurrency,
      note: 'No currency was given for the payment, so amounts are compared as they are.',
    });
  } else if (norm(tx.currency) === norm(agreementCurrency)) {
    checks.push({ rule: 'currency', result: 'pass', limit: agreementCurrency, value: tx.currency });
  } else {
    currencyOk = false;
    fail(
      { rule: 'currency', result: 'fail', limit: agreementCurrency, value: tx.currency },
      `The agreement is in ${agreementCurrency}, the payment is in ${tx.currency}.`,
    );
  }
  const skipped = 'The payment is in a different currency, so amounts are not compared.';

  // per-transaction limit
  const perTx = terms.perTxLimit;
  if (!perTx) {
    checks.push({ rule: 'per_transaction_limit', result: 'not_evaluated', note: 'The agreement sets no per-transaction limit.' });
  } else if (!currencyOk) {
    checks.push({ rule: 'per_transaction_limit', result: 'not_evaluated', limit: perTx.amount, value: tx.amount, note: skipped });
  } else if (tx.amount <= perTx.amount + EPS) {
    checks.push({ rule: 'per_transaction_limit', result: 'pass', limit: perTx.amount, value: tx.amount });
  } else {
    fail(
      { rule: 'per_transaction_limit', result: 'fail', limit: perTx.amount, value: tx.amount },
      `The amount ${tx.amount} is above the per-transaction limit of ${perTx.amount}.`,
    );
  }

  // monthly limit
  const monthly = terms.monthlyLimit;
  if (!monthly) {
    checks.push({ rule: 'monthly_limit', result: 'not_evaluated', note: 'The agreement sets no monthly limit.' });
  } else if (!currencyOk) {
    checks.push({ rule: 'monthly_limit', result: 'not_evaluated', limit: monthly.amount, note: skipped });
  } else if (tx.period_spent === undefined) {
    checks.push({
      rule: 'monthly_limit',
      result: 'not_evaluated',
      limit: monthly.amount,
      note: 'Ambr does not track spend. Send period_spent (what was already spent this month) to check the monthly limit.',
    });
  } else {
    const total = tx.period_spent + tx.amount;
    if (total <= monthly.amount + EPS) {
      checks.push({ rule: 'monthly_limit', result: 'pass', limit: monthly.amount, value: total });
    } else {
      fail(
        { rule: 'monthly_limit', result: 'fail', limit: monthly.amount, value: total },
        `Spend this month would reach ${total}, above the monthly limit of ${monthly.amount}.`,
      );
    }
  }

  // category
  if (terms.categories.length === 0) {
    checks.push({ rule: 'category', result: 'not_evaluated', note: 'The agreement lists no approved categories.' });
  } else if (!tx.category) {
    checks.push({
      rule: 'category',
      result: 'not_evaluated',
      limit: terms.categories,
      note: 'The agreement lists approved categories but no category was given.',
    });
  } else if (terms.categories.some((c) => norm(c) === norm(tx.category as string))) {
    checks.push({ rule: 'category', result: 'pass', limit: terms.categories, value: tx.category });
  } else {
    fail(
      { rule: 'category', result: 'fail', limit: terms.categories, value: tx.category },
      `The category "${tx.category}" is not in the agreement's approved categories.`,
    );
  }

  // action
  if (terms.mayDo.length === 0) {
    checks.push({ rule: 'action', result: 'not_evaluated', note: 'The agreement lists no enumerated actions.' });
  } else if (!tx.action) {
    checks.push({
      rule: 'action',
      result: 'not_evaluated',
      limit: terms.mayDo,
      note: 'The agreement lists enumerated actions but no action was given.',
    });
  } else if (terms.mayDo.some((a) => norm(a) === norm(tx.action as string))) {
    checks.push({ rule: 'action', result: 'pass', limit: terms.mayDo, value: tx.action });
  } else {
    fail(
      { rule: 'action', result: 'fail', limit: terms.mayDo, value: tx.action },
      `The action "${tx.action}" is not one the agreement enumerates.`,
    );
  }

  // approval threshold: never a fail, it only changes the verdict
  const approval = terms.approvalAbove;
  let needsApproval = false;
  if (!approval) {
    checks.push({ rule: 'approval_threshold', result: 'not_evaluated', note: 'The agreement sets no approval threshold.' });
  } else if (!currencyOk) {
    checks.push({ rule: 'approval_threshold', result: 'not_evaluated', limit: approval.amount, note: skipped });
  } else if (tx.amount > approval.amount + EPS) {
    needsApproval = true;
    checks.push({
      rule: 'approval_threshold',
      result: 'not_evaluated',
      limit: approval.amount,
      value: tx.amount,
      note: 'Above the approval threshold: a human must approve this payment.',
    });
  } else {
    checks.push({ rule: 'approval_threshold', result: 'pass', limit: approval.amount, value: tx.amount });
  }

  let verdict: Verdict = 'in_scope';
  if (checks.some((c) => c.result === 'fail')) {
    verdict = 'out_of_scope';
  } else if (needsApproval) {
    verdict = 'needs_approval';
    reasons.push(`The amount ${tx.amount} is above the approval threshold of ${approval?.amount}.`);
  }

  return { verdict, checks, reasons };
}
