'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers, FileText, Send as SendIcon, Handshake, PenTool, ShieldCheck,
  Terminal, Wallet, BarChart3, ChevronRight, LogOut, Menu, X,
  Calendar, Mail, Send, Users, Lock, Copy, Check, ExternalLink,
  ArrowRight, Clock, Plus, RefreshCw,
} from 'lucide-react';
import { AdminSection } from '@/components/dashboard/AdminSection';

declare global {
  interface Window {
    ethereum?: import('ethers').Eip1193Provider;
  }
}

// ─── Types ──────────────────────────────────────────────
type AuthMethod = 'api_key' | 'wallet';
type Section = 'overview' | 'create' | 'contracts' | 'contract-detail' | 'agents' | 'account' | 'calendar' | 'email' | 'drafts' | 'crm';

interface UserInfo { email: string; tier: string; credits: number; key_prefix: string }
interface ContractRow {
  contract_id: string; status: string; amendment_type: string; sha256_hash: string;
  created_at: string; updated_at: string | null; template_id: string;
  principal_declaration: { principal_name: string } | null;
  nft_mint_status: string | null; visibility: string | null;
  contract_type: string | null; payment_method: string | null;
  revoked_at: string | null; revoked_by: string | null; revocation_reason: string | null;
  expiry_date: string | null; parent_contract_hash: string | null;
  oversight_threshold_usd: number | null; principal_approval_required: boolean | null;
}
interface TemplateRow {
  slug: string; name: string; description: string; category: string;
  parameter_schema: Record<string, unknown>; price_cents: number; version: number;
}
interface DashboardState {
  user: UserInfo | null; contracts: ContractRow[]; wallet: string | null;
  authMethod: AuthMethod | null; error: string | null;
}

const ADMIN_EMAILS = ['ilvers.sermols@gmail.com'];
const SESSION_KEY = 'ambr_dashboard_session';

function saveSession(method: AuthMethod, apiKey?: string, wallet?: string) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ method, apiKey, wallet, ts: Date.now() })); } catch {}
}
function loadSession(): { method: AuthMethod; apiKey?: string; wallet?: string } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (Date.now() - p.ts > 86_400_000) { localStorage.removeItem(SESSION_KEY); return null; }
    return p;
  } catch { return null; }
}
function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch {} }

// ─── Status Badge ───────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  active: 'text-success border-success/40 bg-success/10',
  amended: 'text-amber border-amber/40 bg-amber/10',
  draft: 'text-text-secondary border-border bg-surface-elevated',
  handshake: 'text-amber border-amber/40 bg-amber/10',
  pending_signature: 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10',
  awaiting_principal_approval: 'text-orange-400 border-orange-500/40 bg-orange-500/10',
  revoked: 'text-error border-error/40 bg-error/10',
  terminated: 'text-error border-error/40 bg-error/10',
  expired: 'text-text-secondary border-border bg-surface-elevated',
};
function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-md font-mono capitalize ${STATUS_STYLES[status] || STATUS_STYLES.draft}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

// ─── Sidebar ────────────────────────────────────────────
const NAV_SECTIONS = [
  {
    title: 'Contracts',
    items: [
      { id: 'overview' as Section, label: 'Pipeline Overview', icon: BarChart3 },
      { id: 'create' as Section, label: 'Create Contract', icon: Plus },
      { id: 'contracts' as Section, label: 'All Contracts', icon: FileText },
    ],
  },
  {
    title: 'Platform',
    items: [
      { id: 'agents' as Section, label: 'Agent Setup', icon: Terminal },
      { id: 'account' as Section, label: 'Account', icon: Wallet },
    ],
  },
  {
    title: 'Team',
    admin: true,
    items: [
      { id: 'calendar' as Section, label: 'Calendar', icon: Calendar },
      { id: 'email' as Section, label: 'Email Triage', icon: Mail },
      { id: 'drafts' as Section, label: 'Draft Queue', icon: Send },
      { id: 'crm' as Section, label: 'Outreach CRM', icon: Users },
    ],
  },
];

