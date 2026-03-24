import HeroSection from '@/components/home/HeroSection';
import CoreCapabilities from '@/components/home/CoreCapabilities';
import ArchitecturePanel from '@/components/home/ArchitecturePanel';
import PricingSection from '@/components/home/PricingSection';
import EcosystemCompatibility from '@/components/home/EcosystemCompatibility';
import HomeCTA from '@/components/home/HomeCTA';
import SectionWrapper from '@/components/ui/SectionWrapper';

export default function Home() {
  return (
    <main>
      <HeroSection />

      {/* Core Capabilities — light section */}
      <div className="section-light relative">
        <div className="grid-bg grid-bg-light" />
        <CoreCapabilities />
      </div>

      {/* Architecture — dark section */}
      <SectionWrapper variant="dark">
        <ArchitecturePanel />
      </SectionWrapper>

      {/* Pricing — dark section */}
      <PricingSection />

      {/* Ecosystem — dark section */}
      <EcosystemCompatibility />

      {/* CTA — dark section */}
      <HomeCTA />
    </main>
  );
}
