'use client';

import AmbrMark from '@/components/ui/AmbrMark';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers, FileText, Handshake, PenTool, ShieldCheck,
  Terminal, Wallet, BarChart3, ChevronRight, ChevronDown, LogOut, Menu, X,
  Calendar, Mail, Users, Lock, Copy, Check, ExternalLink,
  ArrowRight, Clock, Plus, RefreshCw, TrendingUp, Eye, Activity,
  KeyRound, Bot,
} from 'lucide-react';
import { isLei } from '@/lib/dacs/recipes';
import type { VerifyResult } from '@/lib/dacs/types';
import { AdminSection } from '@/components/dashboard/AdminSection';
import { BetaAccessSection } from '@/components/dashboard/BetaAccessSection';
import { TechHealthWidget } from '@/components/team/TechHealthWidget';
import { ContractAnalytics } from '@/components/dashboard/ContractAnalytics';
import { useWalletStatus } from '@/lib/wallet/use-wallet-status';
import ContractViewer from '@/app/(platform)/reader/[hashOrId]/ContractViewer';
import ExportButtons from '@/app/(platform)/reader/[hashOrId]/ExportButtons';
import ContractNftViewer from '@/components/contract/ContractNftViewer';
import AgentHandoff from '@/components/contract/AgentHandoff';
import { extractPartyNames } from '@/lib/contract/party-names';
import { useWalletProviders, type EIP6963ProviderDetail } from '@/lib/wallet/providers';
import WalletPicker from '@/components/wallet/WalletPicker';
import DeployChat, { ShareByEmail, ACTIVE_DRAFT_KEY } from '@/components/deploy/DeployChat';
import DraftsList from '@/components/deploy/DraftsList';
import { FREE_TIER_CREDITS, PACKS, TEAM, ENTERPRISE, formatUsd } from '@/lib/pricing';
import { listDrafts } from '@/lib/storage/indexed-db';
import AmbrAgentOverlay from '@/components/ambr-agent/AmbrAgentOverlay';
import BetaNotice from '@/components/dashboard/BetaNotice';

// ─── Types ──────────────────────────────────────────────
type AuthMethod = 'api_key' | 'wallet';
type Section = 'overview' | 'create' | 'contracts' | 'contract-detail' | 'wallet' | 'agents' | 'account' | 'analytics' | 'calendar' | 'email' | 'drafts' | 'my-drafts' | 'health' | 'beta-access';

interface UserInfo {
  email: string;
  tier: string;
  credits: number;
  key_prefix: string;
  beta_features?: { ai_chat?: boolean };
  api_key_id?: string;
  // Server-computed. The admin roster stays server-side; the browser is told
  // only about itself. Optional because older cached sessions predate them —
  // absent is treated as false, which fails closed.
  is_admin?: boolean;
  is_tech_admin?: boolean;
  // Opaque handle used by the team widgets instead of anyone's address.
  team_member_id?: string | null;
}
export interface ContractRow {
  contract_id: string; status: string; amendment_type: string; sha256_hash: string;
  created_at: string; updated_at: string | null; template_id: string;
  principal_declaration: { principal_name: string } | null;
  parameters: Record<string, unknown> | null;
  nft_mint_status: string | null;
  nft_token_id: number | null;
  nft_counterparty_token_id: number | null;
  nft_holder_wallet: string | null;
  nft_counterparty_wallet: string | null;
  nft_tx_hash: string | null;
  nft_counterparty_tx_hash: string | null;
  visibility: string | null;
  contract_type: string | null; payment_method: string | null;
  revoked_at: string | null; revoked_by: string | null; revocation_reason: string | null;
  expiry_date: string | null; parent_contract_hash: string | null;
  oversight_threshold_usd: number | null; principal_approval_required: boolean | null;
  // Fields used by the Phase B per-row role computation. Server already
  // returns them; previously they were filtered out at the interface level.
  principal_wallet: string | null;
  payer_wallet: string | null;
  api_key_id: string | null;
  // P2 one-sided flag — true for unilateral contracts (Power of Attorney).
  // Default false for bilateral templates. Used by Analytics to break out
  // one-sided vs bilateral deploys without re-joining templates.
  is_one_sided: boolean | null;
  // Flattened template join (dashboard route enriches the response with
  // templates.slug + templates.category for Analytics' category breakdown).
  template_slug: string | null;
  template_category: string | null;
  // Aggregated signature count from the signatures table — for Analytics'
  // signature-flow metrics + per-row signed-by-N display.
  signature_count: number | null;
}

/** Per-contract role for the current user (Phase B). */
export type ContractRole =
  | 'principal'        // your wallet is principal_wallet
  | 'counterparty'     // your wallet is nft_counterparty_wallet
  | 'nft_holder'       // your wallet currently holds the NFT (post-transfer)
  | 'payer'            // your wallet paid (x402)
  | 'deployer-only'    // your account deployed it but no wallet of yours is on-chain
  | 'none';            // none of your wallets touch it (shouldn't happen in the union query)

/**
 * Compute the user's role for a single contract. Uses the bound wallet set
 * + the user's api_key_id. Wallet match takes precedence over deployer-only
 * because it's the stronger on-chain link.
 */
