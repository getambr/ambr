'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

// Metadata is exported from a Server Component parent; this route is client-only,
// so the <title> is set via a small effect below (document.title).

type ServiceStatus = 'ok' | 'degraded' | 'down';
type Overall = 'healthy' | 'degraded' | 'unhealthy';

interface HealthResponse {
  status: Overall;
  version: string;
  timestamp: string;
  services: Record<string, ServiceStatus>;
  cnft: { address: string; basescan_url: string } | null;
}

const SERVICE_LABELS: Record<string, { label: string; desc: string }> = {
  supabase: { label: 'Supabase', desc: 'Contracts & identity store' },
  base_rpc: { label: 'Base RPC', desc: 'Base L2 mainnet node' },
  anthropic: { label: 'Anthropic', desc: 'Contract generation (Claude)' },
  ops_agent: { label: 'Ops Agent', desc: 'Draft / email bridge' },
  resend: { label: 'Resend', desc: 'Transactional email' },
  stripe: { label: 'Stripe', desc: 'Subscription billing' },
  cnft_contract: { label: 'cNFT Contract', desc: 'On-chain anchoring' },
};

const STATUS_COLOR: Record<ServiceStatus, string> = {
  ok: 'bg-green-500',
  degraded: 'bg-yellow-500',
  down: 'bg-red-500',
};

const OVERALL_COPY: Record<Overall, { dot: string; label: string; sub: string }> = {
  healthy: {
    dot: 'bg-green-500',
    label: 'All systems operational',
    sub: 'All platform services are responding normally.',
  },
  degraded: {
    dot: 'bg-yellow-500',
    label: 'Partial degradation',
    sub: 'One or more services are responding slowly or returning errors.',
  },
  unhealthy: {
    dot: 'bg-red-500',
    label: 'Service disruption',
    sub: 'One or more services are down. We are on it.',
  },
};

export default function StatusPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = 'System Status — Ambr';
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('https://getamber.dev/api/health', { cache: 'no-store' });
        const data = (await res.json()) as HealthResponse;
        if (!cancelled) {
          setHealth(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const overall: Overall = health?.status ?? 'unhealthy';

  return (
    <main className="min-h-screen bg-surface pt-28 pb-24 px-4 lg:px-6">
      <div className="mx-auto max-w-3xl">
        <p className="font-mono text-xs uppercase tracking-widest text-amber mb-3">
          System Status
        </p>
        <h1 className="font-serif text-4xl text-text-primary mb-8">
          Ambr — live platform health
        </h1>

        <section className="rounded-lg border border-border bg-surface-elevated p-6 mb-10">
          {loading && !health ? (
            <p className="font-mono text-sm text-text-secondary">Loading status…</p>
          ) : error ? (
            <>
              <div className="flex items-center gap-3 mb-2">
                <span className="inline-block h-3 w-3 rounded-full bg-red-500" />
                <h2 className="font-serif text-2xl text-text-primary">Status unavailable</h2>
              </div>
              <p className="font-mono text-xs text-text-secondary">
                Could not reach the health endpoint — if this persists, the platform may be down.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-2">
                <span
                  className={`inline-block h-3 w-3 rounded-full ${OVERALL_COPY[overall].dot}`}
                />
                <h2 className="font-serif text-2xl text-text-primary">
                  {OVERALL_COPY[overall].label}
                </h2>
              </div>
              <p className="font-mono text-xs text-text-secondary">
                {OVERALL_COPY[overall].sub}
              </p>
              {health && (
                <p className="mt-3 font-mono text-[10px] uppercase tracking-wide text-[#666]">
                  Version {health.version} · Last checked {new Date(health.timestamp).toLocaleString()}
                </p>
              )}
            </>
          )}
        </section>

        {health && (
          <>
            <h3 className="font-mono text-xs uppercase tracking-widest text-text-primary mb-3">
              Platform services
            </h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10">
              {Object.entries(health.services).map(([key, status]) => {
                const meta = SERVICE_LABELS[key] ?? { label: key, desc: '' };
                return (
                  <li
                    key={key}
                    className="rounded-md border border-border bg-surface-elevated px-4 py-3 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-mono text-sm text-text-primary">{meta.label}</p>
                      <p className="font-mono text-[10px] text-[#666]">{meta.desc}</p>
                    </div>
                    <span className="flex items-center gap-2">
                      <span className={`inline-block h-2 w-2 rounded-full ${STATUS_COLOR[status]}`} />
                      <span className="font-mono text-[10px] uppercase tracking-wide text-[#666]">
                        {status}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>

            {health.cnft && (
              <>
                <h3 className="font-mono text-xs uppercase tracking-widest text-text-primary mb-3">
                  On-chain anchor
                </h3>
                <div className="rounded-lg border border-amber/30 bg-surface-elevated p-5 mb-10">
                  <p className="font-mono text-xs text-text-secondary mb-2">
                    cNFT contract on Base L2 — every Ambr contract minted to chain is anchored here.
                  </p>
                  <p className="font-mono text-xs text-text-primary break-all mb-3">
                    {health.cnft.address}
                  </p>
                  <a
                    href={health.cnft.basescan_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 font-mono text-xs text-amber hover:underline"
                  >
                    Verify on BaseScan →
                  </a>
                </div>
              </>
            )}
          </>
        )}

        <section className="border-t border-border pt-6">
          <p className="font-mono text-xs text-text-secondary mb-2">
            This page refreshes every 30 seconds and reads directly from the platform health
            endpoint. No data is cached beyond the status response itself.
          </p>
          <p className="font-mono text-xs text-text-secondary">
            For the full per-service detail view, sign in at{' '}
            <Link href="https://getamber.dev/dashboard" className="text-amber hover:underline">
              getamber.dev/dashboard
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
