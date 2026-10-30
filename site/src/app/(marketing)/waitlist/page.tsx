import { Metadata } from 'next';
import { createOgMetadata } from '@/lib/og/create-og-metadata';
import Reveal from '@/components/ui/Reveal';
import MagneticButton from '@/components/ui/MagneticButton';
import Eyebrow from '@/components/ui/Eyebrow';
import Hairline from '@/components/ui/Hairline';
import { serif, mono, DISPLAY, MICRO, EDITORIAL, SECTION_PAD, MEASURE, MEASURE_NARROW } from '@/lib/type';
import WaitlistForm from '@/components/shared/WaitlistForm';

export const metadata: Metadata = {
  title: 'Join the Waitlist | Ambr',
  description:
    'Sign up for early access to Ambr, the Agent Mandate & Binding Registry, the liability record for autonomous agents.',
  ...createOgMetadata({
    title: 'Join the Waitlist | Ambr',
    description:
      'Sign up for early access to Ambr, the Agent Mandate & Binding Registry, the liability record for autonomous agents.',
    path: '/waitlist',
    label: 'Waitlist',
    domain: 'ambr.run',
  }),
};

const benefits = [
  'Early API access with sandbox environment',
  'Developer documentation and integration guides',
  'Direct channel to the Ambr team for feedback',
  'Priority access to premium contract templates',
];

export default function WaitlistPage() {
  return (
    <main style={{ background: EDITORIAL.bg, color: EDITORIAL.text }}>
      {/* Hero */}
      <section className="px-6 pt-40 pb-24 sm:px-10 lg:px-16">
        <div className={MEASURE}>
          <Reveal><Eyebrow>§ 01 — Early Access</Eyebrow></Reveal>
          <Reveal delay={0.08}>
            <h1 className="mt-6 max-w-4xl" style={DISPLAY.hero}>
              Get on the<br /><span style={{ color: EDITORIAL.brass }}>record early.</span>
            </h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-8 max-w-2xl text-[16px] leading-relaxed" style={{ color: EDITORIAL.lead }}>
              Ambr is the Agent Mandate &amp; Binding Registry, the liability record for autonomous agents.
              Be among the first to build against it. Early access includes API keys, developer docs,
              and direct support.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Form + benefits */}
      <section className={SECTION_PAD}>
        <div className={MEASURE_NARROW}>
          <Reveal><Hairline /></Reveal>
          <div className="mt-12 grid grid-cols-1 gap-px lg:grid-cols-2" style={{ background: EDITORIAL.gridLine, border: `1px solid ${EDITORIAL.gridLine}` }}>
            {/* Form cell */}
            <Reveal>
              <div className="flex h-full flex-col p-8 sm:p-10" style={{ background: EDITORIAL.bg }}>
                <Eyebrow>§ 02 — Request access</Eyebrow>
                <h2 className="mt-5" style={{ ...serif, fontSize: 'clamp(1.8rem, 3.4vw, 2.6rem)', lineHeight: 1.02, letterSpacing: '-0.02em' }}>
                  Join the waitlist.
                </h2>
                <div className="mt-8">
                  <WaitlistForm />
                </div>
              </div>
            </Reveal>

            {/* Benefits cell */}
            <Reveal delay={0.1}>
              <div className="flex h-full flex-col p-8 sm:p-10" style={{ background: EDITORIAL.inset }}>
                <Eyebrow>§ 03 — What you get</Eyebrow>
                <h2 className="mt-5" style={{ ...serif, fontSize: 'clamp(1.8rem, 3.4vw, 2.6rem)', lineHeight: 1.02, letterSpacing: '-0.02em' }}>
                  Included in early access.
                </h2>
                <ul className="mt-8 space-y-px" style={{ background: EDITORIAL.gridLine, border: `1px solid ${EDITORIAL.gridLine}` }}>
                  {benefits.map((b) => (
                    <li key={b} className="flex items-start gap-3 p-5 text-[14px] leading-relaxed" style={{ background: EDITORIAL.inset, color: EDITORIAL.lead }}>
                      <span style={{ ...mono, color: EDITORIAL.brass }}>→</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-8 text-[13px] leading-relaxed" style={{ color: '#6f675b' }}>
                  An Agent Mandate records who authorized it, in what scope, under which law.
                  Readable as prose, executable as code, revocable on record.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-36 pt-8 text-center sm:px-10 lg:px-16">
        <Reveal>
          <h2 style={DISPLAY.cta}>
            Rather start now?
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed" style={{ color: EDITORIAL.lead }}>
            The developer docs are already live. Read the spec, or get an API key.
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