export function computeContractRole(
  c: ContractRow,
  boundWallets: string[],
  apiKeyId: string | null,
): ContractRole {
  const set = new Set(boundWallets.map((w) => w.toLowerCase()));
  if (c.principal_wallet && set.has(c.principal_wallet.toLowerCase())) return 'principal';
  if (c.nft_holder_wallet && set.has(c.nft_holder_wallet.toLowerCase())) {
    // If the on-chain holder wallet matches but it's NOT the principal_wallet,
    // this is post-transfer (novation). Otherwise it's just the principal.
    if (c.principal_wallet?.toLowerCase() !== c.nft_holder_wallet.toLowerCase()) return 'nft_holder';
    return 'principal';
  }
  if (c.nft_counterparty_wallet && set.has(c.nft_counterparty_wallet.toLowerCase())) return 'counterparty';
  if (c.payer_wallet && set.has(c.payer_wallet.toLowerCase())) return 'payer';
  if (apiKeyId && c.api_key_id === apiKeyId) return 'deployer-only';
  return 'none';
}
interface TemplateRow {
  slug: string; name: string; description: string; category: string;
  parameter_schema: Record<string, unknown>; price_cents: number; version: number;
}
interface DashboardState {
  user: UserInfo | null; contracts: ContractRow[]; wallet: string | null;
  // Phase B: all wallets bound to this account. Used to compute per-contract
  // role badges and power the "Just my current wallet" filter chip locally.
  bound_wallets: string[];
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
// MUST cover every status in the contracts CHECK constraint
// (`20260311000000_schema_v2.sql`):
//   draft, handshake, pending_signature, active, amended, fulfilled,
//   disputed, terminated, expired, revoked, awaiting_principal_approval.
// Missing entries fall back to the draft style (gray pill) — not a crash,
// but the visual loses meaning. Audit this dict whenever the schema's
// status enum changes.
const STATUS_STYLES: Record<string, string> = {
  active: 'text-success border-success/40 bg-success/10',
  amended: 'text-amber border-amber/40 bg-amber/10',
  draft: 'text-text-secondary border-border bg-surface-elevated',
  handshake: 'text-amber border-amber/40 bg-amber/10',
  pending_signature: 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10',
  awaiting_principal_approval: 'text-orange-400 border-orange-500/40 bg-orange-500/10',
  // fulfilled: contract reached its terminal "completed normally" state.
  fulfilled: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
  // disputed: an open dispute is on the contract (rare today; reserves
  // future styling so the badge doesn't fall through to gray).
  disputed: 'text-orange-400 border-orange-500/40 bg-orange-500/10',
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
  developer: { label: 'Developer', limit: `${FREE_TIER_CREDITS} credits, once`, overage: 'Buy a pack' },
  startup: { label: PACKS[0].label, limit: `${PACKS[0].credits.toLocaleString('en-US')} credits, one-off`, overage: 'Buy a pack' },
  scale: { label: PACKS[1].label, limit: `${PACKS[1].credits.toLocaleString('en-US')} credits, one-off`, overage: 'Buy a pack' },
  business: { label: TEAM.label, limit: `${TEAM.credits_per_month.toLocaleString('en-US')} credits/mo`, overage: 'Buy a pack' },
  enterprise: { label: ENTERPRISE.label, limit: `${ENTERPRISE.credits.toLocaleString('en-US')} credits/yr`, overage: 'Buy a pack' },
  alpha: { label: 'Alpha (legacy)', limit: '5 total', overage: 'N/A' },
};

// ─── Sidebar ────────────────────────────────────────────
const NAV_SECTIONS = [
  {
    title: 'Contracts',
    items: [
      { id: 'overview' as Section, label: 'Pipeline Overview', icon: BarChart3 },
      { id: 'create' as Section, label: 'Create Contract', icon: Plus },
      { id: 'my-drafts' as Section, label: 'Drafts', icon: Clock },
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
      { id: 'health' as Section, label: 'System Health', icon: Activity },
      { id: 'beta-access' as Section, label: 'Beta Access', icon: KeyRound },
    ],
  },
];

function SidebarWalletCard({ serverBoundWallet, onRebound }: { serverBoundWallet?: string | null; onRebound?: () => void }) {
  const { wallet, nftCount, pendingActions, hasZkIdentity, disconnect, preferredProvider, providers, setPreferredProvider, requestAccount } = useWalletStatus();
  // Rebind state — surfaces to the warning row's "Bind to my account" button.
  // 'idle' shows the button; 'signing' shows a spinner; 'success' briefly
  // shows ✓ before resetting; 'error' shows the message inline so the user
  // knows what to retry.
  const [rebindState, setRebindState] = useState<'idle' | 'signing' | 'success' | 'error'>('idle');
  const [rebindError, setRebindError] = useState<string | null>(null);
  // Picker dropdown state (Fix #2). Toggled by clicking the wallet address.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerConnecting, setPickerConnecting] = useState(false);

  if (!wallet) return null;

  // Sign + POST /api/v1/dashboard/wallet-auth to bind the live wallet to the
  // current account. Server verifies the signature and upserts account_wallets.
  // After success, reloads dashboard data via onRebound() so data.wallet
  // refreshes and the mismatch warning disappears.
  async function rebindToAccount() {
    if (!preferredProvider || !wallet) return;
    setRebindState('signing');
    setRebindError(null);
    try {
      const eth = preferredProvider.provider as unknown as { request: (a: { method: string; params?: unknown }) => Promise<unknown> };
      const message = `Bind wallet ${wallet} to my Ambr account · ${new Date().toISOString()}`;
      const signature = (await eth.request({
        method: 'personal_sign',
        params: [message, wallet],
      })) as string;
      const res = await fetch('/api/v1/dashboard/wallet-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: wallet, signature, message }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.message ?? `Bind failed (${res.status})`);
      }
      setRebindState('success');
      onRebound?.();
      // Reset back to idle after a moment so a subsequent wallet switch
      // can trigger another bind without a page refresh.
      setTimeout(() => setRebindState('idle'), 2500);
    } catch (err) {
      const msg = (err as Error)?.message ?? 'Sign cancelled';
      // User-rejected signature → quiet idle; anything else → show error.
      if (msg.toLowerCase().includes('user reject') || msg.toLowerCase().includes('user denied')) {
        setRebindState('idle');
      } else {
        setRebindError(msg.slice(0, 80));
        setRebindState('error');
      }
    }
  }

  // Wallet picker — same flow as WalletSection.connectWallet but bound to the
  // sidebar dropdown. Switches the active provider AND triggers an account
  // prompt so MetaMask/SafePal shows its account selector. The hook's
  // accountsChanged listener picks up the result and updates `wallet` for
  // everything that reads useWalletStatus.
  async function pickWallet(picked: EIP6963ProviderDetail) {
    setPickerConnecting(true);
    try {
      setPreferredProvider(picked.info.rdns);
      await new Promise((r) => setTimeout(r, 0));
      await requestAccount();
      setPickerOpen(false);
    } catch {
      // Silent — picker stays open so user can try again
    } finally {
      setPickerConnecting(false);
    }
  }

  const serverMismatch =
    serverBoundWallet && wallet && serverBoundWallet.toLowerCase() !== wallet.toLowerCase();

  return (
    <div className="shrink-0 border-t border-border px-3 py-3 relative">
      <div className="rounded-lg border border-border/50 bg-surface/50 p-2.5">
        {/* SIGNING WALLET LABEL — the most important thing to communicate.
            Answers the user's question "which wallet will my next contract
            actually sign with?" at first glance, every time. Per user
            feedback 2026-05-26: clients need certainty about which wallet
            is active for contracting — no buried info. */}
        <p className="text-[8px] font-mono uppercase tracking-wider text-amber/70 mb-1.5">
          Signing wallet
        </p>

        {/* Wallet picker trigger — provider name + address. Clickable when
            2+ providers; opens a dropdown to switch. Includes the wallet
            extension name (MetaMask / SafePal) prominently so the user can
            cross-check against the extension popup. */}
        <div className="flex items-center justify-between mb-1">
          <button
            type="button"
            onClick={() => providers.length > 1 && setPickerOpen((o) => !o)}
            disabled={providers.length <= 1}
            className={`flex items-center gap-1.5 min-w-0 -ml-0.5 px-0.5 py-0.5 rounded ${providers.length > 1 ? 'hover:bg-amber/10 cursor-pointer' : 'cursor-default'} transition-colors`}
            title={providers.length > 1 ? `${providers.length} wallets connected. Click to switch which signs.` : `Connected: ${preferredProvider?.info.name ?? 'Wallet'}`}
          >
            <span
              className="w-[5px] h-[5px] rounded-full bg-emerald-500 shrink-0"
              style={{ boxShadow: '0 0 4px rgba(52,211,153,0.4)' }}
            />
            {preferredProvider?.info.icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preferredProvider.info.icon} alt="" className="w-3 h-3 shrink-0" />
            ) : null}
            <span className="text-[10px] font-medium text-text-primary truncate">
              {preferredProvider?.info.name ?? 'Wallet'}
            </span>
            <span className="text-[10px] font-mono text-text-secondary truncate">
              {wallet.slice(0, 6)}...{wallet.slice(-4)}
            </span>
            {providers.length > 1 && (
              <ChevronDown className={`w-2.5 h-2.5 text-text-secondary/50 shrink-0 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
            )}
          </button>
          <span className="flex items-center gap-1.5 shrink-0">
            <span className={`inline-flex items-center gap-0.5 px-1 border rounded text-[8px] shrink-0 ${
              hasZkIdentity
                ? 'border-amber/25 bg-amber/[0.06] text-amber'
                : 'border-border bg-surface text-text-secondary/50'
            }`}>
              <img src="/demos-logo.svg" alt="" className={`w-2 h-2 ${hasZkIdentity ? 'opacity-70' : 'opacity-30'}`} />
              {hasZkIdentity ? 'ZK' : 'Link ZK'}
            </span>
            <button
              onClick={disconnect}
              className="text-text-secondary/40 hover:text-text-primary transition-colors cursor-pointer p-0.5"
              title="Disconnect"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        </div>

        {/* Explicit reassurance — answers "is THIS the wallet that will sign?"
            instead of leaving the user to infer from the visual hierarchy. */}
        <p className="text-[9px] text-text-secondary/70 mb-2 leading-tight">
          Your next contract will sign with this wallet.
        </p>

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

        {/* "Also linked to your account" — reframed from the previous "Server
            has X bound" warning. The old wording sounded like Ambr was doing
            something to the user; the reality is just that account_wallets
            has a historical record from when this wallet last authenticated.
            New positioning: not a problem, just informational about which
            OLDER wallets your dashboard knows to look up. Adding the live
            wallet here too is a positive action ("link this one as well"),
            not a corrective action. */}
        {serverMismatch && (
          <div
            className="mt-2 pt-2 border-t border-border/30 text-[9px] leading-tight"
            title={`Your account has a historical link to ${serverBoundWallet} from a prior session. Older contracts you deployed with that wallet remain visible on the dashboard, but new contracts will be signed by the SIGNING WALLET above. Click "Add this wallet too" to also link ${wallet}.`}
          >
            <p className="text-text-secondary/60 font-mono">
              Also linked to your account
            </p>
            <p className="text-text-secondary mt-0.5 font-mono">
              {serverBoundWallet!.slice(0, 6)}…{serverBoundWallet!.slice(-4)}
              <span className="text-text-secondary/50 ml-1">(older — read-only)</span>
            </p>
            <div className="mt-1.5">
              {rebindState === 'success' ? (
                <span className="inline-flex items-center gap-1 text-[9px] text-emerald-400 px-1.5 py-0.5">
                  <Check className="w-2.5 h-2.5" />
                  Linked to your account
                </span>
              ) : (
                <button
                  type="button"
                  onClick={rebindToAccount}
                  disabled={rebindState === 'signing'}
                  className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border border-amber/40 bg-amber/10 text-amber hover:bg-amber/20 disabled:opacity-50 disabled:cursor-wait transition-colors"
                  title={`Sign a message to add ${wallet.slice(0, 6)}…${wallet.slice(-4)} as another wallet linked to your account. This is additive — your older wallet stays linked too.`}
                >
                  {rebindState === 'signing' ? (
                    <>
                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                      <span>Awaiting signature…</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-2.5 h-2.5" />
                      <span>Add {wallet.slice(0, 6)}…{wallet.slice(-4)} too</span>
                    </>
                  )}
                </button>
              )}
              {rebindState === 'error' && rebindError && (
                <p className="text-[8px] text-error mt-0.5 leading-tight" title={rebindError}>
                  {rebindError}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Wallet picker dropdown — shown when user clicks the wallet address.
          Lists all EIP-6963-announced providers so they can switch active
          wallet without leaving the page. Positioned absolutely above the
          card so it floats over surrounding content. */}
      {pickerOpen && providers.length > 1 && (
        <div
          className="absolute left-3 right-3 bottom-full mb-1 z-50 rounded-lg border border-border bg-surface-elevated shadow-2xl p-2"
          role="menu"
        >
          <p className="text-[9px] font-mono text-text-secondary uppercase tracking-wider mb-1.5 px-1">
            Switch wallet
          </p>
          <div className="space-y-1">
            {providers.map((p) => {
              const isActive = p.info.rdns === preferredProvider?.info.rdns;
              return (
                <button
                  key={p.info.uuid}
                  type="button"
                  onClick={() => pickWallet(p)}
                  disabled={pickerConnecting}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[10px] text-left transition-colors ${
                    isActive
                      ? 'bg-amber/15 border border-amber/30 text-amber'
                      : 'border border-transparent text-text-primary hover:bg-surface hover:border-border'
                  } disabled:opacity-50`}
                >
                  {p.info.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.info.icon} alt="" className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <span className="w-3.5 h-3.5 rounded bg-amber/20 shrink-0" />
                  )}
                  <span className="flex-1 truncate">{p.info.name}</span>
                  {isActive && <span className="text-[8px] uppercase font-mono">active</span>}
                </button>
              );
            })}
          </div>
          <p className="text-[8px] text-text-secondary/60 mt-1.5 px-1 leading-tight">
            Switching prompts {preferredProvider?.info.name ?? 'the wallet'} to share an account. Use &ldquo;Bind to account&rdquo; below afterwards to update the server.
          </p>
        </div>
      )}
    </div>
  );
}

