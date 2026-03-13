import SectionWrapper from '@/components/ui/SectionWrapper';
import ScrollReveal from '@/components/ui/ScrollReveal';
import Button from '@/components/ui/Button';

const pricingItems = [
  {
    label: 'Delegation & Commerce Contracts',
    price: '$0.50–$5.00',
    unit: 'per contract',
    description: 'Create delegation authority or commerce contracts — minted as transferable cNFTs on-chain.',
  },
  {
    label: 'Template Licensing',
    price: '$29–$499',
    unit: 'per template',
    description: 'Industry-specific, jurisdiction-aware templates for delegation, procurement, SaaS, and vendor agreements.',
  },
  {
    label: 'Reader Portal',
    price: '$99',
    unit: 'per month',
    description: 'Enterprise compliance subscription — view, verify, audit, and export all agent-executed contracts.',
  },
  {
    label: 'Dispute Resolution',
    price: '$10–$50',
    unit: 'per case',
    description: 'IETF ADP-compliant automated arbitration when agents exceed mandates or deliverables fall short.',
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
          <p className="text-sm font-mono uppercase tracking-widest text-amber mb-2">
            Pricing
          </p>
          <h2 className="text-3xl font-bold text-text-primary sm:text-4xl">
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
            <div className="group relative overflow-hidden rounded-xl border border-border bg-surface/80 backdrop-blur-sm p-5 h-full flex flex-col hover:border-amber/30 hover:bg-amber/5 transition-colors">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <p className="text-xs font-mono uppercase tracking-wider text-text-secondary">
                {item.label}
              </p>
              <p className="mt-2 text-2xl font-bold text-amber">{item.price}</p>
              <p className="text-xs text-text-secondary">{item.unit}</p>
              <p className="mt-3 text-sm text-text-secondary leading-relaxed flex-1">
                {item.description}
              </p>
            </div>
          </ScrollReveal>
        ))}
      </div>

      <ScrollReveal delay={0.3}>
        <div className="mt-8 text-center">
          <Button href="/waitlist" variant="secondary">
            Get Early Access Pricing
          </Button>
        </div>
      </ScrollReveal>
    </SectionWrapper>
  );
}
