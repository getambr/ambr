import SectionWrapper from '@/components/ui/SectionWrapper';
import ScrollReveal from '@/components/ui/ScrollReveal';

const icons = {
  shieldCheck: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  ),
  documentText: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  ),
  magnifyingGlass: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
  ),
  scale: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0 0 12 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 0 1-2.031.352 5.988 5.988 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971Zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 0 1-2.031.352 5.989 5.989 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971Z" />
    </svg>
  ),
};

const capabilities = [
  {
    icon: icons.shieldCheck,
    title: 'Delegation Contracts',
    description:
      'Power of Attorney for AI agents. Companies authorize agents to act within defined limits — spending caps, action scopes, counterparty requirements, and liability terms.',
  },
  {
    icon: icons.documentText,
    title: 'Commerce Contracts',
    description:
      'When agents buy real things or sign real contracts on behalf of companies, Ambr produces dual-format agreements — human-readable for legal teams, machine-parsable for agents.',
  },
  {
    icon: icons.magnifyingGlass,
    title: 'Compliance Audit Trail',
    description:
      'Each contract is minted as a single cNFT with its SHA-256 hash stored permanently on-chain. The Reader Portal lets compliance teams view, verify, audit, and export contracts via wallet-auth or share token.',
  },
  {
    icon: icons.scale,
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
              <span className="text-amber">
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
