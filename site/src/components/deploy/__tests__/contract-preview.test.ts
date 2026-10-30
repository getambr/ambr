import { describe, it, expect } from 'vitest';
import { buildPreview } from '../contract-preview';

const P2 = 'p2-power-of-attorney';
const D1 = 'd1-general-auth';

const base = {
  principal_name: 'Example Co',
  agent_id: '0x' + '2'.repeat(40),
  scope: 'buy API credits',
  duration_months: 1,
};

function row(template: string, params: Record<string, unknown>, field: string) {
  const r = buildPreview(template, params).rows.find((x) => x.field === field);
  if (!r) throw new Error(`no row ${field}`);
  return r;
}

describe('buildPreview spending caps', () => {
  it('P2 summary does not print a declined per-transaction cap as an amount', () => {
    const { introText } = buildPreview(P2, { ...base, spending_limit_per_tx: 'none', spending_limit_monthly: 50 });
    expect(introText).toContain('capped at $50 per month');
    expect(introText).not.toContain('none');
    expect(introText).not.toContain('per transaction');
  });

  it('P2 summary has no cap clause when neither cap is an amount', () => {
    const { introText } = buildPreview(P2, { ...base, spending_limit_per_tx: 'none', spending_limit_monthly: 'no limit' });
    expect(introText).not.toContain('capped');
  });

  it('P2 summary prints both caps when both are amounts', () => {
    const { introText } = buildPreview(P2, { ...base, spending_limit_per_tx: 500, spending_limit_monthly: '5000' });
    expect(introText).toContain('capped at $500 per transaction and $5,000 per month');
  });

  it('P2 shows a declined optional cap as "No limit", not as the stored word', () => {
    const r = row(P2, { ...base, spending_limit_per_tx: 'none' }, 'spending_limit_per_tx');
    expect(r.value).toBe('No limit');
  });

  it('P2 shows an amount formatted', () => {
    expect(row(P2, { ...base, spending_limit_monthly: '1500' }, 'spending_limit_monthly').value).toBe('$1,500');
  });

  it('a required cap that is not an amount stays unfilled', () => {
    const r = row(D1, { ...base, spending_limit_monthly: 'unlimited' }, 'spending_limit_monthly');
    expect(r.isFilled).toBe(false);
  });

  it('D1 summary prints no monthly clause for a non-amount', () => {
    expect(buildPreview(D1, { ...base, spending_limit_monthly: 'none' }).introText).not.toContain('monthly spending cap');
    expect(buildPreview(D1, { ...base, spending_limit_monthly: 2000 }).introText).toContain('a monthly spending cap of $2,000');
  });
});
