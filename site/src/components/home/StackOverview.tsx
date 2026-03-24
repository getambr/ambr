import SectionWrapper from '@/components/ui/SectionWrapper';
import ScrollReveal from '@/components/ui/ScrollReveal';
import FiveLayerStack from '@/components/shared/FiveLayerStack';

export default function StackOverview() {
  return (
    <SectionWrapper className="relative overflow-hidden">
      {/* Decorative geometric lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
        <line x1="0" y1="0" x2="100%" y2="100%" stroke="currentColor" strokeWidth="0.5" className="text-amber" />
        <line x1="100%" y1="0" x2="0" y2="100%" stroke="currentColor" strokeWidth="0.5" className="text-amber" />
        <line x1="50%" y1="0" x2="50%" y2="100%" stroke="currentColor" strokeWidth="0.5" className="text-amber" strokeDasharray="8 16" />
        <circle cx="50%" cy="50%" r="120" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-amber" />
        <circle cx="50%" cy="50%" r="200" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-amber" strokeDasharray="4 12" />
      </svg>
      {/* Corner ornaments */}
      <div className="absolute top-6 left-6 w-8 h-8 border-t border-l border-amber/20 pointer-events-none" />
      <div className="absolute top-6 right-6 w-8 h-8 border-t border-r border-amber/20 pointer-events-none" />
      <div className="absolute bottom-6 left-6 w-8 h-8 border-b border-l border-amber/20 pointer-events-none" />
      <div className="absolute bottom-6 right-6 w-8 h-8 border-b border-r border-amber/20 pointer-events-none" />

      <ScrollReveal>
        <div className="text-center mb-10">
          <p className="text-sm font-mono uppercase tracking-widest text-amber mb-2">
            Where Ambr Fits
          </p>
          <h2 className="text-3xl text-text-primary sm:text-4xl">
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
