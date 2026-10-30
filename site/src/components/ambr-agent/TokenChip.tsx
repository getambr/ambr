'use client';

import { useState } from 'react';
import { Brain, X } from 'lucide-react';

/**
 * Running token usage for an Ambr Agent chat session.
 * Aggregates per-turn input/output token counts + cost from /api/v1/chat
 * `usage` block on every response. Used by both DeployChat's ChatPanel and
 * the floating AmbrAgentOverlay so users can see their context-window
 * pressure ("how long can I keep going?") and accumulated $ spend.
 */
export interface SessionUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** Last-seen model id from the API. */
  model: string | null;
  /** Last-seen context window cap (e.g. 128000 for kimi-k2.6). */
  contextWindowMax: number;
}

export const EMPTY_SESSION_USAGE: SessionUsage = {
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  model: null,
  contextWindowMax: 128_000,
};

/**
 * Apply one turn's `usage` block to a running session total. Null/missing
 * fields are treated as zero so a single bad turn doesn't poison the chip.
 */
export function applyTurnUsage(prev: SessionUsage, turnUsage: unknown): SessionUsage {
  if (!turnUsage || typeof turnUsage !== 'object') return prev;
  const u = turnUsage as Record<string, unknown>;
  const inTok = typeof u.turn_input_tokens === 'number' ? u.turn_input_tokens : 0;
  const outTok = typeof u.turn_output_tokens === 'number' ? u.turn_output_tokens : 0;
  const cost = typeof u.turn_cost_usd === 'number' ? u.turn_cost_usd : 0;
  const model = typeof u.model === 'string' ? u.model : prev.model;
  const ctxMax = typeof u.context_window_max === 'number' ? u.context_window_max : prev.contextWindowMax;
  return {
    inputTokens: prev.inputTokens + inTok,
    outputTokens: prev.outputTokens + outTok,
    costUsd: prev.costUsd + cost,
    model,
    contextWindowMax: ctxMax,
  };
}

function formatTokens(n: number): string {
  if (n < 1_000) return `${n}`;
  if (n < 100_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${Math.round(n / 1_000)}k`;
}

function formatUsd(n: number): string {
  if (n < 0.001) return '$0';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

/**
 * Brand the underlying LLM as "Ambr v1.1" — the chat product version, not the
 * raw model id. Users shouldn't have to think about whether it's Kimi K2.6 or
 * Claude Sonnet under the hood. The raw model id still appears in the popover
 * for power users + debugging. (2026-05-26)
 */
function friendlyModelLabel(model: string | null | undefined): string {
  if (!model) return 'Ambr v1.1';
  return 'Ambr v1.1';
}

/**
 * Inline chip rendering session token usage + cost + context-window progress.
 * Click → popover with the per-turn breakdown and a Reset button.
 *
 * Hidden entirely when no turns have run yet (usage.inputTokens === 0) so
 * the header doesn't render a confusing `0 / 128k` chip on first load.
 */
export default function TokenChip({
  usage, onReset, compact,
}: {
  usage: SessionUsage;
  /** Caller clears its own turn array + resets usage state to EMPTY. */
  onReset: () => void;
  /** Skip the model-name suffix to save horizontal space in tight headers. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const total = usage.inputTokens + usage.outputTokens;
  if (total === 0) return null;

  const pct = Math.min(100, (total / usage.contextWindowMax) * 100);
  // Color states: green <50%, amber 50-80%, red >80%. Users get a visual
  // warning before they actually hit the context-window ceiling.
  const tier =
    pct < 50 ? 'ok'
    : pct < 80 ? 'warn'
    : 'high';
  const tierClass = {
    ok:   'text-emerald-300 border-emerald-400/30 bg-emerald-400/10',
    warn: 'text-amber border-amber/40 bg-amber/10',
    high: 'text-red-300 border-red-400/40 bg-red-400/10',
  }[tier];

  // Background-fill color (more opaque than the base pill) — visualizes
  // context-window usage as the pill itself filling up rather than a separate
  // strip below. Reported 2026-05-26: 'should be inside the pill so to see
  // the context window filling the pill actually'.
  const fillBg = { ok: 'bg-emerald-400/25', warn: 'bg-amber/30', high: 'bg-red-400/30' }[tier];

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={`${formatTokens(total)} of ~${formatTokens(usage.contextWindowMax)} context tokens used · ${formatUsd(usage.costUsd)} this session — click for details`}
        className={`relative overflow-hidden inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-mono whitespace-nowrap shrink-0 ${tierClass} hover:opacity-90 transition-opacity`}
      >
        {/* Background fill — width = pct% of the pill. Sits BEHIND the text
            (z-0) so content (z-10) stays readable. Replaces the previous
            thin progress strip outside the pill. */}
        <span
          className={`absolute inset-y-0 left-0 ${fillBg} transition-all duration-300 pointer-events-none`}
          style={{ width: `${pct}%` }}
          aria-hidden
        />
        <span className="relative z-10 inline-flex items-center gap-1.5">
          <Brain className="w-3 h-3" aria-hidden />
          <span>{formatTokens(total)} / {formatTokens(usage.contextWindowMax)}</span>
          <span className="opacity-60">· {formatUsd(usage.costUsd)}</span>
          {!compact && (
            <span className="opacity-60 hidden sm:inline">· {friendlyModelLabel(usage.model)}</span>
          )}
        </span>
      </button>

      {open && (
        // Popover opens UPWARD from the chip because the chip lives in the
        // chat panel's footer (above the input bar). Opening downward got
        // clipped by the input + viewport edge — user could only see the
        // "Session usage" header before content disappeared. (2026-05-26)
        <div className="absolute right-0 bottom-full mb-1.5 z-50 w-64 rounded-lg border border-border bg-surface-elevated shadow-2xl p-3 text-[11px] font-mono">
          <div className="flex items-center justify-between mb-2">
            <span className="text-text-primary font-medium text-xs">Session usage</span>
            <button onClick={() => setOpen(false)} className="p-0.5 rounded hover:bg-border/30">
              <X className="w-3 h-3 text-text-secondary" />
            </button>
          </div>
          <dl className="space-y-1 text-text-secondary">
            <div className="flex justify-between"><dt>Input</dt><dd className="text-text-primary">{formatTokens(usage.inputTokens)} tokens</dd></div>
            <div className="flex justify-between"><dt>Output</dt><dd className="text-text-primary">{formatTokens(usage.outputTokens)} tokens</dd></div>
            <div className="flex justify-between"><dt>Total</dt><dd className="text-text-primary">{formatTokens(total)} / {formatTokens(usage.contextWindowMax)} ({pct.toFixed(1)}%)</dd></div>
            <div className="flex justify-between"><dt>Cost</dt><dd className="text-text-primary">{formatUsd(usage.costUsd)}</dd></div>
            <div className="flex justify-between gap-2">
              <dt>Agent</dt>
              <dd className="text-text-primary text-right">
                {friendlyModelLabel(usage.model)}
                {usage.model && (
                  <span className="block text-[9px] text-text-secondary/50 font-mono">
                    runtime: {usage.model}
                  </span>
                )}
              </dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => { onReset(); setOpen(false); }}
            className="mt-3 w-full text-[11px] px-2 py-1.5 rounded-md border border-border bg-background text-text-primary hover:border-amber/40 hover:text-amber transition-colors"
          >
            Reset session (free context)
          </button>
          <p className="mt-2 text-[9px] text-text-secondary/60 leading-tight">
            Resetting clears the conversation locally so the next turn starts with an empty context window. The agent forgets earlier messages in this session.
          </p>
        </div>
      )}
    </div>
  );
}
