import ScrollReveal from '@/components/ui/ScrollReveal';

const features = [
  {
    label: '// VIEW',
    title: 'View Contracts',
    description: 'Authorized parties view the full Ricardian Contract in both human-readable and machine-parsable formats. Unauthenticated visitors see metadata only.',
  },
  {
    label: '// VERIFY',
    title: 'Verify Integrity',
    description: 'Match the document SHA-256 hash against the stored contract to confirm it hasn\'t been tampered with. Hash verification is always public — no account needed.',
  },
  {
    label: '// CHAIN',
    title: 'Amendment Chains',
    description: 'Navigate the full history — original contract, amendments, extensions, and sub-agreements — via parent_contract_hash links.',
  },
  {
    label: '// SHARE',
    title: 'Secure Sharing',
    description: 'Generate time-limited share links for lawyers, auditors, or counterparties. No account required — the link grants read access.',
  },
  {
    label: '// WALLET',
    title: 'Wallet Access',
    description: 'Connect your wallet to prove you\'re a party to the contract. Wallet signatures verify identity without passwords or accounts.',
  },
  {
    label: '// HANDSHAKE',
    title: 'Handshake Actions',
    description: 'Accept, reject, or request changes directly from the Reader Portal. Negotiate terms and visibility preferences before signing.',
  },
];

export default function ReaderPortal() {
  return (
    <div>
      <ScrollReveal>
        <div className="mb-12">
          <p className="text-micro mb-2">Interface</p>
          <h3 className="text-3xl text-text-primary lg:text-5xl mb-4">
            Reader Portal
          </h3>
          <p className="text-[#999] max-w-xl">
            A private-by-default interface for viewing, verifying, and sharing contracts.
            Full text requires authorization — metadata and hash verification are always public.
          </p>
        </div>
      </ScrollReveal>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((f, i) => (
          <ScrollReveal key={f.title} delay={i * 0.08}>
            <div className="border border-amber/60 bg-surface p-6 h-full flex flex-col relative">
              <div className="absolute inset-2 border border-amber/20 pointer-events-none" />
              <div className="absolute top-2 left-2 w-1.5 h-1.5 bg-amber" />
              <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-amber" />
              <div className="absolute bottom-2 left-2 w-1.5 h-1.5 bg-amber" />
              <div className="absolute bottom-2 right-2 w-1.5 h-1.5 bg-amber" />
              <span className="text-micro mb-3 relative z-10">{f.label}</span>
              <h4 className="text-base text-text-primary mb-2">{f.title}</h4>
              <p className="text-sm text-[#999] leading-relaxed flex-1">{f.description}</p>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </div>
  );
}
