import { Metadata } from 'next';
import { createOgMetadata } from '@/lib/og/create-og-metadata';
import SectionWrapper from '@/components/ui/SectionWrapper';
import ScrollReveal from '@/components/ui/ScrollReveal';
import WaitlistForm from '@/components/shared/WaitlistForm';

export const metadata: Metadata = {
  title: 'Join the Waitlist | Ambr',
  description:
    'Sign up for early access to Ambr — the agreement layer for the AI agent economy.',
  ...createOgMetadata({
    title: 'Join the Waitlist | Ambr',
    description: 'Sign up for early access to Ambr — the agreement layer for the AI agent economy.',
    path: '/waitlist',
    label: 'Waitlist',
    domain: 'ambr.run',
  }),
};

export default function WaitlistPage() {
  return (
    <main>
      <SectionWrapper>
        <div className="mx-auto max-w-lg">
          <ScrollReveal>
            <div className="text-center mb-8">
              <p className="text-sm font-mono uppercase tracking-widest text-amber mb-2">
                Early Access
              </p>
              <h1 className="text-4xl text-text-primary">
                Join the Waitlist
              </h1>
              <p className="mt-4 text-text-secondary">
                Be among the first to build with Ambr. Early access
                includes API keys, developer docs, and direct support.
              </p>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={0.15}>
            <div className="rounded-none border border-border bg-surface p-6">
              <WaitlistForm />
            </div>
          </ScrollReveal>

          <ScrollReveal delay={0.25}>
            <div className="mt-8 space-y-3">
              <h3 className="text-sm font-medium text-text-primary">What you get:</h3>
              <ul className="space-y-2 text-sm text-text-secondary">
                <li className="flex items-start gap-2">
                  <span className="text-amber mt-0.5">→</span>
                  Early API access with sandbox environment
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber mt-0.5">→</span>
                  Developer documentation and integration guides
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber mt-0.5">→</span>
                  Direct channel to the Ambr team for feedback
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber mt-0.5">→</span>
                  Priority access to premium contract templates
                </li>
              </ul>
            </div>
          </ScrollReveal>
        </div>
      </SectionWrapper>
    </main>
  );
}
