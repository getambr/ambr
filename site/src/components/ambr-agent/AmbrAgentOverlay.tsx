'use client';

/**
 * Global Ambr Agent — floating pill on every dashboard section.
 * Click to open a movable modal chat overlay for general Q&A about Ambr.
 * Can hand off to the deploy flow when the user wants to create a contract.
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Send, ArrowRight, Loader2, Maximize2, Minimize2, History, Plus, Trash2 } from 'lucide-react';
import { TEMPLATE_NAMES } from '@/components/deploy/contract-preview';
import { useWalletStatus } from '@/lib/wallet/use-wallet-status';
import WalletPicker from '@/components/wallet/WalletPicker';
import TokenChip, { applyTurnUsage, EMPTY_SESSION_USAGE, type SessionUsage } from '@/components/ambr-agent/TokenChip';
import {
  newAgentSessionId,
  saveAgentSession,
  loadAgentSession,
  listAgentSessions,
  deleteAgentSession,
  pruneOldAgentSessions,
  type AgentSession,
} from '@/lib/storage/indexed-db';

type Turn = { role: 'user' | 'assistant'; content: string };

interface AmbrAgentContext {
  wallet?: string | null;
  tier?: string | null;
  nft_count?: number;
  pending_actions?: number;
}

interface AmbrAgentOverlayProps {
  context: AmbrAgentContext;
  apiKey?: string;
  hidden?: boolean;  // hide pill on /dashboard/deploy section to avoid stacking with deploy chat
  onHandoffToDeploy?: (template: string, intent: string) => void;
}

const QUICK_CHIPS = [
  { label: 'Templates', q: 'What templates are available?' },
  { label: 'Pricing', q: 'How does Ambr pricing work?' },
  { label: 'My wallet', q: 'What\'s the status of my connected wallet?' },
  { label: 'How to deploy', q: 'How do I deploy my first contract?' },
];

export default function AmbrAgentOverlay({
  context,
  apiKey,
  hidden,
  onHandoffToDeploy,
}: AmbrAgentOverlayProps) {
  const [open, setOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestedHandoff, setSuggestedHandoff] = useState<{ template: string; intent: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Session token counter — accumulated from per-turn json.usage on each API
  // response. Cleared by the chip's own Reset button (frees context window).
  const [sessionUsage, setSessionUsage] = useState<SessionUsage>(EMPTY_SESSION_USAGE);
  // History persistence — agent sessions live in IndexedDB (no server-side
  // schema yet). sessionId is generated on first user turn; null means the
  // current turn array hasn't been saved yet.
  const sessionIdRef = useRef<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<AgentSession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // On mount: prune old sessions + restore the most recent one if any. This
  // is what makes "close + reopen the agent and see your last conversation"
  // work. Runs once per component instance — overlay only mounts once per
  // dashboard route load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await pruneOldAgentSessions().catch(() => 0);
        const recent = await listAgentSessions(1);
        if (cancelled || recent.length === 0) return;
        const latest = recent[0];
        // Don't auto-restore if it's >7 days old — feels stale; user
        // probably wants a fresh chat. They can still open History.
        const ageMs = Date.now() - latest.last_active_at;
        if (ageMs > 7 * 24 * 60 * 60 * 1000) return;
        sessionIdRef.current = latest.id;
        setTurns(latest.turns);
        setSessionUsage({
          inputTokens: latest.cumulative_input_tokens,
          outputTokens: latest.cumulative_output_tokens,
          costUsd: latest.cumulative_cost_usd,
          model: null,
          contextWindowMax: 128_000,
        });
      } catch {
        // IndexedDB unavailable (private browsing, quota) — fall through,
        // overlay still works ephemerally like it did before persistence.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Persist the current session whenever turns or usage change, but only
  // AFTER the user has actually said something (skip the greeting-only state).
  useEffect(() => {
    if (turns.length === 0) return;
    const hasUserTurn = turns.some((t) => t.role === 'user');
    if (!hasUserTurn) return;
    if (!sessionIdRef.current) sessionIdRef.current = newAgentSessionId();
    const id = sessionIdRef.current;
    const now = Date.now();
    saveAgentSession({
      id,
      scope: 'general',
      turns,
      created_at: now, // saveAgentSession's PUT keeps the existing record's created_at if any — see below
      last_active_at: now,
      cumulative_input_tokens: sessionUsage.inputTokens,
      cumulative_output_tokens: sessionUsage.outputTokens,
      cumulative_cost_usd: sessionUsage.costUsd,
    }).catch(() => { /* IndexedDB unavailable — silent */ });
  }, [turns, sessionUsage]);

  // Lazy-load the history list when the dropdown opens.
  useEffect(() => {
    if (!historyOpen) return;
    setHistoryLoading(true);
    listAgentSessions(20)
      .then((rows) => setHistory(rows))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [historyOpen]);

  function startNewSession() {
    sessionIdRef.current = null;
    setTurns([]);
    setSessionUsage(EMPTY_SESSION_USAGE);
    setHistoryOpen(false);
  }

  async function loadSessionIntoChat(id: string) {
    const s = await loadAgentSession(id);
    if (!s) return;
    sessionIdRef.current = s.id;
    setTurns(s.turns);
    setSessionUsage({
      inputTokens: s.cumulative_input_tokens,
      outputTokens: s.cumulative_output_tokens,
      costUsd: s.cumulative_cost_usd,
      model: null,
      contextWindowMax: 128_000,
    });
    setHistoryOpen(false);
  }

  async function removeSession(id: string) {
    await deleteAgentSession(id).catch(() => {});
    // If we deleted the currently-loaded one, also clear UI state.
    if (sessionIdRef.current === id) {
      sessionIdRef.current = null;
      setTurns([]);
      setSessionUsage(EMPTY_SESSION_USAGE);
    }
    // Refresh list
    const next = await listAgentSessions(20).catch(() => []);
    setHistory(next);
  }

  // The dashboard passes `context.wallet` from session-load — a snapshot that
  // does NOT update when the user later connects MetaMask. Read the live
  // wallet directly from `useWalletStatus` (EIP-6963 multi-provider aware
  // — iterates SafePal/MetaMask/Rabby/etc. and picks the preferred one) and
  // prefer it as the effective wallet for both the header badge AND the
  // payload sent to the chat backend.
  const live = useWalletStatus();
  // live.wallet always wins when present — context.wallet is just a snapshot
  // fallback for the very first paint before EIP-6963 announces.
  const effectiveWallet = live.wallet ?? context.wallet ?? null;
  const effectiveContext: AmbrAgentContext = {
    ...context,
    wallet: effectiveWallet,
  };
  const [pickerOpen, setPickerOpen] = useState(false);

  // Chip click handler. Behavior depends on what's installed:
  //   - Multiple wallets → open picker so user explicitly chooses MetaMask
  //     vs SafePal vs Rabby etc. (we save their pick for next time).
  //   - One wallet → request permissions directly on it.
  //   - Zero wallets → open picker which renders the "install a wallet" state.
  const handleChipClick = async () => {
    if (live.providers.length > 1 || live.providers.length === 0) {
      setPickerOpen(true);
      return;
    }
    // Single provider — make sure it's the preferred one, then request.
    if (live.providers[0] && !live.preferredProvider) {
      live.setPreferredProvider(live.providers[0].info.rdns);
    }
    await live.requestAccount();
  };

  const handlePickerSelect = async (picked: { info: { rdns: string } }) => {
    live.setPreferredProvider(picked.info.rdns);
    setPickerOpen(false);
    // Defer one tick so the preferredProvider state has updated, then prompt.
    await new Promise((r) => setTimeout(r, 0));
    await live.requestAccount();
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, thinking]);

  useEffect(() => {
    if (open && turns.length === 0) {
      setTurns([{
        role: 'assistant',
        content: 'Hi — I\'m Ambr Agent. Ask me anything about contracts, templates, pricing, your wallet, or how the platform works.',
      }]);
    }
  }, [open, turns.length]);

  async function ask(prefill?: string) {
    const text = (prefill ?? input).trim();
    if (!text || thinking) return;
    if (!prefill) setInput('');
    const nextTurns: Turn[] = [...turns, { role: 'user', content: text }];
    setTurns(nextTurns);
    setThinking(true);
    setError(null);
    setSuggestedHandoff(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['X-API-Key'] = apiKey;
      const res = await fetch('/api/v1/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ mode: 'ask', messages: nextTurns, context: effectiveContext }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? 'Ambr Agent failed');

      setTurns((prev) => [...prev, { role: 'assistant', content: json.reply }]);
      if (json.usage) setSessionUsage((prev) => applyTurnUsage(prev, json.usage));
      if (json.suggest_deploy) {
        setSuggestedHandoff({ template: json.suggest_deploy.template, intent: json.suggest_deploy.intent });
      }
    } catch (e) {
      setError((e as Error).message);
      setTurns((prev) => [...prev, { role: 'assistant', content: 'I had a hiccup — please try again.' }]);
    } finally {
      setThinking(false);
    }
  }

  function handoff() {
    if (!suggestedHandoff || !onHandoffToDeploy) return;
    onHandoffToDeploy(suggestedHandoff.template, suggestedHandoff.intent);
    setOpen(false);
  }

  if (hidden) return null;

  return (
    <>
      {/* Floating pill */}
      <AnimatePresence>
        {!open && (
          <motion.button
            key="pill"
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-6 right-6 z-40 px-4 py-2.5 rounded-full bg-gradient-to-br from-amber to-amber-dark text-background text-sm font-medium shadow-xl shadow-amber/20 hover:shadow-amber/40 transition-all inline-flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">Ambr Agent</span>
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Overlay wrapper. Two modes:
          - MAXIMIZED: true modal — dim+blur backdrop, click-outside-to-close,
            captures all dashboard clicks. Correct for full-screen mode.
          - FLOATING (default): non-modal tool. Wrapper is pointer-events-none
            so clicks pass through to the dashboard underneath. Only the inner
            card re-enables pointer-events. Lets users read/scroll/click the
            dashboard while chatting. Reported 2026-05-26: "remove the glassy
            overlay so we can still see the Dashboard while chatting". */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 z-40 ${
              maximized
                ? 'bg-background/40 backdrop-blur-sm'
                : 'pointer-events-none'
            }`}
            onClick={maximized ? () => setOpen(false) : undefined}
          >
            <motion.div
              key="card"
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.96 }}
              drag={!maximized}
              dragMomentum={false}
              dragListener={false}
              onClick={(e) => e.stopPropagation()}
              className={`pointer-events-auto ${
                maximized
                  ? 'fixed inset-4 lg:inset-12'
                  : 'fixed right-6 bottom-6 w-[min(440px,calc(100vw-3rem))] h-[min(560px,calc(100vh-6rem))]'
              } rounded-2xl border border-amber/40 bg-surface/95 backdrop-blur shadow-2xl shadow-amber/20 flex flex-col overflow-hidden`}
            >
              {/* Header — drag handle (focus mode only). Token chip moved
                  to the footer (above the input) on 2026-05-26 because the
                  header at 440px was overcrowded with title + wallet chip +
                  token chip + 4 action buttons — the title was wrapping to
                  2 lines. Footer gives the chip full width + progress bar
                  visibility and keeps the header breathable. */}
              <DragHandle
                onMaximize={() => setMaximized((m) => !m)}
                onClose={() => setOpen(false)}
                maximized={maximized}
                wallet={effectiveWallet}
                preferredProviderName={live.preferredProvider?.info.name ?? null}
                onChipClick={handleChipClick}
                onNewChat={startNewSession}
                onToggleHistory={() => setHistoryOpen((o) => !o)}
                historyOpen={historyOpen}
              />

              {/* History dropdown — overlays the chat content when open */}
              {historyOpen && (
                <div className="absolute left-0 right-0 top-12 mx-3 mt-1 z-30 max-h-72 overflow-y-auto rounded-lg border border-border bg-surface-elevated shadow-2xl">
                  <div className="sticky top-0 px-3 py-2 border-b border-border bg-surface-elevated flex items-center justify-between text-[11px]">
                    <span className="font-medium text-text-primary">Recent conversations</span>
                    <button onClick={() => setHistoryOpen(false)} className="text-text-secondary hover:text-text-primary">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  {historyLoading ? (
                    <div className="px-3 py-4 text-[11px] text-text-secondary inline-flex items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin" /> Loading…
                    </div>
                  ) : history.length === 0 ? (
                    <div className="px-3 py-4 text-[11px] text-text-secondary">No past conversations yet.</div>
                  ) : (
                    <ul className="divide-y divide-border/40">
                      {history.map((s) => {
                        const firstUser = s.turns.find((t) => t.role === 'user');
                        const preview = (firstUser?.content ?? '(no message)').slice(0, 80);
                        const isCurrent = sessionIdRef.current === s.id;
                        const ageMin = Math.max(1, Math.round((Date.now() - s.last_active_at) / 60_000));
                        const ageLabel =
                          ageMin < 60 ? `${ageMin}m ago`
                          : ageMin < 60 * 24 ? `${Math.round(ageMin / 60)}h ago`
                          : `${Math.round(ageMin / (60 * 24))}d ago`;
                        return (
                          <li key={s.id} className={`group flex items-start gap-2 px-3 py-2 hover:bg-amber/5 ${isCurrent ? 'bg-amber/10' : ''}`}>
                            <button
                              type="button"
                              onClick={() => loadSessionIntoChat(s.id)}
                              className="flex-1 min-w-0 text-left"
                            >
                              <div className="text-[11px] text-text-primary truncate">{preview}</div>
                              <div className="text-[10px] font-mono text-text-secondary/70 mt-0.5">
                                {ageLabel} · {s.turns.length} turns
                                {s.cumulative_cost_usd > 0 && ` · $${s.cumulative_cost_usd.toFixed(s.cumulative_cost_usd < 0.01 ? 4 : 3)}`}
                                {isCurrent && ' · current'}
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); removeSession(s.id); }}
                              className="p-1 rounded text-text-secondary/50 hover:text-error opacity-0 group-hover:opacity-100 transition-opacity"
                              aria-label="Delete this conversation"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              {/* Turns */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
                {turns.map((t, i) => (
                  <Bubble key={i} turn={t} />
                ))}
                {thinking && (
                  <div className="text-xs text-text-secondary inline-flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin text-amber" /> thinking…
                  </div>
                )}
                {suggestedHandoff && onHandoffToDeploy && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-lg border border-amber/40 bg-amber/5 p-3"
                  >
                    <p className="text-xs text-text-secondary mb-2">
                      Want me to take you to the deploy flow for{' '}
                      <span className="text-amber font-mono">{TEMPLATE_NAMES[suggestedHandoff.template]?.split(' — ')[0] ?? suggestedHandoff.template}</span>?
                    </p>
                    <button
                      onClick={handoff}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber text-background text-xs font-medium hover:shadow-md"
                    >
                      Take me to deploy <ArrowRight className="w-3 h-3" />
                    </button>
                  </motion.div>
                )}
                {error && <p className="text-xs text-error">{error}</p>}
                <div ref={bottomRef} />
              </div>

              {/* Quick chips */}
              {turns.length <= 1 && (
                <div className="px-4 pb-2 flex items-center gap-1.5 flex-wrap">
                  {QUICK_CHIPS.map((c) => (
                    <button
                      key={c.label}
                      onClick={() => ask(c.q)}
                      className="text-[11px] px-2 py-1 rounded-full border border-border bg-background/50 text-text-secondary hover:text-text-primary hover:border-amber/40 transition-colors"
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Token usage chip — sits above the input on its own row so
                  the chip has room for the progress bar without crowding
                  the header (which already has title + wallet badge + 4
                  action buttons). Hidden until first turn (TokenChip itself
                  no-ops when total tokens = 0). */}
              <div className="px-3 pt-1 pb-0.5 flex items-center justify-between border-t border-border/60">
                <span className="text-[10px] text-text-secondary/50 font-mono">
                  {turns.length > 1 ? `${turns.length - 1} turn${turns.length - 1 === 1 ? '' : 's'}` : ''}
                </span>
                <TokenChip
                  usage={sessionUsage}
                  onReset={() => { sessionIdRef.current = null; setTurns([]); setSessionUsage(EMPTY_SESSION_USAGE); }}
                />
              </div>

              {/* Input */}
              <div className="border-t border-border/60 p-3">
                <form
                  onSubmit={(e) => { e.preventDefault(); ask(); }}
                  className="flex items-end gap-2"
                >
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        ask();
                      }
                    }}
                    placeholder="Ask anything…"
                    rows={1}
                    className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:ring-2 focus:ring-amber max-h-28"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || thinking}
                    className="rounded-lg bg-amber text-background p-2 disabled:opacity-40 hover:shadow-md transition-all"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Wallet picker modal — shown when user clicks the chip and has 0 or 2+
          installed wallets. Uses the existing WalletPicker component (same one
          the reader portal uses) so the look matches. */}
      <AnimatePresence>
        {pickerOpen && (
          <motion.div
            key="wallet-picker-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/60 backdrop-blur flex items-center justify-center p-6"
            onClick={() => setPickerOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-xl border border-amber/40 bg-surface/95 p-5 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-text-primary">Pick a wallet</h3>
                <button
                  onClick={() => setPickerOpen(false)}
                  className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
                  aria-label="Close"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-text-secondary mb-3 leading-relaxed">
                You have multiple wallets installed. Pick which one Ambr should use
                for this site. Your choice is saved for next time.
              </p>
              <WalletPicker
                providers={live.providers}
                onPick={handlePickerSelect}
                variant="amber"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function DragHandle({
  onMaximize, onClose, maximized, wallet, preferredProviderName, onChipClick,
  onNewChat, onToggleHistory, historyOpen,
}: {
  onMaximize: () => void;
  onClose: () => void;
  maximized: boolean;
  wallet: string | null;
  preferredProviderName: string | null;
  onChipClick: () => void;
  onNewChat: () => void;
  onToggleHistory: () => void;
  historyOpen: boolean;
}) {
  // Short hex display for the connected wallet, e.g. "0x5a90…f6df".
  // Truthfully reflects what the agent sees — prevents the wallet-mismatch
  // confusion seen in testing on 2026-05-25 (importing NFTs against
  // a different MetaMask account than the one the chat captured).
  const shortWallet = wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : null;
  const pickWallet = onChipClick;

  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
      <Sparkles className="w-4 h-4 text-amber" />
      <span className="text-sm font-medium text-text-primary">Ambr Agent</span>
      {shortWallet ? (
        <button
          type="button"
          onClick={pickWallet}
          title={`${wallet}${preferredProviderName ? ` via ${preferredProviderName}` : ''} — click to switch wallet or provider`}
          aria-label={`Connected wallet ${wallet}, click to switch`}
          className="ml-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-400/10 border border-emerald-400/30 text-[11px] font-mono text-emerald-300 hover:bg-emerald-400/15 transition-colors"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden />
          {shortWallet}
          <span className="text-emerald-400/60">· {preferredProviderName ?? 'Base'}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={pickWallet}
          className="ml-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-text-secondary/10 border border-text-secondary/20 text-[11px] text-text-secondary hover:bg-text-secondary/15 transition-colors"
          title="Click to connect a wallet"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-text-secondary/50" aria-hidden />
          connect wallet
        </button>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={onToggleHistory}
          title="Recent conversations"
          aria-label="Toggle conversation history"
          aria-pressed={historyOpen}
          className={`p-1 rounded-md hover:bg-surface-elevated ${historyOpen ? 'text-amber' : 'text-text-secondary hover:text-text-primary'}`}
        >
          <History className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onNewChat}
          title="Start a new conversation"
          aria-label="New chat"
          className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onMaximize}
          className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
          aria-label={maximized ? 'Minimize' : 'Maximize'}
        >
          {maximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-text-secondary hover:text-error hover:bg-surface-elevated"
          aria-label="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function Bubble({ turn }: { turn: Turn }) {
  const isUser = turn.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`rounded-lg px-3 py-2 max-w-[88%] ${
          isUser
            ? 'bg-amber/15 text-text-primary border border-amber/30'
            : 'bg-surface-elevated text-text-primary border border-border/60'
        }`}
      >
        <p className="whitespace-pre-wrap leading-relaxed text-sm">{turn.content}</p>
      </div>
    </div>
  );
}
