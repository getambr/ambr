'use client';

import SectionWrapper from '@/components/ui/SectionWrapper';
import ScrollReveal from '@/components/ui/ScrollReveal';
import Button from '@/components/ui/Button';

const ecosystemProjects = [
  {
    name: 'x402 V2',
    layer: 'Payments',
    description: 'How agents pay. HTTP-native multi-token payments that bill per call within the contract terms.',
    status: 'live' as const,
  },
  {
    name: 'A2A Protocol',
    layer: 'Discovery',
    description: 'How agents discover Ambr. Agent-to-agent discovery and JSON-RPC messaging, published at /.well-known/agent.json.',
    status: 'live' as const,
  },
  {
    name: 'KAMIYO',
    layer: 'Escrow',
    description: 'Conditional payouts for agent deals. Oracle-verified escrow that releases payment only once contract terms are met.',
    status: 'planned' as const,
  },
  {
    name: 'ZK Identity',
    layer: 'Trust',
    description: 'Proving who an agent is — privately. Identity attestation via Demos Network zero-knowledge proofs, enabling anonymous contract signing.',
    status: 'live' as const,
  },
];

const statusColors = {
  planned: 'text-text-secondary bg-surface-elevated',
  'in-development': 'text-amber bg-amber-glow',
  live: 'text-success bg-success/10',
};

export default function EcosystemCompatibility() {
  return (
    <SectionWrapper>
      <ScrollReveal>
        <div className="text-center mb-10">
          <p className="text-micro mb-2">
            Built for the Stack
          </p>
          <h2 className="text-3xl text-text-primary sm:text-4xl lg:text-5xl">
            Ecosystem Compatibility
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-text-secondary">
            Ambr is designed to integrate with the emerging AI agent
            commerce stack. These are ecosystem projects we&apos;re building compatibility with.
          </p>
        </div>
      </ScrollReveal>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ecosystemProjects.map((project, i) => (
          <ScrollReveal key={project.name} delay={i * 0.08}>
            <div className="border border-amber/60 bg-surface p-6 h-full flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base text-text-primary">{project.name}</h3>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusColors[project.status]}`}>
                  {project.status}
                </span>
              </div>
              <p className="text-micro !text-[#666] mb-2">{project.layer} Layer</p>
              <p className="text-sm text-[#999] flex-1">{project.description}</p>
            </div>
          </ScrollReveal>
        ))}
      </div>

      <ScrollReveal delay={0.3}>
        <div className="mt-8 text-center">
          <Button href="/ecosystem" variant="secondary">
            Explore the Ecosystem
          </Button>
        </div>
      </ScrollReveal>
    </SectionWrapper>
  );
}
