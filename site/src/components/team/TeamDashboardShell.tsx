'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw } from 'lucide-react'
import {
  getAmbrCalendar, getAmbrEmails, getAmbrUnread,
  getDraftQueue, getOutreach, getSuggestedSlots,
  type CalendarEvent, type TriagedEmail, type Draft, type OutreachContact,
} from '@/lib/team-api'
import { CalendarWidget } from './CalendarWidget'
import { EmailWidget } from './EmailWidget'
import { DraftQueueWidget } from './DraftQueueWidget'
import { CRMWidget } from './CRMWidget'
import { ContractPipelineWidget } from './ContractPipelineWidget'

export interface TeamData {
  calendar: { count: number; events: CalendarEvent[] } | null
  slots: { slots: { start: string; end: string; duration: number }[] } | null
  emails: { count: number; emails: TriagedEmail[] } | null
  unread: { unread: Record<string, number> } | null
  drafts: { count: number; drafts: Draft[] } | null
  outreach: { count: number; contacts: OutreachContact[] } | null
}

export function TeamDashboardShell() {
  const [data, setData] = useState<TeamData>({
    calendar: null, slots: null, emails: null,
    unread: null, drafts: null, outreach: null,
  })
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  async function fetchAll() {
    setLoading(true)
    const results = await Promise.allSettled([
      getAmbrCalendar(7),
      getSuggestedSlots(60, 7),
      getAmbrEmails(12),
      getAmbrUnread(),
      getDraftQueue(),
      getOutreach(),
    ])
    setData({
      calendar: results[0].status === 'fulfilled' ? results[0].value : null,
      slots: results[1].status === 'fulfilled' ? results[1].value : null,
      emails: results[2].status === 'fulfilled' ? results[2].value : null,
      unread: results[3].status === 'fulfilled' ? results[3].value : null,
      drafts: results[4].status === 'fulfilled' ? results[4].value : null,
      outreach: results[5].status === 'fulfilled' ? results[5].value : null,
    })
    setLoading(false)
    setLastRefresh(new Date())
  }

  useEffect(() => { fetchAll() }, [])

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08 } },
  }
  const item = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl text-text-primary">Team Dashboard</h1>
          <p className="mt-1 text-micro">
            {lastRefresh
              ? `Last refresh ${lastRefresh.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
              : 'Loading...'}
          </p>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Refreshing' : 'Refresh'}
        </button>
      </header>

      <motion.div
        variants={container}
        initial="hidden"
        animate={!loading ? 'show' : 'hidden'}
        className="grid grid-cols-1 gap-5 md:grid-cols-2"
      >
        <motion.div variants={item}>
          <ContractPipelineWidget loading={loading} />
        </motion.div>
        <motion.div variants={item}>
          <CalendarWidget
            events={data.calendar}
            slots={data.slots}
            loading={loading}
          />
        </motion.div>
        <motion.div variants={item}>
          <EmailWidget
            emails={data.emails}
            unread={data.unread}
            loading={loading}
          />
        </motion.div>
        <motion.div variants={item}>
          <DraftQueueWidget
            drafts={data.drafts}
            loading={loading}
            onRefresh={fetchAll}
          />
        </motion.div>
        <motion.div variants={item} className="md:col-span-2">
          <CRMWidget
            outreach={data.outreach}
            loading={loading}
          />
        </motion.div>
      </motion.div>
    </div>
  )
}
