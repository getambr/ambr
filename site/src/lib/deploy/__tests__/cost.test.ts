import { describe, it, expect } from 'vitest';
import { describeCreditsAfterDeploy, describeDeployCost, priceCentsBySlug } from '../cost';

const base = { tier: 'developer', templateUsdPrice: 0.2 };

describe('describeDeployCost', () => {
  it('quotes the dollar price for a wallet-only caller (no tier)', () => {
    expect(describeDeployCost({ ...base, tier: null, credits: null, costCredits: 20 }).label).toBe(
      'Deploy contract — $0.20 via x402',
    );
  });

  it('names the template price in credits, not one credit', () => {
    expect(describeDeployCost({ ...base, credits: 140, costCredits: 20 }).label).toBe(
      'Deploy contract — uses 20 credits of 140',
    );
    expect(describeDeployCost({ ...base, credits: 5, costCredits: 1 }).label).toBe('Deploy contract — uses 1 credit of 5');
  });

  it('claims no cost while the price is unknown', () => {
    const { label } = describeDeployCost({ ...base, credits: 140, costCredits: null });
    expect(label).toBe('Deploy contract — 140 credits available');
    expect(label).not.toMatch(/uses/);
  });

  it('warns when the balance is below the price', () => {
    const out = describeDeployCost({ ...base, credits: 10, costCredits: 20 });
    expect(out.label).toMatch(/Not enough credits/);
    expect(out.warning).toMatch(/costs 20 credits and you have 10/);
  });

  it('keeps the out-of-credits branches', () => {
    expect(describeDeployCost({ ...base, credits: 0, costCredits: 20 }).label).toMatch(/Out of free credits/);
    expect(describeDeployCost({ tier: 'team', templateUsdPrice: 0.2, credits: 0, costCredits: 20 }).label).toMatch(/Out of credits/);
  });
});

describe('describeDeployCost unlimited credits', () => {
  it('is never an out-of-credits label', () => {
    const out = describeDeployCost({ ...base, credits: -1, costCredits: 20 });
    expect(out).toEqual({ label: 'Deploy contract — unlimited credits' });
    expect(describeDeployCost({ ...base, credits: -1, costCredits: null }).label).toBe('Deploy contract — unlimited credits');
  });
});

describe('describeCreditsAfterDeploy', () => {
  it('subtracts the real price', () => {
    expect(describeCreditsAfterDeploy(140, 20)).toBe('After deploy: 120 credits remaining');
    expect(describeCreditsAfterDeploy(21, 20)).toBe('After deploy: 1 credit remaining');
  });

  it('says nothing when the price is unknown or the balance cannot cover it', () => {
    expect(describeCreditsAfterDeploy(140, null)).toBeNull();
    expect(describeCreditsAfterDeploy(10, 20)).toBeNull();
    expect(describeCreditsAfterDeploy(0, 20)).toBeNull();
    expect(describeCreditsAfterDeploy(null, 20)).toBeNull();
    expect(describeCreditsAfterDeploy(-1, 20)).toBeNull();
  });
});

describe('priceCentsBySlug', () => {
  it('reads slug and price_cents from the templates response', () => {
    expect(
      priceCentsBySlug({
        templates: [
          { slug: 'p2-power-of-attorney', price_cents: 20 },
          { slug: 'c1-api-access', price_cents: 100 },
        ],
      }),
    ).toEqual({ 'p2-power-of-attorney': 20, 'c1-api-access': 100 });
  });

  it('skips rows without a usable price and tolerates a bad payload', () => {
    expect(priceCentsBySlug({ templates: [{ slug: 'x', price_cents: '20' }, { slug: 'y' }, null, { price_cents: 5 }] })).toEqual({});
    expect(priceCentsBySlug(null)).toEqual({});
    expect(priceCentsBySlug({ error: 'db_error' })).toEqual({});
  });
});
