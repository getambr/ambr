'use client';

/**
 * Chat-driven contract deploy flow.
 *
 * Hero is the live contract preview. Floating draggable chat card overlays it
 * in Focus mode; split view docks chat to the right. Drafts persist to
 * IndexedDB on every turn so a tab refresh doesn't lose work.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Maximize2, Minimize2, X, Send, Sparkles, Copy, Check, Loader2,
  ArrowRight, ExternalLink, FileText, AlertTriangle, ChevronRight,
} from 'lucide-react';
import {
  buildPreview,
  templateOptionsForChips,
  TEMPLATE_NAMES,
  TEMPLATE_PRICING_USD,
} from './contract-preview';
import {
  saveDraft,
  loadDraft,
  loadSession,
  saveSession,
  deleteDraft,
  newDraftId,
  type DraftContract,
} from '@/lib/storage/indexed-db';

type Layout = 'focus' | 'split';
type ChatTurn = { role: 'user' | 'assistant'; content: string; ts: number };

const LAYOUT_KEY = 'ambr_deploy_layout';
const ACTIVE_DRAFT_KEY = 'ambr_active_draft_id';

interface DeployChatProps {
  apiKey: string;
  wallet: string | null;
  userEmail?: string;
  initialIntent?: string | null;          // when handed off from global Ambr Agent
  initialTemplate?: string | null;
  draftIdToResume?: string | null;        // when resuming from Drafts list
  onSwitchToManual?: () => void;
  onDeployed?: (contract: { contract_id: string; sha256_hash: string; reader_url: string }) => void;
}

export default function DeployChat({
  apiKey,
  wallet,
  userEmail,
  initialIntent,
  initialTemplate,
  draftIdToResume,
  onSwitchToManual,
  onDeployed,
}: DeployChatProps) {
  const [draftId, setDraftId] = useState<string | null>(null);
  const [template, setTemplate] = useState<string | null>(initialTemplate ?? null);
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [readyToDeploy, setReadyToDeploy] = useState(false);
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [layout, setLayout] = useState<Layout>('focus');
  const [chatMinimized, setChatMinimized] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployed, setDeployed] = useState<null | { contract_id: string; sha256_hash: string; reader_url: string }>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const hydratedFromDraftId = useRef<string | null>(null);

  // ─── Initial layout pref + draft hydration ───────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAYOUT_KEY);
      if (saved === 'split' || saved === 'focus') setLayout(saved);
    } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      // Resume a specific draft from the Drafts list
      if (draftIdToResume && hydratedFromDraftId.current !== draftIdToResume) {
        try {
          const d = await loadDraft(draftIdToResume);
          const s = await loadSession(draftIdToResume);
          if (cancelled) return;
          if (d) {
            setDraftId(d.id);
            setTemplate(d.template);
            setParams(d.params);
            setMissing(d.missing_params ?? []);
            setReadyToDeploy(d.ready_to_deploy);
            try { localStorage.setItem(ACTIVE_DRAFT_KEY, d.id); } catch {}
          }
          if (s) setChatTurns(s.turns);
          hydratedFromDraftId.current = draftIdToResume;
        } catch {
          // IndexedDB unavailable — fall through to fresh draft
        }
        return;
      }

      // Resume the last active draft if no specific draft was requested
      if (!draftIdToResume && draftId === null) {
        try {
          const lastId = localStorage.getItem(ACTIVE_DRAFT_KEY);
          if (lastId) {
            const d = await loadDraft(lastId);
            const s = await loadSession(lastId);
            if (cancelled) return;
            if (d) {
              setDraftId(d.id);
              setTemplate(d.template);
              setParams(d.params);
              setMissing(d.missing_params ?? []);
              setReadyToDeploy(d.ready_to_deploy);
              if (s) setChatTurns(s.turns);
              return;
            }
          }
        } catch {}

        // Brand new session
        const newId = newDraftId();
        setDraftId(newId);
        try { localStorage.setItem(ACTIVE_DRAFT_KEY, newId); } catch {}

        // Greet the user; if there's an inbound intent from the global Agent,
        // turn it into the first user message and fire the chat.
        if (initialIntent && !cancelled) {
          setChatTurns([
            { role: 'assistant', content: 'Hi — let’s build that contract together.', ts: Date.now() },
            { role: 'user', content: initialIntent, ts: Date.now() + 1 },
          ]);
          setTimeout(() => callDeployChat([
            { role: 'user' as const, content: initialIntent },
          ]), 50);
        } else {
          setChatTurns([
            { role: 'assistant', content: 'Hi — what kind of agreement do you need?', ts: Date.now() },
          ]);
        }
      }
    }
    hydrate();
    return () => { cancelled = true; };
  }, [draftIdToResume]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Persist on changes ──────────────────────────────────────────────────
  useEffect(() => {
    if (!draftId) return;
    const intent_summary = chatTurns.find((t) => t.role === 'user')?.content?.slice(0, 140) ?? null;
    const draft: DraftContract = {
      id: draftId,
      template,
      params,
      principal: { wallet: wallet ?? undefined, email: userEmail },
      ready_to_deploy: readyToDeploy,
      missing_params: missing,
      intent_summary,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    const t = setTimeout(() => {
      saveDraft(draft).catch(() => {});
      saveSession({ id: draftId, turns: chatTurns }).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [draftId, template, params, missing, readyToDeploy, chatTurns, wallet, userEmail]);

  // Auto-scroll chat to bottom on new turn
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chatTurns, thinking]);

  function toggleLayout() {
    const next: Layout = layout === 'focus' ? 'split' : 'focus';
    setLayout(next);
    try { localStorage.setItem(LAYOUT_KEY, next); } catch {}
  }

  // ─── Chat orchestration ──────────────────────────────────────────────────
  const callDeployChat = useCallback(async (msgs: { role: 'user' | 'assistant'; content: string }[]) => {
    setThinking(true);
    setError(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['X-API-Key'] = apiKey;
      const res = await fetch('/api/v1/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mode: 'deploy',
          messages: msgs,
          extracted_params: params,
          template,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.message ?? 'Chat failed');
      }
      if (json.template) setTemplate(json.template);
      if (json.extracted_params) setParams(json.extracted_params);
      if (Array.isArray(json.missing_params)) setMissing(json.missing_params);
      setReadyToDeploy(Boolean(json.ready_to_deploy));

      const assistantText =
        (json.assistant_message ? json.assistant_message + ' ' : '') +
        (json.ready_to_deploy
          ? 'Looks good — ready to deploy when you are.'
          : (json.next_question ?? ''));

      if (assistantText.trim()) {
        setChatTurns((prev) => [...prev, { role: 'assistant', content: assistantText.trim(), ts: Date.now() }]);
      }
    } catch (e) {
      setError((e as Error).message);
      setChatTurns((prev) => [...prev, { role: 'assistant', content: 'I hit a snag — could you rephrase or try again?', ts: Date.now() }]);
    } finally {
      setThinking(false);
    }
  }, [apiKey, params, template]);

  function send() {
    const text = chatInput.trim();
    if (!text || thinking) return;
    setChatInput('');
    const nextTurns: ChatTurn[] = [...chatTurns, { role: 'user', content: text, ts: Date.now() }];
    setChatTurns(nextTurns);
    callDeployChat(nextTurns.map((t) => ({ role: t.role, content: t.content })));
  }

  // ─── Deploy ──────────────────────────────────────────────────────────────
  async function deploy() {
    if (!readyToDeploy || !template || deploying) return;
    setDeploying(true);
    setError(null);

    const principalName = (params.principal_name as string) || (params.consumer_name as string) || (params.buyer_name as string) || userEmail || 'Ambr User';
    const principalType = ((params.principal_type as string) === 'company') ? 'company' : 'individual';
    const principalAgentId = (params.agent_id as string) || (params.provider_agent_id as string) || (params.buyer_agent_id as string) || wallet || '0x0000000000000000000000000000000000000000';

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['X-API-Key'] = apiKey;

      const res = await fetch('/api/v1/contracts', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          template,
          parameters: params,
          principal_declaration: {
            principal_name: principalName,
            principal_type: principalType,
            agent_id: principalAgentId,
          },
          visibility: 'private',
          client_draft_id: draftId,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.message ?? 'Deploy failed');
      }

      setDeployed({
        contract_id: json.contract_id,
        sha256_hash: json.sha256_hash,
        reader_url: json.reader_url,
      });
      onDeployed?.({
        contract_id: json.contract_id,
        sha256_hash: json.sha256_hash,
        reader_url: json.reader_url,
      });

      // Draft has graduated to a real contract — drop the local copy
      if (draftId) {
        deleteDraft(draftId).catch(() => {});
        try { localStorage.removeItem(ACTIVE_DRAFT_KEY); } catch {}
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeploying(false);
    }
  }

  function startNew() {
    if (draftId) {
      deleteDraft(draftId).catch(() => {});
    }
    setDeployed(null);
    setDraftId(null);
    setTemplate(null);
    setParams({});
    setMissing([]);
    setReadyToDeploy(false);
    setChatTurns([]);
    hydratedFromDraftId.current = null;
    try { localStorage.removeItem(ACTIVE_DRAFT_KEY); } catch {}
    // The mount effect will fire and create a fresh draft.
    setTimeout(() => {
      const newId = newDraftId();
      setDraftId(newId);
      try { localStorage.setItem(ACTIVE_DRAFT_KEY, newId); } catch {}
      setChatTurns([{ role: 'assistant', content: 'Fresh start — what kind of agreement do you need?', ts: Date.now() }]);
    }, 50);
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  const preview = buildPreview(template, params);
  const filledCount = preview.rows.filter((r) => r.isFilled).length;
  const totalCount = preview.rows.length;
  const price = template ? TEMPLATE_PRICING_USD[template] ?? 0 : 0;

  if (deployed) {
    return <DeploySuccess deployed={deployed} onStartNew={startNew} />;
  }

  return (
    <div className="relative">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-micro">New contract</p>
          <h1 className="text-xl font-semibold text-text-primary">
            {template ? TEMPLATE_NAMES[template] ?? 'Drafting…' : 'Tell Ambr Agent what you need'}
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <FocusSplitToggle layout={layout} onToggle={toggleLayout} />
          {onSwitchToManual && (
            <button
              onClick={onSwitchToManual}
              className="text-xs text-text-secondary hover:text-text-primary inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border/60 hover:bg-surface-elevated transition-colors"
            >
              Manual <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Main: split or focus */}
      {layout === 'split' ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4">
          <ContractPreviewPane preview={preview} />
          <ChatPanel
            turns={chatTurns}
            input={chatInput}
            setInput={setChatInput}
            onSend={send}
            thinking={thinking}
            mode="docked"
            templateName={template ? TEMPLATE_NAMES[template] ?? null : null}
            chatBottomRef={chatBottomRef}
          />
        </div>
      ) : (
        <div className="relative">
          <ContractPreviewPane preview={preview} />
          {!chatMinimized && (
            <FloatingChatCard
              turns={chatTurns}
              input={chatInput}
              setInput={setChatInput}
              onSend={send}
              thinking={thinking}
              onMinimize={() => setChatMinimized(true)}
              templateName={template ? TEMPLATE_NAMES[template] ?? null : null}
              chatBottomRef={chatBottomRef}
            />
          )}
          {chatMinimized && (
            <button
              onClick={() => setChatMinimized(false)}
              className="fixed bottom-24 right-6 z-30 px-4 py-2.5 rounded-full bg-amber text-background text-sm font-medium shadow-lg hover:shadow-amber/30 transition-all inline-flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" /> Ambr Agent
            </button>
          )}
        </div>
      )}

      {/* Footer: Deploy CTA */}
      <div className="sticky bottom-0 z-20 -mx-4 lg:-mx-10 xl:-mx-16 2xl:-mx-24 px-4 lg:px-10 xl:px-16 2xl:px-24 mt-6 pt-4 pb-4 bg-gradient-to-t from-background via-background to-transparent border-t border-border/40">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-text-secondary flex items-center gap-3">
            {template ? (
              <>
                <span className="font-mono text-amber">{TEMPLATE_NAMES[template]?.split(' — ')[0]}</span>
                {totalCount > 0 && (
                  <>
                    <span>·</span>
                    <span>{filledCount} of {totalCount} fields filled</span>
                  </>
                )}
              </>
            ) : (
              <span>Select a template by chatting on the right.</span>
            )}
            {error && (
              <span className="text-error flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {error}
              </span>
            )}
          </div>
          <button
            onClick={deploy}
            disabled={!readyToDeploy || deploying}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              readyToDeploy && !deploying
                ? 'bg-gradient-to-r from-amber to-amber-dark text-background hover:shadow-lg hover:shadow-amber/30'
                : 'bg-surface-elevated text-text-secondary border border-border cursor-not-allowed'
            }`}
          >
            {deploying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Deploying…
              </>
            ) : readyToDeploy ? (
              <>
                Deploy contract — ${price.toFixed(2)} <ArrowRight className="w-4 h-4" />
              </>
            ) : (
              <>
                Deploy contract — {missing.length} field{missing.length === 1 ? '' : 's'} left
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function FocusSplitToggle({ layout, onToggle }: { layout: Layout; onToggle: () => void }) {
  return (
    <div className="inline-flex items-center rounded-md border border-border bg-surface text-xs overflow-hidden">
      <button
        onClick={() => layout === 'split' && onToggle()}
        className={`px-2.5 py-1 transition-colors ${layout === 'focus' ? 'bg-amber/15 text-amber' : 'text-text-secondary hover:text-text-primary'}`}
      >Focus</button>
      <button
        onClick={() => layout === 'focus' && onToggle()}
        className={`px-2.5 py-1 transition-colors ${layout === 'split' ? 'bg-amber/15 text-amber' : 'text-text-secondary hover:text-text-primary'}`}
      >Split</button>
    </div>
  );
}

function ContractPreviewPane({ preview }: { preview: ReturnType<typeof buildPreview> }) {
  const { templateName, rows, introText } = preview;

  if (!templateName) {
    // Empty / starter state
    const chips = templateOptionsForChips();
    return (
      <div className="rounded-2xl border border-border bg-surface-elevated/40 p-8 min-h-[420px] flex flex-col items-center justify-center text-center">
        <FileText className="w-10 h-10 text-amber/40 mb-4" />
        <p className="max-w-md text-sm text-text-secondary mb-6">{introText}</p>
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {chips.map((c) => (
            <div key={c.slug} className="rounded-lg border border-border bg-surface px-3 py-2 text-left">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-mono text-amber">{c.label}</span>
                <span className="text-xs text-text-secondary">${c.priceUsd.toFixed(2)}</span>
              </div>
              <div className="text-xs text-text-primary">{c.name}</div>
            </div>
          ))}
        </div>
        <p className="mt-6 text-[11px] text-text-secondary/50">
          Ambr Agent will pick the right template from your intent.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface/40 p-6 lg:p-8 min-h-[420px]">
      <div className="flex items-center justify-between mb-4">
        <p className="text-micro">Contract preview</p>
        <span className="text-[11px] font-mono text-text-secondary/60">draft</span>
      </div>
      <h2 className="text-lg font-semibold text-text-primary mb-4">{templateName}</h2>

      <div className="space-y-1.5 mb-6 font-mono text-xs">
        {rows.map((r) => (
          <div key={r.field} className="grid grid-cols-[140px_1fr] gap-3 py-1 border-b border-border/30">
            <span className="text-text-secondary">{r.label}:</span>
            <span className={r.isFilled ? 'text-text-primary' : 'text-amber/60 italic'}>
              {r.value}
            </span>
          </div>
        ))}
      </div>

      <p className="text-sm leading-relaxed text-text-secondary/80 italic">
        {preview.introText}
      </p>

      <p className="mt-6 text-[11px] text-text-secondary/40">
        Final contract text is generated by Ambr&apos;s engine on deploy, hashed (SHA-256), and minted as paired cNFTs on Base L2.
      </p>
    </div>
  );
}

function ChatPanel({
  turns, input, setInput, onSend, thinking, mode, templateName, chatBottomRef,
}: {
  turns: ChatTurn[];
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  thinking: boolean;
  mode: 'docked' | 'floating';
  templateName: string | null;
  chatBottomRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className={`rounded-2xl border border-amber/40 bg-surface/95 backdrop-blur flex flex-col ${mode === 'docked' ? 'h-[520px]' : 'h-[360px] w-[360px]'}`}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
        <Sparkles className="w-4 h-4 text-amber" />
        <span className="text-sm font-medium text-text-primary">Ambr Agent</span>
        {templateName && (
          <span className="ml-auto text-[10px] font-mono text-text-secondary">
            {templateName.split(' — ')[0]}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
        {turns.map((t, i) => (
          <ChatBubble key={i} turn={t} />
        ))}
        {thinking && (
          <div className="text-xs text-text-secondary inline-flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin text-amber" /> thinking…
          </div>
        )}
        <div ref={chatBottomRef} />
      </div>

      <div className="border-t border-border/60 p-3">
        <form
          onSubmit={(e) => { e.preventDefault(); onSend(); }}
          className="flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="Type your message…"
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
    </div>
  );
}

function ChatBubble({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`rounded-lg px-3 py-2 max-w-[85%] ${
          isUser
            ? 'bg-amber/15 text-text-primary border border-amber/30'
            : 'bg-surface-elevated text-text-primary border border-border/60'
        }`}
      >
        <p className="whitespace-pre-wrap leading-relaxed">{turn.content}</p>
      </div>
    </div>
  );
}

function FloatingChatCard(props: {
  turns: ChatTurn[];
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  thinking: boolean;
  onMinimize: () => void;
  templateName: string | null;
  chatBottomRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <motion.div
      drag
      dragMomentum={false}
      dragConstraints={{ top: -200, left: -1000, right: 1000, bottom: 200 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="absolute right-4 bottom-4 z-30 cursor-grab active:cursor-grabbing shadow-2xl"
    >
      <div className="relative">
        <button
          onClick={props.onMinimize}
          className="absolute -top-2 -right-2 z-10 w-6 h-6 rounded-full bg-surface border border-border flex items-center justify-center text-text-secondary hover:text-text-primary"
          aria-label="Minimize chat"
        >
          <X className="w-3 h-3" />
        </button>
        <ChatPanel {...props} mode="floating" />
      </div>
    </motion.div>
  );
}

// ─── Success state ─────────────────────────────────────────────────────────

function DeploySuccess({
  deployed,
  onStartNew,
}: {
  deployed: { contract_id: string; sha256_hash: string; reader_url: string };
  onStartNew: () => void;
}) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(deployed.reader_url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <div className="max-w-2xl mx-auto py-12">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-8 text-center"
      >
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/15 mb-4">
          <Check className="w-6 h-6 text-emerald-400" />
        </div>
        <h2 className="text-xl font-semibold text-text-primary mb-1">Contract deployed</h2>
        <p className="text-sm text-text-secondary mb-6">
          <span className="font-mono text-amber">{deployed.contract_id}</span> · hash{' '}
          <span className="font-mono">{deployed.sha256_hash.slice(0, 12)}…</span>
        </p>

        <div className="rounded-lg border border-border bg-surface p-3 mb-4 text-left">
          <p className="text-[10px] uppercase tracking-wider text-text-secondary mb-1">Reader portal URL</p>
          <div className="flex items-center justify-between gap-2">
            <code className="font-mono text-xs text-text-primary truncate">{deployed.reader_url}</code>
            <button
              onClick={copy}
              className="shrink-0 text-xs px-2 py-1 rounded-md border border-border bg-background hover:bg-surface-elevated inline-flex items-center gap-1"
            >
              {copied ? <><Check className="w-3 h-3 text-emerald-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 justify-center flex-wrap">
          <a
            href={deployed.reader_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber/15 text-amber border border-amber/30 text-sm font-medium hover:bg-amber/25"
          >
            Open reader portal <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={onStartNew}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm font-medium hover:bg-surface-elevated"
          >
            Deploy another <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <p className="mt-6 text-xs text-text-secondary/60">
          Share the reader URL with your counterparty. Their wallet will mint the paired cNFT when they approve.
        </p>
      </motion.div>
    </div>
  );
}

// Re-export helpers so other components can stay decoupled
export { Maximize2, Minimize2 };
