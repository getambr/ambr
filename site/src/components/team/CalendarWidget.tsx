'use client'

import { Calendar, Clock, MapPin } from 'lucide-react'
import type { CalendarEvent } from '@/lib/team-api'

function Skeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-14 rounded-lg bg-surface-elevated" />
      <div className="h-14 rounded-lg bg-surface-elevated" />
    </div>
  )
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' })
}

function isAmbrEvent(title: string) {
  const lower = title.toLowerCase()
  return lower.includes('ambr') || lower.includes('amber') || lower.includes('investor') || lower.includes('contract')
}

export function CalendarWidget({
  events,
  slots,
  loading,
}: {
  events: { count: number; events: CalendarEvent[] } | null
  slots: { slots: { start: string; end: string; duration: number }[] } | null
  loading: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <Calendar className="h-4 w-4 text-amber" />
        <span className="text-micro">Calendar</span>
        {events && (
          <span className="ml-auto rounded-full bg-amber/10 px-2 py-0.5 text-xs font-mono text-amber">
            {events.count}
          </span>
        )}
      </div>

      {loading ? (
        <Skeleton />
      ) : !events?.events.length ? (
        <p className="text-sm text-text-secondary">No upcoming events this week</p>
      ) : (
        <div className="space-y-2.5">
          {events.events.map(ev => (
            <div
              key={ev.id}
              className={`rounded-lg border p-3 ${
                isAmbrEvent(ev.title)
                  ? 'border-amber/30 bg-amber/5'
                  : 'border-border bg-surface-elevated'
              }`}
            >
              <p className="text-sm font-medium text-text-primary">{ev.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-text-secondary">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {fmtDate(ev.start)} {fmtTime(ev.start)}&ndash;{fmtTime(ev.end)}
                </span>
                {ev.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {ev.location}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && slots?.slots && slots.slots.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-micro mb-2">Free slots</p>
          <div className="flex flex-wrap gap-2">
            {slots.slots.slice(0, 5).map((s, i) => (
              <span key={i} className="rounded-md border border-border bg-surface-elevated px-2 py-1 text-xs font-mono text-text-secondary">
                {fmtDate(s.start)} {fmtTime(s.start)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
