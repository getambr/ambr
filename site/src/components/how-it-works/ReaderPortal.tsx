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
    title: 'Follow Amendment Chains',
    description: 'Navigate the full history — original contract, amendments, extensions, and sub-agreements — via parent_contract_hash links.',
  },
  {
    label: '// SHARE',
    title: 'Secure Sharing',
    description: 'Contract parties generate time-limited share links for lawyers, auditors, or counterparties. No account required — the link grants read access.',
  },
  {
    label: '// WALLET',
    title: 'Wallet Access',
    description: 'Connect your wallet to prove you\'re a party to the contract and unlock full access. Wallet signatures verify your identity without passwords or accounts.',
  },
  {
    label: '// HANDSHAKE',
    title: 'Handshake Actions',
    description: 'Accept, reject, or request changes to a contract directly from the Reader Portal. Negotiate terms and visibility preferences before signing.',
  },
];

export default function ReaderPortal() {
  return (
    <div>
      <p className="text-micro mb-2">Interface</p>
      <h3 className="text-2xl text-text-primary mb-2 lg:text-4xl">
        Reader Portal
      </h3>
      <p className="text-[#999] mb-8 max-w-2xl">
        A private-by-default interface for viewing, verifying, and sharing contracts.
        Full text requires authorization — metadata and hash verification are always public.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((f, i) => (
          <ScrollReveal key={f.title} delay={i * 0.08}>
            <div className="relative border border-amber/60 bg-surface p-6 h-full">
              {/* Inner frame */}
              <div className="absolute top-3 left-3 right-3 bottom-3 border border-amber/30 pointer-events-none" />
              {/* Corner dots */}
              <div className="absolute top-3 left-3 w-1.5 h-1.5 bg-amber" />
              <div className="absolute top-3 right-3 w-1.5 h-1.5 bg-amber" />
              <div className="absolute bottom-3 left-3 w-1.5 h-1.5 bg-amber" />
              <div className="absolute bottom-3 right-3 w-1.5 h-1.5 bg-amber" />

              <div className="relative z-10">
                <span className="text-micro">{f.label}</span>
                <h4 className="mt-3 text-base text-text-primary">{f.title}</h4>
                <p className="mt-2 text-sm text-[#999] leading-relaxed">{f.description}</p>
              </div>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </div>
  );
}
