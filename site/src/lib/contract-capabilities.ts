/**
 * Derives a plain-language "what this AI agent may / may not do" summary from a
 * contract's machine_readable JSON, for display (the reader page, the status
 * binding terms, the MCP contract view) and for the action lists and dates the
 * payment check reads.
 *
 * The LLM-generated structure varies across template versions (e.g. spending
 * limits are sometimes a bare number, sometimes `{ amount, currency }`; scope
 * lives under `scope_of_delegation` for D-templates but as a flat `scope`
 * string elsewhere), so every field is optional and extracted defensively by
 * trying the known shapes. Returns null when there's no delegation-style scope
 * or limit worth surfacing (e.g. a consumer contract).
 *
 * The limits read here are for showing, not for deciding: the payment check
 * takes its limits from the contract's form answers (see
 * contract/check-template-map.ts) and uses only `actionList`,
 * `CONDITION_WORDS` and `CURRENCY_CODES` from this file.
 */

/** `assumedCurrency` marks a currency filled in as USD because the agreement named none. */
export type Money = { amount: number; currency: string; assumedCurrency?: true };

export interface ContractCapabilities {
  purpose?: string;
  agentId?: string;
  agentType?: string;
  mayDo: string[];
  mayNotDo: string[];
  /** Prohibited actions (`scope_of_authority.prohibited_actions`), as written; the payment check tells short action names from prose sentences. */
  prohibitedActions?: string[];
  /** Actions reserved for a lead agent (`restricted_actions`): not banned, but not open to every agent. */
  restrictedActions?: string[];
  categories: string[];
  perTxLimit?: Money;
  monthlyLimit?: Money;
  approvalAbove?: Money;
  /** `monthly_aggregate` when the approval threshold applies to the month's total, not the single payment. */
  approvalBasis?: 'monthly_aggregate';
  /** Currency the agreement names for its limits, when it names one. */
  currency?: string;
  geographic?: string;
  startDate?: string;
  endDate?: string;
  durationMonths?: number;
  subDelegationAllowed?: boolean;
  revocationNoticeHours?: number;
  oversightFramework?: string;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

// Fields an action object may carry beside its action or name without adding a condition.
const DESCRIPTIVE_KEYS = new Set(['description', 'reason', 'rationale', 'note', 'notes', 'comment', 'label', 'id']);

/**
 * Words that make a sentence a condition or a restriction ("requires approval",
 * "only", "per invoice", "no gambling"). A description holding one is not plain.
 */
export const CONDITION_WORDS =
  /\b(approval|approve[sd]?|require[sd]?|requiring|only|except|unless|limit(?:ed|s)?|cap(?:ped)?|max(?:imum)?|min(?:imum)?|above|below|over|under|exceed(?:s|ing)?|within|at most|at least|subject to|provided|prior|before|after|never|not|no|without|excluding|excluded|prohibit(?:ed)?|forbidden|must|if|when|whenever|per)\b/i;

/** A descriptive field is plain when it holds no digit and no condition word. */
const plainText = (x: unknown) => typeof x === 'string' && !/\d/.test(x) && !CONDITION_WORDS.test(x);

/**
 * One list item as text. A string is itself. An object is its action or name
 * when it says nothing else but plain description; otherwise its JSON, which
 * no action matches (it may hold a condition the check cannot read). A
 * description with a digit or a condition word ("up to a figure per invoice",
 * "requires principal approval") is a condition, not plain description.
 */
function actionText(item: unknown): string | undefined {
  if (typeof item === 'string') return item.trim() || undefined;
  if (item === null || typeof item !== 'object' || Object.keys(item).length === 0) return undefined;
  const r = asRecord(item);
  const named = asString(r?.action) ?? asString(r?.name);
  const plain = Object.entries(r ?? {}).every(
    ([k, x]) => k === 'action' || k === 'name' || (DESCRIPTIVE_KEYS.has(k) && plainText(x)),
  );
  return r && named && plain ? named : JSON.stringify(item);
}

/**
 * Entries as written. A string is one entry, a list gives one per item, and
 * anything else becomes text the payment check reports as prose; telling short
 * action names from prose is left to the reader of the list.
 */
export function actionList(v: unknown): string[] {
  return (Array.isArray(v) ? v : [v]).map(actionText).filter((x): x is string => !!x);
}

/** Currency codes read next to a number ('500 USD', 'USD 500'). Any other word leaves the figure unread. */
export const CURRENCY_CODES = new Set([
  'USD', 'USDC', 'USDT', 'USDP', 'PYUSD', 'DAI', 'EUR', 'EURC', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'NZD',
  'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'CNY', 'HKD', 'SGD', 'INR', 'BRL', 'MXN',
]);

// A number with no separators, or with comma thousands groups.
const NUMBER = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)';
const GROUPED = new RegExp(`^${NUMBER}$`);
const DOLLARS = new RegExp(`^\\$\\s*${NUMBER}$`);
const AMOUNT_THEN_CODE = new RegExp(`^${NUMBER}\\s*([A-Za-z]{3,5})$`);
const CODE_THEN_AMOUNT = new RegExp(`^([A-Za-z]{3,5})\\s*${NUMBER}$`);
const toNumber = (s: string) => Number(s.replace(/,/g, ''));

