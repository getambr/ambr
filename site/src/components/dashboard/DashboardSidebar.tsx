'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText, Layers, Terminal, Wallet, Calendar, Mail, Users, Send,
  ChevronRight, Lock, Menu, X,
} from 'lucide-react'

export type DashboardSection =
  | 'contracts' | 'templates' | 'agents' | 'account'
  | 'calendar' | 'email' | 'drafts' | 'crm'

interface SidebarItem {
  id: DashboardSection
  label: string
  icon: React.ReactNode
  adminOnly?: boolean
}

const SECTIONS: { title: string; items: SidebarItem[] }[] = [
  {
    title: 'Contracts',
    items: [
      { id: 'contracts', label: 'Pipeline', icon: <Layers className="h-4 w-4" /> },
      { id: 'templates', label: 'Templates', icon: <FileText className="h-4 w-4" /> },
    ],
  },
  {
    title: 'Platform',
    items: [
      { id: 'agents', label: 'Agent Setup', icon: <Terminal className="h-4 w-4" /> },
      { id: 'account', label: 'Account', icon: <Wallet className="h-4 w-4" /> },
    ],
  },
  {
    title: 'Team',
    items: [
      { id: 'calendar', label: 'Calendar', icon: <Calendar className="h-4 w-4" />, adminOnly: true },
      { id: 'email', label: 'Email Triage', icon: <Mail className="h-4 w-4" />, adminOnly: true },
      { id: 'drafts', label: 'Draft Queue', icon: <Send className="h-4 w-4" />, adminOnly: true },
      { id: 'crm', label: 'Outreach CRM', icon: <Users className="h-4 w-4" />, adminOnly: true },
    ],
  },
]

export function DashboardSidebar({
  active,
  onNavigate,
  isAdmin,
}: {
  active: DashboardSection
  onNavigate: (section: DashboardSection) => void
  isAdmin: boolean
}) {
  const [mobileOpen, setMobileOpen] = useState(false)

  const nav = (
    <nav className="flex flex-col gap-6 py-6 px-4">
      {SECTIONS.map((section) => {
        const visibleItems = section.items.filter(
          (item) => !item.adminOnly || isAdmin
        )
        if (visibleItems.length === 0) return null

        return (
          <div key={section.title}>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-micro">{section.title}</p>
              {section.title === 'Team' && (
                <Lock className="h-3 w-3 text-amber/50" />
              )}
            </div>
            <div className="space-y-0.5">
              {visibleItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { onNavigate(item.id); setMobileOpen(false) }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active === item.id
                      ? 'bg-amber/10 text-amber border-l-2 border-amber'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
                  }`}
                >
                  {item.icon}
                  {item.label}
                  {active === item.id && (
                    <ChevronRight className="ml-auto h-3 w-3 text-amber/50" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </nav>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block fixed top-16 left-0 w-60 h-[calc(100vh-4rem)] border-r border-border bg-background overflow-y-auto">
        {nav}
      </aside>

      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-20 left-4 z-40 rounded-lg border border-border bg-surface p-2 text-text-secondary"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -260 }} animate={{ x: 0 }} exit={{ x: -260 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="lg:hidden fixed top-0 left-0 z-50 w-60 h-full border-r border-border bg-background"
            >
              <div className="flex items-center justify-between px-4 py-4 border-b border-border">
                <p className="text-micro">Dashboard</p>
                <button onClick={() => setMobileOpen(false)} className="text-text-secondary">
                  <X className="h-5 w-5" />
                </button>
              </div>
              {nav}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
