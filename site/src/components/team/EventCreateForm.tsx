'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, Check } from 'lucide-react'
import { createEvent } from '@/lib/team-api'

interface EventCreateFormProps {
  selectedDate: Date
  onClose: () => void
  onCreated: () => void
}

function pad(n: number) { return String(n).padStart(2, '0') }

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function nextHour() {
  const h = new Date().getHours() + 1
  return h > 23 ? '09:00' : `${pad(h)}:00`
}

function hourAfter(time: string) {
  const [h, m] = time.split(':').map(Number)
  const next = h + 1
  return next > 23 ? '23:59' : `${pad(next)}:${pad(m)}`
}

export function EventCreateForm({ selectedDate, onClose, onCreated }: EventCreateFormProps) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(toDateStr(selectedDate))
  const [startTime, setStartTime] = useState(nextHour())
  const [endTime, setEndTime] = useState(hourAfter(nextHour()))
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [state, setState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return

    setState('saving')
    setError('')

    try {
      const start = `${date}T${startTime}:00`
      const end = `${date}T${endTime}:00`

      const res = await createEvent({
        title: title.trim(),
        start,
        end,
        ...(location ? { location } : {}),
        ...(description ? { description } : {}),
      })

      if (res.ok) {
        setState('success')
        setTimeout(() => { onCreated(); onClose() }, 800)
      } else {
        throw new Error('Failed to create event')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create event')
      setState('error')
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full max-w-md rounded-t-2xl lg:rounded-2xl border border-border bg-surface p-6"
        >
          {/* Handle bar for mobile */}
          <div className="flex justify-center mb-4 lg:hidden">
            <div className="h-1 w-10 rounded-full bg-border" />
          </div>

          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-medium text-text-primary">New Event</h3>
            <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Meeting with..."
                required
                autoFocus
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-amber/50"
              />
            </div>

            <div>
              <label className="block text-xs text-text-secondary mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-amber/50 [color-scheme:dark]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Start</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={e => { setStartTime(e.target.value); setEndTime(hourAfter(e.target.value)) }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-amber/50 [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">End</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-amber/50 [color-scheme:dark]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-text-secondary mb-1">Location <span className="text-text-secondary/40">(optional)</span></label>
              <input
                type="text"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="Google Meet, office, etc."
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-amber/50"
              />
            </div>

            <div>
              <label className="block text-xs text-text-secondary mb-1">Notes <span className="text-text-secondary/40">(optional)</span></label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                placeholder="Agenda, context..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-amber/50 resize-none"
              />
            </div>

            {error && <p className="text-xs text-error">{error}</p>}

            <button
              type="submit"
              disabled={!title.trim() || state === 'saving' || state === 'success'}
              className="w-full rounded-lg bg-amber/15 py-2.5 text-sm font-medium text-amber transition-colors hover:bg-amber/25 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {state === 'saving' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {state === 'success' && <Check className="h-3.5 w-3.5" />}
              {state === 'success' ? 'Created' : state === 'saving' ? 'Creating...' : 'Create Event'}
            </button>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
