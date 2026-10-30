'use client';

/**
 * Shared KPI tile used across the dashboard — Analytics section, Pipeline
 * Overview, and any future surface that wants the same look.
 *
 * Extracted from `ContractAnalytics.tsx` and the inline duplicate in
 * `dashboard/page.tsx` Pipeline Overview (2026-05-27). Same visual; one
 * implementation.
 *
 * Use:
 *   <MetricCard label="Avg Time to Active" value="3.2" suffix="days" icon={Clock} />
 *   <MetricCard label="Cache Hit" value="78" suffix="%" icon={Zap} color="via-emerald-400/50" />
 */

import type { ComponentType } from 'react';

export interface MetricCardProps {
  /** Top-left subtitle — what the metric measures, in plain English. */
  label: string;
  /** Big number / string in the body. Pass '--' for "no data yet" states. */
  value: string;
  /** Smaller suffix shown next to the value (e.g. "days", "%", "$"). */
  suffix?: string;
  /** Top-right lucide icon. */
  icon: ComponentType<{ className?: string }>;
  /** Tailwind gradient hint for the top accent bar. Default amber. */
  color?: string;
  /** Optional small hint shown below the value. Use sparingly — KPIs read
   *  better when sparse. Useful for "vs last 30d" or "min: X / max: Y". */
  hint?: string;
}

export default function MetricCard({
  label,
  value,
  suffix,
  icon: Icon,
  color = 'via-amber/50',
  hint,
}: MetricCardProps) {
  return (
    <div className="rounded-xl border border-border bg-surface/80 p-5 relative overflow-hidden min-h-[104px]">
      <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent ${color} to-transparent`} />
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-text-secondary">{label}</p>
        <Icon className="h-3.5 w-3.5 text-text-secondary/40" />
      </div>
      <p className="text-2xl font-bold text-text-primary">
        {value}
        {suffix && <span className="text-sm font-normal text-text-secondary ml-1">{suffix}</span>}
      </p>
      {hint && (
        <p className="text-[10px] text-text-secondary/60 mt-1 leading-snug">{hint}</p>
      )}
    </div>
  );
}
