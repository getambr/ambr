import { type ChatMessage } from './user-text';

/**
 * Optional spending caps (per transaction, monthly) as the chat collects them.
 *
 * The model answers "no limit" in free text ("none", "No per-transaction
 * limit", "unlimited"). A cap is a positive number of dollars; anything else
 * means the user set no cap, and must never be printed or stored as if it were
 * an amount. This module is the one place that decides which is which.
 */

/** Parameters that hold an optional spending cap. */
export const LIMIT_FIELDS = ['spending_limit_per_tx', 'spending_limit_monthly'] as const;

/** Which cap a value belongs to; a value that names the other period is not this cap. */
export type LimitKind = 'per_tx' | 'monthly';

const KIND_BY_FIELD: Record<(typeof LIMIT_FIELDS)[number], LimitKind> = {
  spending_limit_per_tx: 'per_tx',
  spending_limit_monthly: 'monthly',
};

const SCALE: Record<string, number> = { k: 1_000, thousand: 1_000, m: 1_000_000, million: 1_000_000 };

// A number as typed (digits with group and decimal marks, a space only as a
// group of three digits), then an optional scale word.
const NUMBER_TOKEN_RE = /\d(?:[\d.,]|[ \u00a0\u202f](?=\d{3}(?!\d)))*(?:\s*(million|thousand|k|m)(?![a-z]))?/gi;
const NO_LIMIT_RE =
  /\b(?:unlimited|uncapped|n\/a|none|nothing)\b|\b(?:no|without|any)\s+(?:[\w-]+\s+){0,2}(?:limits?|caps?|maxim(?:um|a)|max|ceilings?|restrictions?)\b/i;
const PERIOD_OTHER_RE =
  /\b(?:per|a|each|every)\s+(?:day|week|hour|year|annum|quarter)\b|\b(?:daily|weekly|hourly|yearly|annual(?:ly)?|quarterly)\b|\/\s*(?:day|wk|week|hr|hour|yr|year)\b/i;
const PERIOD_TX_RE =
  /\b(?:per[\s-]*|(?:each|every|a|one)\s+)(?:tx|txn|transaction|payment|purchase|trade|order|call|request)s?\b|\/\s*(?:tx|txn)\b|\bsingle\s+(?:tx|transaction|payment)\b/i;
const PERIOD_MONTH_RE = /\b(?:per|a|each|every)\s+month\b|\bmonthly\b|\/\s*(?:mo|month)\b/i;

// Where one statement of a value ends and the next begins. A comma splits only
// when a space follows, so "1,500" stays whole.
const CLAUSE_SPLIT_RE = /,\s+|;|\s+(?:and|but|with|while)\s+/i;

/**
 * The clauses of a value that can speak for this field. A value that carries
 * both caps ("$500 per tx, no monthly cap") is split, and a clause that names
 * only the other field's period is dropped, so a statement about the other cap
 * (including its "no limit") neither sets nor cancels this one. Without a field
 * the value is read whole.
 */
function ownClauses(text: string, kind: LimitKind | undefined): string {
  if (!kind) return text;
  const own = kind === 'per_tx' ? PERIOD_TX_RE : PERIOD_MONTH_RE;
  const other = kind === 'per_tx' ? PERIOD_MONTH_RE : PERIOD_TX_RE;
  return text
    .split(CLAUSE_SPLIT_RE)
    .filter((clause) => !(other.test(clause) && !own.test(clause)))
    .join(', ');
}

