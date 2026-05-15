'use client';

/**
 * Global Ambr Agent — floating pill on every dashboard section.
 * Click to open a movable modal chat overlay for general Q&A about Ambr.
 * Can hand off to the deploy flow when the user wants to create a contract.
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Send, ArrowRight, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import { TEMPLATE_NAMES } from '@/components/deploy/contract-preview';

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
        body: JSON.stringify({ mode: 'ask', messages: nextTurns, context }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? 'Ambr Agent failed');

      setTurns((prev) => [...prev, { role: 'assistant', content: json.reply }]);
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

      {/* Modal overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-background/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
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
              className={`${
                maximized
                  ? 'fixed inset-4 lg:inset-12'
                  : 'fixed right-6 bottom-6 w-[min(440px,calc(100vw-3rem))] h-[min(560px,calc(100vh-6rem))]'
              } rounded-2xl border border-amber/40 bg-surface/95 backdrop-blur shadow-2xl shadow-amber/20 flex flex-col overflow-hidden`}
            >
              {/* Header — drag handle (focus mode only) */}
              <DragHandle
                onMaximize={() => setMaximized((m) => !m)}
                onClose={() => setOpen(false)}
                maximized={maximized}
              />

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
    </>
  );
}

function DragHandle({
  onMaximize, onClose, maximized,
}: {
  onMaximize: () => void;
  onClose: () => void;
  maximized: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
      <Sparkles className="w-4 h-4 text-amber" />
      <span className="text-sm font-medium text-text-primary">Ambr Agent</span>
      <div className="ml-auto flex items-center gap-1">
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