function DesktopSidebar({ active, onNav, isAdmin, user, onSignOut, serverBoundWallet, onRebound }: {
  active: Section;
  onNav: (s: Section) => void;
  isAdmin: boolean;
  user: UserInfo | null;
  onSignOut: () => void;
  /** Wallet bound to the account on the server (from /api/v1/dashboard data.wallet).
   *  Passed through to SidebarWalletCard so it can warn when the live wallet
   *  (what useWalletStatus reports) differs from what the server has bound. */
  serverBoundWallet?: string | null;
  /** Called after a successful wallet-auth re-bind so the dashboard can
   *  refetch data.wallet from the server and the mismatch warning clears. */
  onRebound?: () => void;
}) {
  const tierLabel = user?.tier ? (TIER_INFO[user.tier]?.label || user.tier) : null;
  // Draft count for the Drafts nav-item badge — refreshes when the user
  // navigates between sections so the badge stays accurate after Resume /
  // Discard / new-draft actions in DeployChat or DraftsList. IndexedDB query
  // is fast (<5ms typical) so this is fine on every section change.
  const [draftCount, setDraftCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    listDrafts()
      .then((all) => { if (!cancelled) setDraftCount(all.length); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [active]);

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
                const showDraftBadge = item.id === 'my-drafts' && draftCount > 0;
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
                    <span className="flex-1 text-left">{item.label}</span>
                    {showDraftBadge && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber/15 text-amber border border-amber/30">
                        {draftCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Wallet status card */}
      <SidebarWalletCard serverBoundWallet={serverBoundWallet} onRebound={onRebound} />

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
  { id: 'my-drafts' as Section, label: 'Drafts', icon: Clock },
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
            <p className="text-2xl font-bold text-text-primary">{user.credits === -1 ? '\u221e' : user.credits}<span className="text-xs font-normal text-text-secondary ml-1.5">credits</span></p>
            {tierInfo && <p className="text-[10px] text-text-secondary/50 mt-0.5">{tierInfo.limit}</p>}
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
                    {c.is_one_sided && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono text-violet-400 border border-violet-500/30" title="Unilateral authorization — principal signs once, no counterparty required">DELEGATION</span>
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
interface ParamSpec { type?: string; description?: string; enum?: unknown[] }

// The API's rule for principal_declaration.agent_id (lib/validation/contract-schemas.ts).
const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

// Form values are strings; the API validates against the template's
// parameter_schema, so numbers and booleans have to leave as such.
function coerceParams(
  raw: Record<string, string>,
  props: Record<string, ParamSpec>,
): { values: Record<string, unknown>; errors: string[] } {
  const values: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const [key, spec] of Object.entries(props)) {
    const v = (raw[key] ?? '').trim();
    if (v === '') continue;
    if (spec.type === 'number' || spec.type === 'integer') {
      const n = Number(v);
      if (!Number.isFinite(n) || (spec.type === 'integer' && !Number.isInteger(n))) {
        errors.push(`${key.replace(/_/g, ' ')} must be ${spec.type === 'integer' ? 'a whole number' : 'a number'}`);
        continue;
      }
      values[key] = n;
    } else if (spec.type === 'boolean') {
      values[key] = v === 'true';
    } else if (Array.isArray(spec.enum)) {
      values[key] = spec.enum.find(o => String(o) === v) ?? v;
    } else {
      values[key] = v;
    }
  }
  return { values, errors };
}

// The contracts API answers 400 with `details` (zod issues); show them per field.
function formatApiError(json: Record<string, unknown>): string {
  // A provider outage carries the wait in seconds; show it as minutes.
  if (json.error === 'generation_unavailable' && Number.isFinite(Number(json.retry_after))) {
    const mins = Math.max(1, Math.ceil(Number(json.retry_after) / 60));
    return `Contract generation is temporarily unavailable. You have not been charged. Try again in ${mins} ${mins === 1 ? 'minute' : 'minutes'}.`;
  }
  const details = json.details;
  if (Array.isArray(details) && details.length > 0) {
    return details
      .map((d: { path?: unknown[]; message?: string }) => {
        const field = Array.isArray(d.path) ? d.path.map(String).join('.') : '';
        return field ? `${field}: ${d.message}` : String(d.message ?? '');
      })
      .join('; ');
  }
  return String(json.message || json.error || 'Failed to create');
}

function ContractBuilder({ apiKey }: { apiKey: string }) {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [selected, setSelected] = useState<TemplateRow | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [principal, setPrincipal] = useState({ agent_id: '', principal_name: '', principal_type: 'company' });
  // The wallet that signs as the principal. Not agent_id, which names the agent.
  const [principalWallet, setPrincipalWallet] = useState('');
  const [requireZkIdentity, setRequireZkIdentity] = useState(false);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<{ contract_id: string; sha256_hash: string; reader_url: string } | null>(null);
  const [error, setError] = useState('');
  const [templatesFailed, setTemplatesFailed] = useState(false);
  const [templatesReload, setTemplatesReload] = useState(0);

  useEffect(() => {
    // Show ONLY the offered on-pitch set in the playground (allowlist — matches
    // the deploy chat's chip set: P2 / D1 / A2A). Everything else stays usable
    // via the raw API but is not surfaced on human UI.
    const OFFERED = new Set(['p2-power-of-attorney', 'd1-general-auth', 'c3-task-execution']);
    setTemplatesFailed(false);
    fetch('/api/v1/templates')
      .then(r => {
        if (!r.ok) throw new Error(`templates ${r.status}`);
        return r.json();
      })
      .then(d => setTemplates((d.templates || []).filter((t: TemplateRow) => OFFERED.has(t.slug))))
      .catch(() => setTemplatesFailed(true));
  }, [templatesReload]);

  async function handleCreate() {
    if (!selected) return;
    if (!apiKey) {
      setError('Creating a contract needs an API key. Sign in with your key, or get one at /activate.');
      return;
    }
    setCreating(true); setError(''); setResult(null);
    try {
      const { values, errors } = coerceParams(params, paramProps);
      if (errors.length > 0) { setError(errors.join('; ')); return; }
      // Checked here, not left to the API: its error names
      // principal_declaration.agent_id, which this form hides whenever the
      // template's agent field supplies it.
      const agentId = agentBoxShown ? principal.agent_id.trim() : agentParamValue;
      if (!WALLET_RE.test(agentId)) {
        const field = agentBoxShown ? 'agent wallet address' : (agentParam ?? '').replace(/_/g, ' ');
        setError(`${field}: enter the agent's wallet address (0x followed by 40 hex characters)`);
        return;
      }
      const fromParam = (key: string | undefined, own: string) =>
        (key ? String(values[key] ?? '') : own).trim();
      const body: Record<string, unknown> = {
        template: selected.slug,
        parameters: values,
        principal_declaration: {
          agent_id: agentId,
          principal_name: fromParam(nameParam, principal.principal_name),
          // The template's types (corporation, llc, …) narrow to the declaration's two.
          principal_type: typeParam
            ? (values[typeParam] === 'individual' ? 'individual' : 'company')
            : principal.principal_type,
        },
        ...(principalWallet.trim() ? { principal_wallet: principalWallet.trim() } : {}),
        ...(requireZkIdentity ? { require_zk_identity: true } : {}),
      };
      const res = await fetch('/api/v1/contracts', {
        method: 'POST',
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setError(formatApiError(json)); return; }
      setResult({ contract_id: json.contract_id, sha256_hash: json.sha256_hash, reader_url: `https://getamber.dev/reader/${json.sha256_hash}` });
    } catch { setError('Network error'); }
    finally { setCreating(false); }
  }

  const paramProps = ((selected?.parameter_schema as { properties?: Record<string, ParamSpec> } | undefined)?.properties) || {};
  const paramFields = Object.entries(paramProps);
  // Declaration fields the template asks for too are entered once, in the template
  // field: parameters.agent_id (C3: requester_agent_id) is the wallet that signs, so
  // a second agent box could only ever disagree with it.
  const agentParam = ['agent_id', 'requester_agent_id'].find(k => k in paramProps);
  const nameParam = 'principal_name' in paramProps ? 'principal_name' : undefined;
  const typeParam = 'principal_type' in paramProps ? 'principal_type' : undefined;
  // That field may name the agent by a platform identifier instead, where the
  // template's description says so (D1 today; P2 and C3 define it as a wallet).
  // The declaration still needs the agent's wallet then, so its own box comes back.
  // A value that could still become an address ("0", or "0x" and up to 40 hex
  // characters) counts as a wallet being typed, so the box does not flash up.
  const agentParamValue = agentParam ? (params[agentParam] ?? '').trim() : '';
  const agentAllowsId = !!agentParam && /identifier/i.test(paramProps[agentParam]?.description ?? '');
  const agentBoxShown = !agentParam
    || (agentAllowsId && agentParamValue !== '' && !/^0(x[0-9a-f]{0,40})?$/i.test(agentParamValue));
  const enteredBelow = [nameParam && 'principal name', typeParam && 'principal type', !agentBoxShown && "the agent's wallet"]
    .filter(Boolean);
  const inputClass = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-amber/50';

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-surface/80 p-6">
        <p className="text-micro mb-4">Select Template</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map(t => (
            <button key={t.slug} onClick={() => { setSelected(t); setParams({}); setResult(null); setError(''); }}
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
          {templates.length === 0 && (templatesFailed ? (
            <p className="text-sm text-text-secondary col-span-2">
              Couldn&apos;t load templates.{' '}
              <button type="button" onClick={() => setTemplatesReload(n => n + 1)} className="text-amber hover:underline">Try again</button>
            </p>
          ) : (
            <p className="text-sm text-text-secondary col-span-2">Loading templates...</p>
          ))}
        </div>
      </div>

      {selected && (
        <div className="rounded-xl border border-border bg-surface/80 p-6">
          <p className="text-micro mb-4">Parameters for {selected.name}</p>
          <div className="space-y-4">
            <div className="space-y-4 rounded-lg border border-border bg-background p-4">
              <p className="text-xs font-medium text-text-primary">Principal declaration</p>
              {enteredBelow.length > 0 && (
                <p className="text-xs text-text-secondary/60">
                  Entered once, in the contract fields below: {enteredBelow.join(', ')}.
                </p>
              )}
              {!nameParam && (
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Principal name</label>
                  <input type="text" value={principal.principal_name}
                    onChange={e => setPrincipal(p => ({ ...p, principal_name: e.target.value }))}
                    placeholder="Legal name of the person or company" className={inputClass} />
                </div>
              )}
              {!typeParam && (
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Principal type</label>
                  <select value={principal.principal_type}
                    onChange={e => setPrincipal(p => ({ ...p, principal_type: e.target.value }))}
                    className={inputClass}>
                    <option value="company">Company</option>
                    <option value="individual">Individual</option>
                  </select>
                </div>
              )}
              {agentBoxShown && (
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Agent wallet address (the agent that acts for you)</label>
                  <input type="text" value={principal.agent_id}
                    onChange={e => setPrincipal(p => ({ ...p, agent_id: e.target.value }))}
                    placeholder="0x…" className={`${inputClass} font-mono`} />
                  {agentParam && (
                    <p className="text-xs text-text-secondary/60 mt-1">
                      The {agentParam.replace(/_/g, ' ')} field below names the agent without a wallet, so enter the agent&apos;s wallet here.
                    </p>
                  )}
                </div>
              )}
              <div>
                <label className="block text-xs text-text-secondary mb-1">Your signing wallet (principal) <span className="text-text-secondary/60">— optional</span></label>
                <input type="text" value={principalWallet}
                  onChange={e => setPrincipalWallet(e.target.value)}
                  placeholder="0x…" className={`${inputClass} font-mono`} />
                <p className="text-xs text-text-secondary/60 mt-1">
                  The wallet that signs this contract as the principal. Leave it empty to use your account&apos;s verified wallet, or this account&apos;s API key if it has none.
                </p>
              </div>
            </div>
            {paramFields.map(([key, schema]) => {
              const options = Array.isArray(schema.enum) ? schema.enum.map(String) : schema.type === 'boolean' ? ['true', 'false'] : null;
              return (
                <div key={key}>
                  <label className="block text-xs text-text-secondary mb-1 capitalize">{key.replace(/_/g, ' ')}</label>
                  {options ? (
                    <select value={params[key] || ''} onChange={e => setParams(p => ({ ...p, [key]: e.target.value }))}
                      className={inputClass}>
                      <option value="">Select…</option>
                      {options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      type={schema.type === 'number' || schema.type === 'integer' ? 'number' : 'text'}
                      step={schema.type === 'integer' ? 1 : 'any'}
                      value={params[key] || ''}
                      onChange={e => setParams(p => ({ ...p, [key]: e.target.value }))}
                      placeholder={schema.description || key}
                      className={inputClass}
                    />
                  )}
                </div>
              );
            })}
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
function ContractList({
  contracts, onSelectContract, currentWallet, boundWallets, apiKeyId,
}: {
  contracts: ContractRow[];
  onSelectContract?: (c: ContractRow) => void;
  currentWallet: string | null;
  boundWallets: string[];
  apiKeyId: string | null;
}) {
  const [filter, setFilter] = useState('all');
  // Phase B: 'all' = show every contract (account union with all bound wallets);
  // 'current_wallet' = narrow to contracts where currentWallet is a party.
  const [walletScope, setWalletScope] = useState<'all' | 'current_wallet'>('all');

  const currentWalletLc = currentWallet?.toLowerCase() ?? null;

  // Compute roles once per render
  const withRoles = contracts.map((c) => ({
    contract: c,
    role: computeContractRole(c, boundWallets, apiKeyId),
  }));

  let scoped = withRoles;
  if (walletScope === 'current_wallet' && currentWalletLc) {
    scoped = withRoles.filter(({ contract: c }) => {
      const cols: (string | null)[] = [
        c.principal_wallet, c.nft_holder_wallet, c.nft_counterparty_wallet, c.payer_wallet,
      ];
      return cols.some((w) => w?.toLowerCase() === currentWalletLc);
    });
  }

  const filtered = filter === 'all' ? scoped : scoped.filter(({ contract: c }) => c.status === filter);
  const statuses = ['all', 'draft', 'handshake', 'pending_signature', 'active', 'terminated', 'amended'];

  return (
    <div className="rounded-xl border border-border bg-surface/80 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">All Contracts</h2>
          <span className="text-xs text-text-secondary/60">
            {scoped.length}{walletScope === 'current_wallet' ? ' (current wallet)' : ' total'}
          </span>
        </div>
        {/* Wallet-scope chip (Phase B). Hidden when no current wallet to scope to. */}
        {currentWalletLc && (
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-[10px] uppercase tracking-wider text-text-secondary/50">Scope:</span>
            <button onClick={() => setWalletScope('all')}
              className={`text-xs px-3 py-1 rounded-md font-mono transition-colors ${
                walletScope === 'all' ? 'bg-amber/20 text-amber border border-amber/40' : 'bg-surface-elevated text-text-secondary border border-border hover:border-amber/30'
              }`}>
              All (account + all bound wallets)
            </button>
            <button onClick={() => setWalletScope('current_wallet')}
              className={`text-xs px-3 py-1 rounded-md font-mono transition-colors ${
                walletScope === 'current_wallet' ? 'bg-amber/20 text-amber border border-amber/40' : 'bg-surface-elevated text-text-secondary border border-border hover:border-amber/30'
              }`}>
              Just {currentWallet?.slice(0, 6)}…{currentWallet?.slice(-4)}
            </button>
          </div>
        )}
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
          <p className="text-sm text-text-secondary">
            {filter === 'all' && walletScope === 'all'
              ? 'No contracts yet.'
              : filter === 'all' && walletScope === 'current_wallet'
              ? 'No contracts where your current wallet is a party. Try the All scope.'
              : `No ${filter.replace('_', ' ')} contracts in this scope.`}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {filtered.map(({ contract: c, role }) => (
            <button key={c.contract_id} onClick={() => onSelectContract?.(c)}
              className="flex w-full items-center gap-4 px-5 py-3.5 hover:bg-amber/5 transition-colors text-left">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-sm font-mono text-amber">{c.contract_id}</span>
                  <StatusBadge status={c.status} />
                  {c.nft_mint_status === 'minted' && (
                    <span className="text-xs px-2 py-0.5 rounded-md font-mono text-emerald-400 border border-emerald-500/30">NFT</span>
                  )}
                  {c.revoked_at && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono text-error border border-error/30">REVOKED</span>
                  )}
                  {c.is_one_sided && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono text-violet-400 border border-violet-500/30" title="Unilateral authorization — principal signs once, no counterparty required">DELEGATION</span>
                  )}
                  <RoleBadge role={role} />
                </div>
                <p className="text-xs text-text-secondary/70 truncate">{c.principal_declaration?.principal_name || 'Unknown'}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-text-secondary">{new Date(c.created_at).toLocaleDateString()}</p>
                <p className="text-xs font-mono text-text-secondary/40">{c.sha256_hash?.slice(0, 16)}...</p>
              </div>
              <ChevronRight className="h-4 w-4 text-text-secondary/30 shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Small role chip rendered on each contract row in ContractList. */
function RoleBadge({ role }: { role: ContractRole }) {
  if (role === 'none') return null;
  const styles: Record<ContractRole, string> = {
    principal:       'text-amber-200 border-amber-400/40 bg-amber/10',
    counterparty:    'text-blue-300 border-blue-400/40 bg-blue-500/10',
    nft_holder:      'text-purple-300 border-purple-400/40 bg-purple-500/10',
    payer:           'text-cyan-300 border-cyan-400/40 bg-cyan-500/10',
    'deployer-only': 'text-text-secondary border-text-secondary/30 bg-text-secondary/5',
    none:            '',
  };
  const labels: Record<ContractRole, string> = {
    principal:       'Principal',
    counterparty:    'Counterparty',
    nft_holder:      'NFT holder',
    payer:           'Payer',
    'deployer-only': 'Deployed by you (no wallet match)',
    none:            '',
  };
  return (
    <span
      title={role === 'deployer-only'
        ? 'Your account deployed this contract, but the on-chain wallets are not in your bound wallet set. Connect the right wallet to import its NFT.'
        : undefined}
      className={`text-[10px] px-1.5 py-0.5 rounded font-mono border ${styles[role]}`}
    >
      {labels[role]}
    </span>
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

/**
 * The two expected signer parties for a BILATERAL contract, derived from the
 * contract's deploy parameters. Drives the per-party "signed / awaiting"
 * indicator. Field names mirror DeployChat's FIELD_BY_TEMPLATE +
 * AGENT_WALLET_FIELD_BY_TEMPLATE. Returns [] when the wallets can't be resolved
 * (the caller then falls back to the plain signature list). One-sided contracts
 * (P2) are intentionally excluded — they have a single signer.
 */
function expectedSignersFor(c: ContractRow): { role: string; wallet: string }[] {
  const p = c.parameters ?? {};
  const get = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : '');
  const PAIRS: Record<string, [string, string][]> = {
    'c3-task-execution': [['Requester agent', 'requester_agent_id'], ['Executor agent', 'executor_agent_id']],
    'a1-service-purchase': [['Buyer agent', 'consumer_agent_id'], ['Provider agent', 'provider_agent_id']],
    'd1-general-auth': [['Principal', 'principal_agent_id'], ['Agent', 'agent_id']],
    'c1-api-access': [['Buyer agent', 'buyer_agent_id'], ['Provider agent', 'provider_agent_id']],
  };
  const pairs = PAIRS[c.template_slug ?? ''] ?? [];
  return pairs
    .map(([role, field]) => ({ role, wallet: get(field) }))
    .filter((x) => /^0x[a-fA-F0-9]{40}$/.test(x.wallet));
}

/**
 * DACS-2 Vet — counterparty credential verification card. Shows for a company
 * party that carries an LEI-shaped registration number. Verifies against the
 * public GLEIF register via Demos DAHR and renders a decision badge. While the
 * live DAHR call is flag-gated off, the result is `indeterminate` ("Pending").
 */
function VerificationCard({ contractId, apiKey, role, identifier, partyName }: {
  contractId: string; apiKey: string; role: string; identifier: string; partyName?: string;
}) {
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/contracts/${contractId}/verify-party`, { headers: apiKey ? { 'X-API-Key': apiKey } : {} })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled) return;
        const v = d?.verifications?.[0]?.verify_result as VerifyResult | undefined;
        if (v) setResult(v);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [contractId, apiKey]);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/contracts/${contractId}/verify-party`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'X-API-Key': apiKey } : {}) },
        body: JSON.stringify({ party_role: role, scheme: 'lei', identifier }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.message || 'Verification failed');
      else setResult(json.verify_result as VerifyResult);
    } catch {
      setError('Network error during verification');
    } finally {
      setLoading(false);
    }
  }

  const decision = result?.decision;
  const legalName = (result?.data?.legalName as string | undefined) ?? undefined;
  const badge =
    decision === 'pass'
      ? { cls: 'text-success border-success/40 bg-success/10', icon: <ShieldCheck className="h-3.5 w-3.5" />, label: legalName ? `Verified against GLEIF — ${legalName}` : 'Verified against GLEIF' }
      : decision === 'fail'
      ? { cls: 'text-error border-error/40 bg-error/10', icon: <X className="h-3.5 w-3.5" />, label: 'Unverified' }
      : decision === 'indeterminate'
      ? { cls: 'text-amber border-amber/40 bg-amber/10', icon: <Clock className="h-3.5 w-3.5" />, label: 'Pending — live verification not yet enabled' }
      : decision === 'error'
      ? { cls: 'text-text-secondary border-border bg-surface-elevated', icon: <X className="h-3.5 w-3.5" />, label: 'Could not verify' }
      : null;

  return (
    <div className="rounded-xl border border-border bg-surface/80 p-5">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="h-4 w-4 text-amber" />
        <p className="text-micro">Counterparty verification</p>
      </div>
      <p className="text-xs text-text-secondary mb-3 leading-relaxed">
        Check {partyName ? <span className="text-text-primary">{partyName}</span> : 'this party'} against the public GLEIF register by LEI{' '}
        <span className="font-mono text-text-primary/70">{identifier}</span>, via Demos DAHR.
      </p>

      {badge && (
        <div className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs mb-3 ${badge.cls}`}>
          {badge.icon}
          <span>{badge.label}</span>
        </div>
      )}
      {result?.reason && decision !== 'pass' && (
        <p className="text-[11px] text-text-secondary/70 mb-3 leading-snug">{result.reason}</p>
      )}
      {error && <p className="text-[11px] text-error mb-3">{error}</p>}

      <button
        onClick={run}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-xs text-text-primary hover:border-amber/50 hover:bg-surface transition-colors disabled:opacity-60"
      >
        {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
        {result ? 'Re-verify against GLEIF' : 'Verify against GLEIF'}
      </button>
      <p className="mt-2 text-[10px] text-text-secondary/50 leading-snug">
        Recorded as a DACS VerifyResult. &ldquo;Verified against GLEIF&rdquo; reflects a registry match, not legal certification.
      </p>
    </div>
  );
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
  // Principal's share token for the reader URL, purpose 'deployer'. Generated on
  // mount so the dashboard's "Open in Reader" + "Sign Contract" links land the
  // deployer in the authorized view (Sign button visible) instead of the
  // metadata-only fallback. It never places its holder in the counterparty
  // slot, so a creator who signs from these links without the session key is
  // refused rather than seated on the wrong side. The /share endpoint requires
  // the same api_key_id as the contract creator — that's the correct
  // authorization model.
  const [principalToken, setPrincipalToken] = useState<string | null>(null);
  // The invite for the other party, behind "Copy share link". Minted on the
  // first click, so visiting this page creates no invite.
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteLinkBusy, setInviteLinkBusy] = useState(false);
  const [inviteLinkFailed, setInviteLinkFailed] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  // Scope-only share: a redacted link that shows the agent's authority + validity
  // but hides the parties' identities and the full contract text. Token minted
  // lazily on first click so we don't create one per page mount.
  const [scopeToken, setScopeToken] = useState<string | null>(null);
  const [scopeLinkCopied, setScopeLinkCopied] = useState(false);
  const [scopeLinkBusy, setScopeLinkBusy] = useState(false);

  const refreshProposals = useCallback(() => {
    fetch(`/api/v1/contracts/${contract.contract_id}/amendments`)
      .then(r => r.json())
      .then(data => { if (data.proposals) setProposals(data.proposals); })
      .catch(() => {});
  }, [contract.contract_id]);

  useEffect(() => {
    // Fetch signatures and amendment chain. Send the API key so the status
    // route recognises the owner and returns UNSTRIPPED signer wallets for
    // private contracts — needed for the per-party signed/awaiting indicator.
    fetch(`/api/v1/contracts/${contract.contract_id}/status`, {
      headers: apiKey ? { 'X-API-Key': apiKey } : {},
    })
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

    // Generate a principal-side share token (purpose 'deployer', no email sent).
    // We need this because the reader portal gates Sign UI on ?token= presence
    // and the deploy-time auto-token isn't fetched anywhere — so without this
    // the principal's "Open in Reader" link drops them into the metadata-only
    // fallback with no way to sign. One token per detail-page mount; it views
    // the contract and fills no slot, unlike the invite behind "Copy share link".
    if (apiKey) {
      fetch(`/api/v1/contracts/${contract.contract_id}/share`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose: 'deployer' }),
      })
        .then(r => r.json())
        .then(data => { if (data.token) setPrincipalToken(data.token); })
        .catch(() => {});
    }
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

  // Type-aware lifecycle. One-sided contracts (P2 Power of Attorney) go
  // draft → active directly — there is no counterparty handshake or second
  // signature, so showing those stages as completed is misleading. Bilateral
  // contracts keep the full 4-stage path.
  const stages = contract.is_one_sided
    ? [
        { key: 'draft', label: 'Created', icon: FileText },
        { key: 'active', label: 'Active', icon: ShieldCheck },
      ]
    : [
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

  // Article 14 approval. The wallet path is the real one: an API key proves only
  // that the caller holds a bearer token, which the agent also holds, so it
  // cannot evidence a human. The key path survives for accounts that have not
  // bound a wallet yet — the server refuses it once they have.
  async function handleApprove(mode: 'wallet' | 'api_key') {
    setApproving(true);
    setApproveError('');
    try {
      let payload: Record<string, string> = {};

      if (mode === 'wallet') {
        const injected = (window as unknown as { ethereum?: unknown }).ethereum;
        if (!injected) {
          setApproveError('No wallet detected in this browser. Use the API key option, or open the dashboard in a wallet-enabled browser.');
          return;
        }
        const { BrowserProvider } = await import('ethers');
        const provider = new BrowserProvider(injected as never);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        // The server requires the hash and an approval verb, so a login
        // signature cannot be replayed into an approval.
        const message = [
          `I approve Ambr contract ${contract.contract_id}`,
          '',
          `Contract SHA-256: ${contract.sha256_hash}`,
          '',
          `Timestamp: ${new Date().toISOString()}`,
        ].join('\n');
        const signature = await signer.signMessage(message);
        payload = { wallet_address: address, signature, message };
      }

      const res = await fetch(`/api/v1/contracts/${contract.contract_id}/approve`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { setApproveError(json.message || 'Approval failed'); return; }
      onRevoked(); // reuse callback to refresh data
    } catch (e) {
      // A user rejecting the signature prompt lands here; say so rather than
      // reporting a network error.
      const msg = e instanceof Error && /reject|denied/i.test(e.message)
        ? 'Signature request was rejected in the wallet.'
        : 'Network error';
      setApproveError(msg);
    }
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
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => handleApprove('wallet')} disabled={approving}
              className="rounded-lg bg-orange-500/20 border border-orange-500/40 px-4 py-2 text-sm text-orange-400 hover:bg-orange-500/30 transition-colors disabled:opacity-50">
              {approving ? 'Approving...' : 'Sign & Approve'}
            </button>
            <button onClick={() => setShowRevokeConfirm(true)}
              className="rounded-lg border border-error/30 bg-error/5 px-4 py-2 text-sm text-error hover:bg-error/10 transition-colors">
              Reject
            </button>
            <button onClick={() => handleApprove('api_key')} disabled={approving}
              className="text-xs text-text-secondary underline underline-offset-4 hover:text-text-primary transition-colors disabled:opacity-50">
              Approve with API key instead
            </button>
          </div>
          <p className="mt-3 text-xs text-text-secondary">
            Signing with the principal wallet is what makes this approval evidence of a human decision. An API key
            alone is accepted only while the account has no wallet bound to it.
          </p>
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
            // The 'active' stage is a reached/good state, not in-progress — so
            // when it's the current step (contract is active) show it green,
            // while other in-progress steps (draft/handshake/pending) stay amber.
            const isCurrentActive = isCurrent && stage.key === 'active';
            return (
              <div key={stage.key} className="flex items-center gap-1 flex-1">
                <div className="flex-1 text-center">
                  <div className={`mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg border transition-all ${
                    isCurrentActive ? 'border-success/50 bg-success/15 text-success' :
                    isCurrent ? 'border-amber bg-amber/15 text-amber' :
                    isPast ? 'border-success/40 bg-success/10 text-success' :
                    'border-border bg-surface-elevated text-text-secondary/40'
                  }`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className={`text-[10px] font-mono uppercase tracking-wider ${
                    isCurrentActive ? 'text-success' : isCurrent ? 'text-amber' : isPast ? 'text-success/70' : 'text-text-secondary/40'
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
        {/* Bilateral contracts waiting on the second party: make the pending
            state explicit so the amber "Signing" step isn't mistaken for done. */}
        {!contract.is_one_sided && contract.status === 'pending_signature' && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber/30 bg-amber/5 px-3 py-2">
            <Clock className="h-3.5 w-3.5 text-amber shrink-0" />
            <p className="text-xs text-amber">Waiting for the counterparty to sign.</p>
          </div>
        )}
        {/* A2A is agent-deployed (no human form), so any c3 contract reaching the
            dashboard was created by the user's agent via MCP. Make that explicit
            pre-activation so it reads as a contract to watch, not an unfinished
            draft — and reassure the reading view needs no wallet. */}
        {contract.template_slug === 'c3-task-execution' &&
          ['draft', 'handshake', 'pending_signature'].includes(contract.status) && (
          <div className="mt-3 flex items-center gap-2 text-[11px] text-text-secondary">
            <Bot className="h-3.5 w-3.5 text-amber/70 shrink-0" />
            <span>Deployed by your agent — read it below and watch the signatures land. No wallet needed for this view.</span>
          </div>
        )}
      </div>

      {/* Share with counterparty — only visible pre-activation so users can
          recover from typos / re-send after the one-shot DeploySuccess modal
          is dismissed. Hidden once the contract is `active` (both parties
          signed) or terminated. The /share endpoint generates a fresh token
          on every call, so re-sending is safe and idempotent on the email
          side (counterparty just gets the link again). ShareByEmail provides
          its own card chrome so no outer wrapper here. */}
      {(['draft', 'handshake', 'pending_signature'].includes(contract.status)) && (
        <ShareByEmail apiKey={apiKey} contractId={contract.contract_id} />
      )}

      {/* Agent connection handoff — the copy-paste an agent uses to read +
          sign this contract machine-to-machine. Shown while a signature is
          still outstanding (pre-active); hidden once fully executed. */}
      {(['draft', 'handshake', 'pending_signature'].includes(contract.status)) && (
        <AgentHandoff
          contractId={contract.contract_id}
          sha256Hash={contract.sha256_hash}
          isOneSided={contract.is_one_sided ?? false}
          isAgentToAgent={contract.template_slug === 'c3-task-execution'}
        />
      )}

      {/* DACS-2 Vet — counterparty verification, shown when a company party
          carries an LEI-shaped registration number. */}
      {(() => {
        const reg = contract.parameters?.principal_registration_number;
        if (typeof reg !== 'string' || !isLei(reg)) return null;
        const name = contract.parameters?.principal_name;
        return (
          <VerificationCard
            contractId={contract.contract_id}
            apiKey={apiKey}
            role="principal"
            identifier={reg}
            partyName={typeof name === 'string' ? name : undefined}
          />
        );
      })()}

      {/* Details grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-surface/80 p-5">
          <p className="text-micro mb-3">Contract Info</p>
          <div className="space-y-2.5">
            <DetailRow label="Hash" value={(contract.sha256_hash?.slice(0, 32) ?? '') + '...'} mono />
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
          {(() => {
            // Per-party "signed / awaiting" view for bilateral contracts — shows
            // WHO still needs to sign (e.g. for A2A: requester agent vs executor
            // agent). Only used when (a) it's bilateral, (b) we resolved both
            // party wallets from the deploy params, and (c) the signer wallets
            // came back unstripped (owner-auth'd) so the match is trustworthy.
            // Otherwise fall back to the plain signature list (no regression).
            const expected = expectedSignersFor(contract);
            const haveSignerWallets = signatures.every((s) => !!s.signer_wallet);
            const usePerParty = !contract.is_one_sided && expected.length >= 2 && haveSignerWallets;
            if (usePerParty) {
              const signedSet = new Set(
                signatures.map((s) => (s.signer_wallet ?? '').toLowerCase()).filter(Boolean),
              );
              return (
                <div className="space-y-2.5">
                  {expected.map((e) => {
                    const signed = signedSet.has(e.wallet.toLowerCase());
                    return (
                      <div key={e.wallet} className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          {signed
                            ? <Check className="h-3.5 w-3.5 text-success shrink-0" />
                            : <Clock className="h-3.5 w-3.5 text-amber shrink-0" />}
                          <span className="text-text-secondary shrink-0">{e.role}</span>
                          <span className="font-mono text-text-primary/70 truncate">{e.wallet.slice(0, 6)}…{e.wallet.slice(-4)}</span>
                        </div>
                        <span className={`shrink-0 ${signed ? 'text-success' : 'text-amber'}`}>
                          {signed ? 'signed' : 'awaiting'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            }
            return signatures.length > 0 ? (
              <div className="space-y-2">
                {signatures.map((sig, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="font-mono text-text-primary">{sig.signer_wallet ? `${sig.signer_wallet.slice(0, 6)}...${sig.signer_wallet.slice(-4)}` : 'Signed'}</span>
                    <span className="text-text-secondary">{new Date(sig.signed_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-secondary">No signatures yet</p>
            );
          })()}

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
                      {p.proposer_wallet?.slice(0, 6)}...{p.proposer_wallet?.slice(-4)}
                    </span>
                    <span className="text-text-secondary/40">→</span>
                    <span className="text-xs font-mono text-text-secondary">
                      {p.approval_required_from?.slice(0, 6)}...{p.approval_required_from?.slice(-4)}
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
                      Requires signature from {p.approval_required_from?.slice(0, 6)}...{p.approval_required_from?.slice(-4)}
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

      {/* Embedded cNFT viewer — positioned ABOVE the contract body so the
          NFT proof is visible without scrolling past the legal text. Renders
          only when mint pipeline has fired (i.e. once the contract is signed
          and at least one cNFT exists or is in progress).
          Party names extracted template-aware from contract parameters so each
          card shows "Held by [name] · Principal/Counterparty". */}
      {contract.nft_mint_status && (() => {
        const { principalName, counterpartyName } = extractPartyNames(
          contract.template_id,
          contract.parameters,
        );
        // template_id is a UUID, not a slug, and contract_type holds the
        // template category: when the first pass finds no names, the second
        // takes the helper's field-name fallback.
        const fallback = (!principalName && !counterpartyName)
          ? extractPartyNames(contract.contract_type, contract.parameters)
          : { principalName, counterpartyName };
        return (
          <ContractNftViewer
            sha256Hash={contract.sha256_hash}
            mintStatus={contract.nft_mint_status}
            tokenId={contract.nft_token_id}
            counterpartyTokenId={contract.nft_counterparty_token_id}
            holderWallet={contract.nft_holder_wallet}
            counterpartyWallet={contract.nft_counterparty_wallet}
            txHash={contract.nft_tx_hash}
            counterpartyTxHash={contract.nft_counterparty_tx_hash}
            principalName={fallback.principalName ?? contract.principal_declaration?.principal_name ?? null}
            counterpartyName={fallback.counterpartyName}
            isOneSided={contract.is_one_sided ?? false}
          />
        );
      })()}

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
        {/* Primary CTA for the principal when signing is pending. Same URL as
            "Open in Reader" — the difference is discoverability. Guarded on
            principalToken so we don't briefly link to the no-token URL before
            the on-mount fetch resolves. That token is the deployer's, never an
            invite (see the state above). */}
        {['draft', 'handshake', 'pending_signature'].includes(contract.status) && principalToken && (
          <Link
            href={`/reader/${contract.sha256_hash}?token=${principalToken}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber text-background px-4 py-2.5 text-sm font-medium hover:bg-amber-light transition-colors"
          >
            <PenTool className="h-3.5 w-3.5" /> Sign Contract
          </Link>
        )}
        {/* Copy share link — for distributing the tokenized URL via Telegram,
            Slack, or any off-email channel. Tester report 2026-05-19
            showed a counterparty hitting the metadata-only fallback because
            the URL passed to them was missing the ?token=... segment. This
            button is the one-click answer. Its token is an invite (the kind
            that may fill an open counterparty slot), minted on the first click.
            Shown once principalToken exists: only the creator's key gets one. */}
        {principalToken && (
          <button
            disabled={inviteLinkBusy}
            onClick={async () => {
              try {
                setInviteLinkBusy(true);
                setInviteLinkFailed(false);
                let tok = inviteToken;
                if (!tok) {
                  const res = await fetch(`/api/v1/contracts/${contract.contract_id}/share`, {
                    method: 'POST',
                    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ purpose: 'invite' }),
                  });
                  const data = await res.json();
                  if (!res.ok || !data.token) throw new Error(data.message || 'Failed to create share link');
                  tok = data.token as string;
                  setInviteToken(tok);
                }
                const url = `${window.location.origin}/reader/${contract.sha256_hash}?token=${tok}`;
                try {
                  await navigator.clipboard.writeText(url);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2000);
                } catch {
                  // Clipboard API blocked (e.g. older browsers, certain webviews) —
                  // fall back to a prompt the user can manually copy from.
                  window.prompt('Copy this URL to share:', url);
                }
              } catch {
                // The mint failed: say so, or the creator may paste an old clipboard.
                setInviteLinkFailed(true);
                setTimeout(() => setInviteLinkFailed(false), 3000);
              } finally {
                setInviteLinkBusy(false);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:border-amber/30 transition-colors disabled:opacity-50"
          >
            {linkCopied ? (
              <><Check className="h-3.5 w-3.5 text-emerald-400" /> Copied</>
            ) : inviteLinkFailed ? (
              <><Copy className="h-3.5 w-3.5" /> Couldn&apos;t create the link. Try again</>
            ) : (
              <><Copy className="h-3.5 w-3.5" /> Copy share link</>
            )}
          </button>
        )}
        {/* Scope-only link — proves the agent's authority + validity without
            exposing the parties' identities or the full contract text. Token is
            minted on first click. */}
        {apiKey && (
          <button
            disabled={scopeLinkBusy}
            onClick={async () => {
              try {
                setScopeLinkBusy(true);
                let tok = scopeToken;
                if (!tok) {
                  const res = await fetch(`/api/v1/contracts/${contract.contract_id}/share`, {
                    method: 'POST',
                    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ access_level: 'scope' }),
                  });
                  const data = await res.json();
                  if (!res.ok || !data.token) throw new Error(data.message || 'Failed to create scope link');
                  tok = data.token as string;
                  setScopeToken(tok);
                }
                const url = `${window.location.origin}/reader/${contract.sha256_hash}?token=${tok}`;
                try {
                  await navigator.clipboard.writeText(url);
                  setScopeLinkCopied(true);
                  setTimeout(() => setScopeLinkCopied(false), 2000);
                } catch {
                  window.prompt('Copy this scope-only URL to share:', url);
                }
              } catch {
                /* surfaced via the button label staying idle */
              } finally {
                setScopeLinkBusy(false);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:border-amber/30 transition-colors disabled:opacity-50"
            title="A redacted link: shows what the agent may do and whether it's valid, but hides identities and the full contract text"
          >
            {scopeLinkCopied ? (
              <><Check className="h-3.5 w-3.5 text-emerald-400" /> Copied</>
            ) : (
              <><ShieldCheck className="h-3.5 w-3.5" /> Copy scope-only link</>
            )}
          </button>
        )}
        <Link
          href={principalToken
            ? `/reader/${contract.sha256_hash}?token=${principalToken}`
            : `/reader/${contract.sha256_hash}`}
          target="_blank"
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

      {/* Honest explainer — the link contains a signing credential (the share
          token). Anyone who receives it can sign as counterparty, regardless
          of contract visibility. Visibility only controls read access; signing
          is always token-gated. Earlier draft said "no Ambr account needed"
          which was technically true but misleading about the credential nature.
          See /api/v1/contracts/[id]/share/route.ts DEFAULT_EXPIRY_HOURS for the
          7-day source of truth. */}
      {principalToken && ['draft', 'handshake', 'pending_signature'].includes(contract.status) && (
        <p className="text-[11px] text-text-secondary/70 mt-2 leading-relaxed">
          <span className="text-amber/80">Anyone with the share link can sign as counterparty.</span> Share only with the intended recipient — the link contains a signing token that expires in 7 days.
          {contract.visibility && contract.visibility !== 'private' && (
            <> This contract&apos;s visibility is set to <span className="font-mono">{contract.visibility}</span> — read access follows that setting separately from the signing token.</>
          )}
        </p>
      )}

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
            { id: 'x402', title: 'x402 Pay-per-Contract', desc: 'No API key needed (x402 v2). The first call returns 402 with a PAYMENT-REQUIRED header; a standard x402 client signs it and you retry with PAYMENT-SIGNATURE. Success carries PAYMENT-RESPONSE:', code: `# 1. First call: 402 + PAYMENT-REQUIRED header\ncurl -i -X POST https://getamber.dev/api/v1/contracts \\\n  -H "Content-Type: application/json" \\\n  -d '{ "template": "d1-general-auth", ... }'\n\n# 2. Retry with PAYMENT-SIGNATURE produced by a standard x402 client (e.g. @x402/fetch)\ncurl -i -X POST https://getamber.dev/api/v1/contracts \\\n  -H "PAYMENT-SIGNATURE: <base64 from your x402 client>" \\\n  -H "Content-Type: application/json" \\\n  -d '{ "template": "d1-general-auth", ... }'\n# 201 Created, PAYMENT-RESPONSE header carries the settlement` },
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
    { tier: 'x402 (pay-per-use)', cost: total, note: `${count} contracts`, suffix: '' },
    { tier: `Developer (free)`, cost: 0, note: `${FREE_TIER_CREDITS} credits once, then buy a pack`, suffix: '' },
    { tier: `${PACKS[0].label} (${formatUsd(PACKS[0].price_cents)})`, cost: PACKS[0].price_cents / 100, note: `${PACKS[0].credits.toLocaleString('en-US')} credits, one-off`, suffix: '' },
    { tier: `${PACKS[1].label} (${formatUsd(PACKS[1].price_cents)})`, cost: PACKS[1].price_cents / 100, note: `${PACKS[1].credits.toLocaleString('en-US')} credits, one-off`, suffix: '' },
    { tier: `${TEAM.label} (${formatUsd(TEAM.price_cents_monthly)}/mo)`, cost: TEAM.price_cents_monthly / 100, note: `${TEAM.credits_per_month.toLocaleString('en-US')} credits per month, overage: buy a pack`, suffix: '/mo' },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-surface/80 p-5">
        <p className="text-micro mb-4">x402 Cost Calculator</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">Contract Type</label>
            <div className="space-y-1.5">
              {([['delegation', 'Delegation (d-series)', '$0.50'], ['commerce', 'Agent-to-Agent (c-series)', '$1.00'], ['fleet', 'Fleet Auth (d3)', '$2.50']] as const).map(([val, label, price]) => (
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
                ${t.cost.toFixed(2)}{t.suffix}
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
interface StripePayment {
  id: string;
  tier: string | null;
  amount_cents: number | null;
  currency: string | null;
  created_at: string;
  receipt_url: string | null;
}

function AccountSection({ user, wallet, authMethod, apiKey, onSignOut }: {
  user: UserInfo | null; wallet: string | null; authMethod: AuthMethod; apiKey: string; onSignOut: () => void;
}) {
  const tierInfo = user?.tier ? TIER_INFO[user.tier] || { label: user.tier, limit: '—', overage: '—' } : null;

  // Buy credits state
  const [buyTier, setBuyTier] = useState<'startup' | 'scale' | null>(null);
  const [buyLoading, setBuyLoading] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);

  // Payment history state
  const [payments, setPayments] = useState<StripePayment[] | null>(null);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  // Fetch payment history on mount (only for API key auth)
  useEffect(() => {
    if (authMethod !== 'api_key' || !apiKey) return;
    setPaymentsLoading(true);
    fetch('/api/v1/stripe/payments', { headers: { 'X-API-Key': apiKey } })
      .then((r) => r.json())
      .then((d) => setPayments(d.payments ?? []))
      .catch(() => setPayments([]))
      .finally(() => setPaymentsLoading(false));
  }, [authMethod, apiKey]);

  async function handleBuyCredits() {
    if (!buyTier || !user?.email) return;
    setBuyLoading(true);
    setBuyError(null);
    try {
      const res = await fetch('/api/v1/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, tier: buyTier, mode: 'topup' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBuyError(data.message || 'Failed to start checkout');
        return;
      }
      window.location.href = data.url;
    } catch {
      setBuyError('Network error. Please try again.');
    } finally {
      setBuyLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-surface/80 p-6">
        <p className="text-micro mb-4">Account Details</p>
        <div className="space-y-3">
          {user?.email && <Row label="Email" value={user.email} />}
          {tierInfo && <Row label="Plan" value={tierInfo.label} className="text-amber" />}
          {user && <Row label="Credits Remaining" value={user.credits === -1 ? 'Unlimited' : `${user.credits} credits`} mono />}
          {user && user.credits > 0 && <Row label="Personal Contracts" value={`~${Math.floor(user.credits / 20)}`} mono />}
          {tierInfo && <Row label="Included Credits" value={tierInfo.limit} />}
          {tierInfo && tierInfo.overage !== 'N/A' && tierInfo.overage !== '—' && <Row label="When Credits Run Out" value={tierInfo.overage} className="text-text-secondary" />}
          {user?.key_prefix && <Row label="API Key" value={`${user.key_prefix}...`} mono />}
          {wallet && <Row label="Wallet" value={`${wallet.slice(0, 6)}...${wallet.slice(-4)}`} mono />}
          <Row label="Auth Method" value={authMethod === 'wallet' ? 'Wallet (ECDSA)' : 'API Key'} />
        </div>
      </div>

      {/* Buy more credits */}
      {user?.email && (
        <div className="rounded-xl border border-border bg-surface/80 p-5">
          <p className="text-micro mb-3">Buy More Credits</p>
          <p className="text-xs text-text-secondary mb-4">One-time purchase. Credits never expire.</p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <button
              type="button"
              onClick={() => setBuyTier('startup')}
              className={`text-left p-4 rounded-lg border transition-colors ${
                buyTier === 'startup'
                  ? 'border-amber bg-amber/10'
                  : 'border-border bg-surface-elevated hover:border-amber/40'
              }`}
            >
              <p className="text-sm font-medium text-text-primary">Starter Pack</p>
              <p className="text-lg font-mono font-bold text-amber mt-1">{formatUsd(PACKS[0].price_cents)}</p>
              <p className="text-xs text-text-secondary mt-1">{PACKS[0].credits.toLocaleString('en-US')} credits</p>
            </button>
            <button
              type="button"
              onClick={() => setBuyTier('scale')}
              className={`text-left p-4 rounded-lg border transition-colors ${
                buyTier === 'scale'
                  ? 'border-amber bg-amber/10'
                  : 'border-border bg-surface-elevated hover:border-amber/40'
              }`}
            >
              <p className="text-sm font-medium text-text-primary">Scale Pack</p>
              <p className="text-lg font-mono font-bold text-amber mt-1">{formatUsd(PACKS[1].price_cents)}</p>
              <p className="text-xs text-text-secondary mt-1">{PACKS[1].credits.toLocaleString('en-US')} credits</p>
            </button>
          </div>
          {buyError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400 mb-3">
              {buyError}
            </div>
          )}
          <button
            onClick={handleBuyCredits}
            disabled={!buyTier || buyLoading}
            className="w-full rounded-lg bg-amber px-4 py-2.5 text-sm font-mono uppercase tracking-wide text-xs text-background transition-colors hover:bg-amber-light disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {buyLoading ? 'Redirecting to checkout...' : 'Buy Credits'}
          </button>
          <p className="text-xs text-text-secondary/60 mt-3 text-center">
            Secure checkout via Stripe. Credits are added to your current key.
          </p>
        </div>
      )}

      {/* Payment history */}
      {authMethod === 'api_key' && (
        <div className="rounded-xl border border-border bg-surface/80 p-5">
          <p className="text-micro mb-3">Payment History</p>
          {paymentsLoading ? (
            <div className="flex justify-center py-4">
              <div className="w-5 h-5 border-2 border-amber border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !payments || payments.length === 0 ? (
            <p className="text-xs text-text-secondary/60 py-2">No Stripe payments yet.</p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-2 text-[10px] font-mono uppercase tracking-wider text-text-secondary pb-1 border-b border-border">
                <span>Date</span>
                <span>Tier</span>
                <span className="text-right">Amount</span>
                <span className="text-right">Receipt</span>
              </div>
              {payments.map((p) => (
                <div key={p.id} className="grid grid-cols-4 gap-2 text-xs items-center">
                  <span className="text-text-secondary font-mono">
                    {new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <span className="text-text-primary capitalize">{p.tier || '—'}</span>
                  <span className="text-right font-mono text-text-primary">
                    ${((p.amount_cents ?? 0) / 100).toFixed(2)}
                  </span>
                  <span className="text-right">
                    {p.receipt_url ? (
                      <a
                        href={p.receipt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-amber hover:underline font-mono"
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-text-secondary/40">—</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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

function WalletSection({ contracts }: { contracts: ContractRow[] }) {
  // Use the same hook the bottom-left WalletStatusBar uses. Previously this
  // section had its own state initialized from `walletAddress` (the session
  // snapshot) + its own localStorage, which made the big "Connected Wallet"
  // panel display a STALE wallet that disagreed with the live-wallet status
  // bar in the sidebar. Reported 2026-05-26 morning: panel showed
  // 0xae86…0a91 (SafePal cache) while sidebar showed 0x200b…7dd8 (real
  // current MetaMask).
  const {
    wallet, providers, setPreferredProvider, requestAccount, disconnect,
  } = useWalletStatus();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const nftContracts = contracts.filter(c => c.nft_mint_status === 'minted');
  const pendingMints = contracts.filter(c => c.nft_mint_status === 'pending');

  async function connectWallet(picked: EIP6963ProviderDetail) {
    setConnecting(true); setError('');
    try {
      // Tell the hook which provider to use, then prompt that provider for
      // accounts. The hook's accountsChanged listener picks up the address
      // and updates `wallet` for both this panel AND the WalletStatusBar.
      setPreferredProvider(picked.info.rdns);
      // Defer one tick so the preferredProvider state has propagated before
      // requestAccount() reads it (matches the AmbrAgentOverlay pattern).
      await new Promise((r) => setTimeout(r, 0));
      const addr = await requestAccount();
      if (!addr) setError('Connection cancelled');
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
              <button onClick={disconnect}
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
            <WalletPicker providers={providers} onPick={connectWallet} connecting={connecting} variant="amber" />
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
                    {c.is_one_sided && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-mono text-violet-400 border border-violet-500/30"
                        title="Unilateral authorization — principal signs once, no counterparty required"
                      >
                        DELEGATION
                      </span>
                    )}
                  </div>
                  <StatusBadge status={c.status} />
                </div>
                <p className="text-xs text-text-secondary/70 mb-2">{c.principal_declaration?.principal_name || 'Unknown'}</p>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-text-secondary">Hash: <span className="font-mono text-text-primary">{c.sha256_hash?.slice(0, 16)}...</span></span>
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
  // Chat-driven deploy state (experimental, admin-gated until v1 ships publicly)
  const [deployInitialIntent, setDeployInitialIntent] = useState<string | null>(null);
  const [deployInitialTemplate, setDeployInitialTemplate] = useState<string | null>(null);
  const [deployDraftIdToResume, setDeployDraftIdToResume] = useState<string | null>(null);
  const [createManualMode, setCreateManualMode] = useState(false);
  // Bumped each time the user clicks "Create Contract" so DeployChat remounts
  // into a fresh session (vs. auto-resuming the last draft). See handleNav.
  const [createNonce, setCreateNonce] = useState(0);

  // Sidebar/tab navigation. "Create Contract" always starts a FRESH chat: the
  // current in-progress draft is already auto-saved in IndexedDB and stays
  // available under Drafts, so we just drop the "active draft" pointer and bump
  // a nonce to force a clean DeployChat mount (even if already on the create
  // tab). Resuming a specific draft still goes through Drafts → Resume.
  const handleNav = useCallback((id: Section) => {
    if (id === 'create') {
      try { localStorage.removeItem(ACTIVE_DRAFT_KEY); } catch {}
      setDeployDraftIdToResume(null);
      setDeployInitialIntent(null);
      setDeployInitialTemplate(null);
      setCreateManualMode(false);
      setCreateNonce((n) => n + 1);
    }
    setSection(id);
  }, []);
  const walletProviders = useWalletProviders();
  // Live MetaMask connection — used by ContractList's "Just my current wallet"
  // filter chip in Phase B. The dashboard already has WalletSection consuming
  // useWalletStatus internally; pulling it here too is fine (hook re-uses the
  // same localStorage cache, no extra network call).
  const liveWallet = useWalletStatus();

  const isLoggedIn = data?.authMethod != null;
  const isAdmin = data?.user?.is_admin === true;
  const isTechAdmin = data?.user?.is_tech_admin === true;
  // Beta access for Ambr Agent (AI chat). Admins always have it; non-admins
  // need the explicit `ai_chat` flag in their api_keys.beta_features JSONB.
  // The env flag remains the top-level kill switch — flip it off to hide
  // the chat surface for everyone, no rollback commit needed.
  const hasAiChatBeta = data?.user?.beta_features?.ai_chat === true;
  const canUseAmbrChat =
    (isAdmin || hasAiChatBeta) &&
    process.env.NEXT_PUBLIC_AMBR_AGENT_EXPERIMENTAL === 'true';

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
      if (!res.ok) { setData({ user: null, contracts: [], wallet: null, bound_wallets: [], authMethod: null, error: json.error || 'Invalid API key' }); }
      else { setData({ user: json.user, contracts: json.contracts, wallet: json.wallet ?? null, bound_wallets: json.bound_wallets ?? [], authMethod: 'api_key', error: null }); saveSession('api_key', key); }
    } catch { setData({ user: null, contracts: [], wallet: null, bound_wallets: [], authMethod: null, error: 'Failed to connect' }); }
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
        setData({ user: null, contracts: [], wallet: res.status === 404 ? address : null, bound_wallets: [], authMethod: null,
          error: res.status === 404 ? 'No contracts found for this wallet.' : json.message || 'Verification failed' });
      } else {
        setData({ user: json.user, contracts: json.contracts, wallet: json.wallet, bound_wallets: json.bound_wallets ?? (json.wallet ? [json.wallet] : []), authMethod: 'wallet', error: null });
        saveSession('wallet', undefined, json.wallet);
      }
    } catch (err) {
      if (!(err as Error).message?.includes('user rejected'))
        setData({ user: null, contracts: [], wallet: null, bound_wallets: [], authMethod: null, error: 'Wallet connection failed' });
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
            <DesktopSidebar active={section} onNav={handleNav} isAdmin={isAdmin} user={data.user} onSignOut={handleSignOut} serverBoundWallet={data.wallet ?? null} onRebound={() => { if (apiKey) fetchWithApiKey(apiKey); }} />
            <MobileBottomNav active={section} onNav={handleNav} isAdmin={isAdmin} user={data.user} onSignOut={handleSignOut} />

            <div className="lg:ml-56 px-4 py-6 sm:px-6 lg:px-10 xl:px-16 2xl:px-24 pb-20 lg:pb-6">
              {/* Beta notice — visible to all signed-in users (not just admins).
                  Dismissible per-browser. Above the Top bar so it's the first
                  thing every dashboard user sees on every section until they
                  dismiss it. */}
              <div className="mb-3">
                <BetaNotice />
              </div>

              {/* Top bar */}
              <div className="flex items-center justify-between gap-2 mb-6 rounded-xl border border-border/50 bg-surface/80 px-4 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <AmbrMark size={18} className="shrink-0" />
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
                  {section === 'create' && (
                    (canUseAmbrChat && !createManualMode) ? (
                      <DeployChat
                        key={`deploy-${createNonce}`}
                        apiKey={apiKey}
                        wallet={data.wallet}
                        userEmail={data.user?.email}
                        initialIntent={deployInitialIntent}
                        initialTemplate={deployInitialTemplate}
                        draftIdToResume={deployDraftIdToResume}
                        tier={data.user?.tier ?? null}
                        credits={data.user?.credits ?? null}
                        onSwitchToManual={() => setCreateManualMode(true)}
                        onDeployed={() => {
                          setDeployInitialIntent(null);
                          setDeployInitialTemplate(null);
                          setDeployDraftIdToResume(null);
                          fetchWithApiKey(apiKey);
                        }}
                      />
                    ) : (
                      <>
                        {/* Ambr Agent discovery hint — shown ONLY to users who
                            CANNOT use the chat (wallet-only sessions, keys
                            without the ai_chat beta flag). Manual-mode beta
                            users don't see it (they have the toggle below).
                            Feedback 2026-07-19: fresh users land here
                            with zero signal that an AI assistant exists. */}
                        {!canUseAmbrChat && (
                          <div className="flex items-start gap-3 rounded-xl border border-amber/25 bg-amber/[0.06] px-4 py-3 mb-2">
                            <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            <p className="text-xs text-text-secondary leading-relaxed">
                              <span className="text-text-primary">Prefer plain language?</span>{' '}
                              The Ambr Agent — an AI assistant that drafts the mandate from a sentence — is in private beta.
                              It requires an email-registered API key with beta access:{' '}
                              <a href="/activate" className="text-amber hover:underline">claim a free key</a>, then request
                              access at <a href="mailto:support@ambr.run" className="text-amber hover:underline">support@ambr.run</a>.
                              The manual builder below works for everyone.
                            </p>
                          </div>
                        )}
                        <ContractBuilder apiKey={apiKey} />
                        {canUseAmbrChat && createManualMode && (
                          <div className="mt-4 text-center">
                            <button
                              onClick={() => setCreateManualMode(false)}
                              className="text-xs text-amber hover:underline"
                            >
                              ← Switch back to Ambr Agent (chat-driven)
                            </button>
                          </div>
                        )}
                      </>
                    )
                  )}
                  {section === 'my-drafts' && (
                    canUseAmbrChat ? (
                      <DraftsList
                        apiKey={apiKey || null}
                        onResumeDraft={(id) => {
                          setDeployDraftIdToResume(id);
                          setDeployInitialIntent(null);
                          setDeployInitialTemplate(null);
                          setCreateManualMode(false);
                          setSection('create');
                        }}
                      />
                    ) : (
                      <div className="rounded-2xl border border-border bg-surface p-8 text-center">
                        <p className="text-sm text-text-secondary">Drafts (chat-driven contracts) is in experimental preview.</p>
                      </div>
                    )
                  )}
                  {section === 'contracts' && <ContractList
                    contracts={data.contracts}
                    onSelectContract={(c) => { setSelectedContract(c); setSection('contract-detail'); }}
                    currentWallet={liveWallet.wallet ?? data.wallet}
                    boundWallets={data.bound_wallets}
                    apiKeyId={data.user?.api_key_id ?? null}
                  />}
                  {section === 'contract-detail' && selectedContract && (
                    <ContractDetail
                      contract={selectedContract}
                      apiKey={apiKey}
                      onBack={() => setSection('contracts')}
                      onRevoked={() => { fetchWithApiKey(apiKey); setSection('contracts'); }}
                    />
                  )}
                  {section === 'wallet' && <WalletSection contracts={data.contracts} />}
                  {section === 'agents' && <AgentSetup apiKeyPrefix={data.user?.key_prefix || 'amb_***'} apiKey={apiKey} />}
                  {section === 'analytics' && <ContractAnalytics contracts={data.contracts} apiKey={apiKey} />}
                  {section === 'account' && <AccountSection user={data.user} wallet={data.wallet} authMethod={data.authMethod!} apiKey={apiKey} onSignOut={handleSignOut} />}

                  {/* Admin sections */}
                  {isAdmin && ['calendar', 'email', 'drafts'].includes(section) && (
                    <AdminSection
                      activeSection={section as 'calendar' | 'email' | 'drafts'}
                      memberId={data.user?.team_member_id ?? undefined}
                    />
                  )}

                  {/* Beta Access — admin-only management surface for granting per-account beta flags */}
                  {isAdmin && section === 'beta-access' && (
                    <BetaAccessSection currentUserEmail={data.user?.email} />
                  )}

                  {/* Tech health (admin only) */}
                  {isAdmin && section === 'health' && isTechAdmin && (
                    <TechHealthWidget />
                  )}
                  {isAdmin && section === 'health' && !isTechAdmin && (
                    <div className="rounded-xl border border-border bg-surface p-8 text-center">
                      <p className="text-sm text-text-secondary">Business metrics are shown in Pipeline Overview and Analytics.</p>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Global Ambr Agent — gated by admin OR per-account ai_chat beta flag, plus the experimental env kill switch */}
            {canUseAmbrChat && (
              <AmbrAgentOverlay
                apiKey={apiKey}
                context={{
                  wallet: data.wallet,
                  tier: data.user?.tier ?? null,
                }}
                hidden={section === 'create'}
                onHandoffToDeploy={(template, intent) => {
                  // Seed a FRESH chat with the agent's intent — don't let the
                  // last active draft shadow it (same fresh-start as handleNav).
                  try { localStorage.removeItem(ACTIVE_DRAFT_KEY); } catch {}
                  setDeployInitialIntent(intent);
                  setDeployInitialTemplate(template);
                  setDeployDraftIdToResume(null);
                  setCreateManualMode(false);
                  setCreateNonce((n) => n + 1);
                  setSection('create');
                }}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