/**
 * The unambiguous written forms of an amount: a plain number, a number with
 * comma thousands groups, `$` before a number (USD), and a number with a known
 * currency code before or after it. Anything else (a decimal comma, a number
 * followed by words) is not read.
 */
function readAmountText(text: string): { amount: number; currency?: string } | undefined {
  const t = text.trim();
  if (t === '') return undefined;
  const plain = Number(t);
  if (Number.isFinite(plain)) return { amount: plain };
  if (GROUPED.test(t)) return { amount: toNumber(t) };
  let m = DOLLARS.exec(t);
  if (m) return { amount: toNumber(m[1]), currency: 'USD' };
  m = AMOUNT_THEN_CODE.exec(t);
  if (m && CURRENCY_CODES.has(m[2].toUpperCase())) return { amount: toNumber(m[1]), currency: m[2].toUpperCase() };
  m = CODE_THEN_AMOUNT.exec(t);
  if (m && CURRENCY_CODES.has(m[1].toUpperCase())) return { amount: toNumber(m[2]), currency: m[1].toUpperCase() };
  return undefined;
}

/**
 * A bare number, a numeric or written-out string, or `{ amount, currency }`. A
 * currency written inside the value is that reading's own currency; the
 * agreement's currency (or an assumed USD) only fills in when it names none.
 */
function money(v: unknown, fallbackCurrency?: string): Money | undefined {
  let amount: number | undefined;
  let own: string | undefined;
  if (typeof v === 'number') {
    amount = v;
  } else if (typeof v === 'string') {
    const read = readAmountText(v);
    amount = read?.amount;
    own = read?.currency;
  } else {
    const r = asRecord(v);
    if (!r) return undefined;
    if (typeof r.amount === 'number') {
      amount = r.amount;
    } else if (typeof r.amount === 'string') {
      const read = readAmountText(r.amount);
      amount = read?.amount;
      own = read?.currency;
    }
    const named = asString(r.currency);
    if (named) {
      if (own && own.toLowerCase() !== named.toLowerCase()) return undefined;
      own = named;
    }
  }
  if (amount === undefined || !Number.isFinite(amount)) return undefined;
  return {
    amount,
    currency: own ?? fallbackCurrency ?? 'USD',
    ...(own || fallbackCurrency ? {} : { assumedCurrency: true as const }),
  };
}

// Money keys shown from `financial_terms` or the top level of machine_readable.
// The seeded templates name the same limit differently (d1 `spending_limit_*`,
// d3 `per_agent_tx_limit` / `shared_budget_monthly`, c1 `monthly_cap_usd`).
// This is the display reading only; the payment check reads the form answers.
const PER_TX_KEYS = ['spending_limit_per_tx', 'spending_limit_per_transaction', 'per_agent_tx_limit'];
const MONTHLY_KEYS = ['spending_limit_monthly', 'shared_budget_monthly', 'monthly_cap_usd'];
const APPROVAL_KEYS = ['requires_approval_above', 'approval_threshold'];
const ESCALATION_KEYS = ['escalation_threshold'];

/** Values that say, in words, that no limit is set. */
const NO_LIMIT_TEXT = new Set(['none', 'n/a', 'na', 'null', 'nil', 'tbd', 'unlimited', 'no limit', 'not set', 'not applicable', '-']);

