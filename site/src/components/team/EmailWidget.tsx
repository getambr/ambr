'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft, ChevronDown, Mail, CornerUpLeft, CalendarPlus,
  Sparkles, Send, Check, Loader2, Maximize2, Archive, PenSquare, UserPlus, X,
} from 'lucide-react'
import {
  getEmailBody, draftReply, archiveEmail, improveDraft, sendThreadReply,
  sendNewEmail, generateNewDraft, improveCompose,
  getSentLog, assignEmail, getAssignments,
  type EmailBody, type TriagedEmail, type SentEmail,
} from '@/lib/team-api'

// Render a Gmail thread (one or more messages) as a stack of cards.
// Sizes: 'compact' for inline list expansion, 'normal' for side-by-side panes,
// 'large' for the dedicated full reading view.
function renderThread(bodyData: EmailBody, sizing: 'compact' | 'normal' | 'large') {
  const messages = bodyData.messages || []
  const sizeClasses = {
    compact: { maxH: 'max-h-64', textSize: 'text-xs' },
    normal: { maxH: 'max-h-[55vh]', textSize: 'text-xs' },
    large: { maxH: 'max-h-[60vh]', textSize: 'text-sm' },
  }[sizing]

  // Fallback for missing messages array (e.g. legacy Apps Script response)
  if (messages.length === 0) {
    return (
      <div className={`${sizeClasses.maxH} overflow-y-auto pr-1`}>
        <div className="mb-3 space-y-1 rounded-lg border border-border bg-surface-elevated p-3 text-xs font-mono text-text-secondary">
          <div><span className="text-text-secondary/50">From:</span> {bodyData.from}</div>
          <div><span className="text-text-secondary/50">To:&nbsp;&nbsp;</span> {bodyData.to}</div>
          {bodyData.cc && <div><span className="text-text-secondary/50">Cc:&nbsp;&nbsp;</span> {bodyData.cc}</div>}
          <div><span className="text-text-secondary/50">Date:</span> {new Date(bodyData.date).toLocaleString('en-GB')}</div>
        </div>
        <pre className={`whitespace-pre-wrap break-words rounded-lg border border-border bg-background p-3 ${sizeClasses.textSize} text-text-primary font-sans leading-relaxed`}>
          {bodyData.body}
        </pre>
      </div>
    )
  }

  return (
    <div className={`space-y-2 ${sizeClasses.maxH} overflow-y-auto pr-1`}>
      {messages.length > 1 && (
        <div className="mb-1 flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-text-secondary/60">
          <span className="rounded bg-amber/10 px-1.5 py-0.5 text-amber">{messages.length} messages</span>
          <span>oldest → newest</span>
        </div>
      )}
      {messages.map((msg, i) => (
        <div key={msg.messageId || `msg-${i}`} className="rounded-lg border border-border bg-background p-3">
          <div className="mb-2 space-y-0.5 text-[10px] font-mono text-text-secondary">
            <div><span className="text-text-secondary/50">From:</span> {msg.from}</div>
            <div>
              <span className="text-text-secondary/50">To:&nbsp;&nbsp;</span>{msg.to}
              <span className="text-text-secondary/40"> · {new Date(msg.date).toLocaleString('en-GB')}</span>
            </div>
            {msg.cc && <div><span className="text-text-secondary/50">Cc:&nbsp;&nbsp;</span>{msg.cc}</div>}
          </div>
          <pre className={`whitespace-pre-wrap break-words ${sizeClasses.textSize} text-text-primary font-sans leading-relaxed`}>
            {msg.body}
          </pre>
        </div>
      ))}
    </div>
  )
}
import { EventCreateForm } from './EventCreateForm'

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

type AliasTab = {
  id: string
  label: string
  match: (toHeader: string) => boolean
  p1?: boolean
}

const TIER_1_ALIASES: AliasTab[] = [
  // "All" only shows emails actually addressed to an @ambr.run alias.
  // Personal Gmail clutter (Kraken, Namecheap, GitHub notifications, etc.)
  // is intentionally hidden so the dashboard stays focused on company mail.
  // To see personal Gmail, use Gmail web UI directly.
  { id: 'all', label: 'All', match: to => !!to && /@ambr\.run/i.test(to) },
  { id: 'ilvers@ambr.run', label: 'Ilvers', match: to => to.includes('ilvers@ambr.run') },
  { id: 'dainis@ambr.run', label: 'Dainis', match: to => to.includes('dainis@ambr.run') },
  { id: 'hello@ambr.run', label: 'Hello', match: to => to.includes('hello@ambr.run') },
  { id: 'support@ambr.run', label: 'Support', match: to => to.includes('support@ambr.run') },
  { id: 'legal@ambr.run', label: 'Legal', match: to => to.includes('legal@ambr.run'), p1: true },
  { id: 'privacy@ambr.run', label: 'Privacy', match: to => to.includes('privacy@ambr.run'), p1: true },
  { id: 'security@ambr.run', label: 'Security', match: to => to.includes('security@ambr.run'), p1: true },
  { id: 'sent', label: 'Sent', match: () => false },
]

// Personal aliases scoped to their owner. Shared aliases are visible to both founders.
// NOTE: this is frontend-only soft privacy. Anyone with the OPS_KEY can call the
// backend directly. The real fix is the server proxy refactor (queued separately).
const PERSONAL_ALIASES_BY_USER: Record<string, string[]> = {
  'ilvers.sermols@gmail.com': ['ilvers@ambr.run', 'ilvers.sermols@gmail.com'],
  'dainis@ambr.run': ['dainis@ambr.run'],
}

const SHARED_ALIASES = [
  'hello@ambr.run', 'support@ambr.run',
  'legal@ambr.run', 'privacy@ambr.run', 'security@ambr.run',
]

