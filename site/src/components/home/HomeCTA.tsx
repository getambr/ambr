import SectionWrapper from '@/components/ui/SectionWrapper';
import ScrollReveal from '@/components/ui/ScrollReveal';
import Button from '@/components/ui/Button';

export default function HomeCTA() {
  return (
    <SectionWrapper>
      <ScrollReveal>
        <div className="relative rounded-none border border-amber/60 bg-amber-glow p-10 text-center sm:p-14 overflow-hidden">
          {/* Geometric background motif */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.07]" xmlns="http://www.w3.org/2000/svg">
            <circle cx="15%" cy="30%" r="80" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-amber" />
            <circle cx="85%" cy="70%" r="60" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-amber" />
            <circle cx="50%" cy="50%" r="160" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-amber" strokeDasharray="4 8" />
            <line x1="10%" y1="50%" x2="90%" y2="50%" stroke="currentColor" strokeWidth="0.5" className="text-amber" strokeDasharray="2 12" />
            <line x1="50%" y1="10%" x2="50%" y2="90%" stroke="currentColor" strokeWidth="0.5" className="text-amber" strokeDasharray="2 12" />
          </svg>
          {/* Crosshair markers */}
          <div className="absolute top-6 left-6 pointer-events-none">
            <div className="w-4 h-px bg-amber/30" />
            <div className="w-px h-4 bg-amber/30 -mt-2 ml-[7.5px]" />
          </div>
          <div className="absolute top-6 right-6 pointer-events-none">
            <div className="w-4 h-px bg-amber/30" />
            <div className="w-px h-4 bg-amber/30 -mt-2 ml-[7.5px]" />
          </div>
          <div className="absolute bottom-6 left-6 pointer-events-none">
            <div className="w-4 h-px bg-amber/30" />
            <div className="w-px h-4 bg-amber/30 -mt-2 ml-[7.5px]" />
          </div>
          <div className="absolute bottom-6 right-6 pointer-events-none">
            <div className="w-4 h-px bg-amber/30" />
            <div className="w-px h-4 bg-amber/30 -mt-2 ml-[7.5px]" />
          </div>
          <h2 className="relative text-3xl text-text-primary sm:text-4xl lg:text-5xl">
            Ready to Build on Ambr?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-text-secondary">
            Join the waitlist for early access to the legal framework for AI
            agents acting in the real world — delegation authority, commerce
            contracts, and compliance audit trails.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button href="/waitlist" size="lg">
              Join the Waitlist
            </Button>
            <Button href="/developers" variant="secondary" size="lg">
              Developer Docs
            </Button>
          </div>
        </div>
      </ScrollReveal>
    </SectionWrapper>
  );
}
