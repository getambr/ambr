'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import gsap from 'gsap';
import { FileText, Braces, ShieldCheck, Wallet } from 'lucide-react';

const serif = { fontFamily: 'var(--font-instrument-serif), serif' } as const;
const sans = { fontFamily: 'var(--font-inter), sans-serif' } as const;
const mono = { fontFamily: 'var(--font-jetbrains-mono), monospace' } as const;

// human-readable Ricardian view (the client reads a document)
const HUMAN_FACE: { t: 'title' | 'h' | 'b'; s: string }[] = [
  { t: 'h', s: 'RICARDIAN CONTRACT' },
  { t: 'title', s: 'Delegation of Authority' },
  { t: 'h', s: 'PARTIES' },
  { t: 'b', s: 'Principal — you, via connected wallet' },
  { t: 'b', s: 'Agent — 0x20cEE8…db250' },
  { t: 'h', s: 'SCOPE' },
  { t: 'b', s: 'Purchase compute and ad-spend only' },
  { t: 'b', s: 'Spending limit $5,000 per calendar month' },
  { t: 'b', s: 'Per-transaction cap $500' },
  { t: 'b', s: 'Max liability $10,000' },
  { t: 'h', s: 'DURATION' },
  { t: 'b', s: '12 months · renewable' },
];

// machine-readable view (the agent reads code)
const JSON_FACE = [
  '{',
  '  "contract_type": "delegation_of_authority",',
  '  "principal": "0x9d2f…4b1a",',
  '  "agent": "0x20cEE8…db250",',
  '  "scope": {',
  '    "actions": ["purchase"],',
  '    "categories": ["compute", "ad-spend"],',
  '    "spending_limit": {',
  '      "amount": 5000, "currency": "USD",',
  '      "period": "month" },',
  '    "per_tx": 500,',
  '    "max_liability": 10000',
  '  },',
  '  "duration_months": 12',
  '}',
];

const BEAT = 800; // ms per deploy beat