/** The number a token spells, or undefined when its marks cannot be read with certainty. */
function readNumber(raw: string): number | undefined {
  const t = raw.replace(/[.,]+$/, '');
  // Whole number: 1500.
  if (/^\d+$/.test(t)) return Number(t);
  // One mark and one or two digits after it is a decimal: 12.5, 12,5.
  if (/^\d+[.,]\d{1,2}$/.test(t)) return Number(t.replace(',', '.'));
  // Digits grouped in threes by one mark: 1,500, 1 500, 1.500.000.
  const grouped = /^(\d{1,3})([,. \u00a0\u202f])(\d{3}(?:\2\d{3})*)$/.exec(t);
  if (grouped) {
    const [, head, mark, rest] = grouped;
    // A lone 1.500 is a thousands group in one locale and a decimal in another.
    if (mark === '.' && !rest.includes(mark)) return undefined;
    return Number(`${head}${rest.split(mark).join('')}`);
  }
  // Grouped, then a different mark and one or two decimals: 1.500,00, 1,500.50.
  const decimal = /^(\d{1,3}(?:[,. \u00a0\u202f]\d{3})+)([.,])(\d{1,2})$/.exec(t);
  if (decimal) {
    const marks = new Set(decimal[1].replace(/\d/g, ''));
    const [groupMark] = marks;
    if (marks.size === 1 && groupMark !== decimal[2]) {
      return Number(`${decimal[1].split(groupMark).join('')}.${decimal[3]}`);
    }
  }
  return undefined;
}

/**
 * The cap as a finite positive number of dollars, or undefined when the value is
 * not a cap: empty, zero (a zero cap would forbid all spend and is never the
 * intent), text that names no amount ("none", "no limit", "unlimited"), or text
 * whose amount cannot be read with certainty. An ambiguous value is treated as
 * absent rather than guessed, because a wrong cap is worse than an unset one.
 *
 * Accepted text: a plain amount ("500", "$500", "500 USD", "USD 500"); group
 * marks ("1,500", "1 500", "1.500.000"); decimals ("12.5", "1.500,00",
 * "1,500.50"); scale words ("5k", "$1.5k", "5m", "5 million", "2 thousand"); and
 * an amount whose period fits the field ("500 per transaction" for the
 * per-transaction cap, "5,000 monthly" for the monthly one).
 *
 * Rejected as ambiguous: a lone "1.500" (thousands or decimal), several amounts
 * in one value, a percentage, a period the field does not hold ("2 per day",
 * "5,000 per week"), and an amount beside a statement of no limit ("no limit,
 * max 2 per day"). Without `kind` only the period and no-limit checks apply.
 *
 * With `kind`, a value that carries both caps is read for this field only: "$500
 * per tx, no monthly cap" is 500 for the per-transaction cap and no cap for the
 * monthly one.
 */
export function normalizeOptionalLimit(value: unknown, kind?: LimitKind): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const text = ownClauses(value.replace(/\s+/g, ' ').trim(), kind);
  if (NO_LIMIT_RE.test(text) || PERIOD_OTHER_RE.test(text)) return undefined;

  const perTx = PERIOD_TX_RE.test(text);
  const perMonth = PERIOD_MONTH_RE.test(text);
  if (perTx && perMonth) return undefined;
  if ((kind === 'per_tx' && perMonth) || (kind === 'monthly' && perTx)) return undefined;

  const tokens = [...text.matchAll(NUMBER_TOKEN_RE)];
  if (tokens.length !== 1) return undefined;
  const token = tokens[0];
  if (text.charAt((token.index ?? 0) + token[0].length) === '%') return undefined;

  const scaleWord = token[1];
  const digits = scaleWord ? token[0].slice(0, token[0].length - scaleWord.length).trim() : token[0];
  const base = readNumber(digits);
  if (base === undefined) return undefined;
  const n = base * (scaleWord ? SCALE[scaleWord.toLowerCase()] : 1);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** True when a value was given but is not a cap: the user's way of saying "no limit". */
export function isNoLimitValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  return normalizeOptionalLimit(value) === undefined;
}

/**
 * A copy of the parameters in which each cap is a number, and a cap that is not
 * one is removed. Parameters without caps come back unchanged.
 */
export function normalizeLimitParams<T extends Record<string, unknown>>(params: T): T {
  let out: Record<string, unknown> | null = null;
  for (const field of LIMIT_FIELDS) {
    if (!(field in params)) continue;
    const n = normalizeOptionalLimit(params[field], KIND_BY_FIELD[field]);
    if (n === params[field]) continue;
    out ??= { ...params };
    if (n === undefined) delete out[field];
    else out[field] = n;
  }
  return (out ?? params) as T;
}

