import type { Metadata } from 'next';
import PricingSection from '@/components/home/PricingSection';
import { getPricing } from '@/lib/pricing';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Per-contract prices, credit packs, Team and Enterprise. 1 credit = 1 US cent.',
};

// Rendered from the same source as GET /api/v1/pricing.
export const revalidate = 3600;

export default async function PricingPage() {
  let prices: Record<string, string> | undefined;
  try {
    const pricing = await getPricing();
    prices = Object.fromEntries(pricing.tiers.map((t) => [t.tier, t.price_display]));
  } catch {
    // Database unreachable: PricingSection falls back to its own live fetch and defaults.
    prices = undefined;
  }

  return (
    <main>
      <PricingSection prices={prices} />
    </main>
  );
}
