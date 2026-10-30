import SectionWrapper from '@/components/ui/SectionWrapper';
import ScrollReveal from '@/components/ui/ScrollReveal';
import Button from '@/components/ui/Button';
import { normalizeBaseUrl } from '@/lib/base-url';
import { FREE_TIER_CREDITS, PACKS, TEAM, ENTERPRISE, formatUsd } from '@/lib/pricing';

// Marketing copy (label + description) lives here; the PRICES are fetched live from
// /api/v1/pricing — the canonical DB-backed source — so this card can never drift from
// what clients are actually billed. Keyed by the tier values that endpoint returns
// (consumer / delegation / commerce / fleet). fallbackPrice keeps the page correct if
// the fetch fails or runs before the API is live (e.g. first build).
const tierCopy = [
  {
    tier: 'consumer',
    label: 'Personal',
    fallbackPrice: '$0.20',
    description: 'A person authorizes their own AI agent — one signature, instant activation. Micro-priced for high-volume personal mandates.',
  },
  {
    tier: 'delegation',
    label: 'Delegation',
    fallbackPrice: '$0.50',
    description: 'Delegate authority to your agent — action scopes, spending caps, and revocation terms. Minted as cNFT on Base L2.',
  },
  {
    tier: 'commerce',
    label: 'Agent-to-agent',
    fallbackPrice: '$1.00',
    description: 'One agent commissions and pays another — task, deliverables, acceptance criteria, payment on completion. x402 or API key payment.',
  },
  {
    tier: 'fleet',
    label: 'Fleet · Multi-agent',
    fallbackPrice: '$2.50',
    description: 'Multi-agent fleet delegation with shared budget pools, escalation thresholds, and sub-delegation rules.',
  },
];

// Normalized: a dirty env value made this fetch fail silently, and `catch { return {} }`
// below meant the page fell back to the hardcoded prices instead of showing an error.
// The numbers happened to match, so nothing looked wrong for ~180 days.
const PRICING_URL = `${normalizeBaseUrl(process.env.NEXT_PUBLIC_MARKETING_URL, 'https://ambr.run')}/api/v1/pricing`;

async function getLivePrices(): Promise<Record<string, string>> {
  try {
    const res = await fetch(PRICING_URL, { next: { revalidate: 3600 } });
    if (!res.ok) return {};
    const data = await res.json();
    const map: Record<string, string> = {};
    for (const t of data?.tiers ?? []) {
      if (t?.tier && t?.price_display) map[t.tier] = t.price_display;
    }
    return map;
  } catch {
    // API unreachable — fall back to the hardcoded prices below so the page still renders.
    return {};
  }
}

export default async function PricingSection({ prices }: { prices?: Record<string, string> } = {}) {
  const livePrices = prices ?? await getLivePrices();
  const pricingItems = tierCopy.map((item) => ({
    label: item.label,
    price: livePrices[item.tier] ?? item.fallbackPrice,
    unit: 'per contract',
    description: item.description,
  }));

  return (
    <SectionWrapper>
      <ScrollReveal>
        <div className="text-center mb-10">
          <p className="text-micro mb-2">
            Pricing
          </p>
          <h2 className="text-3xl text-text-primary sm:text-4xl lg:text-5xl">
            Transparent Fee Structure
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-text-secondary text-sm">
            1 credit = 1 cent; each contract burns its price. {FREE_TIER_CREDITS} free credits once per verified key. {PACKS.map((p) => `${p.label} ${formatUsd(p.price_cents)} (${p.credits.toLocaleString('en-US')} credits)`).join(', ')}, {TEAM.label} {formatUsd(TEAM.price_cents_monthly)}/mo ({TEAM.credits_per_month.toLocaleString('en-US')} credits), {ENTERPRISE.label} {formatUsd(ENTERPRISE.price_cents_yearly)}/year. See <a href="/activate" className="text-amber hover:underline">/activate</a> for plans. Live rates at <a href="/api/v1/pricing" className="text-amber hover:underline">/api/v1/pricing</a>.
          </p>
        </div>
      </ScrollReveal>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {pricingItems.map((item, i) => (
          <ScrollReveal key={item.label} delay={i * 0.08}>
            <div className="border border-amber/60 bg-surface p-8 h-full flex flex-col">
              <span className="text-micro">{item.label}</span>
              <h3 className="text-3xl text-text-primary mt-2">{item.price}</h3>
              <p className="text-xs text-[#999] mt-1">{item.unit}</p>
              <p className="text-sm text-[#999] mt-4 leading-relaxed flex-1">{item.description}</p>
            </div>
          </ScrollReveal>
        ))}
      </div>

      <ScrollReveal delay={0.3}>
        <div className="mt-8 text-center">
          <Button href="/activate" variant="secondary">
            See all plans
          </Button>
        </div>
      </ScrollReveal>
    </SectionWrapper>
  );
}
