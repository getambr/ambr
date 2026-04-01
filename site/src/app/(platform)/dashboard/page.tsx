'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';

declare global {
  interface Window {
    ethereum?: import('ethers').Eip1193Provider;
  }
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'text-success border-success/40 bg-success/10',
    amended: 'text-amber border-amber/40 bg-amber/10',
    expired: 'text-text-secondary border-border bg-surface-elevated',
    draft: 'text-text-secondary border-border bg-surface-elevated',
    handshake: 'text-amber border-amber/40 bg-amber/10',
    pending_signature: 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10',
    terminated: 'text-error border-error/40 bg-error/10',
  };
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-md font-mono capitalize ${styles[status] || styles.draft}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

type AuthMethod = 'api_key' | 'wallet';

interface UserInfo {
  email: string;
  tier: string;
  credits: number;
  key_prefix: string;
}

interface ContractRow {
  contract_id: string;
  status: string;
  amendment_type: string;
  sha256_hash: string;
  created_at: string;
  template_id: string;
  principal_declaration: { principal_name: string } | null;
  nft_mint_status: string | null;
  visibility: string | null;
}

interface DashboardState {
  user: UserInfo | null;
  contracts: ContractRow[];
  wallet: string | null;
  authMethod: AuthMethod | null;
  error: string | null;
}

const SESSION_KEY = 'ambr_dashboard_session';

function saveSession(method: AuthMethod, apiKey?: string, wallet?: string) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ method, apiKey, wallet, ts: Date.now() }));
  } catch { /* localStorage unavailable */ }
}

function loadSession(): { method: AuthMethod; apiKey?: string; wallet?: string } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Expire after 24h
    if (Date.now() - parsed.ts > 86_400_000) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }
}

