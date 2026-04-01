'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileText, ArrowRight } from 'lucide-react'

interface PipelineData {
  total: number
  active: number
  draft: number
  handshake: number
  pending_signature: number
}

function Skeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="grid grid-cols-2 gap-3">
        <div className="h-16 rounded-lg bg-surface-elevated" />
        <div className="h-16 rounded-lg bg-surface-elevated" />
        <div className="h-16 rounded-lg bg-surface-elevated" />
        <div className="h-16 rounded-lg bg-surface-elevated" />
      </div>
    </div>
  )
}

const STATUS_STYLES: Record<string, string> = {
  active: 'text-success border-success/30',
  draft: 'text-text-secondary border-border',
  handshake: 'text-amber border-amber/30',
  pending_signature: 'text-yellow-400 border-yellow-500/30',
}

export function ContractPipelineWidget({ loading }: { loading: boolean }) {
  const [pipeline, setPipeline] = useState<PipelineData | null>(null)

  useEffect(() => {
    // Try to fetch from Ambr API using stored session
    const session = localStorage.getItem('ambr_dashboard_session')
    if (!session) return
    try {
      const { apiKey } = JSON.parse(session)
      if (!apiKey) return
      fetch('/api/v1/dashboard', { headers: { 'X-API-Key': apiKey } })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data?.contracts) return
          const contracts = data.contracts as { status: string }[]
          setPipeline({
            total: contracts.length,
            active: contracts.filter(c => c.status === 'active').length,
            draft: contracts.filter(c => c.status === 'draft').length,
            handshake: contracts.filter(c => c.status === 'handshake').length,
            pending_signature: contracts.filter(c => c.status === 'pending_signature').length,
          })
        })
        .catch(() => {})
    } catch {}
  }, [])

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-amber" />
          <span className="text-micro">Contracts</span>
        </div>
        <Link href="/dashboard" className="flex items-center gap-1 text-xs text-text-secondary hover:text-amber transition-colors">
          Open <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {loading && !pipeline ? (
        <Skeleton />
      ) : !pipeline ? (
        <p className="text-sm text-text-secondary">Connect API key in main dashboard to view pipeline.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {(['active', 'draft', 'handshake', 'pending_signature'] as const).map(status => (
            <div key={status} className={`rounded-lg border p-3 ${STATUS_STYLES[status]}`}>
              <p className="text-2xl font-mono font-medium">
                {pipeline[status as keyof PipelineData]}
              </p>
              <p className="text-micro mt-1 !text-current opacity-70">
                {status.replace('_', ' ')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
