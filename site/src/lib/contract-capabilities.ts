/**
 * Derives a plain-language "what this AI agent may / may not do" summary from a
 * contract's machine_readable JSON.
 *
 * The LLM-generated structure varies across template versions (e.g. spending
 * limits are sometimes a bare number, sometimes `{ amount, currency }`; scope
 * lives under `scope_of_delegation` for D-templates but as a flat `scope`
 * string elsewhere), so every field is optional and extracted defensively by
 * trying the known shapes. Returns null when there's no delegation-style scope
 * worth surfacing (e.g. a pure commerce/consumer contract).
 */

/** `assumedCurrency` marks a currency filled in as USD because the agreement named none. */
export type Money = { amount: number; currency: string; assumedCurrency?: true };

export interface ContractCapabilities {
  purpose?: string;
  agentId?: string;
  agentType?: string;
  mayDo: string[];
  mayNotDo: string[];
  /** Slug-like prohibited actions (`scope_of_authority.prohibited_actions`); prose lists are left out, a sentence cannot be matched. */
  prohibitedActions?: string[];
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

const SLUG = /^[a-z0-9_.:-]+$/i;

/** The list when every entry is slug-like; otherwise empty (prose sentences stay unparsed). */
function slugList(v: unknown): string[] {
  const list = asStringArray(v).map((x) => x.trim());
  return list.length > 0 && list.every((x) => SLUG.test(x)) ? list : [];
}

function money(v: unknown, fallbackCurrency?: string): Money | undefined {
  const cur = fallbackCurrency ?? 'USD';
  const assumed = fallbackCurrency ? {} : { assumedCurrency: true as const };
  if (typeof v === 'number' && isFinite(v)) return { amount: v, currency: cur, ...assumed };
  const r = asRecord(v);
  if (r && typeof r.amount === 'number' && isFinite(r.amount as number)) {
    const own = asString(r.currency);
    return { amount: r.amount as number, currency: own ?? cur, ...(own ? {} : assumed) };
  }
  if (typeof v === 'string' && v.trim() && !isNaN(Number(v))) {
    return { amount: Number(v), currency: cur, ...assumed };
  }
  return undefined;
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

  const currency = asString(fin?.currency) ?? asString(mr.currency);

  let mayDo = asStringArray(scope?.enumerated_actions);
  if (mayDo.length === 0) mayDo = asStringArray(authority?.enumerated_actions);
  if (mayDo.length === 0) mayDo = slugList(authority?.permitted_actions);
  const mayNotDo = asStringArray(scope?.boundaries);
  const prohibitedActions = slugList(authority?.prohibited_actions);
  const categories = asStringArray(scope?.approved_categories ?? mr.categories);

  const perTxLimit = money(fin?.spending_limit_per_tx ?? mr.spending_limit_per_tx, currency);
  const monthlyLimit = money(fin?.spending_limit_monthly ?? mr.spending_limit_monthly, currency);
  const explicitApproval = money(fin?.requires_approval_above ?? mr.requires_approval_above, currency);
  const escalation = explicitApproval ? undefined : money(fin?.escalation_threshold, currency);
  const approvalAbove = explicitApproval ?? escalation;
  const approvalBasis =
    escalation && fin?.escalation_required_above === 'monthly_aggregate'
      ? ('monthly_aggregate' as const)
      : undefined;

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
