import { Metadata } from 'next';
import SectionWrapper from '@/components/ui/SectionWrapper';
import ScrollReveal from '@/components/ui/ScrollReveal';
import UseCaseCard from '@/components/use-cases/UseCaseCard';
import { useCases } from '@/lib/use-cases';

export const metadata: Metadata = {
  title: 'Use Cases | Ambr',
  description:
    'Real-world scenarios: agent delegation authorization, agent-executed procurement, agent-signed service agreements, and compliance audit trails powered by Ambr.',
  openGraph: {
    title: 'Use Cases | Ambr',
    description:
      'Explore real-world delegation and commerce scenarios powered by Ambr Ricardian Contracts.',
    url: 'https://ambr.run/use-cases',
    siteName: 'Ambr',
    type: 'website',
  },
};

export default function UseCasesPage() {
  return (
    <main>
      <SectionWrapper>
        <ScrollReveal>
          <div className="text-center max-w-3xl mx-auto mb-12">
            <p className="text-sm font-mono uppercase tracking-widest text-amber mb-2">
              Use Cases
            </p>
            <h1 className="text-4xl text-text-primary sm:text-5xl">
              Delegation & Commerce in Action
            </h1>
            <p className="mt-4 text-lg text-text-secondary">
              Four scenarios showing how companies use Ambr to authorize
              AI agents, execute commerce contracts, and maintain compliance audit trails.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {useCases.map((uc, i) => (
            <UseCaseCard key={uc.id} useCase={uc} index={i} />
          ))}
        </div>
      </SectionWrapper>
    </main>
  );
}
