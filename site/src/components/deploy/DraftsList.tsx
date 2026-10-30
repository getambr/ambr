'use client';

/**
 * Drafts page — lists IndexedDB-stored contract drafts on this device.
 * Each draft can be resumed (re-hydrates the deploy chat) or discarded.
 */

import { useEffect, useState } from 'react';
import { FileText, Trash2, Play, Clock, AlertCircle } from 'lucide-react';
import {
  listDrafts,
  deleteDraft,
  loadSession,
  type DraftContract,
} from '@/lib/storage/indexed-db';
import { TEMPLATE_NAMES, TEMPLATE_PRICING_USD } from './contract-preview';

interface DraftsListProps {
  onResumeDraft: (id: string) => void;
  /** API key for the contracts list query used to reconcile local drafts
   *  against server-side deployed contracts. When the user authed by api_key,
   *  required for the reconcile probe to succeed. Pass null when authed by
   *  wallet only — in that case reconciliation is skipped (no token to
   *  authorize the list query). */
  apiKey?: string | null;
}

export default function DraftsList({ onResumeDraft, apiKey }: DraftsListProps) {
  const [drafts, setDrafts] = useState<DraftContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // On mount: load local drafts, then reconcile against server-side deployed
  // contracts. Local drafts whose `id` matches a deployed contract's
  // `client_draft_id` are "ghosts" — the deploy succeeded server-side but the
  // client never received the response (Chrome backgrounded the tab during
  // the fetch, so deleteDraft() in DeployChat.deploy() was never reached).
  // Prune them silently here so the user doesn't see stale entries.
  // (Reported by user 2026-05-26: "I still see the one drafted contract that
  // I actually already deployed.")
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const localDrafts = await listDrafts();

        // Fetch server-side deployed contracts (best-effort — if it fails,
        // we just don't reconcile and show all local drafts unfiltered).
        let deployedDraftIds = new Set<string>();
        if (apiKey) {
          try {
            const res = await fetch('/api/v1/contracts?limit=100', {
              headers: { 'X-API-Key': apiKey },
            });
            if (res.ok) {
              const json = await res.json().catch(() => null) as
                | { contracts?: Array<{ client_draft_id?: string | null }> }
                | null;
              deployedDraftIds = new Set<string>(
                (json?.contracts ?? [])
                  .map((c) => c.client_draft_id)
                  .filter((id): id is string => typeof id === 'string' && id.length > 0)
              );
            }
          } catch {
            // Silent — reconciliation is a best-effort safety net, not a
            // hard requirement. Worst case the user sees a ghost draft and
            // can manually discard it via the trash button.
          }
        }

        // "Empty" draft = no template + no extracted params. Created by the
        // old persist effect on mere DeployChat mount (before the empty-state
        // guard landed 2026-05-26). Doesn't show anything useful to the user
        // — just "No template yet · 0 fields filled." Auto-prune alongside
        // the deployed-ghost cleanup.
        const isEmpty = (d: typeof localDrafts[number]) =>
          !d.template && Object.keys(d.params ?? {}).length === 0;

        const ghosts = localDrafts.filter(
          (d) => deployedDraftIds.has(d.id) || isEmpty(d)
        );
        const stillPending = localDrafts.filter(
          (d) => !deployedDraftIds.has(d.id) && !isEmpty(d)
        );

        // Fire-and-forget cleanup of ghosts so they don't reappear on next
        // mount. Errors are swallowed — IndexedDB writes are idempotent and
        // a single failed delete will just retry next time.
        for (const ghost of ghosts) {
          deleteDraft(ghost.id).catch(() => {});
        }

        if (!cancelled) setDrafts(stillPending);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [apiKey]);

  async function handleDiscard(id: string) {
    await deleteDraft(id).catch(() => {});
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface/40 p-12 text-center">
        <Clock className="w-6 h-6 mx-auto text-text-secondary/40 mb-2 animate-pulse" />
        <p className="text-sm text-text-secondary">Loading drafts…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-error/30 bg-error/5 p-6 text-center">
        <AlertCircle className="w-6 h-6 mx-auto text-error mb-2" />
        <p className="text-sm text-error">{error}</p>
        <p className="text-xs text-text-secondary mt-2">
          IndexedDB may be disabled or blocked on this device.
        </p>
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface/40 p-12 text-center">
        <FileText className="w-8 h-8 mx-auto text-text-secondary/30 mb-3" />
        <p className="text-sm font-medium text-text-primary mb-1">No drafts yet</p>
        <p className="text-xs text-text-secondary max-w-md mx-auto">
          When you start a contract in Create Contract, your work-in-progress is saved here locally. Drafts stay on this device only.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-micro">Drafts (this device)</p>
          <h1 className="text-xl font-semibold text-text-primary">Your in-progress contracts</h1>
        </div>
        <span className="text-xs text-text-secondary">{drafts.length} draft{drafts.length === 1 ? '' : 's'}</span>
      </div>

      <div className="space-y-2">
        {drafts.map((d) => (
          <DraftRow key={d.id} draft={d} onResume={() => onResumeDraft(d.id)} onDiscard={() => handleDiscard(d.id)} />
        ))}
      </div>

      <div className="mt-6 rounded-lg border border-border/60 bg-surface/40 p-4">
        <p className="text-xs text-text-secondary">
          Drafts are stored locally in your browser using IndexedDB. They&apos;re not on Ambr&apos;s servers and won&apos;t sync to other devices.
        </p>
        <p className="text-[11px] text-text-secondary/60 mt-1">
          Cross-device sync is on the roadmap.
        </p>
      </div>
    </div>
  );
}