// Which @ambr.run aliases each user is allowed to send AS via the dashboard.
// MUST stay in sync with ALIASES_OWNED_BY in Apps Script Code.gs — the server
// is the source of truth, this is just a UI hint for the From: chip.
const ALIASES_OWNED_BY: Record<string, string[]> = {
  'ilvers.sermols@gmail.com': [
    'ilvers@ambr.run',
    'hello@ambr.run', 'support@ambr.run',
    'legal@ambr.run', 'privacy@ambr.run', 'security@ambr.run',
  ],
  'dainis@ambr.run': [
    'dainis@ambr.run',
    'hello@ambr.run', 'support@ambr.run',
    'legal@ambr.run', 'privacy@ambr.run', 'security@ambr.run',
    'investors@ambr.run', 'sales@ambr.run', 'billing@ambr.run',
  ],
}

const PERSONAL_ALIAS_BY_USER: Record<string, string> = {
  'ilvers.sermols@gmail.com': 'ilvers@ambr.run',
  'dainis@ambr.run': 'dainis@ambr.run',
  'brunokrisjanis99@gmail.com': 'bruno@ambr.run',
}

const TEAM_MEMBERS = [
  { email: 'ilvers.sermols@gmail.com', name: 'Ilvers', alias: 'ilvers@ambr.run' },
  { email: 'dainis@ambr.run', name: 'Dainis', alias: 'dainis@ambr.run' },
  { email: 'brunokrisjanis99@gmail.com', name: 'Bruno', alias: 'bruno@ambr.run' },
]

// Mirrors the server-side resolveFromAlias() in Apps Script Code.gs. Picks
// which @ambr.run alias the reply will be sent from. Pure UI hint — actual
// decision is made server-side from the authenticated user's identity.
// Returns empty string if user is unknown.
function computeReplyFromAlias(currentUserEmail: string | undefined, originalToHeader: string | undefined): string {
  if (!currentUserEmail) return ''
  const sender = currentUserEmail.toLowerCase()
  const owned = ALIASES_OWNED_BY[sender] || []

  if (originalToHeader) {
    const matches = originalToHeader.toLowerCase().match(/[a-z0-9._-]+@ambr\.run/g) || []
    for (const candidate of matches) {
      if (owned.includes(candidate)) {
        return candidate
      }
    }
  }

  return PERSONAL_ALIAS_BY_USER[sender] || ''
}

function getVisibleAliases(currentUserEmail?: string): string[] {
  if (!currentUserEmail) {
    // Unknown user: defensive fallback. Show only shared aliases, no personal mail.
    return SHARED_ALIASES
  }
  const personal = PERSONAL_ALIASES_BY_USER[currentUserEmail.toLowerCase()] || []
  return [...personal, ...SHARED_ALIASES]
}

function aliasLabel(toHeader: string): string {
  const match = toHeader.match(/([a-z0-9._-]+)@ambr\.run/i)
  if (!match) return ''
  return match[1].toLowerCase()
}

function pickDefaultTab(currentUserEmail?: string): string {
  if (!currentUserEmail) return 'all'
  const lower = currentUserEmail.toLowerCase()
  if (lower.startsWith('ilvers')) return 'ilvers@ambr.run'
  if (lower.startsWith('dainis')) return 'dainis@ambr.run'
  return 'all'
}

function extractEmail(input: string): string {
  const match = input.match(/<(.+?)>/)
  return match ? match[1] : input.trim()
}

// ── Discriminated-union mode state ──────────────────────

type DraftState =
  | { phase: 'loading' }
  | { phase: 'editing'; draftId: string; subject: string; body: string }
  | { phase: 'sending'; draftId: string; subject: string; body: string }
  | { phase: 'error'; message: string }

type ComposeState = {
  to: string
  subject: string
  body: string
  fromAlias: string
  intent: string  // optional Kimi prompt
  phase: 'editing' | 'generating' | 'improving' | 'sending' | 'error'
  errorMessage?: string
}

type Mode =
  | { kind: 'list' }
  | { kind: 'reading'; email: TriagedEmail }
  | { kind: 'replying'; email: TriagedEmail; draft: DraftState }
  | { kind: 'scheduling'; email: TriagedEmail; extraGuests?: string[] }
  | { kind: 'sent'; email: TriagedEmail; sentTo: string }
  | { kind: 'composing'; compose: ComposeState }
  | { kind: 'composeSent'; to: string; from: string }

