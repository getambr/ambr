import ScrollReveal from '@/components/ui/ScrollReveal';

const humanData = [
  { label: 'Format', value: 'Markdown / PDF Output', highlight: false },
  { label: 'Jurisdiction', value: 'Delaware, US (Default)', highlight: false },
  { label: 'Cryptographic Tie', value: 'SHA-256 Hash Included', highlight: true },
];

const machineData = [
  { label: 'Format', value: 'JSON', highlight: false },
  { label: 'State Storage', value: 'Base L2 ERC-721', highlight: false },
  { label: 'Agent Interface', value: 'REST + A2A + MCP', highlight: true },
];

export default function ArchitecturePanel() {
  return (
    <ScrollReveal>
      <div className="grid grid-cols-1 lg:grid-cols-2 border border-amber/60">
        {/* Human Readable */}
        <div className="p-8 lg:p-12 lg:border-r border-amber/60">
          <p className="text-micro block mb-8" style={{ color: '#666' }}>
            // LAYER 01: LEGAL PROSE
          </p>
          <h3 className="text-4xl text-amber mb-6 lg:text-5xl">
            Human<br />Readable
          </h3>
          <p className="text-[#999] mb-10 text-lg max-w-[400px]">
            Structured natural language agreements formatted for jurisdictional
            compliance and traditional legal review.
          </p>
          <ul className="space-y-0">
            {humanData.map((row) => (
              <li
                key={row.label}
                className="flex justify-between py-4 border-b border-amber/20 font-mono text-xs"
              >
                <span className="text-[#666] uppercase">{row.label}</span>
                <span className={row.highlight ? 'text-amber' : 'text-text-primary'}>
                  {row.value}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Agent Parsable */}
        <div className="relative p-8 lg:p-12 border-t lg:border-t-0 border-amber/60">
          <div className="grid-bg grid-bg-dark opacity-50" />
          <div className="relative z-10">
            <p className="text-micro block mb-8">
              // LAYER 02: MACHINE LOGIC
            </p>
            <h3 className="text-4xl text-text-primary mb-6 lg:text-5xl">
              Agent<br />Parsable
            </h3>
            <p className="text-[#999] mb-10 text-lg max-w-[400px]">
              Strict JSON-schema parameters defining execution bounds, spending
              limits, and authorized counterparties.
            </p>
            <ul className="space-y-0">
              {machineData.map((row) => (
                <li
                  key={row.label}
                  className="flex justify-between py-4 border-b border-amber/20 font-mono text-xs"
                >
                  <span className="text-[#666] uppercase">{row.label}</span>
                  <span className={row.highlight ? 'text-amber' : 'text-text-primary'}>
                    {row.value}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </ScrollReveal>
  );
}
