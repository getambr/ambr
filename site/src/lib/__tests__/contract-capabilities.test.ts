import { describe, it, expect } from 'vitest';
import { deriveCapabilities, formatMoney, oversightLabel } from '../contract-capabilities';

describe('deriveCapabilities', () => {
  // Real production shape (amb-2026-0037, a d1-general-auth contract): nested
  // financial_terms with { amount, currency } and a full scope_of_delegation.
  const nestedD1 = {
    template: 'd1-general-auth',
    duration: { start_date: '2026-06-06', end_date: '2027-06-06', duration_months: 12 },
    compliance: { oversight_framework: 'eu_ai_act_article_14' },
    revocation: { notice_period_hours: 0 },
    sub_delegation: { allowed: false },
    financial_terms: {
      currency: 'USDT',
      spending_limit_per_tx: { amount: 100, currency: 'USDT' },
      spending_limit_monthly: { amount: 3000, currency: 'USDT' },
      requires_approval_above: 100,
    },
    scope_of_delegation: {
      purpose: 'Pay for cloud compute I use on a daily basis',
      boundaries: ['no services outside approved categories', 'no payment exceeding per-transaction cap'],
      enumerated_actions: ['initiate, authorize, and execute payments for cloud computing services'],
      approved_categories: ['Cloud compute under SLA'],
      geographic_limitations: 'None specified, subject to applicable sanctions and export control laws',
    },
    agent_identification: { agent_id: '0x4900', agent_type: 'supervised' },
  };

  it('extracts the nested D1 production shape', () => {
    const cap = deriveCapabilities(nestedD1);
    expect(cap).not.toBeNull();
    expect(cap!.purpose).toBe('Pay for cloud compute I use on a daily basis');
    expect(cap!.perTxLimit).toEqual({ amount: 100, currency: 'USDT' });
    expect(cap!.monthlyLimit).toEqual({ amount: 3000, currency: 'USDT' });
    expect(cap!.approvalAbove).toEqual({ amount: 100, currency: 'USDT' });
    expect(cap!.categories).toEqual(['Cloud compute under SLA']);
    expect(cap!.mayDo).toHaveLength(1);
    expect(cap!.mayNotDo).toHaveLength(2);
    expect(cap!.agentType).toBe('supervised');
    expect(cap!.subDelegationAllowed).toBe(false);
    expect(cap!.revocationNoticeHours).toBe(0);
    expect(cap!.endDate).toBe('2027-06-06');
  });

  it('handles the flat fallback shape (bare numbers + flat scope/categories)', () => {
    const flat = {
      scope: 'Procurement on my behalf',
      categories: ['procurement', 'data-queries'],
      spending_limit_per_tx: 250,
      spending_limit_monthly: 5000,
      currency: 'USDC',
      agent_id: '0xabc',
      agent_type: 'autonomous',
    };
    const cap = deriveCapabilities(flat);
    expect(cap).not.toBeNull();
    expect(cap!.purpose).toBe('Procurement on my behalf');
    expect(cap!.categories).toEqual(['procurement', 'data-queries']);
    expect(cap!.perTxLimit).toEqual({ amount: 250, currency: 'USDC' });
    expect(cap!.monthlyLimit).toEqual({ amount: 5000, currency: 'USDC' });
  });

  it('returns null for a contract with no delegation scope (e.g. commerce)', () => {
    const commerce = {
      template: 'c1-api-access',
      provider_name: 'DataCo',
      buyer_name: 'Acme',
      fee: 500,
      governing_law: { jurisdiction: 'Singapore' },
    };
    expect(deriveCapabilities(commerce)).toBeNull();
  });

  it('returns null for null/empty input', () => {
    expect(deriveCapabilities(null)).toBeNull();
    expect(deriveCapabilities({})).toBeNull();
  });
});

describe('formatMoney', () => {
  it('formats whole and fractional amounts', () => {
    expect(formatMoney({ amount: 3000, currency: 'USDT' })).toBe('3,000 USDT');
    expect(formatMoney({ amount: 12.5, currency: 'USDC' })).toBe('12.50 USDC');
  });
});

describe('oversightLabel', () => {
  it('maps the AI Act slugs', () => {
    expect(oversightLabel('eu_ai_act_article_14')).toContain('Art. 14');
    expect(oversightLabel('eu_ai_act_article_12')).toContain('Art. 12');
    expect(oversightLabel(undefined)).toBeUndefined();
  });
});
