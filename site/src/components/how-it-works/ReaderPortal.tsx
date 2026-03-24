import ScrollReveal from '@/components/ui/ScrollReveal';

const features = [
  {
    iconPath: 'M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
    title: 'View Contracts',
    description: 'Authorized parties view the full Ricardian Contract in both human-readable and machine-parsable formats. Unauthenticated visitors see metadata only.',
  },
  {
    iconPath: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    title: 'Verify Integrity',
    description: 'Match the document SHA-256 hash against the stored contract to confirm it hasn\'t been tampered with. Hash verification is always public — no account needed.',
  },
  {
    iconPath: 'M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.193-5.12a4.5 4.5 0 00-6.364-6.364L4.455 8.98m5.379 2.435a4.5 4.5 0 006.364 0l4.5-4.5',
    title: 'Follow Amendment Chains',
    description: 'Navigate the full history — original contract, amendments, extensions, and sub-agreements — via parent_contract_hash links.',
  },
  {
    iconPath: 'M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z',
    title: 'Secure Sharing',
    description: 'Contract parties generate time-limited share links for lawyers, auditors, or counterparties. No account required — the link grants read access.',
  },
  {
    iconPath: 'M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3',
    title: 'Wallet Access',
    description: 'Connect your wallet to prove you\'re a party to the contract and unlock full access. Wallet signatures verify your identity without passwords or accounts.',
  },
  {
    iconPath: 'M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5',
    title: 'Handshake Actions',
    description: 'Accept, reject, or request changes to a contract directly from the Reader Portal. Negotiate terms and visibility preferences before signing.',
  },
];

export default function ReaderPortal() {
  return (
    <div>
      <h3 className="text-2xl font-bold text-text-primary mb-2">
        Reader Portal
      </h3>
      <p className="text-text-secondary mb-8 max-w-2xl">
        A private-by-default interface for viewing, verifying, and sharing contracts.
        Full text requires authorization — metadata and hash verification are always public.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {features.map((f, i) => (
          <ScrollReveal key={f.title} delay={i * 0.08}>
            <div className="glass-card rounded-xl p-5 h-full">
              <svg className="w-5 h-5 text-amber" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d={f.iconPath} />
              </svg>
              <h4 className="mt-2 text-base font-semibold text-text-primary">{f.title}</h4>
              <p className="mt-1 text-sm text-text-secondary leading-relaxed">{f.description}</p>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </div>
  );
}
