import { Metadata } from 'next';
import { createOgMetadata } from '@/lib/og/create-og-metadata';
import Reveal from '@/components/ui/Reveal';
import MagneticButton from '@/components/ui/MagneticButton';
import Eyebrow from '@/components/ui/Eyebrow';
import Hairline from '@/components/ui/Hairline';
import { DISPLAY, MICRO, EDITORIAL, SECTION_PAD, MEASURE, mono } from '@/lib/type';
import { getSupabase } from '@/lib/supabase';
import { V1_CHAT_TEMPLATES } from '@/lib/llm/prompts';

// Only surface templates that are actually deployable in the product (the chat
// flow's offered set). Others (d2/d3/c2/…) stay in the DB for when they ship.
// Sourced from V1_CHAT_TEMPLATES so this page mirrors the deploy-chat picker —
// same slugs AND same names (e.g. c3 reads "A2A — Agent-to-Agent", not the
// formal "Task Execution Agreement"), so the page speaks the product's language.
// The formal legal name still lives inside the generated contract.
const OFFERED_BY_SLUG = new Map<string, (typeof V1_CHAT_TEMPLATES)[number]>(
  V1_CHAT_TEMPLATES.map((t) => [t.slug, t]),
);

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

export default async function TemplatesPage() {
  const templates = (await getTemplates()).filter((t) => OFFERED_BY_SLUG.has(t.slug));

  const delegationTemplates = templates.filter((t) => t.category === 'delegation');
  const commerceTemplates = templates.filter((t) => t.category === 'commerce');

  return (
    <main style={{ background: EDITORIAL.bg, color: EDITORIAL.text }}>
      {/* Hero */}
      {/* pt-56, not founders' pt-40: the (marketing) layout adds pt-16 on its
          wrapper and (platform) does not, so this makes up the difference and
          lands the hero at the same height as /founders. */}
      <section className="px-6 pt-56 pb-24 sm:px-10 lg:px-16">
        <div className={MEASURE}>
          <Reveal><Eyebrow>§ 01 — Mandate Templates</Eyebrow></Reveal>
          <Reveal delay={0.08}>
            <h1 className="mt-6 max-w-4xl" style={DISPLAY.hero}>
              Agent Mandate<br />
              <span style={{ color: EDITORIAL.brass }}>Templates.</span>
            </h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-8 max-w-2xl text-[16px] leading-relaxed" style={{ color: EDITORIAL.lead }}>
              Each template generates an Agent Mandate — a dual-format Ricardian Contract with
              human-readable legal text and machine-parsable JSON, linked by a SHA-256 hash.
              Choose a template, provide parameters via the API, and receive a verified mandate.
            </p>
          </Reveal>
          <Reveal delay={0.22}>
            <p className="mt-5 max-w-2xl text-[13px] leading-relaxed" style={{ color: EDITORIAL.detail }}>
              Templates are structured frameworks for contract generation, not legal advice.
              Review generated contracts with qualified counsel before use.
            </p>
          </Reveal>
        </div>
      </section>

      {delegationTemplates.length > 0 && (
        <TemplateSection
          number="02"
          label="Delegation"
          heading="You authorize your agent, on record."
          templates={delegationTemplates}
        />
      )}

      {commerceTemplates.length > 0 && (
        <TemplateSection
          number="03"
          label="Agent-to-Agent"
          heading="Agents commissioning agents."
          blurb="Task, deliverables, payment on completion."
          templates={commerceTemplates}
        />
      )}

      {templates.length === 0 && (
        <section className={SECTION_PAD}>
          <div className={MEASURE}>
            <Reveal><Hairline /></Reveal>
            <p className="mt-8 text-[15px]" style={{ color: EDITORIAL.lead }}>
              No templates available yet — they are being reviewed and will appear here shortly.
            </p>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="px-6 pb-36 pt-8 text-center sm:px-10 lg:px-16">
        <Reveal>
          <h2 style={DISPLAY.cta}>Ready to generate?</h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed" style={{ color: EDITORIAL.lead }}>
            Pass a template slug and its parameters to{' '}
            <code style={{ ...mono, color: EDITORIAL.brass }}>POST /api/v1/contracts</code>.
          </p>
        </Reveal>
        <Reveal delay={0.18}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-7">
            <MagneticButton href="/activate">Get an API key →</MagneticButton>
            <a
              href="/developers"
              data-cursor
              className="text-[12px] uppercase transition-colors hover:text-text-primary"
              style={MICRO.ghost}
            >
              Read the docs
            </a>
          </div>
        </Reveal>
      </section>
    </main>
  );
}

function TemplateSection({
  number,
  label,
  heading,
  blurb,
  templates,
}: {
  number: string;
  label: string;
  heading: string;
  blurb?: string;
  templates: Template[];
}) {
  return (
    <section className={SECTION_PAD}>
      <div className={MEASURE}>
        <Reveal><Hairline /></Reveal>
        <Reveal delay={0.05}>
          <div className="mt-6"><Eyebrow>{`§ ${number} — ${label}`}</Eyebrow></div>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="mt-5 max-w-3xl" style={DISPLAY.section}>{heading}</h2>
        </Reveal>
        {blurb && (
          <Reveal delay={0.14}>
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed" style={{ color: EDITORIAL.detail }}>
              {blurb}
            </p>
          </Reveal>
        )}
        {/* Individual bordered cells rather than the founders gap-px grid: the
            template count is data-driven and varies, and a hairline grid shows
            its brass ground through any unfilled cell in the last row. */}
        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {templates.map((template, i) => (
            <Reveal key={template.id} delay={i * 0.06}>
              <TemplateCard template={template} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function TemplateCard({ template }: { template: Template }) {
  const params = template.parameter_schema?.properties
    ? Object.entries(template.parameter_schema.properties)
    : [];
  const requiredParams = template.parameter_schema?.required || [];
  // Product-facing name (matches the deploy-chat picker, e.g. "A2A — Agent-to-Agent"),
  // falling back to the formal DB name. The formal name still lives in the contract.
  const offered = OFFERED_BY_SLUG.get(template.slug);
  const displayName = offered ? `${offered.label} — ${offered.name}` : template.name;

  return (
    <div
      className="flex h-full flex-col p-8"
      style={{ background: EDITORIAL.inset, border: `1px solid ${EDITORIAL.gridLine}` }}
    >
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[10px] uppercase" style={MICRO.numeral}>{template.category}</span>
        <span className="text-[10px] uppercase" style={MICRO.numeral}>v{template.version}</span>
      </div>

      <h3 className="mt-5" style={DISPLAY.card}>{displayName}</h3>

      <p className="mt-3 text-[14px] leading-relaxed" style={{ color: EDITORIAL.detail }}>
        {template.description}
      </p>

      {params.length > 0 && (
        <div className="mt-6">
          <p className="text-[10px] uppercase" style={MICRO.numeral}>Parameters</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {params.map(([key]) => (
              <span
                key={key}
                className="text-[12px]"
                style={{
                  ...mono,
                  // Required reads brass, optional recedes — colour carries the
                  // distinction instead of two different chip treatments.
                  color: requiredParams.includes(key) ? EDITORIAL.brass : EDITORIAL.detail,
                }}
              >
                {key}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* mt-auto pins the rule to the card's base so cards of differing height
          still line their footers up across the row. */}
      <div className="mt-auto pt-8">
        <div
          className="flex items-center justify-between pt-6"
          style={{ borderTop: `1px solid ${EDITORIAL.gridLine}` }}
        >
          <span className="text-[12px]" style={{ ...mono, color: EDITORIAL.brass }}>
            {template.price_cents / 100} credits
          </span>
          <span className="text-[12px]" style={{ ...mono, color: EDITORIAL.detail }}>
            {template.slug}
          </span>
        </div>
      </div>
    </div>
  );
}
