'use client';

import { motion, useReducedMotion } from 'framer-motion';

type Variant = 'compact' | 'detailed';

interface FiveLayerStackProps {
  variant?: Variant;
  highlightLayer?: number;
}

interface Layer {
  name: string;
  description: string;
  detail: string;
  projects: string[];
  color: string;
  bgColor: string;
  borderColor: string;
}

const layers: Layer[] = [
  {
    name: 'Discovery',
    description: 'Agent discovery & capability exchange',
    detail: 'Agents advertise capabilities via A2A Agent Cards and MCP Server manifests. Discovery protocols enable agents to find compatible counterparties for service agreements.',
    projects: ['A2A Agent Cards', 'MCP'],
    color: 'text-amber',
    bgColor: 'bg-amber-glow',
    borderColor: 'border-amber/60',
  },
  {
    name: 'Agreements',
    description: 'Contract negotiation, signing & management',
    detail: 'Ambr provides the agreement layer — Ricardian Contracts that are both human-readable and machine-parsable, minted as transferable cNFTs with Principal Declarations linking agents to their legal entities.',
    projects: ['Ambr'],
    color: 'text-amber',
    bgColor: 'bg-amber-glow',
    borderColor: 'border-amber/60',
  },
  {
    name: 'Trust',
    description: 'Identity verification & reputation',
    detail: 'ERC-8004 provides on-chain identity and reputation registries. Agents verify counterparty track records before entering agreements, building a web of trust across the agent economy.',
    projects: ['ERC-8004'],
    color: 'text-amber',
    bgColor: 'bg-amber-glow',
    borderColor: 'border-amber/60',
  },
  {
    name: 'Escrow',
    description: 'Conditional payment holding & release',
    detail: 'KAMIYO and x0 Protocol provide escrow services with oracle-verified conditions. Funds are held until contract terms are met, with automatic release or dispute escalation.',
    projects: ['KAMIYO', 'x0 Protocol'],
    color: 'text-amber',
    bgColor: 'bg-amber-glow',
    borderColor: 'border-amber/60',
  },
  {
    name: 'Payments',
    description: 'Micropayments & session billing',
    detail: 'x402 V2 enables HTTP-native micropayments. ACP and AP2 provide agent-to-agent payment coordination. Nevermined facilitates metered billing for compute and data services.',
    projects: ['x402 V2', 'ACP', 'AP2'],
    color: 'text-amber',
    bgColor: 'bg-amber-glow',
    borderColor: 'border-amber/60',
  },
];

export default function FiveLayerStack({ variant = 'compact', highlightLayer = 1 }: FiveLayerStackProps) {
  const prefersReduced = useReducedMotion();
  const isDetailed = variant === 'detailed';

  return (
    <div className="w-full">
      <div className="flex flex-col gap-3">
        {layers.map((layer, i) => {
          const isHighlighted = i === highlightLayer;
          return (
            <motion.div
              key={layer.name}
              initial={prefersReduced ? {} : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: i * 0.08 }}
              className={`rounded-none border p-4 transition-colors ${
                isHighlighted
                  ? 'border-amber/60 bg-amber-glow ring-1 ring-amber/20'
                  : 'border-border bg-surface/80 backdrop-blur-sm hover:bg-surface-elevated/80 hover:border-amber/60'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-xs font-mono uppercase tracking-wider text-amber">
                      Layer {i + 1}
                    </span>
                    <h3 className={`text-base ${isHighlighted ? 'text-amber' : 'text-text-primary'}`}>
                      {layer.name}
                    </h3>
                  </div>
                  <p className="text-sm text-text-secondary">{layer.description}</p>
                  {isDetailed && (
                    <p className="mt-2 text-sm text-text-secondary leading-relaxed">{layer.detail}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 shrink-0">
                  {layer.projects.map((p) => (
                    <span
                      key={p}
                      className="rounded-none border border-amber/60 px-2 py-0.5 text-xs font-medium text-amber"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
