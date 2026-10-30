const tokens = ['x402', 'A2A', 'cNFT', 'Base L2', 'MCP', 'ERC-721', 'SHA-256', 'USDC', 'Ricardian', 'Agent Mandate'];

/** Infinite horizontal ribbon of protocol tokens. Pure CSS (paused under reduced-motion via globals). */
export default function TokenMarquee() {
  const row = [...tokens, ...tokens];
  return (
    <div className="relative overflow-hidden border-y border-amber/15 bg-surface/30 py-5" aria-hidden="true">
      <div
        className="ambr-marquee flex w-max items-center gap-12 whitespace-nowrap"
        style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
      >
        {row.map((t, i) => (
          <span key={i} className="flex items-center gap-12 text-xs uppercase tracking-wider" style={{ color: 'var(--color-amber)' }}>
            {t}
            <span style={{ color: '#3a3a36' }}>/</span>
          </span>
        ))}
      </div>
    </div>
  );
}
