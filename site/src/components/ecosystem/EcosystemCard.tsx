import ScrollReveal from '@/components/ui/ScrollReveal';

type Status = 'planned' | 'in-development' | 'live';

interface EcosystemCardProps {
  name: string;
  description: string;
  layer: string;
  status: Status;
  docsUrl?: string;
  index: number;
}

const statusStyles: Record<Status, { label: string; classes: string }> = {
  planned: { label: 'Planned', classes: 'text-text-secondary bg-surface-elevated' },
  'in-development': { label: 'In Development', classes: 'text-amber bg-amber-glow' },
  live: { label: 'Live', classes: 'text-success bg-success/10' },
};

export default function EcosystemCard({ name, description, layer, status, docsUrl, index }: EcosystemCardProps) {
  const s = statusStyles[status];

  return (
    <ScrollReveal delay={index * 0.08}>
      <div className="glass-card rounded-xl p-6 h-full">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-text-primary">{name}</h3>
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${s.classes}`}>
            {s.label}
          </span>
        </div>
        <p className="text-xs font-mono uppercase tracking-wider text-amber mb-2">{layer} Layer</p>
        <p className="text-sm text-text-secondary leading-relaxed">{description}</p>
        {docsUrl && (
          <a
            href={docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-3 text-sm text-amber hover:text-amber-light transition-colors"
          >
            View Docs →
          </a>
        )}
      </div>
    </ScrollReveal>
  );
}
