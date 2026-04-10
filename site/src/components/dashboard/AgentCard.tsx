'use client';

import { useState, useEffect } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';

type CardMode = 'compact' | 'terminal' | 'branded';

interface AgentCardProps {
  mode?: CardMode;
  showSkills?: boolean;
  showStats?: boolean;
  showAuth?: boolean;
}

interface AgentData {
  name: string;
  description: string;
  url: string;
  version: string;
  skills: { id: string; name: string; description: string }[];
  securitySchemes: Record<string, { type: string; description: string }>;
  stats?: {
    total_contracts_served: number;
    active_contracts: number;
    skills_count: number;
  };
}

export default function AgentCard({
  mode = 'branded',
  showSkills = true,
  showStats = true,
  showAuth = true,
}: AgentCardProps) {
  const [data, setData] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/.well-known/agent.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function copyUrl() {
    const url = data?.url || 'https://getamber.dev/.well-known/agent.json';
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return <AgentCardSkeleton mode={mode} />;
  if (!data) return <p className="text-sm text-text-secondary">Failed to load agent card.</p>;

  if (mode === 'terminal') return <TerminalCard data={data} showSkills={showSkills} showStats={showStats} showAuth={showAuth} onCopy={copyUrl} copied={copied} />;
  if (mode === 'compact') return <CompactCard data={data} showSkills={showSkills} showStats={showStats} showAuth={showAuth} onCopy={copyUrl} copied={copied} />;
  return <BrandedCard data={data} showSkills={showSkills} showStats={showStats} showAuth={showAuth} onCopy={copyUrl} copied={copied} />;
}

// ─── Branded Mode (geometric, AmbrCard-style) ─────────

function BrandedCard({ data, showSkills, showStats, showAuth, onCopy, copied }: {
  data: AgentData; showSkills: boolean; showStats: boolean; showAuth: boolean;
  onCopy: () => void; copied: boolean;
}) {
  const stats = data.stats;
  return (
    <div className="relative rounded-xl border border-amber/20 bg-surface overflow-hidden">
      {/* Geometric bg */}
      <div className="absolute top-0 right-0 w-32 h-32 opacity-[0.06] pointer-events-none">
        <svg viewBox="0 0 120 120" fill="none">
          <circle cx="60" cy="60" r="50" stroke="#c6a87c" strokeWidth="0.5" />
          <ellipse cx="60" cy="60" rx="45" ry="25" stroke="#c6a87c" strokeWidth="0.5" transform="rotate(30 60 60)" />
          <ellipse cx="60" cy="60" rx="45" ry="25" stroke="#c6a87c" strokeWidth="0.5" transform="rotate(-30 60 60)" />
          <circle cx="60" cy="60" r="8" fill="#c6a87c" />
        </svg>
      </div>

      {/* Inner frame */}
      <div className="m-2 border border-amber/10 rounded-lg p-5 relative">
        {/* Corner dots */}
        <span className="absolute -top-px -left-px w-1.5 h-1.5 border-t border-l border-amber/30" />
        <span className="absolute -top-px -right-px w-1.5 h-1.5 border-t border-r border-amber/30" />
        <span className="absolute -bottom-px -left-px w-1.5 h-1.5 border-b border-l border-amber/30" />
        <span className="absolute -bottom-px -right-px w-1.5 h-1.5 border-b border-r border-amber/30" />

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-amber">A2A Agent</span>
          <div className="flex items-center gap-1.5">
            <span className="w-[5px] h-[5px] rounded-full bg-emerald-500" style={{ boxShadow: '0 0 6px rgba(52,211,153,0.4)' }} />
            <span className="text-[9px] text-emerald-500">Live</span>
          </div>
        </div>

        {/* Name */}
        <h3 className="text-2xl font-serif text-text-primary mb-1">{data.name}</h3>
        <p className="text-xs text-text-secondary mb-4">{data.description?.split('.')[0]}.</p>

        {/* Divider */}
        <div className="h-px mb-4" style={{ background: 'linear-gradient(to right, rgba(198,168,124,0.2), transparent)' }} />

        {/* Stats */}
        {showStats && stats && (
          <div className="flex gap-6 mb-4">
            <div>
              <div className="text-lg text-amber font-light">{stats.total_contracts_served}</div>
              <div className="text-[8px] font-mono uppercase tracking-[0.1em] text-text-secondary">Contracts</div>
            </div>
            <div>
              <div className="text-lg text-text-primary font-light">{stats.skills_count}</div>
              <div className="text-[8px] font-mono uppercase tracking-[0.1em] text-text-secondary">Skills</div>
            </div>
            <div>
              <div className="text-lg text-emerald-500 font-light">A2A</div>
              <div className="text-[8px] font-mono uppercase tracking-[0.1em] text-text-secondary">Protocol</div>
            </div>
          </div>
        )}

        {/* Skills */}
        {showSkills && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {data.skills.map((s) => (
              <span key={s.id} className="px-2 py-0.5 border border-border rounded text-[9px] font-mono text-text-secondary">
                {s.id}
              </span>
            ))}
          </div>
        )}

        {/* Auth */}
        {showAuth && (
          <div className="flex gap-1.5">
            {Object.keys(data.securitySchemes || {}).map((key) => (
              <span key={key} className="px-2 py-0.5 border border-amber/20 rounded text-[9px] font-mono text-amber">
                {key === 'apiKey' ? 'API Key' : key === 'x402' ? 'x402 USDC' : key}
              </span>
            ))}
            <span className="px-2 py-0.5 border border-border rounded text-[9px] font-mono text-text-secondary">
              jsonrpc/http
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-2 flex items-center justify-between">
        <span className="text-[9px] font-mono text-text-secondary/50">
          getamber.dev/.well-known/agent.json
        </span>
        <button onClick={onCopy} className="text-text-secondary hover:text-text-primary transition-colors cursor-pointer">
          {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
        </button>
      </div>
    </div>
  );
}

// ─── Terminal Mode ─────────────────────────────────────

function TerminalCard({ data, showSkills, showStats, showAuth, onCopy, copied }: {
  data: AgentData; showSkills: boolean; showStats: boolean; showAuth: boolean;
  onCopy: () => void; copied: boolean;
}) {
  const stats = data.stats;
  return (
    <div className="rounded-lg border border-border overflow-hidden font-mono text-[11px] bg-background">
      {/* Terminal header */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-surface border-b border-border">
        <span className="w-2 h-2 rounded-full bg-red-500/80" />
        <span className="w-2 h-2 rounded-full bg-yellow-500/80" />
        <span className="w-2 h-2 rounded-full bg-emerald-500/80" />
        <span className="text-text-secondary/50 text-[10px] ml-2">.well-known/agent.json</span>
        <button onClick={onCopy} className="ml-auto text-text-secondary hover:text-text-primary transition-colors cursor-pointer">
          {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
        </button>
      </div>

      {/* Content */}
      <div className="p-4 leading-relaxed">
        <Line k="name" v={data.name} />
        <Line k="status" v="online" vClass="text-emerald-500" suffix={showStats && stats ? ` (${stats.total_contracts_served} contracts served)` : ''} />
        <Line k="version" v={data.version} />
        <Line k="protocol" v="jsonrpc/http" />

        {showAuth && (
          <Line k="auth" v={Object.keys(data.securitySchemes || {}).map(k => k === 'apiKey' ? 'API Key' : k === 'x402' ? 'x402 USDC' : k).join(' | ')} />
        )}

        {showSkills && (
          <>
            <div className="mt-1.5">
              <span className="text-amber">skills</span>
              <span className="text-text-secondary/50">:</span>
            </div>
            {data.skills.map((s) => (
              <div key={s.id} className="pl-3 text-text-secondary">
                <span className="text-text-secondary/40">-</span> {s.id}
              </div>
            ))}
          </>
        )}

        <div className="mt-1.5">
          <span className="text-amber">url</span>
          <span className="text-text-secondary/50">:</span>{' '}
          <a href={data.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-1">
            {data.url?.replace('https://', '')}
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </div>
    </div>
  );
}

function Line({ k, v, vClass, suffix }: { k: string; v: string; vClass?: string; suffix?: string }) {
  return (
    <div>
      <span className="text-amber">{k}</span>
      <span className="text-text-secondary/50">:</span>{' '}
      <span className={vClass || 'text-text-secondary'}>{v}</span>
      {suffix && <span className="text-text-secondary/40">{suffix}</span>}
    </div>
  );
}

// ─── Compact Mode ──────────────────────────────────────

function CompactCard({ data, showSkills, showStats, showAuth, onCopy, copied }: {
  data: AgentData; showSkills: boolean; showStats: boolean; showAuth: boolean;
  onCopy: () => void; copied: boolean;
}) {
  const stats = data.stats;
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber to-amber-dark flex items-center justify-center">
            <span className="text-background font-bold text-xs">A</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-text-primary">{data.name}</div>
            <div className="text-[10px] font-mono text-text-secondary">{data.version}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-[6px] h-[6px] rounded-full bg-emerald-500" />
          <span className="text-[10px] text-emerald-500">Online</span>
        </div>
      </div>

      {/* Description */}
      <div className="px-5 py-3 border-b border-border">
        <p className="text-[11px] text-text-secondary leading-relaxed">
          {data.description?.split('.')[0]}.
        </p>
      </div>

      {/* Skills */}
      {showSkills && (
        <div className="px-5 py-3 flex flex-wrap gap-1 border-b border-border">
          {data.skills.slice(0, 4).map((s) => (
            <span key={s.id} className="px-2 py-0.5 border border-border rounded text-[9px] font-mono text-text-secondary">
              {s.id}
            </span>
          ))}
          {data.skills.length > 4 && (
            <span className="px-2 py-0.5 border border-border rounded text-[9px] font-mono text-text-secondary">
              +{data.skills.length - 4} more
            </span>
          )}
        </div>
      )}

      {/* Stats footer */}
      {showStats && stats && (
        <div className="flex items-center justify-between px-5 py-2.5 bg-background/50">
          <div className="text-center flex-1">
            <div className="text-sm font-bold text-amber">{stats.total_contracts_served}</div>
            <div className="text-[8px] font-mono uppercase tracking-wider text-text-secondary">Contracts</div>
          </div>
          <div className="text-center flex-1">
            <div className="text-sm font-bold text-text-primary">{stats.skills_count}</div>
            <div className="text-[8px] font-mono uppercase tracking-wider text-text-secondary">Skills</div>
          </div>
          {showAuth && (
            <div className="text-center flex-1">
              <div className="text-sm font-bold text-emerald-500">{Object.keys(data.securitySchemes || {}).length}</div>
              <div className="text-[8px] font-mono uppercase tracking-wider text-text-secondary">Auth</div>
            </div>
          )}
          <button onClick={onCopy} className="text-text-secondary hover:text-text-primary transition-colors cursor-pointer p-1">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Loading Skeleton ──────────────────────────────────

function AgentCardSkeleton({ mode }: { mode: CardMode }) {
  const h = mode === 'terminal' ? 'h-48' : mode === 'compact' ? 'h-44' : 'h-56';
  return (
    <div className={`rounded-xl border border-border bg-surface ${h} animate-pulse`}>
      <div className="p-5 space-y-3">
        <div className="h-3 w-24 bg-border/50 rounded" />
        <div className="h-5 w-32 bg-border/50 rounded" />
        <div className="h-2 w-48 bg-border/30 rounded" />
        <div className="flex gap-2 mt-4">
          <div className="h-4 w-16 bg-border/30 rounded" />
          <div className="h-4 w-16 bg-border/30 rounded" />
          <div className="h-4 w-16 bg-border/30 rounded" />
        </div>
      </div>
    </div>
  );
}
