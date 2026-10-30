import { UNLIMITED_CREDITS } from '@/lib/credits';
import { FREE_TIER_CREDITS, PACKS, formatUsd } from '@/lib/pricing';

/**
 * What a contract costs, as the deploy flow tells the user. 1 credit = 1 cent
 * and a contract burns its template's price_cents (lib/credits.ts), so the cost
 * is known only once the template list has loaded. Until then no number is
 * claimed.
 */

/** slug -> price_cents from the GET /api/v1/templates response; rows without a usable price are skipped. */
export function priceCentsBySlug(payload: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const rows = (payload as { templates?: unknown } | null)?.templates;
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    const { slug, price_cents } = (row ?? {}) as { slug?: unknown; price_cents?: unknown };
    if (typeof slug === 'string' && typeof price_cents === 'number' && Number.isInteger(price_cents) && price_cents > 0) {
      out[slug] = price_cents;
    }
  }
  return out;
}

const creditsText = (n: number) => `${n} credit${n === 1 ? '' : 's'}`;

/**
 * Pick the right Deploy button copy + warning based on auth/tier/credits.
 * Pulled out as a pure function so the JSX stays readable and unit tests can
 * easily cover each branch.
 *
 * Branches:
 * - No tier info (wallet-only auth)  -> quote USDC via x402 (the dollar IS correct)
 * - Legacy unlimited balance (-1)    -> "unlimited credits"
 * - API-key user, enough credits     -> "uses C of N credits" (NO dollars)
 * - API-key user, cost not known     -> "N credits available" (no cost claimed)
 * - Credits below the cost, or none  -> upgrade prompt / buy a pack (no per-contract overage)
 */
export function describeDeployCost(opts: {
  tier: string | null | undefined;
  credits: number | null | undefined;
  templateUsdPrice: number;
  /** The template's price in credits, or null while unknown. */
  costCredits: number | null;
}): { label: string; warning?: string } {
  const { tier, credits: balance, templateUsdPrice, costCredits } = opts;
  if (tier === null || tier === undefined) {
    return { label: `Deploy contract — $${templateUsdPrice.toFixed(2)} via x402` };
  }
  if (balance === UNLIMITED_CREDITS) {
    return { label: 'Deploy contract — unlimited credits' };
  }
  if (typeof balance === 'number' && balance > 0) {
    if (costCredits === null) {
      return { label: `Deploy contract — ${creditsText(balance)} available` };
    }
    if (balance >= costCredits) {
      return { label: `Deploy contract — uses ${creditsText(costCredits)} of ${balance}` };
    }
    return {
      label: 'Not enough credits — buy a pack or pay via wallet',
      warning: `This contract costs ${creditsText(costCredits)} and you have ${balance}. Buy a pack (${formatUsd(PACKS[0].price_cents)} for ${PACKS[0].credits.toLocaleString('en-US')} credits) or pay per-contract via x402.`,
    };
  }
  if (tier === 'developer') {
    return {
      label: 'Out of free credits — upgrade or pay via wallet',
      warning: `The free tier is ${FREE_TIER_CREDITS} credits, once. Buy the ${PACKS[0].label} (${formatUsd(PACKS[0].price_cents)} one-off, ${PACKS[0].credits.toLocaleString('en-US')} credits) or sign in with a wallet to pay per-contract via x402.`,
    };
  }
  return {
    label: 'Out of credits — buy a pack or pay via wallet',
    warning: `You've used all your credits. Buy a pack (${formatUsd(PACKS[0].price_cents)} for ${PACKS[0].credits.toLocaleString('en-US')} credits) or pay per-contract via x402.`,
  };
}

/** "After deploy: N credits remaining", or null when the cost is unknown or the balance cannot cover it. */
export function describeCreditsAfterDeploy(balance: number | null | undefined, costCredits: number | null): string | null {
  if (typeof balance !== 'number' || balance <= 0 || costCredits === null || balance < costCredits) return null;
  return `After deploy: ${creditsText(balance - costCredits)} remaining`;
}
