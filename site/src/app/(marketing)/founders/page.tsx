import { Metadata } from 'next';
import { createOgMetadata } from '@/lib/og/create-og-metadata';
import SectionWrapper from '@/components/ui/SectionWrapper';
import ScrollReveal from '@/components/ui/ScrollReveal';
import Button from '@/components/ui/Button';
import FounderEnrollForm from '@/components/founders/FounderEnrollForm';
import FoundingPartnersList from '@/components/founders/FoundingPartnersList';

export const metadata: Metadata = {
  title: 'Founder Program | Ambr',
  description:
    'First 10 organizations joining the Ambr ecosystem. 1,000 free contracts, 50% off per-contract forever, public listing as a founding partner.',
  ...createOgMetadata({
    title: 'Founder Program | Ambr',
    description:
      'First 10 organizations joining the Ambr ecosystem. 1,000 free contracts, 50% off per-contract forever, public listing as a founding partner.',
    path: '/founders',
    label: 'Founder Program',
    domain: 'ambr.run',
  }),
};

const benefits = [
  {
    label: '1,000 contracts free',
    detail:
      'Enough to build, test, and ship with room to grow — covers early integration plus first real usage. $500 value at per-contract rates.',
  },
  {
    label: '50% off per-contract forever',
    detail:
      'Locked-in discount on Consumer, Delegation, Commerce, and Fleet tiers. No renegotiation, no gotchas. Scales with your usage.',
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
    <main>
      <SectionWrapper>
        <ScrollReveal>
          <div className="text-center max-w-3xl mx-auto mb-12">
            <p className="text-sm font-mono uppercase tracking-widest text-amber mb-2">
              Founder Program
            </p>
            <h1 className="text-4xl text-text-primary sm:text-5xl">
              First 10 orgs. Permanent 50% off.
            </h1>
            <p className="mt-4 text-lg text-text-secondary">
              Ambr is the first Ricardian contract layer for AI agents.
              Join as a Founding Partner and help shape the standard for
              agent commerce.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
            {benefits.map((b) => (
              <div
                key={b.label}
                className="border border-amber/30 bg-surface/80 p-5"
              >
                <h3 className="text-base text-text-primary font-medium mb-2">
                  {b.label}
                </h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  {b.detail}
                </p>
              </div>
            ))}
          </div>
        </ScrollReveal>

        <ScrollReveal>
          <div className="border border-amber/60 bg-surface/80 p-6 max-w-2xl mx-auto mb-12">
            <h2 className="text-xl text-text-primary mb-4">
              Apply to join
            </h2>
            <p className="text-sm text-text-secondary mb-6">
              Applications are reviewed manually. We look for teams shipping
              real agent products, not stealth experiments. Approval typically
              within 48 hours.
            </p>
            <FounderEnrollForm />
          </div>
        </ScrollReveal>

        <ScrollReveal>
          <FoundingPartnersList />
        </ScrollReveal>

        <ScrollReveal>
          <div className="text-center mt-12">
            <p className="text-sm text-text-secondary mb-4">
              Not ready for the Founder Program? Start free.
            </p>
            <Button href="/activate" variant="secondary">
              Get Free Developer Key
            </Button>
          </div>
        </ScrollReveal>
      </SectionWrapper>
    </main>
  );
}
