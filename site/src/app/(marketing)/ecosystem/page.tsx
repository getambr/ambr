import { Metadata } from 'next';
import { createOgMetadata } from '@/lib/og/create-og-metadata';
import SectionWrapper from '@/components/ui/SectionWrapper';
import ScrollReveal from '@/components/ui/ScrollReveal';
import FiveLayerStack from '@/components/shared/FiveLayerStack';
import EcosystemCard from '@/components/ecosystem/EcosystemCard';
import Button from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'Ecosystem | Ambr',
  description:
    'Ambr is built for the AI agent commerce stack — compatible with KAMIYO, Nevermined, ZK Identity, x402 V2, and more.',
  ...createOgMetadata({
    title: 'Ecosystem | Ambr',
    description: 'Ambr is built for the AI agent commerce stack — compatible with KAMIYO, Nevermined, ZK Identity, x402 V2, and more.',
    path: '/ecosystem',
    label: 'Ecosystem',
    domain: 'ambr.run',
  }),
};

const ecosystemProjects = [
  {
    name: 'x402 V2',
    description:
      'Primary payment rail. Ambr functions as an x402 extension — contract hashes embedded in payment metadata. Multi-token support across Base, Solana, ACH, SEPA, and cards.',
    layer: 'Payments',
    status: 'live' as const,
  },
  {
    name: 'A2A Protocol',
    description:
      'Agent-to-Agent discovery and communication via JSON-RPC at getamber.dev/api/a2a, discoverable at /.well-known/agent.json.',
    layer: 'Discovery',
    status: 'live' as const,
  },
  {
    name: 'KAMIYO',
    description:
      'Optional escrow integration for high-value transactions. Oracle-verified quality checks and conditional payment release. Not a dependency — available when escrow is needed.',
    layer: 'Escrow',
    status: 'planned' as const,
  },
  {
    name: 'Nevermined',
    description:
      'Metered billing and session-based payment coordination for compute and data services. Python and TypeScript SDKs for integration with agent frameworks.',
    layer: 'Payments',
    status: 'planned' as const,
  },
  {
    name: 'ZK Identity',
    description:
      'Privacy-preserving identity attestation via Groth16/BN128 zk-SNARKs powered by the Demos Network. Principals prove they are verified entities without revealing which one — on-chain, only a nullifier is visible.',
    layer: 'Trust',
    status: 'live' as const,
    logo: '/demos-logo.svg',
  },
];

export default function EcosystemPage() {
  return (
    <main>
      <SectionWrapper variant="dark">
        <ScrollReveal>
          <div className="text-center max-w-3xl mx-auto mb-12">
            <p className="text-micro mb-2">
              Built for the Stack
            </p>
            <h1 className="text-4xl text-text-primary sm:text-5xl">
              Ecosystem Compatibility
            </h1>
            <p className="mt-4 text-lg text-text-secondary">
              Ambr is the agreement layer — designed to integrate with
              the emerging AI agent commerce stack. These are ecosystem projects
              we&apos;re building compatibility with.
            </p>
          </div>
        </ScrollReveal>
      </SectionWrapper>

      <SectionWrapper variant="light">
        <ScrollReveal>
          <div className="mb-8">
            <p className="text-micro-dark mb-2">Architecture</p>
            <h2 className="text-3xl text-background mb-2 sm:text-4xl lg:text-5xl">
              The Five-Layer Stack
            </h2>
            <p className="text-[#333] max-w-2xl">
              Ambr sits at Layer 2. Each layer in the stack handles a distinct
              concern — from discovery to payments.
            </p>
          </div>
        </ScrollReveal>
        <ScrollReveal delay={0.1}>
          <FiveLayerStack variant="detailed" />
        </ScrollReveal>
      </SectionWrapper>

      <SectionWrapper variant="dark">
        <ScrollReveal>
          <div className="mb-8">
            <p className="text-micro mb-2">Integrations</p>
            <h2 className="text-3xl text-text-primary mb-2 sm:text-4xl lg:text-5xl">
              Ecosystem Projects
            </h2>
            <p className="text-text-secondary max-w-2xl">
              Projects Ambr is designed to work with. Integration status
              reflects current development state.
            </p>
          </div>
        </ScrollReveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {ecosystemProjects.map((project, i) => (
            <EcosystemCard key={project.name} {...project} index={i} />
          ))}
        </div>
      </SectionWrapper>

      <SectionWrapper variant="light">
        <ScrollReveal>
          <div className="border border-amber bg-background p-8 max-w-3xl mx-auto rounded-none">
            <p className="text-micro mb-2">Purpose</p>
            <h2 className="text-3xl text-text-primary mb-3 sm:text-4xl lg:text-5xl">
              Ambr&apos;s Role: The Agreement Layer
            </h2>
            <p className="text-text-secondary leading-relaxed">
              Discovery protocols help agents find each other. Trust registries verify
              identity. Escrow holds funds. Payment rails move money. But none of that
              works without a formal agreement defining the terms. That&apos;s what Ambr
              provides — the Ricardian Contract layer that binds the entire stack together,
              with human-readable terms, machine-parsable structure, and on-chain proof —
              each contract minted as a single NFT on Base L2 with counterparty-gated
              transfers and SHA-256 hash stored permanently on-chain.
            </p>
          </div>
        </ScrollReveal>
      </SectionWrapper>

      <SectionWrapper variant="dark">
        <ScrollReveal>
          <div className="text-center">
            <h2 className="text-3xl text-text-primary sm:text-4xl lg:text-5xl">
              Build With Us
            </h2>
            <p className="mt-4 text-text-secondary max-w-xl mx-auto">
              Interested in integrating with Ambr? Get started or
              explore the developer docs.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button href="/developers" size="lg">
                Developer Docs
              </Button>
              <Button href="/activate" variant="secondary" size="lg">
                Get Started
              </Button>
            </div>
          </div>
        </ScrollReveal>
      </SectionWrapper>
    </main>
  );
}
