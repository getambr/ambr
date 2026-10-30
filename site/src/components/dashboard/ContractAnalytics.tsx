'use client';

/**
 * Dashboard Analytics section.
 *
 * Refactored 2026-05-27 from a flat grid of charts into named sections that
 * track the platform's product surfaces:
 *
 *  - Lifecycle (the contract state machine + creation timeline)
 *  - Templates & Mix (which contract types are deployed)
 *  - Payments & Economics (how deploys are paid for)
 *  - AI Chat / Ambr Agent (chat_usage rollups — cost, model, cache, errors)
 *  - Compliance & Operations (EU AI Act Art. 14 oversight approvals)
 *
 * Two data sources:
 *  - `contracts` prop — list of recent contracts (passed in from page.tsx).
 *    Enough for client-side metrics over the last 100 deploys.
 *  - `/api/v1/analytics` (fetched on mount) — server-side aggregations that
 *    can't be derived from the 100-contract sample (chat_usage rollups,
 *    audit-log timelines in future commits).
 *
 * MetricCard + StackedTimeline live in their own files so the dashboard's
 * Pipeline Overview can reuse them without duplicating the styling.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell,
  BarChart, Bar,
} from 'recharts';
import {
  TrendingUp, Clock, ShieldCheck, AlertCircle, Wallet, UserCheck,
  Zap, Sparkles, MessageSquare, Repeat, Gavel,
} from 'lucide-react';
import type { ContractRow } from '@/app/(platform)/dashboard/page';
import MetricCard from './MetricCard';
import StackedTimeline, { type StackedTimelineSeries } from './StackedTimeline';

// ─── Colors ────────────────────────────────────────────
const AMBER = '#c6a87c';
const BORDER = '#2E2E2E';
const TEXT_SEC = '#999999';

const STATUS_COLORS: Record<string, string> = {
  draft: '#666666',
  handshake: '#c6a87c',
  pending_signature: '#facc15',
  active: '#34D399',
  amended: '#e8d9bb',
  revoked: '#F87171',
  terminated: '#F87171',
  expired: '#555555',
  awaiting_principal_approval: '#f97316',
  fulfilled: '#22c55e',
  disputed: '#f59e0b',
};

// Template-category colors (A/C/D/P series). Tuned to match the dashboard's
// existing amber accent — A is amber-warm (most common), D is amber-cool,
// C is teal (machine-to-machine), P is emerald (peer/personal).
const CATEGORY_COLORS: Record<string, string> = {
  consumer: '#c6a87c',       // A-series (A1/A2/A3)
  delegation: '#e8d9bb',     // D-series (D1/D2/D3) and P-series (P2)
  commerce: '#34D399',       // C-series (C1/C2/C3)
  peer: '#a78bfa',           // P-series (NDA — when it routes)
  unknown: '#666666',
};

// Friendly category labels.
const CATEGORY_LABELS: Record<string, string> = {
  consumer: 'A-series · Consumer',
  delegation: 'D/P-series · Delegation',
  commerce: 'C-series · Commerce',
  peer: 'P-series · Peer',
  unknown: 'Uncategorized',
};

// ─── Helpers ───────────────────────────────────────────
function formatTemplateSlug(slug: string | null | undefined): string {
  if (!slug) return 'Unknown';
  // Strip d1-/d2-/c1-/p2- prefix
  const clean = slug.replace(/^[a-z]\d+-/, '');
  return clean.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function daysBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
}

function formatUsd(n: number, decimals = 2): string {
  if (n === 0) return '$0.00';
  if (n < 0.001) return `<$0.001`;
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(decimals)}`;
}

function formatPct(n: number, decimals = 0): string {
  return `${(n * 100).toFixed(decimals)}%`;
}

// ─── Custom Tooltip ────────────────────────────────────
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; name?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-xs shadow-lg">
      <p className="text-text-secondary">{label ?? payload[0].name ?? ''}</p>
      <p className="font-mono font-bold text-text-primary">{payload[0].value}</p>
    </div>
  );
}

// ─── Section header ───────────────────────────────────
function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h3 className="text-sm font-semibold text-text-primary tracking-wide uppercase">{title}</h3>
      {hint && <span className="text-[11px] text-text-secondary/60">{hint}</span>}
    </div>
  );
}

// ─── Chat-usage summary shape (mirrors /api/v1/analytics response) ─────
interface ChatUsageSummary {
  last_30d_cost_usd: number;
  last_30d_turns: number;
  by_model: Record<string, number>;
  by_status: Record<string, number>;
  cache_hit_rate: number;
  fallback_rate: number;
  daily: Array<{ day: string; cost_usd: number; turns: number; errors: number }>;
}

// ─── Main Component ────────────────────────────────────
export function ContractAnalytics({
  contracts,
  apiKey,
}: {
  contracts: ContractRow[];
  /** API key for the /api/v1/analytics fetch. Same key the rest of the
   *  dashboard uses. Pass null when not authenticated — the section will
   *  render contract-derived metrics only and skip the AI Chat panel. */
  apiKey?: string | null;
}) {
  // Server-side aggregations (chat_usage rollups). Fetched on mount.
  const [chatSummary, setChatSummary] = useState<ChatUsageSummary | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    setChatLoading(true);
    fetch('/api/v1/analytics', { headers: { 'X-API-Key': apiKey } })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json) return;
        if (json.chat_usage_summary) setChatSummary(json.chat_usage_summary as ChatUsageSummary);
      })
      .catch(() => { /* silent — non-fatal */ })
      .finally(() => { if (!cancelled) setChatLoading(false); });
    return () => { cancelled = true; };
  }, [apiKey]);

  // ─── Lifecycle metrics ────────────────────────────────
  const metrics = useMemo(() => {
    const total = contracts.length;
    if (total === 0) return null;

    const active = contracts.filter((c) => c.status === 'active' || c.status === 'amended');
    const revoked = contracts.filter((c) => c.revoked_at != null);
    const withMint = contracts.filter((c) => c.nft_mint_status != null);
    const minted = withMint.filter((c) => c.nft_mint_status === 'minted');
    const oneSided = contracts.filter((c) => c.is_one_sided === true);

    const activeTimes = active
      .filter((c) => c.updated_at)
      .map((c) => daysBetween(c.created_at, c.updated_at!));
    const avgDays = activeTimes.length > 0
      ? (activeTimes.reduce((a, b) => a + b, 0) / activeTimes.length).toFixed(1)
      : '--';

    return {
      total,
      avgDaysToActive: avgDays,
      completionRate: ((active.length / total) * 100).toFixed(0),
      revocationRate: ((revoked.length / total) * 100).toFixed(0),
      mintRate: withMint.length > 0 ? ((minted.length / withMint.length) * 100).toFixed(0) : '--',
      oneSidedCount: oneSided.length,
      oneSidedPct: oneSided.length > 0 ? ((oneSided.length / total) * 100).toFixed(0) : '0',
    };
  }, [contracts]);

  // 30-day creation timeline
  const timeline = useMemo(() => {
    const now = new Date();
    const days: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const count = contracts.filter((c) => c.created_at.slice(0, 10) === key).length;
      days.push({ date: label, count });
    }
    return days;
  }, [contracts]);

  // Status distribution
  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    contracts.forEach((c) => { counts[c.status] = (counts[c.status] || 0) + 1; });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value, color: STATUS_COLORS[name] || '#666' }))
      .sort((a, b) => b.value - a.value);
  }, [contracts]);

  // ─── Templates & Mix ─────────────────────────────────
  // Group by template_category (joined from templates table in /api/v1/dashboard).
  // Within each category, show top-3 slugs as nested rows so users can see
  // which templates within a family are pulling weight.
  const categoryData = useMemo(() => {
    const buckets: Record<string, { total: number; slugs: Record<string, number> }> = {};
    contracts.forEach((c) => {
      const cat = c.template_category || 'unknown';
      const slug = c.template_slug || c.template_id || 'unknown';
      if (!buckets[cat]) buckets[cat] = { total: 0, slugs: {} };
      buckets[cat].total += 1;
      buckets[cat].slugs[slug] = (buckets[cat].slugs[slug] || 0) + 1;
    });
    return Object.entries(buckets)
      .map(([cat, v]) => ({
        category: cat,
        label: CATEGORY_LABELS[cat] || cat,
        color: CATEGORY_COLORS[cat] || CATEGORY_COLORS.unknown,
        total: v.total,
        topSlugs: Object.entries(v.slugs)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3)
          .map(([slug, count]) => ({ slug, count, name: formatTemplateSlug(slug) })),
      }))
      .sort((a, b) => b.total - a.total);
  }, [contracts]);

  // ─── Payments & Economics ────────────────────────────
  const paymentData = useMemo(() => {
    const counts: Record<string, number> = {};
    contracts.forEach((c) => {
      const method = c.payment_method || 'api_key';
      counts[method] = (counts[method] || 0) + 1;
    });
    const total = contracts.length || 1;
    const labels: Record<string, string> = {
      api_key: 'API Key (subscription)',
      x402: 'x402 micropayment',
      usdc_direct: 'USDC direct',
    };
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([method, count]) => ({
        method: labels[method] || method,
        count,
        pct: ((count / total) * 100).toFixed(0),
      }));
  }, [contracts]);

  // ─── Compliance & Operations ─────────────────────────
  const oversightData = useMemo(() => {
    const flagged = contracts.filter((c) => c.principal_approval_required === true);
    // Approved = flagged AND status is no longer 'awaiting_principal_approval'
    // (i.e. moved into the regular flow). Pending = still awaiting.
    const pending = flagged.filter((c) => c.status === 'awaiting_principal_approval');
    const approved = flagged.filter((c) => c.status !== 'awaiting_principal_approval');
    return {
      flagged: flagged.length,
      pending: pending.length,
      approved: approved.length,
      approvalRate: flagged.length > 0
        ? Math.round((approved.length / flagged.length) * 100)
        : null,
    };
  }, [contracts]);

  // ─── AI Chat — derive timeline series from chatSummary ───
  const chatTimeline = useMemo(() => {
    if (!chatSummary) return null;
    // For commit 1, the daily series tracks total cost only (model breakdown
    // requires per-row model column we don't aggregate by day in /api/v1/analytics
    // yet — commit 2 can add that). Render a single amber stack now.
    return chatSummary.daily.map((d) => ({
      day: d.day.slice(5),  // strip the year to keep x-axis labels short
      cost: d.cost_usd,
      turns: d.turns,
    }));
  }, [chatSummary]);

  const chatModelSeries: StackedTimelineSeries[] = useMemo(() => {
    if (!chatSummary) return [];
    // Single series for now — total cost. Will explode into per-model
    // stacks in commit 2 when /api/v1/analytics returns a daily-by-model
    // matrix.
    return [{ key: 'cost', label: 'Cost (USD)', color: AMBER }];
  }, [chatSummary]);

  // ─── Empty state ─────────────────────────────────────
  if (contracts.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <TrendingUp className="h-10 w-10 text-text-secondary/30 mx-auto" />
          <p className="text-text-secondary text-sm">No contracts yet</p>
          <p className="text-text-secondary/50 text-xs">Create your first contract to see analytics</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* ═══ LIFECYCLE ═══════════════════════════════════════ */}
      <section>
        <SectionHeader title="Lifecycle" hint={`Last ${metrics?.total ?? 0} contracts`} />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
          <MetricCard
            label="Avg Time to Active"
            value={metrics?.avgDaysToActive || '--'}
            suffix={metrics?.avgDaysToActive !== '--' ? 'days' : undefined}
            icon={Clock}
          />
          <MetricCard
            label="Completion Rate"
            value={metrics?.completionRate || '0'}
            suffix="%"
            icon={ShieldCheck}
            color="via-success/50"
          />
          <MetricCard
            label="Revocation Rate"
            value={metrics?.revocationRate || '0'}
            suffix="%"
            icon={AlertCircle}
            color="via-error/50"
          />
          <MetricCard
            label="NFT Mint Rate"
            value={metrics?.mintRate || '--'}
            suffix={metrics?.mintRate !== '--' ? '%' : undefined}
            icon={Wallet}
          />
          <MetricCard
            label="One-Sided Deploys"
            value={String(metrics?.oneSidedCount ?? 0)}
            suffix={metrics?.oneSidedCount ? `(${metrics?.oneSidedPct}%)` : undefined}
            icon={UserCheck}
            color="via-amber/50"
            hint="P-series (P2 POA) — principal-only signature"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Creation timeline */}
          <div className="rounded-xl border border-border bg-surface/80 p-6">
            <p className="text-micro mb-4">Contracts Created — Last 30 Days</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeline}>
                  <defs>
                    <linearGradient id="amberGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={AMBER} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={AMBER} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                  <XAxis
                    dataKey="date"
                    stroke={BORDER}
                    tick={{ fill: TEXT_SEC, fontSize: 10 }}
                    interval="preserveStartEnd"
                    tickLine={false}
                  />
                  <YAxis
                    stroke={BORDER}
                    tick={{ fill: TEXT_SEC, fontSize: 10 }}
                    allowDecimals={false}
                    tickLine={false}
                    width={30}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="count" stroke={AMBER} fill="url(#amberGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Status distribution donut */}
          <div className="rounded-xl border border-border bg-surface/80 p-6">
            <p className="text-micro mb-4">Status Distribution</p>
            <div className="flex items-center justify-center">
              <div className="h-48 w-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      strokeWidth={0}
                    >
                      {statusData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-4 justify-center">
              {statusData.map((s) => (
                <div key={s.name} className="flex items-center gap-1.5 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-text-secondary capitalize">{s.name.replace(/_/g, ' ')}</span>
                  <span className="font-mono text-text-primary">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ TEMPLATES & MIX ════════════════════════════════ */}
      <section>
        <SectionHeader title="Templates & Mix" hint="Grouped by series" />
        <div className="rounded-xl border border-border bg-surface/80 p-6">
          {categoryData.length === 0 ? (
            <p className="text-xs text-text-secondary/50">No template data available</p>
          ) : (
            <div className="space-y-5">
              {categoryData.map((c) => {
                const total = metrics?.total ?? 1;
                const pct = Math.round((c.total / total) * 100);
                return (
                  <div key={c.category} className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                        <span className="text-text-primary font-medium">{c.label}</span>
                      </span>
                      <span className="font-mono text-text-primary">
                        {c.total} <span className="text-text-secondary">({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-elevated overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: c.color, opacity: 0.7 }}
                      />
                    </div>
                    {/* Top slugs within the category */}
                    <div className="pl-4 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                      {c.topSlugs.map((s) => (
                        <span key={s.slug} className="text-text-secondary/70">
                          <span className="font-mono text-text-secondary">{s.name}</span>
                          <span className="text-text-secondary/40 ml-1">×{s.count}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ═══ PAYMENTS & ECONOMICS ═══════════════════════════ */}
      <section>
        <SectionHeader title="Payments & Economics" hint="USD totals coming in next release" />
        <div className="rounded-xl border border-border bg-surface/80 p-6">
          <div className="space-y-3">
            {paymentData.map((p) => (
              <div key={p.method} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-secondary">{p.method}</span>
                  <span className="font-mono text-text-primary">
                    {p.count} <span className="text-text-secondary">({p.pct}%)</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-elevated overflow-hidden">
                  <div className="h-full rounded-full bg-amber/40" style={{ width: `${p.pct}%` }} />
                </div>
              </div>
            ))}
            {paymentData.length === 0 && (
              <p className="text-xs text-text-secondary/50">No payment data available</p>
            )}
          </div>
        </div>
      </section>

      {/* ═══ AI CHAT (Ambr Agent) ═══════════════════════════ */}
      <section>
        <SectionHeader title="AI Chat (Ambr Agent)" hint="Last 30 days · scoped to your account" />
        {apiKey == null ? (
          <div className="rounded-xl border border-border bg-surface/80 p-6 text-center">
            <p className="text-xs text-text-secondary">Sign in with an API key to see chat metrics.</p>
          </div>
        ) : chatLoading && !chatSummary ? (
          <div className="rounded-xl border border-border bg-surface/40 p-8 text-center">
            <Sparkles className="h-6 w-6 text-text-secondary/30 mx-auto mb-2 animate-pulse" />
            <p className="text-xs text-text-secondary">Loading chat usage…</p>
          </div>
        ) : !chatSummary || chatSummary.last_30d_turns === 0 ? (
          <div className="rounded-xl border border-border bg-surface/40 p-8 text-center">
            <MessageSquare className="h-8 w-8 text-text-secondary/30 mx-auto mb-2" />
            <p className="text-sm font-medium text-text-primary mb-1">No chat activity yet</p>
            <p className="text-xs text-text-secondary max-w-md mx-auto">
              Open Create Contract → Ambr Agent to start a chat-driven deploy. We track cost, model mix, cache-hit rate, and errors per account.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <MetricCard
                label="Cost — Last 30d"
                value={formatUsd(chatSummary.last_30d_cost_usd)}
                icon={Sparkles}
              />
              <MetricCard
                label="Turns"
                value={String(chatSummary.last_30d_turns)}
                icon={MessageSquare}
              />
              <MetricCard
                label="Cache Hit Rate"
                value={formatPct(chatSummary.cache_hit_rate)}
                icon={Zap}
                color="via-emerald-400/50"
                hint="Cached input tokens / total input"
              />
              <MetricCard
                label="Fallback Rate"
                value={formatPct(chatSummary.fallback_rate)}
                icon={Repeat}
                color="via-amber/50"
                hint="Primary→secondary LLM rescues"
              />
            </div>
            <div className="rounded-xl border border-border bg-surface/80 p-6">
              <p className="text-micro mb-4">Daily Cost — Last 30 Days</p>
              {chatTimeline && chatTimeline.length > 0 ? (
                <StackedTimeline
                  data={chatTimeline}
                  xKey="day"
                  series={chatModelSeries}
                  formatY={(n) => formatUsd(n, 3)}
                />
              ) : (
                <p className="text-xs text-text-secondary/50">Not enough data yet.</p>
              )}
            </div>
          </>
        )}
      </section>

      {/* ═══ COMPLIANCE & OPERATIONS ══════════════════════ */}
      <section>
        <SectionHeader title="Compliance & Operations" hint="EU AI Act Art. 14 oversight" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            label="Oversight Approvals Required"
            value={String(oversightData.flagged)}
            suffix={oversightData.flagged > 0 ? `of ${metrics?.total ?? 0}` : undefined}
            icon={Gavel}
            color="via-orange-400/50"
            hint="Contracts that tripped a parent delegation's threshold"
          />
          <MetricCard
            label="Pending Principal Approval"
            value={String(oversightData.pending)}
            icon={Clock}
            color="via-yellow-400/50"
            hint="Awaiting principal sign-off to proceed"
          />
          <MetricCard
            label="Approval Rate"
            value={oversightData.approvalRate === null ? '--' : String(oversightData.approvalRate)}
            suffix={oversightData.approvalRate === null ? undefined : '%'}
            icon={ShieldCheck}
            color="via-success/50"
            hint="Approved / total flagged"
          />
        </div>
      </section>
    </div>
  );
}

// Re-export the BarChart import for any caller that needs to render its
// own template-popularity bar (kept for backward compat — not used in the
// section refactor above, but if downstream code imports BarChart from
// this file, it still works).
export { BarChart, Bar };
