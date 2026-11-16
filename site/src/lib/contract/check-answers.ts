import type { Money } from '@/lib/contract-capabilities';
import {
  ANSWER_ALIASES,
  COMMON_ANSWERS,
  LIST_ALIASES,
  ROLE_ALIASES,
  TEMPLATE_RULES,
  USD,
  type AnswerKind,
  type ListRole,
  type MoneyRole,
} from './check-template-map';
import { hasLimitWording, hasNumberWord, isEmptyTerm, listEntryFigure, nameKey, normEntry, normKey, numberWordFigure, textFigure } from './check-text';

/**
 * Reads the stored form answers (`contracts.parameters`) of a contract whose
 * template the check knows. Nothing is guessed: each key is read as the kind of
 * answer the template map says it is, and anything else is reported.
 *
 * Numbers: an amount is a finite number, or a string of plain decimal digits
 * ("500", "12.5"); the contract route does not check types, so an answer typed
 * as text by a client is still read. Anything else (exponent form, thousands
 * separators, a currency symbol or code beside the number, NaN) is not an amount and is reported, never parsed.
 * A cap, price or fee of zero or less is a placeholder, not a limit: reported.
 * An approval or escalation threshold of zero is real (every payment above
 * nothing needs approval); a negative one is reported.
 *
 * Free text (scope, service description, task, deliverables) is never read for
 * meaning: it is handed back to the caller (`words`). A figure inside it is a
 * limit nothing explains and is reported.
 */

export interface AnswerMoney {
  key: string;
  role: MoneyRole;
  money: Money;
}

/** What `machine_readable` may repeat, handed to the scan. */
export interface AccountedAnswers {
  /** Valid numeric answers and the key names that count as the same figure. */
  numbers: { keys: string[]; value: number; /** Set for an amount that is a rule (a cap, a price, a threshold). */ role?: MoneyRole }[];
  /** Valid list answers: the role, the key names that count as the same list, and its entries. */
  lists: { role: ListRole; keys: string[]; entries: Set<string> }[];
  /** Text answers that may be repeated verbatim (names, ids, enums, dates, text). */
  echoes: Set<string>;
  /** The party and other name answers (as `nameKey` writes them): a list entry that is exactly one of them is a name, even with a number word in it. */
  names: Set<string>;
  /** Yes/no answers by normalised key. */
  flags: Record<string, boolean>;
  /** Enum answers that decide how a limit reads (pricing and payment model), by normalised key. */
  enums: Record<string, string>;
  /** The currency the answers state limits in: the template's own, or USD for the USD templates. */
  currency: string;
}

export interface Answers {
  amounts: Partial<Record<MoneyRole, AnswerMoney>>;
  categories: string[];
  permittedActions: string[];
  restrictedActions: string[];
  counterparties: string[];
  milestones: number;
  /** The payment model (c3), or its schema default when none is stored. */
  paymentModel?: string;
  /** Rules that have an amount but cannot be evaluated, and why. */
  gated: { role: MoneyRole; key: string; reason: string }[];
  /** Keys of the free-text answers that hold something. The check does not read what they say. */
  words: string[];
  /** The validity window the answers state. */
  window: { start?: string; end?: string; months?: number };
  /** Answers that could not be used: invalid, missing but required, or unknown. Any one keeps the verdict from within_limits. */
  problems: string[];
  accounted: AccountedAnswers;
}

const absent = (v: unknown) => v === undefined || v === null || v === '';
const PLAIN_DECIMAL = /^\d{1,15}(\.\d{1,8})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}([T ][0-9:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;
const CURRENCY = /^[A-Za-z]{3,5}$/;

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** A finite number, or plain decimal text; undefined for anything else. */
function readNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && PLAIN_DECIMAL.test(v.trim())) return Number(v.trim());
  return undefined;
}

const ISO_CURRENCY_NORM = (c: string) => c.trim().toUpperCase();

const FIGURE_WHY = 'text with a figure in it that the check cannot place';

