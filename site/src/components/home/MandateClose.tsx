import Reveal from '@/components/ui/Reveal';
import MagneticButton from '@/components/ui/MagneticButton';

const serif = { fontFamily: 'var(--font-instrument-serif), serif' } as const;
const mono = { fontFamily: 'var(--font-jetbrains-mono), monospace' } as const;

export default function MandateClose() {
  return (
    <section className="relative overflow-hidden px-6 py-36 sm:px-10 lg:px-16" style={{ background: '#0a0a0a', color: '#f4f4f0' }}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(50% 60% at 50% 60%, rgba(198,168,124,0.12), transparent 70%)' }}
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-[1100px] text-center">
        <Reveal>
          <p className="text-[11px] uppercase" style={{ ...mono, color: '#c6a87c', letterSpacing: '0.3em' }}>§ 07 — The mandate</p>
        </Reveal>
        <Reveal delay={0.08}>
          <h2 className="mx-auto mt-6 max-w-4xl" style={{ ...serif, fontSize: 'clamp(2.6rem, 6.5vw, 6rem)', lineHeight: 0.92, letterSpacing: '-0.03em' }}>
            Your AI will act.<br />
            <span style={{ color: '#c6a87c' }}>Under whose rules?</span>
          </h2>
        </Reveal>
        <Reveal delay={0.18}>
          <p className="mx-auto mt-8 max-w-xl text-[15px] leading-relaxed" style={{ color: '#a39b8c' }}>
            Live on Base mainnet. No credit card. Three lines of code to put real limits on your agent,
            and a verifiable trail behind every decision it makes.
          </p>
        </Reveal>
        <Reveal delay={0.26}>
          <div className="mt-11 flex flex-wrap items-center justify-center gap-7">
            <MagneticButton href="/activate">Get an API key →</MagneticButton>
            <a href="/developers" data-cursor className="text-[12px] uppercase transition-colors hover:text-text-primary" style={{ ...mono, color: '#8a8170', letterSpacing: '0.16em' }}>
              See how it works
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
