'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, RefreshCw, Search, Send, Loader2 } from 'lucide-react';

interface BetaTesterRow {
  api_key_id: string;
  email: string;
  tier: string;
  is_admin: boolean;
  beta_features: Record<string, boolean>;
  usage_7d: {
    message_count: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  };
  last_grant: {
    granted: boolean;
    granted_by_email: string;
    granted_at: string;
    notes: string | null;
  } | null;
  invite_email: {
    status: 'queued' | 'sent' | 'failed' | null;
    sent_at: string | null;
    error_message: string | null;
  } | null;
}

interface SenderHealth {
  verified: boolean;
  spf: string;
  dkim: string;
  dmarc: string;
  detail?: string;
}

const FEATURE: 'ai_chat' = 'ai_chat';

export function BetaAccessSection({ currentUserEmail }: { currentUserEmail?: string }) {
  const [rows, setRows] = useState<BetaTesterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [sendingInviteId, setSendingInviteId] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState(false);
  const [senderHealth, setSenderHealth] = useState<SenderHealth | null>(null);

  const apiKey = useMemo(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('ambr_dashboard_session') : null;
      if (!raw) return null;
      const p = JSON.parse(raw) as { apiKey?: string };
      return p.apiKey ?? null;
    } catch { return null; }
  }, []);

  const authHeaders = useMemo<HeadersInit>(() => ({
    'Content-Type': 'application/json',
    ...(apiKey ? { 'X-API-Key': apiKey } : {}),
  }), [apiKey]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/admin/beta-access/list', { headers: authHeaders });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to load');
      setRows(json.rows as BetaTesterRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  const loadSenderHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/beta-access/sender-health', { headers: authHeaders });
      if (!res.ok) return;
      const json = await res.json() as SenderHealth;
      setSenderHealth(json);
    } catch { /* fail open — UI just won't show the badge */ }
  }, [authHeaders]);

  useEffect(() => { loadRows(); loadSenderHealth(); }, [loadRows, loadSenderHealth]);

  const handleToggle = useCallback(async (api_key_id: string, currentValue: boolean) => {
    setTogglingId(api_key_id);
    try {
      const res = await fetch('/api/v1/admin/beta-access/toggle', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          api_key_id,
          feature: FEATURE,
          grant: !currentValue,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to toggle');
      await loadRows();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Toggle failed');
    } finally {
      setTogglingId(null);
    }
  }, [authHeaders, loadRows]);

  const handleSendInvite = useCallback(async (api_key_id: string | null) => {
    if (api_key_id) setSendingInviteId(api_key_id);
    else setSendingAll(true);
    try {
      // Backend without invite_id sends every row in 'queued'/'failed'.
      // The per-row "send now" button calls the same endpoint — backend re-fetches
      // all queued/failed, which always includes this row. A per-row endpoint
      // is a future refinement.
      const res = await fetch('/api/v1/admin/beta-access/send-invite', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to send invite');
      await loadRows();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Send invite failed');
    } finally {
      if (api_key_id) setSendingInviteId(null);
      else setSendingAll(false);
    }
  }, [authHeaders, loadRows]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.email.toLowerCase().includes(q));
  }, [rows, filter]);

  const queuedCount = useMemo(() =>
    rows.filter((r) => r.invite_email?.status === 'queued' || r.invite_email?.status === 'failed').length,
    [rows],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      {/* Header + sender health badge */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-serif text-text-primary">Beta Access</h2>
          <p className="text-sm text-text-secondary/80 mt-1">
            Grant per-account access to the Ambr Agent (AI chat) beta. Admins always have access.
          </p>
        </div>
        <SenderHealthBadge health={senderHealth} />
      </div>

      {/* Search + refresh + send-all-invites */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 border border-border rounded-lg bg-surface px-3 py-2 flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 text-text-secondary/60" />
          <input
            type="text"
            placeholder="Filter by email…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-transparent outline-none text-sm text-text-primary flex-1 placeholder:text-text-secondary/50"
          />
        </div>
        <button
          onClick={loadRows}
          disabled={loading}
          className="inline-flex items-center gap-2 border border-border rounded-lg bg-surface px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
        {queuedCount > 0 && (
          <button
            onClick={() => handleSendInvite(null)}
            disabled={sendingAll}
            className="inline-flex items-center gap-2 border border-amber/40 bg-amber/10 rounded-lg px-3 py-2 text-xs text-amber hover:bg-amber/15 transition-colors disabled:opacity-50"
          >
            {sendingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Send {queuedCount} queued invite{queuedCount === 1 ? '' : 's'}
          </button>
        )}
      </div>

      {/* Tester table */}
      {error && (
        <div className="border border-error/40 bg-error/10 rounded-lg p-4 text-sm text-error">
          {error}
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="border border-border rounded-lg bg-surface p-8 text-center text-sm text-text-secondary">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-amber" />
          Loading API keys…
        </div>
      ) : (
        <div className="border border-border rounded-lg bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated border-b border-border">
              <tr className="text-left text-[0.65rem] font-mono uppercase tracking-wider text-amber/80">
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">AI Chat</th>
                <th className="px-4 py-3">Last 7d Usage</th>
                <th className="px-4 py-3">Last grant</th>
                <th className="px-4 py-3">Invite</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-text-secondary">No matching API keys.</td></tr>
              ) : filtered.map((row) => (
                <BetaTesterRowComponent
                  key={row.api_key_id}
                  row={row}
                  busy={togglingId === row.api_key_id}
                  invitebusy={sendingInviteId === row.api_key_id}
                  onToggle={() => handleToggle(row.api_key_id, row.beta_features[FEATURE] === true)}
                  onSendInvite={() => handleSendInvite(row.api_key_id)}
                  currentAdminEmail={currentUserEmail}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Activity log */}
      <ActivityLog rows={rows} />
    </motion.div>
  );
}

// ─── Row component ─────────────────────────────────────────────────────────

function BetaTesterRowComponent({
  row,
  busy,
  invitebusy,
  onToggle,
  onSendInvite,
  currentAdminEmail: _currentAdminEmail,
}: {
  row: BetaTesterRow;
  busy: boolean;
  invitebusy: boolean;
  onToggle: () => void;
  onSendInvite: () => void;
  currentAdminEmail?: string;
}) {
  const aiChat = row.beta_features[FEATURE] === true;
  const showInvite = row.invite_email?.status === 'queued' || row.invite_email?.status === 'failed';

  return (
    <tr className="hover:bg-surface-elevated/50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-text-primary font-mono text-xs">{row.email}</span>
          {row.is_admin && (
            <span className="text-[0.6rem] font-mono uppercase tracking-wider text-amber border border-amber/30 px-1.5 py-0.5 rounded">admin</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-text-secondary text-xs font-mono">{row.tier}</td>
      <td className="px-4 py-3">
        <button
          onClick={onToggle}
          disabled={busy || row.is_admin}
          title={row.is_admin ? 'Admins always have beta access' : (aiChat ? 'Click to revoke' : 'Click to grant')}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.65rem] font-mono uppercase tracking-wider transition-colors disabled:opacity-60 ${
            aiChat
              ? 'bg-success/15 text-success border border-success/30'
              : 'bg-surface text-text-secondary border border-border hover:border-amber/40'
          }`}
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : (aiChat ? '● granted' : '○ off')}
        </button>
      </td>
      <td className="px-4 py-3 text-xs font-mono text-text-secondary">
        {row.usage_7d.message_count > 0 ? (
          <div className="space-y-0.5">
            <div className="text-text-primary">{row.usage_7d.message_count} msgs</div>
            <div className="text-text-secondary/70">{(row.usage_7d.input_tokens + row.usage_7d.output_tokens).toLocaleString()} tokens</div>
            <div className="text-text-secondary/70">${row.usage_7d.cost_usd.toFixed(3)}</div>
          </div>
        ) : <span className="text-text-secondary/40">—</span>}
      </td>
      <td className="px-4 py-3 text-xs text-text-secondary">
        {row.last_grant ? (
          <div className="space-y-0.5">
            <div className="text-text-primary font-mono">
              {row.last_grant.granted ? '+ granted' : '− revoked'}
            </div>
            <div className="text-text-secondary/70 text-[0.65rem]">
              by {row.last_grant.granted_by_email.split('@')[0]} · {new Date(row.last_grant.granted_at).toLocaleDateString()}
            </div>
          </div>
        ) : <span className="text-text-secondary/40">—</span>}
      </td>
      <td className="px-4 py-3 text-xs">
        {row.invite_email ? (
          <div className="space-y-1">
            <span className={`inline-block px-1.5 py-0.5 rounded text-[0.6rem] font-mono uppercase ${
              row.invite_email.status === 'sent'
                ? 'bg-success/15 text-success'
                : row.invite_email.status === 'failed'
                ? 'bg-error/15 text-error'
                : 'bg-amber/15 text-amber'
            }`}>
              {row.invite_email.status}
            </span>
            {showInvite && (
              <button
                onClick={onSendInvite}
                disabled={invitebusy}
                className="block text-[0.65rem] text-amber hover:underline disabled:opacity-50"
              >
                {invitebusy ? 'sending…' : 'send now'}
              </button>
            )}
            {row.invite_email.error_message && (
              <div className="text-error/80 text-[0.6rem] max-w-[160px] truncate" title={row.invite_email.error_message}>
                {row.invite_email.error_message}
              </div>
            )}
          </div>
        ) : <span className="text-text-secondary/40">—</span>}
      </td>
    </tr>
  );
}

// ─── Activity log block ────────────────────────────────────────────────────

function ActivityLog({ rows }: { rows: BetaTesterRow[] }) {
  // Pull the most-recent grant from each row, sort by granted_at desc, take top 20.
  const events = useMemo(() => {
    return rows
      .filter((r) => r.last_grant !== null)
      .map((r) => ({
        email: r.email,
        granted: r.last_grant!.granted,
        granted_by: r.last_grant!.granted_by_email,
        granted_at: r.last_grant!.granted_at,
        notes: r.last_grant!.notes,
      }))
      .sort((a, b) => b.granted_at.localeCompare(a.granted_at))
      .slice(0, 20);
  }, [rows]);

  if (events.length === 0) return null;

  return (
    <div className="border border-border/50 rounded-lg bg-surface/50 p-5">
      <p className="font-mono text-xs uppercase tracking-widest text-amber/80 mb-3">Recent activity</p>
      <ul className="space-y-2 text-xs">
        {events.map((e, i) => (
          <li key={i} className="flex items-center gap-3">
            <span className={`font-mono ${e.granted ? 'text-success' : 'text-text-secondary'}`}>
              {e.granted ? '+' : '−'}
            </span>
            <span className="text-text-primary font-mono">{e.email}</span>
            <span className="text-text-secondary/70">by {e.granted_by.split('@')[0]}</span>
            <span className="text-text-secondary/50 ml-auto">{new Date(e.granted_at).toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Sender health badge ───────────────────────────────────────────────────

function SenderHealthBadge({ health }: { health: SenderHealth | null }) {
  if (!health) {
    return (
      <div className="text-[0.65rem] font-mono text-text-secondary/60">
        sender status: checking…
      </div>
    );
  }

  const allGreen = health.verified
    && health.spf === 'verified'
    && health.dkim === 'verified'
    && health.dmarc === 'verified';

  return (
    <div className={`inline-flex items-center gap-2 border rounded-lg px-3 py-1.5 text-[0.65rem] font-mono uppercase tracking-wider ${
      allGreen
        ? 'border-success/30 bg-success/10 text-success'
        : 'border-error/30 bg-error/10 text-error'
    }`}>
      {allGreen ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
      ambr.run · {allGreen ? 'verified' : 'check Resend'}
      {!allGreen && (
        <span className="text-[0.6rem] normal-case font-sans text-error/80 ml-1">
          (SPF: {health.spf} · DKIM: {health.dkim} · DMARC: {health.dmarc})
        </span>
      )}
    </div>
  );
}