function readKind(kind: AnswerKind, v: unknown, key: string, names?: ReadonlySet<string>): { ok: true; number?: number; text?: string[] } | { ok: false; why: string } {
  const ctx = { key: normKey(key) };
  switch (kind) {
    // Names, ids and choices from a short list are free strings in practice: a digit in one that is not an
    // identifier, address or registration number is a figure the check cannot place. So is a number spelled out in
    // an identity beside limit wording ("Acme Corp (purchases capped at thirty)": "Three Rivers Ltd" is a name), and
    // any number spelled out in a choice.
    case 'identity':
      if (typeof v !== 'string') return { ok: false, why: 'not text' };
      return textFigure(v, ctx) || ((hasNumberWord(v) || numberWordFigure(v)) && hasLimitWording(v)) ? { ok: false, why: FIGURE_WHY } : { ok: true, text: [v] };
    case 'enum':
      if (typeof v !== 'string') return { ok: false, why: 'not text' };
      return textFigure(v, ctx) || numberWordFigure(v) ? { ok: false, why: FIGURE_WHY } : { ok: true, text: [v] };
    case 'currency':
      return typeof v === 'string' && CURRENCY.test(v.trim()) ? { ok: true, text: [ISO_CURRENCY_NORM(v)] } : { ok: false, why: 'not a currency code' };
    case 'date':
      return typeof v === 'string' && DATE.test(v.trim()) && !Number.isNaN(Date.parse(v.trim()))
        ? { ok: true, text: [v] }
        : { ok: false, why: 'not a date' };
    case 'flag':
      return typeof v === 'boolean' ? { ok: true } : { ok: false, why: 'not yes or no' };
    case 'count': {
      const n = readNumber(v);
      return n !== undefined && n >= 0 ? { ok: true, number: n } : { ok: false, why: 'not a number of zero or more' };
    }
    case 'text':
      if (typeof v !== 'string') return { ok: false, why: 'not text' };
      return textFigure(v, ctx) || numberWordFigure(v) ? { ok: false, why: FIGURE_WHY } : { ok: true, text: [v] };
    case 'text_list':
      if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) return { ok: false, why: 'not a list of text' };
      return v.some((x) => listEntryFigure(x as string, names)) ? { ok: false, why: FIGURE_WHY } : { ok: true, text: v as string[] };
  }
}

const dedupe = (items: string[]) => [...new Set(items)];

