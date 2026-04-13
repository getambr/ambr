'use client'

import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'

interface CheckResult {
  status: 'ok' | 'degraded' | 'down'
  latency_ms?: number
  detail?: string
}

interface HealthData {
  status: 'healthy' | 'degraded' | 'unhealthy'
  version: string
  timestamp: string
  total_latency_ms: number
  checks: {
    supabase: CheckResult
    base_rpc: CheckResult
    anthropic: CheckResult
    ops_agent: CheckResult
  }
}

const STATUS_CONFIG = {
  ok: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', label: 'Healthy' },
  degraded: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', label: 'Degraded' },
  down: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', label: 'Down' },
} as const

const CHECK_LABELS: Record<string, { name: string; desc: string }> = {
  supabase: { name: 'Supabase', desc: 'Database & auth' },
  base_rpc: { name: 'Base L2 RPC', desc: 'On-chain verification' },
  anthropic: { name: 'Anthropic API', desc: 'Contract generation' },
  ops_agent: { name: 'Ops Agent', desc: 'Email & calendar' },
}

export function TechHealthWidget() {
  const [data, setData] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchHealth = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/health')
      const json = await res.json()
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch health')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchHealth() }, [fetchHealth])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber border-t-transparent" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
        <XCircle className="mx-auto h-6 w-6 text-red-400" />
        <p className="mt-2 text-sm text-red-300">{error || 'No health data'}</p>
        <button onClick={fetchHealth} className="mt-3 text-xs text-text-secondary hover:text-text-primary">
          Retry
        </button>
      </div>
    )
  }

  const overallConfig = data.status === 'healthy'
    ? STATUS_CONFIG.ok
    : data.status === 'degraded'
      ? STATUS_CONFIG.degraded
      : STATUS_CONFIG.down

  const OverallIcon = overallConfig.icon

  return (
    <div className="space-y-4">
      {/* Overall status */}
      <div className={`flex items-center justify-between rounded-xl border ${overallConfig.border} ${overallConfig.bg} p-4`}>
        <div className="flex items-center gap-3">
          <OverallIcon className={`h-5 w-5 ${overallConfig.color}`} />
          <div>
            <p className={`text-sm font-medium ${overallConfig.color}`}>
              System {overallConfig.label}
            </p>
            <p className="text-xs text-text-secondary">
              v{data.version} &middot; {data.total_latency_ms}ms &middot; {new Date(data.timestamp).toLocaleTimeString()}
            </p>
          </div>
        </div>
        <button
          onClick={fetchHealth}
          disabled={loading}
          className="rounded-lg border border-border bg-surface p-2 text-text-secondary transition-colors hover:bg-surface-elevated"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Individual checks */}
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.entries(data.checks).map(([key, check]) => {
          const config = STATUS_CONFIG[check.status]
          const Icon = config.icon
          const labels = CHECK_LABELS[key] || { name: key, desc: '' }

          return (
            <div
              key={key}
              className={`rounded-xl border ${config.border} ${config.bg} p-4`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-text-primary">{labels.name}</p>
                  <p className="text-xs text-text-secondary">{labels.desc}</p>
                </div>
                <Icon className={`h-4 w-4 ${config.color}`} />
              </div>
              <div className="mt-3 flex items-center gap-3 text-xs text-text-secondary">
                <span className={config.color}>{config.label}</span>
                {check.latency_ms != null && <span>{check.latency_ms}ms</span>}
                {check.detail && <span className="truncate">{check.detail}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
