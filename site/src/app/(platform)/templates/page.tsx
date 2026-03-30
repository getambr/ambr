import { Metadata } from 'next';
import { createOgMetadata } from '@/lib/og/create-og-metadata';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';

export const metadata: Metadata = {
  title: 'Templates | Ambr',
  description:
    'Ricardian Contract templates for AI agent delegation, commerce, and authorization.',
  ...createOgMetadata({
    title: 'Templates | Ambr',
    description: 'Ricardian Contract templates for AI agent delegation, commerce, and authorization.',
    path: '/templates',
    label: 'Templates',
    domain: 'getamber.dev',
  }),
};

export const dynamic = 'force-dynamic';

interface Template {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  parameter_schema: {
    required?: string[];
    properties?: Record<string, { type: string; description?: string }>;
  };
  price_cents: number;
  version: number;
}

async function getTemplates(): Promise<Template[]> {
  const db = getSupabase();
  const { data } = await db
    .from('templates')
    .select('*')
    .eq('is_active', true)
    .order('category', { ascending: true });
  return (data as Template[]) || [];
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-md font-mono capitalize ${
      category === 'delegation'
        ? 'text-amber-light border border-amber/20 bg-amber/5'
        : 'text-text-secondary border border-border bg-surface'
    }`}>
      {category}
    </span>
  );
}

export default async function TemplatesPage() {
  const templates = await getTemplates();

  const delegationTemplates = templates.filter((t) => t.category === 'delegation');
  const commerceTemplates = templates.filter((t) => t.category === 'commerce');

  return (
    <main className="pt-20 min-h-screen relative overflow-hidden">
      {/* Aurora background */}
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 60% 50% at 20% 30%, rgba(245,166,35,0.06) 0%, transparent 70%),
              radial-gradient(ellipse 50% 60% at 80% 70%, rgba(196,127,10,0.04) 0%, transparent 70%)
            `,
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <p className="text-sm font-mono uppercase tracking-widest text-amber mb-2">
          Contract Templates
        </p>
        <h1 className="text-3xl font-bold text-text-primary sm:text-4xl mb-3">
          Ricardian Contract Templates
        </h1>
        <p className="text-text-secondary text-sm mb-3 max-w-2xl">
          Each template generates a dual-format Ricardian Contract — human-readable legal text
          and machine-parsable JSON, linked by a SHA-256 hash. Choose a template, provide parameters
          via the API, and receive a verified contract.
        </p>
        <p className="text-xs text-text-secondary/50 mb-12 max-w-2xl">
          Templates are structured frameworks for contract generation, not legal advice.
          Review generated contracts with qualified counsel before use.
        </p>

        {/* Delegation Templates */}
        {delegationTemplates.length > 0 && (
          <section className="mb-12">
            <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-3">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber to-amber-light">
                Delegation
              </span>
              <span className="text-xs text-text-secondary font-normal">
                — Authority & agent authorization contracts
              </span>
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {delegationTemplates.map((template) => (
                <TemplateCard key={template.id} template={template} />
              ))}
            </div>
          </section>
        )}

        {/* Commerce Templates */}
        {commerceTemplates.length > 0 && (
          <section className="mb-12">
            <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-3">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber to-amber-light">
                Commerce
              </span>
              <span className="text-xs text-text-secondary font-normal">
                — Purchase, service, and trade agreements
              </span>
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {commerceTemplates.map((template) => (
                <TemplateCard key={template.id} template={template} />
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {templates.length === 0 && (
          <div className="text-center py-16">
            <p className="text-text-secondary text-sm">No templates available yet.</p>
            <p className="text-text-secondary/60 text-xs mt-1">
              Templates are being reviewed and will be available soon.
            </p>
          </div>
        )}

        {/* API integration CTA */}
        <div className="mt-8 rounded-xl border border-border bg-surface/80 backdrop-blur-sm p-8 text-center">
          <h3 className="text-lg font-semibold text-text-primary mb-2">
            Ready to generate contracts?
          </h3>
          <p className="text-sm text-text-secondary mb-6 max-w-lg mx-auto">
            Use the Ambr API to create contracts programmatically. Pass your template slug
            and parameters to <code className="font-mono text-amber text-xs">POST /api/v1/contracts</code>.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/activate"
              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-amber to-amber-dark px-6 py-3 text-sm font-medium text-background hover:from-amber-light hover:to-amber transition-all shadow-lg shadow-amber/25"
            >
              Get API Key
            </Link>
            <Link
              href="/developers"
              className="inline-flex items-center justify-center rounded-xl border border-border bg-surface/80 px-6 py-3 text-sm font-medium text-text-primary hover:border-amber/30 hover:bg-amber/5 transition-all"
            >
              API Docs
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

function TemplateCard({ template }: { template: Template }) {
  const params = template.parameter_schema?.properties
    ? Object.entries(template.parameter_schema.properties)
    : [];
  const requiredParams = template.parameter_schema?.required || [];

  return (
    <div className="rounded-xl border border-border bg-surface/80 backdrop-blur-sm p-5 hover:border-amber/30 hover:bg-amber/5 transition-all group relative overflow-hidden">
      {/* Gradient accent bar */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{template.name}</h3>
          <CategoryBadge category={template.category} />
        </div>
        <span className="text-xs font-mono text-text-secondary/50">v{template.version}</span>
      </div>

      <p className="text-xs text-text-secondary mb-4 leading-relaxed">
        {template.description}
      </p>

      {/* Parameters */}
      {params.length > 0 && (
        <div className="border-t border-border/50 pt-3">
          <p className="text-xs font-medium text-text-secondary/70 mb-2">Parameters</p>
          <div className="flex flex-wrap gap-1.5">
            {params.map(([key]) => (
              <span
                key={key}
                className={`text-xs px-2 py-0.5 rounded font-mono ${
                  requiredParams.includes(key)
                    ? 'text-amber bg-amber/10 border border-amber/20'
                    : 'text-text-secondary/60 bg-surface-elevated border border-border'
                }`}
              >
                {key}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
        <span className="text-xs font-mono text-amber">
          {template.price_cents / 100} credits
        </span>
        <span className="text-xs font-mono text-text-secondary/40">
          {template.slug}
        </span>
      </div>
    </div>
  );
}
