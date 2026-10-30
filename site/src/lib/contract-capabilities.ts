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

export type Money = { amount: number; currency: string };

export interface ContractCapabilities {
  purpose?: string;
  agentId?: string;
  agentType?: string;
  mayDo: string[];
  mayNotDo: string[];
  categories: string[];
  perTxLimit?: Money;
  monthlyLimit?: Money;
  approvalAbove?: Money;
  geographic?: string;
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

function money(v: unknown, fallbackCurrency?: string): Money | undefined {
  const cur = fallbackCurrency ?? 'USD';
  if (typeof v === 'number' && isFinite(v)) return { amount: v, currency: cur };
  const r = asRecord(v);
  if (r && typeof r.amount === 'number' && isFinite(r.amount as number)) {
    return { amount: r.amount as number, currency: asString(r.currency) ?? cur };
  }
  if (typeof v === 'string' && v.trim() && !isNaN(Number(v))) {
    return { amount: Number(v), currency: cur };
  }
  return undefined;
}

export function deriveCapabilities(
  mr: Record<string, unknown> | null | undefined,
): ContractCapabilities | null {
  if (!mr) return null;

  const scope = asRecord(mr.scope_of_delegation);
  const fin = asRecord(mr.financial_terms);
  const agent = asRecord(mr.agent_identification);
  const duration = asRecord(mr.duration);
  const subDel = asRecord(mr.sub_delegation);
  const revocation = asRecord(mr.revocation);
  const compliance = asRecord(mr.compliance);

  const currency = asString(fin?.currency) ?? asString(mr.currency);

  const mayDo = asStringArray(scope?.enumerated_actions);
  const mayNotDo = asStringArray(scope?.boundaries);
  const categories = asStringArray(scope?.approved_categories ?? mr.categories);

  const perTxLimit = money(fin?.spending_limit_per_tx ?? mr.spending_limit_per_tx, currency);
  const monthlyLimit = money(fin?.spending_limit_monthly ?? mr.spending_limit_monthly, currency);
  const approvalAbove = money(fin?.requires_approval_above ?? mr.requires_approval_above, currency);

  const purpose =
    asString(scope?.purpose) ?? asString(mr.scope) ?? asString(mr.service_description);
  const agentId = asString(agent?.agent_id) ?? asString(mr.agent_id);
  const agentType = asString(agent?.agent_type) ?? asString(mr.agent_type);
  const geographic = asString(scope?.geographic_limitations);
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
  if (!hasContent) return null;

  return {
    purpose,
    agentId,
    agentType,
    mayDo,
    mayNotDo,
    categories,
    perTxLimit,
    monthlyLimit,
    approvalAbove,
    geographic,
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