/** Nothing written, or written as "no limit": there is nothing to read. */
function isBlank(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase();
    return t === '' || NO_LIMIT_TEXT.has(t);
  }
  if (Array.isArray(v)) return v.length === 0;
  const r = asRecord(v);
  return !!r && Object.keys(r).length === 0;
}

const USD_LIKE = new Set(['usd', 'usdc']);

/**
 * One mapped key. A value that is present but cannot be read, or is zero or
 * negative, is reported and never used: an unread limit must not read as "no
 * limit", and a placeholder 0 must not win over a real cap. A `*_usd` key
 * carries USD (taken one to one with USDC) whatever the agreement's currency
 * says, so in an agreement in any other currency it is reported, not compared.
 */
function readKey(path: string, key: string, v: unknown, currency?: string): { money?: Money; problem?: string } {
  if (isBlank(v)) return {};
  let m: Money | undefined;
  if (key.endsWith('_usd')) {
    m = money(v);
    if (m && ((!m.assumedCurrency && !USD_LIKE.has(m.currency.toLowerCase())) || (currency && !USD_LIKE.has(currency.toLowerCase())))) {
      return { problem: `${path} (currency is not USD)` };
    }
    if (m) m = { amount: m.amount, currency: currency ?? 'USD' };
  } else {
    m = money(v, currency);
  }
  if (!m) return { problem: `${path} (unreadable value)` };
  if (m.amount <= 0) return { problem: `${path} (zero or negative value)` };
  return { money: m };
}

/**
 * One limit written under several names: the smallest reading applies, but
 * readings in different currencies are never compared. When they disagree
 * every one is reported and none is used.
 */
function readLimit(
  keys: string[],
  fin: Record<string, unknown> | undefined,
  mr: Record<string, unknown>,
  currency?: string,
): { limit?: Money; problems: string[] } {
  const problems: string[] = [];
  const found: { path: string; money: Money }[] = [];
  for (const key of keys) {
    for (const [rec, prefix] of [[fin, 'financial_terms.'], [mr, '']] as const) {
      const path = prefix + key;
      const read = readKey(path, key, rec?.[key], currency);
      if (read.problem) problems.push(read.problem);
      else if (read.money) found.push({ path, money: read.money });
    }
  }
  const currencies = new Set(found.map((f) => (f.money.assumedCurrency ? '' : f.money.currency.toLowerCase())));
  if (currencies.size > 1) {
    problems.push(...found.map((f) => `${f.path} (currency differs from the other name for this limit)`));
    return { problems };
  }
  let limit: Money | undefined;
  for (const f of found) if (!limit || f.money.amount < limit.amount) limit = f.money;
  return { limit, problems };
}

function readLimits(mr: Record<string, unknown>, fin: Record<string, unknown> | undefined, currency?: string) {
  const perTx = readLimit(PER_TX_KEYS, fin, mr, currency);
  const monthly = readLimit(MONTHLY_KEYS, fin, mr, currency);
  const approval = readLimit(APPROVAL_KEYS, fin, mr, currency);
  const escalation = readLimit(ESCALATION_KEYS, fin, mr, currency);
  return {
    perTx: perTx.limit,
    monthly: monthly.limit,
    approval: approval.limit,
    escalation: escalation.limit,
    problems: [...perTx.problems, ...monthly.problems, ...approval.problems, ...escalation.problems],
  };
}

function agreementCurrency(mr: Record<string, unknown>, fin: Record<string, unknown> | undefined): string | undefined {
  return asString(fin?.currency) ?? asString(mr.currency);
}

