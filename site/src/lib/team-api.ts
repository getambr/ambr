const OPS_BASE = 'https://script.google.com/macros/s/AKfycbwUQSw43m_6k1op1UXdbNj5Ou7GYMbwzObRcyBl2DRT9zKzroDWJgMP_idCbzBSfMpa/exec'
const OPS_KEY = 'is-dash-2026-xK9mP'

export async function opsGet<T = unknown>(action: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(OPS_BASE)
  url.searchParams.set('action', action)
  url.searchParams.set('key', OPS_KEY)
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString())
  return res.json()
}

export async function opsPost<T = unknown>(action: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(OPS_BASE, {
    method: 'POST',
    body: JSON.stringify({ action, key: OPS_KEY, ...body }),
  })
  return res.json()
}

// --- Typed helpers ---

export interface CalendarEvent {
  id: string; title: string; start: string; end: string
  location?: string; description?: string; allDay?: boolean
}

export interface TriagedEmail {
  messageId: string; date: string; from: string; subject: string
  project: string; priority: number; summary: string; status: string
  to_address?: string
}

export interface ThreadMessage {
  messageId: string
  from: string
  to: string
  cc: string
  date: string
  body: string
}

export interface EmailBody {
  messageId: string
  from: string
  to: string
  cc: string
  date: string
  subject: string
  body: string
  replyTo: string
  threadId: string
  messageCount?: number
  messages?: ThreadMessage[]
}

export interface Draft {
  draftId: string; to: string; subject: string; body: string
  project: string; status: string; created: string
}

export interface DraftReplyResponse {
  draftId: string
  to: string
  subject: string
  body: string
  project: string
  status: string
}

export interface OutreachContact {
  email: string; name: string; company: string; project: string
  type: string; status: string; nextAction: string; notes: string
}

export function getAmbrCalendar(days = 7) {
  return opsGet<{ count: number; events: CalendarEvent[] }>('calendar', { days: String(days) })
}

export function getAmbrEmails(limit = 50, toFilter?: string) {
  const params: Record<string, string> = { max: String(limit) }
  if (toFilter) params.to_filter = toFilter
  return opsGet<{ count: number; emails: TriagedEmail[] }>('email_log', params)
}

export function getEmailBody(messageId: string) {
  return opsGet<EmailBody | { error: string }>('email_body', { messageId })
}

export function draftReply(emailId: string, instructions?: string) {
  return opsPost<DraftReplyResponse | { error: string }>('draft_reply', {
    emailId,
    ...(instructions ? { instructions } : {}),
  })
}

export function archiveEmail(messageId: string) {
  return opsPost<{ archived: true; messageId: string } | { error: string }>(
    'archive_email',
    { messageId }
  )
}

export function getAmbrUnread() {
  return opsGet<{ unread: Record<string, number> }>('gmail_unread')
}

export function getDraftQueue() {
  return opsGet<{ count: number; drafts: Draft[] }>('draft_queue')
}

export function getOutreach() {
  return opsGet<{ count: number; contacts: OutreachContact[] }>('outreach')
}

export function getSuggestedSlots(duration = 60, days = 7) {
  return opsGet<{ slots: { start: string; end: string; duration: number }[] }>(
    'suggest_slots', { duration: String(duration), days: String(days) }
  )
}

export function approveDraft(draftId: string, editedSubject?: string, editedBody?: string) {
  return opsPost<{ sent: boolean; to: string; subject: string; draftId: string } | { error: string }>(
    'approve_draft',
    {
      draftId,
      ...(editedSubject ? { editedSubject } : {}),
      ...(editedBody ? { editedBody } : {}),
    }
  )
}

export function createEvent(event: {
  title: string; start: string; end: string;
  description?: string; location?: string; guests?: string;
}) {
  return opsPost<
    { created: true; id: string; title: string; start: string; end: string }
    | { error: string }
  >('create_event', event)
}
