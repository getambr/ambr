'use client';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const mono = { fontFamily: 'var(--font-jetbrains-mono), monospace' } as const;

const RICARDIAN = [
  'RICARDIAN CONTRACT — DELEGATION OF AUTHORITY',
  'PRINCIPAL DECLARATION',
  'Principal: Acme Logistics Ltd. (company)',
  'Agent: 0x20cEE8…db250  ·  authorized representative',
  '',
  'SCOPE OF DELEGATION',
  '1. Authorized to purchase compute and ad-spend',
  '2. Spending limit: $5,000 per calendar month',
  '3. Per-transaction cap: $500',
  '4. May NOT accept liability exceeding $10,000',
  '',
  'LIABILITY',
  '5. Principal assumes liability within authorized scope',
  '6. Actions outside scope are void and non-binding',
  '7. Dispute resolution: IETF ADP arbitration',
  '',
  'DURATION',
  'Start 2026-02-25  ·  End 2027-02-25  ·  12 mo, renewable',
];
const JSONL = [
  '{',
  '  "contract_type": "delegation_of_authority",',
  '  "version": "1.0",',
  '  "principal_declaration": {',
  '    "agent_id": "0x20cEE8…db250",',
  '    "principal_type": "company"',
  '  },',
  '  "scope": {',
  '    "authorized_actions": ["purchase"],',
  '    "spending_limit": {',
  '      "amount": 5000, "currency": "USD",',
  '      "period": "month"',
  '    },',
  '    "per_tx": 500, "max_liability": 10000',
  '  },',
  '  "duration": { "months": 12, "renewable": true }',
  '}',
];
const STEPS = ['CANONICALIZE', 'SHA-256', 'ECDSA SIGN', 'MINT cNFT · BASE L2', 'LANDS IN WALLET', 'LIVE · /reader'];

function Column({ lines, side, dur, reduce }: { lines: string[]; side: 'left' | 'right'; dur: number; reduce: boolean | null }) {
  const doubled = [...lines, ...lines];
  return (
    <div
      className="absolute inset-y-0 hidden overflow-hidden lg:block"
      style={{
        [side]: 0,
        width: 'min(34%, 460px)',
        maskImage: `linear-gradient(${side === 'left' ? 'to right' : 'to left'}, rgba(0,0,0,0.9), transparent), linear-gradient(to bottom, transparent, #000 16%, #000 84%, transparent)`,
        WebkitMaskImage: `linear-gradient(${side === 'left' ? 'to right' : 'to left'}, rgba(0,0,0,0.9), transparent), linear-gradient(to bottom, transparent, #000 16%, #000 84%, transparent)`,
        maskComposite: 'intersect',
        WebkitMaskComposite: 'source-in',
        padding: side === 'left' ? '0 0 0 1.5rem' : '0 1.5rem 0 0',
      }}
      aria-hidden="true"
    >
      <div style={{ animation: reduce ? 'none' : `cbDrift ${dur}s linear infinite` }}>
        {doubled.map((l, i) => (
          <div key={i} style={{ ...mono, fontSize: 11, lineHeight: 2, color: '#c6a87c', opacity: 0.08, whiteSpace: 'pre', textAlign: side === 'right' ? 'right' : 'left' }}>{l || ' '}</div>
        ))}
      </div>
    </div>
  );
}

export default function ContractBackdrop({ active, cycle }: { active: boolean; cycle: number }) {
  const reduce = useReducedMotion();
  const [hash, setHash] = useState('');

  useEffect(() => {
    if (!active) {
      const t = setTimeout(() => setHash(''), 0);
      return () => clearTimeout(t);
    }
    if (reduce) {
      const t = setTimeout(() => setHash('a1b2c3d4e5f67890ab'), 0);
      return () => clearTimeout(t);
    }
    const hex = '0123456789abcdef';
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      if (i > 16) { clearInterval(id); setHash('a1b2c3d4e5f67890ab'); return; }
      setHash(Array.from({ length: 18 }, () => hex[Math.floor(Math.random() * 16)]).join(''));
    }, 55);
    return () => clearInterval(id);
  }, [active, cycle, reduce]);

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      <style>{`@keyframes cbDrift{from{transform:translateY(0)}to{transform:translateY(-50%)}}`}</style>

      <Column lines={RICARDIAN} side="left" dur={52} reduce={reduce} />
      <Column lines={JSONL} side="right" dur={64} reduce={reduce} />

      {/* deploy lifecycle ticker (keyed to the demo's deploy moment) */}
      <div className="absolute inset-x-0 bottom-3 hidden flex-wrap items-center justify-center gap-x-4 gap-y-1 px-6 lg:flex">
        {STEPS.map((s, i) => (
          <motion.span
            key={s}
            className="text-[10px] uppercase"
            style={{ ...mono, letterSpacing: '0.2em' }}
            animate={{ color: active && !reduce ? '#c6a87c' : '#332f27', opacity: active ? 1 : 0.55 }}
            transition={{ delay: active && !reduce ? i * 0.45 : 0, duration: 0.5 }}
          >
            {s}{i < STEPS.length - 1 ? '  →' : ''}
          </motion.span>
        ))}
        <motion.span className="w-full text-center text-[10px]" style={{ ...mono, color: '#6f675b', letterSpacing: '0.14em' }} animate={{ opacity: active ? 1 : 0 }} transition={{ duration: 0.4, delay: active ? 0.9 : 0 }}>
          {active ? `sha256 ${hash}…  ·  cNFT minted → wallet  ·  getamber.dev/reader` : ''}
        </motion.span>
      </div>
    </div>
  );
}
