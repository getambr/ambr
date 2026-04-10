'use client'

import { useState, useMemo } from 'react'
import { Calendar, Clock, MapPin, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import type { CalendarEvent } from '@/lib/team-api'
import { EventCreateForm } from './EventCreateForm'

// ─── Helpers ───────────────────────────────────────────
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function isAmbrEvent(title: string) {
  const lower = title.toLowerCase()
  return lower.includes('ambr') || lower.includes('amber') || lower.includes('investor') || lower.includes('contract')
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = []
  const d = new Date(year, month, 1)
  while (d.getMonth() === month) {
    days.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return days
}

function getCalendarGrid(year: number, month: number): (Date | null)[] {
  const days = getDaysInMonth(year, month)
  const firstDow = (days[0].getDay() + 6) % 7 // Monday=0
  const grid: (Date | null)[] = []

  // Padding before first day
  for (let i = 0; i < firstDow; i++) {
    const d = new Date(year, month, -(firstDow - 1 - i))
    grid.push(d)
  }
  // Days of the month
  grid.push(...days)
  // Padding after last day to fill row
  while (grid.length % 7 !== 0) {
    const d = new Date(year, month + 1, grid.length - firstDow - days.length + 1)
    grid.push(d)
  }
  return grid
}

function getWeekDays(baseDate: Date): Date[] {
  const d = new Date(baseDate)
  const dow = (d.getDay() + 6) % 7 // Monday=0
  d.setDate(d.getDate() - dow)
  const week: Date[] = []
  for (let i = 0; i < 7; i++) {
    week.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return week
}

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// ─── Skeleton ──────────────────────────────────────────
function Skeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-8 w-40 rounded bg-surface-elevated" />
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="h-10 rounded bg-surface-elevated" />
        ))}
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────
export function CalendarWidget({
  events,
  slots,
  loading,
  onRefresh,
}: {
  events: { count: number; events: CalendarEvent[] } | null
  slots: { slots: { start: string; end: string; duration: number }[] } | null
  loading: boolean
  onRefresh?: () => void
}) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<Date>(today)
  const [showCreate, setShowCreate] = useState(false)
  const [weekBase, setWeekBase] = useState<Date>(today)

  // Calendar grid for desktop
  const grid = useMemo(() => getCalendarGrid(viewYear, viewMonth), [viewYear, viewMonth])

  // Week days for mobile
  const weekDays = useMemo(() => getWeekDays(weekBase), [weekBase])

  // Events for selected day
  const dayEvents = useMemo(() => {
    if (!events?.events.length) return []
    return events.events.filter(ev => isSameDay(new Date(ev.start), selectedDate))
  }, [events, selectedDate])

  // Events count per day (for dots)
  const eventsByDay = useMemo(() => {
    const map = new Map<string, number>()
    events?.events.forEach(ev => {
      const key = new Date(ev.start).toDateString()
      map.set(key, (map.get(key) || 0) + 1)
    })
    return map
  }, [events])

  // Slots for selected day
  const daySlots = useMemo(() => {
    if (!slots?.slots.length) return []
    return slots.slots.filter(s => isSameDay(new Date(s.start), selectedDate))
  }, [slots, selectedDate])

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }
  function prevWeek() {
    const d = new Date(weekBase)
    d.setDate(d.getDate() - 7)
    setWeekBase(d)
  }
  function nextWeek() {
    const d = new Date(weekBase)
    d.setDate(d.getDate() + 7)
    setWeekBase(d)
  }

  function handleEventCreated() {
    onRefresh?.()
  }

  // Filter out past free slots (don't show stale times)
  const now = new Date()
  const futureSlots = useMemo(() => {
    if (!slots?.slots?.length) return []
    return slots.slots.filter(s => new Date(s.start) > now)
  }, [slots, now.toDateString()])

  const futureDaySlots = useMemo(() => {
    return futureSlots.filter(s => isSameDay(new Date(s.start), selectedDate))
  }, [futureSlots, selectedDate])

  // ─── Shared sub-components ─────────────────────────
  const dayPanel = (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-text-primary">
          {selectedDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 rounded-md bg-amber/10 px-2 py-1 text-xs font-medium text-amber transition-colors hover:bg-amber/20"
        >
          <Plus className="h-3 w-3" />
          New
        </button>
      </div>

      {dayEvents.length === 0 ? (
        <p className="text-xs text-text-secondary/50">No events</p>
      ) : (
        <div className="space-y-2">
          {dayEvents.map(ev => (
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
                  {fmtTime(ev.start)}&ndash;{fmtTime(ev.end)}
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

      {/* Day-specific free slots */}
      {futureDaySlots.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-micro mb-2">Free slots</p>
          <div className="flex flex-wrap gap-2">
            {futureDaySlots.map((s, i) => (
              <button
                key={i}
                onClick={() => {
                  setSelectedDate(new Date(s.start))
                  setShowCreate(true)
                }}
                className="rounded-md border border-border bg-surface-elevated px-2 py-1 text-xs font-mono text-text-secondary hover:border-amber/30 hover:text-amber transition-colors"
              >
                {fmtTime(s.start)}&ndash;{fmtTime(s.end)}
                <span className="ml-1 text-text-secondary/40">{s.duration}m</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Week free slots fallback */}
      {futureDaySlots.length === 0 && futureSlots.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-micro mb-2">Free slots this week</p>
          <div className="flex flex-wrap gap-2">
            {futureSlots.slice(0, 8).map((s, i) => {
              const d = new Date(s.start)
              return (
                <button
                  key={i}
                  onClick={() => {
                    setSelectedDate(d)
                    setViewMonth(d.getMonth())
                    setViewYear(d.getFullYear())
                  }}
                  className="rounded-md border border-border bg-surface-elevated px-2 py-1 text-xs font-mono text-text-secondary hover:border-amber/30 hover:text-amber transition-colors"
                >
                  {d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })} {fmtTime(s.start)}
                  <span className="ml-1 text-text-secondary/40">{s.duration}m</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="rounded-xl border border-border bg-surface p-5 max-w-5xl">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <Calendar className="h-4 w-4 text-amber" />
        <span className="text-micro">Calendar</span>
        {events && (
          <span className="ml-auto rounded-full bg-amber/10 px-2 py-0.5 text-xs font-mono text-amber">
            {events.count}
          </span>
        )}
      </div>

      {loading ? <Skeleton /> : (
        <>
          {/* ─── Desktop: Side-by-side layout on xl+ ───── */}
          <div className="hidden lg:block">
            <div className="xl:grid xl:grid-cols-[1fr_320px] xl:gap-6">
              {/* Left: Month grid */}
              <div>
                {/* Month nav */}
                <div className="flex items-center justify-between mb-3">
                  <button onClick={prevMonth} className="p-1 text-text-secondary hover:text-text-primary transition-colors">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-sm font-medium text-text-primary">
                    {MONTH_NAMES[viewMonth]} {viewYear}
                  </span>
                  <button onClick={nextMonth} className="p-1 text-text-secondary hover:text-text-primary transition-colors">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                {/* Day headers */}
                <div className="grid grid-cols-7 gap-px mb-1">
                  {WEEKDAY_HEADERS.map(d => (
                    <div key={d} className="text-center text-[10px] font-mono uppercase tracking-wider text-text-secondary/60 py-1">
                      {d}
                    </div>
                  ))}
                </div>

                {/* Day cells */}
                <div className="grid grid-cols-7 gap-px">
                  {grid.map((date, i) => {
                    if (!date) return <div key={i} />
                    const isCurrentMonth = date.getMonth() === viewMonth
                    const isToday = isSameDay(date, today)
                    const isSelected = isSameDay(date, selectedDate)
                    const eventCount = eventsByDay.get(date.toDateString()) || 0

                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedDate(new Date(date))}
                        className={`relative h-10 rounded-md text-xs transition-colors ${
                          isSelected
                            ? 'border border-amber bg-amber/10 text-amber font-medium'
                            : isToday
                              ? 'border border-amber/30 bg-amber/5 text-amber'
                              : isCurrentMonth
                                ? 'border border-transparent text-text-primary hover:bg-surface-elevated'
                                : 'border border-transparent text-text-secondary/30'
                        }`}
                      >
                        {date.getDate()}
                        {eventCount > 0 && (
                          <span className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                            {Array.from({ length: Math.min(eventCount, 3) }).map((_, j) => (
                              <span key={j} className="h-1 w-1 rounded-full bg-amber" />
                            ))}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Right: Day panel (side-by-side on xl+, below on lg) */}
              <div className="hidden xl:block xl:border-l xl:border-border xl:pl-6">
                {dayPanel}
              </div>
            </div>

            {/* Day panel below on lg (not xl) */}
            <div className="xl:hidden mt-4 border-t border-border pt-4">
              {dayPanel}
            </div>
          </div>

          {/* ─── Mobile: Week Strip ─────────────────────── */}
          <div className="lg:hidden">
            {/* Week nav */}
            <div className="flex items-center justify-between mb-3">
              <button onClick={prevWeek} className="p-2 -ml-2 text-text-secondary hover:text-text-primary transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium text-text-primary">
                {MONTH_NAMES[weekDays[0].getMonth()]} {weekDays[0].getFullYear()}
              </span>
              <button onClick={nextWeek} className="p-2 -mr-2 text-text-secondary hover:text-text-primary transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Week days */}
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((date, i) => {
                const isToday = isSameDay(date, today)
                const isSelected = isSameDay(date, selectedDate)
                const eventCount = eventsByDay.get(date.toDateString()) || 0

                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(new Date(date))}
                    className={`flex flex-col items-center py-2 rounded-lg min-h-[56px] transition-colors ${
                      isSelected
                        ? 'border border-amber bg-amber/10'
                        : isToday
                          ? 'border border-amber/30 bg-amber/5'
                          : 'border border-transparent hover:bg-surface-elevated'
                    }`}
                  >
                    <span className="text-[10px] font-mono text-text-secondary/60 uppercase">
                      {WEEKDAY_HEADERS[i].slice(0, 2)}
                    </span>
                    <span className={`text-sm mt-0.5 ${
                      isSelected ? 'text-amber font-medium' : isToday ? 'text-amber' : 'text-text-primary'
                    }`}>
                      {date.getDate()}
                    </span>
                    {eventCount > 0 && (
                      <span className="flex gap-0.5 mt-0.5">
                        {Array.from({ length: Math.min(eventCount, 3) }).map((_, j) => (
                          <span key={j} className="h-1 w-1 rounded-full bg-amber" />
                        ))}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Day panel below on mobile */}
            <div className="mt-4 border-t border-border pt-4">
              {dayPanel}
            </div>
          </div>
        </>
      )}

      {/* Event Creation Modal */}
      {showCreate && (
        <EventCreateForm
          selectedDate={selectedDate}
          onClose={() => setShowCreate(false)}
          onCreated={handleEventCreated}
        />
      )}
    </div>
  )
}
