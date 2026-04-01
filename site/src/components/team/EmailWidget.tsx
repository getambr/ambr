'use client'

import { Mail, Inbox } from 'lucide-react'
import type { TriagedEmail } from '@/lib/team-api'

function Skeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-10 rounded-lg bg-surface-elevated" />
      <div className="h-10 rounded-lg bg-surface-elevated" />
      <div className="h-10 rounded-lg bg-surface-elevated" />
    </div>
  )
}

const PRIORITY_STYLES: Record<number, string> = {
  1: 'bg-error/15 text-error',
  2: 'bg-orange-500/15 text-orange-400',
  3: 'bg-amber/15 text-amber',
  4: 'bg-surface-elevated text-text-secondary',
  5: 'bg-surface-elevated text-text-secondary/60',
}

export function EmailWidget({
  emails,
  unread,
  loading,
}: {
  emails: { count: number; emails: TriagedEmail[] } | null
  unread: { unread: Record<string, number> } | null
  loading: boolean
}) {
  // Filter to Ambr-related emails only
  const ambrEmails = emails?.emails.filter(
    e => e.project === 'ambr' || e.from.includes('ambr') || e.subject.toLowerCase().includes('ambr')
  ) || []
  const allEmails = emails?.emails || []
  const displayEmails = ambrEmails.length > 0 ? ambrEmails : allEmails.slice(0, 8)

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <Mail className="h-4 w-4 text-amber" />
        <span className="text-micro">Email</span>
      </div>

      {loading ? (
        <Skeleton />
      ) : (
        <>
          {unread?.unread && (
            <div className="mb-3 flex flex-wrap gap-2">
              {Object.entries(unread.unread).map(([label, count]) => (
                <div
                  key={label}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-surface-elevated px-2.5 py-1.5"
                >
                  <Inbox className="h-3 w-3 text-text-secondary" />
                  <span className="text-xs text-text-secondary">{label.replace('Projects/', '')}</span>
                  <span className={`font-mono text-xs ${count > 0 ? 'text-amber' : 'text-text-secondary/40'}`}>
                    {count}
                  </span>
                </div>
              ))}
            </div>
          )}

          {displayEmails.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-micro mb-1">
                {ambrEmails.length > 0 ? 'Ambr emails' : 'Recent triaged'}
              </p>
              {displayEmails.slice(0, 6).map(email => (
                <div
                  key={email.messageId}
                  className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-elevated p-2.5"
                >
                  <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-mono font-medium ${
                    PRIORITY_STYLES[email.priority] || PRIORITY_STYLES[4]
                  }`}>
                    P{email.priority}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-text-primary">{email.subject}</p>
                    <p className="truncate text-xs text-text-secondary">{email.from}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-secondary">No Ambr emails triaged yet.</p>
          )}
        </>
      )}
    </div>
  )
}
