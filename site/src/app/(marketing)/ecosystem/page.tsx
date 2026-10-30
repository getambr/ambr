import { Metadata } from 'next';
import { createOgMetadata } from '@/lib/og/create-og-metadata';
import Reveal from '@/components/ui/Reveal';
import MagneticButton from '@/components/ui/MagneticButton';
import Eyebrow from '@/components/ui/Eyebrow';
import Hairline from '@/components/ui/Hairline';
import { serif, mono, DISPLAY, MICRO, EDITORIAL, SECTION_PAD, MEASURE, MEASURE_NARROW } from '@/lib/type';
import FiveLayerStack from '@/components/shared/FiveLayerStack';

export const metadata: Metadata = {
  title: 'Ecosystem | Ambr — Agent Mandate & Binding Registry',
  description:
    'Ambr is the Agent Mandate & Binding Registry: the authorization and liability record for autonomous agents, built to integrate with the AI agent commerce stack (KAMIYO, Nevermined, ZK Identity, x402 V2).',
  ...createOgMetadata({
    title: 'Ecosystem | Ambr',
    description: 'The liability record for autonomous agents, built for the AI agent commerce stack.',
    path: '/ecosystem',
    label: 'Ecosystem',
    domain: 'ambr.run',
  }),
};

const ecosystemProjects = [
  {
    name: 'x402 V2',
    description:
      'Primary payment rail. Ambr functions as an x402 extension — mandate hashes embedded in payment metadata. Multi-token support across Base, ACH, SEPA, and cards.',
    layer: 'Payments',
    status: 'live' as const,
  },
  {
    name: 'A2A Protocol',
    description:
      'Agent-to-Agent discovery and communication via JSON-RPC at getamber.dev/api/a2a, discoverable at /.well-known/agent.json.',
    layer: 'Discovery',
    status: 'live' as const,
  },
  {
    name: 'KAMIYO',
    description:
      'Optional escrow integration for high-value transactions. Oracle-verified quality checks and conditional payment release. Not a dependency — available when escrow is needed.',
    layer: 'Escrow',
    status: 'planned' as const,
  },
  {
    name: 'Nevermined',
    description:
      'Metered billing and session-based payment coordination for compute and data services. Python and TypeScript SDKs for integration with agent frameworks.',
    layer: 'Payments',
    status: 'planned' as const,
  },
  {
    name: 'ZK Identity',
    description:
      'Privacy-preserving identity attestation via Groth16/BN128 zk-SNARKs powered by the Demos Network. Principals prove they are verified entities without revealing which one — on-chain, only a nullifier is visible.',
    layer: 'Trust',
    status: 'live' as const,
  },
];

function StatusPill({ status }: { status: 'live' | 'planned' }) {
  const live = status === 'live';
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[9px] uppercase"
      style={{
        ...mono,
        letterSpacing: '0.16em',
        color: live ? '#34D399' : EDITORIAL.detail,
        border: `1px solid ${live ? 'rgba(52,211,153,0.3)' : 'rgba(198,168,124,0.22)'}`,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: 9999, background: live ? '#34D399' : '#6f675b' }} />
      {live ? 'Live' : 'Planned'}
    </span>
  );
}

export default function EcosystemPage() {
  return (
    <main style={{ background: EDITORIAL.bg, color: EDITORIAL.text }}>
      {/* Hero */}
      <section className="px-6 pt-40 pb-24 sm:px-10 lg:px-16">
        <div className={MEASURE}>
          <Reveal><Eyebrow>§ 01 — Ecosystem</Eyebrow></Reveal>
          <Reveal delay={0.08}>
            <h1 className="mt-6 max-w-4xl" style={DISPLAY.hero}>
              Built for the agent<br /><span style={{ color: EDITORIAL.brass }}>commerce stack.</span>
            </h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-8 max-w-2xl text-[16px] leading-relaxed" style={{ color: EDITORIAL.lead }}>
              Ambr is the Agent Mandate &amp; Binding Registry, the authorization and liability record that plugs
              into the emerging AI agent commerce stack. These are the projects we integrate with.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Five-layer stack */}
      <section className={SECTION_PAD}>
        <div className={MEASURE}>
          <Reveal><Hairline /></Reveal>
          <Reveal delay={0.05}><div className="mt-6"><Eyebrow>§ 02 — The stack</Eyebrow></div></Reveal>
          <Reveal delay={0.1}>
            <h2 className="mt-5 max-w-3xl" style={DISPLAY.section}>
              Ambr sits at the mandate layer.
            </h2>
          </Reveal>
          <Reveal delay={0.14}>
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed" style={{ color: EDITORIAL.detail }}>
              Each layer handles a distinct concern, from discovery to payments. Ambr is the layer that records
              who authorized what.
            </p>
          </Reveal>
          <Reveal delay={0.2}><div className="mt-12"><FiveLayerStack variant="detailed" /></div></Reveal>
        </div>
      </section>

      {/* Integrations */}
      <section className={SECTION_PAD}>
        <div className={MEASURE}>
          <Reveal><Hairline /></Reveal>
          <Reveal delay={0.05}><div className="mt-6"><Eyebrow>§ 03 — Integrations</Eyebrow></div></Reveal>
          <Reveal delay={0.1}>
            <h2 className="mt-5 max-w-3xl" style={DISPLAY.section}>
              What Ambr plugs into.
            </h2>
          </Reveal>
          <div
            className="mt-12 grid grid-cols-1 gap-px sm:grid-cols-2 lg:grid-cols-3"
            style={{ background: EDITORIAL.gridLine, border: `1px solid ${EDITORIAL.gridLine}` }}
          >
            {ecosystemProjects.map((p, i) => (
              <Reveal key={p.name} delay={i * 0.06}>
                <div className="flex h-full flex-col p-7" style={{ background: EDITORIAL.bg }}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] uppercase" style={MICRO.numeral}>{p.layer}</span>
                    <StatusPill status={p.status} />
                  </div>
                  <h3 className="mt-5" style={{ ...serif, fontSize: '1.7rem', color: EDITORIAL.text }}>{p.name}</h3>
                  <p className="mt-3 text-[14px] leading-relaxed" style={{ color: EDITORIAL.detail }}>{p.description}</p>
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
              <Eyebrow>§ 04 — Purpose</Eyebrow>
              <h2 className="mt-6 max-w-3xl" style={DISPLAY.panel}>
                Ambr&apos;s role: the Agent Mandate &amp; Binding Registry.
              </h2>
              <p className="mt-6 text-[15px] leading-relaxed" style={{ color: EDITORIAL.lead }}>
                Discovery protocols help agents find each other. Trust registries verify identity. Escrow holds
                funds. Payment rails move money. But none of it works without a record of who authorized the
                agent, in what scope, under which law. That is what Ambr provides: an Agent Mandate that is
                human-readable, machine-parsable, and minted as a single cNFT on Base L2, with its SHA-256 hash
                stored permanently on-chain.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-36 pt-8 text-center sm:px-10 lg:px-16">
        <Reveal>
          <h2 style={DISPLAY.cta}>
            Build with us.
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed" style={{ color: EDITORIAL.lead }}>
            Integrating with Ambr? Start with the developer docs, or get an API key.
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
