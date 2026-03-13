import SectionWrapper from '@/components/ui/SectionWrapper';
import ScrollReveal from '@/components/ui/ScrollReveal';
import Button from '@/components/ui/Button';

export default function HomeCTA() {
  return (
    <SectionWrapper>
      <ScrollReveal>
        <div className="rounded-2xl border border-amber/20 bg-amber-glow p-10 text-center sm:p-14">
          <h2 className="text-3xl font-bold text-text-primary sm:text-4xl">
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