function Sidebar({ active, onNav, isAdmin, mobileOpen, onClose }: {
  active: Section; onNav: (s: Section) => void; isAdmin: boolean;
  mobileOpen: boolean; onClose: () => void;
}) {
  const nav = (
    <nav className="flex flex-col gap-5 py-5 px-3">
      {NAV_SECTIONS.map(section => {
        if (section.admin && !isAdmin) return null;
        return (
          <div key={section.title}>
            <div className="flex items-center gap-2 mb-1.5 px-2">
              <p className="text-micro">{section.title}</p>
              {section.admin && <Lock className="h-3 w-3 text-amber/40" />}
            </div>
            {section.items.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => { onNav(item.id); onClose(); }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active === item.id
                      ? 'bg-amber/10 text-amber border-l-2 border-amber'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      <aside className="hidden lg:block fixed top-16 left-0 w-56 h-[calc(100vh-4rem)] border-r border-border bg-background overflow-y-auto z-30">
        {nav}
      </aside>
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm" onClick={onClose} />
            <motion.aside initial={{ x: -240 }} animate={{ x: 0 }} exit={{ x: -240 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="lg:hidden fixed top-0 left-0 z-50 w-56 h-full border-r border-border bg-background">
              <div className="flex items-center justify-between px-4 py-4 border-b border-border">
                <p className="text-micro">Dashboard</p>
                <button onClick={onClose}><X className="h-5 w-5 text-text-secondary" /></button>
              </div>
              {nav}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Loading Skeleton ──────────────────────────────────
function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface/80 p-5">
            <div className="h-3 w-16 bg-border rounded mb-3" />
            <div className="h-7 w-12 bg-border rounded" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-surface/80 p-6">
        <div className="h-3 w-32 bg-border rounded mb-6" />
        <div className="flex gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex-1 text-center">
              <div className="h-12 w-12 bg-border rounded-xl mx-auto mb-2" />
              <div className="h-6 w-8 bg-border rounded mx-auto mb-1" />
              <div className="h-2 w-16 bg-border rounded mx-auto" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-border bg-surface/80 overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <div className="h-4 w-32 bg-border rounded" />
        </div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3 border-b border-border/30">
            <div className="flex-1"><div className="h-4 w-40 bg-border rounded mb-1" /><div className="h-3 w-24 bg-border rounded" /></div>
            <div className="h-3 w-16 bg-border rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Pipeline Overview ──────────────────────────────────
function PipelineOverview({ contracts, user, onSelectContract }: { contracts: ContractRow[]; user: UserInfo | null; onSelectContract?: (c: ContractRow) => void }) {
  const stages = [
    { key: 'draft', label: 'Draft', icon: FileText, color: 'text-text-secondary' },
    { key: 'handshake', label: 'Handshake', icon: Handshake, color: 'text-amber' },
    { key: 'pending_signature', label: 'Pending Sign', icon: PenTool, color: 'text-yellow-400' },
    { key: 'active', label: 'Active', icon: ShieldCheck, color: 'text-success' },
  ];
  const counts = Object.fromEntries(stages.map(s => [s.key, contracts.filter(c => c.status === s.key).length]));
  const total = contracts.length;
  const nfts = contracts.filter(c => c.nft_mint_status === 'minted').length;
  const tierInfo = user?.tier ? TIER_INFO[user.tier] : null;

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-surface/80 p-5 relative overflow-hidden group">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber/50 to-transparent" />
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-text-secondary">Total Contracts</p>
            <Layers className="h-3.5 w-3.5 text-text-secondary/40" />
          </div>
          <p className="text-2xl font-bold text-text-primary">{total}</p>
        </div>
        {user && (
          <div className="rounded-xl border border-border bg-surface/80 p-5 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber/50 to-transparent" />
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-text-secondary">Credits</p>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber/10 text-amber border border-amber/20">{tierInfo?.label || user.tier}</span>
            </div>
            <p className="text-2xl font-bold text-text-primary">{user.credits === -1 ? '\u221e' : user.credits}</p>
            {tierInfo && <p className="text-[10px] text-text-secondary/50 mt-0.5">{tierInfo.limit} limit</p>}
          </div>
        )}
        <div className="rounded-xl border border-border bg-surface/80 p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-success/50 to-transparent" />
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-text-secondary">Active</p>
            <ShieldCheck className="h-3.5 w-3.5 text-success/40" />
          </div>
          <p className="text-2xl font-bold text-success">{counts.active || 0}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface/80 p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber/50 to-transparent" />
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-text-secondary">On-Chain NFTs</p>
            <Wallet className="h-3.5 w-3.5 text-amber/40" />
          </div>
          <p className="text-2xl font-bold text-amber">{nfts}</p>
        </div>
      </div>

      {/* Pipeline funnel */}
      <div className="rounded-xl border border-border bg-surface/80 p-6">
        <p className="text-micro mb-4">Contract Pipeline</p>
        <div className="flex items-center gap-2 md:gap-4">
          {stages.map((stage, i) => {
            const Icon = stage.icon;
            const count = counts[stage.key] || 0;
            return (
              <div key={stage.key} className="flex items-center gap-2 md:gap-4 flex-1">
                <div className="flex-1 text-center">
                  <div className={`mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface-elevated ${stage.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="text-2xl font-bold font-mono text-text-primary">{count}</p>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary mt-0.5">{stage.label}</p>
                </div>
                {i < stages.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-border shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent contracts */}
      {contracts.length > 0 && (
        <div className="rounded-xl border border-border bg-surface/80 overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <p className="text-sm font-semibold text-text-primary">Recent Contracts</p>
            <span className="text-xs text-text-secondary/60">{contracts.length} total</span>
          </div>
          <div className="divide-y divide-border/50">
            {contracts.slice(0, 5).map(c => (
              <button key={c.contract_id} onClick={() => onSelectContract?.(c)}
                className="flex w-full items-center gap-3 px-5 py-3 hover:bg-amber/5 transition-colors text-left">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-mono text-amber">{c.contract_id}</span>
                    <StatusBadge status={c.status} />
                    {c.nft_mint_status === 'minted' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono text-emerald-400 border border-emerald-500/30">NFT</span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary/60 truncate">{c.principal_declaration?.principal_name || 'Unknown'}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-text-secondary">{new Date(c.created_at).toLocaleDateString()}</p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-text-secondary/30 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Contract Builder ───────────────────────────────────
function ContractBuilder({ apiKey }: { apiKey: string }) {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [selected, setSelected] = useState<TemplateRow | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<{ contract_id: string; sha256_hash: string; reader_url: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/v1/templates').then(r => r.json()).then(d => setTemplates(d.templates || [])).catch(() => {});
  }, []);

  async function handleCreate() {
    if (!selected || !apiKey) return;
    setCreating(true); setError(''); setResult(null);
    try {
      const body: Record<string, unknown> = { template_slug: selected.slug, parameters: params };
      const res = await fetch('/api/v1/contracts', {
        method: 'POST',
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || json.message || 'Failed to create'); return; }
      setResult({ contract_id: json.contract_id, sha256_hash: json.sha256_hash, reader_url: `https://getamber.dev/reader/${json.sha256_hash}` });
    } catch { setError('Network error'); }
    finally { setCreating(false); }
  }

  const paramFields = selected?.parameter_schema
    ? Object.entries((selected.parameter_schema as Record<string, { type?: string; description?: string }>)?.properties || {})
    : [];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-surface/80 p-6">
        <p className="text-micro mb-4">Select Template</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map(t => (
            <button key={t.slug} onClick={() => { setSelected(t); setParams({}); setResult(null); }}
              className={`text-left rounded-xl border p-4 transition-all ${
                selected?.slug === t.slug ? 'border-amber/50 bg-amber/5' : 'border-border bg-surface-elevated hover:border-amber/30'
              }`}>
              <p className="text-sm font-medium text-text-primary">{t.name}</p>
              <p className="text-xs text-text-secondary mt-1">{t.description}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-micro !text-text-secondary">{t.category}</span>
                <span className="text-xs font-mono text-amber">${(t.price_cents / 100).toFixed(2)}</span>
              </div>
            </button>
          ))}
          {templates.length === 0 && <p className="text-sm text-text-secondary col-span-2">Loading templates...</p>}
        </div>
      </div>

      {selected && (
        <div className="rounded-xl border border-border bg-surface/80 p-6">
          <p className="text-micro mb-4">Parameters for {selected.name}</p>
          <div className="space-y-4">
            {paramFields.map(([key, schema]) => (
              <div key={key}>
                <label className="block text-xs text-text-secondary mb-1 capitalize">{key.replace(/_/g, ' ')}</label>
                <input
                  type="text"
                  value={params[key] || ''}
                  onChange={e => setParams(p => ({ ...p, [key]: e.target.value }))}
                  placeholder={((schema as unknown as Record<string, string>)?.description) || key}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-amber/50"
                />
              </div>
            ))}
            {paramFields.length === 0 && <p className="text-xs text-text-secondary">This template has no required parameters.</p>}
            <button onClick={handleCreate} disabled={creating}
              className="rounded-lg bg-gradient-to-r from-amber to-amber-dark px-6 py-2.5 text-sm font-medium text-background hover:from-amber-light hover:to-amber transition-all disabled:opacity-50">
              {creating ? 'Creating...' : 'Create Contract'}
            </button>
            {error && <p className="text-sm text-error">{error}</p>}
          </div>
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-success/30 bg-success/5 p-6">
          <p className="text-sm font-medium text-success mb-3">Contract Created</p>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-text-secondary">ID:</span>
              <code className="font-mono text-amber">{result.contract_id}</code>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-text-secondary">Hash:</span>
              <code className="font-mono text-text-primary text-xs">{result.sha256_hash.slice(0, 24)}...</code>
            </div>
            <Link href={`/reader/${result.sha256_hash}`} className="inline-flex items-center gap-1 text-amber hover:underline">
              Open in Reader <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Contract List ──────────────────────────────────────
function ContractList({ contracts, onSelectContract }: { contracts: ContractRow[]; onSelectContract?: (c: ContractRow) => void }) {
  const [filter, setFilter] = useState('all');
  const filtered = filter === 'all' ? contracts : contracts.filter(c => c.status === filter);
  const statuses = ['all', 'draft', 'handshake', 'pending_signature', 'active', 'terminated', 'amended'];

  return (
    <div className="rounded-xl border border-border bg-surface/80 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">All Contracts</h2>
          <span className="text-xs text-text-secondary/60">{contracts.length} total</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {statuses.map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`text-xs px-3 py-1 rounded-md font-mono capitalize transition-colors ${
                filter === s ? 'bg-amber/20 text-amber border border-amber/40' : 'bg-surface-elevated text-text-secondary border border-border hover:border-amber/30'
              }`}>
              {s === 'all' ? 'All' : s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="text-sm text-text-secondary">{filter === 'all' ? 'No contracts yet.' : `No ${filter.replace('_', ' ')} contracts.`}</p>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {filtered.map(c => (
            <button key={c.contract_id} onClick={() => onSelectContract?.(c)}
              className="flex w-full items-center gap-4 px-5 py-3.5 hover:bg-amber/5 transition-colors text-left">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-mono text-amber">{c.contract_id}</span>
                  <StatusBadge status={c.status} />
                  {c.nft_mint_status === 'minted' && (
                    <span className="text-xs px-2 py-0.5 rounded-md font-mono text-emerald-400 border border-emerald-500/30">NFT</span>
                  )}
                  {c.revoked_at && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono text-error border border-error/30">REVOKED</span>
                  )}
                </div>
                <p className="text-xs text-text-secondary/70 truncate">{c.principal_declaration?.principal_name || 'Unknown'}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-text-secondary">{new Date(c.created_at).toLocaleDateString()}</p>
                <p className="text-xs font-mono text-text-secondary/40">{c.sha256_hash.slice(0, 16)}...</p>
              </div>
              <ChevronRight className="h-4 w-4 text-text-secondary/30 shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Contract Detail View ──────────────────────────────
function ContractDetail({ contract, apiKey, onBack, onRevoked }: {
  contract: ContractRow; apiKey: string; onBack: () => void; onRevoked: () => void;
}) {
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState('');
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [signatures, setSignatures] = useState<{ signer_wallet: string; created_at: string }[]>([]);
  const [amendments, setAmendments] = useState<{ contract_id: string; status: string; sha256_hash: string }[]>([]);

  useEffect(() => {
    // Fetch signatures and amendment chain
    fetch(`/api/v1/contracts/${contract.contract_id}/status`)
      .then(r => r.json())
      .then(data => {
        if (data.signatures) setSignatures(data.signatures);
        if (data.amendments) setAmendments(data.amendments);
      })
      .catch(() => {});
  }, [contract.contract_id]);

  async function handleRevoke() {
    setRevoking(true);
    setRevokeError('');
    try {
      const res = await fetch(`/api/v1/contracts/${contract.contract_id}/revoke`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: revokeReason || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        setRevokeError(json.message || 'Revocation failed');
        return;
      }
      onRevoked();
    } catch {
      setRevokeError('Network error');
    } finally {
      setRevoking(false);
    }
  }

  const stages = [
    { key: 'draft', label: 'Created', icon: FileText },
    { key: 'handshake', label: 'Handshake', icon: Handshake },
    { key: 'pending_signature', label: 'Signing', icon: PenTool },
    { key: 'active', label: 'Active', icon: ShieldCheck },
  ];

  const currentStageIndex = stages.findIndex(s => s.key === contract.status);
  const isTerminal = ['revoked', 'terminated', 'expired', 'amended'].includes(contract.status);
  const canRevoke = ['active', 'handshake', 'pending_signature'].includes(contract.status);
  const needsApproval = contract.status === 'awaiting_principal_approval';
  const isExpiringSoon = contract.expiry_date && new Date(contract.expiry_date).getTime() - Date.now() < 7 * 86_400_000;
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState('');

  async function handleApprove() {
    setApproving(true);
    setApproveError('');
    try {
      const res = await fetch(`/api/v1/contracts/${contract.contract_id}/approve`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) { setApproveError(json.message || 'Approval failed'); return; }
      onRevoked(); // reuse callback to refresh data
    } catch { setApproveError('Network error'); }
    finally { setApproving(false); }
  }

  return (
    <div className="space-y-6">
      {/* Back button + header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="rounded-lg border border-border bg-surface-elevated p-2 text-text-secondary hover:text-text-primary transition-colors">
          <ChevronRight className="h-4 w-4 rotate-180" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-mono text-amber">{contract.contract_id}</h2>
            <StatusBadge status={contract.status} />
            {contract.nft_mint_status === 'minted' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono text-emerald-400 border border-emerald-500/30">NFT</span>
            )}
          </div>
          <p className="text-xs text-text-secondary mt-0.5">
            {contract.principal_declaration?.principal_name || 'Unknown principal'}
            {contract.contract_type && <span className="ml-2 text-text-secondary/50">({contract.contract_type})</span>}
          </p>
        </div>
      </div>

      {/* Revocation banner */}
      {contract.revoked_at && (
        <div className="rounded-xl border border-error/40 bg-error/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <X className="h-4 w-4 text-error" />
            <p className="text-sm font-medium text-error">Contract Revoked</p>
          </div>
          <div className="space-y-1 text-xs text-text-secondary">
            <p>Revoked: {new Date(contract.revoked_at).toLocaleString()}</p>
            {contract.revoked_by && <p>By: <span className="font-mono">{contract.revoked_by}</span></p>}
            {contract.revocation_reason && <p>Reason: {contract.revocation_reason}</p>}
          </div>
        </div>
      )}

      {/* Expiry warning */}
      {isExpiringSoon && !isTerminal && contract.expiry_date && (
        <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/5 p-4 flex items-center gap-3">
          <Clock className="h-4 w-4 text-yellow-400 shrink-0" />
          <div>
            <p className="text-sm text-yellow-400">Expiring {new Date(contract.expiry_date).toLocaleDateString()}</p>
            <p className="text-xs text-text-secondary">This contract will automatically expire on the date above.</p>
          </div>
        </div>
      )}

      {/* Principal approval required banner */}
      {needsApproval && (
        <div className="rounded-xl border border-orange-500/40 bg-orange-500/5 p-5">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="h-4 w-4 text-orange-400" />
            <p className="text-sm font-medium text-orange-400">Principal Approval Required</p>
          </div>
          <p className="text-xs text-text-secondary mb-3">
            This contract exceeds the oversight threshold
            {contract.oversight_threshold_usd != null && <> of <span className="font-mono text-orange-400">${contract.oversight_threshold_usd}</span></>}.
            As the principal, you must approve before the agent can proceed. This is the human-in-the-loop mechanism required by EU AI Act Article 14.
          </p>
          {approveError && <p className="text-xs text-error mb-3">{approveError}</p>}
          <div className="flex gap-3">
            <button onClick={handleApprove} disabled={approving}
              className="rounded-lg bg-orange-500/20 border border-orange-500/40 px-4 py-2 text-sm text-orange-400 hover:bg-orange-500/30 transition-colors disabled:opacity-50">
              {approving ? 'Approving...' : 'Approve Contract'}
            </button>
            <button onClick={() => setShowRevokeConfirm(true)}
              className="rounded-lg border border-error/30 bg-error/5 px-4 py-2 text-sm text-error hover:bg-error/10 transition-colors">
              Reject
            </button>
          </div>
        </div>
      )}

      {/* Lifecycle timeline */}
      <div className="rounded-xl border border-border bg-surface/80 p-6">
        <p className="text-micro mb-5">Contract Lifecycle</p>
        <div className="flex items-center gap-1">
          {stages.map((stage, i) => {
            const Icon = stage.icon;
            const isPast = !isTerminal && currentStageIndex >= i;
            const isCurrent = !isTerminal && currentStageIndex === i;
            return (
              <div key={stage.key} className="flex items-center gap-1 flex-1">
                <div className="flex-1 text-center">
                  <div className={`mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg border transition-all ${
                    isCurrent ? 'border-amber bg-amber/15 text-amber' :
                    isPast ? 'border-success/40 bg-success/10 text-success' :
                    'border-border bg-surface-elevated text-text-secondary/40'
                  }`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className={`text-[10px] font-mono uppercase tracking-wider ${
                    isCurrent ? 'text-amber' : isPast ? 'text-success/70' : 'text-text-secondary/40'
                  }`}>{stage.label}</p>
                </div>
                {i < stages.length - 1 && (
                  <div className={`h-0.5 w-4 shrink-0 rounded ${isPast && currentStageIndex > i ? 'bg-success/40' : 'bg-border'}`} />
                )}
              </div>
            );
          })}
          {isTerminal && (
            <>
              <div className="h-0.5 w-4 shrink-0 rounded bg-border" />
              <div className="text-center">
                <div className={`mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg border ${
                  contract.status === 'revoked' ? 'border-error/40 bg-error/10 text-error' :
                  contract.status === 'amended' ? 'border-amber/40 bg-amber/10 text-amber' :
                  'border-border bg-surface-elevated text-text-secondary'
                }`}>
                  <X className="h-4 w-4" />
                </div>
                <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{contract.status}</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-surface/80 p-5">
          <p className="text-micro mb-3">Contract Info</p>
          <div className="space-y-2.5">
            <DetailRow label="Hash" value={contract.sha256_hash.slice(0, 32) + '...'} mono />
            <DetailRow label="Status" value={contract.status} />
            <DetailRow label="Type" value={contract.amendment_type || 'original'} />
            <DetailRow label="Visibility" value={contract.visibility || 'private'} />
            <DetailRow label="Payment" value={contract.payment_method || '—'} />
            <DetailRow label="Created" value={new Date(contract.created_at).toLocaleString()} />
            {contract.expiry_date && <DetailRow label="Expires" value={new Date(contract.expiry_date).toLocaleString()} />}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface/80 p-5">
          <p className="text-micro mb-3">Signatures</p>
          {signatures.length > 0 ? (
            <div className="space-y-2">
              {signatures.map((sig, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="font-mono text-text-primary">{sig.signer_wallet.slice(0, 6)}...{sig.signer_wallet.slice(-4)}</span>
                  <span className="text-text-secondary">{new Date(sig.created_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-secondary">No signatures yet</p>
          )}

          {contract.parent_contract_hash && (
            <div className="mt-4 pt-3 border-t border-border">
              <p className="text-micro mb-2">Parent Contract</p>
              <code className="text-xs font-mono text-amber">{contract.parent_contract_hash.slice(0, 24)}...</code>
            </div>
          )}

          {amendments.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border">
              <p className="text-micro mb-2">Amendments ({amendments.length})</p>
              {amendments.map(a => (
                <div key={a.contract_id} className="flex items-center gap-2 text-xs mb-1">
                  <span className="font-mono text-amber">{a.contract_id}</span>
                  <StatusBadge status={a.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Link href={`/reader/${contract.sha256_hash}`} target="_blank"
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber/15 px-4 py-2.5 text-sm font-medium text-amber hover:bg-amber/25 transition-colors">
          Open in Reader <ExternalLink className="h-3.5 w-3.5" />
        </Link>

        {canRevoke && !showRevokeConfirm && (
          <button onClick={() => setShowRevokeConfirm(true)}
            className="rounded-lg border border-error/30 bg-error/5 px-4 py-2.5 text-sm text-error hover:bg-error/10 transition-colors">
            Revoke Contract
          </button>
        )}
      </div>

      {/* Revoke confirmation */}
      {showRevokeConfirm && (
        <div className="rounded-xl border border-error/40 bg-error/5 p-5">
          <p className="text-sm font-medium text-error mb-3">Confirm Revocation</p>
          <p className="text-xs text-text-secondary mb-4">
            This action is irreversible. The contract and all child contracts in the delegation chain will be permanently revoked.
            {contract.amendment_type === 'original' && ' This is required for EU AI Act Article 14 compliance (human override).'}
          </p>
          <input
            type="text"
            value={revokeReason}
            onChange={e => setRevokeReason(e.target.value)}
            placeholder="Reason for revocation (optional)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-error/50 mb-3"
          />
          {revokeError && <p className="text-xs text-error mb-3">{revokeError}</p>}
          <div className="flex gap-3">
            <button onClick={handleRevoke} disabled={revoking}
              className="rounded-lg bg-error/20 border border-error/40 px-4 py-2 text-sm text-error hover:bg-error/30 transition-colors disabled:opacity-50">
              {revoking ? 'Revoking...' : 'Confirm Revoke'}
            </button>
            <button onClick={() => { setShowRevokeConfirm(false); setRevokeError(''); }}
              className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-text-secondary">{label}</span>
      <span className={`${mono ? 'font-mono text-xs' : ''} text-text-primary`}>{value}</span>
    </div>
  );
}

// ─── Agent Setup ────────────────────────────────────────
function AgentSetup({ apiKeyPrefix }: { apiKeyPrefix: string }) {
  const [copied, setCopied] = useState('');
  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text); setCopied(id);
    setTimeout(() => setCopied(''), 2000);
  }

  const mcpConfig = `{
  "mcpServers": {
    "ambr": {
      "url": "https://getamber.dev/api/v1/mcp",
      "headers": { "X-API-Key": "${apiKeyPrefix}..." }
    }
  }
}`;

  const curlExample = `curl -X POST https://getamber.dev/api/v1/contracts \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "template_slug": "delegation-d1",
    "parameters": {
      "principal_name": "Acme Corp",
      "agent_name": "ProcureBot AI",
      "scope": "procurement up to $10,000",
      "duration": "90 days"
    }
  }'`;

  const blocks = [
    { id: 'mcp', title: '1. MCP Server', desc: 'Add to Claude Desktop, Cursor, or any MCP client:', code: mcpConfig },
    { id: 'rest', title: '2. REST API', desc: 'Create a contract via curl:', code: curlExample },
    { id: 'a2a', title: '3. Agent-to-Agent (A2A)', desc: 'Ambr is discoverable at:', code: 'https://getamber.dev/.well-known/agent.json' },
    { id: 'x402', title: '4. Pay-per-Contract (x402)', desc: 'No API key needed. Include payment tx hash:', code: 'curl -X POST https://getamber.dev/api/v1/contracts \\\n  -H "X-Payment: 0xYOUR_TX_HASH" ...' },
  ];

  return (
    <div className="space-y-5">
      {blocks.map(b => (
        <div key={b.id} className="rounded-xl border border-border bg-surface/80 p-5">
          <h3 className="text-sm font-medium text-text-primary mb-1">{b.title}</h3>
          <p className="text-xs text-text-secondary mb-3">{b.desc}</p>
          <div className="relative">
            <pre className="rounded-lg bg-background border border-border p-4 text-xs font-mono text-text-secondary overflow-x-auto">{b.code}</pre>
            <button onClick={() => copy(b.code, b.id)}
              className="absolute top-2 right-2 rounded-md border border-border bg-surface-elevated p-1.5 text-text-secondary hover:text-amber transition-colors">
              {copied === b.id ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Account ────────────────────────────────────────────
const TIER_INFO: Record<string, { label: string; limit: string; overage: string }> = {
  developer: { label: 'Developer', limit: '25/mo', overage: 'N/A' },
  startup: { label: 'Startup', limit: '200/mo', overage: '$0.35/contract' },
  scale: { label: 'Scale', limit: '1,000/mo', overage: '$0.25/contract' },
  enterprise: { label: 'Enterprise', limit: 'Unlimited', overage: 'Custom' },
  alpha: { label: 'Alpha (legacy)', limit: '5 total', overage: 'N/A' },
};

function AccountSection({ user, wallet, authMethod, onSignOut }: {
  user: UserInfo | null; wallet: string | null; authMethod: AuthMethod; onSignOut: () => void;
}) {
  const tierInfo = user?.tier ? TIER_INFO[user.tier] || { label: user.tier, limit: '—', overage: '—' } : null;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-surface/80 p-6">
        <p className="text-micro mb-4">Account Details</p>
        <div className="space-y-3">
          {user?.email && <Row label="Email" value={user.email} />}
          {tierInfo && <Row label="Plan" value={tierInfo.label} className="text-amber" />}
          {user && <Row label="Credits Remaining" value={user.credits === -1 ? 'Unlimited' : String(user.credits)} mono />}
          {tierInfo && <Row label="Monthly Limit" value={tierInfo.limit} />}
          {tierInfo && tierInfo.overage !== 'N/A' && <Row label="Overage Rate" value={tierInfo.overage} className="text-text-secondary" />}
          {user?.key_prefix && <Row label="API Key" value={`${user.key_prefix}...`} mono />}
          {wallet && <Row label="Wallet" value={`${wallet.slice(0, 6)}...${wallet.slice(-4)}`} mono />}
          <Row label="Auth Method" value={authMethod === 'wallet' ? 'Wallet (ECDSA)' : 'API Key'} />
        </div>
      </div>

      {/* x402 pay-per-contract info */}
      <div className="rounded-xl border border-border bg-surface/80 p-5">
        <p className="text-micro mb-3">Pay-per-Contract (x402)</p>
        <p className="text-xs text-text-secondary mb-3">No API key required. Pay per contract directly with crypto on Base.</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-lg bg-surface-elevated border border-border">
            <p className="text-lg font-mono font-bold text-text-primary">$0.50</p>
            <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary mt-1">Delegation</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-surface-elevated border border-border">
            <p className="text-lg font-mono font-bold text-text-primary">$1.00</p>
            <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary mt-1">Commerce</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-surface-elevated border border-border">
            <p className="text-lg font-mono font-bold text-text-primary">$2.50</p>
            <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary mt-1">Fleet Auth</p>
          </div>
        </div>
        <p className="text-xs text-text-secondary/60 mt-3">Handshake, sign, verify, and reader access are always free.</p>
      </div>

      <div className="flex gap-3">
        <Link href="/activate" className="rounded-lg bg-amber/15 px-4 py-2.5 text-sm font-medium text-amber hover:bg-amber/25 transition-colors">
          {user?.tier === 'developer' || user?.tier === 'alpha' ? 'Upgrade Plan' : 'Manage Plan'}
        </Link>
        <button onClick={onSignOut}
          className="rounded-lg border border-error/30 bg-error/5 px-4 py-2.5 text-sm text-error hover:bg-error/10 transition-colors">
          Sign Out
        </button>
      </div>
    </div>
  );
}
function Row({ label, value, mono, className }: { label: string; value: string; mono?: boolean; className?: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-text-secondary">{label}</span>
      <span className={`${mono ? 'font-mono' : ''} ${className || 'text-text-primary'}`}>{value}</span>
    </div>
  );
}

// ─── Main Dashboard ─────────────────────────────────────
export default function DashboardPage() {
  const [apiKey, setApiKey] = useState('');
  const [data, setData] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [walletLoading, setWalletLoading] = useState(false);
  const [keyVisible, setKeyVisible] = useState(false);
  const [section, setSection] = useState<Section>('overview');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<ContractRow | null>(null);

  const isLoggedIn = data?.authMethod != null;
  const isAdmin = data?.user?.email ? ADMIN_EMAILS.includes(data.user.email) : false;

  useEffect(() => {
    const s = loadSession();
    if (s?.method === 'api_key' && s.apiKey) { setApiKey(s.apiKey); fetchWithApiKey(s.apiKey); }
    else { setLoading(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchWithApiKey = useCallback(async (key: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/dashboard', { headers: { 'X-API-Key': key } });
      const json = await res.json();
      if (!res.ok) { setData({ user: null, contracts: [], wallet: null, authMethod: null, error: json.error || 'Invalid API key' }); }
      else { setData({ user: json.user, contracts: json.contracts, wallet: null, authMethod: 'api_key', error: null }); saveSession('api_key', key); }
    } catch { setData({ user: null, contracts: [], wallet: null, authMethod: null, error: 'Failed to connect' }); }
    finally { setLoading(false); }
  }, []);

  async function handleApiKeySubmit(e: React.FormEvent) { e.preventDefault(); if (apiKey.trim()) await fetchWithApiKey(apiKey.trim()); }

  async function handleWalletConnect() {
    if (!window?.ethereum) { setData({ user: null, contracts: [], wallet: null, authMethod: null, error: 'No wallet detected.' }); return; }
    setWalletLoading(true); setData(null);
    try {
      const { BrowserProvider } = await import('ethers');
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const timestamp = new Date().toISOString();
      const message = `Ambr dashboard verification\n\nTimestamp: ${timestamp}`;
      const signature = await signer.signMessage(message);
      const res = await fetch('/api/v1/dashboard/wallet-auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: address, signature, message }),
      });
      const json = await res.json();
      if (!res.ok) {
        setData({ user: null, contracts: [], wallet: res.status === 404 ? address : null, authMethod: null,
          error: res.status === 404 ? 'No contracts found for this wallet.' : json.message || 'Verification failed' });
      } else {
        setData({ user: json.user, contracts: json.contracts, wallet: json.wallet, authMethod: 'wallet', error: null });
        saveSession('wallet', undefined, json.wallet);
      }
    } catch (err) {
      if (!(err as Error).message?.includes('user rejected'))
        setData({ user: null, contracts: [], wallet: null, authMethod: null, error: 'Wallet connection failed' });
    } finally { setWalletLoading(false); }
  }

  function handleSignOut() { setData(null); setApiKey(''); setSection('overview'); clearSession(); }

  // ─── Render ─────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <main className="pt-16">
        {/* Loading skeleton while restoring session */}
        {loading && !isLoggedIn && (
          <div className="lg:ml-56 px-4 py-6 sm:px-6 lg:px-8 max-w-5xl pt-20">
            <DashboardSkeleton />
          </div>
        )}

        {/* Login */}
        {!loading && !isLoggedIn && (
          <div className="mx-auto max-w-2xl px-4 py-16 text-center">
            <p className="text-micro mb-2">Dashboard</p>
            <h1 className="text-3xl font-bold text-text-primary mb-8">Contract Management</h1>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 text-left">
              <div className="rounded-xl border border-border bg-surface/80 p-6">
                <h2 className="text-sm font-semibold text-text-primary mb-3">API Key</h2>
                <p className="text-xs text-text-secondary mb-4">Sign in with your API key.</p>
                <form onSubmit={handleApiKeySubmit} className="space-y-3">
                  <div className="flex gap-2">
                    <input type={keyVisible ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)}
                      placeholder="amb_..." className="flex-1 rounded-lg border border-border bg-background/80 px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:ring-2 focus:ring-amber" />
                    <button type="button" onClick={() => setKeyVisible(!keyVisible)}
                      className="rounded-lg border border-border bg-background/80 px-2.5 text-text-secondary hover:text-text-primary transition-colors">
                      {keyVisible ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                    </button>
                  </div>
                  <button type="submit" disabled={loading || !apiKey.trim()}
                    className="w-full rounded-lg bg-gradient-to-r from-amber to-amber-dark px-4 py-2 text-sm font-medium text-background disabled:opacity-50">
                    {loading ? 'Loading...' : 'Sign In'}
                  </button>
                </form>
              </div>
              <div className="rounded-xl border border-border bg-surface/80 p-6">
                <h2 className="text-sm font-semibold text-text-primary mb-3">Wallet</h2>
                <p className="text-xs text-text-secondary mb-4">Connect wallet to view signed contracts.</p>
                <button onClick={handleWalletConnect} disabled={walletLoading}
                  className="w-full rounded-lg border border-amber/30 bg-amber/10 px-4 py-2 text-sm font-medium text-amber hover:bg-amber/20 disabled:opacity-50">
                  {walletLoading ? 'Connecting...' : 'Connect Wallet'}
                </button>
              </div>
            </div>
            {data?.error && <p className="text-sm text-error">{data.error}</p>}
            <p className="mt-4 text-xs text-text-secondary/60">
              No API key? <Link href="/activate" className="text-amber hover:underline">Activate one</Link> or <Link href="/waitlist" className="text-amber hover:underline">join the waitlist</Link>.
            </p>
          </div>
        )}

        {/* Dashboard */}
        {isLoggedIn && (
          <>
            <Sidebar active={section} onNav={setSection} isAdmin={isAdmin}
              mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

            {/* Mobile menu button */}
            <button onClick={() => setMobileOpen(true)}
              className="lg:hidden fixed top-20 left-4 z-30 rounded-lg border border-border bg-surface p-2 text-text-secondary">
              <Menu className="h-5 w-5" />
            </button>

            <div className="lg:ml-56 px-4 py-6 sm:px-6 lg:px-8 max-w-5xl">
              {/* Top bar */}
              <div className="flex items-center justify-between mb-6 rounded-xl border border-border/50 bg-surface/80 px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <Image src="/logo.png" alt="" width={18} height={18} className="rounded-sm" />
                  <span className="text-sm text-text-secondary">{data.user?.email || (data.wallet ? `${data.wallet.slice(0, 6)}...${data.wallet.slice(-4)}` : '')}</span>
                </div>
                <div className="flex items-center gap-3">
                  {data.user && (
                    <>
                      <span className="text-xs font-mono px-2.5 py-0.5 rounded-md bg-amber/15 text-amber border border-amber/30">
                        {TIER_INFO[data.user.tier]?.label || data.user.tier}
                      </span>
                      <span className="text-xs font-mono text-text-secondary/60">
                        {data.user.credits === -1 ? '\u221e' : data.user.credits} credits
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Section content */}
              <AnimatePresence mode="wait">
                <motion.div key={section} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>

                  {section === 'overview' && <PipelineOverview contracts={data.contracts} user={data.user} onSelectContract={(c) => { setSelectedContract(c); setSection('contract-detail'); }} />}
                  {section === 'create' && <ContractBuilder apiKey={apiKey} />}
                  {section === 'contracts' && <ContractList contracts={data.contracts} onSelectContract={(c) => { setSelectedContract(c); setSection('contract-detail'); }} />}
                  {section === 'contract-detail' && selectedContract && (
                    <ContractDetail
                      contract={selectedContract}
                      apiKey={apiKey}
                      onBack={() => setSection('contracts')}
                      onRevoked={() => { fetchWithApiKey(apiKey); setSection('contracts'); }}
                    />
                  )}
                  {section === 'agents' && <AgentSetup apiKeyPrefix={data.user?.key_prefix || 'amb_***'} />}
                  {section === 'account' && <AccountSection user={data.user} wallet={data.wallet} authMethod={data.authMethod!} onSignOut={handleSignOut} />}

                  {/* Admin sections */}
                  {isAdmin && ['calendar', 'email', 'drafts', 'crm'].includes(section) && (
                    <AdminSection activeSection={section as 'calendar' | 'email' | 'drafts' | 'crm'} />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
