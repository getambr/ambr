import { Metadata } from 'next';
import SectionWrapper from '@/components/ui/SectionWrapper';
import ScrollReveal from '@/components/ui/ScrollReveal';
import FiveLayerStack from '@/components/shared/FiveLayerStack';
import ContractDemo from '@/components/shared/ContractDemo';
import CnftLifecycle from '@/components/how-it-works/CnftLifecycle';
import AmendmentChain from '@/components/how-it-works/AmendmentChain';
import ReaderPortal from '@/components/how-it-works/ReaderPortal';
import Button from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'How It Works | Ambr',
  description:
    'Learn how Ambr provides delegation authority, commerce contracts, and compliance audit trails for AI agents acting in the real world.',
  openGraph: {
    title: 'How It Works | Ambr',
    description:
      'Learn how Ambr provides the legal framework for AI agents — delegation contracts, commerce agreements, and cryptographic audit trails.',
    url: 'https://ambr.run/how-it-works',
    siteName: 'Ambr',
    type: 'website',
  },
};

export default function HowItWorksPage() {
  return (
    <main>
      {/* Hero */}
      <SectionWrapper variant="dark">
        <ScrollReveal>
          <div className="text-center max-w-3xl mx-auto">
            <p className="text-micro mb-4">How It Works</p>
            <h1 className="text-4xl text-text-primary sm:text-5xl lg:text-6xl">
              The Legal Framework, Explained
            </h1>
            <p className="mt-6 text-lg text-[#aaa] font-light">
              From delegation authority to commerce contracts, mutual signing,
              and privacy-first verification — here&apos;s how Ambr provides the
              legal framework for AI agents acting in the real world.
            </p>
          </div>
        </ScrollReveal>
      </SectionWrapper>

      {/* Five Layer Stack */}
      <SectionWrapper variant="dark">
        <ScrollReveal>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-8 mb-12 pb-8 border-b border-amber/60">
            <div>
              <p className="text-micro mb-2">Architecture</p>
              <h2 className="text-3xl text-text-primary lg:text-5xl">
                The Five-Layer Stack
              </h2>
            </div>
            <p className="text-[#999] text-lg max-w-xl self-end">
              Ambr sits at Layer 2 — the agreement layer that connects agent
              discovery with trust, escrow, and payments.
            </p>
          </div>
        </ScrollReveal>
        <ScrollReveal delay={0.1}>
          <FiveLayerStack variant="detailed" />
        </ScrollReveal>
      </SectionWrapper>

      {/* Wallet-as-Identity */}
      <SectionWrapper variant="dark">
        <ScrollReveal>
          <div className="relative border border-amber/60 bg-surface p-8 max-w-3xl">
            <div className="absolute top-4 left-4 right-4 bottom-4 border border-amber/30 pointer-events-none" />
            <div className="absolute top-4 left-4 w-1.5 h-1.5 bg-amber" />
            <div className="absolute top-4 right-4 w-1.5 h-1.5 bg-amber" />
            <div className="absolute bottom-4 left-4 w-1.5 h-1.5 bg-amber" />
            <div className="absolute bottom-4 right-4 w-1.5 h-1.5 bg-amber" />
            <div className="relative z-10">
              <p className="text-micro mb-2">Identity</p>
              <h2 className="text-2xl text-text-primary mb-3 lg:text-4xl">
                Wallet-as-Identity Model
              </h2>
              <p className="text-[#999] leading-relaxed">
                Every agent operates from a crypto wallet address. When an agent signs
                a contract, the <span className="text-amber">Principal Declaration</span> links
                that wallet to a real-world legal entity — the company or individual
                who authorized the agent. This creates accountability without
                sacrificing the speed of autonomous agent interactions.
              </p>
            </div>
          </div>
        </ScrollReveal>
      </SectionWrapper>

      {/* Contract Lifecycle — light section break */}
      <SectionWrapper variant="light">
        <CnftLifecycle />
      </SectionWrapper>

      {/* Amendment Chain */}
      <SectionWrapper variant="dark">
        <AmendmentChain />
      </SectionWrapper>

      {/* Contract Demo */}
      <SectionWrapper variant="dark">
        <ScrollReveal>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-8 mb-12 pb-8 border-b border-amber/60">
            <div>
              <p className="text-micro mb-2">Format</p>
              <h2 className="text-3xl text-text-primary lg:text-5xl">
                Dual-Format Contract
              </h2>
            </div>
            <p className="text-[#999] text-lg max-w-xl self-end">
              Every Ambr contract exists as both human-readable legal text and
              machine-parsable JSON, linked by a SHA-256 hash.
            </p>
          </div>
        </ScrollReveal>
        <ScrollReveal delay={0.1}>
          <ContractDemo variant="how-it-works" />
        </ScrollReveal>
      </SectionWrapper>

      {/* Reader Portal */}
      <SectionWrapper variant="dark">
        <ReaderPortal />
      </SectionWrapper>

      {/* CTA */}
      <SectionWrapper variant="dark">
        <ScrollReveal>
          <div className="text-center">
            <h2 className="text-3xl text-text-primary lg:text-5xl">
              Ready to Dive Deeper?
            </h2>
            <p className="mt-4 text-[#999] max-w-xl mx-auto">
              Explore the developer documentation or initialize your first contract.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button href="/activate" size="lg">
                Initialize Contract
              </Button>
              <Button href="/developers" variant="secondary" size="lg">
                Read Documentation
              </Button>
            </div>
          </div>
        </ScrollReveal>
      </SectionWrapper>
    </main>
  );
}
