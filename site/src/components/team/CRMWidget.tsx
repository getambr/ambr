'use client'

import { Users } from 'lucide-react'
import type { OutreachContact } from '@/lib/team-api'

function Skeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-8 rounded bg-surface-elevated" />
      <div className="h-12 rounded-lg bg-surface-elevated" />
      <div className="h-12 rounded-lg bg-surface-elevated" />
    </div>
  )
}

const STATUS_STYLES: Record<string, string> = {
  new: 'bg-blue-500/15 text-blue-400',
  contacted: 'bg-amber/15 text-amber',
  replied: 'bg-success/15 text-success',
  meeting: 'bg-violet-500/15 text-violet-400',
  closed: 'bg-surface-elevated text-text-secondary',
}

export function CRMWidget({
  outreach,
  loading,
}: {
  outreach: { count: number; contacts: OutreachContact[] } | null
  loading: boolean
}) {
  // Filter to Ambr project only
  const ambrContacts = outreach?.contacts.filter(c => c.project === 'ambr') || []
  const displayContacts = ambrContacts.length > 0 ? ambrContacts : outreach?.contacts || []

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <Users className="h-4 w-4 text-amber" />
        <span className="text-micro">Outreach CRM</span>
        {outreach && (
          <span className="ml-auto rounded-full bg-amber/10 px-2 py-0.5 text-xs font-mono text-amber">
            {displayContacts.length} contacts
          </span>
        )}
      </div>

      {loading ? (
        <Skeleton />
      ) : !displayContacts.length ? (
        <p className="text-sm text-text-secondary">No outreach contacts yet.</p>
      ) : (
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-left text-xs min-w-[500px]">
            <thead>
              <tr className="border-b border-border text-text-secondary">
                <th className="pb-2 pr-3 font-mono text-[10px] uppercase tracking-wider font-normal">Name</th>
                <th className="pb-2 pr-3 font-mono text-[10px] uppercase tracking-wider font-normal">Company</th>
                <th className="pb-2 pr-3 font-mono text-[10px] uppercase tracking-wider font-normal">Status</th>
                <th className="pb-2 font-mono text-[10px] uppercase tracking-wider font-normal">Next action</th>
              </tr>
            </thead>
            <tbody>
              {displayContacts.map(contact => (
                <tr key={contact.email} className="border-b border-border/50">
                  <td className="py-2.5 pr-3">
                    <p className="text-text-primary">{contact.name}</p>
                    <p className="text-[10px] text-text-secondary/60">{contact.email}</p>
                  </td>
                  <td className="py-2.5 pr-3 text-text-secondary">{contact.company}</td>
                  <td className="py-2.5 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-mono font-medium ${
                      STATUS_STYLES[contact.status] || STATUS_STYLES['new']
                    }`}>
                      {contact.status}
                    </span>
                  </td>
                  <td className="py-2.5 text-text-secondary">{contact.nextAction || '\u2014'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
