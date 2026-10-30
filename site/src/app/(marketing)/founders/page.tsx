import { Metadata } from 'next';
import { createOgMetadata } from '@/lib/og/create-og-metadata';
import Reveal from '@/components/ui/Reveal';
import MagneticButton from '@/components/ui/MagneticButton';
import Eyebrow from '@/components/ui/Eyebrow';
import Hairline from '@/components/ui/Hairline';
import { DISPLAY, MICRO, EDITORIAL, SECTION_PAD, MEASURE, MEASURE_NARROW } from '@/lib/type';
import FounderEnrollForm from '@/components/founders/FounderEnrollForm';
import FoundingPartnersList from '@/components/founders/FoundingPartnersList';

export const metadata: Metadata = {
  title: 'Founder Program | Ambr — Agent Mandate & Binding Registry',
  description:
    'The first 10 organizations building on the Agent Mandate & Binding Registry, the liability record for autonomous agents. 1,000 free contracts, 50% off per-contract forever, public listing as a founding partner.',
  ...createOgMetadata({
    title: 'Founder Program | Ambr',
    description:
      'The first 10 organizations building on the liability record for autonomous agents. 1,000 free contracts, 50% off forever, founding-partner listing.',
    path: '/founders',
    label: 'Founder Program',
    domain: 'ambr.run',
  }),
};

const benefits = [
  {
    label: '24,000 credits free',
    detail:
      'Enough to build, test, and ship with room to grow — covers early integration plus first real usage. Granted once.',
  },
  {
    label: '50% off self-serve list prices for 24 months',
    detail:
      'Locked-in discount on Personal, Delegation, Agent-to-Agent, and Fleet tiers for 24 months. No renegotiation, no gotchas. Scales with your usage.',
  },
  {
    label: 'Public "Founding Partner" listing',
    detail:
      'Featured on ambr.run, agent.json, and all Ambr case studies. Social proof signal to your own customers that you ship on modern AI infrastructure.',
  },
  {
    label: 'Direct founder access',
    detail:
      'Slack/email DM to Ilvers and Dainis for integration support. Feature requests get prioritized. Bug reports get fixed same-day when possible.',
  },
  {
    label: 'Shape the roadmap',
    detail:
      'First 10 partners get input on templates, pricing, and product direction. Your use case becomes a first-class citizen in Ambr v1.',
  },
  {
    label: 'Grandfathered pricing',
    detail:
      'Any future price increases do not apply to Founding Partners. Lock in today\'s rates for the lifetime of your account.',
  },
];

export default function FoundersPage() {
  return (
    <main style={{ background: EDITORIAL.bg, color: EDITORIAL.text }}>
      {/* Hero */}
      <section className="px-6 pt-40 pb-24 sm:px-10 lg:px-16">
        <div className={MEASURE}>
          <Reveal><Eyebrow>§ 01 — Founder Program</Eyebrow></Reveal>
          <Reveal delay={0.08}>
            <h1 className="mt-6 max-w-4xl" style={DISPLAY.hero}>
              First 10 orgs.<br /><span style={{ color: EDITORIAL.brass }}>Permanent 50% off.</span>
            </h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-8 max-w-2xl text-[16px] leading-relaxed" style={{ color: EDITORIAL.lead }}>
              Ambr is the Agent Mandate &amp; Binding Registry, the liability record for autonomous
              agents. Join as a Founding Partner and help shape the standard for agent commerce.
            </p>
          </Reveal>
          <Reveal delay={0.24}>
            <div className="mt-10 flex flex-wrap items-center gap-7">
              <MagneticButton href="#apply">Apply to join →</MagneticButton>
              <a
                href="/activate"
                data-cursor
                className="text-[12px] uppercase transition-colors hover:text-text-primary"
                style={MICRO.ghost}
              >
                Start free instead
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Benefits */}
      <section className={SECTION_PAD}>
        <div className={MEASURE}>
          <Reveal><Hairline /></Reveal>
          <Reveal delay={0.05}><div className="mt-6"><Eyebrow>§ 02 — What you get</Eyebrow></div></Reveal>
          <Reveal delay={0.1}>
            <h2 className="mt-5 max-w-3xl" style={DISPLAY.section}>
              Founding Partner terms.
            </h2>
          </Reveal>
          <Reveal delay={0.14}>
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed" style={{ color: EDITORIAL.detail }}>
              Locked in for the lifetime of your account. Ten organizations, no renegotiation.
            </p>
          </Reveal>
          <div
            className="mt-12 grid grid-cols-1 gap-px sm:grid-cols-2 lg:grid-cols-3"
            style={{ background: EDITORIAL.gridLine, border: `1px solid ${EDITORIAL.gridLine}` }}
          >
            {benefits.map((b, i) => (
              <Reveal key={b.label} delay={i * 0.06}>
                <div className="flex h-full flex-col p-7" style={{ background: EDITORIAL.bg }}>
                  <span className="text-[10px] uppercase" style={MICRO.numeral}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mt-5" style={DISPLAY.card}>{b.label}</h3>
                  <p className="mt-3 text-[14px] leading-relaxed" style={{ color: EDITORIAL.detail }}>{b.detail}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Apply */}
      <section id="apply" className={SECTION_PAD}>
        <div className={MEASURE_NARROW}>
          <Reveal><Hairline /></Reveal>
          <Reveal delay={0.05}><div className="mt-6"><Eyebrow>§ 03 — Apply</Eyebrow></div></Reveal>
          <Reveal delay={0.1}>
            <div className="mt-8 border p-8 sm:p-12" style={{ borderColor: EDITORIAL.panelBorder, background: EDITORIAL.inset }}>
              <h2 style={DISPLAY.panel}>
                Apply to join.
              </h2>
              <p className="mt-6 max-w-xl text-[15px] leading-relaxed" style={{ color: EDITORIAL.lead }}>
                Applications are reviewed manually. We look for teams shipping real agent products,
                not stealth experiments. Approval typically within 48 hours.
              </p>
              <div className="mt-8">
                <FounderEnrollForm />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Partners */}
      <section className={SECTION_PAD}>
        <div className={MEASURE}>
          <Reveal><Hairline /></Reveal>
          <Reveal delay={0.05}><div className="mt-6"><Eyebrow>§ 04 — Partners</Eyebrow></div></Reveal>
          <Reveal delay={0.1}>
            <div className="mt-8">
              <FoundingPartnersList />
            </div>
          </Reveal>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-36 pt-8 text-center sm:px-10 lg:px-16">
        <Reveal>
          <h2 style={DISPLAY.cta}>
            Not ready yet?
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed" style={{ color: EDITORIAL.lead }}>
            Skip the program and start building today with a free developer key.
          </p>
        </Reveal>
        <Reveal delay={0.18}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-7">
            <MagneticButton href="/activate">Get free developer key →</MagneticButton>
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
