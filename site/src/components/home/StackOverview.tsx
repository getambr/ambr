import SectionWrapper from '@/components/ui/SectionWrapper';
import ScrollReveal from '@/components/ui/ScrollReveal';
import FiveLayerStack from '@/components/shared/FiveLayerStack';

export default function StackOverview() {
  return (
    <SectionWrapper>
      <ScrollReveal>
        <div className="text-center mb-10">
          <p className="text-sm font-mono uppercase tracking-widest text-amber mb-2">
            Where Ambr Fits
          </p>
          <h2 className="text-3xl font-bold text-text-primary sm:text-4xl">
            The AI Agent Commerce Stack
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-text-secondary">
            Five layers power autonomous agent-to-agent commerce. Ambr
            is the agreement layer — the contracts that bind everything together.
          </p>
        </div>
      </ScrollReveal>
      <ScrollReveal delay={0.15}>
        <FiveLayerStack variant="compact" />
      </ScrollReveal>
    </SectionWrapper>
  );
}
