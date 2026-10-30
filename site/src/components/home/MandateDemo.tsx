'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import Reveal from '@/components/ui/Reveal';

const serif = { fontFamily: 'var(--font-instrument-serif), serif' } as const;
const mono = { fontFamily: 'var(--font-jetbrains-mono), monospace' } as const;

const TX = [
  { label: 'Cloud compute · AWS', cat: 'compute', amount: 1200 },
  { label: 'API credits · model calls', cat: 'compute', amount: 800 },
  { label: 'Ad spend · campaign', cat: 'marketing', amount: 3000 },
  { label: 'Bulk inventory order', cat: 'procurement', amount: 7500 },
  { label: 'Contractor payout', cat: 'payroll', amount: 4200 },
];

const usd = (n: number) => '$' + n.toLocaleString('en-US');

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function MandateDemo() {
  const [cap, setCap] = useState(5000);
  const [hash, setHash] = useState('');

  const mandate = useMemo(
    () => ({
      contract_type: 'delegation_of_authority',
      principal: 'Acme Logistics',
      agent: 'acme-delegate-bot',
      scope: {
        spending_limit: { amount: cap, currency: 'USD', period: 'month' },
        authorized_categories: ['compute', 'marketing', 'payroll'],
      },
    }),
    [cap],
  );

  useEffect(() => {
    let alive = true;
    sha256Hex(JSON.stringify(mandate)).then((h) => {
      if (alive) setHash(h);
    });
    return () => {
      alive = false;
    };
  }, [mandate]);

  const evaluated = useMemo(() => {
    type Row = { label: string; cat: string; amount: number; authorized: boolean; reason: string };
    return TX.reduce(
      (acc: { rows: Row[]; running: number }, t) => {
        const allowedCat = mandate.scope.authorized_categories.includes(t.cat);
        const fits = acc.running + t.amount <= cap;
        const authorized = allowedCat && fits;
        const row: Row = { ...t, authorized, reason: !allowedCat ? 'category not in mandate scope' : !fits ? 'exceeds monthly cap' : '' };
        return { rows: [...acc.rows, row], running: authorized ? acc.running + t.amount : acc.running };
      },
      { rows: [] as Row[], running: 0 },
    ).rows;
  }, [cap, mandate]);

  const totalAuthorized = evaluated.reduce((s, e) => (e.authorized ? s + e.amount : s), 0);
  const blocked = evaluated.filter((e) => !e.authorized).length;
  const pct = cap > 0 ? Math.min(100, Math.round((totalAuthorized / cap) * 100)) : 0;

  return (
    <section className="relative px-6 py-28 sm:px-10 lg:px-16" style={{ background: '#0a0a0a', color: '#f4f4f0' }}>
      <div className="mx-auto max-w-[1500px]">
        <Reveal>
          <div style={{ height: 1, background: 'linear-gradient(to right, rgba(198,168,124,0.45), transparent)' }} />
        </Reveal>
        <Reveal delay={0.05}>
          <p className="mt-6 text-[11px] uppercase" style={{ ...mono, color: '#c6a87c', letterSpacing: '0.3em' }}>Mandate scope — drag the cap</p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="mt-5 max-w-3xl" style={{ ...serif, fontSize: 'clamp(2.4rem, 5vw, 4.4rem)', lineHeight: 0.98, letterSpacing: '-0.02em' }}>
            Set the authority. Prove what was agreed.
          </h2>
        </Reveal>
        <Reveal delay={0.16}>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed" style={{ color: '#a39b8c' }}>
            Drag the cap and the mandate rewrites, rehashes and re-signs. This is the record your signer
            checks before it releases funds, and the record you hold afterwards.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-px lg:grid-cols-[0.9fr_1.1fr]">
          {/* control */}
          <Reveal delay={0.2}>
            <div className="border-t pt-7 lg:pr-10" style={{ borderColor: 'rgba(198,168,124,0.4)' }}>
              <p className="text-[11px] uppercase" style={{ ...mono, color: '#c6a87c', letterSpacing: '0.2em' }}>Agent mandate · acme-delegate-bot</p>

              <div className="mt-8 flex items-baseline justify-between">
                <span className="text-[11px] uppercase" style={{ ...mono, color: '#8a8170', letterSpacing: '0.14em' }}>Spend cap</span>
                <span style={{ ...serif, fontSize: 38, color: '#e8d9bb' }}>{usd(cap)}<span className="text-[13px]" style={{ ...mono, color: '#8a8170' }}> /mo</span></span>
              </div>
              <input
                type="range"
                min={0}
                max={10000}
                step={250}
                value={cap}
                onChange={(e) => setCap(Number(e.target.value))}
                aria-label="Monthly spend cap"
                className="mt-4 w-full"
                style={{ accentColor: '#c6a87c' }}
              />

              <div className="mt-8">
                <div className="flex items-center justify-between text-[11px] uppercase" style={{ ...mono, color: '#8a8170', letterSpacing: '0.12em' }}>
                  <span>Authorized this month</span>
                  <span style={{ color: '#c6a87c' }}>{usd(totalAuthorized)} / {usd(cap)}</span>
                </div>
                <div className="mt-2 h-1.5 w-full" style={{ background: 'rgba(198,168,124,0.15)' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: '#c6a87c', transition: 'width .45s cubic-bezier(.22,1,.36,1)' }} />
                </div>
                <p className="mt-3 text-[11px] uppercase" style={{ ...mono, color: blocked ? '#c6a87c' : '#6f675b', letterSpacing: '0.12em' }}>
                  {blocked} transaction{blocked === 1 ? '' : 's'} outside the mandate&apos;s scope
                </p>
              </div>

              <div className="mt-8 border-t pt-5" style={{ borderColor: 'rgba(198,168,124,0.15)' }}>
                <p className="text-[10px] uppercase" style={{ ...mono, color: '#6f675b', letterSpacing: '0.16em' }}>Mandate fingerprint · SHA-256</p>
                <p className="mt-2 break-all text-[12px]" style={{ ...mono, color: '#c6a87c' }}>{hash ? hash.slice(0, 40) + '…' : 'computing…'}</p>
                <p className="mt-2 text-[10px] uppercase" style={{ ...mono, color: '#6f675b', letterSpacing: '0.14em' }}>recomputed live as the cap changes</p>
              </div>
            </div>
          </Reveal>

          {/* transaction feed */}
          <Reveal delay={0.28}>
            <div className="border-t pt-7 lg:pl-10" style={{ borderColor: 'rgba(198,168,124,0.4)' }}>
              <p className="text-[11px] uppercase" style={{ ...mono, color: '#8a8170', letterSpacing: '0.2em' }}>Example agent activity</p>
              <div className="mt-3">
                {evaluated.map((e, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 border-b py-4" style={{ borderColor: 'rgba(198,168,124,0.12)', opacity: e.authorized ? 1 : 0.65 }}>
                    <div className="min-w-0">
                      <div className="truncate text-[15px]" style={{ ...serif, color: '#f4f4f0' }}>{e.label}</div>
                      <div className="text-[10px] uppercase" style={{ ...mono, color: '#8a8170', letterSpacing: '0.12em' }}>
                        {usd(e.amount)} · {e.cat}{e.authorized ? '' : ` · ${e.reason}`}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {e.authorized ? (
                        <>
                          <div className="inline-flex items-center justify-end gap-1.5 text-[11px] uppercase" style={{ ...mono, color: '#c6a87c', letterSpacing: '0.14em' }}><Check size={12} strokeWidth={2.5} aria-hidden /> Authorized</div>
                          <div className="text-[10px]" style={{ ...mono, color: '#6f675b' }}>within scope</div>
                        </>
                      ) : (
                        <div className="inline-flex items-center justify-end gap-1.5 text-[11px] uppercase" style={{ ...mono, color: '#9a7d52', letterSpacing: '0.14em' }}><X size={12} strokeWidth={2.5} aria-hidden /> Out of scope</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-[12px] leading-relaxed" style={{ color: '#8a8170' }}>
                An illustration, not a live agent. Ambr never holds your keys, so it cannot stop a transaction. It makes
                authority <span style={{ color: '#c6a87c' }}>provable</span>: a signed, hashed mandate your signer reads
                before it releases funds, and a permanent record on Base&nbsp;L2 of what was authorised.
              </p>
              <a
                href="/activate"
                className="mt-5 inline-block text-[11px] uppercase transition-colors hover:text-[#f4f4f0]"
                style={{ ...mono, color: '#c6a87c', letterSpacing: '0.16em' }}
              >
                Write your first mandate&nbsp;→
              </a>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
