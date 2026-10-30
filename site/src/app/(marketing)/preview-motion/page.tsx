import { Metadata } from 'next';
import HeroAwwwards from '@/components/home/HeroAwwwards';
import TokenMarquee from '@/components/home/TokenMarquee';
import SmoothScroll from '@/components/ui/SmoothScroll';
import CoreCapabilities from '@/components/home/CoreCapabilities';
import ArchitecturePanel from '@/components/home/ArchitecturePanel';
import AgentCardSection from '@/components/home/AgentCardSection';
import PricingSection from '@/components/home/PricingSection';
import EcosystemCompatibility from '@/components/home/EcosystemCompatibility';
import HomeCTA from '@/components/home/HomeCTA';
import SectionWrapper from '@/components/ui/SectionWrapper';

export const metadata: Metadata = {
  title: 'Ambr — motion preview',
  robots: { index: false, follow: false },
};

export default function PreviewMotion() {
  return (
    <main>
      <SmoothScroll />
      <HeroAwwwards />
      <TokenMarquee />

      <div className="section-light relative">
        <div className="grid-bg grid-bg-light" />
        <CoreCapabilities />
      </div>

      <SectionWrapper variant="dark">
        <ArchitecturePanel />
      </SectionWrapper>

      <AgentCardSection />

      <PricingSection />

      <div className="relative">
        <EcosystemCompatibility />
      </div>

      <HomeCTA />
    </main>
  );
}
