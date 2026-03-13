import SectionWrapper from '@/components/ui/SectionWrapper';
import ScrollReveal from '@/components/ui/ScrollReveal';

const capabilities = [
  {
    icon: '🛡️',
    title: 'Delegation Contracts',
    description:
      'Power of Attorney for AI agents. Companies authorize agents to act within defined limits — spending caps, action scopes, counterparty requirements, and liability terms.',
  },
  {
    icon: '📜',
    title: 'Commerce Contracts',
    description:
      'When agents buy real things or sign real contracts on behalf of companies, Ambr produces dual-format agreements — human-readable for legal teams, machine-parsable for agents.',
  },
  {
    icon: '🔍',
    title: 'Compliance Audit Trail',
    description:
      'Every contract, delegation, and amendment is minted as a cNFT. The Reader Portal lets compliance teams view, verify, audit, and export contracts by hash or NFT ID.',
  },
  {
    icon: '⚖️',
    title: 'Dispute Resolution',
    description:
      'IETF ADP-compliant arbitration built into every contract. When agents exceed mandates or deliverables fall short, automated escalation with on-chain evidence.',
  },
];

export default function CoreCapabilities() {
  return (
    <SectionWrapper>
      <ScrollReveal>
        <div className="text-center mb-10">
          <p className="text-sm font-mono uppercase tracking-widest text-amber mb-2">
            Core Capabilities
          </p>
          <h2 className="text-3xl font-bold text-text-primary sm:text-4xl">
            What Ambr Does
          </h2>
        </div>
      </ScrollReveal>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {capabilities.map((cap, i) => (
          <ScrollReveal key={cap.title} delay={i * 0.1}>
            <div className="group relative overflow-hidden rounded-xl border border-border bg-surface-elevated/80 backdrop-blur-sm p-6 h-full hover:border-amber/30 hover:bg-amber/5 transition-colors">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="text-2xl" role="img" aria-label={cap.title}>
                {cap.icon}
              </span>
              <h3 className="mt-3 text-lg font-semibold text-text-primary">
                {cap.title}
              </h3>
              <p className="mt-2 text-sm text-text-secondary leading-relaxed">
                {cap.description}
              </p>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </SectionWrapper>
  );
}
