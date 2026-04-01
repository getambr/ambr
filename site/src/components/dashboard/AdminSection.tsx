'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  getAmbrCalendar, getAmbrEmails, getAmbrUnread,
  getDraftQueue, getOutreach, getSuggestedSlots,
  type CalendarEvent, type TriagedEmail, type Draft, type OutreachContact,
} from '@/lib/team-api'
import { CalendarWidget } from '@/components/team/CalendarWidget'
import { EmailWidget } from '@/components/team/EmailWidget'
import { DraftQueueWidget } from '@/components/team/DraftQueueWidget'
import { CRMWidget } from '@/components/team/CRMWidget'
import type { DashboardSection } from './DashboardSidebar'

interface AdminData {
  calendar: { count: number; events: CalendarEvent[] } | null
  slots: { slots: { start: string; end: string; duration: number }[] } | null
  emails: { count: number; emails: TriagedEmail[] } | null
  unread: { unread: Record<string, number> } | null
  drafts: { count: number; drafts: Draft[] } | null
  outreach: { count: number; contacts: OutreachContact[] } | null
}

export function AdminSection({ activeSection }: { activeSection: DashboardSection }) {
  const [data, setData] = useState<AdminData>({
    calendar: null, slots: null, emails: null,
    unread: null, drafts: null, outreach: null,
  })
  const [loading, setLoading] = useState(true)

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
  }

  useEffect(() => { fetchAll() }, [])

  const item = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  }

  if (activeSection === 'calendar') {
    return (
      <motion.div variants={item} initial="hidden" animate="show">
        <CalendarWidget events={data.calendar} slots={data.slots} loading={loading} />
      </motion.div>
    )
  }

  if (activeSection === 'email') {
    return (
      <motion.div variants={item} initial="hidden" animate="show">
        <EmailWidget emails={data.emails} unread={data.unread} loading={loading} />
      </motion.div>
    )
  }

  if (activeSection === 'drafts') {
    return (
      <motion.div variants={item} initial="hidden" animate="show">
        <DraftQueueWidget drafts={data.drafts} loading={loading} onRefresh={fetchAll} />
      </motion.div>
    )
  }

  if (activeSection === 'crm') {
    return (
      <motion.div variants={item} initial="hidden" animate="show">
        <CRMWidget outreach={data.outreach} loading={loading} />
      </motion.div>
    )
  }

  return null
}
