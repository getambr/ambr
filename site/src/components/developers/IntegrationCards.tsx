import ScrollReveal from '@/components/ui/ScrollReveal';

const integrations = [
  {
    name: 'x402 V2',
    description: 'HTTP-native micropayments on Base L2. Multi-token: USDC, USDbC, DAI, ETH, WETH, cbETH, cbBTC.',
    category: 'Live',
    status: 'live' as const,
  },
  {
    name: 'A2A Agent Card',
    description: 'JSON-RPC discovery at getamber.dev/.well-known/agent.json. Agents find and interact with Ambr automatically.',
    category: 'Live',
    status: 'live' as const,
  },
  {
    name: 'MCP Server',
    description: 'Model Context Protocol integration. Add Ambr to Claude, Cursor, or any MCP-compatible agent.',
    category: 'Live',
    status: 'live' as const,
  },
  {
    name: 'Base L2',
    description: 'cNFT minting, SHA-256 hash storage, and counterparty-gated transfers on Base mainnet.',
    category: 'Live',
    status: 'live' as const,
  },
  {
    name: 'Stripe Payments',
    description: 'Card payments for API key activation. Starter, Builder, and Enterprise tiers.',
    category: 'Live',
    status: 'live' as const,
  },
  {
    name: 'Demos ZK Identity',
    description: 'Zero-knowledge identity verification via Demos Network. Prove entity status without revealing identity.',
    category: 'Planned',
    status: 'planned' as const,
  },
];

export default function IntegrationCards() {
  return (
    <div>
      <p className="text-micro mb-2">Integrations</p>
      <h2 className="text-2xl text-text-primary mb-2 sm:text-3xl lg:text-4xl">Supported Stack</h2>
      <p className="text-text-secondary mb-8 max-w-2xl">
        Production integrations powering Ambr&#39;s contract infrastructure.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {integrations.map((item, i) => (
          <ScrollReveal key={item.name} delay={i * 0.06}>
            <div className="rounded-none border border-amber/60 bg-surface p-5 h-full relative">
              <div className="absolute top-2 left-2 w-1.5 h-1.5 bg-amber" />
              <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-amber" />
              <div className="absolute bottom-2 left-2 w-1.5 h-1.5 bg-amber" />
              <div className="absolute bottom-2 right-2 w-1.5 h-1.5 bg-amber" />
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base text-text-primary font-serif">{item.name}</h3>
                <span className={`text-xs font-mono uppercase tracking-wider px-2 py-0.5 rounded-none border ${
                  item.status === 'live'
                    ? 'text-emerald-400 border-emerald-400/30'
                    : 'text-amber border-amber/30'
                }`}>
                  {item.category}
                </span>
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">{item.description}</p>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </div>
  );
}
