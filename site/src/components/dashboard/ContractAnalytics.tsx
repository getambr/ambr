'use client';

import { useMemo } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell,
  BarChart, Bar,
} from 'recharts';
import { TrendingUp, Clock, ShieldCheck, AlertCircle, Wallet } from 'lucide-react';
import type { ContractRow } from '@/app/(platform)/dashboard/page';

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
};

// ─── Helpers ───────────────────────────────────────────
function formatTemplateSlug(slug: string): string {
  if (!slug) return 'Unknown';
  // Strip d1-/d2-/c1- prefix
  const clean = slug.replace(/^[a-z]\d+-/, '');
  return clean.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function daysBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
}

// ─── Custom Tooltip ────────────────────────────────────
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-xs shadow-lg">
      <p className="text-text-secondary">{label}</p>
      <p className="font-mono font-bold text-text-primary">{payload[0].value}</p>
    </div>
  );
}

// ─── Metric Card ───────────────────────────────────────
function MetricCard({ label, value, suffix, icon: Icon, color = 'via-amber/50' }: {
  label: string; value: string; suffix?: string;
  icon: React.ComponentType<{ className?: string }>;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface/80 p-5 relative overflow-hidden min-h-[104px]">
      <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent ${color} to-transparent`} />
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-text-secondary">{label}</p>
        <Icon className="h-3.5 w-3.5 text-text-secondary/40" />
      </div>
      <p className="text-2xl font-bold text-text-primary">
        {value}{suffix && <span className="text-sm font-normal text-text-secondary ml-1">{suffix}</span>}
      </p>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────
export function ContractAnalytics({ contracts }: { contracts: ContractRow[] }) {

  // Lifecycle metrics
  const metrics = useMemo(() => {
    const total = contracts.length;
    if (total === 0) return null;

    const active = contracts.filter(c => c.status === 'active' || c.status === 'amended');
    const revoked = contracts.filter(c => c.revoked_at != null);
    const withMint = contracts.filter(c => c.nft_mint_status != null);
    const minted = withMint.filter(c => c.nft_mint_status === 'minted');

    // Avg time to active
    const activeTimes = active
      .filter(c => c.updated_at)
      .map(c => daysBetween(c.created_at, c.updated_at!));
    const avgDays = activeTimes.length > 0
      ? (activeTimes.reduce((a, b) => a + b, 0) / activeTimes.length).toFixed(1)
      : '--';

    return {
      avgDaysToActive: avgDays,
      completionRate: ((active.length / total) * 100).toFixed(0),
      revocationRate: ((revoked.length / total) * 100).toFixed(0),
      mintRate: withMint.length > 0 ? ((minted.length / withMint.length) * 100).toFixed(0) : '--',
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
      const count = contracts.filter(c => c.created_at.slice(0, 10) === key).length;
      days.push({ date: label, count });
    }
    return days;
  }, [contracts]);

  // Status distribution
  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    contracts.forEach(c => { counts[c.status] = (counts[c.status] || 0) + 1; });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value, color: STATUS_COLORS[name] || '#666' }))
      .sort((a, b) => b.value - a.value);
  }, [contracts]);

  // Template popularity
  const templateData = useMemo(() => {
    const counts: Record<string, number> = {};
    contracts.forEach(c => {
      const key = c.template_id || 'unknown';
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([slug, count]) => ({ name: formatTemplateSlug(slug), count }));
  }, [contracts]);

  // Payment breakdown
  const paymentData = useMemo(() => {
    const counts: Record<string, number> = {};
    contracts.forEach(c => {
      const method = c.payment_method || 'api_key';
      counts[method] = (counts[method] || 0) + 1;
    });
    const total = contracts.length || 1;
    const labels: Record<string, string> = { api_key: 'API Key', x402: 'x402 Payment', usdc_direct: 'USDC Direct' };
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([method, count]) => ({
        method: labels[method] || method,
        count,
        pct: ((count / total) * 100).toFixed(0),
      }));
  }, [contracts]);

  // Empty state
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
    <div className="space-y-6">
      {/* Row 1: Lifecycle Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
      </div>

      {/* Row 2: Creation Timeline */}
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

      {/* Row 3: Status + Templates */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution */}
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
            {statusData.map(s => (
              <div key={s.name} className="flex items-center gap-1.5 text-xs">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-text-secondary capitalize">{s.name.replace('_', ' ')}</span>
                <span className="font-mono text-text-primary">{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Template Popularity */}
        <div className="rounded-xl border border-border bg-surface/80 p-6">
          <p className="text-micro mb-4">Template Usage</p>
          {templateData.length > 0 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={templateData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} horizontal={false} />
                  <XAxis
                    type="number"
                    stroke={BORDER}
                    tick={{ fill: TEXT_SEC, fontSize: 10 }}
                    allowDecimals={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke={BORDER}
                    tick={{ fill: TEXT_SEC, fontSize: 10 }}
                    width={140}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" fill={AMBER} radius={[0, 4, 4, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-xs text-text-secondary/50">No template data available</p>
          )}
        </div>
      </div>

      {/* Row 4: Payment Breakdown */}
      <div className="rounded-xl border border-border bg-surface/80 p-6">
        <p className="text-micro mb-4">Payment Methods</p>
        <div className="space-y-3">
          {paymentData.map(p => (
            <div key={p.method} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-secondary">{p.method}</span>
                <span className="font-mono text-text-primary">{p.count} <span className="text-text-secondary">({p.pct}%)</span></span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-elevated overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber/40"
                  style={{ width: `${p.pct}%` }}
                />
              </div>
            </div>
          ))}
          {paymentData.length === 0 && (
            <p className="text-xs text-text-secondary/50">No payment data available</p>
          )}
        </div>
      </div>
    </div>
  );
}
