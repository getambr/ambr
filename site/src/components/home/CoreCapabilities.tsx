import SectionWrapper from '@/components/ui/SectionWrapper';
import ScrollReveal from '@/components/ui/ScrollReveal';
import AmbrCard from '@/components/ui/AmbrCard';

const capabilities = [
  {
    title: 'Authorize',
    description:
      'Define exactly what your agent can do. Spend caps, allowed counterparties, action scopes, time windows. One API call sets the boundaries — your agent cannot cross them.',
    variant: 'dark' as const,
    geoPattern: 'ellipse' as const,
    label: '// STEP.01',
    meta: 'REF: PERMISSION\nAUTH: ACTIVE',
    footer: { left: 'SET.LIMITS', right: '>_ ENFORCE' },
  },
  {
    title: 'Act',
    description:
      'When your agent transacts, Ambr issues an agreement both sides can trust — readable by humans, parsable by other agents. No more handshake-by-prompt-injection.',
    variant: 'light' as const,
    geoPattern: 'circle' as const,
    label: '// STEP.02',
    meta: 'REF: CONTRACT\nFORMAT: cNFT',
    footer: { left: 'MINT.CNFT.0x8F2...', right: '[ IMMUTABLE ]' },
  },
  {
    title: 'Prove',
    description:
      'Every authorized action is recorded on-chain with a cryptographic hash. When something goes wrong — or right — you can prove exactly who decided what, when, and under whose authority.',
    variant: 'dark' as const,
    geoPattern: 'cross' as const,
    label: '// STEP.03',
    meta: 'REF: AUDIT\nSTATE: SYNCED',
    footer: { left: 'VERIFY.SIGNATURE', right: 'ON-CHAIN' },
  },
];

export default function CoreCapabilities() {
  return (
    <SectionWrapper>
      <ScrollReveal>
        <p className="text-micro-dark mb-4">
          How it works
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-8 mb-16 pb-8 border-b border-amber/60">
          <h2 className="text-3xl text-background sm:text-4xl lg:text-5xl">Three steps. One API.</h2>
          <p className="text-[#333] text-lg max-w-xl">Authorize what your agent can do. Let it act inside those rules. Prove every decision afterwards. No legal team required to get started — just an API key.</p>
        </div>
      </ScrollReveal>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {capabilities.map((cap, i) => (
          <ScrollReveal key={cap.title} delay={i * 0.1}>
            <AmbrCard
              className="min-h-[400px]"
              variant={cap.variant}
              geoPattern={cap.geoPattern}
              label={cap.label}
              meta={cap.meta}
              footer={cap.footer}
            >
              <h3 className={`text-2xl font-serif ${cap.variant === 'light' ? 'text-background' : 'text-text-primary'}`}>
                {cap.title}
              </h3>
              <p className={`mt-2 text-sm ${cap.variant === 'light' ? 'text-[#333]' : 'text-[#999]'}`}>
                {cap.description}
              </p>
            </AmbrCard>
          </ScrollReveal>
        ))}
      </div>
    </SectionWrapper>
  );
}
