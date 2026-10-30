import { Metadata } from 'next';
import { createOgMetadata } from '@/lib/og/create-og-metadata';
import Reveal from '@/components/ui/Reveal';
import MagneticButton from '@/components/ui/MagneticButton';
import Eyebrow from '@/components/ui/Eyebrow';
import Hairline from '@/components/ui/Hairline';
import { mono, DISPLAY, MICRO, EDITORIAL, SECTION_PAD, MEASURE } from '@/lib/type';
import ArchitecturePanel from '@/components/home/ArchitecturePanel';
import CnftLifecycle from '@/components/how-it-works/CnftLifecycle';
import ReaderPortal from '@/components/how-it-works/ReaderPortal';
import AmendmentChain from '@/components/how-it-works/AmendmentChain';

export const metadata: Metadata = {
  title: 'How It Works | Ambr — Agent Mandate & Binding Registry',
  description:
    'How authorization becomes a record: Ambr turns agent delegation into a readable, revocable Agent Mandate — an Agent Mandate records who authorized it, in what scope, under which law.',
  ...createOgMetadata({
    title: 'How It Works | Ambr',
    description:
      'How authorization becomes a record: readable as prose, executable as code, revocable on record.',
    path: '/how-it-works',
    label: 'How It Works',
    domain: 'ambr.run',
  }),
};

export default function HowItWorksPage() {
  return (
    <main style={{ background: EDITORIAL.bg, color: EDITORIAL.text }}>
      {/* Hero */}
      <section className="px-6 pt-40 pb-24 sm:px-10 lg:px-16">
        <div className={MEASURE}>
          <Reveal><Eyebrow>§ 01 — How it works</Eyebrow></Reveal>
          <Reveal delay={0.08}>
            <h1 className="mt-6 max-w-4xl" style={DISPLAY.hero}>
              How authorization<br />becomes <span style={{ color: EDITORIAL.brass }}>a record.</span>
            </h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-8 max-w-2xl text-[16px] leading-relaxed" style={{ color: EDITORIAL.lead }}>
              Every Ambr contract exists simultaneously as human-readable legal prose
              and machine-parsable JSON, linked by SHA-256 hash, signed by ECDSA wallets,
              minted as cNFTs on Base L2. An Agent Mandate records who authorized it,
              in what scope, under which law.
            </p>
          </Reveal>
          <Reveal delay={0.24}>
            <p className="mt-8 text-[13px]" style={{ ...mono, color: EDITORIAL.brass, letterSpacing: '0.16em' }}>
              Readable as prose. Executable as code. Revocable on record.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Dual-format architecture */}
      <section className={SECTION_PAD}>
        <div className={MEASURE}>
          <Reveal><Hairline /></Reveal>
          <Reveal delay={0.05}><div className="mt-6"><Eyebrow>§ 02 — Architecture</Eyebrow></div></Reveal>
          <Reveal delay={0.1}>
            <h2 className="mt-5 max-w-3xl" style={DISPLAY.section}>
              The dual-state contract.
            </h2>
          </Reveal>
          <Reveal delay={0.14}>
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed" style={{ color: EDITORIAL.detail }}>
              One mandate, two states: a prose record your lawyers can read and a strict
              JSON your agent executes. Same terms, bound by hash.
            </p>
          </Reveal>
          <Reveal delay={0.2}><div className="mt-12"><ArchitecturePanel /></div></Reveal>
        </div>
      </section>

      {/* Contract lifecycle */}
      <section className={SECTION_PAD}>
        <div className={MEASURE}>
          <Reveal><Hairline /></Reveal>
          <Reveal delay={0.1}><div className="mt-12"><CnftLifecycle /></div></Reveal>
        </div>
      </section>

      {/* Reader portal */}
      <section className={SECTION_PAD}>
        <div className={MEASURE}>
          <Reveal><Hairline /></Reveal>
          <Reveal delay={0.1}><div className="mt-12"><ReaderPortal /></div></Reveal>
        </div>
      </section>

      {/* Amendment chains */}
      <section className={SECTION_PAD}>
        <div className={MEASURE}>
          <Reveal><Hairline /></Reveal>
          <Reveal delay={0.05}><div className="mt-6"><Eyebrow>§ 05 — Evolution</Eyebrow></div></Reveal>
          <Reveal delay={0.1}>
            <h2 className="mt-5 max-w-3xl" style={DISPLAY.section}>
              Amendment chains.
            </h2>
          </Reveal>
          <Reveal delay={0.14}>
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed" style={{ color: EDITORIAL.detail }}>
              Mandates evolve. Amendments reference the original via parent hash,
              creating an immutable chain with a full audit trail.
            </p>
          </Reveal>
          <Reveal delay={0.2}><div className="mt-12"><AmendmentChain /></div></Reveal>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-36 pt-8 text-center sm:px-10 lg:px-16">
        <Reveal>
          <h2 style={DISPLAY.cta}>
            Ready to build?
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed" style={{ color: EDITORIAL.lead }}>
            Initialize your first mandate, or explore the developer documentation
            and MCP integration guides.
          </p>
        </Reveal>
        <Reveal delay={0.18}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-7">
            <MagneticButton href="/activate">Initialize contract →</MagneticButton>
            <a
              href="/developers"
              data-cursor
              className="text-[12px] uppercase transition-colors hover:text-text-primary"
              style={MICRO.ghost}
            >
              Read documentation
            </a>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
