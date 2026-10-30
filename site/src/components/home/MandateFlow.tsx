import Reveal from '@/components/ui/Reveal';
import AmbrFlow from '@/components/home/AmbrFlow';

const serif = { fontFamily: 'var(--font-instrument-serif), serif' } as const;
const mono = { fontFamily: 'var(--font-jetbrains-mono), monospace' } as const;

export default function MandateFlow() {
  return (
    <section className="relative overflow-hidden px-6 py-20 sm:px-10 lg:px-16" style={{ background: '#0a0a0a', color: '#f4f4f0' }}>
      <div className="mx-auto max-w-[1500px]">
        <Reveal>
          <div className="flex items-baseline justify-between gap-6">
            <p className="text-[11px] uppercase" style={{ ...mono, color: '#c6a87c', letterSpacing: '0.3em' }}>The lifecycle of a mandate</p>
            <p className="hidden text-[11px] uppercase sm:block" style={{ ...mono, color: '#6f675b', letterSpacing: '0.18em' }}>intent → proof</p>
          </div>
        </Reveal>
        <Reveal delay={0.08}>
          <h2 className="mt-5 max-w-3xl" style={{ ...serif, fontSize: 'clamp(2rem, 4vw, 3.4rem)', lineHeight: 1.0, letterSpacing: '-0.02em' }}>
            Every decision moves through the same path.
          </h2>
        </Reveal>
        <Reveal delay={0.16}>
          {/* desktop: the animated lifecycle SVG; mobile: a legible stacked step list */}
          <div className="relative mt-6 hidden w-full lg:block" style={{ aspectRatio: '1440 / 360' }}>
            <AmbrFlow className="absolute inset-0" />
          </div>
          <ol className="mt-8 lg:hidden">
            {['Agent', 'Authorize', 'Sign · Hash', 'Base L2 · cNFT', 'Verify'].map((label, i) => (
              <li key={label} className="flex items-center gap-4 pb-5 last:pb-0">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[11px]"
                  style={{ ...mono, borderColor: 'rgba(198,168,124,0.45)', color: '#c6a87c' }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-[15px] uppercase" style={{ ...mono, color: '#f4f4f0', letterSpacing: '0.12em' }}>{label}</span>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}