export default function MandateMorph({ active, hash }: { active: boolean; hash: string }) {
  const reduce = useReducedMotion();
  const scanRef = useRef<HTMLDivElement>(null);
  const [beat, setBeat] = useState(0);
  const [scrambled, setScrambled] = useState('');

  // beat timeline — pinned to the deploy lifecycle (each step ~BEAT apart)
  useEffect(() => {
    if (!active) {
      const t = setTimeout(() => { setBeat(0); setScrambled(''); }, 0);
      return () => clearTimeout(t);
    }
    if (reduce) {
      const t = setTimeout(() => { setBeat(6); setScrambled((hash || 'a1b2c3d4e5f67890ab').slice(0, 18)); }, 0);
      return () => clearTimeout(t);
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i <= 6; i++) timers.push(setTimeout(() => setBeat(i), i * BEAT));
    let intv: ReturnType<typeof setInterval> | undefined;
    timers.push(setTimeout(() => {
      const hex = '0123456789abcdef';
      let k = 0;
      intv = setInterval(() => {
        k += 1;
        if (k > 16) { clearInterval(intv); setScrambled((hash || 'a1b2c3d4e5f67890ab').slice(0, 18)); return; }
        setScrambled(Array.from({ length: 18 }, () => hex[Math.floor(Math.random() * 16)]).join(''));
      }, 55);
    }, 2 * BEAT));
    return () => { timers.forEach(clearTimeout); if (intv) clearInterval(intv); };
  }, [active, reduce, hash]);

  // scanline sweep over the JSON face on the ECDSA-SIGN beat (the "AI reading the code" gesture)
  useEffect(() => {
    if (beat === 3 && !reduce && scanRef.current) {
      gsap.fromTo(scanRef.current, { clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)', duration: 0.6, ease: 'power2.inOut' });
    }
  }, [beat, reduce]);

  const deg = reduce ? 360 : beat <= 0 ? 0 : beat <= 3 ? 180 : 360;
  const shaText = scrambled || (hash ? hash.slice(0, 18) : '—');

  const faceStyle = { position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', overflow: 'hidden' } as const;

  return (
    <div className="pointer-events-none absolute inset-0 z-20" style={{ perspective: 1400 }} aria-hidden="true">
      <AnimatePresence>
        {active && (
          <motion.div
            key="morph-card"
            initial={{ opacity: 0, scale: 0.97, rotateY: 0 }}
            animate={{ opacity: 1, scale: 1, rotateY: deg }}
            exit={{ opacity: 0, scale: 0.985, transition: { duration: 0.3 } }}
            transition={{ opacity: { duration: 0.18 }, scale: { duration: 0.25 }, rotateY: reduce ? { duration: 0 } : { type: 'spring', stiffness: 80, damping: 22, mass: 1.2 } }}
            style={{ position: 'absolute', inset: 0, minHeight: 360, transformStyle: 'preserve-3d', background: '#0c0b09', border: '1px solid rgba(198,168,124,0.35)' }}
          >
        {/* HUMAN FACE — the client reads a document */}
        <div className="flex flex-col p-5 sm:p-6" style={{ ...faceStyle, transform: 'rotateY(0deg)' }}>
          <div className="mb-3.5 flex items-center gap-2">
            <FileText className="h-3.5 w-3.5" style={{ color: '#c6a87c' }} strokeWidth={1.5} />
            <span className="text-[10px] uppercase" style={{ ...mono, color: '#c6a87c', letterSpacing: '0.18em' }}>Human · what the client reads</span>
          </div>
          <div className="flex-1">
            {HUMAN_FACE.map((l, i) => {
              if (l.t === 'title') return <div key={i} style={{ ...serif, fontSize: 19, lineHeight: 1.2, color: '#f4f4f0', marginBottom: 8 }}>{l.s}</div>;
              if (l.t === 'h') return <div key={i} className="uppercase" style={{ ...mono, fontSize: 9, letterSpacing: '0.2em', color: '#c6a87c', marginTop: 9, marginBottom: 2 }}>{l.s}</div>;
              return <div key={i} style={{ ...sans, fontSize: 12.5, lineHeight: 1.55, color: '#cfc8ba' }}>{l.s}</div>;
            })}
          </div>
          {beat >= 4 && (
            <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 18 }} className="mt-3 inline-flex items-center gap-2 self-start px-3 py-1.5" style={{ border: '1px solid rgba(198,168,124,0.4)' }}>
              <ShieldCheck className="h-3.5 w-3.5" style={{ color: '#34D399' }} strokeWidth={1.5} />
              <span className="text-[10px] uppercase" style={{ ...mono, color: '#e8d9bb', letterSpacing: '0.14em' }}>cNFT · ERC-721 · Base L2</span>
            </motion.div>
          )}
          {beat >= 5 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2.5 flex items-center gap-2">
              <Wallet className="h-3.5 w-3.5 shrink-0" style={{ color: '#c6a87c' }} strokeWidth={1.5} />
              <span className="truncate text-[10px]" style={{ ...mono, color: '#8a8170', letterSpacing: '0.04em' }}>→ wallet · getamber.dev/reader/{shaText}…</span>
            </motion.div>
          )}
          {beat >= 6 && (
            <div className="mt-2.5 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#34D399' }} />
              <span className="text-[10px] uppercase" style={{ ...mono, color: '#34D399', letterSpacing: '0.16em' }}>live · /reader</span>
            </div>
          )}
        </div>

        {/* MACHINE FACE — the agent reads code */}
        <div className="flex flex-col p-5 sm:p-6" style={{ ...faceStyle, transform: 'rotateY(180deg)' }}>
          <div className="mb-3.5 flex items-center gap-2">
            <Braces className="h-3.5 w-3.5" style={{ color: '#c6a87c' }} strokeWidth={1.5} />
            <span className="text-[10px] uppercase" style={{ ...mono, color: '#c6a87c', letterSpacing: '0.18em' }}>Machine · what the agent executes</span>
          </div>
          <div className="flex-1">
            {JSON_FACE.map((l, i) => (
              <div key={i} style={{ ...mono, fontSize: 11, lineHeight: 1.6, color: '#9bb5a2', whiteSpace: 'pre' }}>{l || ' '}</div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between border-t pt-2.5" style={{ borderColor: 'rgba(198,168,124,0.15)' }}>
            <span className="text-[9px] uppercase" style={{ ...mono, color: '#6f675b', letterSpacing: '0.14em' }}>SHA-256</span>
            <span className="text-[11px]" style={{ ...mono, color: beat >= 2 ? '#c6a87c' : '#4a463e', textShadow: beat >= 2 ? '0 0 8px rgba(198,168,124,0.4)' : 'none' }}>{shaText}…</span>
          </div>
          {beat >= 3 && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-2 space-y-0.5">
              <div className="flex items-center gap-1.5 text-[9.5px]" style={{ ...mono, color: '#8a8170' }}><span style={{ color: '#34D399' }}>✓</span> principal 0x9d2f…4b1a [signed]</div>
              <div className="flex items-center gap-1.5 text-[9.5px]" style={{ ...mono, color: '#8a8170' }}><span style={{ color: '#34D399' }}>✓</span> agent 0x20cEE8…db250 [signed]</div>
            </motion.div>
          )}
          <div ref={scanRef} className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent, rgba(198,168,124,0.22), transparent)', willChange: 'clip-path', clipPath: 'inset(0 0 100% 0)' }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
