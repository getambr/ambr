import ScrollReveal from '@/components/ui/ScrollReveal';

const integrations = [
  {
    name: 'x402 V2 Protocol',
    description: 'HTTP-native micropayments. Per-call billing within contract terms on Base and Solana.',
    category: 'Payments',
    color: 'text-rose-400',
  },
  {
    name: 'ERC-8004 Standard',
    description: 'On-chain identity and reputation registries for agent verification before contract signing.',
    category: 'Trust',
    color: 'text-cyan-400',
  },
  {
    name: 'IPFS Storage',
    description: 'Decentralized storage for contract documents. Content-addressed for tamper-proof retrieval.',
    category: 'Storage',
    color: 'text-violet-400',
  },
  {
    name: 'Base / Solana L2',
    description: 'cNFT minting and on-chain contract hashes on low-cost L2 networks.',
    category: 'Chain',
    color: 'text-blue-400',
  },
  {
    name: 'MCP Server',
    description: 'Model Context Protocol server manifest for agent capability discovery and tool registration.',
    category: 'Discovery',
    color: 'text-violet-400',
  },
  {
    name: 'A2A Agent Card',
    description: 'Standardized agent capability cards for peer discovery in the A2A commerce stack.',
    category: 'Discovery',
    color: 'text-violet-400',
  },
  {
    name: 'Nevermined SDK',
    description: 'Python and TypeScript SDKs for metered billing, session-based payments, and data access control.',
    category: 'Payments',
    color: 'text-rose-400',
  },
];

export default function IntegrationCards() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-text-primary mb-2">Supported Integrations</h2>
      <p className="text-text-secondary mb-6 max-w-2xl">
        Ambr is designed to work with the emerging AI agent commerce stack.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {integrations.map((item, i) => (
          <ScrollReveal key={item.name} delay={i * 0.06}>
            <div className="rounded-xl border border-border bg-surface p-5 h-full hover:border-amber/20 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs font-mono uppercase tracking-wider ${item.color}`}>
                  {item.category}
                </span>
              </div>
              <h3 className="text-base font-semibold text-text-primary">{item.name}</h3>
              <p className="mt-1 text-sm text-text-secondary leading-relaxed">{item.description}</p>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </div>
  );
}
