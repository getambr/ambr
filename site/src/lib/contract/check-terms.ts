import { deriveCapabilities, type ContractCapabilities, type Money } from '@/lib/contract-capabilities';

/**
 * "Does this payment fit the agreement?" as a pure function. No server
 * imports, so the API route, the MCP tool and the homepage demo all answer
 * from the same code.
 *
 * Ambr never holds funds and does not track spend: the caller supplies the
 * amount already spent in the period (`period_spent`) or the monthly rule is
 * reported as not evaluated. A rule the agreement sets no limit for is never
 * reported as a pass: it is `not_evaluated`. When a rule HAS a limit but the
 * caller did not send what it needs (category, action, currency, period_spent),
 * the verdict is `incomplete` rather than `in_scope`.
 */

export type CheckRule =
  | 'version'
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

/** Precedence: out_of_scope > incomplete > needs_approval > in_scope. */
export type Verdict = 'in_scope' | 'out_of_scope' | 'needs_approval' | 'incomplete';

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
  /** The contract's `created_at`; a `duration_months` runs from here. */
  createdAt?: string | null;
};

export class CheckInputError extends Error {}

/** Terms from a contract's machine_readable JSON, via the shared parser. */
export function termsFromMachineReadable(
  machineReadable: Record<string, unknown> | null | undefined,
  expiryDate?: string | null,
  createdAt?: string | null,
): CheckTerms {
  const caps = deriveCapabilities(machineReadable, { always: true });
  return { mayDo: [], mayNotDo: [], categories: [], ...caps, expiryDate, createdAt };
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

/** Postgres-style month arithmetic: the day clamps to the end of a shorter month. */
function addMonths(ms: number, months: number): number {
  const d = new Date(ms);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.getTime();
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s.:-]+/g, '_');

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
  // Rules that have a limit in the agreement but lack the caller's input.
  const missing: string[] = [];
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

  // validity window. The end is, in order: end_date, the expiry_date column,
  // then duration_months from created_at (the same order the database uses
  // to fill expiry_date: compute_contract_expiry in the 20260611 migration).
  const nowMs = now.getTime();
  const from = startMs(terms.startDate);
  const until = endMs(terms.endDate);
  let expiry = endMs(terms.expiryDate);
  let endLabel = terms.endDate ?? terms.expiryDate ?? undefined;
  let durationUnreadable = false;
  if (until === undefined && expiry === undefined && terms.durationMonths !== undefined) {
    const created = startMs(terms.createdAt);
    if (created === undefined) {
      durationUnreadable = true;
    } else {
      expiry = addMonths(created, terms.durationMonths);
      endLabel = new Date(expiry).toISOString().slice(0, 10);
    }
  }
  if (from === undefined && until === undefined && expiry === undefined) {
    checks.push({
      rule: 'validity_window',
      result: 'not_evaluated',
      note: durationUnreadable
        ? 'The agreement runs for a number of months but its creation date is unknown, so the end could not be worked out.'
        : 'The agreement sets no readable start, end or expiry date.',
    });
  } else {
    const window = `${terms.startDate ?? '-'} to ${endLabel ?? '-'}`;
    const line: CheckLine = { rule: 'validity_window', result: 'pass', limit: window, value: now.toISOString() };
    if (from !== undefined && nowMs < from) {
      fail(line, `The agreement has not started yet (starts ${terms.startDate}).`);
    } else if (until !== undefined && nowMs > until) {
      fail(line, `The agreement ended on ${terms.endDate}.`);
    } else if (expiry !== undefined && nowMs > expiry) {
      fail(line, `The agreement expired on ${endLabel}.`);
    } else {
      checks.push(line);
    }
  }

  // currency. Each limit is compared in its own currency. A bare-number limit
  // in an agreement that names no currency has none to compare: its amount is
  // used as given and the currency rule says so; USD is never assumed.
  const named = new Map<string, string>();
  if (terms.currency) named.set(norm(terms.currency), terms.currency);
  for (const l of [terms.perTxLimit, terms.monthlyLimit, terms.approvalAbove]) {
    if (l && !l.assumedCurrency) named.set(norm(l.currency), l.currency);
  }
  const namedList = [...named.values()];
  const hasLimit = !!(terms.perTxLimit || terms.monthlyLimit || terms.approvalAbove);
  const comparable = (l: Money) =>
    !!l.assumedCurrency || !tx.currency || norm(l.currency) === norm(tx.currency);
  const skipped = 'This limit is in a different currency than the payment, so amounts are not compared.';

  if (namedList.length === 0) {
    checks.push({
      rule: 'currency',
      result: 'not_evaluated',
      note: hasLimit
        ? 'The agreement names no currency; its limits are compared as plain numbers.'
        : 'The agreement names no currency.',
    });
  } else if (!tx.currency) {
    checks.push({
      rule: 'currency',
      result: 'not_evaluated',
      limit: namedList.length === 1 ? namedList[0] : namedList,
      note: 'No currency was given for the payment, so amounts are compared as they are.',
    });
    missing.push(`No currency was sent, but the agreement is in ${namedList.join(' / ')}.`);
  } else if (namedList.every((c) => norm(c) === norm(tx.currency as string))) {
    checks.push({ rule: 'currency', result: 'pass', limit: namedList.length === 1 ? namedList[0] : namedList, value: tx.currency });
  } else {
    fail(
      { rule: 'currency', result: 'fail', limit: namedList.length === 1 ? namedList[0] : namedList, value: tx.currency },
      `The agreement is in ${namedList.join(' / ')}, the payment is in ${tx.currency}.`,
    );
  }

  // per-transaction limit
  const perTx = terms.perTxLimit;
  if (!perTx) {
    checks.push({ rule: 'per_transaction_limit', result: 'not_evaluated', note: 'The agreement sets no per-transaction limit.' });
  } else if (!comparable(perTx)) {
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
  } else if (!comparable(monthly)) {
    checks.push({ rule: 'monthly_limit', result: 'not_evaluated', limit: monthly.amount, note: skipped });
  } else if (tx.period_spent === undefined && tx.amount > monthly.amount + EPS) {
    // One payment above the monthly limit can never fit, whatever was spent before.
    fail(
      { rule: 'monthly_limit', result: 'fail', limit: monthly.amount, value: tx.amount },
      `This payment alone (${tx.amount}) is above the monthly limit of ${monthly.amount}.`,
    );
  } else if (tx.period_spent === undefined) {
    checks.push({
      rule: 'monthly_limit',
      result: 'not_evaluated',
      limit: monthly.amount,
      note: 'Ambr does not track spend. Send period_spent (what was already spent this month) to check the monthly limit.',
    });
    missing.push('No period_spent was sent, so the monthly limit could not be checked.');
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
    missing.push('No category was sent, but the agreement lists approved categories.');
  } else if (terms.categories.some((c) => norm(c) === norm(tx.category as string))) {
    checks.push({ rule: 'category', result: 'pass', limit: terms.categories, value: tx.category });
  } else {
    fail(
      { rule: 'category', result: 'fail', limit: terms.categories, value: tx.category },
      `The category "${tx.category}" is not in the agreement's approved categories.`,
    );
  }

  // action
  const prohibited = terms.prohibitedActions ?? [];
  if (terms.mayDo.length === 0 && prohibited.length === 0) {
    checks.push({ rule: 'action', result: 'not_evaluated', note: 'The agreement lists no enumerated actions.' });
  } else if (!tx.action) {
    checks.push({
      rule: 'action',
      result: 'not_evaluated',
      limit: terms.mayDo.length > 0 ? terms.mayDo : prohibited,
      note: 'The agreement restricts actions but no action was given.',
    });
    missing.push('No action was sent, but the agreement restricts actions.');
  } else if (prohibited.some((a) => norm(a) === norm(tx.action as string))) {
    fail(
      { rule: 'action', result: 'fail', limit: prohibited, value: tx.action },
      `The action "${tx.action}" is prohibited by the agreement.`,
    );
  } else if (terms.mayDo.length === 0) {
    checks.push({
      rule: 'action',
      result: 'not_evaluated',
      limit: prohibited,
      value: tx.action,
      note: 'The agreement only lists prohibited actions, so this action is not on that list but is not confirmed as allowed.',
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
  } else if (!comparable(approval)) {
    checks.push({ rule: 'approval_threshold', result: 'not_evaluated', limit: approval.amount, note: skipped });
  } else {
    // A monthly_aggregate threshold compares the month's total. Without
    // period_spent only the payment alone is known: enough to say approval is
    // needed, never enough to say it is not.
    const aggregate = terms.approvalBasis === 'monthly_aggregate';
    const subject = aggregate && tx.period_spent !== undefined ? tx.period_spent + tx.amount : tx.amount;
    if (subject > approval.amount + EPS) {
      needsApproval = true;
      checks.push({
        rule: 'approval_threshold',
        result: 'not_evaluated',
        limit: approval.amount,
        value: subject,
        note: 'Above the approval threshold: a human must approve this payment.',
      });
    } else if (aggregate && tx.period_spent === undefined) {
      checks.push({
        rule: 'approval_threshold',
        result: 'not_evaluated',
        limit: approval.amount,
        value: tx.amount,
        note: 'The threshold applies to the monthly total. Send period_spent to check it.',
      });
      const msg = 'No period_spent was sent, so the monthly limit could not be checked.';
      if (!missing.includes(msg)) missing.push('No period_spent was sent, so the approval threshold could not be checked.');
    } else {
      checks.push({ rule: 'approval_threshold', result: 'pass', limit: approval.amount, value: subject });
    }
  }

  // An agreement with nothing to check against must not read as a pass.
  const noLimits =
    !hasLimit && terms.categories.length === 0 && terms.mayDo.length === 0 && prohibited.length === 0;

  if (checks.some((c) => c.result === 'fail')) {
    return { verdict: 'out_of_scope', checks, reasons };
  }
  if (needsApproval) {
    reasons.push(
      terms.approvalBasis === 'monthly_aggregate' && tx.period_spent !== undefined
        ? `Spend this month would reach ${tx.period_spent + tx.amount}, above the approval threshold of ${approval?.amount}.`
        : `The amount ${tx.amount} is above the approval threshold of ${approval?.amount}.`,
    );
  }
  if (noLimits) reasons.push('The agreement sets no limits to check against.');
  reasons.push(...missing);

  let verdict: Verdict = 'in_scope';
  if (noLimits || missing.length > 0) verdict = 'incomplete';
  else if (needsApproval) verdict = 'needs_approval';
  return { verdict, checks, reasons };
}
