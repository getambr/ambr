import SectionWrapper from '@/components/ui/SectionWrapper';
import ScrollReveal from '@/components/ui/ScrollReveal';
import Button from '@/components/ui/Button';

const tiers = [
  {
    name: 'Early Access',
    price: '29',
    description:
      'First to test contract creation, templates, and the Reader Portal when Phase 1 launches.',
    features: [
      'Beta API access on launch',
      'Community Discord channel',
      '10 free contracts/month',
    ],
  },
  {
    name: 'Founding Member',
    price: '99',
    description:
      'Shape the protocol. Founding members get direct input on template design and feature priorities.',
    features: [
      'Everything in Early Access',
      'Priority feature requests',
      '50 free contracts/month',
      'Name in protocol credits',
    ],
    highlighted: true,
  },
  {
    name: 'Enterprise Preview',
    price: '299',
    description:
      'For teams deploying AI agents at scale. Private onboarding and custom template development.',
    features: [
      'Everything in Founding',
      'Custom template development',
      'Unlimited contracts',
      'Private Slack channel',
      'SLA on support',
    ],
  },
];

const WALLET_ADDRESS = process.env.NEXT_PUBLIC_WALLET_ADDRESS ?? '';


export default function EarlyAccess() {
  return (
    <SectionWrapper>
      <ScrollReveal>
        <div className="text-center mb-10">
          <p className="text-sm font-mono uppercase tracking-widest text-amber mb-2">
            Support the Build
          </p>
          <h2 className="text-3xl font-bold text-text-primary sm:text-4xl">
            Early Access — Pay with USDC on Base
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-text-secondary text-sm">
            Fund protocol development directly. All payments in USDC on Base L2
            — no intermediaries, no platform fees. Early supporters get priority
            access when the contract engine launches.
          </p>
        </div>
      </ScrollReveal>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {tiers.map((tier, i) => (
          <ScrollReveal key={tier.name} delay={i * 0.1}>
            <div
              className={`group relative overflow-hidden rounded-xl border p-6 h-full flex flex-col transition-colors ${
                tier.highlighted
                  ? 'border-amber/40 bg-amber-glow'
                  : 'border-border bg-surface/80 backdrop-blur-sm hover:border-amber/30 hover:bg-amber/5'
              }`}
            >
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              {tier.highlighted && (
                <span className="inline-block self-start text-[10px] font-mono uppercase tracking-widest text-amber bg-amber/10 rounded px-2 py-0.5 mb-3">
                  Most Popular
                </span>
              )}
              <h3 className="text-lg font-semibold text-text-primary">
                {tier.name}
              </h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-amber">
                  ${tier.price}
                </span>
                <span className="text-xs text-text-secondary">USDC</span>
              </div>
              <p className="mt-3 text-sm text-text-secondary leading-relaxed flex-1">
                {tier.description}
              </p>
              <ul className="mt-4 space-y-2">
                {tier.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-sm text-text-secondary"
                  >
                    <svg
                      className="w-4 h-4 text-amber flex-shrink-0 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                <Button
                  href="/activate"
                  variant={tier.highlighted ? 'primary' : 'secondary'}
                  size="md"
                  className="w-full"
                >
                  Get API Key
                </Button>
              </div>
            </div>
          </ScrollReveal>
        ))}
      </div>

      {/* Builder tier activation */}
      <ScrollReveal delay={0.3}>
        <div className="mt-10 rounded-xl border border-amber/20 bg-gradient-to-b from-amber/5 to-transparent backdrop-blur-sm p-6 text-center">
          <p className="text-sm font-semibold text-text-primary mb-1">
            Activate Builder Tier
          </p>
          <p className="text-sm text-text-secondary mb-4">
            Pay with USDC on <span className="font-semibold text-text-primary">Base</span> to unlock 250 contract credits and API access.
          </p>
          <div className="inline-flex items-center gap-3 rounded-lg border border-amber/20 bg-amber-glow px-5 py-3">
            <svg
              className="w-5 h-5 text-amber flex-shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <path d="M2 10h20" />
            </svg>
            <code className="text-sm font-mono text-text-primary select-all">
              {WALLET_ADDRESS}
            </code>
          </div>
          <p className="mt-3 text-xs text-text-secondary">
            Base L2 &middot; USDC &middot; $99 Builder / $299 Enterprise
          </p>
          <p className="mt-2 text-xs text-text-secondary/60">
            After payment, <a href="/activate" className="text-amber hover:underline">activate your API key</a> with
            your transaction hash to start creating contracts.
          </p>
        </div>
      </ScrollReveal>
    </SectionWrapper>
  );
}
