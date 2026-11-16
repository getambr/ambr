import { actionList, CONDITION_WORDS } from '@/lib/contract-capabilities';
import type { AccountedAnswers } from './check-answers';
import { LIST_ALIASES, ROLE_ALIASES, type ListRole, type MoneyRole } from './check-template-map';
import {
  currencyOf,
  DATE_KEYS,
  hasDigit,
  hasLimitWording,
  hasMoneySignal,
  isNoticeValue,
  hasNumberWord,
  isDateValue,
  isEmptyTerm,
  isIdKey,
  keyFigure,
  LIMIT_WORDS,
  listEntryFigure,
  numberWordFigure,
  METRIC_KEYS,
  MONEY_SAFE_METRIC_KEYS,
  METRIC_TEXT_KEYS,
  MONEYISH,
  moneyInWords,
  nameKey,
  normEntry,
  normKey,
  parseFigure,
  parseMonths,
  RATE_KEYS,
  sameCurrency,
  spellsAmount,
  textFigure,
  type NotChecked,
} from './check-text';

/**
 * Scan over `machine_readable`.
 *
 * `machine_readable` is free-form JSON written by a language model. The check
 * does not decide limits from it (the form answers do) and does not read the
 * words in it. What it does with it, leaf by leaf, in any container, at any
 * depth, with every key normalised first (see normKey):
 *
 *   FIGURES fail closed. Any digit is a figure: in a number, a string, an object
 *   key, an enum or identity answer or a free-text answer (see textFigure). A
 *   figure is explained only by a form answer of the same rule, at its own key
 *   or a listed alias, or when the whole value has a shape that cannot be an
 *   amount (a date, a hash, an identifier, a version under a version key, a
 *   legal citation inside a recital, a duration or uptime or rate with no
 *   currency). Any other figure is reported and the verdict cannot be
 *   within_limits.
 *
 *   CONTRADICTIONS fail closed. A currency, date, list, flag or payment model
 *   that differs from the form answers is reported, never reconciled.
 *
 *   WORDS never decide a verdict. A string under a restriction-like key, a
 *   description holding a condition word, a true approval-like flag, and any
 *   basis wording beside a limit are listed in `notChecked` by path, for the
 *   caller to read. "None", "N/A" and empty values are not terms.
 *
 * Hitting the depth or size cap is reported the same way, never read as
 * "nothing found".
 */

/** Past either cap the walk stops and the agreement is reported as too large to account for. */
export const MAX_DEPTH = 24;
export const MAX_NODES = 5000;
/** Paths named in a reason; the rest are counted. */
export const MAX_NAMED_PATHS = 20;

/**
 * Keys (normalised, as whole words of the snake_case key) that name a
 * restriction: geographic limits, who the agent may or may not pay, actions it
 * may or may not take, approval and review conditions, and the scope.
 */
const WORD_KEY =
  /(^|_)(prohibit\w*|forbid\w*|restrict\w*|exclu\w*|block\w*|deny|denied|denylist|disallow\w*|ban|banned|never|boundar\w*|limitation\w*|geograph\w*|region\w*|countr\w*|jurisdiction\w*|territor\w*|location\w*|counterpart\w*|vendor\w*|supplier\w*|merchant\w*|payee\w*|recipient\w*|whitelist\w*|allowlist\w*|blacklist\w*|permitted|allowed|authori[sz]ed|unauthori[sz]\w*|approv\w*|enumerated|exception\w*|condition\w*|constraint\w*|categor\w*|require\w*|review\w*|consent|sign_off|signoff|escalat\w*|mandatory|purpose|tasks?|deliverable\w*|acceptance|special|out_of_scope)(_|$)/;
const WORD_KEYS_EXACT = new Set(['scope', 'summary', 'service_description', 'task_description', 'additional_terms', 'terms_and_conditions']);
const isWordKey = (k: string) => WORD_KEYS_EXACT.has(k) || WORD_KEY.test(k);

/** A true flag under one of these keys may require a human's approval or review. */
const APPROVAL_FLAG_KEY = /(^|_)(approv\w*|review\w*|consent|sign_?off|require\w*|mandatory|escalat\w*|human|manual|confirm\w*)(_|$)/;

/** Description-like keys: their text may hold a condition on a payment. */
const CONDITION_BEARING_KEY = new Set([
  'description', 'note', 'notes', 'comment', 'comments', 'reason', 'rationale', 'remark', 'remarks', 'details', 'detail', 'text',
]);

/** Exact paths written by the generator itself. */
const EXPLAINED_PATHS = new Set(['schema_version', 'contract_id', 'template', 'version', 'compliance.oversight_framework']);

/** The keys under which the check reads a recital: the generator's formation recital and the plain names. */
const RECITAL_KEYS = new Set([
  'electronic_formation_recital', 'electronic_agent_formation_recital', 'formation_recital', 'electronic_formation', 'recital', 'recitals',
  // The citation keys the prompts ask for ("legal_basis": "Art. 2305"): citation-only too.
  'legal_basis', 'legal_bases', 'legal_reference', 'legal_references', 'legal_authority', 'statutory_basis', 'statutory_reference', 'legal_citation', 'legal_citations',
]);
const VERSION_KEYS = new Set(['version', 'schema_version', 'contract_version', 'template_version']);
/** Keys that name a payment rule, beyond the mapped aliases: not even a rate shape explains a number under them. */
const RULE_KEY = /(^|_)(approv\w*|escalat\w*|threshold\w*|oversight|caps?|ceiling|budget|allowance|spend\w*|payments?|fees?|prices?|costs?)(_|$)/;
/** Names of a limit that do not say which one: the period beside it does. */
const GENERIC_LIMIT = new Set(['spending_limit', 'spend_limit', 'spending_cap', 'limit', 'limits', 'cap', 'max', 'maximum']);
const DURATION_KEYS = new Set(['duration', 'duration_months', 'term', 'term_months']);
/** A key that names the currency a figure beside it is in, whatever its value is (a code, an object, a list). */
const CURRENCY_LIKE_KEY = /^(?:currency|currency_code|ccy|denomination|asset|token|coin|[a-z0-9_]*_currency|currency_[a-z0-9_]*)$/;

