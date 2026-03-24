import HeroSection from '@/components/home/HeroSection';
import StackOverview from '@/components/home/StackOverview';
import ContractDemo from '@/components/shared/ContractDemo';
import CoreCapabilities from '@/components/home/CoreCapabilities';
import PricingSection from '@/components/home/PricingSection';
import EcosystemCompatibility from '@/components/home/EcosystemCompatibility';
import HomeCTA from '@/components/home/HomeCTA';
import EarlyAccess from '@/components/home/EarlyAccess';
import SectionWrapper from '@/components/ui/SectionWrapper';
import ScrollReveal from '@/components/ui/ScrollReveal';

export default function Home() {
  return (
    <main>
      <HeroSection />

      {/* Problem Statement — dark */}
      <SectionWrapper>
        <ScrollReveal>
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-micro mb-2">
              The Problem
            </p>
            <h2 className="text-3xl text-text-primary sm:text-4xl lg:text-5xl">
              AI Agents Are Acting. Nobody&apos;s Keeping Track.
            </h2>
            <p className="mt-6 text-text-secondary leading-relaxed">
              AI agents are buying cloud compute, negotiating vendor contracts,
              ordering supplies, and signing service agreements on behalf of
              companies. But there&apos;s no standardized way to authorize them,
              define their limits, or audit what they agreed to. The AI agent
              economy has payments and identity — it doesn&apos;t have a legal
              framework.
            </p>
          </div>
        </ScrollReveal>
      </SectionWrapper>

      <StackOverview />

      <SectionWrapper>
        <ScrollReveal>
          <div className="text-center mb-10">
            <p className="text-micro mb-2">
              Dual-Format Contracts
            </p>
            <h2 className="text-3xl text-text-primary sm:text-4xl lg:text-5xl">
              Human-Readable. Machine-Parsable.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-text-secondary">
              Every Ambr contract exists in two formats — legal text for humans
              and structured JSON for agents — linked by a SHA-256 hash.
            </p>
          </div>
        </ScrollReveal>
        <ScrollReveal delay={0.15}>
          <ContractDemo variant="landing" />
        </ScrollReveal>
      </SectionWrapper>

      {/* CoreCapabilities — light section */}
      <div className="section-light relative">
        <div className="grid-bg grid-bg-light" />
        <CoreCapabilities />
      </div>

      {/* PricingSection — dark */}
      <PricingSection />

      {/* EcosystemCompatibility — dark */}
      <EcosystemCompatibility />

      {/* Target Customers — dark */}
      <SectionWrapper>
        <ScrollReveal>
          <div className="text-center mb-10">
            <p className="text-micro mb-2">
              Who It&apos;s For
            </p>
            <h2 className="text-3xl text-text-primary sm:text-4xl lg:text-5xl">
              Built for Companies Deploying AI Agents
            </h2>
          </div>
        </ScrollReveal>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {[
            {
              title: 'Companies Deploying AI Agents',
              desc: 'Need delegation authority — "My agent agreed to WHAT?" Ambr provides spending limits, authorization scopes, and accountability.',
            },
            {
              title: 'Legal & Compliance Teams',
              desc: 'Need audit trails of what agents agreed to. The Reader Portal lets you view, verify, and export every contract by hash.',
            },
            {
              title: 'E-Commerce Platforms',
              desc: 'Updating terms for AI agent interactions (eBay Jan 2026, Amazon Mar 2026). Ambr provides standardized delegation templates.',
            },
            {
              title: 'Enterprises & Agent Platforms',
              desc: 'Need "Power of Attorney" docs for their agents and on-chain delegation verification before transacting.',
            },
          ].map((item, i) => (
            <ScrollReveal key={item.title} delay={i * 0.1}>
              <div className="group relative overflow-hidden rounded-none border border-amber/60 bg-surface p-6 h-full hover:border-amber/50 transition-colors">
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                {/* Inner frame */}
                <div className="absolute top-4 left-4 right-4 bottom-4 border border-amber/30 pointer-events-none" />
                {/* Corner dots */}
                <div className="absolute top-4 left-4 w-1.5 h-1.5 bg-amber" />
                <div className="absolute top-4 right-4 w-1.5 h-1.5 bg-amber" />
                <div className="absolute bottom-4 left-4 w-1.5 h-1.5 bg-amber" />
                <div className="absolute bottom-4 right-4 w-1.5 h-1.5 bg-amber" />
                <h3 className="text-lg text-text-primary">{item.title}</h3>
                <p className="mt-2 text-sm text-text-secondary leading-relaxed">{item.desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </SectionWrapper>

      {/* EarlyAccess — light section */}
      <div className="section-light relative">
        <div className="grid-bg grid-bg-light" />
        <EarlyAccess />
      </div>

      {/* HomeCTA — dark */}
      <HomeCTA />
    </main>
  );
}
