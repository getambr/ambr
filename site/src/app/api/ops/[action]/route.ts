// Server-side proxy for the Apps Script ops backend.
// Hides OPS_KEY from the public client bundle. Requires the caller to be
// authenticated via an Ambr API key in the X-API-Key header AND to be in
// the ADMIN_EMAILS allowlist.
//
// Google Apps Script returns a 302 redirect on POST, and fetch's
// redirect:'follow' converts POST→GET per HTTP spec, stripping the body.
// Workaround: ALL requests go as GET with key in URL params. POST data is
// encoded in a `payload` URL parameter. The doGet handler in Code.gs routes
// payload-bearing GETs to the same action handlers as doPost.

import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api-auth'
import { isAdmin } from '@/lib/admin-emails'

// Read env vars per-request (not module level) to avoid stale values
// and trim to strip any trailing newlines from `echo | vercel env add`.
function getConfig() {
  const base = (process.env.OPS_BASE || '').trim()
  const key = (process.env.OPS_KEY || '').trim()
  if (!base || !key) {
    return {
      error: NextResponse.json(
        { error: 'Ops backend not configured', debug: { hasBase: !!base, hasKey: !!key, keyLen: key.length } },
        { status: 500 }
      ),
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> }
) {
  const cfg = getConfig()
  if (cfg.error) return cfg.error
  const a = await authCheck(request)
  if ('error' in a) return a.error

  const { action } = await params
  const url = new URL(cfg.base)
  url.searchParams.set('action', action)
  url.searchParams.set('key', cfg.key)
  request.nextUrl.searchParams.forEach((v, k) => {
    if (k !== 'action' && k !== 'key') url.searchParams.set(k, v)
  })

  try {
    const res = await fetch(url.toString(), { redirect: 'follow' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json(
      { error: 'Ops backend unreachable: ' + String(e) },
      { status: 502 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> }
) {
  const cfg = getConfig()
  if (cfg.error) return cfg.error
  const a = await authCheck(request)
  if ('error' in a) return a.error

  const { action } = await params
  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
  } catch {
    // empty body OK
  }

  // Encode POST data as GET with payload URL param (Apps Script 302 workaround)
  const payload = { senderEmail: a.auth.email, ...body }
  try {
    const url = new URL(cfg.base)
    url.searchParams.set('action', action)
    url.searchParams.set('key', cfg.key)
    url.searchParams.set('payload', JSON.stringify(payload))
    const res = await fetch(url.toString(), { redirect: 'follow' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json(
      { error: 'Ops backend unreachable: ' + String(e) },
      { status: 502 }
    )
  }
}