/** "$1,500" for a cap, '' when the value is not one. */
export function formatLimit(value: unknown): string {
  const n = normalizeOptionalLimit(value);
  return n === undefined ? '' : `$${n.toLocaleString('en-US')}`;
}

/**
 * The clause a summary appends for the caps that are set: '' when neither is,
 * one clause per cap otherwise. Never prints a non-amount.
 */
export function capsPhrase(perTx: unknown, monthly: unknown): string {
  const tx = formatLimit(perTx);
  const mo = formatLimit(monthly);
  if (tx && mo) return `capped at ${tx} per transaction and ${mo} per month`;
  if (tx) return `capped at ${tx} per transaction`;
  if (mo) return `capped at ${mo} per month`;
  return '';
}

// The user refusing a cap in their own words: "no caps", "no spending limit",
// "skip the limits", "I don't need a cap", "uncapped".
const DECLINE_RE =
  /\b(?:no|without|skip|drop|forget)\s+(?:the\s+|any\s+|a\s+)?(?:[\w-]+\s+){0,2}(?:caps?|limits?|ceilings?)\b|\b(?:don['’]?t|do not)\s+(?:want|need)\s+(?:a\s+|any\s+)?(?:[\w-]+\s+){0,2}(?:caps?|limits?)\b|\buncapped\b|\bunlimited\s+(?:spend\w*|budget|caps?|limits?)\b/i;
// A bare refusal, meaningful only as the answer to a question about caps.
const BARE_NO_RE = /^\s*(?:no|nope|nah|none|skip|pass|not now|no thanks|no,? thank you|n\/a)\W*$/i;
const CAPS_TOPIC_RE = /\b(?:caps?|limits?)\b/i;

/**
 * True when the user has already declined spending caps: said so in their own
 * words, or answered a question about caps with a bare no. Model-written text
 * never counts, so a decline is never invented on the user's behalf.
 */
export function capsDeclined(messages: readonly ChatMessage[]): boolean {
  return messages.some((m, i) => {
    if (m.role !== 'user' || m.fromModel) return false;
    if (DECLINE_RE.test(m.content)) return true;
    const before = messages[i - 1];
    return before?.role === 'assistant' && CAPS_TOPIC_RE.test(before.content) && BARE_NO_RE.test(m.content);
  });
}

/** What the assistant's offer of caps contains, so a later turn can tell it was made. */
export const CAPS_OFFER_MARKER = 'cap the agent’s spend';

export const CAPS_OFFER_MESSAGE = `All the required details are in. Optional — want to ${CAPS_OFFER_MARKER} before deploying? Give a per-transaction and/or monthly limit (e.g. "$500 per tx, $5,000 monthly"), or say "no caps" to keep the POA general within its scope.`;

/**
 * Whether the chat should offer optional caps now: a ready power of attorney
 * with neither cap set, where the offer has not been made and the user has not
 * already declined caps. The offer never blocks Deploy.
 */
export function shouldOfferCaps(input: {
  template: string | null;
  ready: boolean;
  highValueNeeded: boolean;
  params: Record<string, unknown>;
  messages: readonly ChatMessage[];
}): boolean {
  const { template, ready, highValueNeeded, params, messages } = input;
  if (template !== 'p2-power-of-attorney' || !ready || highValueNeeded) return false;
  if (normalizeOptionalLimit(params.spending_limit_per_tx, 'per_tx') !== undefined) return false;
  if (normalizeOptionalLimit(params.spending_limit_monthly, 'monthly') !== undefined) return false;
  const offered = messages.some(
    (m) => m.role === 'assistant' && typeof m.content === 'string' && m.content.includes(CAPS_OFFER_MARKER),
  );
  return !offered && !capsDeclined(messages);
}
