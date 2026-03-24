import SectionWrapper from '@/components/ui/SectionWrapper';
import ScrollReveal from '@/components/ui/ScrollReveal';
import Button from '@/components/ui/Button';

const pricingItems = [
  {
    label: 'Per-Contract',
    price: '$0.50–$5.00',
    unit: 'per contract',
    description: 'Create delegation authority or commerce contracts — each minted as a single NFT on Base L2 with counterparty-gated transfers and SHA-256 hash stored permanently on-chain.',
  },
  {
    label: 'x402 Pay-per-Contract',
    price: 'From $0.50',
    unit: 'per contract',
    description: 'HTTP-native x402 payments — agents pay per contract via multi-token support (USDC, EURC, and more) with no subscription required.',
  },
  {
    label: 'API Access',
    price: 'Usage-based',
    unit: 'pricing',
    description: 'Platforms embedding Ambr\'s contract layer into their agent workflows via REST or MCP.',
  },
];

export default function PricingSection() {
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
            Theoretical pricing — subject to change based on market validation and network costs.
          </p>
        </div>
      </ScrollReveal>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            Get Started
          </Button>
        </div>
      </ScrollReveal>
    </SectionWrapper>
  );
}
