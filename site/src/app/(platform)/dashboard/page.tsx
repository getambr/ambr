'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers, FileText, Send as SendIcon, Handshake, PenTool, ShieldCheck,
  Terminal, Wallet, BarChart3, ChevronRight, LogOut, Menu, X,
  Calendar, Mail, Users, Lock, Copy, Check, ExternalLink,
  ArrowRight, Clock, Plus, RefreshCw, TrendingUp, Eye,
} from 'lucide-react';
import { AdminSection } from '@/components/dashboard/AdminSection';
import { ContractAnalytics } from '@/components/dashboard/ContractAnalytics';
import { useWalletStatus } from '@/lib/wallet/use-wallet-status';
import ContractViewer from '@/app/(platform)/reader/[hashOrId]/ContractViewer';
import ExportButtons from '@/app/(platform)/reader/[hashOrId]/ExportButtons';
import { ADMIN_EMAILS } from '@/lib/admin-emails';
import { useWalletProviders, type EIP6963ProviderDetail } from '@/lib/wallet/providers';
import WalletPicker from '@/components/wallet/WalletPicker';

// ─── Types ──────────────────────────────────────────────
type AuthMethod = 'api_key' | 'wallet';
type Section = 'overview' | 'create' | 'contracts' | 'contract-detail' | 'wallet' | 'agents' | 'account' | 'analytics' | 'calendar' | 'email' | 'drafts';

