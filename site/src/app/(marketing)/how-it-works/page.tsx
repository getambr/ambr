import { Metadata } from 'next';
import { createOgMetadata } from '@/lib/og/create-og-metadata';
import SectionWrapper from '@/components/ui/SectionWrapper';
import ScrollReveal from '@/components/ui/ScrollReveal';
import ArchitecturePanel from '@/components/home/ArchitecturePanel';
import CnftLifecycle from '@/components/how-it-works/CnftLifecycle';
import ReaderPortal from '@/components/how-it-works/ReaderPortal';
import AmendmentChain from '@/components/how-it-works/AmendmentChain';
import Button from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'How It Works | Ambr',
  description:
    'Learn how Ambr provides delegation authority, commerce contracts, and compliance audit trails for AI agents acting in the real world.',
  ...createOgMetadata({
    title: 'How It Works | Ambr',
    description: 'Learn how Ambr provides delegation authority, commerce contracts, and compliance audit trails for AI agents acting in the real world.',
    path: '/how-it-works',
    label: 'How It Works',
    domain: 'ambr.run',
  }),
};

export default function HowItWorksPage() {
  return (
    <main>
      {/* Hero */}
      <SectionWrapper variant="dark">
        <ScrollReveal>
          <div className="max-w-3xl">
            <p className="text-micro mb-4">How It Works</p>
            <h1 className="text-4xl text-text-primary sm:text-5xl lg:text-6xl mb-6">
              The Legal Framework,<br />Explained
            </h1>
            <p className="text-lg text-[#999] font-light max-w-xl leading-relaxed">
              Every Ambr contract exists simultaneously as human-readable legal prose
              and machine-parsable JSON — linked by SHA-256 hash, signed by ECDSA wallets,
              minted as cNFTs on Base L2.
            </p>
            <p className="text-amber font-mono text-sm mt-6 tracking-wide">
              Code is law. Law is Readable.
            </p>
          </div>
        </ScrollReveal>
      </SectionWrapper>

      {/* Dual-Format Architecture */}
      <SectionWrapper variant="dark">
        <ScrollReveal>
          <div className="mb-12">
            <p className="text-micro mb-2">Architecture</p>
            <h2 className="text-3xl text-text-primary lg:text-5xl">
              The Dual-State Contract
            </h2>
          </div>
        </ScrollReveal>
        <ArchitecturePanel />
      </SectionWrapper>

      {/* Contract Lifecycle — light section */}
      <SectionWrapper variant="light">
        <CnftLifecycle />
      </SectionWrapper>

      {/* Reader Portal */}
      <SectionWrapper variant="dark">
        <ReaderPortal />
      </SectionWrapper>

      {/* Amendment Chains */}
      <SectionWrapper variant="dark">
        <ScrollReveal>
          <p className="text-micro mb-4">Evolution</p>
          <h2 className="text-3xl text-text-primary mb-4 sm:text-4xl lg:text-5xl">Amendment Chains</h2>
          <p className="text-text-secondary mb-8 max-w-2xl">
            Contracts evolve. Amendments reference the original via parent hash,
            creating an immutable chain with full audit trail.
          </p>
        </ScrollReveal>
        <ScrollReveal delay={0.1}>
          <AmendmentChain />
        </ScrollReveal>
      </SectionWrapper>

      {/* CTA */}
      <SectionWrapper variant="dark">
        <ScrollReveal>
          <div className="relative border border-amber/60 bg-surface p-12 text-center max-w-3xl mx-auto">
            <div className="absolute top-4 left-4 right-4 bottom-4 border border-amber/30 pointer-events-none" />
            <div className="absolute top-4 left-4 w-1.5 h-1.5 bg-amber" />
            <div className="absolute top-4 right-4 w-1.5 h-1.5 bg-amber" />
            <div className="absolute bottom-4 left-4 w-1.5 h-1.5 bg-amber" />
            <div className="absolute bottom-4 right-4 w-1.5 h-1.5 bg-amber" />
            <div className="relative z-10">
              <h2 className="text-3xl text-text-primary lg:text-4xl mb-4">
                Ready to Build?
              </h2>
              <p className="text-[#999] max-w-md mx-auto mb-8">
                Initialize your first contract or explore the developer documentation
                and MCP integration guides.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button href="/activate" size="lg">
                  Initialize Contract
                </Button>
                <Button href="/developers" variant="secondary" size="lg">
                  Read Documentation
                </Button>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </SectionWrapper>
    </main>
  );
}
