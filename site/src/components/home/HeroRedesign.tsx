import Button from '@/components/ui/Button';

const mono = { fontFamily: 'var(--font-jetbrains-mono), monospace' } as const;

export default function HeroRedesign() {
  return (
    <section className="relative overflow-hidden flex items-center min-h-[90vh]">
      <div className="grid-bg grid-bg-dark absolute inset-0" aria-hidden="true" />
      <div
        className="absolute bottom-0 inset-x-0 h-40 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, transparent, #0a0a0a)' }}
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          {/* LEFT — copy (H1 renders immediately; no entrance gate) */}
          <div>
            <div className="mb-7 inline-flex items-center gap-2 border border-amber/40 bg-background/50 px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px rgba(52,211,153,0.5)' }} />
              <span className="text-micro text-white">Live on Base mainnet</span>
            </div>

            <h1
              className="brass-gradient-text leading-[0.92]"
              style={{ fontSize: 'clamp(2.75rem, 5.4vw, 5.25rem)', letterSpacing: '-0.02em' }}
            >
              Your AI is about<br />to spend money.
            </h1>

            <p className="mt-7 max-w-xl text-lg font-light leading-relaxed" style={{ color: '#aaa' }}>
              Ambr is the accountability record for autonomous agents. It issues{' '}
              <span className="text-text-primary">Agent Mandates</span> — binding authorizations that
              set spend limits and approved actions, with a cryptographic record of every decision.
            </p>

            <div className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <Button href="/activate" size="lg">Get an API key</Button>
              <Button href="/developers" variant="secondary" size="lg">See how it works</Button>
            </div>

            <div className="mt-9 flex items-center gap-2 text-xs" style={{ color: '#9a9a9a' }}>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px rgba(52,211,153,0.5)' }} />
              <span style={mono}>Live on Base L2</span>
            </div>
          </div>

          {/* RIGHT — the "three lines of code" + a signed mandate (delivers the dev promise) */}
          <div>
            <div className="border border-amber/30 bg-surface">
              <div className="flex items-center justify-between border-b border-amber/20 px-4 py-2.5">
                <span className="text-micro" style={{ color: 'var(--color-amber)' }}>{'// three lines of code'}</span>
                <div className="flex gap-1.5" aria-hidden="true">
                  <span className="h-2 w-2 rounded-full" style={{ background: '#2E2E2E' }} />
                  <span className="h-2 w-2 rounded-full" style={{ background: '#2E2E2E' }} />
                  <span className="h-2 w-2 rounded-full" style={{ background: 'var(--color-amber)' }} />
                </div>
              </div>
              <div className="overflow-x-auto p-5 text-[13px] leading-[1.8]" style={{ ...mono, color: '#cfcabd' }}>
                <div><span style={{ color: '#8a8577' }}>import</span> {'{ Ambr }'} <span style={{ color: '#8a8577' }}>from</span> <span style={{ color: '#c6a87c' }}>&apos;@ambr/sdk&apos;</span></div>
                <div><span style={{ color: '#8a8577' }}>const</span> ambr = <span style={{ color: '#8a8577' }}>new</span> <span style={{ color: '#e8d9bb' }}>Ambr</span>(AMBR_KEY)</div>
                <div className="mt-3"><span style={{ color: '#8a8577' }}>const</span> mandate = <span style={{ color: '#8a8577' }}>await</span> ambr.<span style={{ color: '#e8d9bb' }}>authorize</span>({'{'}</div>
                <div className="pl-5">agent, limit: <span style={{ color: '#c6a87c' }}>&apos;500 USDC&apos;</span>, expires: <span style={{ color: '#c6a87c' }}>&apos;24h&apos;</span></div>
                <div>{'}'}) <span style={{ color: '#34D399' }}>{'// → signed · on-chain · verifiable'}</span></div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border border-amber/30 bg-surface px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px rgba(52,211,153,0.5)' }} />
                <span className="text-micro" style={{ color: 'var(--color-amber)' }}>Agent Mandate · Active</span>
              </div>
              <span className="text-[11px]" style={{ ...mono, color: '#777' }}>≤ $500 USDC · 24h · revocable</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