interface UserInfo { email: string; tier: string; credits: number; key_prefix: string }
export interface ContractRow {
  contract_id: string; status: string; amendment_type: string; sha256_hash: string;
  created_at: string; updated_at: string | null; template_id: string;
  principal_declaration: { principal_name: string } | null;
  nft_mint_status: string | null;
  nft_token_id: number | null;
  nft_counterparty_token_id: number | null;
  nft_holder_wallet: string | null;
  nft_counterparty_wallet: string | null;
  visibility: string | null;
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

// ─── Tier Info ──────────────────────────────────────────
const TIER_INFO: Record<string, { label: string; limit: string; overage: string }> = {
  developer: { label: 'Developer', limit: '25/mo', overage: 'N/A' },
  startup: { label: 'Startup', limit: '200/mo', overage: '$0.35/contract' },
  scale: { label: 'Scale', limit: '1,000/mo', overage: '$0.25/contract' },
  enterprise: { label: 'Enterprise', limit: 'Unlimited', overage: 'Custom' },
  alpha: { label: 'Alpha (legacy)', limit: '5 total', overage: 'N/A' },
};

// ─── Sidebar ────────────────────────────────────────────
const NAV_SECTIONS = [
  {
    title: 'Contracts',
    items: [
      { id: 'overview' as Section, label: 'Pipeline Overview', icon: BarChart3 },
      { id: 'create' as Section, label: 'Create Contract', icon: Plus },
      { id: 'contracts' as Section, label: 'All Contracts', icon: FileText },
      { id: 'analytics' as Section, label: 'Analytics', icon: TrendingUp },
    ],
  },
  {
    title: 'Platform',
    items: [
      { id: 'wallet' as Section, label: 'Wallet & NFTs', icon: Wallet },
      { id: 'agents' as Section, label: 'Agent Setup', icon: Terminal },
      { id: 'account' as Section, label: 'Account', icon: Layers },
    ],
  },
  {
    title: 'Team',
    admin: true,
    items: [
      { id: 'calendar' as Section, label: 'Calendar', icon: Calendar },
      { id: 'email' as Section, label: 'Email Triage', icon: Mail },
    ],
  },
];

function SidebarWalletCard() {
  const { wallet, nftCount, pendingActions, hasZkIdentity, disconnect } = useWalletStatus();

  if (!wallet) return null;

  return (
    <div className="shrink-0 border-t border-border px-3 py-3">
      <div className="rounded-lg border border-border/50 bg-surface/50 p-2.5">
        {/* Wallet address + status */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="w-[5px] h-[5px] rounded-full bg-emerald-500 shrink-0"
              style={{ boxShadow: '0 0 4px rgba(52,211,153,0.4)' }}
            />
            <span className="text-[10px] font-mono text-text-secondary truncate">
              {wallet.slice(0, 6)}...{wallet.slice(-4)}
            </span>
            <span className={`inline-flex items-center gap-0.5 px-1 border rounded text-[8px] shrink-0 ${
              hasZkIdentity
                ? 'border-amber/25 bg-amber/[0.06] text-amber'
                : 'border-border bg-surface text-text-secondary/50'
            }`}>
              <img src="/demos-logo.svg" alt="" className={`w-2 h-2 ${hasZkIdentity ? 'opacity-70' : 'opacity-30'}`} />
              {hasZkIdentity ? 'ZK' : 'Link ZK'}
            </span>
          </div>
          <button
            onClick={disconnect}
            className="text-text-secondary/40 hover:text-text-primary transition-colors cursor-pointer p-0.5"
            title="Disconnect"
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 text-[9px] font-mono">
          <span className="text-text-secondary">
            <span className="text-text-primary">{nftCount}</span> NFTs
          </span>
          <span className="text-emerald-500/60">Base L2</span>
          {pendingActions > 0 && (
            <span className="text-amber flex items-center gap-0.5">
              <span className="w-1 h-1 rounded-full bg-amber animate-pulse" />
              {pendingActions}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function DesktopSidebar({ active, onNav, isAdmin, user, onSignOut }: {
  active: Section;
  onNav: (s: Section) => void;
  isAdmin: boolean;
  user: UserInfo | null;
  onSignOut: () => void;
}) {
  const tierLabel = user?.tier ? (TIER_INFO[user.tier]?.label || user.tier) : null;

  return (
    <aside className="hidden lg:flex flex-col fixed top-16 left-0 w-56 h-[calc(100vh-4rem)] border-r border-border bg-background z-30">
      {/* Scrollable nav region */}
      <nav className="flex-1 flex flex-col gap-5 py-5 px-3 overflow-y-auto">
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
                    onClick={() => onNav(item.id)}
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

      {/* Wallet status card */}
      <SidebarWalletCard />

      {/* Pinned footer with user card + sign out */}
      <div className="shrink-0 border-t border-border px-3 py-3 bg-background">
        {user && (
          <div className="mb-2 px-2 py-1.5">
            <p className="text-xs text-text-primary truncate" title={user.email}>
              {user.email}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {tierLabel && (
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber">
                  {tierLabel}
                </span>
              )}
              <span className="text-[10px] font-mono text-text-secondary/50">
                {user.credits === -1 ? '\u221e' : user.credits} credits
              </span>
            </div>
          </div>
        )}
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-secondary hover:text-error hover:bg-error/10 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}

// ─── Mobile Bottom Nav ─────────────────────────────────
const MOBILE_TABS = [
  { id: 'overview' as Section, label: 'Pipeline', icon: BarChart3 },
  { id: 'contracts' as Section, label: 'Contracts', icon: FileText },
  { id: 'create' as Section, label: 'Create', icon: Plus, accent: true },
  { id: 'wallet' as Section, label: 'Wallet', icon: Wallet },
  { id: '_more' as const, label: 'More', icon: Menu },
];

const MORE_ITEMS = [
  { id: 'agents' as Section, label: 'Agent Setup', icon: Terminal },
  { id: 'account' as Section, label: 'Account', icon: Layers },
];

const MORE_ADMIN_ITEMS = [
  { id: 'calendar' as Section, label: 'Calendar', icon: Calendar },
  { id: 'email' as Section, label: 'Email Triage', icon: Mail },
];

function MobileBottomNav({ active, onNav, isAdmin, user, onSignOut }: {
  active: Section;
  onNav: (s: Section) => void;
  isAdmin: boolean;
  user: UserInfo | null;
  onSignOut: () => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const tierLabel = user?.tier ? (TIER_INFO[user.tier]?.label || user.tier) : null;

  return (
    <>
      {/* More bottom sheet */}
      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
              onClick={() => setMoreOpen(false)}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="lg:hidden fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t border-border bg-surface"
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-border" />
              </div>
              <nav className="px-4 pb-8 pt-2">
                <p className="text-micro mb-3 px-1">Platform</p>
                {MORE_ITEMS.map(item => {
                  const Icon = item.icon;
                  return (
                    <button key={item.id} onClick={() => { onNav(item.id); setMoreOpen(false); }}
                      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors mb-1 ${
                        active === item.id ? 'bg-amber/10 text-amber' : 'text-text-secondary hover:bg-surface-elevated'
                      }`}>
                      <Icon className="h-5 w-5" />
                      {item.label}
                    </button>
                  );
                })}

                {isAdmin && (
                  <>
                    <div className="flex items-center gap-2 mt-4 mb-2 px-1">
                      <p className="text-micro">Team</p>
                      <Lock className="h-3 w-3 text-amber/40" />
                    </div>
                    {MORE_ADMIN_ITEMS.map(item => {
                      const Icon = item.icon;
                      return (
                        <button key={item.id} onClick={() => { onNav(item.id); setMoreOpen(false); }}
                          className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors mb-1 ${
                            active === item.id ? 'bg-amber/10 text-amber' : 'text-text-secondary hover:bg-surface-elevated'
                          }`}>
                          <Icon className="h-5 w-5" />
                          {item.label}
                        </button>
                      );
                    })}
                  </>
                )}

                {/* Footer: user card + sign out */}
                <div className="mt-4 pt-4 border-t border-border">
                  {user && (
                    <div className="px-1 mb-2">
                      <p className="text-xs text-text-primary truncate" title={user.email}>{user.email}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {tierLabel && (
                          <span className="text-[10px] font-mono uppercase tracking-wider text-amber">
                            {tierLabel}
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-text-secondary/50">
                          {user.credits === -1 ? '\u221e' : user.credits} credits
                        </span>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => { setMoreOpen(false); onSignOut(); }}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-error hover:bg-error/10 transition-colors"
                  >
                    <LogOut className="h-5 w-5" />
                    Sign Out
                  </button>
                </div>
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom tab bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/90 backdrop-blur-lg pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around h-16">
          {MOBILE_TABS.map(tab => {
            const Icon = tab.icon;
            const isMore = tab.id === '_more';
            const isActive = isMore ? moreOpen : active === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (isMore) { setMoreOpen(!moreOpen); }
                  else { setMoreOpen(false); onNav(tab.id as Section); }
                }}
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                  tab.accent
                    ? 'text-amber'
                    : isActive ? 'text-amber' : 'text-text-secondary/60'
                }`}
              >
                {tab.accent ? (
                  <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-amber/15 border border-amber/30 -mt-1">
                    <Icon className="h-5 w-5" />
                  </div>
                ) : (
                  <Icon className="h-5 w-5" />
                )}
                <span className={`text-[10px] font-mono uppercase tracking-wider ${tab.accent ? '' : ''}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
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
        <div className="rounded-xl border border-border bg-surface/80 p-5 relative overflow-hidden group min-h-[104px]">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber/50 to-transparent" />
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-text-secondary">Total Contracts</p>
            <Layers className="h-3.5 w-3.5 text-text-secondary/40" />
          </div>
          <p className="text-2xl font-bold text-text-primary">{total}</p>
        </div>
        {user && (
          <div className="rounded-xl border border-border bg-surface/80 p-5 relative overflow-hidden min-h-[104px]">
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber/50 to-transparent" />
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-text-secondary">Credits</p>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber/10 text-amber border border-amber/20">{tierInfo?.label || user.tier}</span>
            </div>
            <p className="text-2xl font-bold text-text-primary">{user.credits === -1 ? '\u221e' : user.credits}</p>
            {tierInfo && <p className="text-[10px] text-text-secondary/50 mt-0.5">{tierInfo.limit} limit</p>}
          </div>
        )}
        <div className="rounded-xl border border-border bg-surface/80 p-5 relative overflow-hidden min-h-[104px]">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-success/50 to-transparent" />
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-text-secondary">Active</p>
            <ShieldCheck className="h-3.5 w-3.5 text-success/40" />
          </div>
          <p className="text-2xl font-bold text-success">{counts.active || 0}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface/80 p-5 relative overflow-hidden min-h-[104px]">
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
        {/* Mobile: grid without arrows */}
        <div className="grid grid-cols-4 gap-3 md:hidden">
          {stages.map((stage) => {
            const Icon = stage.icon;
            const count = counts[stage.key] || 0;
            return (
              <div key={stage.key} className="text-center">
                <div className={`mx-auto mb-1.5 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface-elevated ${stage.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <p className="text-xl font-bold font-mono text-text-primary">{count}</p>
                <p className="text-[9px] font-mono uppercase tracking-wider text-text-secondary mt-0.5 leading-tight">{stage.label}</p>
              </div>
            );
          })}
        </div>
        {/* Desktop: flex with arrows */}
        <div className="hidden md:flex items-center gap-4">
          {stages.map((stage, i) => {
            const Icon = stage.icon;
            const count = counts[stage.key] || 0;
            return (
              <div key={stage.key} className="flex items-center gap-4 flex-1">
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
  const [requireZkIdentity, setRequireZkIdentity] = useState(false);
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
      const body: Record<string, unknown> = { template_slug: selected.slug, parameters: params, ...(requireZkIdentity ? { require_zk_identity: true } : {}) };
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

            <div className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3">
              <button
                type="button"
                role="switch"
                aria-checked={requireZkIdentity}
                onClick={() => setRequireZkIdentity(v => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                  requireZkIdentity ? 'bg-amber' : 'bg-border'
                }`}
              >
                <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                  requireZkIdentity ? 'translate-x-[18px]' : 'translate-x-[2px]'
                } mt-[2px]`} />
              </button>
              <div>
                <p className="text-sm text-text-primary">Require ZK Identity Verification</p>
                <p className="text-xs text-text-secondary">Signers must verify identity via zero-knowledge proof before signing</p>
              </div>
            </div>

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
interface AmendmentProposal {
  id: string;
  proposer_wallet: string;
  diff_summary: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'escalated';
  approval_required_from: string;
  approved_by_wallet: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  expires_at: string | null;
  resulting_contract_id: string | null;
  created_at: string;
  proposed_visibility: 'private' | 'metadata_only' | 'public' | 'encrypted' | null;
}

function ContractDetail({ contract, apiKey, onBack, onRevoked }: {
  contract: ContractRow; apiKey: string; onBack: () => void; onRevoked: () => void;
}) {
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState('');
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [signatures, setSignatures] = useState<{ signer_wallet: string; signed_at: string; signature_level?: string }[]>([]);
  const [amendments, setAmendments] = useState<{ contract_id: string; status: string; sha256_hash: string }[]>([]);
  const [proposals, setProposals] = useState<AmendmentProposal[]>([]);
  const [proposalAction, setProposalAction] = useState<{ id: string; action: 'approving' | 'rejecting' } | null>(null);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [contractText, setContractText] = useState<{ human_readable: string; machine_readable: Record<string, unknown> } | null>(null);
  const [textLoading, setTextLoading] = useState(false);

  const refreshProposals = useCallback(() => {
    fetch(`/api/v1/contracts/${contract.contract_id}/amendments`)
      .then(r => r.json())
      .then(data => { if (data.proposals) setProposals(data.proposals); })
      .catch(() => {});
  }, [contract.contract_id]);

  useEffect(() => {
    // Fetch signatures and amendment chain
    fetch(`/api/v1/contracts/${contract.contract_id}/status`)
      .then(r => r.json())
      .then(data => {
        if (data.signatures) setSignatures(data.signatures);
        if (data.amendments) setAmendments(data.amendments);
      })
      .catch(() => {});
    refreshProposals();

    // Fetch full contract text for inline viewing
    setTextLoading(true);
    fetch(`/api/v1/contracts/${contract.contract_id}`, {
      headers: apiKey ? { 'X-API-Key': apiKey } : {},
    })
      .then(r => r.json())
      .then(data => {
        if (data.human_readable && data.machine_readable) {
          setContractText({ human_readable: data.human_readable, machine_readable: data.machine_readable });
        }
      })
      .catch(() => {})
      .finally(() => setTextLoading(false));
  }, [contract.contract_id, apiKey, refreshProposals]);

  async function handleApproveProposal(proposalId: string) {
    setProposalAction({ id: proposalId, action: 'approving' });
    setProposalError(null);
    try {
      const res = await fetch(`/api/v1/contracts/${contract.contract_id}/amendments/${proposalId}/approve`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) {
        setProposalError(json.message || 'Approval failed');
      } else {
        refreshProposals();
        onRevoked(); // reuse callback to refresh the outer contract list
      }
    } catch {
      setProposalError('Network error approving proposal');
    } finally {
      setProposalAction(null);
    }
  }

  async function handleRejectProposal(proposalId: string, reason?: string) {
    setProposalAction({ id: proposalId, action: 'rejecting' });
    setProposalError(null);
    try {
      const res = await fetch(`/api/v1/contracts/${contract.contract_id}/amendments/${proposalId}/reject`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || null }),
      });
      const json = await res.json();
      if (!res.ok) {
        setProposalError(json.message || 'Rejection failed');
      } else {
        refreshProposals();
      }
    } catch {
      setProposalError('Network error rejecting proposal');
    } finally {
      setProposalAction(null);
    }
  }

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
                  <span className="text-text-secondary">{new Date(sig.signed_at).toLocaleDateString()}</span>
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

      {/* Pending amendment proposals (Phase 2 bilateral governance) */}
      {proposals.length > 0 && (
        <div className="rounded-xl border border-amber/30 bg-amber/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Handshake className="h-4 w-4 text-amber" />
            <p className="text-micro">Amendment Proposals</p>
            <span className="ml-auto text-xs text-text-secondary">
              {proposals.filter(p => p.status === 'pending').length} pending · {proposals.length} total
            </span>
          </div>
          {proposalError && (
            <div className="mb-3 rounded-md border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
              {proposalError}
            </div>
          )}
          <div className="space-y-2">
            {proposals.map(p => (
              <div key={p.id} className="rounded-lg border border-border bg-surface-elevated p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-text-secondary">
                      {p.proposer_wallet.slice(0, 6)}...{p.proposer_wallet.slice(-4)}
                    </span>
                    <span className="text-text-secondary/40">→</span>
                    <span className="text-xs font-mono text-text-secondary">
                      {p.approval_required_from.slice(0, 6)}...{p.approval_required_from.slice(-4)}
                    </span>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                    p.status === 'pending' ? 'text-amber border border-amber/30' :
                    p.status === 'approved' ? 'text-emerald-400 border border-emerald-500/30' :
                    p.status === 'rejected' ? 'text-error border border-error/30' :
                    p.status === 'escalated' ? 'text-orange-400 border border-orange-500/30' :
                    'text-text-secondary border border-border'
                  }`}>
                    {p.status.toUpperCase()}
                  </span>
                </div>
                {p.diff_summary && (
                  <p className="text-xs text-text-secondary mb-2">{p.diff_summary}</p>
                )}
                {p.proposed_visibility && (
                  <div className="mb-2">
                    <span className="inline-flex items-center gap-1.5 rounded border border-amber/30 bg-amber/10 px-2 py-0.5 text-[11px] font-mono text-amber">
                      <Eye className="h-3 w-3" />
                      Visibility → {p.proposed_visibility}
                    </span>
                    {(p.proposed_visibility === 'private' || p.proposed_visibility === 'metadata_only') && (
                      <p className="mt-1 text-[10px] text-orange-400/80">
                        Note: Making a previously public contract private cannot recall cached or distributed copies.
                      </p>
                    )}
                  </div>
                )}
                <p className="text-[10px] text-text-secondary/60 font-mono">
                  Proposed {new Date(p.created_at).toLocaleString()}
                  {p.expires_at && p.status === 'pending' && (
                    <> · expires {new Date(p.expires_at).toLocaleDateString()}</>
                  )}
                </p>
                {p.status === 'pending' && (
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleApproveProposal(p.id)}
                      disabled={proposalAction?.id === p.id}
                      className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/15 disabled:opacity-50 transition-colors"
                    >
                      {proposalAction?.id === p.id && proposalAction.action === 'approving' ? 'Approving...' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRejectProposal(p.id)}
                      disabled={proposalAction?.id === p.id}
                      className="rounded-md border border-error/30 bg-error/5 px-3 py-1 text-xs text-error hover:bg-error/10 disabled:opacity-50 transition-colors"
                    >
                      {proposalAction?.id === p.id && proposalAction.action === 'rejecting' ? 'Rejecting...' : 'Reject'}
                    </button>
                    <span className="ml-auto text-[10px] text-text-secondary/60">
                      Requires signature from {p.approval_required_from.slice(0, 6)}...{p.approval_required_from.slice(-4)}
                    </span>
                  </div>
                )}
                {p.status === 'escalated' && (
                  <div className="mt-2 rounded border border-orange-500/30 bg-orange-500/5 p-2 text-[11px] text-orange-400">
                    EU AI Act Art. 14: Spending change exceeds the oversight threshold.
                    Human principal approval required directly.
                  </div>
                )}
                {p.status === 'rejected' && p.rejected_reason && (
                  <p className="mt-2 text-[11px] text-text-secondary/80">
                    Reason: <span className="text-text-secondary">{p.rejected_reason}</span>
                  </p>
                )}
                {p.status === 'approved' && p.resulting_contract_id && (
                  <p className="mt-2 text-[11px] text-emerald-400/80">
                    Resulted in new amendment contract
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inline contract viewer */}
      {textLoading && (
        <div className="rounded-xl border border-border bg-surface/80 p-8 text-center">
          <RefreshCw className="h-5 w-5 text-text-secondary/40 animate-spin mx-auto mb-2" />
          <p className="text-xs text-text-secondary">Loading contract text...</p>
        </div>
      )}
      {contractText && (
        <div className="space-y-3">
          <ExportButtons
            contractId={contract.contract_id}
            humanReadable={contractText.human_readable}
            machineReadable={contractText.machine_readable}
            sha256Hash={contract.sha256_hash}
          />
          <ContractViewer
            humanReadable={contractText.human_readable}
            machineReadable={contractText.machine_readable}
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Link href={`/reader/${contract.sha256_hash}`} target="_blank"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:border-amber/30 transition-colors">
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
// ─── Agent Console ─────────────────────────────────────
const API_ENDPOINTS = [
  { method: 'GET', path: '/api/v1/templates', desc: 'List templates', auth: 'none', body: false },
  { method: 'GET', path: '/api/v1/contracts', desc: 'List your contracts', auth: 'key', body: false },
  { method: 'POST', path: '/api/v1/contracts', desc: 'Create contract', auth: 'key', body: true,
    defaultBody: '{\n  "template": "d1-general-auth",\n  "parameters": {\n    "principal_name": "Acme Corp",\n    "agent_name": "ProcureBot AI",\n    "scope": "procurement up to $10,000",\n    "duration": "90 days"\n  },\n  "principal_declaration": {\n    "agent_id": "0x...",\n    "principal_name": "Acme Corp",\n    "principal_type": "company"\n  }\n}' },
  { method: 'GET', path: '/api/v1/contracts/{id}/status', desc: 'Contract status', auth: 'none', body: false },
  { method: 'POST', path: '/api/v1/contracts/{id}/revoke', desc: 'Revoke contract', auth: 'key', body: true, defaultBody: '{\n  "reason": "Agent authorization withdrawn"\n}' },
  { method: 'POST', path: '/api/v1/contracts/{id}/approve', desc: 'Approve (threshold)', auth: 'key', body: true, defaultBody: '{}' },
  { method: 'POST', path: '/api/v1/keys', desc: 'Activate API key', auth: 'none', body: true, defaultBody: '{\n  "email": "you@company.com",\n  "tier": "developer"\n}' },
];

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  POST: 'text-amber bg-amber/10 border-amber/30',
};

function AgentSetup({ apiKeyPrefix, apiKey }: { apiKeyPrefix: string; apiKey: string }) {
  const [tab, setTab] = useState<'playground' | 'config' | 'pricing'>('playground');
  const [copied, setCopied] = useState('');
  const [selectedEndpoint, setSelectedEndpoint] = useState(API_ENDPOINTS[0]);
  const [pathParam, setPathParam] = useState('');
  const [reqBody, setReqBody] = useState('');
  const [response, setResponse] = useState<{ status: number; body: string; time: number } | null>(null);
  const [loading, setLoading] = useState(false);

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text); setCopied(id);
    setTimeout(() => setCopied(''), 2000);
  }

  async function sendRequest() {
    setLoading(true); setResponse(null);
    const start = Date.now();
    try {
      let url = selectedEndpoint.path;
      if (url.includes('{id}') && pathParam) url = url.replace('{id}', pathParam);

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (selectedEndpoint.auth === 'key' && apiKey) headers['X-API-Key'] = apiKey;

      const res = await fetch(url, {
        method: selectedEndpoint.method,
        headers,
        ...(selectedEndpoint.body && reqBody ? { body: reqBody } : {}),
      });
      const text = await res.text();
      let formatted: string;
      try { formatted = JSON.stringify(JSON.parse(text), null, 2); } catch { formatted = text; }
      setResponse({ status: res.status, body: formatted, time: Date.now() - start });
    } catch (err) {
      setResponse({ status: 0, body: `Network error: ${err}`, time: Date.now() - start });
    } finally { setLoading(false); }
  }

  const mcpConfig = `{
  "mcpServers": {
    "ambr": {
      "url": "https://getamber.dev/api/v1/mcp",
      "headers": { "X-API-Key": "${apiKeyPrefix}..." }
    }
  }
}`;

  const tabs = [
    { id: 'playground' as const, label: 'API Playground' },
    { id: 'config' as const, label: 'Config' },
    { id: 'pricing' as const, label: 'x402 Calculator' },
  ];

  return (
    <div className="space-y-5">
      {/* Tab switcher */}
      <div className="flex gap-1 rounded-xl border border-border bg-surface/80 p-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 rounded-lg py-2 text-xs font-mono uppercase tracking-wider transition-colors ${
              tab === t.id ? 'bg-amber/15 text-amber border border-amber/30' : 'text-text-secondary hover:text-text-primary'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'playground' && (
        <div className="space-y-4">
          {/* Endpoint selector */}
          <div className="rounded-xl border border-border bg-surface/80 p-5">
            <p className="text-micro mb-3">Endpoint</p>
            <div className="space-y-1.5">
              {API_ENDPOINTS.map((ep, i) => (
                <button key={i} onClick={() => { setSelectedEndpoint(ep); setReqBody(ep.defaultBody || ''); setResponse(null); setPathParam(''); }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                    selectedEndpoint === ep ? 'bg-amber/5 border border-amber/20' : 'hover:bg-surface-elevated border border-transparent'
                  }`}>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${METHOD_COLORS[ep.method]}`}>{ep.method}</span>
                  <span className="text-xs font-mono text-text-primary flex-1">{ep.path}</span>
                  <span className="text-[10px] text-text-secondary hidden sm:block">{ep.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Request builder */}
          <div className="rounded-xl border border-border bg-surface/80 p-5">
            <div className="flex items-center gap-3 mb-4">
              <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded border ${METHOD_COLORS[selectedEndpoint.method]}`}>{selectedEndpoint.method}</span>
              <span className="text-sm font-mono text-text-primary">{selectedEndpoint.path}</span>
              {selectedEndpoint.auth === 'key' && <span className="text-[10px] px-2 py-0.5 rounded bg-amber/10 text-amber border border-amber/30">API Key</span>}
            </div>

            {selectedEndpoint.path.includes('{id}') && (
              <div className="mb-3">
                <label className="text-xs text-text-secondary mb-1 block">Contract ID or Hash</label>
                <input type="text" value={pathParam} onChange={e => setPathParam(e.target.value)}
                  placeholder="amb-2026-0001 or SHA-256 hash"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-amber/50" />
              </div>
            )}

            {selectedEndpoint.body && (
              <div className="mb-3">
                <label className="text-xs text-text-secondary mb-1 block">Request Body (JSON)</label>
                <textarea value={reqBody} onChange={e => setReqBody(e.target.value)} rows={8}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-amber/50 resize-y" />
              </div>
            )}

            <button onClick={sendRequest} disabled={loading || (selectedEndpoint.path.includes('{id}') && !pathParam)}
              className="rounded-lg bg-gradient-to-r from-amber to-amber-dark px-5 py-2.5 text-sm font-medium text-background hover:from-amber-light hover:to-amber transition-all disabled:opacity-50">
              {loading ? 'Sending...' : 'Send Request'}
            </button>
          </div>

          {/* Response */}
          {response && (
            <div className="rounded-xl border border-border bg-surface/80 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-mono font-bold ${response.status >= 200 && response.status < 300 ? 'text-success' : response.status >= 400 ? 'text-error' : 'text-yellow-400'}`}>
                    {response.status || 'ERR'}
                  </span>
                  <span className="text-xs text-text-secondary">{response.time}ms</span>
                </div>
                <button onClick={() => copy(response.body, 'response')}
                  className="rounded-md border border-border bg-surface-elevated p-1.5 text-text-secondary hover:text-amber transition-colors">
                  {copied === 'response' ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <pre className="p-4 text-xs font-mono text-text-secondary overflow-x-auto max-h-80 overflow-y-auto">{response.body}</pre>
            </div>
          )}
        </div>
      )}

      {tab === 'config' && (
        <div className="space-y-5">
          {[
            { id: 'mcp', title: 'MCP Server', desc: 'Add to Claude Desktop, Cursor, or any MCP client:', code: mcpConfig },
            { id: 'a2a', title: 'Agent Discovery (A2A)', desc: 'Ambr is discoverable via:', code: 'https://getamber.dev/.well-known/agent.json' },
            { id: 'x402', title: 'x402 Pay-per-Contract', desc: 'No API key needed. Include payment tx hash:', code: `curl -X POST https://getamber.dev/api/v1/contracts \\\n  -H "X-Payment: 0xYOUR_TX_HASH" \\\n  -H "Content-Type: application/json" \\\n  -d '{ "template": "d1-general-auth", ... }'` },
          ].map(b => (
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
      )}

      {tab === 'pricing' && <X402Calculator />}
    </div>
  );
}

function X402Calculator() {
  const [contractType, setContractType] = useState<'delegation' | 'commerce' | 'fleet'>('delegation');
  const [count, setCount] = useState(10);

  const prices = { delegation: 0.50, commerce: 1.00, fleet: 2.50 };
  const price = prices[contractType];
  const total = price * count;

  const tierComparison = [
    { tier: 'x402 (pay-per-use)', cost: total, note: `${count} contracts` },
    { tier: 'Developer (free)', cost: 0, note: '25/mo included' },
    { tier: 'Startup ($49/mo)', cost: 49, note: `200/mo, overage $0.35` },
    { tier: 'Scale ($199/mo)', cost: 199, note: `1,000/mo, overage $0.25` },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-surface/80 p-5">
        <p className="text-micro mb-4">x402 Cost Calculator</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">Contract Type</label>
            <div className="space-y-1.5">
              {([['delegation', 'Delegation (d-series)', '$0.50'], ['commerce', 'Commerce (c-series)', '$1.00'], ['fleet', 'Fleet Auth (d3)', '$2.50']] as const).map(([val, label, price]) => (
                <button key={val} onClick={() => setContractType(val)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors border ${
                    contractType === val ? 'border-amber/30 bg-amber/5 text-text-primary' : 'border-border text-text-secondary hover:border-amber/20'
                  }`}>
                  <span>{label}</span>
                  <span className="font-mono text-amber">{price}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">Monthly Volume</label>
            <input type="number" value={count} onChange={e => setCount(Math.max(1, parseInt(e.target.value) || 1))} min={1}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-amber/50 mb-3" />
            <div className="rounded-lg bg-amber/5 border border-amber/20 p-4 text-center">
              <p className="text-xs text-text-secondary mb-1">Estimated Monthly Cost</p>
              <p className="text-3xl font-bold font-mono text-amber">${total.toFixed(2)}</p>
              <p className="text-xs text-text-secondary mt-1">{count} x ${price.toFixed(2)}/contract</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface/80 p-5">
        <p className="text-micro mb-3">Compare with API Key Tiers</p>
        <div className="space-y-2">
          {tierComparison.map(t => (
            <div key={t.tier} className={`flex items-center justify-between rounded-lg px-4 py-3 border ${
              t.cost <= total && t.tier !== 'x402 (pay-per-use)' ? 'border-success/30 bg-success/5' : 'border-border'
            }`}>
              <div>
                <p className="text-sm text-text-primary">{t.tier}</p>
                <p className="text-xs text-text-secondary">{t.note}</p>
              </div>
              <span className={`font-mono text-sm ${t.cost <= total && t.tier !== 'x402 (pay-per-use)' ? 'text-success' : 'text-text-primary'}`}>
                ${t.cost.toFixed(2)}{t.tier !== 'x402 (pay-per-use)' ? '/mo' : ''}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-text-secondary/50 mt-3">Tiers that cost less than x402 for your volume are highlighted in green.</p>
      </div>
    </div>
  );
}

// ─── Account ────────────────────────────────────────────
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

// ─── Wallet & NFTs Section ─────────────────────────────
const NFT_WALLET_STORAGE_KEY = 'ambr_nft_wallet';

function WalletSection({ contracts, walletAddress }: { contracts: ContractRow[]; walletAddress: string | null }) {
  // Lazy initializer: auth wallet prop wins, then persisted NFT wallet, then null.
  // This survives section navigation (component unmount/remount) and page reloads.
  const [wallet, setWallet] = useState<string | null>(() => {
    if (walletAddress) return walletAddress;
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(NFT_WALLET_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const walletProviders = useWalletProviders();

  // Persist/clear the NFT wallet in localStorage whenever it changes.
  // Disconnect (setWallet(null)) clears the stored value.
  // Dispatch custom event so the WalletStatusBar picks up same-tab changes.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (wallet) {
        localStorage.setItem(NFT_WALLET_STORAGE_KEY, wallet);
      } else {
        localStorage.removeItem(NFT_WALLET_STORAGE_KEY);
      }
      window.dispatchEvent(new Event('ambr-wallet-change'));
    } catch {
      // localStorage disabled (private browsing, quota exceeded) — non-critical
    }
  }, [wallet]);

  const nftContracts = contracts.filter(c => c.nft_mint_status === 'minted');
  const pendingMints = contracts.filter(c => c.nft_mint_status === 'pending');

  async function connectWallet(picked: EIP6963ProviderDetail) {
    setConnecting(true); setError('');
    try {
      const { BrowserProvider } = await import('ethers');
      const provider = new BrowserProvider(picked.provider);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      setWallet(address.toLowerCase());
    } catch (err) {
      if (!(err as Error).message?.includes('user rejected'))
        setError('Failed to connect wallet');
    } finally { setConnecting(false); }
  }

  return (
    <div className="space-y-6">
      {/* Wallet connection */}
      <div className="rounded-xl border border-border bg-surface/80 p-6">
        <p className="text-micro mb-4">Connected Wallet</p>
        {wallet ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-amber/15 flex items-center justify-center">
                  <Wallet className="h-4 w-4 text-amber" />
                </div>
                <div>
                  <p className="text-sm font-mono text-text-primary">{wallet.slice(0, 6)}...{wallet.slice(-4)}</p>
                  <p className="text-xs text-text-secondary">Base L2</p>
                </div>
              </div>
              <button onClick={() => setWallet(null)}
                className="text-xs text-text-secondary hover:text-text-primary transition-colors">
                Disconnect
              </button>
            </div>
            <div className="flex items-center gap-4 pt-2 border-t border-border">
              <div className="text-center flex-1">
                <p className="text-lg font-bold text-text-primary">{nftContracts.length}</p>
                <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">NFTs Minted</p>
              </div>
              <div className="text-center flex-1">
                <p className="text-lg font-bold text-text-primary">{contracts.filter(c => c.status === 'active').length}</p>
                <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">Active Contracts</p>
              </div>
              <div className="text-center flex-1">
                <p className="text-lg font-bold text-amber">{pendingMints.length}</p>
                <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">Pending Mint</p>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-xs text-text-secondary mb-3">Connect an Ethereum wallet on Base L2 to view your contract NFTs and link wallet delegation to your API key.</p>
            {error && <p className="text-xs text-error mb-3">{error}</p>}
            <WalletPicker providers={walletProviders} onPick={connectWallet} connecting={connecting} variant="amber" />
          </div>
        )}
      </div>

      {/* cNFT Contracts */}
      <div className="rounded-xl border border-border bg-surface/80 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Contract NFTs</h2>
          <span className="text-xs text-text-secondary/60">{nftContracts.length} minted</span>
        </div>
        {nftContracts.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Wallet className="h-8 w-8 text-text-secondary/30 mx-auto mb-3" />
            <p className="text-sm text-text-secondary">No contract NFTs yet</p>
            <p className="text-xs text-text-secondary/50 mt-1">When contracts are signed and activated, they are minted as ERC-721 NFTs on Base L2.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {nftContracts.map(c => {
              // Q2: "Novated" badge — the connected wallet is a current cNFT
              // holder, but it isn't the original signer stored in
              // nft_holder_wallet or nft_counterparty_wallet. That means the
              // token reached this wallet via approveTransfer() + transferFrom,
              // i.e. a bilateral novation.
              const walletLc = wallet?.toLowerCase() ?? null;
              const isOriginalHolder =
                walletLc != null &&
                (c.nft_holder_wallet?.toLowerCase() === walletLc ||
                  c.nft_counterparty_wallet?.toLowerCase() === walletLc);
              const isNovated = walletLc != null && !isOriginalHolder;
              return (
              <div key={c.contract_id} className="px-5 py-3.5">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-amber">{c.contract_id}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono text-emerald-400 border border-emerald-500/30">NFT</span>
                    {c.nft_counterparty_token_id != null && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-mono text-amber border border-amber/30"
                        title="Paired mint: both parties hold an NFT for this contract"
                      >
                        PAIRED
                      </span>
                    )}
                    {isNovated && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-mono text-orange-400 border border-orange-500/30"
                        title="This wallet is a current cNFT holder via a bilateral transfer (novation), not the original signer."
                      >
                        NOVATED
                      </span>
                    )}
                  </div>
                  <StatusBadge status={c.status} />
                </div>
                <p className="text-xs text-text-secondary/70 mb-2">{c.principal_declaration?.principal_name || 'Unknown'}</p>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-text-secondary">Hash: <span className="font-mono text-text-primary">{c.sha256_hash.slice(0, 16)}...</span></span>
                  <Link href={`/reader/${c.sha256_hash}`} className="text-amber hover:underline inline-flex items-center gap-1">
                    Reader <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pending mints */}
      {pendingMints.length > 0 && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <RefreshCw className="h-4 w-4 text-yellow-400 animate-spin" />
            <p className="text-sm font-medium text-yellow-400">Minting in Progress</p>
          </div>
          <div className="space-y-2">
            {pendingMints.map(c => (
              <div key={c.contract_id} className="flex items-center justify-between text-xs">
                <span className="font-mono text-text-primary">{c.contract_id}</span>
                <span className="text-text-secondary">{c.principal_declaration?.principal_name || 'Unknown'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Base L2 info */}
      <div className="rounded-xl border border-border bg-surface/80 p-5">
        <p className="text-micro mb-3">On-Chain Details</p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-text-secondary">Network</span>
            <span className="text-text-primary">Base L2 (Mainnet)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Token Standard</span>
            <span className="text-text-primary">ERC-721</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Transfer Model</span>
            <span className="text-text-primary">Counterparty-Gated</span>
          </div>
        </div>
        <p className="text-xs text-text-secondary/50 mt-3">Both holder and counterparty must approve before an NFT can be transferred. SHA-256 hash stored permanently on-chain.</p>
      </div>
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
  // mobileOpen removed — replaced by bottom tab bar
  const [selectedContract, setSelectedContract] = useState<ContractRow | null>(null);
  const walletProviders = useWalletProviders();

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

  async function handleWalletConnect(picked: EIP6963ProviderDetail) {
    setWalletLoading(true); setData(null);
    try {
      const { BrowserProvider } = await import('ethers');
      const provider = new BrowserProvider(picked.provider);
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
          <div className="lg:ml-56 px-4 py-6 sm:px-6 lg:px-10 xl:px-16 2xl:px-24 pt-20">
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
                <p className="text-xs text-text-secondary mb-4">Connect an Ethereum wallet to view signed contracts.</p>
                <WalletPicker providers={walletProviders} onPick={handleWalletConnect} connecting={walletLoading} variant="amber" />
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
            <DesktopSidebar active={section} onNav={setSection} isAdmin={isAdmin} user={data.user} onSignOut={handleSignOut} />
            <MobileBottomNav active={section} onNav={setSection} isAdmin={isAdmin} user={data.user} onSignOut={handleSignOut} />

            <div className="lg:ml-56 px-4 py-6 sm:px-6 lg:px-10 xl:px-16 2xl:px-24 pb-20 lg:pb-6">
              {/* Top bar */}
              <div className="flex items-center justify-between gap-2 mb-6 rounded-xl border border-border/50 bg-surface/80 px-4 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <Image src="/logo.png" alt="" width={18} height={18} className="rounded-sm shrink-0" />
                  <span className="text-sm text-text-secondary truncate">{data.user?.email || (data.wallet ? `${data.wallet.slice(0, 6)}...${data.wallet.slice(-4)}` : '')}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {data.user && (
                    <>
                      <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-amber/15 text-amber border border-amber/30 whitespace-nowrap">
                        {TIER_INFO[data.user.tier]?.label || data.user.tier}
                      </span>
                      <span className="text-xs font-mono text-text-secondary/60 whitespace-nowrap">
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
                  {section === 'wallet' && <WalletSection contracts={data.contracts} walletAddress={data.wallet} />}
                  {section === 'agents' && <AgentSetup apiKeyPrefix={data.user?.key_prefix || 'amb_***'} apiKey={apiKey} />}
                  {section === 'analytics' && <ContractAnalytics contracts={data.contracts} />}
                  {section === 'account' && <AccountSection user={data.user} wallet={data.wallet} authMethod={data.authMethod!} onSignOut={handleSignOut} />}

                  {/* Admin sections */}
                  {isAdmin && ['calendar', 'email', 'drafts'].includes(section) && (
                    <AdminSection
                      activeSection={section as 'calendar' | 'email' | 'drafts'}
                      currentUserEmail={data.user?.email}
                    />
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
