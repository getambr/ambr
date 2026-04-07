// Server-side proxy for the Apps Script ops backend.
// Hides OPS_KEY from the public client bundle. Requires the caller to be
// authenticated via an Ambr API key in the X-API-Key header AND to be in
// the ADMIN_EMAILS allowlist.
//
// Routes:
//   GET  /api/ops/[action]?param=...   → forwards GET to Apps Script with the server-only key
//   POST /api/ops/[action]             → forwards POST body to Apps Script with the server-only key

import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api-auth'
import { isAdmin } from '@/lib/admin-emails'

const OPS_BASE = process.env.OPS_BASE || ''
const OPS_KEY = process.env.OPS_KEY || ''

function configCheck() {
  if (!OPS_BASE || !OPS_KEY) {
    return NextResponse.json(
      { error: 'Ops backend not configured (missing OPS_BASE or OPS_KEY env)' },
      { status: 500 }
    )
  }
  return null
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
  const cfg = configCheck()
  if (cfg) return cfg
  const a = await authCheck(request)
  if ('error' in a) return a.error

  const { action } = await params
  const url = new URL(OPS_BASE)
  url.searchParams.set('action', action)
  url.searchParams.set('key', OPS_KEY)
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
  const cfg = configCheck()
  if (cfg) return cfg
  const a = await authCheck(request)
  if ('error' in a) return a.error

  const { action } = await params
  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
  } catch {
    // empty body OK
  }

  try {
    const res = await fetch(OPS_BASE, {
      method: 'POST',
      body: JSON.stringify({ action, key: OPS_KEY, ...body }),
      redirect: 'follow',
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json(
      { error: 'Ops backend unreachable: ' + String(e) },
      { status: 502 }
    )
  }
}