export default function DashboardPage() {
  const [apiKey, setApiKey] = useState('');
  const [data, setData] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [keyVisible, setKeyVisible] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showAgentSetup, setShowAgentSetup] = useState(false);

  // Restore session on mount
  useEffect(() => {
    const session = loadSession();
    if (!session) return;

    if (session.method === 'api_key' && session.apiKey) {
      setApiKey(session.apiKey);
      fetchWithApiKey(session.apiKey);
    }
    // Wallet sessions require re-signing (can't replay signatures)
    // so we just show a hint that they were connected before
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchWithApiKey = useCallback(async (key: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/dashboard', {
        headers: { 'X-API-Key': key },
      });
      const json = await res.json();
      if (!res.ok) {
        setData({ user: null, contracts: [], wallet: null, authMethod: null, error: json.error || 'Invalid API key' });
      } else {
        setData({ user: json.user, contracts: json.contracts, wallet: null, authMethod: 'api_key', error: null });
        saveSession('api_key', key);
      }
    } catch {
      setData({ user: null, contracts: [], wallet: null, authMethod: null, error: 'Failed to connect' });
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleApiKeySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) return;
    await fetchWithApiKey(apiKey.trim());
  }

  async function handleWalletConnect() {
    if (typeof window === 'undefined' || !window.ethereum) {
      setData({ user: null, contracts: [], wallet: null, authMethod: null, error: 'No wallet detected. Install MetaMask or a compatible wallet.' });
      return;
    }

    setWalletLoading(true);
    setData(null);

    try {
      const { BrowserProvider } = await import('ethers');
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      const timestamp = new Date().toISOString();
      const message = [
        'Ambr dashboard verification',
        '',
        `Timestamp: ${timestamp}`,
      ].join('\n');

      const signature = await signer.signMessage(message);

      const res = await fetch('/api/v1/dashboard/wallet-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: address, signature, message }),
      });

      const json = await res.json();

      if (!res.ok) {
        if (res.status === 404) {
          setData({
            user: null,
            contracts: [],
            wallet: address,
            authMethod: null,
            error: 'No contracts or API key found for this wallet. Create contracts via the API first, or sign in with your API key.',
          });
        } else {
          setData({ user: null, contracts: [], wallet: null, authMethod: null, error: json.message || 'Wallet verification failed' });
        }
        return;
      }

      setData({
        user: json.user,
        contracts: json.contracts,
        wallet: json.wallet,
        authMethod: 'wallet',
        error: null,
      });
      saveSession('wallet', undefined, json.wallet);
    } catch (err) {
      if ((err as Error).message?.includes('user rejected')) {
        setWalletLoading(false);
        return;
      }
      setData({ user: null, contracts: [], wallet: null, authMethod: null, error: 'Wallet connection failed' });
    } finally {
      setWalletLoading(false);
    }
  }

  function handleSignOut() {
    setData(null);
    setApiKey('');
    setShowAgentSetup(false);
    clearSession();
  }

  const isLoggedIn = data?.authMethod != null;

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
          <div className={!isLoggedIn ? 'text-center' : ''}>
            <p className="text-sm font-mono uppercase tracking-widest text-amber mb-2">Dashboard</p>
            <h1 className="text-3xl font-bold text-text-primary mb-8">Contract Management</h1>
          </div>

          {/* Login options */}
          {!isLoggedIn && (
            <div className="max-w-2xl mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                {/* API Key card */}
                <div className="rounded-xl border border-border bg-surface/80 backdrop-blur-sm p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-5 h-5 text-amber" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                    </svg>
                    <h2 className="text-sm font-semibold text-text-primary">API Key</h2>
                  </div>
                  <p className="text-xs text-text-secondary mb-4">
                    Sign in with your API key to manage contracts and view account details.
                  </p>
                  <form onSubmit={handleApiKeySubmit} className="space-y-3">
                    <div className="flex gap-2">
                      <input
                        type={keyVisible ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="amb_..."
                        className="flex-1 rounded-lg border border-border bg-background/80 px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:ring-2 focus:ring-amber focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => setKeyVisible(!keyVisible)}
                        className="rounded-lg border border-border bg-background/80 px-2.5 text-text-secondary hover:text-text-primary transition-colors"
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
                    </div>
                    <button
                      type="submit"
                      disabled={loading || !apiKey.trim()}
                      className="w-full rounded-lg bg-gradient-to-r from-amber to-amber-dark px-4 py-2 text-sm font-medium text-background hover:from-amber-light hover:to-amber transition-all disabled:opacity-50"
                    >
                      {loading ? 'Loading...' : 'Sign In'}
                    </button>
                  </form>
                </div>

                {/* Wallet card */}
                <div className="rounded-xl border border-border bg-surface/80 backdrop-blur-sm p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-5 h-5 text-amber" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
                    </svg>
                    <h2 className="text-sm font-semibold text-text-primary">Wallet</h2>
                  </div>
                  <p className="text-xs text-text-secondary mb-4">
                    Connect your wallet to view contracts you&apos;ve signed, handshaked, or paid for.
                  </p>
                  <button
                    onClick={handleWalletConnect}
                    disabled={walletLoading}
                    className="w-full rounded-lg border border-amber/30 bg-amber/10 px-4 py-2 text-sm font-medium text-amber hover:bg-amber/20 transition-colors disabled:opacity-50"
                  >
                    {walletLoading ? 'Connecting...' : 'Connect Wallet'}
                  </button>
                </div>
              </div>

              {data?.error && (
                <p className="mt-3 text-sm text-error text-center">{data.error}</p>
              )}

              <p className="mt-4 text-xs text-text-secondary/60 text-center">
                Don&apos;t have an API key?{' '}
                <Link href="/activate" className="text-amber hover:underline">Activate one</Link>
                {' '}or{' '}
                <Link href="/waitlist" className="text-amber hover:underline">join the waitlist</Link>.
              </p>
            </div>
          )}

          {/* Dashboard Content */}
          {isLoggedIn && (
            <>
              {/* Top bar */}
              <div className="flex items-center justify-between mb-8 rounded-xl border border-border/50 bg-background/80 backdrop-blur-sm px-5 py-3">
                <div className="flex items-center gap-3">
                  <Image src="/logo.png" alt="" width={20} height={20} className="rounded-sm" />
                  {data.user ? (
                    <span className="text-sm text-text-secondary">{data.user.email}</span>
                  ) : data.wallet ? (
                    <span className="font-mono text-sm text-text-secondary">
                      {data.wallet.slice(0, 6)}...{data.wallet.slice(-4)}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  {data.authMethod === 'wallet' && (
                    <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Wallet
                    </span>
                  )}
                  {data.user && (
                    <>
                      <span className="text-xs font-mono px-3 py-1 rounded-md bg-gradient-to-r from-amber/20 to-amber-dark/20 text-amber border border-amber/30 capitalize">
                        {data.user.tier}
                      </span>
                      <span className="text-xs font-mono text-text-secondary/50">
                        {data.user.key_prefix}...
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className={`grid grid-cols-2 gap-4 mb-8 ${data.user ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
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
                {data.user && (
                  <div className="rounded-xl border border-border bg-surface/80 backdrop-blur-sm p-5 relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber/50 to-transparent" />
                    <p className="text-xs text-text-secondary mb-1.5">Credits</p>
                    <p className="text-2xl font-bold text-text-primary">
                      {data.user.credits === -1 ? 'Unlimited' : data.user.credits}
                    </p>
                  </div>
                )}
                <div className="rounded-xl border border-border bg-surface/80 backdrop-blur-sm p-5 relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber/50 to-transparent" />
                  <p className="text-xs text-text-secondary mb-1.5">NFTs Minted</p>
                  <p className="text-2xl font-bold text-amber">
                    {data.contracts.filter(c => c.nft_mint_status === 'minted').length}
                  </p>
                </div>
              </div>

              {/* Main grid */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
                {/* Contract list */}
                <div className="lg:col-span-3">
                  <div className="rounded-xl border border-border bg-surface/80 backdrop-blur-sm overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-border space-y-3">
                      <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-text-primary">Your Contracts</h2>
                        <span className="text-xs text-text-secondary/60">{data.contracts.length} total</span>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {['all', 'draft', 'handshake', 'pending_signature', 'active', 'terminated', 'amended'].map((s) => (
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
                          <p className="text-sm text-text-secondary">
                            {statusFilter === 'all' ? 'No contracts yet.' : `No ${statusFilter.replace('_', ' ')} contracts.`}
                          </p>
                          <p className="text-xs text-text-secondary/60 mt-1">
                            Use the API or have an agent create your first Ricardian Contract.
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
                                  {contract.nft_mint_status === 'minted' && (
                                    <span className="text-xs px-2 py-0.5 rounded-md font-mono text-emerald-400 border border-emerald-500/30">
                                      NFT
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

                {/* Sidebar */}
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-text-primary mb-2">Quick Actions</h2>

                  <button
                    onClick={() => setShowAgentSetup(!showAgentSetup)}
                    className="block w-full text-left rounded-xl border border-amber/30 bg-amber/5 p-4 hover:bg-amber/10 transition-all"
                  >
                    <p className="text-sm font-medium text-amber">Agent Setup Guide</p>
                    <p className="text-xs text-text-secondary/70 mt-0.5">Configure your AI agent to use Ambr</p>
                  </button>

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
                    onClick={handleSignOut}
                    className="w-full text-left rounded-xl border border-border bg-surface/80 backdrop-blur-sm p-4 hover:border-error/30 hover:bg-error/5 transition-all"
                  >
                    <p className="text-sm font-medium text-text-primary">Sign Out</p>
                    <p className="text-xs text-text-secondary/70 mt-0.5">
                      {data.authMethod === 'wallet' ? 'Disconnect wallet' : 'Clear API key from this session'}
                    </p>
                  </button>
                </div>
              </div>

              {/* Agent Setup Guide (collapsible) */}
              {showAgentSetup && (
                <div className="mt-8 rounded-xl border border-amber/20 bg-surface/80 backdrop-blur-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-amber uppercase tracking-wider">Agent Setup Guide</h2>
                    <button
                      onClick={() => setShowAgentSetup(false)}
                      className="text-xs text-text-secondary hover:text-text-primary"
                    >
                      Close
                    </button>
                  </div>

                  <div className="space-y-6">
                    {/* MCP Config */}
                    <div>
                      <h3 className="text-sm font-medium text-text-primary mb-2">1. MCP Server Configuration</h3>
                      <p className="text-xs text-text-secondary mb-2">
                        Add this to your agent&apos;s MCP config (Claude Desktop, Cursor, etc.):
                      </p>
                      <pre className="rounded-lg bg-background border border-border p-4 text-xs font-mono text-text-secondary overflow-x-auto">
{`{
  "mcpServers": {
    "ambr": {
      "url": "https://getamber.dev/api/v1/mcp",
      "headers": {
        "X-API-Key": "YOUR_API_KEY"
      }
    }
  }
}`}
                      </pre>
                    </div>

                    {/* REST API */}
                    <div>
                      <h3 className="text-sm font-medium text-text-primary mb-2">2. REST API</h3>
                      <p className="text-xs text-text-secondary mb-2">
                        Create a contract via curl:
                      </p>
                      <pre className="rounded-lg bg-background border border-border p-4 text-xs font-mono text-text-secondary overflow-x-auto">
{`curl -X POST https://getamber.dev/api/v1/contracts \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "template_id": "d1-general-auth",
    "principal_declaration": {
      "agent_id": "my-agent",
      "principal_name": "My Company",
      "principal_type": "organization"
    },
    "context": {
      "scope": "API access and data processing",
      "duration": "12 months"
    }
  }'`}
                      </pre>
                    </div>

                    {/* A2A */}
                    <div>
                      <h3 className="text-sm font-medium text-text-primary mb-2">3. Agent-to-Agent (A2A)</h3>
                      <p className="text-xs text-text-secondary mb-2">
                        Ambr is discoverable via the A2A protocol at:
                      </p>
                      <code className="block rounded-lg bg-background border border-border px-4 py-2 text-xs font-mono text-amber">
                        https://getamber.dev/.well-known/agent.json
                      </code>
                      <p className="text-xs text-text-secondary mt-2">
                        Endpoint: <code className="text-amber">POST https://getamber.dev/api/a2a</code>
                      </p>
                    </div>

                    {/* x402 */}
                    <div>
                      <h3 className="text-sm font-medium text-text-primary mb-2">4. Pay-per-Contract (x402)</h3>
                      <p className="text-xs text-text-secondary mb-2">
                        No API key needed. Send any supported token on Base to the Ambr wallet, then include the tx hash:
                      </p>
                      <pre className="rounded-lg bg-background border border-border p-4 text-xs font-mono text-text-secondary overflow-x-auto">
{`curl -X POST https://getamber.dev/api/v1/contracts \\
  -H "X-Payment: 0xYOUR_TX_HASH" \\
  -H "Content-Type: application/json" \\
  -d '{ ... }'`}
                      </pre>
                      <p className="text-xs text-text-secondary/60 mt-2">
                        Pricing: $1.50 - $5.00 per contract depending on template. Accepted tokens on Base L2: USDC, USDbC, DAI, ETH, WETH, cbETH, cbBTC.
                      </p>
                    </div>

                    {/* Python */}
                    <div>
                      <h3 className="text-sm font-medium text-text-primary mb-2">5. Python Example</h3>
                      <pre className="rounded-lg bg-background border border-border p-4 text-xs font-mono text-text-secondary overflow-x-auto">
{`import requests

resp = requests.post(
    "https://getamber.dev/api/v1/contracts",
    headers={"X-API-Key": "YOUR_API_KEY"},
    json={
        "template_id": "c1-api-access",
        "principal_declaration": {
            "agent_id": "data-agent",
            "principal_name": "Acme Corp",
            "principal_type": "organization"
        },
        "context": {
            "scope": "Read-only API access",
            "duration": "6 months"
        }
    }
)
contract = resp.json()
print(f"Contract: {contract['contract_id']}")
print(f"Reader:   https://getamber.dev/reader/{contract['sha256_hash']}")`}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
