import { Metadata } from 'next';
import { createOgMetadata } from '@/lib/og/create-og-metadata';
import Reveal from '@/components/ui/Reveal';
import MagneticButton from '@/components/ui/MagneticButton';
import Eyebrow from '@/components/ui/Eyebrow';
import Hairline from '@/components/ui/Hairline';
import { serif, mono, DISPLAY, MICRO, EDITORIAL, SECTION_PAD, MEASURE, MEASURE_NARROW } from '@/lib/type';
import { useCases } from '@/lib/use-cases';

export const metadata: Metadata = {
  title: 'Use Cases | Ambr — Agent Mandate & Binding Registry',
  description:
    'Four scenarios where an Agent Mandate becomes the liability record for autonomous agents: delegation authorization, agent-executed procurement, agent-signed service agreements, and compliance audit trails.',
  ...createOgMetadata({
    title: 'Use Cases | Ambr',
    description: 'Where an Agent Mandate becomes the liability record for autonomous agents.',
    path: '/use-cases',
    label: 'Use Cases',
    domain: 'ambr.run',
  }),
};

function MicroLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase" style={{ ...mono, color: EDITORIAL.brass, letterSpacing: '0.18em' }}>
      {children}
    </p>
  );
}

export default function UseCasesPage() {
  return (
    <main style={{ background: EDITORIAL.bg, color: EDITORIAL.text }}>
      {/* Hero */}
      <section className="px-6 pt-40 pb-24 sm:px-10 lg:px-16">
        <div className={MEASURE}>
          <Reveal><Eyebrow>§ 01 — Use Cases</Eyebrow></Reveal>
          <Reveal delay={0.08}>
            <h1 className="mt-6 max-w-4xl" style={DISPLAY.hero}>
              Where a mandate becomes<br /><span style={{ color: EDITORIAL.brass }}>the record.</span>
            </h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-8 max-w-2xl text-[16px] leading-relaxed" style={{ color: EDITORIAL.lead }}>
              An Agent Mandate records who authorized an agent, in what scope, under which law. Readable as
              prose, executable as code, revocable on record. Four scenarios show how companies use Ambr, the
              Agent Mandate &amp; Binding Registry, to authorize AI agents, let them act under recorded mandates,
              and hold an accountability record for every action.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Scenarios */}
      <section className={SECTION_PAD}>
        <div className={MEASURE}>
          <Reveal><Hairline /></Reveal>
          <Reveal delay={0.05}><div className="mt-6"><Eyebrow>§ 02 — In practice</Eyebrow></div></Reveal>
          <Reveal delay={0.1}>
            <h2 className="mt-5 max-w-3xl" style={DISPLAY.section}>
              Authority and its exercise, on record.
            </h2>
          </Reveal>
          <Reveal delay={0.14}>
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed" style={{ color: EDITORIAL.detail }}>
              Each mandate names a principal, a scope, and a counterparty. It is minted as a single cNFT on Base
              L2, with its SHA-256 hash stored permanently on-chain.
            </p>
          </Reveal>

          <div
            className="mt-12 grid grid-cols-1 gap-px lg:grid-cols-2"
            style={{ background: EDITORIAL.gridLine, border: `1px solid ${EDITORIAL.gridLine}` }}
          >
            {useCases.map((uc, i) => (
              <Reveal key={uc.id} delay={(i % 2) * 0.06}>
                <div className="flex h-full flex-col p-8 sm:p-10" style={{ background: EDITORIAL.bg }}>
                  <span className="text-[10px] uppercase" style={{ ...mono, color: '#6f675b', letterSpacing: '0.2em' }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mt-4" style={{ ...serif, fontSize: '1.9rem', lineHeight: 1.05, color: EDITORIAL.text }}>
                    {uc.title}
                  </h3>
                  <p className="mt-4 text-[14px] leading-relaxed" style={{ color: EDITORIAL.lead }}>
                    {uc.scenario}
                  </p>

                  <div className="mt-7 space-y-5">
                    <div>
                      <MicroLabel>Parties</MicroLabel>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {uc.parties.map((p) => (
                          <span
                            key={p}
                            className="px-2.5 py-1 text-[11px]"
                            style={{ color: EDITORIAL.lead, border: '1px solid rgba(198,168,124,0.22)' }}
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <MicroLabel>Contract Terms</MicroLabel>
                      <p className="mt-2 text-[13px] leading-relaxed" style={{ color: EDITORIAL.detail }}>{uc.contractTerms}</p>
                    </div>

                    <div>
                      <MicroLabel>Outcome</MicroLabel>
                      <p className="mt-2 text-[13px] leading-relaxed" style={{ color: EDITORIAL.detail }}>{uc.outcome}</p>
                    </div>
                  </div>

                  <div className="mt-7 pt-6" style={{ borderTop: `1px solid ${EDITORIAL.gridLine}` }}>
                    <MicroLabel>Integrations</MicroLabel>
                    <div className="mt-3 space-y-2">
                      {(
                        [
                          ['Payments', uc.integrations.payments],
                          ['Reputation', uc.integrations.reputation],
                          ['Contract', uc.integrations.contract],
                        ] as const
                      ).map(([label, value]) => (
                        <p key={label} className="text-[13px] leading-relaxed" style={{ color: EDITORIAL.detail }}>
                          <span className="uppercase" style={{ ...mono, color: EDITORIAL.brass, letterSpacing: '0.12em', fontSize: '11px' }}>
                            {label}:
                          </span>{' '}
                          {value}
                        </p>
                      ))}
                    </div>
                  </div>

                  <div className="mt-8 pt-2">
                    <a
                      href="/waitlist"
                      data-cursor
                      className="text-[12px] uppercase transition-colors hover:text-text-primary"
                      style={MICRO.ghost}
                    >
                      Build this use case →
                    </a>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Role callout */}
      <section className={SECTION_PAD}>
        <div className={MEASURE_NARROW}>
          <Reveal>
            <div className="border p-10 sm:p-14" style={{ borderColor: EDITORIAL.panelBorder, background: EDITORIAL.inset }}>
              <Eyebrow>§ 03 — The through-line</Eyebrow>
              <h2 className="mt-6 max-w-3xl" style={DISPLAY.panel}>
                Every scenario resolves to a liability record.
              </h2>
              <p className="mt-6 text-[15px] leading-relaxed" style={{ color: EDITORIAL.lead }}>
                Whether an agent buys supplies, procures compute, signs a service agreement, or fills a quarter of
                audit history, the same artifact carries the weight: an Agent Mandate that names the authorizing
                entity, its scope, and the governing law. Human-readable, machine-parsable, minted as a single cNFT
                on Base L2, revocable on record.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-36 pt-8 text-center sm:px-10 lg:px-16">
        <Reveal>
          <h2 style={DISPLAY.cta}>
            Build your first mandate.
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed" style={{ color: EDITORIAL.lead }}>
            Start with the developer docs, or get an API key and mint your first Agent Mandate.
          </p>
        </Reveal>
        <Reveal delay={0.18}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-7">
            <MagneticButton href="/developers">Developer docs →</MagneticButton>
            <a
              href="/activate"
              data-cursor
              className="text-[12px] uppercase transition-colors hover:text-text-primary"
              style={MICRO.ghost}
            >
              Get an API key
            </a>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
