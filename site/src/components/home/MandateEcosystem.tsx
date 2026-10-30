import Reveal from '@/components/ui/Reveal';

const serif = { fontFamily: 'var(--font-instrument-serif), serif' } as const;
const mono = { fontFamily: 'var(--font-jetbrains-mono), monospace' } as const;

const items = [
  { name: 'x402', layer: 'Payments', status: 'Live', accent: false, desc: 'How agents pay. HTTP-native multi-token payments billed per call within the contract terms.' },
  { name: 'A2A Protocol', layer: 'Discovery', status: 'Live', accent: false, desc: 'How agents discover Ambr. Agent-to-agent discovery + JSON-RPC, published at /.well-known/agent.json.' },
  { name: 'ZK Identity', layer: 'Trust', status: 'Beta', accent: true, desc: 'Prove who an agent is — privately. Identity attestation via zero-knowledge proofs.' },
  { name: 'Self-custody wallet', layer: 'Custody', status: 'Building next', accent: true, desc: 'Provisioned on sign-up — the agent self-keys, the principal gets an email-provisioned wallet. Delegate to an agent without MetaMask or a seed phrase.' },
];

export default function MandateEcosystem() {
  return (
    <section className="relative px-6 py-28 sm:px-10 lg:px-16" style={{ background: '#0a0a0a', color: '#f4f4f0' }}>
      <div className="mx-auto max-w-[1500px]">
        <Reveal><div style={{ height: 1, background: 'linear-gradient(to right, rgba(198,168,124,0.45), transparent)' }} /></Reveal>
        <Reveal delay={0.05}>
          <p className="mt-6 text-[11px] uppercase" style={{ ...mono, color: '#c6a87c', letterSpacing: '0.3em' }}>§ 06 — Built for the stack</p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="mt-5 max-w-3xl" style={{ ...serif, fontSize: 'clamp(2.4rem, 5vw, 4.4rem)', lineHeight: 0.98, letterSpacing: '-0.02em' }}>
            The agent-commerce stack.
          </h2>
        </Reveal>

        <div className="mt-14">
          {items.map((it, i) => (
            <Reveal key={it.name} delay={i * 0.08}>
              <div className="grid items-baseline gap-3 border-t py-7 sm:grid-cols-[minmax(0,1fr)_2fr_auto]" style={{ borderColor: 'rgba(198,168,124,0.22)' }}>
                <div style={{ ...serif, fontSize: 'clamp(1.4rem, 2.4vw, 2rem)', color: '#f4f4f0' }}>{it.name}</div>
                <p className="text-[13px] leading-relaxed" style={{ color: '#a39b8c' }}>{it.desc}</p>
                <div className="flex items-center gap-3 sm:justify-end">
                  <span className="text-[10px] uppercase" style={{ ...mono, color: '#8a8170', letterSpacing: '0.16em' }}>{it.layer}</span>
                  <span className="inline-flex items-center gap-1.5 text-[10px] uppercase" style={{ ...mono, letterSpacing: '0.16em', color: it.accent ? '#e8c547' : '#c6a87c' }}>
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'currentColor' }} aria-hidden />
                    {it.status}
                  </span>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
