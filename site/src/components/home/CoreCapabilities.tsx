import SectionWrapper from '@/components/ui/SectionWrapper';
import ScrollReveal from '@/components/ui/ScrollReveal';
import AmbrCard from '@/components/ui/AmbrCard';

const capabilities = [
  {
    title: 'Delegation Contracts',
    description:
      'Power of Attorney for AI agents. Companies authorize agents to act within defined limits — spending caps, action scopes, counterparty requirements, and liability terms.',
    variant: 'dark' as const,
    geoPattern: 'ellipse' as const,
    label: '// COMP.01',
    meta: 'REF: DELEGATION\nAUTH: ACTIVE',
    footer: { left: 'REQ.AGENT.PARSE', right: '>_ EXECUTE' },
  },
  {
    title: 'Commerce Contracts',
    description:
      'When agents buy real things or sign real contracts on behalf of companies, Ambr produces dual-format agreements — human-readable for legal teams, machine-parsable for agents.',
    variant: 'light' as const,
    geoPattern: 'circle' as const,
    label: '// COMP.02',
    meta: 'REF: RICARDIAN\nFORMAT: cNFT',
    footer: { left: 'MINT.CNFT.0x8F2...', right: '[ IMMUTABLE ]' },
  },
  {
    title: 'Compliance Audit Trail',
    description:
      'Each contract is minted as a single cNFT with its SHA-256 hash stored permanently on-chain. The Reader Portal lets compliance teams view, verify, audit, and export contracts via wallet-auth or share token.',
    variant: 'dark' as const,
    geoPattern: 'cross' as const,
    label: '// COMP.03',
    meta: 'REF: AUDIT\nSTATE: SYNCED',
    footer: { left: 'VERIFY.SIGNATURE', right: 'SEC. 4.1(B)' },
  },
  {
    title: 'Dispute Resolution',
    description:
      'IETF ADP-compliant arbitration built into every contract. When agents exceed mandates or deliverables fall short, automated escalation with on-chain evidence.',
    variant: 'dark' as const,
    geoPattern: 'circle' as const,
    label: '// COMP.04',
    meta: 'REF: DISPUTE\nSTATE: ACTIVE',
    footer: { left: 'ARBITRATION.IETF', right: 'ADP.1' },
  },
];

export default function CoreCapabilities() {
  return (
    <SectionWrapper>
      <ScrollReveal>
        <p className="text-micro-dark mb-4">
          Core Capabilities
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-8 mb-16 pb-8 border-b border-amber/60">
          <h2 className="text-3xl text-background sm:text-4xl lg:text-5xl">What Ambr Does</h2>
          <p className="text-[#333] text-lg max-w-xl">Power of Attorney for AI agents. Dual-format commerce contracts. Cryptographic audit trails. Everything agents need to transact in the real world with legal clarity.</p>
        </div>
      </ScrollReveal>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {capabilities.map((cap, i) => (
          <ScrollReveal key={cap.title} delay={i * 0.1}>
            <AmbrCard
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
