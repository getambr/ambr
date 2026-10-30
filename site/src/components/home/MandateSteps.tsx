import Reveal from '@/components/ui/Reveal';

const serif = { fontFamily: 'var(--font-instrument-serif), serif' } as const;
const mono = { fontFamily: 'var(--font-jetbrains-mono), monospace' } as const;

const steps = [
  // No "and your agent cannot cross them" here: it is the same enforcement
  // overclaim as in CoreCapabilities.tsx. brief.md records this copy as deleted;
  // keep it out of every copy, not only MandateDemo.tsx.
  { n: '01', t: 'Authorize', d: 'Spend caps, allowed counterparties, action scopes, time windows. One API call records the boundaries — signed and hash-verifiable, so anyone can check whether an action fell inside them.' },
  { n: '02', t: 'Act', d: 'When your agent transacts, Ambr issues an Agent Mandate both sides can trust — readable by humans, parsable by agents. No more handshake-by-prompt-injection.' },
  { n: '03', t: 'Prove', d: 'Every authorized action is recorded on-chain with a cryptographic hash. Prove exactly who decided what, when, and under whose authority.' },
];

export default function MandateSteps() {
  return (
    <section className="relative px-6 py-28 sm:px-10 lg:px-16" style={{ background: '#0a0a0a', color: '#f4f4f0' }}>
      <div className="mx-auto max-w-[1500px]">
        <Reveal><div style={{ height: 1, background: 'linear-gradient(to right, rgba(198,168,124,0.45), transparent)' }} /></Reveal>
        <Reveal delay={0.05}>
          <p className="mt-6 text-[11px] uppercase" style={{ ...mono, color: '#c6a87c', letterSpacing: '0.3em' }}>§ 02 — How it works</p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="mt-5 max-w-3xl" style={{ ...serif, fontSize: 'clamp(2.4rem, 5vw, 4.4rem)', lineHeight: 0.98, letterSpacing: '-0.02em' }}>
            Three steps. One API.
          </h2>
        </Reveal>

        <div className="mt-16 grid gap-10 sm:grid-cols-3 sm:gap-px">
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={0.15 + i * 0.1}>
              <div className="border-t pt-6 sm:pr-8" style={{ borderColor: 'rgba(198,168,124,0.3)' }}>
                <div className="flex items-baseline gap-4">
                  <span style={{ ...serif, fontSize: 34, color: '#c6a87c', opacity: 0.5 }}>{s.n}</span>
                  <h3 style={{ ...serif, fontSize: 28, color: '#f4f4f0' }}>{s.t}</h3>
                </div>
                <p className="mt-4 text-[14px] leading-relaxed" style={{ color: '#a39b8c' }}>{s.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
