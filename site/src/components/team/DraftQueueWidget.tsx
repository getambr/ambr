'use client'

import { useState } from 'react'
import { Send, Check } from 'lucide-react'
import { approveDraft, type Draft } from '@/lib/team-api'

function Skeleton() {
  return <div className="h-20 animate-pulse rounded-lg bg-surface-elevated" />
}

export function DraftQueueWidget({
  drafts,
  loading,
  onRefresh,
}: {
  drafts: { count: number; drafts: Draft[] } | null
  loading: boolean
  onRefresh: () => void
}) {
  const [approving, setApproving] = useState<string | null>(null)

  async function handleApprove(draftId: string) {
    setApproving(draftId)
    try {
      await approveDraft(draftId)
      onRefresh()
    } catch { /* user can retry */ }
    finally { setApproving(null) }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <Send className="h-4 w-4 text-amber" />
        <span className="text-micro">Draft Queue</span>
        {drafts && drafts.count > 0 && (
          <span className="ml-auto rounded-full bg-amber/10 px-2 py-0.5 text-xs font-mono text-amber">
            {drafts.count} pending
          </span>
        )}
      </div>

      {loading ? (
        <Skeleton />
      ) : !drafts?.drafts?.length ? (
        <div className="flex flex-col items-center py-6 text-text-secondary">
          <Check className="mb-2 h-7 w-7 text-success/40" />
          <p className="text-sm">No pending drafts</p>
        </div>
      ) : (
        <div className="space-y-3">
          {drafts.drafts.map(draft => (
            <div key={draft.draftId} className="rounded-lg border border-border bg-surface-elevated p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary">{draft.subject}</p>
                  <p className="mt-0.5 text-xs text-text-secondary">To: {draft.to}</p>
                </div>
              </div>
              <div className="mt-2 rounded border border-border bg-background p-2">
                <p className="line-clamp-3 text-xs text-text-secondary">{draft.body}</p>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => handleApprove(draft.draftId)}
                  disabled={approving === draft.draftId}
                  className="flex items-center gap-1 rounded-md bg-success/15 px-3 py-1.5 text-xs font-medium text-success transition-colors hover:bg-success/25 disabled:opacity-50"
                >
                  {approving === draft.draftId ? 'Sending...' : 'Approve & Send'}
                </button>
                <span className="text-[10px] font-mono text-text-secondary/50">
                  {new Date(draft.created).toLocaleDateString('en-GB')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
