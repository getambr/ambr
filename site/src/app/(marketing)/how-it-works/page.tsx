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
      <SectionWrapper>
        <ScrollReveal>
          <div className="text-center max-w-3xl mx-auto">
            <p className="text-sm font-mono uppercase tracking-widest text-amber mb-2">
              How It Works
            </p>
            <h1 className="text-4xl font-bold text-text-primary sm:text-5xl">
              The Legal Framework, Explained
            </h1>
            <p className="mt-4 text-lg text-text-secondary">
              From delegation authority to commerce contracts, mutual signing,
              and privacy-first verification — here&apos;s how Ambr provides the
              legal framework for AI agents acting in the real world.
            </p>
          </div>
        </ScrollReveal>
      </SectionWrapper>

      {/* Five Layer Stack — detailed */}
      <SectionWrapper className="rounded-2xl border border-border/50 bg-surface">
        <ScrollReveal>
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-text-primary mb-2">
              The Five-Layer Stack
            </h2>
            <p className="text-text-secondary max-w-2xl">
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
      <SectionWrapper>
        <ScrollReveal>
          <div className="rounded-xl border border-amber/20 bg-amber-glow p-8 max-w-3xl">
            <h2 className="text-2xl font-bold text-text-primary mb-3">
              Wallet-as-Identity Model
            </h2>
            <p className="text-text-secondary leading-relaxed">
              Every agent operates from a crypto wallet address. When an agent signs
              a contract, the <span className="text-amber font-medium">Principal Declaration</span> links
              that wallet to a real-world legal entity — the company or individual
              who authorized the agent. This creates accountability without
              sacrificing the speed of autonomous agent interactions.
            </p>
          </div>
        </ScrollReveal>
      </SectionWrapper>

      {/* Contract Lifecycle */}
      <SectionWrapper className="rounded-2xl border border-border/50 bg-surface">
        <CnftLifecycle />
      </SectionWrapper>

      {/* Amendment Chain */}
      <SectionWrapper>
        <AmendmentChain />
      </SectionWrapper>

      {/* Contract Demo — expanded */}
      <SectionWrapper className="rounded-2xl border border-border/50 bg-surface">
        <ScrollReveal>
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-text-primary mb-2">
              Dual-Format Contract
            </h2>
            <p className="text-text-secondary max-w-2xl">
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
      <SectionWrapper>
        <ReaderPortal />
      </SectionWrapper>

      {/* Roadmap */}
      <SectionWrapper className="rounded-2xl border border-border/50 bg-surface">
        <ScrollReveal>
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-text-primary mb-2">
              Roadmap
            </h2>
            <p className="text-text-secondary max-w-2xl">
              What&apos;s live and what&apos;s next on the Ambr platform.
            </p>
          </div>

          {/* Live */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-0.5 text-xs font-medium text-emerald-400">
                Live
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-xl border border-border bg-background p-5">
                <h3 className="text-base font-semibold text-violet-400 mb-2">cNFT On-Chain Proof</h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  One NFT per contract on Base L2. SHA-256 hash stored permanently on-chain.
                  Counterparty-gated transfers require approval from both parties.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background p-5">
                <h3 className="text-base font-semibold text-rose-400 mb-2">x402 Payment Rail</h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  Pay-per-contract with USDC, USDbC, DAI, ETH, WETH, cbETH, or cbBTC on Base.
                  No API key needed.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background p-5">
                <h3 className="text-base font-semibold text-cyan-400 mb-2">A2A Protocol</h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  Agent-to-Agent discovery via JSON-RPC. Live at getamber.dev/.well-known/agent.json
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background p-5">
                <h3 className="text-base font-semibold text-amber mb-2">Wallet-Auth Reader Portal</h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  Connect wallet to access contracts you&apos;ve signed, handshaked, or paid for.
                </p>
              </div>
            </div>
          </div>

          {/* Coming Soon */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="rounded-full border border-amber/30 bg-amber-glow px-3 py-0.5 text-xs font-medium text-amber">
                Coming Soon
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-background p-5">
                <h3 className="text-base font-semibold text-emerald-400 mb-2">Qualified Signatures (QES)</h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  Integration with EU Qualified Trust Service Providers for signatures
                  equivalent to handwritten under eIDAS regulation.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background p-5">
                <h3 className="text-base font-semibold text-blue-400 mb-2">Dispute Resolution</h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  Automated Dispute Protocol for filing and resolving contract disputes
                  with cryptographic evidence from the amendment chain.
                </p>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </SectionWrapper>

      {/* CTA */}
      <SectionWrapper>
        <ScrollReveal>
          <div className="text-center">
            <h2 className="text-3xl font-bold text-text-primary">
              Ready to Dive Deeper?
            </h2>
            <p className="mt-4 text-text-secondary max-w-xl mx-auto">
              Explore the developer docs or join the waitlist for early API access.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button href="/developers" size="lg">
                Developer Docs
              </Button>
              <Button href="/waitlist" variant="secondary" size="lg">
                Join the Waitlist
              </Button>
            </div>
          </div>
        </ScrollReveal>
      </SectionWrapper>
    </main>
  );
}
