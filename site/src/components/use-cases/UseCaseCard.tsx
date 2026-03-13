import ScrollReveal from '@/components/ui/ScrollReveal';
import Button from '@/components/ui/Button';
import type { UseCase } from '@/lib/use-cases';

interface UseCaseCardProps {
  useCase: UseCase;
  index: number;
}

export default function UseCaseCard({ useCase, index }: UseCaseCardProps) {
  return (
    <ScrollReveal delay={index * 0.1}>
      <div className="rounded-xl border border-border bg-surface p-6 hover:border-amber/20 transition-colors">
        <h3 className="text-xl font-bold text-text-primary mb-3">
          {useCase.title}
        </h3>

        <p className="text-sm text-text-secondary leading-relaxed mb-4">
          {useCase.scenario}
        </p>

        <div className="space-y-3 mb-5">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-amber mb-1">Parties</p>
            <div className="flex flex-wrap gap-2">
              {useCase.parties.map((p) => (
                <span key={p} className="rounded-md bg-surface-elevated px-2 py-0.5 text-xs text-text-primary">
                  {p}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-amber mb-1">Contract Terms</p>
            <p className="text-sm text-text-secondary">{useCase.contractTerms}</p>
          </div>

          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-amber mb-1">Outcome</p>
            <p className="text-sm text-text-secondary">{useCase.outcome}</p>
          </div>
        </div>

        <div className="border-t border-border pt-4 space-y-2">
          <p className="text-xs font-mono uppercase tracking-wider text-text-secondary mb-2">Integrations</p>
          <div className="space-y-1.5">
            <p className="text-xs text-text-secondary">
              <span className="text-rose-400 font-medium">Payments:</span> {useCase.integrations.payments}
            </p>
            <p className="text-xs text-text-secondary">
              <span className="text-cyan-400 font-medium">Reputation:</span> {useCase.integrations.reputation}
            </p>
            <p className="text-xs text-text-secondary">
              <span className="text-amber font-medium">Contract:</span> {useCase.integrations.contract}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <Button href="/waitlist" variant="secondary" size="sm">
            Build This Use Case
          </Button>
        </div>
      </div>
    </ScrollReveal>
  );
}
