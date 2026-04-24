import SectionWrapper from '@/components/ui/SectionWrapper';
import ScrollReveal from '@/components/ui/ScrollReveal';
import Button from '@/components/ui/Button';

const pricingItems = [
  {
    label: 'Consumer (A2C)',
    price: '$0.20',
    unit: 'per contract',
    description: 'Agent-to-consumer contracts — service purchases, AI subscriptions, warranty and liability. Micro-priced for high-volume consumer flows.',
  },
  {
    label: 'Delegation (A2A)',
    price: '$0.50',
    unit: 'per contract',
    description: 'Agent-to-agent authorization and NDAs — defines action scopes, spending caps, and revocation terms. Minted as cNFT on Base L2.',
  },
  {
    label: 'Commerce (B2A)',
    price: '$1.00',
    unit: 'per contract',
    description: 'Business-to-agent authorization — compute SLAs, API access, and task execution contracts between businesses and agents. x402 or API key payment.',
  },
  {
    label: 'Fleet Multi-Agent',
    price: '$2.50',
    unit: 'per contract',
    description: 'Multi-agent fleet delegation with shared budget pools, escalation thresholds, and sub-delegation rules.',
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
            Pay per contract. No subscriptions. Live rates from the platform — see <a href="/api/v1/pricing" className="text-amber hover:underline">/api/v1/pricing</a>.
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
            View All Plans
          </Button>
        </div>
      </ScrollReveal>
    </SectionWrapper>
  );
}