/** The words a period or basis may use for each rule ("per month" for a monthly cap). */
const PERIOD_OF_ROLE: Record<MoneyRole, RegExp> = {
  per_transaction: /^(?:transaction|tx|payment|invoice|purchase|order|call|request|single (?:transaction|payment))$/,
  monthly: /^(?:calendar )?(?:month|mo|monthly)$/,
  monthly_fee: /^(?:calendar )?(?:month|mo|monthly)$/,
  total: /^(?:agreement|contract|total|term|task|project|engagement|job|deliverable|whole agreement)$/,
  price_per_call: /^(?:call|request|api call|query)$/,
  approval: /^(?:transaction|tx|payment|purchase|single (?:transaction|payment))$/,
  escalation: /^(?:transaction|tx|payment|purchase|single (?:transaction|payment))$/,
};
const periodFits = (period: string, role: MoneyRole) => PERIOD_OF_ROLE[role].test(period);

const START_KEYS = new Set(['start_date', 'start', 'starts', 'effective_date', 'effective', 'commencement_date', 'valid_from', 'begins', 'begin_date']);
const END_KEYS = new Set(['end_date', 'end', 'ends', 'expiry_date', 'expiry', 'expires_at', 'expiration_date', 'valid_until', 'valid_to', 'termination_date']);
const DATE_LIKE = /^\d{4}-\d{2}-\d{2}([T ][0-9:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;
/** Where the agreement's own window is stated: at the top level, or directly under one of these. */
const TERM_CONTAINERS = new Set(['duration', 'term', 'validity', 'validity_period', 'agreement_term', 'contract_term', 'effective_period', 'dates', 'agreement_dates', 'contract_dates']);
/** A key that reads like the agreement's end but is not one the check knows. */
const UNKNOWN_END_KEY = /(^|_)(valid_(?:through|thru|till)|expir\w*|expires\w*|(?:contract|agreement|term)_end|end_of_term|ends?_on|until)(_|$)/;
const END_WRAPPER = new Set(['date', 'value', 'on', 'at', 'timestamp', 'datetime', 'iso']);
const TIME_OF_DAY = /^\d{1,2}:\d{2}(:\d{2})?(\s?(?:[A-Z]{2,5}|[+-]\d{2}:?\d{2}|Z))?$/;

/** Basis or period wording beside a limit. */
const BASIS_KEY = /(^|_)(basis|period|applies_to|apply|applies|frequency|per|scope|window|cadence|interval|aggregat\w*|cumulative|required_above|calculated|cycle)(_|$)/;
const BASIS_VOCABULARY = /(month|week|day|daily|annual|year|quarter|aggregate|cumulative|total|period|rolling|cycle|fleet|transaction|payment|single|each|\bper\b|invoice|call|request|hour)/i;
const PER_PAYMENT = /^(?:per[\s_-]*(?:transaction|payment|tx|call|invoice|request|purchase)|single(?:[\s_-]*(?:transaction|payment))?|each[\s_-]*(?:transaction|payment)|transaction|payment|individual\w*)$/i;
// Period words by what they name. The caller's period_spent covers one period (the month, or the
// whole agreement for a total budget); wording that names any other period is not read.
const MONTH_WORD = /\b(?:month\w*|mo)\b/i;
const OPEN_PERIOD_WORD = /\b(?:aggregate\w*|cumulative|period\w*|rolling|cycle)\b/i;
const AGREEMENT_PERIOD_WORD = /\b(?:total|agreement|contract|lifetime|overall|whole|entire|term|project|engagement)\b/i;
const OTHER_PERIOD_WORD = /\b(?:week\w*|fortnight\w*|day|days|daily|hour\w*|annual\w*|year\w*|quarter\w*|semester\w*|fleet|all)\b/i;
const THRESHOLD_CONTEXT = /(^|_)(escalat\w*|approv\w*|threshold\w*|oversight)(_|$)/;
const THRESHOLD_ROLES: MoneyRole[] = ['approval', 'escalation'];

/** A wording key that names a rule ("approval_basis", "per_transaction_period") belongs to that rule alone. */
const ROLE_HINT: [RegExp, MoneyRole[]][] = [
  [/approv|oversight/, ['approval']],
  [/escalat/, ['escalation']],
  [/per_(?:transaction|tx|payment|agent|call)|single/, ['per_transaction']],
  [/month/, ['monthly', 'monthly_fee']],
  [/total|budget/, ['total']],
  [/price|fee/, ['price_per_call', 'monthly_fee']],
];

/** Keys for how often a price is billed: they say nothing about the unit price, which is per call whatever the cycle. */
const BILLING_CADENCE_KEY = /^(?:billing_(?:cycle|period|frequency|cadence|interval)|invoicing_\w+)$/;
/** Words an enforcement attribute of a limit takes ("type": "hard"): a name for how it is applied, not a basis or period. */
const ATTRIBUTE_KEYS = new Set(['type', 'kind', 'enforcement', 'mode']);
const ENFORCEMENT_WORDS = new Set(['hard', 'soft', 'strict', 'block', 'reject', 'require_approval']);

function narrow(roles: MoneyRole[], key: string): MoneyRole[] {
  if (BILLING_CADENCE_KEY.test(key)) return roles.filter((r) => r !== 'price_per_call');
  for (const [re, hinted] of ROLE_HINT) {
    if (!re.test(key)) continue;
    const named = roles.filter((r) => hinted.includes(r));
    if (named.length > 0) return named;
  }
  return roles;
}

const ROLE_OF_KEY = new Map<string, MoneyRole>();
for (const [role, names] of Object.entries(ROLE_ALIASES) as [MoneyRole, string[]][]) {
  for (const name of names) ROLE_OF_KEY.set(normKey(name), role);
}
const LIST_ROLE_OF_KEY = new Map<string, ListRole>();
for (const [role, names] of Object.entries(LIST_ALIASES) as [ListRole, string[]][]) {
  for (const name of names) LIST_ROLE_OF_KEY.set(normKey(name), role);
}

/**
 * Money context. It is inherited by every value below a key that sets it (through objects and lists), and
 * nothing but the amount's own form answer (or a currency code under a currency key) is explained there. A
 * key sets it when it is a mapped limit or a generic limit name, a rule or money-like name, an approval or
 * escalation threshold, or an amount, value or price wrapper. An object also sets it for everything below
 * it when any of its entries names a currency, whatever that entry holds. The exact metric and rate keys
 * are not money by their own names ("rate_limit_rpm" holds "limit", not a limit), only by what is above them.
 */
const WRAPPER_KEY = /^(?:amounts?|values?|prices?)$/;
/** The notice keys the generator writes under revocation, which hold the revocation notice answer in hours. */
const NOTICE_ANSWER_OWNERS = new Set(['notice_period', 'revocation_notice']);
const NOTICE_LEAD = /^\s*(\d+(?:\.\d+)?)\s*(h|hrs?|hours?|d|days?|w|weeks?|months?|years?|yrs?)?(?![A-Za-z])/i;
const NOTICE_HOURS: Record<string, number> = { h: 1, hr: 1, hour: 1, d: 24, day: 24, w: 168, week: 168 };
const isExactMetricKey = (k: string) => METRIC_KEYS.has(k) || METRIC_TEXT_KEYS.has(k) || RATE_KEYS.has(k);
const isLimitName = (k: string) => ROLE_OF_KEY.has(k) || GENERIC_LIMIT.has(k);
const moneyKey = (k: string) => isLimitName(k) || (!isExactMetricKey(k) && (WRAPPER_KEY.test(k) || RULE_KEY.test(k) || MONEYISH.test(k) || THRESHOLD_CONTEXT.test(k)));
const namesCurrency = (k: string, v: unknown) =>
  CURRENCY_LIKE_KEY.test(k) || ((k === 'unit' || k === 'units') && typeof v !== 'string') || (typeof v === 'string' && (!!currencyOf(v) || /^[$€£¥₹₽₩₿]$/.test(v.trim())));
const objectNamesCurrency = (o: Record<string, unknown>) => Object.entries(o).some(([k, v]) => namesCurrency(normKey(k), v));
const ALL_ROLES = Object.keys(PERIOD_OF_ROLE) as MoneyRole[];
/** The rule a key stands for when a period or wording sits below it: a mapped limit's own. A generic limit name stands for the rule its wording names (see `limitAny`). */
function rolesOfKey(k: string): MoneyRole[] {
  const role = ROLE_OF_KEY.get(k);
  return role ? [role] : [];
}
/** A limit's amount name that is not a mapped alias ("budget_usd", "max_per_order"): wording below it is read against the rule it names. */
const LIMIT_NAME = /(^|_)(limits?|caps?|budgets?|max\w*|ceilings?|quotas?|allowances?|thresholds?|spend\w*|fees?|prices?|costs?|totals?|amounts?)(_|$)/;
const mergeRoles = (a: MoneyRole[] | undefined, b: MoneyRole[]) => (b.length === 0 ? a : a ? [...new Set([...a, ...b])] : b);

/** Where the evaluator reads an action list itself: under these containers, or at the top level. */
const SCOPE_CONTAINERS = new Set(['scope_of_delegation', 'scope_of_authority']);
/** Containers a list may sit in without becoming words: the shape of the repo's own sample contract is "scope". */
const CONTAINER_KEYS = new Set(['scope', 'restrictions', 'restriction', 'limitations', 'constraints']);
const PROHIBIT_KEY = /(^|_)(prohibit\w*|forbid\w*|ban|banned|denylist|blacklist|disallow\w*|never)(_|$)/;
const PARTY_OR_PLACE = /(^|_)(region\w*|countr\w*|jurisdiction\w*|territor\w*|geograph\w*|location\w*|vendor\w*|supplier\w*|merchant\w*|counterpart\w*|payee\w*|recipient\w*|part(?:y|ies)|entit\w*|address\w*|wallet\w*)(_|$)/;
const PERMITTED_KEYS = new Set(LIST_ALIASES.permitted_actions.map(normKey));
/**
 * The lists the templates define as lists of names: every alias of a list answer (categories, actions, counterparties),
 * the deliverables and the capabilities of a service or an agent. Only an entry of one of these may be a name with digits.
 */
const NAME_LIST_KEYS = new Set([...Object.values(LIST_ALIASES).flat().map(normKey), 'deliverables', 'capabilities']);
/** A list is one of names by its own key, or by sitting inside a capabilities object ("capabilities": { "supported": [...] }). */
const isNameList = (owner?: string, parent?: string) => (!!owner && NAME_LIST_KEYS.has(owner)) || parent === 'capabilities';

/** The roles a template gives its parties. */
const PARTY_ROLES = 'principal|buyer|seller|executor|requester|client|provider|consumer|counterparty|party';
const PARTY_NAME_KEY = new RegExp(`^(?:${PARTY_ROLES})_name$`);
const PARTY_ROLE_KEY = new RegExp(`^(?:${PARTY_ROLES})$`);
/** A value is a party's name by its key: "principal.name", a role under "parties", or a role's own name key ("seller_name"). */
function isPartyNameKey(segments: string[]): boolean {
  const { owner, parent } = ownerKey(segments);
  if (!owner) return false;
  return PARTY_NAME_KEY.test(owner) || (owner === 'name' && !!parent && PARTY_ROLE_KEY.test(parent)) || (parent === 'parties' && PARTY_ROLE_KEY.test(owner));
}

export type ActionListKind = 'permitted' | 'prohibited' | 'restricted' | 'boundaries';
export type Reading = 'per_payment' | 'period' | 'unknown';

/** Which kinds of period a piece of wording names. */
export interface PeriodWords {
  month: boolean;
  /** A period with no name of its own ("aggregate", "cumulative"). */
  open: boolean;
  agreement: boolean;
  /** Week, day, quarter, year, fleet and the like: not the period period_spent covers. */
  other: boolean;
}

export interface Wording {
  roles: MoneyRole[];
  path: string;
  reading: Reading;
  periods: PeriodWords;
}

/** What the check did with a piece of wording, per rule. */
export type WordingEffect = 'single_payment' | 'period_total' | 'strictest' | 'matches' | 'unreadable';

export interface ActionListFound {
  path: string;
  entries: string[];
}

export interface Scan {
  /** Paths whose value is a figure nothing explains. */
  unexplained: string[];
  /** Statements that contradict the form answers, in words. */
  conflicts: string[];
  /** Word terms and flags the check did not evaluate, by path. */
  notChecked: NotChecked[];
  /** Action lists found where the evaluator reads them. */
  actionLists: Record<ActionListKind, ActionListFound[]>;
  /** Category lists found only in the agreement text (no categories answer for the template). */
  categoryLists: ActionListFound[];
  /** Start and end dates the text states, as written. */
  dates: { starts: { path: string; text: string }[]; ends: { path: string; text: string }[] };
  /** Paths of a date under an end-like key the check does not know: it cannot tell whether that is the agreement's end. */
  unknownEnds: string[];
  /** The smallest `oversight_threshold_usd` the text states (a figure Ambr itself writes). */
  oversight?: number;
  /** Basis wording beside a limit: which rules it may belong to, where, and how it reads. */
  wording: Wording[];
  /** Set when the walk stopped at the depth or size cap. */
  truncated?: string;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** The key a value is named by: the nearest key above it that is not just a wrapper ("amount", "value") or an index. */
function ownerKey(segments: string[]): { owner?: string; parent?: string } {
  let owner: string | undefined;
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i];
    if (/^\d+$/.test(s)) continue;
    const k = normKey(s);
    if (owner === undefined) {
      if (k === 'amount' || k === 'value') continue;
      owner = k;
    } else {
      return { owner, parent: k };
    }
  }
  return { owner };
}

/** The value is the amount or value entry of an object, which is where a currency written beside it says it is money. */
/** Root scalars that hold a date, a version, an identifier or a recital whatever else sits at the root: they keep their own shape rules, which refuse any money. */
const ROOT_BOILERPLATE = (k: string) => RECITAL_KEYS.has(k) || DATE_KEYS.has(k) || VERSION_KEYS.has(k) || isIdKey(k);
const isWrapped = (segments: string[]) => /^(?:value|amount)$/i.test(segments[segments.length - 1] ?? '');

function periodWordsOf(text: string): PeriodWords {
  const t = text.replace(/[_-]+/g, ' ');
  return { month: MONTH_WORD.test(t), open: OPEN_PERIOD_WORD.test(t), agreement: AGREEMENT_PERIOD_WORD.test(t), other: OTHER_PERIOD_WORD.test(t) };
}

function readingOf(text: string, periods: PeriodWords): Reading {
  const t = text.trim();
  if (periods.month || periods.open || periods.agreement || periods.other) return 'period';
  return PER_PAYMENT.test(normEntry(t).replace(/_/g, ' ')) || PER_PAYMENT.test(t) ? 'per_payment' : 'unknown';
}

const isThresholdRole = (role: MoneyRole) => THRESHOLD_ROLES.includes(role);

/**
 * What the check does with wording beside each rule it may belong to.
 * - A threshold: per-payment wording keeps the single payment only; wording that
 *   names the month (or no period) adds the period's total; wording the check cannot
 *   read is compared on both and the stricter wins, and one that names another period
 *   is also unreadable.
 * - The per-transaction cap: per-payment wording is the plain case, the month (or no
 *   period) adds the period's total, anything else is unreadable.
 * - The monthly limit, monthly fee and total budget accept only wording that names their own period.
 * - A price per call accepts only per-call wording.
 * Wording that was not narrowed to one rule and reads per payment belongs to the
 * per-transaction cap beside it, not to the cumulative rules.
 */
export function wordingEffects(w: Pick<Wording, 'roles' | 'reading' | 'periods'>): [MoneyRole, WordingEffect][] {
  const p = w.periods;
  const monthly = (p.month || p.open) && !p.other && (!p.agreement || p.month);
  const total = (p.agreement || p.open) && !p.other && !p.month;
  const out: [MoneyRole, WordingEffect][] = [];
  for (const role of w.roles) {
    if (w.reading === 'per_payment' && w.roles.includes('per_transaction') && role !== 'per_transaction' && !isThresholdRole(role)) continue;
    let effect: WordingEffect;
    if (isThresholdRole(role)) {
      effect = w.reading === 'per_payment' ? 'single_payment' : w.reading === 'period' ? (monthly ? 'period_total' : 'unreadable') : 'strictest';
    } else if (role === 'per_transaction') {
      effect = w.reading === 'per_payment' ? 'single_payment' : w.reading === 'period' && monthly ? 'period_total' : 'unreadable';
    } else if (role === 'monthly' || role === 'monthly_fee') {
      effect = w.reading === 'period' && monthly ? 'matches' : 'unreadable';
    } else if (role === 'total') {
      effect = w.reading === 'period' && total ? 'matches' : 'unreadable';
    } else {
      effect = w.reading === 'per_payment' ? 'matches' : 'unreadable';
    }
    out.push([role, effect]);
  }
  return out;
}

const WORDING_WHY: Record<WordingEffect, string> = {
  unreadable: 'Wording beside a limit that names a basis or period the check does not cover, or cannot read. It could not be applied, so the verdict is incomplete. Read the wording yourself.',
  strictest: 'Basis wording beside a threshold that the check could not read as one basis. It compared the single payment and the period total and took the stricter result. Read the wording yourself.',
  period_total: "Period wording beside a limit. The check also compared the period's total (period_spent). Read the wording yourself.",
  single_payment: 'Wording beside a limit that says it applies per payment. The check compared the single payment only. Read the wording yourself.',
  matches: 'Period wording beside a limit that names the period period_spent covers. Read the wording yourself.',
};

function actionListKind(keys: string[], owner: string | undefined, strictOk: boolean): ActionListKind | undefined {
  const k = !strictOk ? undefined : keys.length === 1 ? keys[0] : keys.length === 2 && SCOPE_CONTAINERS.has(keys[0]) ? keys[1] : undefined;
  if (k) {
    if (PERMITTED_KEYS.has(k)) return 'permitted';
    if (k === 'prohibited_actions') return 'prohibited';
    if (k === 'restricted_actions') return 'restricted';
    if (k === 'boundaries') return 'boundaries';
  }
  // A prohibited list under any other name, at any depth: "prohibited_activities", "forbidden", "denylist". Not who or where.
  if (owner && PROHIBIT_KEY.test(owner) && !PARTY_OR_PLACE.test(owner)) return 'prohibited';
  return undefined;
}

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((e) => b.has(e));

interface Frame {
  value: unknown;
  segments: string[];
  path: string;
  /** Some key above this value (not counting its own) is a restriction-like word key: a list under it is words. */
  blocked?: boolean;
  /** Same, counting the value's own key. */
  selfBlocked?: boolean;
  /** As `blocked`, but a plain container such as "scope" or "restrictions" does not count: a prohibited list may sit in one. */
  softBlocked?: boolean;
  selfSoftBlocked?: boolean;
  /** Same, counting the value's own key. */
  wordPath?: string;
  /** Inside a list the evaluator or the list comparison handles: words are not listed again, figures still count. */
  handled: boolean;
  /** The money rule of the key this value sits under, when the key is a limit's name. */
  selfRole?: MoneyRole;
  /** Inside a known recital key: legal citations are not figures. */
  recital?: boolean;
  /** The rules a period or basis written beside this value may belong to. */
  siblingRoles?: MoneyRole[];
  /** Inherited money context (see moneyKey): any digit here is a figure unless a form answer explains it, and no year, identifier, metric or recital shape exempts it. */
  moneyContext?: boolean;
  /** The rules of the mapped limit keys above (and at) this value: wording below them is read against these. */
  limitRoles?: MoneyRole[];
  /** A generic limit name ("spending_limit", "max") is above (or at) this value: wording below it is read against the rule it names. */
  limitAny?: boolean;
  /** The nearest period or basis key above this value, when it sits below a limit. */
  basisKey?: string;
  /** Entries of a list that is the same set as the form answers' list: each was read when the answers were. */
  listMembers?: Set<string>;
}

/** The rules a period or basis text may stand for. */
function rolesOfBasis(text: string): MoneyRole[] {
  const t = normEntry(text).replace(/_/g, ' ');
  const roles: MoneyRole[] = [];
  if (/month/.test(t)) roles.push('monthly', 'monthly_fee');
  if (/transaction|\btx\b|payment|invoice|purchase|single/.test(t)) roles.push('per_transaction');
  if (/agreement|contract|total|term|project|engagement/.test(t)) roles.push('total');
  return roles;
}

/** Text that reads as a figure even where Ambr's own fields are otherwise left alone: money, a decimal or grouped amount, or limit wording beside a digit. */
function readsAsFigure(value: string): boolean {
  if (moneyInWords(value)) return true;
  if (!hasDigit(value)) return false;
  if (hasMoneySignal(value)) return true;
  return /\s/.test(value) && (/\d,\d{3}\b|\d\.\d{2}\b/.test(value) || LIMIT_WORDS.test(value));
}

export function scanMachineReadable(mr: unknown, accounted: AccountedAnswers, templateSlug?: string): Scan {
  const out: Scan = {
    unexplained: [],
    conflicts: [],
    notChecked: [],
    actionLists: { permitted: [], prohibited: [], restricted: [], boundaries: [] },
    categoryLists: [],
    dates: { starts: [], ends: [] },
    unknownEnds: [],
    wording: [],
  };
  const slug = templateSlug?.toLowerCase();
  const reported = new Set<string>();
  const wordingPaths = new Set<string>();
  const unexplained = new Set<string>();

  const note = (path: string, kind: NotChecked['kind'], why: string) => {
    const id = `${kind}:${path}`;
    if (reported.has(id)) return;
    reported.add(id);
    out.notChecked.push({ path, kind, why });
  };
  const conflict = (text: string) => {
    if (!out.conflicts.includes(text)) out.conflicts.push(text);
  };
  const figure = (path: string) => unexplained.add(path);
  const addWording = (roles: MoneyRole[], path: string, text: string) => {
    wordingPaths.add(path);
    const periods = periodWordsOf(text);
    const wording: Wording = { roles, path, reading: readingOf(text, periods), periods };
    out.wording.push(wording);
    const effects = new Set(wordingEffects(wording).map(([, effect]) => effect));
    const why = (Object.keys(WORDING_WHY) as WordingEffect[]).filter((e) => effects.has(e)).map((e) => WORDING_WHY[e]).join(' ');
    note(path, 'basis_wording', why || WORDING_WHY.matches);
  };
  const expectedCurrency = (keys: string[]) => (keys.some((k) => k.endsWith('_usd')) ? 'USD' : accounted.currency);

  const stack: Frame[] = [{ value: mr, segments: [], path: '', handled: false }];
  let visited = 0;

  while (stack.length > 0) {
    const frame = stack.pop() as Frame;
    const { value, segments, path } = frame;
    if (++visited > MAX_NODES) {
      out.truncated = `The agreement text holds more than ${MAX_NODES} values.`;
      break;
    }
    if (segments.length > MAX_DEPTH) {
      out.truncated = `The agreement text is nested more than ${MAX_DEPTH} levels deep.`;
      break;
    }
    const keys = segments.map(normKey);
    const { owner, parent } = ownerKey(segments);
    // A limit's own key or a money-like key: any digit under it is a figure.
    const limitKey = !!owner && (isLimitName(owner) || (!isExactMetricKey(owner) && MONEYISH.test(owner)));
    const ruleKey = !!owner && (isLimitName(owner) || (!isExactMetricKey(owner) && RULE_KEY.test(owner)));
    // A figure is explained by an answer of the same rule: at its own key or an alias (also joined with its parent's key,
    // "escalation" + "threshold"), or at a generic limit key whose sibling period names the rule. A period written with
    // the figure must be the rule's own.
    const explainedNumber = (n: number, period?: string, percent?: boolean) => {
      if (!owner) return false;
      const names = [owner, ...(parent ? [`${parent}_${owner}`] : [])];
      return accounted.numbers.some((a) => {
        if (Math.abs(a.value - n) > 1e-9) return false;
        const named = names.some((k) => a.keys.includes(k)) || (GENERIC_LIMIT.has(owner) && !!a.role && !!frame.siblingRoles?.includes(a.role));
        if (!named) return false;
        if (percent && a.role) return false;
        return period === undefined || (!!a.role && periodFits(period, a.role));
      });
    };

    if (Array.isArray(value)) {
      if (value.length > MAX_NODES) {
        out.truncated = `The agreement text holds a list of more than ${MAX_NODES} values.`;
        break;
      }
      let handled = frame.handled;
      let listMembers = frame.listMembers;
      const moneyHere = !!frame.moneyContext || value.some((e) => (isObject(e) && objectNamesCurrency(e)) || (typeof e === 'string' && !!currencyOf(e)));
      const strictOk = !frame.blocked;
      if (!handled && (strictOk || !frame.softBlocked)) {
        const kind = actionListKind(keys, owner, strictOk);
        const entries = actionList(value).filter((e) => !isEmptyTerm(e));
        const role = strictOk && owner ? LIST_ROLE_OF_KEY.get(owner) : undefined;
        if (kind && entries.length > 0) {
          out.actionLists[kind].push({ path, entries });
          handled = true;
        }
        // A list the form answers also hold must be the same list as a set.
        const answered = accounted.lists.find((l) => (kind === 'permitted' ? l.role === 'permitted_actions' : kind === 'restricted' ? l.role === 'restricted_actions' : !kind && l.role === role));
        if (answered && !(entries.length === 0 && answered.entries.size === 0)) {
          const mine = new Set(entries.map(normEntry));
          if (!sameSet(mine, answered.entries)) conflict(`The agreement text's list at "${path}" differs from the form answers.`);
          else listMembers = answered.entries;
          handled = true;
        } else if (!kind && role === 'categories' && entries.length > 0) {
          // A category list that only the agreement text holds (a template without a categories answer).
          out.categoryLists.push({ path, entries });
          handled = true;
        }
      }
      for (let i = value.length - 1; i >= 0; i--) {
        stack.push({ value: value[i], segments: [...segments, String(i)], path: `${path}[${i}]`, blocked: frame.selfBlocked, selfBlocked: frame.selfBlocked, softBlocked: frame.selfSoftBlocked, selfSoftBlocked: frame.selfSoftBlocked, wordPath: frame.wordPath, handled, selfRole: frame.selfRole, recital: frame.recital, siblingRoles: frame.siblingRoles, moneyContext: moneyHere, limitRoles: frame.limitRoles, limitAny: frame.limitAny, basisKey: frame.basisKey, listMembers });
      }
      continue;
    }

    if (isObject(value)) {
      const entries = Object.entries(value);
      if (entries.length > MAX_NODES) {
        out.truncated = `The agreement text holds an object of more than ${MAX_NODES} values.`;
        break;
      }
      // Basis or period wording beside a limit's name, inside its value, or under an approval-like container.
      const kidRoles = [...new Set(entries.map(([k]) => ROLE_OF_KEY.get(normKey(k))).filter((r): r is MoneyRole => !!r))];
      const roles = [...new Set([...(frame.selfRole ? [frame.selfRole] : []), ...kidRoles])];
      const context = roles.length > 0 ? roles : keys.some((k) => THRESHOLD_CONTEXT.test(k)) ? THRESHOLD_ROLES : [];
      let basisRoles: MoneyRole[] = [];
      // Money context reaches every entry of this object, and everything below them, when the object is inside one or names a currency.
      // At the root a currency beside the scalars (the generator's "fee" and "currency" sit at the top level) marks those scalars only,
      // not every section below it.
      const hasCurrency = objectNamesCurrency(value);
      const atRoot = segments.length === 0;
      const moneyHere = !!frame.moneyContext || (hasCurrency && !atRoot);
      for (const [k, v] of entries) {
        const nk = normKey(k);
        if (typeof v !== 'string') continue;
        if (BASIS_KEY.test(nk)) basisRoles = [...basisRoles, ...rolesOfBasis(v)];
        // Money in number words is a figure (the leaf says so); any other number word makes the wording unreadable, never dropped.
        if (context.length > 0 && BASIS_KEY.test(nk) && !isEmptyTerm(v) && !hasDigit(v) && !moneyInWords(v) && (nk !== 'scope' || BASIS_VOCABULARY.test(v) || hasNumberWord(v))) {
          const named = narrow(context, nk);
          if (named.length > 0) addWording(named, path ? `${path}.${k}` : k, v);
        } else if (context.length > 0 && BASIS_KEY.test(nk) && !ROLE_OF_KEY.has(nk) && !GENERIC_LIMIT.has(nk) && !MONEYISH.test(nk) && !MONEY_SAFE_METRIC_KEYS.has(nk) && hasDigit(v) && !isEmptyTerm(v)) {
          // A number in a limit's basis or period ("per 30 days") is not read: it is a figure, never a metric.
          figure(path ? `${path}.${k}` : k);
        }
      }
      for (let i = entries.length - 1; i >= 0; i--) {
        const [k, v] = entries[i];
        const nk = normKey(k);
        const childPath = path ? `${path}.${k}` : k;
        const childMoney = moneyHere || moneyKey(nk) || (atRoot && hasCurrency && !isObject(v) && !Array.isArray(v) && !ROOT_BOILERPLATE(nk));
        // A digit in a key is a figure ("20" under a tier table, "over_20_usd"), unless the key is an identifier or a date.
        if (keyFigure(k, childMoney)) figure(childPath);
        stack.push({
          value: v,
          segments: [...segments, k],
          path: childPath,
          blocked: frame.selfBlocked,
          selfBlocked: frame.selfBlocked || isWordKey(nk),
          softBlocked: frame.selfSoftBlocked,
          selfSoftBlocked: frame.selfSoftBlocked || (isWordKey(nk) && !CONTAINER_KEYS.has(nk)),
          wordPath: frame.wordPath ?? (isWordKey(nk) ? childPath : undefined),
          handled: frame.handled,
          selfRole: ROLE_OF_KEY.get(nk),
          // A recital key, and what sits under it except a limit's own name.
          recital: RECITAL_KEYS.has(nk) || (!!frame.recital && !childMoney),
          siblingRoles: basisRoles.length > 0 ? [...new Set(basisRoles)] : frame.siblingRoles,
          moneyContext: childMoney,
          limitRoles: mergeRoles(frame.limitRoles, rolesOfKey(nk)),
          limitAny: frame.limitAny || GENERIC_LIMIT.has(nk) || (!ROLE_OF_KEY.has(nk) && !isExactMetricKey(nk) && LIMIT_NAME.test(nk) && !WRAPPER_KEY.test(nk)),
          basisKey: frame.basisKey ?? (BASIS_KEY.test(nk) && (frame.limitRoles || frame.limitAny || isLimitName(nk) || LIMIT_NAME.test(nk)) ? nk : undefined),
          listMembers: frame.listMembers,
        });
      }
      continue;
    }

    // A leaf.
    if (value === null || value === undefined) continue;
    const dotted = keys.join('.');
    if (wordingPaths.has(path)) continue;
    // Money context, and the key's own name: a mapped limit, a rule or money name. The exact metric and rate keys are not money by name.
    const money = !!frame.moneyContext;
    // Ambr's own fields are left alone only while they hold nothing that reads as a figure.
    if (EXPLAINED_PATHS.has(dotted) && !(typeof value === 'string' && readsAsFigure(value))) continue;

    if (typeof value === 'boolean') {
      const candidates = [owner, keys.slice(-2).join('_'), dotted.replace(/\./g, '_')].filter((c): c is string => !!c);
      const answered = candidates.find((c) => hasOwn(accounted.flags, c));
      if (answered) {
        if (accounted.flags[answered] !== value) conflict(`The agreement text states ${answered} as ${value ? 'yes' : 'no'}, which differs from the form answers (at "${path}").`);
        continue;
      }
      if (value && (frame.wordPath || keys.some((k) => APPROVAL_FLAG_KEY.test(k)))) {
        note(path, 'flag', 'A flag that may require approval or review. The check cannot evaluate it.');
      }
      continue;
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        figure(path);
        continue;
      }
      if (owner === 'oversight_threshold_usd' && value >= 0) {
        out.oversight = out.oversight === undefined ? value : Math.min(out.oversight, value);
        continue;
      }
      if (explainedNumber(value)) continue;
      // A version under a version key, with no money context above.
      if (!money && owner && VERSION_KEYS.has(owner)) continue;
      // A duration, notice, uptime or rate under the exact key the generator writes. Inside a money section too, except a burst "limit"
      // and anything inside a limit's own object. A number that differs from the same metric in the form answers is a conflict.
      if (owner && METRIC_KEYS.has(owner) && (!money || (MONEY_SAFE_METRIC_KEYS.has(owner) && !(parent && isLimitName(parent)) && !isWrapped(segments)))) {
        if (accounted.numbers.some((a) => a.keys.includes(owner))) {
          conflict(`The agreement text states ${owner} as ${value}, which differs from the form answers (at "${path}").`);
        }
        continue;
      }
      figure(path);
      continue;
    }

    if (typeof value !== 'string') {
      figure(path);
      continue;
    }

    const text = value.trim();
    if (isEmptyTerm(text)) continue;
    const lower = text.toLowerCase();
    // An entry of a list that is the same set as the form answers' list: each entry was read when the answers were.
    if (frame.listMembers?.has(normEntry(text))) continue;
    // A party's own name as the form answers state it ("Three Rivers Ltd") is a name whatever number words it holds, though never as a limit's or a rule's value or under money.
    if (isPartyNameKey(segments) && !money && !limitKey && !ruleKey && !frame.wordPath && !hasDigit(text) && accounted.names.has(nameKey(text)) && !hasLimitWording(text)) continue;
    // Money written in number words ("thirty dollars") is a figure under any key, in any container.
    if (moneyInWords(text)) {
      figure(path);
      continue;
    }

    // A currency, under any key: it must be the one the form answers state.
    if (owner === 'currency' || owner?.endsWith('_currency') || currencyOf(text)) {
      if (!sameCurrency(text, expectedCurrency(keys))) {
        conflict(`The agreement text states the currency "${text.slice(0, 12)}" at "${path}", which differs from the currency of the form answers (${accounted.currency}).`);
      }
      continue;
    }
    // The oversight threshold Ambr writes itself: an amount, or a statement that cannot be read as one.
    if (owner === 'oversight_threshold_usd') {
      const parsed = parseFigure(text);
      if (parsed && (!parsed.currency || sameCurrency(parsed.currency, 'USD'))) {
        out.oversight = out.oversight === undefined ? parsed.amount : Math.min(out.oversight, parsed.amount);
      } else {
        figure(path);
      }
      continue;
    }
    // A start or end date. Only the agreement's own keys give its window; a start or end deeper in the
    // tree (a phase, a milestone, a maintenance window) is another thing and is handed back.
    if (owner && (START_KEYS.has(owner) || END_KEYS.has(owner))) {
      const own = segments.length > 1 && /^(?:value|amount)$/i.test(segments[segments.length - 1]) ? segments.slice(0, -1) : segments;
      const atAgreementLevel = own.length === 1 || (own.length === 2 && TERM_CONTAINERS.has(normKey(own[0])));
      if (!atAgreementLevel) {
        if (DATE_LIKE.test(text) || TIME_OF_DAY.test(text)) {
          note(path, 'agreement_text', "A start or end that is not the agreement's own term (a phase, milestone or window). The check does not use it as the agreement's window.");
          continue;
        }
      } else {
        if (DATE_LIKE.test(text) && !Number.isNaN(Date.parse(text))) {
          (START_KEYS.has(owner) ? out.dates.starts : out.dates.ends).push({ path, text });
        } else if (hasDigit(text)) {
          conflict(`The agreement text's date at "${path}" could not be read as a date.`);
        }
        // Words such as "date of signature" are not a date; they are not read.
        continue;
      }
    }
    // A date under an end-like key the check does not know ("valid_through", "expires_on").
    const endKey = owner && UNKNOWN_END_KEY.test(owner) ? owner : owner && parent && END_WRAPPER.has(owner) && UNKNOWN_END_KEY.test(parent) ? parent : undefined;
    if (endKey && !START_KEYS.has(endKey) && !END_KEYS.has(endKey) && (DATE_LIKE.test(text) || isDateValue(text))) {
      out.unknownEnds.push(path);
      note(path, 'agreement_text', "A date under a key the check does not know as the agreement's end. It cannot tell whether this is the end of the agreement, so the check is incomplete.");
      continue;
    }
    // An answer that decides how a limit reads (payment or pricing model).
    if (owner && hasOwn(accounted.enums, owner)) {
      if (accounted.enums[owner] !== normEntry(text)) conflict(`The agreement text states ${owner} differently from the form answers (at "${path}").`);
      continue;
    }
    // A basis written where the limit's amount would be ("monthly aggregate").
    const role = owner ? ROLE_OF_KEY.get(owner) : undefined;
    // A number spelled out in a money context ("two thousand", "half on signing", beside a currency or below a limit) is a figure, never wording.
    if ((money || limitKey) && !hasDigit(text) && spellsAmount(text)) {
      figure(path);
      continue;
    }
    const isListEntry = /^\d+$/.test(segments[segments.length - 1] ?? '');
    const nameListEntry = isListEntry && !ruleKey && !frame.recital && isNameList(owner, parent);
    // Any other string that spells a number out is a figure like its digit form, "no more than thirty per order" as well as "thirty" (see numberWordFigure).
    // An entry of a list of names needs the positive shape of a name instead ("Three Rivers Ltd"; see listEntryFigure), under a restriction-like key too.
    if (!money && !limitKey && !hasDigit(text) && (nameListEntry ? listEntryFigure(text, accounted.names) : numberWordFigure(text))) {
      figure(path);
      if (frame.wordPath) note(frame.wordPath, 'agreement_text', 'A number written in words under a restriction-like key. The check cannot place it, so it is incomplete.');
      continue;
    }
    if (role && !hasDigit(text)) {
      addWording([role], path, text);
      continue;
    }
    // How a limit is enforced ("type": "hard") names no basis or period.
    if (owner && ATTRIBUTE_KEYS.has(owner) && !hasDigit(text) && ENFORCEMENT_WORDS.has(normEntry(text))) continue;
    // Wording below a limit (a period object, a schedule, a unit) is read against that limit: unread wording makes it incomplete.
    if ((frame.limitRoles || frame.limitAny) && !hasDigit(text) && !(owner && CONDITION_BEARING_KEY.has(owner))) {
      const named = rolesOfBasis(text);
      const roles = frame.limitRoles ? narrow(frame.limitRoles, frame.basisKey ?? owner ?? '') : named.length > 0 ? named : ALL_ROLES;
      // A billing cadence beside nothing but a price per call has no rule left to be read against.
      if (roles.length > 0) addWording(roles, path, text);
      continue;
    }

    // A number spelled out under the notice key the generator writes ("five thousand hours") cannot be compared with the answer, so it is a figure.
    if (owner && NOTICE_ANSWER_OWNERS.has(owner) && parent === 'revocation' && !hasDigit(text) && hasNumberWord(text)) {
      figure(path);
      continue;
    }
    if (hasDigit(text)) {
      // Money under a metric key is a figure, never explained by the answer that has the same number.
      if (owner && (METRIC_KEYS.has(owner) || METRIC_TEXT_KEYS.has(owner)) && hasMoneySignal(text)) {
        figure(path);
        continue;
      }
      const parsed = parseFigure(text);
      const explained = !!parsed && explainedNumber(parsed.amount, parsed.period, parsed.percent);
      if (explained && parsed?.currency && !sameCurrency(parsed.currency, expectedCurrency(keys))) {
        conflict(`The agreement text states a figure in ${parsed.currency} at "${path}", which differs from the currency of the form answers (${accounted.currency}).`);
        continue;
      }
      // A metric written as text ("5000", "24 hours") is compared with the same metric in the form answers, as its number form is.
      // The notice the generator writes under revocation is the revocation notice answer, in hours: days and weeks are converted, months and years never match.
      const noticeAnswer = owner && NOTICE_ANSWER_OWNERS.has(owner) && parent === 'revocation' && !money ? 'revocation_notice_hours' : undefined;
      const noticeLead = noticeAnswer && !hasMoneySignal(text) ? NOTICE_LEAD.exec(text) : null;
      if (noticeLead && noticeAnswer && accounted.numbers.some((a) => a.keys.includes(noticeAnswer))) {
        const hours = Number(noticeLead[1]) * (NOTICE_HOURS[(noticeLead[2] ?? 'h').toLowerCase().replace(/s$/, '')] ?? NaN);
        if (!accounted.numbers.some((a) => a.keys.includes(noticeAnswer!) && Math.abs(a.value - hours) < 1e-9)) {
          conflict(`The agreement text states ${owner} as ${text.trim()}, which differs from the form answers (at "${path}").`);
          continue;
        }
      }
      const lead = owner && METRIC_TEXT_KEYS.has(owner) && !hasMoneySignal(text) && (/^\s*\d{1,6}(?:\.\d+)?\s*$/.test(text) || isNoticeValue(text)) ? /^\s*(\d+(?:\.\d+)?)/.exec(text) : null;
      if (lead && owner && (!money || (MONEY_SAFE_METRIC_KEYS.has(owner) && !(parent && isLimitName(parent)) && !isWrapped(segments))) && !explainedNumber(Number(lead[1])) && accounted.numbers.some((a) => a.keys.includes(owner))) {
        conflict(`The agreement text states ${owner} as ${lead[1]}, which differs from the form answers (at "${path}").`);
        continue;
      }
      // A duration under a duration key ("12 months") must be the duration the form answers state.
      const months = owner && DURATION_KEYS.has(owner) ? parseMonths(text) : undefined;
      if (months !== undefined) {
        if (!explainedNumber(months)) figure(path);
        continue;
      }
      // An identity answer repeated word for word is explained, but never as a limit's or a rule's value or under money.
      const echoed = !frame.wordPath && !money && !limitKey && !ruleKey && accounted.echoes.has(lower);
      // An entry of a list of names ("Level 2 order book") outside every money context: a name when it has the shape of one (see listEntryFigure).
      // Only the lists the templates define as lists of names are read so; an entry of any other list is a plain string.
      const listName = nameListEntry && !money && !limitKey && !frame.wordPath && !listEntryFigure(text, accounted.names);
      const shapeOk =
        listName ||
        !textFigure(text, {
          key: owner,
          parent,
          limitKey,
          ruleKey,
          money,
          recital: frame.recital,
          inLimit: !!parent && isLimitName(parent),
          wrapped: isWrapped(segments),
          versionKey: !!owner && VERSION_KEYS.has(owner),
        });
      if (!explained && !echoed && !shapeOk) figure(path);
      continue;
    }

    // Words. They never decide the verdict; the ones that may restrict a payment are handed back.
    if (frame.handled || lower === slug) continue;
    if (frame.wordPath) {
      note(frame.wordPath, 'agreement_text', 'Written in words under a restriction-like key. The check does not read it.');
    } else if (owner && CONDITION_BEARING_KEY.has(owner) && CONDITION_WORDS.test(text)) {
      note(path, 'agreement_text', 'A description that holds a condition word. The check does not read it.');
    }
  }
  out.unexplained = [...unexplained];
  return out;
}

/** Up to MAX_NAMED_PATHS paths and a count of the rest, for a reason. */
export function namePaths(paths: string[]): string {
  const shown = paths.slice(0, MAX_NAMED_PATHS).join(', ');
  return paths.length > MAX_NAMED_PATHS ? `${shown} (and ${paths.length - MAX_NAMED_PATHS} more)` : shown;
}
