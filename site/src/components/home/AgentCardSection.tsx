'use client';

import { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';
import Reveal from '@/components/ui/Reveal';
import { useAgentCard } from './useAgentCard';

const serif = { fontFamily: 'var(--font-instrument-serif), serif' } as const;
const mono = { fontFamily: 'var(--font-jetbrains-mono), monospace' } as const;

/**
 * Homepage section showing the live Ambr A2A Agent Card.
 * Fetches live data from /.well-known/agent.json (via useAgentCard).
 * Editorial styling + balanced 2-col layout match the Mandate* sections
 * (see MandateDual / MandateDemo).
 */
export default function AgentCardSection() {
  const { data, loading, stats } = useAgentCard();
  const [copied, setCopied] = useState(false);

  function copyUrl() {
    navigator.clipboard.writeText('https://getamber.dev/.well-known/agent.json');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="relative px-6 py-28 sm:px-10 lg:px-16" style={{ background: '#0a0a0a', color: '#f4f4f0' }}>
      <div className="mx-auto max-w-[1500px]">
        <Reveal><div style={{ height: 1, background: 'linear-gradient(to right, rgba(198,168,124,0.45), transparent)' }} /></Reveal>
        <Reveal delay={0.05}>
          <p className="mt-6 text-[11px] uppercase" style={{ ...mono, color: '#c6a87c', letterSpacing: '0.3em' }}>§ 05 — A2A Protocol</p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="mt-5 max-w-3xl" style={{ ...serif, fontSize: 'clamp(2.4rem, 5vw, 4.4rem)', lineHeight: 0.98, letterSpacing: '-0.02em' }}>
            Discoverable by any AI agent.
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-12 lg:grid-cols-2 lg:items-start">
          {/* Left: context */}
          <Reveal delay={0.14}>
            <div className="border-t pt-8 lg:pr-10" style={{ borderColor: 'rgba(198,168,124,0.4)' }}>
              <p className="text-[11px] uppercase" style={{ ...mono, color: '#c6a87c', letterSpacing: '0.22em' }}>The discovery surface</p>
              <h3 className="mt-3" style={{ ...serif, fontSize: 'clamp(1.8rem, 3.2vw, 2.6rem)', lineHeight: 1, color: '#f4f4f0' }}>
                A public agent identity.
              </h3>
              <p className="mt-6 max-w-md text-[15px] leading-relaxed" style={{ color: '#a39b8c' }}>
                Ambr exposes a standard A2A Agent Card, so other agents can find it, check its capabilities,
                and initiate mandate workflows. No human intermediary required.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-6">
                <a
                  href="/developers"
                  data-cursor
                  className="inline-flex items-center gap-2 text-[12px] uppercase transition-colors hover:text-text-primary"
                  style={{ ...mono, color: '#c6a87c', letterSpacing: '0.16em' }}
                >
                  Integration docs <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <button
                  onClick={copyUrl}
                  className="inline-flex cursor-pointer items-center gap-2 text-[12px] uppercase transition-colors hover:text-text-primary"
                  style={{ ...mono, color: copied ? '#34D399' : '#8a8170', letterSpacing: '0.16em' }}
                >
                  {copied ? (<><Check className="h-3.5 w-3.5" /> Copied</>) : (<><Copy className="h-3.5 w-3.5" /> Copy discovery URL</>)}
                </button>
              </div>
            </div>
          </Reveal>

          {/* Right: the live A2A card (fills its half) */}
          <Reveal delay={0.2}>
            <div className="relative w-full" style={{ background: '#0c0b09', border: '1px solid rgba(198,168,124,0.22)' }}>
              {/* corner markers */}
              <span className="pointer-events-none absolute left-2 top-2 h-2.5 w-2.5 border-l border-t" style={{ borderColor: 'rgba(198,168,124,0.5)' }} />
              <span className="pointer-events-none absolute right-2 top-2 h-2.5 w-2.5 border-r border-t" style={{ borderColor: 'rgba(198,168,124,0.5)' }} />
              <span className="pointer-events-none absolute bottom-2 left-2 h-2.5 w-2.5 border-b border-l" style={{ borderColor: 'rgba(198,168,124,0.5)' }} />
              <span className="pointer-events-none absolute bottom-2 right-2 h-2.5 w-2.5 border-b border-r" style={{ borderColor: 'rgba(198,168,124,0.5)' }} />

              <div className="p-8 sm:p-10">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase" style={{ ...mono, color: '#8a8170', letterSpacing: '0.2em' }}>A2A Agent Card</span>
                  <span className="inline-flex items-center gap-1.5 text-[10px] uppercase" style={{ ...mono, color: '#34D399', letterSpacing: '0.16em' }}>
                    <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ background: '#34D399', boxShadow: '0 0 7px rgba(52,211,153,0.6)' }} aria-hidden />
                    Live
                  </span>
                </div>

                {/* Name + description */}
                <h3 className="mt-6" style={{ ...serif, fontSize: 'clamp(1.6rem, 2.4vw, 2.3rem)', color: '#f4f4f0', lineHeight: 1 }}>
                  {data?.name || 'Ambr'}
                </h3>
                <p className="mt-2 max-w-md text-[13px] leading-relaxed" style={{ color: '#a39b8c' }}>
                  {data ? data.description.split('.')[0] + '.' : 'The liability record for autonomous agents.'}
                </p>

                {/* Divider */}
                <div className="my-7" style={{ height: 1, background: 'linear-gradient(to right, rgba(198,168,124,0.28), transparent)' }} />

                {/* Stats */}
                <div className="flex gap-12">
                  <Stat label="Contracts" loading={loading} value={(stats?.total_contracts_served ?? 0).toLocaleString()} color="#c6a87c" />
                  <Stat label="Skills" loading={loading} value={String(stats?.skills_count ?? 6)} color="#f4f4f0" />
                  <div>
                    <div style={{ ...serif, fontSize: '1.7rem', color: '#34D399', lineHeight: 1 }}>A2A</div>
                    <div className="mt-1.5 text-[10px] uppercase" style={{ ...mono, color: '#8a8170', letterSpacing: '0.16em' }}>Protocol</div>
                  </div>
                </div>

                {/* Skills */}
                {data && (
                  <div className="mt-7 flex flex-wrap gap-1.5">
                    {data.skills.map((s) => (
                      <span key={s.id} className="px-2.5 py-1 text-[10px]" style={{ ...mono, color: '#8a8170', border: '1px solid rgba(198,168,124,0.18)' }}>{s.id}</span>
                    ))}
                  </div>
                )}

                {/* Auth */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="px-2.5 py-1 text-[10px]" style={{ ...mono, color: '#c6a87c', border: '1px solid rgba(198,168,124,0.3)' }}>API Key</span>
                  <span className="px-2.5 py-1 text-[10px]" style={{ ...mono, color: '#c6a87c', border: '1px solid rgba(198,168,124,0.3)' }}>x402 USDC</span>
                  <span className="px-2.5 py-1 text-[10px]" style={{ ...mono, color: '#8a8170', border: '1px solid rgba(198,168,124,0.18)' }}>jsonrpc/http</span>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t px-8 py-3.5 sm:px-10" style={{ borderColor: 'rgba(198,168,124,0.14)' }}>
                <span className="text-[10px]" style={{ ...mono, color: '#6f675b' }}>getamber.dev/.well-known/agent.json</span>
                <span className="text-[10px]" style={{ ...mono, color: '#6f675b' }}>v{data?.version || '1.0.0'}</span>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, loading, color }: { label: string; value: string; loading: boolean; color: string }) {
  return (
    <div>
      <div style={{ ...serif, fontSize: '1.7rem', color, lineHeight: 1 }}>
        {loading ? (
          <span className="inline-block h-5 w-8 animate-pulse align-middle" style={{ background: 'rgba(198,168,124,0.15)' }} aria-hidden />
        ) : (
          value
        )}
      </div>
      <div className="mt-1.5 text-[10px] uppercase" style={{ ...mono, color: '#8a8170', letterSpacing: '0.16em' }}>{label}</div>
    </div>
  );
}
