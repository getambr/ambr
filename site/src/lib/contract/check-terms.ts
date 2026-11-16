import type { Money } from '@/lib/contract-capabilities';
import { MAX_NAMED_PATHS, namePaths, scanMachineReadable, wordingEffects } from './check-accounting';
import { isRecord, readAnswers } from './check-answers';
import { TEMPLATE_RULES, type ListRole, type MoneyRole } from './check-template-map';
import { MAX_NOT_CHECKED, normEntry, type NotChecked } from './check-text';

/**
 * "Does this payment fit the limits of the agreement?" as a pure function. No
 * server imports, so the API route, the MCP tool and the homepage demo all
 * answer from the same code.
 *
 * The check evaluates only what a program can check exactly: amounts, prices,
 * approval thresholds, currency, the validity window, and the exact
 * (normalised) match of the caller's own action and category labels against the
 * agreement's lists. It never reads the agreement's human-readable text and
 * never says a payment is allowed. Everything written in words that may limit a
 * payment is handed back by path in `not_checked`, for the caller to read.
 *
 * Ambr never holds funds and does not track spend: the caller supplies the
 * amount already spent (`period_spent`) or the rule that needs it is reported
 * as not evaluated. A rule the agreement sets no limit for is never reported
 * as a pass: it is `not_evaluated`. When a rule HAS a limit but the caller did
 * not send what it needs (category, action, currency, period_spent), or the
 * agreement states a figure or a contradiction the check cannot place, the
 * verdict is `incomplete` rather than `within_limits`.
 */

export type CheckRule =
  | 'version'
  | 'status'
  | 'validity_window'
  | 'currency'
  | 'per_transaction_limit'
  | 'monthly_limit'
  | 'total_budget'
  | 'price'
  | 'category'
  | 'action'
  | 'counterparty'
  | 'geographic'
  | 'approval_threshold'
  | 'escalation_threshold'
  | 'agreement_terms';

export type CheckResult = 'pass' | 'fail' | 'not_evaluated';

export interface CheckLine {
  rule: CheckRule;
  result: CheckResult;
  limit?: number | string | string[];
  value?: number | string;
  note?: string;
}

/**
 * Precedence: out_of_scope (a rule definitely fails) > needs_approval (an
 * approval or escalation threshold is exceeded) > incomplete > within_limits.
 * within_limits needs every limit evaluated and passed, nothing the check could
 * not read or place, and at least one spending limit or price actually
 * evaluated. It says nothing about terms written in words.
 */
export type Verdict = 'within_limits' | 'out_of_scope' | 'needs_approval' | 'incomplete';

export interface CheckOutcome {
  verdict: Verdict;
  checks: CheckLine[];
  reasons: string[];
  /** Parts of the agreement the check did not evaluate and the caller must read itself: paths and kinds, never the text. At most MAX_NOT_CHECKED entries. */
  not_checked: NotChecked[];
  /** How many entries there were before the cap. */
  not_checked_count: number;
  /** Set when the verdict is needs_approval and some limit could not be evaluated either: `reasons` still carries them. */
  also_incomplete?: boolean;
}

export interface CheckTransaction {
  amount: number;
  currency?: string;
  category?: string;
  action?: string;
  /**
   * Spent so far in the period the limit covers: this month for a monthly
   * limit or fee, the whole agreement so far for a total budget or price.
   */
  period_spent?: number;
}

/** A price the payment is compared with: a price per call, or a fixed monthly fee. */
export interface PriceTerm {
  kind: 'per_call' | 'monthly_fee';
  amount: Money;
}

/**
 * What the agreement says that the check can use. Limits come from the
 * contract's form answers (termsFromAgreement); everything the agreement states
 * that the check cannot evaluate is listed in `unevaluated` or `unreadable`,
 * and any entry there keeps the verdict from being within_limits. Every field
 * after `categories` is optional.
 */
export interface CheckTerms {
  /** Permitted actions, matched exactly against the caller's action. */
  mayDo: string[];
  /** Boundaries written in words; never matched, only handed back (see `notChecked`). */
  mayNotDo: string[];
  prohibitedActions?: string[];
  restrictedActions?: string[];
  categories: string[];
  /** Where `categories` comes from: the form answers (a miss is out_of_scope) or the agreement text (a miss is incomplete: words do not decide). */
  categoriesSource?: 'form' | 'text';
  /** Where `mayDo` comes from: the form answers (a miss is out_of_scope) or the agreement text (a miss is incomplete: words do not decide). */
  mayDoSource?: 'form' | 'text';
  /** Where each action list sits, for `not_checked`. */
  listPaths?: { permitted?: string[]; prohibited?: string[]; restricted?: string[]; categories?: string[] };
  perTxLimit?: Money;
  monthlyLimit?: Money;
  /** One budget for the whole agreement (a limited-service budget, a task's total price). */
  totalBudget?: Money;
  price?: PriceTerm;
  /** Payments above this need a human's approval. */
  approvalAbove?: Money;
  /** Payments above this go to the lead agent: its own rule, judged separately from the approval threshold. */
  escalationAbove?: Money;
  /** The human-oversight threshold Ambr writes into the agreement text. Always judged on the single payment and on the period's total. */
  oversightAbove?: Money;
  /** The agreement's wording beside this threshold could not be read as one basis: judged on the single payment and on the period's total, whichever is stricter. */
  approvalStrict?: boolean;
  escalationStrict?: boolean;
  /** The agreement's wording beside the per-transaction limit names a period: the limit is also applied to the period's total. */
  perTxBasis?: 'also_period';
  /** The total budget is paid once, on completion: the payment must be exactly what is left of it. */
  onCompletion?: boolean;
  /** Currency the agreement names for its limits, when it names one. */
  currency?: string;
  startDate?: string;
  endDate?: string;
  durationMonths?: number;
  /** The contract's `expiry_date` column, when set. */
  expiryDate?: string | null;
  /** The contract's `created_at`; a `duration_months` runs from here. */
  createdAt?: string | null;
  /** Parts handed back to the caller for reading (see NotChecked). */
  notChecked?: NotChecked[];
  /** Restrictions the agreement states that this check does not evaluate. */
  unevaluated?: { rule: CheckRule; note: string }[];
  /** Reasons the agreement's terms could not be read as a whole (unknown template, no form answers, figures or statements the form answers do not explain). */
  unreadable?: string[];
}

