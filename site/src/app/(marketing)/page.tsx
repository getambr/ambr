import { Metadata } from 'next';
import { createOgMetadata } from '@/lib/og/create-og-metadata';
import HeroUnicornCombo from '@/components/home/HeroUnicornCombo';
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
  title: 'Ambr — Agent Mandate & Binding Registry | The liability record for autonomous agents',
  description:
    'An Agent Mandate records who authorized your AI, in what scope, under which law. Readable as prose, executable as code, revocable on record.',
  ...createOgMetadata({
    title: 'Agent Mandate & Binding Registry',
    description: 'The liability record for autonomous agents.',
    path: '/',
    label: 'Ambr',
    domain: 'ambr.run',
  }),
};

export default function Home() {
  return (
    <main id="main-content" style={{ background: '#0a0a0a' }}>
      <SmoothScroll />
      <HeroUnicornCombo />
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