export function readAnswers(slug: string, parameters: Record<string, unknown>): Answers {
  const rules = TEMPLATE_RULES[slug];
  const answers: Answers = {
    amounts: {},
    categories: [],
    permittedActions: [],
    restrictedActions: [],
    counterparties: [],
    milestones: 0,
    gated: [],
    words: [],
    window: {},
    problems: [],
    accounted: { numbers: [], lists: [], echoes: new Set(), names: new Set(), flags: {}, enums: {}, currency: USD },
  };
  const { problems, accounted } = answers;

  // The template's currency, for amounts stated in it: the answer, or the
  // schema's default when none is stored (nothing server-side fills it in).
  let templateCurrency: string | undefined;
  if (rules.currencyKey) {
    const raw = parameters[rules.currencyKey];
    if (absent(raw)) {
      templateCurrency = rules.currencyDefault;
    } else {
      const read = readKind('currency', raw, rules.currencyKey);
      if (read.ok) templateCurrency = read.text?.[0];
    }
    if (templateCurrency) accounted.currency = templateCurrency;
  }

  for (const [key, spec] of Object.entries(rules.money)) {
    const raw = parameters[key];
    if (absent(raw)) {
      if (spec.required) problems.push(`${key} (required, but not stored)`);
      continue;
    }
    const amount = readNumber(raw);
    if (amount === undefined) {
      problems.push(`${key} (not a plain number)`);
      continue;
    }
    const threshold = spec.role === 'approval' || spec.role === 'escalation';
    if (amount < 0) {
      problems.push(`${key} (negative)`);
      continue;
    }
    if (amount === 0 && !threshold) {
      problems.push(`${key} (zero is not a usable limit)`);
      continue;
    }
    let currency = USD;
    if (spec.inTemplateCurrency) {
      if (!templateCurrency) {
        problems.push(`${key} (the template's currency is missing or unreadable)`);
        continue;
      }
      currency = templateCurrency;
    }
    accounted.numbers.push({ keys: dedupe([normKey(key), ...ROLE_ALIASES[spec.role].map(normKey)]), value: amount, role: spec.role });
    if (spec.evaluableWhen) {
      const { key: gateKey, values, reason } = spec.evaluableWhen;
      const gate = absent(parameters[gateKey]) ? undefined : parameters[gateKey];
      if (!values.includes(gate)) {
        answers.gated.push({ role: spec.role, key, reason });
        continue;
      }
    }
    answers.amounts[spec.role] = { key, role: spec.role, money: { amount, currency } };
  }

  const listFor = (role: ListRole): string[] => {
    if (role === 'categories') return answers.categories;
    if (role === 'permitted_actions') return answers.permittedActions;
    if (role === 'restricted_actions') return answers.restrictedActions;
    return answers.counterparties;
  };
  const known = { ...rules.other, ...COMMON_ANSWERS } as Record<string, AnswerKind>;
  // A name answer ("principal_name") that reads as no limit: a list entry that repeats it is a name.
  for (const [key, kind] of Object.entries(known)) {
    const raw = parameters[key];
    if (kind === 'identity' && /(^|_)name$/.test(normKey(key)) && typeof raw === 'string' && !hasLimitWording(raw)) accounted.names.add(nameKey(raw));
  }
  for (const [key, spec] of Object.entries(rules.lists)) {
    const raw = parameters[key];
    if (absent(raw)) {
      if (spec.required) problems.push(`${key} (required, but not stored)`);
      continue;
    }
    if (!Array.isArray(raw)) {
      problems.push(`${key} (not a list)`);
      continue;
    }
    if (spec.role === 'milestones') {
      answers.milestones = raw.length;
      // A milestone's amount is explained only when it comes from here.
      for (const item of raw) {
        const amount = isRecord(item) ? readNumber(item.amount) : undefined;
        if (amount !== undefined) accounted.numbers.push({ keys: [normKey(key)], value: amount });
      }
      continue;
    }
    if (raw.some((x) => typeof x !== 'string' || x.trim() === '')) {
      problems.push(`${key} (not a list of text)`);
      continue;
    }
    // An entry that holds a figure ("max 30 USD per order") is a limit nobody told the check about, whatever the list.
    // One that only has digits in a product or category name ("Microsoft 365 licences") is a name.
    if (raw.some((x) => listEntryFigure(x as string, accounted.names))) {
      problems.push(`${key} (${FIGURE_WHY})`);
      continue;
    }
    const entries = dedupe((raw as string[]).map((x) => x.trim()));
    const list = listFor(spec.role);
    for (const e of entries) list.push(e);
    accounted.lists.push({
      role: spec.role,
      keys: dedupe([normKey(key), ...LIST_ALIASES[spec.role]]),
      entries: new Set(entries.map(normEntry)),
    });
  }

  for (const [key, kind] of Object.entries(known)) {
    const raw = parameters[key];
    if (absent(raw)) continue;
    const read = readKind(kind, raw, key, accounted.names);
    if (!read.ok) {
      problems.push(`${key} (${read.why})`);
      continue;
    }
    if (read.number !== undefined) {
      accounted.numbers.push({ keys: dedupe([normKey(key), ...(ANSWER_ALIASES[key] ?? [])]), value: read.number });
      if (key === rules.window?.months) answers.window.months = read.number;
    }
    if (kind === 'flag') accounted.flags[normKey(key)] = raw as boolean;
    if (kind === 'date') {
      if (key === rules.window?.start) answers.window.start = (raw as string).trim();
      if (key === rules.window?.end) answers.window.end = (raw as string).trim();
    }
    if (kind === 'text' || kind === 'text_list') {
      if ((read.text ?? []).some((t) => !isEmptyTerm(t))) answers.words.push(key);
    }
    for (const t of read.text ?? []) accounted.echoes.add(t.trim().toLowerCase());
  }

  // How a limit reads depends on these two answers, so the text may not name another.
  if (rules.paymentModel) {
    const raw = parameters[rules.paymentModel.key];
    answers.paymentModel = typeof raw === 'string' && raw.trim() ? raw.trim().toLowerCase() : rules.paymentModel.default;
    accounted.enums[normKey(rules.paymentModel.key)] = normEntry(answers.paymentModel);
  }
  if (typeof parameters.pricing_model === 'string' && has(rules.other, 'pricing_model')) {
    accounted.enums.pricing_model = normEntry(parameters.pricing_model);
  }

  // Any other key could be a limit nobody told the check about.
  for (const [key, value] of Object.entries(parameters)) {
    if (absent(value) || has(rules.money, key) || has(rules.lists, key) || has(known, key)) continue;
    problems.push(`${key} (not a form answer this check knows for the template)`);
  }
  return answers;
}