export class CheckInputError extends Error {}

export interface AgreementInput {
  /** `templates.slug` of the contract's template. */
  templateSlug?: string | null;
  /** `contracts.parameters`: the form answers. */
  parameters?: unknown;
  /** `contracts.machine_readable`: cross-checked, never used for a limit. */
  machineReadable?: unknown;
  expiryDate?: string | null;
  createdAt?: string | null;
  /** `contracts.oversight_threshold_usd` of the version checked: a USD amount, judged as an approval threshold. */
  oversightThresholdUsd?: number | string | null;
}

const hasKey = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const clipText = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 3)}...` : s);
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((e) => b.has(e));
const dedupe = (items: string[]) => [...new Set(items)];

const DAY_MS = 86_400_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const EPS = 1e-9;
/** The database fills `expiry_date` from a duration of one to three digits. */
const MAX_MONTHS = 999;
const MICRO = 1_000_000;

const RULE_OF_ROLE: Record<MoneyRole, CheckRule> = {
  per_transaction: 'per_transaction_limit',
  monthly: 'monthly_limit',
  total: 'total_budget',
  price_per_call: 'price',
  monthly_fee: 'price',
  approval: 'approval_threshold',
  escalation: 'escalation_threshold',
};

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

/** An ISO date for a time, or undefined when the time is outside what a Date can hold. */
function isoDay(ms: number): string | undefined {
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

/**
 * Postgres-style month arithmetic: the day clamps to the end of a shorter
 * month. A duration that is not a whole number of months between one and three
 * digits' worth, or a result a Date cannot hold, comes back undefined, never as an error.
 */
function safeAddMonths(ms: number, months: number): number | undefined {
  if (!Number.isFinite(ms) || !Number.isInteger(months) || months < 1 || months > MAX_MONTHS) return undefined;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return undefined;
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  if (Number.isNaN(d.getTime())) return undefined;
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  const t = d.getTime();
  return Number.isNaN(t) ? undefined : t;
}

/** An amount in millionths of a unit, or undefined when it has finer detail than that or is too large to hold exactly. */
function toMicro(n: number): number | undefined {
  if (!Number.isFinite(n)) return undefined;
  const scaled = n * MICRO;
  const micro = Math.round(scaled);
  if (!Number.isSafeInteger(micro) || Math.abs(scaled - micro) > 1e-3) return undefined;
  return micro;
}

/**
 * Terms from a contract's form answers (limits, lists), with `machine_readable`
 * scanned for everything the answers do not explain. The template decides
 * what each answer means (check-template-map.ts); a template the check does
 * not know, or a contract without form answers, comes back with an
 * `unreadable` reason and no limits.
 */
export function termsFromAgreement(input: AgreementInput): CheckTerms {
  const unreadable: string[] = [];
  const unevaluated: { rule: CheckRule; note: string }[] = [];
  const notChecked: NotChecked[] = [];
  const terms: CheckTerms = {
    mayDo: [],
    mayNotDo: [],
    categories: [],
    expiryDate: input.expiryDate,
    createdAt: input.createdAt,
  };

  const slug = input.templateSlug ?? undefined;
  if (!slug) {
    unreadable.push("The agreement's template is not known, so its form answers cannot be read.");
  } else if (!hasKey(TEMPLATE_RULES, slug)) {
    unreadable.push(`The check does not read form answers of the "${clipText(slug)}" template.`);
  } else if (!isRecord(input.parameters)) {
    unreadable.push('The agreement has no stored form answers, so its limits cannot be read.');
  } else {
    const rules = TEMPLATE_RULES[slug];
    const answers = readAnswers(slug, input.parameters);
    const scan = scanMachineReadable(input.machineReadable, answers.accounted, slug);
    const { amounts } = answers;
    const listKeys = (role: ListRole) => Object.entries(rules.lists).filter(([, s]) => s.role === role).map(([k]) => k);

    terms.perTxLimit = amounts.per_transaction?.money;
    terms.monthlyLimit = amounts.monthly?.money;
    terms.totalBudget = amounts.total?.money;
    terms.approvalAbove = amounts.approval?.money;
    terms.escalationAbove = amounts.escalation?.money;
    if (amounts.price_per_call) terms.price = { kind: 'per_call', amount: amounts.price_per_call.money };
    if (amounts.monthly_fee) terms.price = { kind: 'monthly_fee', amount: amounts.monthly_fee.money };
    terms.categories = answers.categories;
    // The oversight threshold lives in the agreement text and in the contract's column; an amended
    // version's text is regenerated without it, so both are read and the lower one counts.
    const columnRaw = input.oversightThresholdUsd;
    let column: number | undefined;
    if (columnRaw !== undefined && columnRaw !== null && columnRaw !== '') {
      const n = typeof columnRaw === 'number' ? columnRaw : /^\d{1,15}(\.\d{1,8})?$/.test(String(columnRaw).trim()) ? Number(String(columnRaw).trim()) : NaN;
      if (Number.isFinite(n) && n >= 0) column = n;
      else unreadable.push("The contract's oversight threshold is not a usable amount.");
    }
    const oversight = scan.oversight === undefined ? column : column === undefined ? scan.oversight : Math.min(scan.oversight, column);
    if (oversight !== undefined) terms.oversightAbove = { amount: oversight, currency: 'USD' };

    // Free-text answers: never read, always handed back.
    for (const key of answers.words) {
      notChecked.push({ path: key, kind: 'free_text_answer', why: 'Free text in the form answers. The check does not read it.' });
    }

    // Validity window. Form answers are the source; dates in the agreement text
    // can only make it stricter, and a date that differs from an answer is a contradiction.
    const startAnswer = answers.window.start;
    const endAnswer = answers.window.end;
    const day = (s: string) => s.trim().slice(0, 10);
    const starts = [startAnswer, ...scan.dates.starts.map((d) => d.text)].filter((s): s is string => !!s);
    const ends = [endAnswer, ...scan.dates.ends.map((d) => d.text)].filter((s): s is string => !!s);
    if (startAnswer) {
      for (const d of scan.dates.starts) {
        if (day(d.text) !== day(startAnswer)) unreadable.push(`The agreement text's start date at "${d.path}" differs from the form answers.`);
      }
    }
    if (endAnswer) {
      for (const d of scan.dates.ends) {
        if (day(d.text) !== day(endAnswer)) unreadable.push(`The agreement text's end date at "${d.path}" differs from the form answers.`);
      }
    }
    const latest = (items: string[], pick: (s: string) => number | undefined) =>
      items.reduce<string | undefined>((best, s) => (best === undefined || (pick(s) ?? -Infinity) > (pick(best) ?? -Infinity) ? s : best), undefined);
    const earliest = (items: string[], pick: (s: string) => number | undefined) =>
      items.reduce<string | undefined>((best, s) => (best === undefined || (pick(s) ?? Infinity) < (pick(best) ?? Infinity) ? s : best), undefined);
    terms.startDate = latest(starts, startMs);
    terms.endDate = earliest(ends, endMs);
    const months = answers.window.months;
    if (months !== undefined) {
      if (Number.isInteger(months) && months >= 1 && months <= MAX_MONTHS) {
        terms.durationMonths = months;
        // The end the answers give is the creation date plus the duration; an end date in the text that differs is a contradiction.
        const created = startMs(input.createdAt);
        const derived = !endAnswer && created !== undefined ? safeAddMonths(created, months) : undefined;
        if (derived !== undefined) {
          for (const d of scan.dates.ends) {
            const written = endMs(d.text);
            if (written === undefined || isoDay(written) !== isoDay(derived)) unreadable.push(`The agreement text's end date at "${d.path}" differs from the end the form answers give.`);
          }
        }
      } else {
        unreadable.push(`The agreement's duration (${clipText(String(months), 20)}) is not a usable number of months, so its end cannot be worked out.`);
      }
    }

    // Action lists. The form answer is the list when the template has one; the
    // agreement text must then repeat it exactly (the scan compares), and a
    // permitted list found only in the text is a list the check cannot rely on.
    const listPaths: NonNullable<CheckTerms['listPaths']> = {};
    const textPermitted = scan.actionLists.permitted;
    if (answers.permittedActions.length > 0) {
      terms.mayDo = answers.permittedActions;
      terms.mayDoSource = 'form';
      listPaths.permitted = listKeys('permitted_actions');
    } else if (textPermitted.length > 0) {
      const sets = textPermitted.map((l) => new Set(l.entries.map(normEntry)));
      if (sets.some((s) => !sameSet(s, sets[0]))) {
        unreadable.push('The agreement text lists permitted actions in more than one place, and the lists differ.');
      } else {
        terms.mayDo = textPermitted[0].entries;
        terms.mayDoSource = 'text';
        listPaths.permitted = textPermitted.map((l) => l.path);
      }
    }
    const textCategories = scan.categoryLists;
    if (terms.categories.length > 0) {
      terms.categoriesSource = 'form';
    } else if (textCategories.length > 0) {
      const sets = textCategories.map((l) => new Set(l.entries.map(normEntry)));
      if (sets.some((s) => !sameSet(s, sets[0]))) {
        unreadable.push('The agreement text lists approved categories in more than one place, and the lists differ.');
      } else {
        terms.categories = textCategories[0].entries;
        terms.categoriesSource = 'text';
        listPaths.categories = textCategories.map((l) => l.path);
      }
    }
    const prohibited = scan.actionLists.prohibited;
    if (prohibited.length > 0) {
      terms.prohibitedActions = dedupe(prohibited.flatMap((l) => l.entries));
      listPaths.prohibited = prohibited.map((l) => l.path);
    }
    const restrictedText = scan.actionLists.restricted;
    const reserved = dedupe([...answers.restrictedActions, ...restrictedText.flatMap((l) => l.entries)]);
    if (reserved.length > 0) {
      terms.restrictedActions = reserved;
      listPaths.restricted = dedupe([...(answers.restrictedActions.length > 0 ? listKeys('restricted_actions') : []), ...restrictedText.map((l) => l.path)]);
    }
    if (Object.keys(listPaths).length > 0) terms.listPaths = listPaths;
    const boundaries = scan.actionLists.boundaries;
    if (boundaries.length > 0) {
      terms.mayNotDo = boundaries.flatMap((l) => l.entries);
      for (const b of boundaries) {
        notChecked.push({ path: b.path, kind: 'list_entry', why: 'Boundaries written in words. The check does not read them.' });
      }
    }

    if (answers.counterparties.length > 0) {
      unevaluated.push({
        rule: 'counterparty',
        note: `The agreement limits who the agent may pay (${answers.counterparties.length} named), and the request carries no counterparty to compare.`,
      });
      for (const key of listKeys('counterparties')) {
        notChecked.push({ path: key, kind: 'list_entry', why: 'Counterparties the agent may pay. The request carries no counterparty, so the check cannot compare them.' });
      }
    }

    // How the payment is released (c3).
    const model = answers.paymentModel ? normEntry(answers.paymentModel) : undefined;
    if (rules.paymentModel && model !== undefined) {
      const path = rules.paymentModel.key;
      if (model === 'on_completion') {
        terms.onCompletion = true;
        notChecked.push({ path, kind: 'condition', why: 'Payment on completion. The check cannot tell whether the work was completed or accepted.' });
      } else if (model === 'upfront') {
        notChecked.push({ path, kind: 'condition', why: 'Payment up front. Any condition on what the payment covers is written in words.' });
      } else {
        unevaluated.push({
          rule: 'price',
          note: `The payment model is "${clipText(answers.paymentModel as string, 30)}", which this check does not match to a single payment.`,
        });
        notChecked.push({ path, kind: 'condition', why: 'A payment model whose release conditions the check cannot verify.' });
      }
    }
    if (answers.milestones > 0) {
      unevaluated.push({ rule: 'price', note: 'The agreement sets milestone payments, which this check does not match to a payment.' });
      for (const key of listKeys('milestones')) {
        notChecked.push({ path: key, kind: 'condition', why: 'Milestones that release payments. The check cannot tell which one this payment is for.' });
      }
    }
    for (const g of answers.gated) unevaluated.push({ rule: 'price', note: `${g.key}: ${g.reason}` });

    // Basis or period wording beside a limit: read only when it fits the rule it sits beside, otherwise incomplete.
    for (const w of scan.wording) {
      for (const [role, effect] of wordingEffects(w)) {
        if (role === 'approval' || role === 'escalation') {
          if (effect !== 'single_payment') terms[role === 'approval' ? 'approvalStrict' : 'escalationStrict'] = true;
        } else if (role === 'per_transaction' && effect === 'period_total') {
          terms.perTxBasis = 'also_period';
        }
        if (effect === 'unreadable') {
          unevaluated.push({ rule: RULE_OF_ROLE[role], note: `The agreement text puts wording beside a limit at "${w.path}" that names a basis or period the check does not cover, or that it cannot read.` });
        }
      }
    }

    for (const path of scan.unknownEnds) {
      unevaluated.push({ rule: 'validity_window', note: `The agreement text states a date at "${path}" under a key the check does not know as the agreement's end, so the end of the agreement could not be confirmed.` });
    }

    notChecked.push(...scan.notChecked);

    if (answers.problems.length > 0) {
      const shown = answers.problems.slice(0, MAX_NAMED_PATHS).join('; ');
      const more = answers.problems.length - MAX_NAMED_PATHS;
      unreadable.push(`Form answers the check could not use: ${shown}${more > 0 ? ` (and ${more} more)` : ''}.`);
    }
    if (scan.truncated) unreadable.push(`${scan.truncated} The check cannot account for all of it.`);
    for (const c of scan.conflicts.slice(0, MAX_NAMED_PATHS)) unreadable.push(c);
    if (scan.conflicts.length > MAX_NAMED_PATHS) {
      unreadable.push(`The agreement text contradicts the form answers in ${scan.conflicts.length - MAX_NAMED_PATHS} more place(s).`);
    }
    if (scan.unexplained.length > 0) {
      unreadable.push(
        `The agreement text states ${scan.unexplained.length} figure(s) the form answers do not explain, and any of them could be a limit: ${namePaths(scan.unexplained)}.`,
      );
    }
  }
  if (notChecked.length > 0) terms.notChecked = notChecked;
  if (unreadable.length > 0) terms.unreadable = unreadable;
  if (unevaluated.length > 0) terms.unevaluated = unevaluated;
  return terms;
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