export function deriveCapabilities(
  mr: Record<string, unknown> | null | undefined,
  /** Return the parsed terms even when there is no scope or limit worth showing (the payment check wants dates and thresholds alone). */
  { always = false }: { always?: boolean } = {},
): ContractCapabilities | null {
  if (!mr) return null;

  const scope = asRecord(mr.scope_of_delegation);
  const authority = asRecord(mr.scope_of_authority);
  const fin = asRecord(mr.financial_terms);
  const agent = asRecord(mr.agent_identification);
  const duration = asRecord(mr.duration);
  const subDel = asRecord(mr.sub_delegation);
  const revocation = asRecord(mr.revocation);
  const compliance = asRecord(mr.compliance);

  const currency = agreementCurrency(mr, fin);

  // Permitted actions come from the first location that lists any. Restrictions
  // are the union of every location, so an empty placeholder in one place cannot
  // hide a real restriction written in another. Action lists live under
  // scope_of_authority, but a flat agreement keeps them at the top level.
  const mayDo =
    [scope?.enumerated_actions, authority?.enumerated_actions, authority?.permitted_actions, scope?.permitted_actions, mr.permitted_actions]
      .map(actionList)
      .find((list) => list.length > 0) ?? [];
  const everywhere = (key: string) => [...new Set([authority?.[key], scope?.[key], mr[key]].flatMap(actionList))];
  const mayNotDo = everywhere('boundaries');
  const prohibitedActions = everywhere('prohibited_actions');
  const restrictedActions = everywhere('restricted_actions');
  const categories = asStringArray(scope?.approved_categories ?? mr.categories);

  const limits = readLimits(mr, fin, currency);
  const perTxLimit = limits.perTx;
  const monthlyLimit = limits.monthly;
  const explicitApproval = limits.approval;
  const escalation = explicitApproval ? undefined : limits.escalation;
  const approvalAbove = explicitApproval ?? escalation;
  // Only a missing or clearly per-payment value compares the single amount;
  // any other value is read as the monthly total, the stricter reading.
  const basisRaw = (asString(fin?.escalation_required_above) ?? asString(mr.escalation_required_above))?.toLowerCase();
  const perPayment = !basisRaw || ['per_transaction', 'transaction', 'single'].includes(basisRaw);
  const approvalBasis = escalation && !perPayment ? ('monthly_aggregate' as const) : undefined;

  const purpose =
    asString(scope?.purpose) ?? asString(mr.scope) ?? asString(mr.service_description);
  const agentId = asString(agent?.agent_id) ?? asString(mr.agent_id);
  const agentType = asString(agent?.agent_type) ?? asString(mr.agent_type);
  const geographic = asString(scope?.geographic_limitations);
  const startDate = asString(duration?.start_date) ?? asString(mr.start_date);
  const endDate = asString(duration?.end_date) ?? asString(mr.end_date);
  const durationMonths =
    typeof duration?.duration_months === 'number'
      ? (duration.duration_months as number)
      : typeof mr.duration_months === 'number'
        ? (mr.duration_months as number)
        : undefined;
  const subDelegationAllowed =
    typeof subDel?.allowed === 'boolean' ? (subDel.allowed as boolean) : undefined;
  const revocationNoticeHours =
    typeof revocation?.notice_period_hours === 'number'
      ? (revocation.notice_period_hours as number)
      : undefined;
  const oversightFramework = asString(compliance?.oversight_framework);

  const hasContent =
    !!purpose ||
    mayDo.length > 0 ||
    mayNotDo.length > 0 ||
    categories.length > 0 ||
    !!perTxLimit ||
    !!monthlyLimit ||
    !!agentId;
  if (!hasContent && !always) return null;

  return {
    purpose,
    agentId,
    agentType,
    mayDo,
    mayNotDo,
    ...(prohibitedActions.length > 0 ? { prohibitedActions } : {}),
    ...(restrictedActions.length > 0 ? { restrictedActions } : {}),
    categories,
    perTxLimit,
    monthlyLimit,
    approvalAbove,
    ...(approvalBasis ? { approvalBasis } : {}),
    currency,
    geographic,
    startDate,
    endDate,
    durationMonths,
    subDelegationAllowed,
    revocationNoticeHours,
    oversightFramework,
  };
}

export function formatMoney(m: Money): string {
  const n =
    m.amount % 1 === 0
      ? m.amount.toLocaleString('en-US')
      : m.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n} ${m.currency}`;
}

/** Human-readable label for the EU AI Act oversight framework slug, if present. */
export function oversightLabel(slug?: string): string | undefined {
  if (!slug) return undefined;
  if (/article_?14/i.test(slug)) return 'EU AI Act Art. 14 (human oversight)';
  if (/article_?12/i.test(slug)) return 'EU AI Act Art. 12 (record-keeping)';
  return slug;
}
