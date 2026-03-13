'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'text-success border-success/40 bg-success/10',
    amended: 'text-amber border-amber/40 bg-amber/10',
    expired: 'text-text-secondary border-border bg-surface-elevated',
    draft: 'text-text-secondary border-border bg-surface-elevated',
    terminated: 'text-error border-error/40 bg-error/10',
  };
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-md font-mono capitalize ${styles[status] || styles.draft}`}>
      {status}
    </span>
  );
}


interface DashboardData {
  user: { email: string; tier: string; credits: number; key_prefix: string } | null;
  contracts: Array<{
    contract_id: string;
    status: string;
    amendment_type: string;
    sha256_hash: string;
    created_at: string;
    template_id: string;
    principal_declaration: { principal_name: string };
  }>;
  error: string | null;
}

export default function DashboardPage() {
  const [apiKey, setApiKey] = useState('');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [keyVisible, setKeyVisible] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/v1/dashboard', {
        headers: { 'X-API-Key': apiKey.trim() },
      });
      const json = await res.json();
      if (!res.ok) {
        setData({ user: null, contracts: [], error: json.error || 'Invalid API key' });
      } else {
        setData({ ...json, error: null });
      }
    } catch {
      setData({ user: null, contracts: [], error: 'Failed to connect' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Aurora background */}
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 60% 50% at 20% 30%, rgba(245,166,35,0.08) 0%, transparent 70%),
              radial-gradient(ellipse 50% 60% at 80% 70%, rgba(196,127,10,0.06) 0%, transparent 70%),
              radial-gradient(ellipse 40% 40% at 50% 50%, rgba(255,208,128,0.04) 0%, transparent 70%)
            `,
            animation: 'auroraShift 20s ease-in-out infinite alternate',
          }}
        />
      </div>

      <style>{`
        @keyframes statGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(245,166,35,0); }
          50% { box-shadow: 0 0 20px 0 rgba(245,166,35,0.1); }
        }
      `}</style>

      <main className="relative z-10 pt-20">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className={!data?.user ? 'text-center' : ''}>
            <p className="text-sm font-mono uppercase tracking-widest text-amber mb-2">Dashboard</p>
            <h1 className="text-3xl font-bold text-text-primary mb-8">Contract Management</h1>
          </div>

          {/* API Key Entry */}
          {!data?.user && (
            <div className="max-w-lg mx-auto text-center">
              <p className="text-sm text-text-secondary mb-4">
                Enter your API key to view your contracts and account details.
              </p>
              <form onSubmit={handleLookup} className="flex gap-3">
                <input
                  type={keyVisible ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="amb_..."
                  className="flex-1 rounded-xl border border-border bg-surface/80 backdrop-blur-sm px-4 py-3 text-sm font-mono text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:ring-2 focus:ring-amber focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setKeyVisible(!keyVisible)}
                  className="rounded-xl border border-border bg-surface/80 px-3 text-text-secondary hover:text-text-primary transition-colors"
                  aria-label={keyVisible ? 'Hide key' : 'Show key'}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    {keyVisible ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    ) : (
                      <>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </>
                    )}
                  </svg>
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-xl bg-gradient-to-r from-amber to-amber-dark px-6 py-3 text-sm font-medium text-background hover:from-amber-light hover:to-amber transition-all disabled:opacity-50"
                >
                  {loading ? 'Loading...' : 'Load'}
                </button>
              </form>
              {data?.error && (
                <p className="mt-3 text-sm text-error">{data.error}</p>
              )}
              <p className="mt-4 text-xs text-text-secondary/60">
                Don&apos;t have an API key?{' '}
                <Link href="/activate" className="text-amber hover:underline">Activate one</Link>
                {' '}or{' '}
                <Link href="/waitlist" className="text-amber hover:underline">join the waitlist</Link>.
              </p>
            </div>
          )}

          {/* Dashboard Content */}
          {data?.user && (
            <>
              {/* Top bar with user info */}
              <div className="flex items-center justify-between mb-8 rounded-xl border border-border/50 bg-background/80 backdrop-blur-sm px-5 py-3">
                <div className="flex items-center gap-3">
                  <Image src="/logo.png" alt="" width={20} height={20} className="rounded-sm" />
                  <span className="text-sm text-text-secondary">{data.user.email}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono px-3 py-1 rounded-md bg-gradient-to-r from-amber/20 to-amber-dark/20 text-amber border border-amber/30 capitalize">
                    {data.user.tier}
                  </span>
                  <span className="text-xs font-mono text-text-secondary/50">
                    {data.user.key_prefix}...
                  </span>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
                <div className="rounded-xl border border-border bg-surface/80 backdrop-blur-sm p-5 relative overflow-hidden" style={{ animation: 'statGlow 4s ease-in-out infinite' }}>
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber/50 to-transparent" />
                  <p className="text-xs text-text-secondary mb-1.5">Total Contracts</p>
                  <p className="text-2xl font-bold text-text-primary">{data.contracts.length}</p>
                </div>
                <div className="rounded-xl border border-border bg-surface/80 backdrop-blur-sm p-5 relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-success/50 to-transparent" />
                  <p className="text-xs text-text-secondary mb-1.5">Active</p>
                  <p className="text-2xl font-bold text-success">{data.contracts.filter(c => c.status === 'active').length}</p>
                </div>
                <div className="rounded-xl border border-border bg-surface/80 backdrop-blur-sm p-5 relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber/50 to-transparent" />
                  <p className="text-xs text-text-secondary mb-1.5">Credits Remaining</p>
                  <p className="text-2xl font-bold text-text-primary">
                    {data.user.credits === -1 ? 'Unlimited' : data.user.credits}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-surface/80 backdrop-blur-sm p-5 relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber/50 to-transparent" />
                  <p className="text-xs text-text-secondary mb-1.5">Tier</p>
                  <p className="text-2xl font-bold text-amber capitalize">{data.user.tier}</p>
                </div>
              </div>

              {/* Contract list + actions */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
                <div className="lg:col-span-3">
                  <div className="rounded-xl border border-border bg-surface/80 backdrop-blur-sm overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-border space-y-3">
                      <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-text-primary">Your Contracts</h2>
                        <span className="text-xs text-text-secondary/60">{data.contracts.length} total</span>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {['all', 'draft', 'active', 'pending_signature', 'terminated', 'amended'].map((s) => (
                          <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={`text-xs px-3 py-1 rounded-md font-mono capitalize transition-colors ${
                              statusFilter === s
                                ? 'bg-amber/20 text-amber border border-amber/40'
                                : 'bg-surface-elevated text-text-secondary border border-border hover:border-amber/30'
                            }`}
                          >
                            {s === 'all' ? 'All' : s.replace('_', ' ')}
                          </button>
                        ))}
                      </div>
                    </div>
                    {(() => {
                      const filtered = statusFilter === 'all'
                        ? data.contracts
                        : data.contracts.filter(c => c.status === statusFilter);
                      return filtered.length === 0 ? (
                      <div className="px-5 py-12 text-center">
                        <p className="text-sm text-text-secondary">No contracts yet.</p>
                        <p className="text-xs text-text-secondary/60 mt-1">
                          Use the API to create your first Ricardian Contract.
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-border/50">
                        {filtered.map((contract) => (
                          <Link
                            key={contract.contract_id}
                            href={`/reader/${contract.sha256_hash}`}
                            className="flex items-center gap-4 px-5 py-3.5 hover:bg-amber/5 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-mono text-amber">{contract.contract_id}</span>
                                <StatusBadge status={contract.status} />
                                {contract.amendment_type !== 'original' && (
                                  <span className="text-xs px-2 py-0.5 rounded-md font-mono text-text-secondary border border-border">
                                    {contract.amendment_type}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-text-secondary/70 truncate">
                                {contract.principal_declaration?.principal_name || 'Unknown principal'}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs text-text-secondary">
                                {new Date(contract.created_at).toLocaleDateString()}
                              </p>
                              <p className="text-xs font-mono text-text-secondary/40">
                                {contract.sha256_hash.slice(0, 16)}...
                              </p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    );
                    })()}
                  </div>
                </div>

                {/* Quick actions */}
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-text-primary mb-2">Quick Actions</h2>
                  <Link href="/templates" className="block w-full text-left rounded-xl border border-border bg-surface/80 backdrop-blur-sm p-4 hover:border-amber/30 hover:bg-amber/5 transition-all group relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-amber/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <p className="text-sm font-medium text-text-primary relative z-10">Browse Templates</p>
                    <p className="text-xs text-text-secondary/70 mt-0.5 relative z-10">View available contract templates</p>
                  </Link>
                  <Link href="/reader" className="block w-full text-left rounded-xl border border-border bg-surface/80 backdrop-blur-sm p-4 hover:border-amber/30 hover:bg-amber/5 transition-all">
                    <p className="text-sm font-medium text-text-primary">Verify Contract</p>
                    <p className="text-xs text-text-secondary/70 mt-0.5">Look up and verify any contract by hash or ID</p>
                  </Link>
                  <Link href="/developers" className="block w-full text-left rounded-xl border border-border bg-surface/80 backdrop-blur-sm p-4 hover:border-amber/30 hover:bg-amber/5 transition-all">
                    <p className="text-sm font-medium text-text-primary">API Docs</p>
                    <p className="text-xs text-text-secondary/70 mt-0.5">Integration guide and endpoint reference</p>
                  </Link>
                  <button
                    onClick={() => { setData(null); setApiKey(''); }}
                    className="w-full text-left rounded-xl border border-border bg-surface/80 backdrop-blur-sm p-4 hover:border-error/30 hover:bg-error/5 transition-all"
                  >
                    <p className="text-sm font-medium text-text-primary">Sign Out</p>
                    <p className="text-xs text-text-secondary/70 mt-0.5">Clear API key from this session</p>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
