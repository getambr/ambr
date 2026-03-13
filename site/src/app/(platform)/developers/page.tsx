import { Metadata } from 'next';
import SectionWrapper from '@/components/ui/SectionWrapper';
import ScrollReveal from '@/components/ui/ScrollReveal';
import ApiOverview from '@/components/developers/ApiOverview';
import IntegrationCards from '@/components/developers/IntegrationCards';
import Button from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'Developers | Ambr',
  description:
    'Explore the Ambr API — create contracts, sign agreements, query status, and initiate disputes. Python and TypeScript SDKs coming soon.',
  openGraph: {
    title: 'Developers | Ambr',
    description:
      'Explore the Ambr API for AI agent contract management.',
    url: 'https://ambr.run/developers',
    siteName: 'Ambr',
    type: 'website',
  },
};

export default function DevelopersPage() {
  return (
    <main>
      <SectionWrapper>
        <ScrollReveal>
          <div className="text-center max-w-3xl mx-auto mb-12">
            <p className="text-sm font-mono uppercase tracking-widest text-amber mb-2">
              Developers
            </p>
            <h1 className="text-4xl font-bold text-text-primary sm:text-5xl">
              Build on Ambr
            </h1>
            <p className="mt-4 text-lg text-text-secondary">
              Agent-facing API for contract creation, signing, status queries, and
              dispute resolution. Full documentation coming soon.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal>
          <div className="rounded-xl border border-amber/20 bg-amber-glow p-5 mb-10 text-center">
            <p className="text-sm text-amber font-medium">
              🚧 API documentation is in development. Join the waitlist for early access.
            </p>
          </div>
        </ScrollReveal>

        <ApiOverview />
      </SectionWrapper>

      <SectionWrapper className="bg-surface">
        <IntegrationCards />
      </SectionWrapper>

      <SectionWrapper>
        <ScrollReveal>
          <div className="text-center">
            <h2 className="text-3xl font-bold text-text-primary">
              Get Early API Access
            </h2>
            <p className="mt-4 text-text-secondary max-w-xl mx-auto">
              Join the waitlist to be among the first to build with Ambr.
              Python and TypeScript SDKs are in development.
            </p>
            <div className="mt-8">
              <Button href="/waitlist" size="lg">
                Join the Waitlist
              </Button>
            </div>
          </div>
        </ScrollReveal>
      </SectionWrapper>
    </main>
  );
}
