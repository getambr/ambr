import Reveal from '@/components/ui/Reveal';

const serif = { fontFamily: 'var(--font-instrument-serif), serif' } as const;
const mono = { fontFamily: 'var(--font-jetbrains-mono), monospace' } as const;

const human = [
  ['Format', 'Markdown / PDF'],
  ['Jurisdiction', 'Delaware, US (default)'],
  ['Cryptographic tie', 'SHA-256 hash'],
];
const agent = [
  ['Format', 'Strict JSON'],
  ['State', 'Base L2 · ERC-721'],
  ['Interface', 'REST · A2A · MCP'],
];

function Column({ tag, title, rows, accent }: { tag: string; title: string; rows: string[][]; accent: boolean }) {
  return (
    <div className="border-t pt-7" style={{ borderColor: accent ? 'rgba(198,168,124,0.55)' : 'rgba(198,168,124,0.25)' }}>
      <p className="text-[11px] uppercase" style={{ ...mono, color: accent ? '#c6a87c' : '#8a8170', letterSpacing: '0.22em' }}>{tag}</p>
      <h3 className="mt-3" style={{ ...serif, fontSize: 'clamp(2rem, 3.4vw, 3rem)', lineHeight: 1, color: accent ? '#e8d9bb' : '#f4f4f0' }}>{title}</h3>
      <dl className="mt-7">
        {rows.map(([k, v], i) => (
          <div key={i} className="flex items-center justify-between border-b py-3" style={{ borderColor: 'rgba(198,168,124,0.12)' }}>
            <dt className="text-[11px] uppercase" style={{ ...mono, color: '#8a8170', letterSpacing: '0.14em' }}>{k}</dt>
            <dd className="text-[12px]" style={{ ...mono, color: '#cfc6b4' }}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function MandateDual() {
  return (
    <section className="relative px-6 py-28 sm:px-10 lg:px-16" style={{ background: '#0a0a0a', color: '#f4f4f0' }}>
      <div className="mx-auto max-w-[1500px]">
        <Reveal><div style={{ height: 1, background: 'linear-gradient(to right, rgba(198,168,124,0.45), transparent)' }} /></Reveal>
        <Reveal delay={0.05}>
          <p className="mt-6 text-[11px] uppercase" style={{ ...mono, color: '#c6a87c', letterSpacing: '0.3em' }}>§ 03 — One agreement, two readers</p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="mt-5 max-w-4xl" style={{ ...serif, fontSize: 'clamp(2.4rem, 5vw, 4.4rem)', lineHeight: 0.98, letterSpacing: '-0.02em' }}>
            Human-readable. <span className="block sm:inline" style={{ color: '#c6a87c' }}>Agent-parsable.</span>
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-12 lg:grid-cols-2">
          <Reveal delay={0.15}>
            <Column tag="What your lawyers see" title="Plain-language agreement" rows={human} accent />
          </Reveal>
          <Reveal delay={0.25}>
            <Column tag="What your agent executes" title="The same terms, as data" rows={agent} accent={false} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
