// Server-side proxy for the Apps Script ops backend.
// Hides OPS_KEY from the public client bundle. Requires the caller to be
// authenticated via an Ambr API key in the X-API-Key header AND to be in
// the ADMIN_EMAILS allowlist.
//
// Only the actions the team dashboard calls are proxied, with only the query
// parameters or body fields each one sends (lib/ops-actions.ts). The dashboard
// is the only caller, so anything else gets a 404 before auth or any fetch.
//
// Google Apps Script returns a 302 redirect on POST, and fetch's
// redirect:'follow' converts POST→GET per HTTP spec, stripping the body.
// Workaround: ALL requests go as GET with key in URL params. POST data is
// encoded in a `payload` URL parameter. The doGet handler in Code.gs routes
// payload-bearing GETs to the same action handlers as doPost.

import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api-auth'
import { isAdmin } from '@/lib/admin-emails'
import { memberIdsToEmails, emailsToMemberIds } from '@/lib/team-members'
import { allowedGetParams, allowedPostFields } from '@/lib/ops-actions'

// ── PII boundary ─────────────────────────────────────────────────────────────
// Email assignments are stored by Apps Script keyed by real address, and
// assigning fires a notification to it. The browser must not see those
// addresses, so this proxy is where they stop: ids go out to the client,
// addresses go on to Apps Script. Apps Script's contract is unchanged, which is
// why no stored assignment needs migrating.
//
// Translation is keyed on the ACTION NAME. A new action that carries member
// addresses must be added here too, or it will leak them straight through.
function translateOutbound(action: string, body: Record<string, unknown>): Record<string, unknown> {
  if (action === 'assign_email') {
    // Unknown ids are dropped by memberIdsToEmails rather than passed through,
    // so a crafted assignee cannot aim a notification at an arbitrary address.
    return { ...body, assignees: memberIdsToEmails(body.assignees) }
  }
  return body
}

// email_log returns every logged row with the raw To header in to_address,
// so rows addressed outside the team domain are in the payload. The dashboard also
// hides them with a client-side regex (EmailWidget.tsx's
// `/@ambr\.run/i.test(to)`), but that only stops them being drawn: the
// addresses would still reach the browser.
// A filter the client applies is not a filter. Drop them here.
//
// AdminSection calls getAmbrEmails(12) with no to_filter, so nothing narrows
// this server-side in the deployed script. The visible result is unchanged,
// because the client already discards these rows, so this removes payload, not
// behaviour. count is recomputed because
// it would otherwise describe rows that are no longer present; nothing reads
// it today, checked before changing it.
function scrubEmailLog(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data
  const d = data as { emails?: unknown[]; count?: number }
  if (!Array.isArray(d.emails)) return data
  const emails = d.emails.filter((e) => {
    const to = (e as { to_address?: string } | null)?.to_address
    return typeof to === 'string' && /@ambr\.run/i.test(to)
  })
  return { ...d, emails, count: emails.length }
}

function translateInbound(action: string, data: unknown): unknown {
  if (action === 'email_log') return scrubEmailLog(data)
  if (action !== 'get_assignments' || !data || typeof data !== 'object') return data
  const d = data as { assignments?: Record<string, unknown> }
  if (!d.assignments || typeof d.assignments !== 'object') return data
  const mapped: Record<string, string[]> = {}
  for (const [messageId, assignees] of Object.entries(d.assignments)) {
    mapped[messageId] = emailsToMemberIds(assignees)
  }
  return { ...d, assignments: mapped }
}

// Read env vars per-request (not module level) to avoid stale values
// and trim to strip any trailing newlines from `echo | vercel env add`.
function getConfig() {
  const base = (process.env.OPS_BASE || '').trim()
  const key = (process.env.OPS_KEY || '').trim()
  if (!base || !key) {
    return {
      error: NextResponse.json({ error: 'Ops backend not configured' }, { status: 500 }),
      base: '', key: ''
    }
  }
  return { error: null, base, key }
}

async function authCheck(request: NextRequest) {
  const auth = await validateApiKey(request)
  if (!auth) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (!isAdmin(auth.email)) {
    return { error: NextResponse.json({ error: 'Admin only' }, { status: 403 }) }
  }
  return { auth }
}

function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}

// The caller gets a fixed message. The exception text can carry the backend
// URL, so it is neither returned nor logged.
function unreachable(action: string) {
  console.error('[ops] backend call failed:', action)
  return NextResponse.json({ error: 'Ops backend unreachable' }, { status: 502 })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> }
) {
  const { action } = await params
  const allowed = allowedGetParams(action)
  if (!allowed) return notFound()
  const a = await authCheck(request)
  if (a.error) return a.error
  const cfg = getConfig()
  if (cfg.error) return cfg.error

  const url = new URL(cfg.base)
  // Only this action's own parameters go through, first value of each.
  for (const name of allowed) {
    const v = request.nextUrl.searchParams.get(name)
    if (v !== null) url.searchParams.set(name, v)
  }
  // Set after the client's parameters so nothing the client sends can replace
  // them. caller_email lets Apps Script scope list responses (sent_log,
  // draft_queue) per-user. Clients can't spoof it — it comes from
  // validateApiKey(), not the request.
  url.searchParams.set('action', action)
  url.searchParams.set('key', cfg.key)
  url.searchParams.set('caller_email', a.auth.email)

  try {
    const res = await fetch(url.toString(), { redirect: 'follow' })
    const data = await res.json()
    return NextResponse.json(translateInbound(action, data), { status: res.status })
  } catch {
    return unreachable(action)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> }
) {
  const { action } = await params
  const allowed = allowedPostFields(action)
  if (!allowed) return notFound()
  const a = await authCheck(request)
  if (a.error) return a.error
  const cfg = getConfig()
  if (cfg.error) return cfg.error

  let parsed: unknown = {}
  try {
    parsed = await request.json()
  } catch {
    // empty body OK
  }
  const body = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {}
  // Pick this action's own top-level fields, own properties only. Nothing else
  // from the body is read, so __proto__ and the like never get copied.
  const picked: Record<string, unknown> = {}
  for (const field of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, field)) picked[field] = body[field]
  }

  // senderEmail comes from validateApiKey() and is set last so the body cannot
  // replace it. Encode POST data as GET with payload URL param (Apps Script 302
  // workaround).
  const payload = { ...translateOutbound(action, picked), senderEmail: a.auth.email }
  try {
    // action and key go last here too, for the same reason.
    const serialized = JSON.stringify({ ...payload, action, key: cfg.key })
    let res: Response
    if (serialized.length > 6000) {
      // Payloads too big for a URL param (e.g. send_new_email with base64
      // attachments) go as a real POST. Apps Script executes doPost on the
      // initial request and 302s to a one-time result URL; fetch's
      // redirect:'follow' turns that into a GET, which is exactly what
      // retrieves the JSON result. Verified against the live backend.
      res = await fetch(cfg.base, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'application/json' },
        body: serialized,
      })
    } else {
      const url = new URL(cfg.base)
      url.searchParams.set('action', action)
      url.searchParams.set('key', cfg.key)
      url.searchParams.set('payload', JSON.stringify(payload))
      res = await fetch(url.toString(), { redirect: 'follow' })
    }
    const data = await res.json()
    // assign_email echoes the assignee list back; that echo is real addresses
    // unless translated, which would leak straight past the boundary above.
    const safe = action === 'assign_email' && data && typeof data === 'object'
      ? { ...data, assignees: emailsToMemberIds((data as { assignees?: unknown }).assignees) }
      : data
    return NextResponse.json(safe, { status: res.status })
  } catch {
    return unreachable(action)
  }
}
