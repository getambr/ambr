import { Metadata } from 'next';
import { createOgMetadata } from '@/lib/og/create-og-metadata';
import HeroTeardown from '@/components/home/HeroTeardown';
import MandateFlow from '@/components/home/MandateFlow';
import MandateChat from '@/components/home/MandateChat';
import MandateDemo from '@/components/home/MandateDemo';
import MandateSteps from '@/components/home/MandateSteps';
import MandateDual from '@/components/home/MandateDual';
import MandatePricing from '@/components/home/MandatePricing';
import AgentCardSection from '@/components/home/AgentCardSection';
import MandateEcosystem from '@/components/home/MandateEcosystem';
import MandateClose from '@/components/home/MandateClose';
import SmoothScroll from '@/components/ui/SmoothScroll';

export const metadata: Metadata = {
  title: 'Ambr | The signed record of what an AI agent may do',
  description:
    'Ambr records who let your AI act, within which limits, under which law. Readable by people and by code, revocable at any time.',
  ...createOgMetadata({
    title: 'Agent authority, on record',
    description: 'The signed record of what an AI agent may do.',
    path: '/',
    label: 'Ambr',
    domain: 'ambr.run',
  }),
};

export default function Home() {
  return (
    <main id="main-content" style={{ background: '#0a0a0a' }}>
      <SmoothScroll />
      <HeroTeardown />
      <MandateFlow />
      <MandateChat />
      <MandateDemo />
      <MandateSteps />
      <MandateDual />
      <MandatePricing />
      <AgentCardSection />
      <MandateEcosystem />
      <MandateClose />
    </main>
  );
}
