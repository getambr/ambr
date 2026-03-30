import { Metadata } from 'next';
import { createOgMetadata } from '@/lib/og/create-og-metadata';
import SectionWrapper from '@/components/ui/SectionWrapper';
import ScrollReveal from '@/components/ui/ScrollReveal';
import ApiOverview from '@/components/developers/ApiOverview';
import IntegrationCards from '@/components/developers/IntegrationCards';
import Button from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'Developers | Ambr',
  description:
    'Ambr API — REST, A2A JSON-RPC, and MCP integration for AI agent contract management.',
  ...createOgMetadata({
    title: 'Developers | Ambr',
    description: 'Ambr API — REST, A2A JSON-RPC, and MCP integration for AI agent contract management.',
    path: '/developers',
    label: 'Developers',
    domain: 'getamber.dev',
  }),
};

export default function DevelopersPage() {
  return (
    <main className="pt-20">
      <SectionWrapper>
        <ScrollReveal>
          <div className="text-center max-w-3xl mx-auto mb-12">
            <p className="text-sm font-mono uppercase tracking-widest text-amber mb-2">
              Developers
            </p>
            <h1 className="text-4xl text-text-primary sm:text-5xl">
              Build on Ambr
            </h1>
            <p className="mt-4 text-lg text-text-secondary">
              REST API, A2A JSON-RPC, and MCP integration for AI agent contract management.
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
            <h2 className="text-3xl text-text-primary sm:text-4xl lg:text-5xl">
              Start Building
            </h2>
            <p className="mt-4 text-text-secondary max-w-xl mx-auto">
              Free alpha access — 5 contracts, no payment required.
              Full REST API, A2A discovery, and MCP integration.
            </p>
            <div className="mt-8">
              <Button href="/activate" size="lg">
                Get Free API Key
              </Button>
            </div>
          </div>
        </ScrollReveal>
      </SectionWrapper>
    </main>
  );
}