function DraftRow({
  draft,
  onResume,
  onDiscard,
}: {
  draft: DraftContract;
  onResume: () => void;
  onDiscard: () => void;
}) {
  const templateLabel = draft.template ? (TEMPLATE_NAMES[draft.template] ?? draft.template).split(' — ')[0] : '—';
  const templateName = draft.template ? (TEMPLATE_NAMES[draft.template] ?? draft.template).split(' — ')[1] ?? draft.template : 'No template yet';
  const price = draft.template ? TEMPLATE_PRICING_USD[draft.template] : null;
  const filled = Object.values(draft.params).filter((v) => v !== null && v !== undefined && v !== '').length;
  const missing = draft.missing_params?.length ?? 0;
  const updated = new Date(draft.updated_at);

  // Show the user's last message from the chat session as a "what did we
  // discuss" preview. The session was already being persisted per draft_id
  // (ChatSession in indexed-db.ts); this just exposes it to the user so they
  // can pick the right draft to resume without opening each one.
  const [lastUserMessage, setLastUserMessage] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadSession(draft.id)
      .then((s) => {
        if (cancelled || !s) return;
        const lastUser = [...s.turns].reverse().find((t) => t.role === 'user');
        if (lastUser?.content) setLastUserMessage(lastUser.content);
      })
      .catch(() => { /* session missing or IndexedDB blocked — silent */ });
    return () => { cancelled = true; };
  }, [draft.id]);

  return (
    <div className="rounded-xl border border-border bg-surface/60 px-4 py-3 flex items-center gap-4">
      <div className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg bg-amber/10 border border-amber/30 text-amber font-mono text-xs">
        {templateLabel}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-text-primary truncate">{templateName}</p>
          {draft.ready_to_deploy && (
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              ready
            </span>
          )}
        </div>
        {draft.intent_summary && (
          <p className="text-xs text-text-secondary truncate mt-0.5">&ldquo;{draft.intent_summary}&rdquo;</p>
        )}
        {lastUserMessage && (
          <p className="text-[11px] text-text-secondary/70 truncate mt-0.5" title={lastUserMessage}>
            Last said: &ldquo;{lastUserMessage.length > 80 ? lastUserMessage.slice(0, 80) + '…' : lastUserMessage}&rdquo;
          </p>
        )}
        <p className="text-[11px] font-mono text-text-secondary/60 mt-1">
          {filled} field{filled === 1 ? '' : 's'} filled
          {missing > 0 && <> · {missing} missing</>}
          {price !== null && <> · ${price.toFixed(2)}</>}
          {' · '}
          {updated.toLocaleString()}
        </p>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        <button
          onClick={onResume}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber/15 text-amber border border-amber/30 hover:bg-amber/25 text-xs font-medium"
        >
          <Play className="w-3 h-3" /> Resume
        </button>
        <button
          onClick={onDiscard}
          className="inline-flex items-center gap-1 p-1.5 rounded-md text-text-secondary hover:text-error border border-border hover:border-error/40 transition-colors"
          aria-label="Discard draft"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
