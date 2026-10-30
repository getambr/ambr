'use client';

/**
 * Shared stacked-area timeline chart for dashboard surfaces that need to
 * show daily breakdowns by category (e.g. chat cost by model, mint
 * pipeline by outcome, audit-log activity by action type).
 *
 * Wraps recharts' AreaChart + ResponsiveContainer with the dashboard's
 * styling defaults (amber colors, 10pt text labels, dark grid). Keep the
 * surface small — the caller provides data + series config, this just
 * renders.
 *
 * Use:
 *   <StackedTimeline
 *     data={[{ day: '2026-05-01', kimi: 0.12, claude: 0.03 }, ...]}
 *     xKey="day"
 *     series={[
 *       { key: 'kimi', label: 'Kimi K2.6', color: '#c6a87c' },
 *       { key: 'claude', label: 'Claude', color: '#34D399' },
 *     ]}
 *     yLabel="USD"
 *     formatY={(n) => `$${n.toFixed(3)}`}
 *   />
 */

import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

const BORDER = '#2E2E2E';
const TEXT_SEC = '#999999';

export interface StackedTimelineSeries {
  /** Property name on each data row that holds this series' value for that day. */
  key: string;
  /** Display label shown in tooltip + legend. */
  label: string;
  /** Stroke + fill color. */
  color: string;
}

export interface StackedTimelineProps<T extends Record<string, string | number>> {
  data: T[];
  xKey: keyof T & string;
  series: StackedTimelineSeries[];
  /** Y-axis title shown on hover (cosmetic; not displayed inline). */
  yLabel?: string;
  /** Formatter for the Y-axis tick labels + tooltip values. */
  formatY?: (n: number) => string;
  /** Height in px. Defaults to 224 (matches the 14rem h-56 used elsewhere). */
  height?: number;
}

interface TooltipPayloadItem {
  name?: string;
  value: number;
  color?: string;
  dataKey?: string;
}
interface TimelineTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  formatY?: (n: number) => string;
}

function TimelineTooltip({ active, payload, label, formatY }: TimelineTooltipProps) {
  if (!active || !payload?.length) return null;
  const fmt = formatY ?? ((n: number) => String(n));
  return (
    <div className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-xs shadow-lg space-y-1 min-w-[140px]">
      <p className="text-text-secondary">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-text-secondary">{p.name}</span>
          </span>
          <span className="font-mono text-text-primary">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function StackedTimeline<T extends Record<string, string | number>>({
  data,
  xKey,
  series,
  formatY,
  height = 224,
}: StackedTimelineProps<T>) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
          <XAxis
            // recharts' dataKey is typed as TypedDataKey<T> which is hostile
            // to generics. The runtime accepts any string. Cast keeps TS
            // happy without losing the generic constraint on the caller.
            dataKey={xKey as string}
            stroke={BORDER}
            tick={{ fill: TEXT_SEC, fontSize: 10 }}
            interval="preserveStartEnd"
            tickLine={false}
          />
          <YAxis
            stroke={BORDER}
            tick={{ fill: TEXT_SEC, fontSize: 10 }}
            tickFormatter={formatY}
            allowDecimals
            tickLine={false}
            width={50}
          />
          <Tooltip content={<TimelineTooltip formatY={formatY} />} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 10, color: TEXT_SEC }}
          />
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stackId="1"
              stroke={s.color}
              fill={`url(#grad-${s.key})`}
              strokeWidth={1.5}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
