'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check, ExternalLink } from 'lucide-react';
import ScrollReveal from '@/components/ui/ScrollReveal';

interface AgentStats {
  total_contracts_served: number;
  active_contracts: number;
  skills_count: number;
}

interface AgentData {
  name: string;
  description: string;
  url: string;
  version: string;
  skills: { id: string; name: string }[];
  securitySchemes: Record<string, { type: string }>;
  stats?: AgentStats;
}

/**
 * Homepage section showing the Ambr A2A Agent Card.
 * Fetches live data from /.well-known/agent.json.
 * Positioned between Architecture and Pricing on the marketing site.
 */
export default function AgentCardSection() {
  const [data, setData] = useState<AgentData | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/.well-known/agent.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d); })
      .catch(() => {});
  }, []);

  function copyUrl() {
    navigator.clipboard.writeText('https://getamber.dev/.well-known/agent.json');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const stats = data?.stats;

  return (
    <section className="relative py-24 sm:py-32 overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: context */}
          <ScrollReveal direction="left">
            <div>
              <p className="text-micro text-amber mb-3">A2A PROTOCOL</p>
              <h2
                className="brass-gradient-text leading-tight mb-6"
                style={{ fontSize: 'clamp(2rem, 3.5vw, 3rem)', letterSpacing: '-0.02em' }}
              >
                Discoverable by<br />any AI agent.
              </h2>
              <p className="text-base text-text-secondary leading-relaxed max-w-lg mb-8">
                Ambr exposes a standard A2A Agent Card so other agents can find it,
                check capabilities, and initiate contract workflows — no human
                intermediary required.
              </p>
              <div className="flex items-center gap-3">
                <a
                  href="/developers"
                  className="inline-flex items-center gap-2 text-sm text-amber hover:opacity-80 transition-opacity"
                >
                  Integration docs
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <span className="text-border">|</span>
                <button
                  onClick={copyUrl}
                  className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-500">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy discovery URL
                    </>
                  )}
                </button>
              </div>
            </div>
          </ScrollReveal>

          {/* Right: the card */}
          <ScrollReveal direction="right">
            <div className="relative max-w-[420px] mx-auto lg:ml-auto">
              {/* Geometric bg glow */}
              <div
                className="absolute -inset-8 opacity-20 pointer-events-none blur-2xl"
                style={{ background: 'radial-gradient(circle at 50% 50%, #c6a87c33, transparent 70%)' }}
              />

              <div className="relative rounded-xl border border-amber/20 bg-surface overflow-hidden">
                {/* Geometric watermark */}
                <div className="absolute top-0 right-0 w-32 h-32 opacity-[0.06] pointer-events-none">
                  <svg viewBox="0 0 120 120" fill="none">
                    <circle cx="60" cy="60" r="50" stroke="#c6a87c" strokeWidth="0.5" />
                    <ellipse cx="60" cy="60" rx="45" ry="25" stroke="#c6a87c" strokeWidth="0.5" transform="rotate(30 60 60)" />
                    <ellipse cx="60" cy="60" rx="45" ry="25" stroke="#c6a87c" strokeWidth="0.5" transform="rotate(-30 60 60)" />
                    <circle cx="60" cy="60" r="8" fill="#c6a87c" />
                  </svg>
                </div>

                {/* Inner frame */}
                <div className="m-2 border border-amber/10 rounded-lg p-6 relative">
                  {/* Corner dots */}
                  <span className="absolute -top-px -left-px w-1.5 h-1.5 border-t border-l border-amber/30" />
                  <span className="absolute -top-px -right-px w-1.5 h-1.5 border-t border-r border-amber/30" />
                  <span className="absolute -bottom-px -left-px w-1.5 h-1.5 border-b border-l border-amber/30" />
                  <span className="absolute -bottom-px -right-px w-1.5 h-1.5 border-b border-r border-amber/30" />

                  {/* Header */}
                  <div className="flex items-center justify-between mb-5">
                    <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-amber">A2A Agent Card</span>
                    <motion.div
                      className="flex items-center gap-1.5"
                      animate={{ opacity: [0.7, 1, 0.7] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      <span
                        className="w-[5px] h-[5px] rounded-full bg-emerald-500"
                        style={{ boxShadow: '0 0 6px rgba(52,211,153,0.4)' }}
                      />
                      <span className="text-[9px] text-emerald-500">Live</span>
                    </motion.div>
                  </div>

                  {/* Name */}
                  <h3 className="text-3xl font-serif text-text-primary mb-1">
                    {data?.name || 'Ambr'}
                  </h3>
                  <p className="text-xs text-text-secondary mb-5">
                    {data ? data.description.split('.')[0] + '.' : 'Legal framework for AI agents.'}
                  </p>

                  {/* Divider */}
                  <div className="h-px mb-5" style={{ background: 'linear-gradient(to right, rgba(198,168,124,0.2), transparent)' }} />

                  {/* Stats */}
                  <div className="flex gap-8 mb-5">
                    <div>
                      <div className="text-xl text-amber font-light">{stats?.total_contracts_served ?? '--'}</div>
                      <div className="text-[8px] font-mono uppercase tracking-[0.1em] text-text-secondary">Contracts</div>
                    </div>
                    <div>
                      <div className="text-xl text-text-primary font-light">{stats?.skills_count ?? 6}</div>
                      <div className="text-[8px] font-mono uppercase tracking-[0.1em] text-text-secondary">Skills</div>
                    </div>
                    <div>
                      <div className="text-xl text-emerald-500 font-light">A2A</div>
                      <div className="text-[8px] font-mono uppercase tracking-[0.1em] text-text-secondary">Protocol</div>
                    </div>
                  </div>

                  {/* Skills */}
                  {data && (
                    <div className="flex flex-wrap gap-1.5 mb-5">
                      {data.skills.map((s) => (
                        <span key={s.id} className="px-2 py-0.5 border border-border rounded text-[9px] font-mono text-text-secondary">
                          {s.id}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Auth */}
                  <div className="flex gap-1.5">
                    <span className="px-2 py-0.5 border border-amber/20 rounded text-[9px] font-mono text-amber">API Key</span>
                    <span className="px-2 py-0.5 border border-amber/20 rounded text-[9px] font-mono text-amber">x402 USDC</span>
                    <span className="px-2 py-0.5 border border-border rounded text-[9px] font-mono text-text-secondary">jsonrpc/http</span>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-2.5 flex items-center justify-between">
                  <span className="text-[9px] font-mono text-text-secondary/40">
                    getamber.dev/.well-known/agent.json
                  </span>
                  <span className="text-[9px] font-mono text-text-secondary/30">v{data?.version || '1.0.0'}</span>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
