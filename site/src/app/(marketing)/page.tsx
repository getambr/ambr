import { Metadata } from 'next';
import { createOgMetadata } from '@/lib/og/create-og-metadata';
import HeroSection from '@/components/home/HeroSection';
import CoreCapabilities from '@/components/home/CoreCapabilities';
import ArchitecturePanel from '@/components/home/ArchitecturePanel';
import AgentCardSection from '@/components/home/AgentCardSection';
import PricingSection from '@/components/home/PricingSection';
import EcosystemCompatibility from '@/components/home/EcosystemCompatibility';
import HomeCTA from '@/components/home/HomeCTA';
import SectionWrapper from '@/components/ui/SectionWrapper';

export const metadata: Metadata = {
  title: 'Ambr | The permission layer for AI agents',
  description: 'Set spend limits, authorize actions, and get a cryptographic record of every decision your AI makes.',
  ...createOgMetadata({
    title: 'The permission layer for AI agents',
    description: 'Set spend limits, authorize actions, prove every decision.',
    path: '/',
    label: 'Ambr Protocol',
    domain: 'ambr.run',
  }),
};

export default function Home() {
  return (
    <main>
      <HeroSection />

      {/* Core Capabilities — light section */}
      <div className="section-light relative">
        <div className="grid-bg grid-bg-light" />
        <CoreCapabilities />
      </div>

      {/* Architecture */}
      <SectionWrapper variant="dark">
        <ArchitecturePanel />
      </SectionWrapper>

      {/* Agent Card — A2A discovery */}
      <AgentCardSection />

      {/* Pricing */}
      <PricingSection />

      {/* Ecosystem — with centered orbital geometric background */}
      <div className="relative">
        {/* Orbital arcs centered on this section */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <svg
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            width="1200"
            height="1200"
            viewBox="0 0 800 800"
            style={{ opacity: 0.15 }}
          >
            <defs>
              <linearGradient id="ecoGold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#c6a87c" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#e8d9bb" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#9a7d52" stopOpacity="0.7" />
              </linearGradient>
            </defs>
            {/* Orbital rings */}
            <ellipse cx="400" cy="400" rx="350" ry="180" fill="none" stroke="url(#ecoGold)" strokeWidth="0.8" transform="rotate(12 400 400)" />
            <ellipse cx="400" cy="400" rx="280" ry="140" fill="none" stroke="url(#ecoGold)" strokeWidth="1" transform="rotate(-18 400 400)" />
            <ellipse cx="400" cy="400" rx="200" ry="100" fill="none" stroke="url(#ecoGold)" strokeWidth="0.6" transform="rotate(35 400 400)" />
            {/* Dashed outer ring */}
            <circle cx="400" cy="400" r="380" fill="none" stroke="url(#ecoGold)" strokeWidth="0.4" strokeDasharray="6 6" />
            {/* Inner circles */}
            <circle cx="400" cy="400" r="120" fill="none" stroke="url(#ecoGold)" strokeWidth="0.5" />
            <circle cx="400" cy="400" r="40" fill="none" stroke="url(#ecoGold)" strokeWidth="0.8" />
            {/* Axis lines */}
            <line x1="400" y1="20" x2="400" y2="780" stroke="url(#ecoGold)" strokeWidth="0.3" />
            <line x1="20" y1="400" x2="780" y2="400" stroke="url(#ecoGold)" strokeWidth="0.3" />
            {/* Diagonals */}
            <line x1="120" y1="120" x2="680" y2="680" stroke="url(#ecoGold)" strokeWidth="0.2" />
            <line x1="680" y1="120" x2="120" y2="680" stroke="url(#ecoGold)" strokeWidth="0.2" />
          </svg>
          {/* Vignette — fade to dark at edges */}
          <div className="absolute inset-0" style={{
            background: 'radial-gradient(ellipse 70% 60% at 50% 50%, transparent 30%, #0a0a0a 90%)',
          }} />
        </div>
        <div className="relative z-10">
          <EcosystemCompatibility />
        </div>
      </div>

      {/* CTA */}
      <HomeCTA />
    </main>
  );
}