/** A leading negation on a prohibited entry ("No gambling", "do not transfer funds", "Prohibited: gambling"). */
const NEGATION = /^\s*(?:(?:do\s+not|don['’]?t|no|not|never|avoid|without)\b|prohibited\s*:)[\s:,-]*/i;

/**
 * A prohibited entry is read without its leading negation, so "No gambling",
 * "Do not gamble" and "gambling" name the same thing, and "Transfer funds"
 * and "transfer_funds" match alike.
 */
const prohibitedKey = (text: string) => normEntry(text.replace(NEGATION, ''));

const NOT_CHECKED_ORDER: Record<NotChecked['kind'], number> = {
  condition: 0,
  list_entry: 1,
  basis_wording: 2,
  free_text_answer: 3,
  agreement_text: 4,
  flag: 5,
};

/** Dedupe by kind and path, order the most useful kinds first, cap at MAX_NOT_CHECKED. */
function finishNotChecked(list: NotChecked[]): { shown: NotChecked[]; count: number } {
  const seen = new Set<string>();
  const unique = list.filter((n) => {
    const id = `${n.kind}:${n.path}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const ordered = unique
    .map((n, i) => ({ n, i }))
    .sort((a, b) => NOT_CHECKED_ORDER[a.n.kind] - NOT_CHECKED_ORDER[b.n.kind] || a.i - b.i)
    .map((x) => x.n);
  return { shown: ordered.slice(0, MAX_NOT_CHECKED), count: ordered.length };
}

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
  const notChecked: NotChecked[] = [...(terms.notChecked ?? [])];
  // Rules that have a limit in the agreement but lack the caller's input, or that the check cannot place.
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

  // validity window. Every end counts and the earliest wins: end_date, the
  // expiry_date column, and duration_months from created_at (the order the
  // database uses to fill expiry_date is compute_contract_expiry in the 20260611
  // migration). Nothing here can throw.
  const nowMs = now.getTime();
  const from = startMs(terms.startDate);
  const windowProblems: string[] = [];
  const ends: { ms: number; label: string }[] = [];
  const addEnd = (raw: string | null | undefined, what: string) => {
    if (!raw) return;
    const ms = endMs(raw);
    if (ms === undefined) windowProblems.push(`The ${what} "${clipText(raw, 30)}" could not be read as a date.`);
    else ends.push({ ms, label: raw });
  };
  if (terms.startDate && from === undefined) windowProblems.push(`The start date "${clipText(terms.startDate, 30)}" could not be read as a date.`);
  addEnd(terms.endDate, 'end date');
  addEnd(terms.expiryDate, 'expiry date');
  if (terms.durationMonths !== undefined) {
    const created = startMs(terms.createdAt);
    const t = created === undefined ? undefined : safeAddMonths(created, terms.durationMonths);
    if (created === undefined) {
      windowProblems.push('The agreement runs for a number of months but its creation date is unknown, so the end could not be worked out.');
    } else if (t === undefined) {
      windowProblems.push('The agreement runs for a number of months that cannot be turned into an end date.');
    } else {
      ends.push({ ms: t, label: isoDay(t) ?? 'the end of the term' });
    }
  }
  const soonest = ends.reduce<{ ms: number; label: string } | undefined>((b, e) => (b === undefined || e.ms < b.ms ? e : b), undefined);
  if (from === undefined && ends.length === 0 && windowProblems.length === 0) {
    checks.push({ rule: 'validity_window', result: 'not_evaluated', note: 'The agreement sets no readable start, end or expiry date.' });
  } else {
    const line: CheckLine = {
      rule: 'validity_window',
      result: 'pass',
      limit: `${terms.startDate ?? '-'} to ${soonest?.label ?? '-'}`,
      value: isoDay(nowMs) ?? 'unknown',
    };
    if (from !== undefined && nowMs < from) {
      fail(line, `The agreement has not started yet (starts ${terms.startDate}).`);
    } else if (soonest !== undefined && nowMs > soonest.ms) {
      fail(line, `The agreement ended on ${soonest.label}.`);
    } else if (windowProblems.length > 0) {
      checks.push({ ...line, result: 'not_evaluated', note: windowProblems.join(' ') });
      missing.push(...windowProblems);
    } else {
      checks.push(line);
    }
  }

  // currency. Limits are in USD (a USDC payment counts one to one) or in the
  // template's own currency. A payment in any other currency is never compared
  // with them: there is no exchange rate here, so those limits are not evaluated.
  const ccy = (c: string) => {
    const u = c.trim().toUpperCase();
    return u === 'USDC' ? 'USD' : u;
  };
  const priceLimit = terms.price?.amount;
  const limits = [terms.perTxLimit, terms.monthlyLimit, terms.totalBudget, terms.approvalAbove, terms.escalationAbove, terms.oversightAbove, priceLimit].filter(
    (l): l is Money => !!l,
  );
  const named = new Map<string, string>();
  if (terms.currency) named.set(ccy(terms.currency), terms.currency);
  for (const l of limits) named.set(ccy(l.currency), l.currency);
  const namedList = [...named.values()];
  const comparable = (l: Money) => !tx.currency || ccy(l.currency) === ccy(tx.currency);
  const skipped = 'This limit is in a different currency than the payment, so amounts are not compared.';
  const namedLimit = namedList.length === 1 ? namedList[0] : namedList;

  if (namedList.length === 0) {
    checks.push({ rule: 'currency', result: 'not_evaluated', note: 'The agreement names no currency.' });
  } else if (!tx.currency) {
    checks.push({
      rule: 'currency',
      result: 'not_evaluated',
      limit: namedLimit,
      note: 'No currency was given for the payment, so amounts are compared as they are.',
    });
    missing.push(`No currency was sent, but the agreement is in ${namedList.join(' / ')}.`);
  } else if (namedList.every((c) => ccy(c) === ccy(tx.currency as string))) {
    checks.push({ rule: 'currency', result: 'pass', limit: namedLimit, value: tx.currency });
  } else {
    checks.push({
      rule: 'currency',
      result: 'not_evaluated',
      limit: namedLimit,
      value: tx.currency,
      note: 'The payment is in a different currency than a limit of the agreement. Amounts are not converted, so that limit is not checked.',
    });
    missing.push(`The agreement is in ${namedList.join(' / ')}, the payment is in ${tx.currency}; amounts in different currencies are not compared.`);
  }

  // per-transaction limit. Wording beside it that names a period applies the
  // limit to the period's total as well.
  const perTx = terms.perTxLimit;
  if (!perTx) {
    checks.push({ rule: 'per_transaction_limit', result: 'not_evaluated', note: 'The agreement sets no per-transaction limit.' });
  } else if (!comparable(perTx)) {
    checks.push({ rule: 'per_transaction_limit', result: 'not_evaluated', limit: perTx.amount, value: tx.amount, note: skipped });
  } else if (tx.amount > perTx.amount + EPS) {
    fail(
      { rule: 'per_transaction_limit', result: 'fail', limit: perTx.amount, value: tx.amount },
      `The amount ${tx.amount} is above the per-transaction limit of ${perTx.amount}.`,
    );
  } else if (terms.perTxBasis === 'also_period') {
    if (tx.period_spent === undefined) {
      checks.push({
        rule: 'per_transaction_limit',
        result: 'not_evaluated',
        limit: perTx.amount,
        value: tx.amount,
        note: "The agreement's wording applies this limit to a period's total. Send period_spent to check it.",
      });
      missing.push("No period_spent was sent, so the per-transaction limit could not be checked on the period's total its wording names.");
    } else if (tx.period_spent + tx.amount > perTx.amount + EPS) {
      const total = tx.period_spent + tx.amount;
      fail(
        { rule: 'per_transaction_limit', result: 'fail', limit: perTx.amount, value: total },
        `Spend this period would reach ${total}, above the limit of ${perTx.amount} that the agreement's wording applies to the period.`,
      );
    } else {
      checks.push({ rule: 'per_transaction_limit', result: 'pass', limit: perTx.amount, value: tx.period_spent + tx.amount });
    }
  } else {
    checks.push({ rule: 'per_transaction_limit', result: 'pass', limit: perTx.amount, value: tx.amount });
  }

  // A limit on what has been spent so far: the monthly limit, a total budget,
  // a monthly fee. One payment above it can never fit, whatever was spent
  // before; without period_spent anything else is not known.
  const cumulative = (
    rule: 'monthly_limit' | 'total_budget' | 'price',
    limit: Money,
    words: { name: string; period: string; sent: string },
  ) => {
    if (!comparable(limit)) {
      checks.push({ rule, result: 'not_evaluated', limit: limit.amount, note: skipped });
    } else if (tx.period_spent === undefined && tx.amount > limit.amount + EPS) {
      fail(
        { rule, result: 'fail', limit: limit.amount, value: tx.amount },
        `This payment alone (${tx.amount}) is above the ${words.name} of ${limit.amount}.`,
      );
    } else if (tx.period_spent === undefined) {
      checks.push({
        rule,
        result: 'not_evaluated',
        limit: limit.amount,
        note: `Ambr does not track spend. Send period_spent (${words.sent}) to check the ${words.name}.`,
      });
      missing.push(`No period_spent was sent, so the ${words.name} could not be checked.`);
    } else {
      const total = tx.period_spent + tx.amount;
      if (total <= limit.amount + EPS) {
        checks.push({ rule, result: 'pass', limit: limit.amount, value: total });
      } else {
        fail(
          { rule, result: 'fail', limit: limit.amount, value: total },
          `Spend ${words.period} would reach ${total}, above the ${words.name} of ${limit.amount}.`,
        );
      }
    }
  };

  // monthly limit
  if (!terms.monthlyLimit) {
    checks.push({ rule: 'monthly_limit', result: 'not_evaluated', note: 'The agreement sets no monthly limit.' });
  } else {
    cumulative('monthly_limit', terms.monthlyLimit, { name: 'monthly limit', period: 'this month', sent: 'what was already spent this month' });
  }

  // total budget for the whole agreement. Paid once, on completion: the payment
  // must be exactly what is left of it (nothing spent counts as none).
  if (terms.totalBudget && terms.onCompletion) {
    const limit = terms.totalBudget;
    if (!comparable(limit)) {
      checks.push({ rule: 'total_budget', result: 'not_evaluated', limit: limit.amount, note: skipped });
    } else {
      const amountMicro = toMicro(tx.amount);
      const totalMicro = toMicro(limit.amount);
      const spentMicro = toMicro(tx.period_spent ?? 0);
      if (amountMicro === undefined || totalMicro === undefined || spentMicro === undefined) {
        checks.push({
          rule: 'total_budget',
          result: 'not_evaluated',
          limit: limit.amount,
          value: tx.amount,
          note: 'An amount has more than six decimals or is too large to compare exactly.',
        });
        missing.push('An amount has more than six decimals or is too large to compare exactly.');
      } else if (amountMicro === totalMicro - spentMicro) {
        checks.push({ rule: 'total_budget', result: 'pass', limit: limit.amount, value: tx.amount, note: 'A payment on completion equals what is left of the total.' });
      } else {
        const left = (totalMicro - spentMicro) / MICRO;
        fail(
          { rule: 'total_budget', result: 'fail', limit: left, value: tx.amount },
          `A payment on completion must be exactly what is left of the total (${left}); this payment is ${tx.amount}.`,
        );
      }
    }
  } else if (terms.totalBudget) {
    cumulative('total_budget', terms.totalBudget, {
      name: 'total budget',
      period: 'under the agreement',
      sent: 'what was already spent under this agreement',
    });
  }

  // price: a fixed monthly fee, or a price per call. A payment must be a whole
  // number of calls, compared in millionths of a unit.
  if (terms.price?.kind === 'monthly_fee') {
    cumulative('price', terms.price.amount, { name: 'monthly fee', period: 'this month', sent: 'what was already spent this month' });
  } else if (terms.price) {
    const per = terms.price.amount;
    if (!comparable(per)) {
      checks.push({ rule: 'price', result: 'not_evaluated', limit: per.amount, value: tx.amount, note: skipped });
    } else {
      const priceMicro = toMicro(per.amount);
      const amountMicro = toMicro(tx.amount);
      const unclear = (note: string) => {
        checks.push({ rule: 'price', result: 'not_evaluated', limit: per.amount, value: tx.amount, note });
        missing.push(note);
      };
      if (priceMicro === undefined || priceMicro <= 0 || amountMicro === undefined) {
        unclear('The price per call or the amount has more than six decimals or is too large to compare exactly.');
      } else if (amountMicro < priceMicro) {
        unclear('The payment is below the price of one call, so the check cannot say what it covers.');
      } else if (amountMicro % priceMicro !== 0) {
        unclear('The payment is not a whole number of calls at the price per call, so the check cannot say what it covers.');
      } else {
        const calls = amountMicro / priceMicro;
        checks.push({
          rule: 'price',
          result: 'pass',
          limit: per.amount,
          value: tx.amount,
          ...(calls > 1 ? { note: `The payment is ${calls} times the price per call.` } : {}),
        });
      }
    }
  }

  // What the agreement states that the check does not evaluate, and what it could not read.
  for (const u of terms.unevaluated ?? []) {
    checks.push({ rule: u.rule, result: 'not_evaluated', note: u.note });
    missing.push(u.note);
  }
  for (const note of terms.unreadable ?? []) {
    checks.push({ rule: 'agreement_terms', result: 'not_evaluated', note });
    missing.push(note);
  }

  // category: the caller's label against the agreement's list, matched exactly after normalising.
  // A prohibited entry is read without its leading negation and may name a category as well as an action.
  const prohibited = terms.prohibitedActions ?? [];
  const prohibitedKeys = prohibited.map(prohibitedKey);
  const handBack = (paths: string[] | undefined, fallback: string, why: string) => {
    for (const path of paths && paths.length > 0 ? paths : [fallback]) notChecked.push({ path, kind: 'list_entry', why });
  };
  if (tx.category && prohibitedKeys.includes(normEntry(tx.category))) {
    fail(
      { rule: 'category', result: 'fail', limit: prohibited, value: tx.category },
      `The category "${tx.category}" is prohibited by the agreement.`,
    );
  } else if (terms.categories.length === 0) {
    checks.push({ rule: 'category', result: 'not_evaluated', note: 'The agreement lists no approved categories.' });
  } else if (!tx.category) {
    checks.push({
      rule: 'category',
      result: 'not_evaluated',
      limit: terms.categories,
      note: 'The agreement lists approved categories but no category was given.',
    });
    missing.push('No category was sent, but the agreement lists approved categories.');
    if (terms.categoriesSource === 'text') handBack(terms.listPaths?.categories, 'categories', 'Approved categories in the agreement text. No category was given to compare.');
  } else if (terms.categories.some((c) => normEntry(c) === normEntry(tx.category as string))) {
    checks.push({ rule: 'category', result: 'pass', limit: terms.categories, value: tx.category });
  } else if (terms.categoriesSource === 'text') {
    // A list found only in the agreement text: words do not decide, so a miss is not a fail.
    checks.push({
      rule: 'category',
      result: 'not_evaluated',
      limit: terms.categories,
      value: tx.category,
      note: 'The category is not on the approved list in the agreement text. That list is not part of the form answers, so the check does not treat the miss as final.',
    });
    missing.push('The category is not on the approved list in the agreement text, which the check cannot treat as final.');
    handBack(terms.listPaths?.categories, 'categories', 'Approved categories in the agreement text. Your category did not match exactly: compare them yourself.');
  } else {
    fail(
      { rule: 'category', result: 'fail', limit: terms.categories, value: tx.category },
      `The category "${tx.category}" is not on the agreement's list (matched exactly).`,
    );
  }

  // action. The caller's action and the agreement's entries go through the same
  // normalising, so 'Purchase compute' matches 'purchase_compute'. A prohibited
  // entry is read without its leading negation ('No gambling' is 'gambling').
  // Only exact matches decide: the entries that did not match are handed back.
  const permitted = (terms.mayDo ?? []).map(normEntry);
  const restricted = terms.restrictedActions ?? [];
  const restrictedKeys = restricted.map(normEntry);
  const wanted = tx.action ? normEntry(tx.action) : undefined;
  if (permitted.length === 0 && prohibited.length === 0 && restricted.length === 0) {
    checks.push({ rule: 'action', result: 'not_evaluated', note: 'The agreement lists no enumerated actions.' });
  } else if (wanted === undefined) {
    checks.push({
      rule: 'action',
      result: 'not_evaluated',
      limit: terms.mayDo.length > 0 ? terms.mayDo : prohibited.length > 0 ? prohibited : restricted,
      note: 'The agreement restricts actions but no action was given.',
    });
    missing.push('No action was sent, but the agreement restricts actions.');
    if (prohibited.length > 0) handBack(terms.listPaths?.prohibited, 'prohibited_actions', 'Prohibited actions. No action was given to compare.');
    if (restricted.length > 0) handBack(terms.listPaths?.restricted, 'restricted_actions', 'Restricted actions. No action was given to compare.');
  } else if (prohibitedKeys.includes(wanted)) {
    fail(
      { rule: 'action', result: 'fail', limit: prohibited, value: tx.action },
      `The action "${tx.action}" is prohibited by the agreement.`,
    );
  } else {
    // Reserved for a lead agent: not banned, but not open to every agent. Whether
    // the caller is the lead agent is not something the check can know.
    const reserved = restrictedKeys.includes(wanted);
    if (permitted.length === 0) {
      checks.push({
        rule: 'action',
        result: 'not_evaluated',
        limit: prohibited.length > 0 ? prohibited : restricted,
        value: tx.action,
        note: 'The agreement lists no permitted actions, so this action is not confirmed as allowed. Only exact matches are evaluated.',
      });
    } else if (permitted.includes(wanted)) {
      checks.push({ rule: 'action', result: 'pass', limit: terms.mayDo, value: tx.action });
    } else if (reserved) {
      // Reported as reserved below, not as an action the agreement does not list.
    } else if (terms.mayDoSource === 'text') {
      // A list found only in the agreement text: words do not decide, so this is not a fail.
      checks.push({
        rule: 'action',
        result: 'not_evaluated',
        limit: terms.mayDo,
        value: tx.action,
        note: "The action is not on the permitted list in the agreement text. That list is not part of the form answers, so the check does not treat the miss as final.",
      });
      missing.push("The action is not on the permitted list in the agreement text, which the check cannot treat as final.");
      handBack(terms.listPaths?.permitted, 'permitted_actions', 'Permitted actions in the agreement text. Your action did not match exactly: compare them yourself.');
    } else {
      fail(
        { rule: 'action', result: 'fail', limit: terms.mayDo, value: tx.action },
        `The action "${tx.action}" is not on the agreement's list (matched exactly).`,
      );
    }
    if (reserved) {
      const note = `The action "${tx.action}" is reserved for the lead agent; confirm the caller is the lead agent.`;
      checks.push({ rule: 'action', result: 'not_evaluated', limit: restricted, value: tx.action, note });
      missing.push(note);
    }
    // Entries that did not match exactly stay with the caller.
    if (prohibited.length > 0) handBack(terms.listPaths?.prohibited, 'prohibited_actions', 'Prohibited actions. Your action did not match any exactly: compare them yourself.');
    if (restricted.length > 0 && !reserved) handBack(terms.listPaths?.restricted, 'restricted_actions', 'Restricted actions. Your action did not match any exactly: compare them yourself.');
  }

  // approval, escalation and oversight thresholds: never a fail, they only
  // change the verdict. The single payment is always compared; when the
  // agreement's wording beside the threshold could not be read as one basis (or
  // for the oversight threshold, which always is) the period's total is compared
  // too and the stricter reading wins. Without period_spent only the payment
  // alone is known: enough to say approval is needed, never enough to say it is not.
  const approvalReasons: string[] = [];
  const threshold = (
    rule: 'approval_threshold' | 'escalation_threshold',
    limit: Money,
    strict: boolean,
    who: 'approval' | 'escalation' | 'oversight',
  ) => {
    if (!comparable(limit)) {
      checks.push({ rule, result: 'not_evaluated', limit: limit.amount, note: skipped });
      return;
    }
    const action = who === 'escalation' ? 'the lead agent must approve this payment' : who === 'oversight' ? 'a human must review this payment' : 'a human must approve this payment';
    if (tx.amount > limit.amount + EPS) {
      checks.push({ rule, result: 'not_evaluated', limit: limit.amount, value: tx.amount, note: `Above the ${who} threshold: ${action}.` });
      approvalReasons.push(`The amount ${tx.amount} is above the ${who} threshold of ${limit.amount}.`);
    } else if (strict && tx.period_spent === undefined) {
      checks.push({
        rule,
        result: 'not_evaluated',
        limit: limit.amount,
        value: tx.amount,
        note: "The threshold is read on the period's total as well. Send period_spent to check it.",
      });
      missing.push(`No period_spent was sent, so the ${who} threshold could not be checked on the period's total.`);
    } else if (strict && (tx.period_spent as number) + tx.amount > limit.amount + EPS) {
      const total = (tx.period_spent as number) + tx.amount;
      checks.push({ rule, result: 'not_evaluated', limit: limit.amount, value: total, note: `Above the ${who} threshold over the period: ${action}.` });
      approvalReasons.push(`Spend this period would reach ${total}, above the ${who} threshold of ${limit.amount}.`);
    } else {
      checks.push({ rule, result: 'pass', limit: limit.amount, value: strict ? (tx.period_spent as number) + tx.amount : tx.amount });
    }
  };
  if (!terms.approvalAbove) {
    checks.push({ rule: 'approval_threshold', result: 'not_evaluated', note: 'The agreement sets no approval threshold.' });
  } else {
    threshold('approval_threshold', terms.approvalAbove, !!terms.approvalStrict, 'approval');
  }
  if (terms.escalationAbove) {
    threshold('escalation_threshold', terms.escalationAbove, !!terms.escalationStrict, 'escalation');
  }
  if (terms.oversightAbove) {
    threshold('approval_threshold', terms.oversightAbove, true, 'oversight');
  }

  const { shown, count } = finishNotChecked(notChecked);
  const withNotChecked = { not_checked: shown, not_checked_count: count };

  if (checks.some((c) => c.result === 'fail')) {
    return { verdict: 'out_of_scope', checks, reasons, ...withNotChecked };
  }

  // within_limits needs a spending limit or price that was actually evaluated and passed.
  const moneyEvaluated = checks.some(
    (c) => (c.rule === 'per_transaction_limit' || c.rule === 'monthly_limit' || c.rule === 'total_budget' || c.rule === 'price') && c.result === 'pass',
  );
  reasons.push(...approvalReasons);
  if (!moneyEvaluated) reasons.push('The agreement sets no spending limit or price this check could evaluate.');
  reasons.push(...missing);
  const incomplete = !moneyEvaluated || missing.length > 0;

  if (approvalReasons.length > 0) {
    return { verdict: 'needs_approval', checks, reasons, ...withNotChecked, ...(incomplete ? { also_incomplete: true } : {}) };
  }
  return { verdict: incomplete ? 'incomplete' : 'within_limits', checks, reasons, ...withNotChecked };
}