export function EmailWidget({
  emails,
  loading,
  currentUserEmail,
}: {
  emails: { count: number; emails: TriagedEmail[] } | null
  unread?: { unread: Record<string, number> } | null
  loading: boolean
  currentUserEmail?: string
}) {
  const [activeTab, setActiveTab] = useState<string>(() => pickDefaultTab(currentUserEmail))
  const [mode, setMode] = useState<Mode>({ kind: 'list' })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [bodyData, setBodyData] = useState<EmailBody | null>(null)
  const [bodyLoading, setBodyLoading] = useState(false)
  const [bodyError, setBodyError] = useState<string | null>(null)
  const [locallyArchived, setLocallyArchived] = useState<Set<string>>(new Set())
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const [assignments, setAssignments] = useState<Record<string, string[]>>({})
  const [assignDropdown, setAssignDropdown] = useState<string | null>(null)
  const [sentEmails, setSentEmails] = useState<SentEmail[]>([])
  const [sentLoading, setSentLoading] = useState(false)

  const allEmails = useMemo(() => emails?.emails || [], [emails])

  // Privacy filter: which aliases is this user allowed to see?
  const visibleAliasIds = useMemo(() => getVisibleAliases(currentUserEmail), [currentUserEmail])

  // Tabs the user can see (always include 'all' + 'sent', plus only the aliases in their permitted set)
  const visibleTabs = useMemo(
    () => TIER_1_ALIASES.filter(t => t.id === 'all' || t.id === 'sent' || visibleAliasIds.includes(t.id)),
    [visibleAliasIds]
  )

  // Load persisted assignments on mount
  useEffect(() => {
    getAssignments()
      .then(res => { if (res.assignments) setAssignments(res.assignments) })
      .catch(() => {})
  }, [])

  // Fetch sent emails on mount + when Sent tab is clicked
  useEffect(() => {
    getSentLog(50)
      .then(res => { setSentEmails(res.emails || []) })
      .catch(() => {})
  }, [])

  // Refresh sent list when switching to Sent tab
  useEffect(() => {
    if (activeTab !== 'sent') return
    setSentLoading(true)
    getSentLog(50)
      .then(res => { setSentEmails(res.emails || []) })
      .catch(() => {})
      .finally(() => setSentLoading(false))
  }, [activeTab])

  // Emails the user is permitted to see. Must be addressed to an @ambr.run
  // alias the user owns. Personal Gmail (Kraken, Namecheap, GitHub, etc.) and
  // legacy untagged rows are intentionally excluded from the dashboard so it
  // stays focused on company mail. To see personal Gmail, use Gmail web UI.
  const ownedEmails = useMemo(() => {
    return allEmails.filter(e => {
      const to = (e.to_address || '').toLowerCase()
      if (!to) return false
      if (!/@ambr\.run/i.test(to)) return false
      return visibleAliasIds.some(alias => to.includes(alias))
    })
  }, [allEmails, visibleAliasIds])

  const filtered = useMemo(() => {
    const tab = visibleTabs.find(t => t.id === activeTab) || visibleTabs[0]
    return ownedEmails
      .filter(e => !locallyArchived.has(e.messageId))
      .filter(e => tab.match((e.to_address || '').toLowerCase()))
  }, [ownedEmails, activeTab, locallyArchived, visibleTabs])

  // Active messageId for body fetching: either inline expansion in list mode,
  // or the email shown in reading/replying/scheduling modes
  const activeMessageId =
    mode.kind === 'list'
      ? expandedId
      : (mode.kind === 'reading' || mode.kind === 'replying' || mode.kind === 'scheduling'
          ? mode.email.messageId
          : null)

  useEffect(() => {
    if (!activeMessageId) {
      setBodyData(null)
      setBodyError(null)
      return
    }
    if (bodyData?.messageId === activeMessageId) return
    setBodyLoading(true)
    setBodyError(null)
    getEmailBody(activeMessageId)
      .then(res => {
        if ('error' in res) setBodyError(res.error)
        else setBodyData(res)
      })
      .catch(e => setBodyError(String(e)))
      .finally(() => setBodyLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMessageId])

  // ── Mode transitions ─────────────────────────────────

  function toggleExpand(email: TriagedEmail) {
    setExpandedId(prev => (prev === email.messageId ? null : email.messageId))
  }

  function openFullReading(email: TriagedEmail) {
    setMode({ kind: 'reading', email })
  }

  function backToList() {
    setMode({ kind: 'list' })
  }

  // Open the reply view with an empty manual draft. NO Kimi call here.
  // The user can type their own reply, or click Generate / Improve buttons
  // inside the draft column to opt in to Kimi.
  function startReply(email: TriagedEmail) {
    const subject = `Re: ${email.subject.replace(/^re:\s*/i, '')}`
    setMode({
      kind: 'replying',
      email,
      draft: { phase: 'editing', draftId: '', subject, body: '' },
    })
  }

  // Explicit Kimi call: draft a fresh reply from scratch using project context.
  function generateWithAmbr() {
    if (mode.kind !== 'replying') return
    const email = mode.email
    setMode({ kind: 'replying', email, draft: { phase: 'loading' } })
    draftReply(email.messageId)
      .then(res => {
        if ('error' in res) {
          setMode({ kind: 'replying', email, draft: { phase: 'error', message: res.error } })
        } else {
          setMode({
            kind: 'replying',
            email,
            draft: { phase: 'editing', draftId: res.draftId, subject: res.subject, body: res.body },
          })
        }
      })
      .catch(e => {
        setMode({ kind: 'replying', email, draft: { phase: 'error', message: String(e) } })
      })
  }

  // Take the user's current draft body and ask Kimi to polish it (grammar,
  // spelling, flow) while preserving the same language and meaning.
  async function improveWithAmbr() {
    if (mode.kind !== 'replying' || mode.draft.phase !== 'editing') return
    const email = mode.email
    const currentBody = mode.draft.body
    const currentSubject = mode.draft.subject
    if (!currentBody.trim()) return
    setMode({ kind: 'replying', email, draft: { phase: 'loading' } })
    try {
      const res = await improveDraft(email.messageId, currentBody)
      if ('error' in res) {
        setMode({ kind: 'replying', email, draft: { phase: 'error', message: res.error } })
      } else {
        setMode({
          kind: 'replying',
          email,
          draft: { phase: 'editing', draftId: '', subject: currentSubject, body: res.improved },
        })
      }
    } catch (e) {
      setMode({ kind: 'replying', email, draft: { phase: 'error', message: String(e) } })
    }
  }

  function startSchedule(email: TriagedEmail) {
    // Auto-include assigned team members as guests
    const assigned = assignments[email.messageId] || []
    setMode({ kind: 'scheduling', email, extraGuests: assigned.length > 0 ? assigned : undefined })
  }

  // ── Compose new email (cold outreach) ──────────────────
  // Open the compose form with empty fields. The default From: alias is
  // the user's personal alias (ilvers@ambr.run or dainis@ambr.run).
  function startCompose() {
    const defaultAlias = currentUserEmail
      ? PERSONAL_ALIAS_BY_USER[currentUserEmail.toLowerCase()] || ''
      : ''
    setMode({
      kind: 'composing',
      compose: {
        to: '',
        subject: '',
        body: '',
        fromAlias: defaultAlias,
        intent: '',
        phase: 'editing',
      },
    })
  }

  function updateCompose(patch: Partial<ComposeState>) {
    if (mode.kind !== 'composing') return
    setMode({ kind: 'composing', compose: { ...mode.compose, ...patch } })
  }

  // Generate a cold-email body via Kimi based on the user's intent + subject.
  async function generateComposeBody() {
    if (mode.kind !== 'composing') return
    const { to, subject, intent, fromAlias } = mode.compose
    if (!subject.trim()) {
      updateCompose({ phase: 'error', errorMessage: 'Subject required for Generate' })
      return
    }
    updateCompose({ phase: 'generating', errorMessage: undefined })
    try {
      const res = await generateNewDraft(to, subject, intent, fromAlias)
      if ('error' in res) {
        updateCompose({ phase: 'error', errorMessage: res.error })
      } else {
        updateCompose({ body: res.body, phase: 'editing' })
      }
    } catch (e) {
      updateCompose({ phase: 'error', errorMessage: String(e) })
    }
  }

  // Polish the user's typed body via Kimi.
  async function improveComposeBody() {
    if (mode.kind !== 'composing') return
    const { body, subject, fromAlias } = mode.compose
    if (!body.trim()) return
    updateCompose({ phase: 'improving', errorMessage: undefined })
    try {
      const res = await improveCompose(body, subject, fromAlias)
      if ('error' in res) {
        updateCompose({ phase: 'error', errorMessage: res.error })
      } else {
        updateCompose({ body: res.improved, phase: 'editing' })
      }
    } catch (e) {
      updateCompose({ phase: 'error', errorMessage: String(e) })
    }
  }

  // Send the cold email via Resend (Apps Script appends signature server-side).
  async function sendCompose() {
    if (mode.kind !== 'composing') return
    const { to, subject, body, fromAlias } = mode.compose
    if (!to.trim() || !subject.trim() || !body.trim() || !fromAlias) {
      updateCompose({ phase: 'error', errorMessage: 'To, Subject, Body, and From are all required' })
      return
    }
    updateCompose({ phase: 'sending', errorMessage: undefined })
    try {
      const res = await sendNewEmail(to.trim(), subject.trim(), body, fromAlias)
      if ('error' in res) {
        updateCompose({ phase: 'error', errorMessage: res.error })
      } else {
        setMode({ kind: 'composeSent', to: res.to, from: res.from })
      }
    } catch (e) {
      updateCompose({ phase: 'error', errorMessage: String(e) })
    }
  }

  async function handleArchive(email: TriagedEmail) {
    // Optimistic: hide the row immediately + collapse it
    setLocallyArchived(prev => new Set(prev).add(email.messageId))
    setExpandedId(prev => (prev === email.messageId ? null : prev))
    setArchiveError(null)
    try {
      const res = await archiveEmail(email.messageId)
      if ('error' in res) {
        // Revert
        setLocallyArchived(prev => {
          const next = new Set(prev)
          next.delete(email.messageId)
          return next
        })
        setArchiveError(res.error)
      }
    } catch (e) {
      setLocallyArchived(prev => {
        const next = new Set(prev)
        next.delete(email.messageId)
        return next
      })
      setArchiveError(String(e))
    }
  }

  function updateDraftBody(body: string) {
    if (mode.kind !== 'replying' || mode.draft.phase !== 'editing') return
    setMode({ ...mode, draft: { ...mode.draft, body } })
  }

  async function sendDraft() {
    if (mode.kind !== 'replying' || mode.draft.phase !== 'editing') return
    const { draftId, subject, body } = mode.draft
    const email = mode.email
    if (!body.trim()) return
    setMode({ kind: 'replying', email, draft: { phase: 'sending', draftId, subject, body } })
    try {
      const res = await sendThreadReply(email.messageId, body)
      if ('error' in res) {
        setMode({ kind: 'replying', email, draft: { phase: 'error', message: res.error } })
      } else {
        setMode({ kind: 'sent', email, sentTo: res.to })
      }
    } catch (e) {
      setMode({ kind: 'replying', email, draft: { phase: 'error', message: String(e) } })
    }
  }

  // ── SCHEDULING MODE ──────────────────────────────────
  if (mode.kind === 'scheduling') {
    const subjectClean = mode.email.subject.replace(/^(re:|fwd?:|fw:)\s*/i, '')
    const senderEmail = bodyData?.replyTo
      ? extractEmail(bodyData.replyTo)
      : extractEmail(mode.email.from)
    const extraGuests = mode.extraGuests || []
    const allGuests = [senderEmail, ...extraGuests].filter(Boolean).join(', ')
    const description = bodyData
      ? `Subject: ${mode.email.subject}\nFrom: ${bodyData.from}\n\n${bodyData.body.substring(0, 300)}${bodyData.body.length > 300 ? '...' : ''}`
      : `Subject: ${mode.email.subject}\nFrom: ${mode.email.from}`

    return (
      <>
        <div className="opacity-30 pointer-events-none">
          {renderListMode()}
        </div>
        <EventCreateForm
          selectedDate={new Date()}
          initialTitle={subjectClean}
          initialDescription={description}
          initialGuests={allGuests}
          onClose={() => setMode({ kind: 'list' })}
          onCreated={() => setMode({ kind: 'list' })}
        />
      </>
    )
  }

  // ── SENT MODE ────────────────────────────────────────
  if (mode.kind === 'sent') {
    return (
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="rounded-full bg-amber/10 p-3">
            <Check className="h-6 w-6 text-amber" />
          </div>
          <p className="text-sm text-text-primary">Reply sent</p>
          <p className="text-xs text-text-secondary font-mono">to {mode.sentTo}</p>
          <button
            type="button"
            onClick={backToList}
            className="mt-3 rounded-lg border border-amber/30 bg-amber/10 px-4 py-2 text-sm font-medium text-amber hover:bg-amber/15 transition-colors"
          >
            Back to inbox
          </button>
        </div>
      </div>
    )
  }

  // ── REPLYING MODE: always side-by-side, draft column morphs through phases ──
  if (mode.kind === 'replying') {
    const draftPhase = mode.draft.phase
    return (
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-4 flex items-center gap-2">
          <button
            onClick={backToList}
            className="flex items-center gap-1 text-text-secondary hover:text-amber transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="text-xs font-mono">Back to inbox</span>
          </button>
          <span className="ml-2 text-xs text-text-secondary">Replying to {extractEmail(mode.email.from)}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* LEFT: Original email, always rendered. Body skeleton if still loading */}
          <div className="rounded-lg border border-border bg-surface-elevated p-4 flex flex-col">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">Original</p>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-medium ${
                PRIORITY_STYLES[mode.email.priority] || PRIORITY_STYLES[4]
              }`}>
                P{mode.email.priority}
              </span>
            </div>
            <h4 className="mb-3 text-sm font-medium text-text-primary">{mode.email.subject}</h4>

            {bodyLoading && !bodyData && (
              <div className="space-y-2 animate-pulse">
                <div className="h-3 rounded bg-background" />
                <div className="h-3 w-3/4 rounded bg-background" />
                <div className="h-3 w-1/2 rounded bg-background" />
              </div>
            )}

            {bodyData && renderThread(bodyData, 'normal')}
          </div>

          {/* RIGHT: Ambr draft column. Header always shown, inner content varies by phase */}
          <div className="rounded-lg border border-amber/30 bg-surface-elevated p-4 flex flex-col min-h-[400px]">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className={`h-3.5 w-3.5 text-amber ${draftPhase === 'loading' ? 'animate-pulse' : ''}`} />
              <p className="text-[10px] font-mono uppercase tracking-wider text-amber">Ambr Draft</p>
              {draftPhase === 'sending' && (
                <span className="ml-auto flex items-center gap-1 text-[10px] text-text-secondary">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Sending...
                </span>
              )}
            </div>

            {draftPhase === 'loading' && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <Sparkles className="h-6 w-6 text-amber animate-pulse" />
                <p className="text-sm text-text-secondary">Drafting reply with Ambr...</p>
                <p className="text-[10px] text-text-secondary/60 font-mono">usually 5–10 seconds</p>
              </div>
            )}

            {draftPhase === 'error' && (
              <div className="flex flex-1 flex-col items-start justify-center gap-3">
                <p className="text-sm text-error">Failed: {mode.draft.message}</p>
                <button
                  type="button"
                  onClick={() => startReply(mode.email)}
                  className="rounded-lg border border-amber/30 bg-amber/10 px-3 py-1.5 text-xs font-medium text-amber hover:bg-amber/15 transition-colors"
                >
                  Back to draft
                </button>
              </div>
            )}

            {(draftPhase === 'editing' || draftPhase === 'sending') && (
              <>
                {/* Static thread context (subject is set automatically by Gmail's reply) */}
                <p className="mb-2 mt-1 text-[10px] font-mono text-text-secondary/70">
                  Thread reply: <span className="text-text-secondary">{mode.draft.subject}</span>
                </p>

                {/* From: chip — auto-resolved alias the reply will be sent AS.
                    Mirrors the server-side resolveFromAlias() decision. */}
                {(() => {
                  const fromAlias = computeReplyFromAlias(currentUserEmail, mode.email.to_address)
                  if (!fromAlias) return null
                  return (
                    <div className="mb-2 flex items-center gap-2 rounded border border-amber/20 bg-amber/5 px-2 py-1.5">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-text-secondary/60">From</span>
                      <span className="text-[11px] font-mono text-amber">{fromAlias}</span>
                      <span className="ml-auto text-[10px] text-text-secondary/60">signature appended automatically</span>
                    </div>
                  )
                })()}

                {/* AI assist toolbar: opt-in Kimi help */}
                <div className="mb-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={generateWithAmbr}
                    disabled={draftPhase === 'sending'}
                    className="flex items-center gap-1.5 rounded border border-amber/30 bg-amber/10 px-2.5 py-1 text-[10px] font-medium text-amber hover:bg-amber/15 transition-colors disabled:opacity-50"
                    title="Have Ambr draft a reply from scratch"
                  >
                    <Sparkles className="h-3 w-3" />
                    Generate
                  </button>
                  <button
                    type="button"
                    onClick={improveWithAmbr}
                    disabled={draftPhase === 'sending' || !mode.draft.body.trim()}
                    className="flex items-center gap-1.5 rounded border border-border bg-background px-2.5 py-1 text-[10px] font-medium text-text-secondary hover:border-amber/30 hover:text-amber transition-colors disabled:opacity-30"
                    title="Polish grammar and flow while keeping language"
                  >
                    <Sparkles className="h-3 w-3" />
                    Improve
                  </button>
                </div>

                <textarea
                  value={mode.draft.body}
                  onChange={e => updateDraftBody(e.target.value)}
                  disabled={draftPhase === 'sending'}
                  rows={14}
                  placeholder="Type your reply, or click Generate to have Ambr draft one"
                  className="w-full flex-1 rounded border border-border bg-background p-3 text-xs text-text-primary font-sans leading-relaxed resize-y focus:outline-none focus:border-amber/50 disabled:opacity-50 max-h-[55vh]"
                />

                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={backToList}
                    disabled={draftPhase === 'sending'}
                    className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-text-secondary hover:border-amber/30 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={sendDraft}
                    disabled={draftPhase === 'sending' || !mode.draft.body.trim()}
                    className="flex items-center gap-1.5 rounded-lg border border-amber/30 bg-amber/15 px-3 py-1.5 text-xs font-medium text-amber hover:bg-amber/25 transition-colors disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Send Reply
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── READING MODE: dedicated full-width view (fallback for long emails) ──
  if (mode.kind === 'reading') {
    return renderReading(mode.email)
  }

  // ── COMPOSE SENT confirmation ────────────────────────
  if (mode.kind === 'composeSent') {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6">
        <div className="flex items-center gap-2 mb-3">
          <Check className="h-5 w-5 text-emerald-400" />
          <h3 className="text-sm font-semibold text-emerald-400">Email sent</h3>
        </div>
        <p className="text-sm text-text-secondary mb-1">
          Your cold email was delivered via Resend with the {mode.from} signature appended.
        </p>
        <p className="text-xs text-text-secondary/70 mb-4">
          Recipient: <span className="font-mono text-text-secondary">{mode.to}</span> · From: <span className="font-mono text-amber">{mode.from}</span>
        </p>
        <button
          type="button"
          onClick={() => setMode({ kind: 'list' })}
          className="rounded-md border border-amber/30 bg-amber/10 px-3 py-1.5 text-xs font-medium text-amber hover:bg-amber/15 transition-colors"
        >
          Back to inbox
        </button>
      </div>
    )
  }

  // ── COMPOSE MODE: write a brand new cold email ───────
  if (mode.kind === 'composing') {
    return renderCompose(mode.compose)
  }

  // ── LIST MODE (with inline accordion expansion) ──────
  return renderListMode()

  // ───────────────────────────────────────────────────────
  // RENDER HELPERS
  // ───────────────────────────────────────────────────────

  function renderListMode() {
    return (
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-4 flex items-center gap-2">
          <Mail className="h-4 w-4 text-amber" />
          <span className="text-micro">Email</span>
          <button
            type="button"
            onClick={startCompose}
            className="ml-auto flex items-center gap-1.5 rounded-md border border-amber/30 bg-amber/10 px-2.5 py-1 text-xs font-medium text-amber hover:bg-amber/15 transition-colors"
            title="Compose a new email from scratch"
          >
            <PenSquare className="h-3 w-3" />
            Compose
          </button>
          {ownedEmails.length > 0 && (
            <span className="rounded-full bg-amber/10 px-2 py-0.5 text-xs font-mono text-amber">
              {filtered.length}{filtered.length !== ownedEmails.length ? ` / ${ownedEmails.length}` : ''} total
            </span>
          )}
        </div>

        {archiveError && (
          <div className="mb-3 flex items-center justify-between rounded-md border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
            <span>Archive failed: {archiveError}</span>
            <button
              type="button"
              onClick={() => setArchiveError(null)}
              className="ml-2 text-error/70 hover:text-error"
            >
              ×
            </button>
          </div>
        )}

        <div className="mb-3 flex flex-wrap gap-1.5">
          {visibleTabs.map(tab => {
            const isActive = activeTab === tab.id
            const count = tab.id === 'sent' ? sentEmails.length : ownedEmails.filter(e => tab.match((e.to_address || '').toLowerCase())).length
            const showRedCount = tab.p1 && count > 0
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`text-xs px-2.5 py-1 rounded-md font-mono transition-colors border ${
                  isActive
                    ? 'bg-amber/15 text-amber border-amber/30'
                    : 'bg-surface-elevated text-text-secondary border-border hover:border-amber/30'
                }`}
              >
                {tab.label}
                <span className={`ml-1.5 ${showRedCount ? 'text-error' : 'text-text-secondary/50'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {activeTab === 'sent' ? (
          sentLoading ? (
            <Skeleton />
          ) : sentEmails.length > 0 ? (
            <div className="space-y-1.5">
              {sentEmails.slice(0, 20).map((email, i) => {
                const isOpen = expandedId === `sent-${email.draftId}`
                return (
                  <div
                    key={`sent-${email.draftId}-${i}`}
                    className={`rounded-lg border bg-surface-elevated transition-colors ${isOpen ? 'border-amber/30' : 'border-border hover:border-amber/30'}`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedId(isOpen ? null : `sent-${email.draftId}`)}
                      className="w-full text-left p-3 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Send className="h-3 w-3 text-amber/60 shrink-0" />
                        <span className="text-xs font-medium text-text-primary truncate">{email.to}</span>
                        <span className="ml-auto text-[10px] font-mono text-text-secondary/50 shrink-0">
                          {email.createdAt ? new Date(email.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                        <ChevronDown className={`h-4 w-4 shrink-0 text-text-secondary/50 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </div>
                      <p className="mt-1 text-xs text-text-secondary truncate">{email.subject}</p>
                      {!isOpen && <p className="mt-1 text-[10px] text-text-secondary/50 line-clamp-1">{email.body}</p>}
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-3 border-t border-border mt-0 pt-3">
                        <pre className="whitespace-pre-wrap break-words text-xs text-text-primary font-sans leading-relaxed max-h-[40vh] overflow-y-auto">
                          {email.body}
                        </pre>
                        <div className="mt-3 flex items-center gap-2">
                          {email.project && (
                            <span className="rounded bg-amber/10 px-1.5 py-0.5 text-[10px] font-mono text-amber">{email.project}</span>
                          )}
                          <span className="text-[10px] font-mono text-text-secondary/50">ID: {email.draftId}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (confirm('Delete this sent email from the log?')) {
                                setSentEmails(prev => prev.filter(s => s.draftId !== email.draftId))
                              }
                            }}
                            className="ml-auto flex items-center gap-1 rounded-md border border-error/30 bg-error/10 px-2.5 py-1 text-[10px] text-error hover:bg-error/20 transition-colors"
                          >
                            <X className="h-3 w-3" />
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-text-secondary/50">No sent emails yet</div>
          )
        ) : loading ? (
          <Skeleton />
        ) : filtered.length > 0 ? (
          <div className="space-y-1.5">
            {filtered.slice(0, 8).map((email, i) => {
              const alias = aliasLabel(email.to_address || '')
              const isExpanded = expandedId === email.messageId
              return (
                <div
                  key={`${email.messageId}-${i}`}
                  className={`rounded-lg border bg-surface-elevated transition-colors ${
                    isExpanded ? 'border-amber/30' : 'border-border hover:border-amber/30'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleExpand(email)}
                    className="w-full text-left flex items-start gap-2.5 p-2.5 cursor-pointer"
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
                    {alias && (
                      <span className="mt-0.5 shrink-0 rounded border border-amber/20 bg-amber/10 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-amber">
                        → {alias}
                      </span>
                    )}
                    {assignments[email.messageId]?.length > 0 && (
                      <span className="mt-0.5 shrink-0 flex items-center gap-0.5">
                        {assignments[email.messageId].map(a => {
                          const member = TEAM_MEMBERS.find(m => m.email === a)
                          return (
                            <span key={a} className="rounded-full bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-mono text-indigo-300" title={member?.alias || a}>
                              {member?.name?.charAt(0) || '?'}
                            </span>
                          )
                        })}
                      </span>
                    )}
                    <ChevronDown
                      className={`mt-0.5 h-4 w-4 shrink-0 text-text-secondary/50 transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border px-3 pb-3 pt-3">
                      {bodyLoading && bodyData?.messageId !== email.messageId && (
                        <div className="space-y-2 animate-pulse">
                          <div className="h-3 rounded bg-background" />
                          <div className="h-3 w-3/4 rounded bg-background" />
                          <div className="h-3 w-1/2 rounded bg-background" />
                        </div>
                      )}

                      {bodyError && (
                        <p className="text-xs text-error">Failed to load: {bodyError}</p>
                      )}

                      {bodyData?.messageId === email.messageId && (
                        <>
                          {renderThread(bodyData, 'compact')}

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => startReply(email)}
                              className="flex items-center gap-1.5 rounded-md border border-amber/30 bg-amber/10 px-3 py-1.5 text-xs font-medium text-amber hover:bg-amber/15 transition-colors"
                            >
                              <CornerUpLeft className="h-3.5 w-3.5" />
                              Reply with Ambr
                            </button>
                            <button
                              type="button"
                              onClick={() => startSchedule(email)}
                              className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-text-primary hover:border-amber/30 transition-colors"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                              Schedule Meeting
                            </button>
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setAssignDropdown(assignDropdown === email.messageId ? null : email.messageId)}
                                className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-text-primary hover:border-amber/30 transition-colors"
                              >
                                <UserPlus className="h-3.5 w-3.5" />
                                Assign
                                {assignments[email.messageId]?.length ? (
                                  <span className="rounded-full bg-amber/20 px-1.5 py-0.5 text-[10px] text-amber">
                                    {assignments[email.messageId].length}
                                  </span>
                                ) : null}
                              </button>
                              {assignDropdown === email.messageId && (
                                <div className="absolute left-0 top-full z-20 mt-1 w-48 rounded-lg border border-border bg-surface-elevated p-1 shadow-lg">
                                  {TEAM_MEMBERS.filter(m => m.email !== currentUserEmail?.toLowerCase()).map(member => {
                                    const isAssigned = assignments[email.messageId]?.includes(member.email)
                                    return (
                                      <button
                                        key={member.email}
                                        type="button"
                                        onClick={() => {
                                          const current = assignments[email.messageId] || []
                                          const updated = isAssigned
                                            ? current.filter(e => e !== member.email)
                                            : [...current, member.email]
                                          setAssignments(prev => ({ ...prev, [email.messageId]: updated }))
                                          assignEmail(email.messageId, updated).catch(() => {})
                                        }}
                                        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs transition-colors ${
                                          isAssigned ? 'bg-amber/10 text-amber' : 'text-text-secondary hover:bg-surface'
                                        }`}
                                      >
                                        {isAssigned && <Check className="h-3 w-3" />}
                                        <span>{member.name}</span>
                                        <span className="ml-auto text-[10px] opacity-50">{member.alias}</span>
                                      </button>
                                    )
                                  })}
                                  <div className="mt-1 border-t border-border pt-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const assigned = assignments[email.messageId] || []
                                        setAssignDropdown(null)
                                        setMode({ kind: 'scheduling', email, extraGuests: assigned })
                                      }}
                                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-amber hover:bg-amber/10 transition-colors"
                                    >
                                      <CalendarPlus className="h-3 w-3" />
                                      Schedule with assigned
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleArchive(email)}
                              className="ml-auto flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-text-secondary hover:border-amber/30 hover:text-amber transition-colors"
                              title="Archive (move out of inbox, keep in All Mail)"
                            >
                              <Archive className="h-3.5 w-3.5" />
                              Archive
                            </button>
                            <button
                              type="button"
                              onClick={() => openFullReading(email)}
                              className="flex items-center gap-1 text-xs text-text-secondary/60 hover:text-amber transition-colors"
                              title="Open in full view"
                            >
                              <Maximize2 className="h-3 w-3" />
                              Open full
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">No emails for this tab yet.</p>
        )}
      </div>
    )
  }

  // ── COMPOSE FORM ─────────────────────────────────────
  // Brand new cold email (not a reply). From: dropdown lets the user pick
  // any alias they own. Kimi Generate drafts a body from a free-text intent;
  // Improve polishes what's typed. Signature is appended server-side via
  // sendNewEmail() so the user never sees the duplication.
  function renderCompose(compose: ComposeState) {
    const ownedAliases = currentUserEmail
      ? ALIASES_OWNED_BY[currentUserEmail.toLowerCase()] || []
      : []
    const isBusy = compose.phase === 'sending' || compose.phase === 'generating' || compose.phase === 'improving'

    return (
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode({ kind: 'list' })}
            className="flex items-center gap-1 text-text-secondary hover:text-amber transition-colors"
            disabled={isBusy}
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="text-xs font-mono">Back</span>
          </button>
          <span className="ml-2 text-xs text-text-secondary">Compose new email</span>
        </div>

        <div className="space-y-3">
          {/* From: dropdown */}
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-mono uppercase tracking-wider text-text-secondary/60 w-12">From</label>
            <select
              value={compose.fromAlias}
              onChange={e => updateCompose({ fromAlias: e.target.value })}
              disabled={isBusy}
              className="flex-1 rounded border border-amber/30 bg-amber/5 px-2 py-1.5 text-xs font-mono text-amber focus:outline-none focus:border-amber/60 disabled:opacity-50"
            >
              {ownedAliases.length === 0 && <option value="">(no aliases — sign in)</option>}
              {ownedAliases.map(alias => (
                <option key={alias} value={alias}>{alias}</option>
              ))}
            </select>
          </div>

          {/* To: input */}
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-mono uppercase tracking-wider text-text-secondary/60 w-12">To</label>
            <input
              type="email"
              value={compose.to}
              onChange={e => updateCompose({ to: e.target.value })}
              disabled={isBusy}
              placeholder="recipient@example.com"
              className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-amber/50 disabled:opacity-50"
            />
          </div>

          {/* Subject input */}
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-mono uppercase tracking-wider text-text-secondary/60 w-12">Subj</label>
            <input
              type="text"
              value={compose.subject}
              onChange={e => updateCompose({ subject: e.target.value })}
              disabled={isBusy}
              placeholder="Intro — Ambr Protocol"
              className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-amber/50 disabled:opacity-50"
            />
          </div>

          {/* Optional Kimi intent prompt */}
          <div className="flex items-start gap-2">
            <label className="text-[10px] font-mono uppercase tracking-wider text-text-secondary/60 w-12 mt-1.5">Hint</label>
            <input
              type="text"
              value={compose.intent}
              onChange={e => updateCompose({ intent: e.target.value })}
              disabled={isBusy}
              placeholder="(optional) what the email should convey, used by Generate"
              className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-amber/50 disabled:opacity-50"
            />
          </div>

          {/* AI assist toolbar */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={generateComposeBody}
              disabled={isBusy || !compose.subject.trim()}
              className="flex items-center gap-1.5 rounded border border-amber/30 bg-amber/10 px-2.5 py-1 text-[10px] font-medium text-amber hover:bg-amber/15 transition-colors disabled:opacity-50"
              title="Have Ambr draft a cold email from scratch"
            >
              <Sparkles className="h-3 w-3" />
              {compose.phase === 'generating' ? 'Generating...' : 'Generate'}
            </button>
            <button
              type="button"
              onClick={improveComposeBody}
              disabled={isBusy || !compose.body.trim()}
              className="flex items-center gap-1.5 rounded border border-border bg-background px-2.5 py-1 text-[10px] font-medium text-text-secondary hover:border-amber/30 hover:text-amber transition-colors disabled:opacity-30"
              title="Polish grammar and flow while keeping language"
            >
              <Sparkles className="h-3 w-3" />
              {compose.phase === 'improving' ? 'Polishing...' : 'Improve'}
            </button>
            <span className="ml-auto text-[10px] text-text-secondary/60">signature appended automatically</span>
          </div>

          {/* Body textarea */}
          <textarea
            value={compose.body}
            onChange={e => updateCompose({ body: e.target.value })}
            disabled={isBusy}
            rows={12}
            placeholder="Type your email, or click Generate to have Ambr draft one from your subject + hint above"
            className="w-full rounded border border-border bg-background p-3 text-xs text-text-primary font-sans leading-relaxed resize-y focus:outline-none focus:border-amber/50 disabled:opacity-50 max-h-[55vh]"
          />

          {/* Error display */}
          {compose.phase === 'error' && compose.errorMessage && (
            <div className="rounded border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
              {compose.errorMessage}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setMode({ kind: 'list' })}
              disabled={isBusy}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-text-secondary hover:border-amber/30 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={sendCompose}
              disabled={isBusy || !compose.to.trim() || !compose.subject.trim() || !compose.body.trim() || !compose.fromAlias}
              className="flex items-center gap-1.5 rounded-lg border border-amber/30 bg-amber/15 px-3 py-1.5 text-xs font-medium text-amber hover:bg-amber/25 transition-colors disabled:opacity-50"
            >
              {compose.phase === 'sending' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {compose.phase === 'sending' ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  function renderReading(email: TriagedEmail) {
    const alias = aliasLabel(email.to_address || '')
    return (
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-4 flex items-center gap-2">
          <button
            onClick={backToList}
            className="flex items-center gap-1 text-text-secondary hover:text-amber transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="text-xs font-mono">Back</span>
          </button>
          <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-mono font-medium ${
            PRIORITY_STYLES[email.priority] || PRIORITY_STYLES[4]
          }`}>
            P{email.priority}
          </span>
          {alias && (
            <span className="rounded border border-amber/20 bg-amber/10 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-amber">
              → {alias}
            </span>
          )}
        </div>

        <h3 className="mb-3 text-base font-medium text-text-primary">{email.subject}</h3>

        {bodyLoading && (
          <div className="space-y-2 animate-pulse">
            <div className="h-4 rounded bg-surface-elevated" />
            <div className="h-4 w-3/4 rounded bg-surface-elevated" />
            <div className="h-4 w-1/2 rounded bg-surface-elevated" />
          </div>
        )}

        {bodyError && (
          <p className="text-sm text-error">Failed to load email: {bodyError}</p>
        )}

        {bodyData && (
          <>
            {renderThread(bodyData, 'large')}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => startReply(email)}
                className="flex items-center gap-2 rounded-lg border border-amber/30 bg-amber/10 px-4 py-2 text-sm font-medium text-amber hover:bg-amber/15 transition-colors"
              >
                <CornerUpLeft className="h-4 w-4" />
                Reply with Ambr
              </button>
              <button
                type="button"
                onClick={() => startSchedule(email)}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface-elevated px-4 py-2 text-sm text-text-primary hover:border-amber/30 transition-colors"
              >
                <CalendarPlus className="h-4 w-4" />
                Schedule Meeting
              </button>
            </div>
          </>
        )}
      </div>
    )
  }
}
