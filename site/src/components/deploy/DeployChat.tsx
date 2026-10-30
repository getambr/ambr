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
  ArrowRight, ExternalLink, FileText, AlertTriangle, ChevronRight, Mail, Plus, RefreshCw,
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
import { useWalletStatus } from '@/lib/wallet/use-wallet-status';
import TokenChip, { applyTurnUsage, EMPTY_SESSION_USAGE, type SessionUsage } from '@/components/ambr-agent/TokenChip';
import WalletFieldControl from './WalletFieldControl';
import AgentConnectCard from './AgentConnectCard';
import { describeDeployCost, describeCreditsAfterDeploy, priceCentsBySlug } from '@/lib/deploy/cost';
import {
  buildDeployRequestBody,
  signerNotice,
  OWN_WALLET_FIELD_BY_TEMPLATE as FIELD_BY_TEMPLATE,
  AGENT_WALLET_FIELD_BY_TEMPLATE,
} from '@/lib/deploy/request';
import { decideOwnWalletFill, statedWalletHistory } from '@/lib/deploy/wallet-intent';

type Layout = 'focus' | 'split';
// `fromModel` marks a user-role turn whose words the assistant wrote (the intent
// handed over from the global agent): it is sent to the chat so the model can
// read it, but never counts as something the user stated.
type ChatTurn = { role: 'user' | 'assistant'; content: string; ts: number; fromModel?: boolean };
type WireMessage = { role: 'user' | 'assistant'; content: string; fromModel?: boolean };

function toWire(turns: readonly ChatTurn[]): WireMessage[] {
  return turns.map((t) => (t.fromModel ? { role: t.role, content: t.content, fromModel: true } : { role: t.role, content: t.content }));
}

const LAYOUT_KEY = 'ambr_deploy_layout';
export const ACTIVE_DRAFT_KEY = 'ambr_active_draft_id';

interface DeployChatProps {
  apiKey: string;
  wallet: string | null;
  userEmail?: string;
  initialIntent?: string | null;          // when handed off from global Ambr Agent
  initialTemplate?: string | null;
  draftIdToResume?: string | null;        // when resuming from Drafts list
  /** User's subscription tier from data.user.tier (e.g. 'developer', 'startup').
   *  Drives credit-vs-dollar pricing in the Deploy CTA. Null when authed by
   *  wallet only (no api_key) — in that case x402 USDC pricing applies and the
   *  dollar quote IS correct. */
  tier?: string | null;
  /** Remaining credits in the user's monthly allowance. Null for wallet-only
   *  auth. 0 = out of free credits, either upgrade or pay overage. */
  credits?: number | null;
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
  tier,
  credits,
  onSwitchToManual,
  onDeployed,
}: DeployChatProps) {
  const [draftId, setDraftId] = useState<string | null>(null);
  const [template, setTemplate] = useState<string | null>(initialTemplate ?? null);
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [missing, setMissing] = useState<string[]>([]);
  // Fields the user has confirmed via the inline WalletFieldControl (or any
  // other explicit-click control). When a field is in this set, the chat
  // endpoint MUST NOT overwrite it from LLM extraction — the user's click
  // beats Kimi's text interpretation. Threaded to the server as
  // `confirmed_fields: string[]` in every chat POST body.
  const [confirmedFields, setConfirmedFields] = useState<Set<string>>(new Set());
  // readyToDeploy is DERIVED below from template + params, not a setState. The
  // previous version persisted ready_to_deploy into IndexedDB and re-hydrated
  // it on page load — which left users (e.g. 2026-05-17) stuck with a
  // greyed Deploy button after a buggy turn even after the server-side bug was
  // fixed, because no setter ran on plain refresh. Single source of truth now:
  // if the required preview rows are all filled, the button is enabled.
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [layout, setLayout] = useState<Layout>('focus');
  const [chatMinimized, setChatMinimized] = useState(false);
  // When set, the A2A ("Agent-to-Agent" / c3-task-execution) chip was clicked.
  // A2A contracts are deployed BY an agent via MCP, not by a human form — so
  // instead of the chat flow we show the AgentConnectCard. Cleared by "Back to
  // templates". Only ever set to 'c3-task-execution' today.
  const [agentConnectSlug, setAgentConnectSlug] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  // Template prices in credits (1 credit = 1 cent), from the public template
  // list. Empty until it loads or when it fails; the Deploy button then names
  // no cost (lib/deploy/cost.ts).
  const [priceCents, setPriceCents] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/templates')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (!cancelled) setPriceCents(priceCentsBySlug(json)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  // Token chip running totals — updated per turn from json.usage. Reset
  // alongside chatTurns when the user clicks "New chat" or the token-chip
  // "Reset session" button (frees the LLM context window).
  const [sessionUsage, setSessionUsage] = useState<SessionUsage>(EMPTY_SESSION_USAGE);
  const [deployed, setDeployed] = useState<null | { contract_id: string; sha256_hash: string; reader_url: string }>(null);
  // Surfaces autosave activity in the chat header so users know their work is
  // being persisted (the IndexedDB autosave was invisible before this — common
  // confusion: "is my draft saved?"). Updated by the persist effect below.
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const hydratedFromDraftId = useRef<string | null>(null);

  // ─── Live wallet detection ───────────────────────────────────────────────
  // The `wallet` prop comes from data.wallet (server `/wallet-auth` result),
  // which is whatever wallet was bound to this account at /wallet-auth time —
  // STALE if the user has since switched extensions or accounts. The user
  // might still have SafePal/MetaMask connected at the browser level with a
  // DIFFERENT account selected. useWalletStatus() reads the EIP-6963
  // preferred-provider's eth_accounts so we know the live, currently-active
  // address.
  //
  // PRIORITY: live first, server-bound as fallback. Original priority was
  // reversed (prop first) which created a bug where a user who switched
  // MetaMask accounts saw their stuck draft show the OLD server-bound wallet
  // — and the "Use connected wallet" swap button never appeared because
  // effectiveWallet equalled the stuck field's value. Live-first means the
  // auto-fill effect and the deploy POST body both reflect what the user is
  // ACTUALLY about to sign with, which is what matters for UX + cryptographic
  // intent. Server-bound only kicks in when no extension is connected. (2026-05-26)
  const live = useWalletStatus();
  const effectiveWallet = live.wallet ?? wallet ?? null;

  // ─── Derived state ───────────────────────────────────────────────────────
  // readyToDeploy is the single source of truth for whether the Deploy button
  // should be live. Computed each render from template + params via the
  // preview module's required-rows count. This avoids the stale-IndexedDB
  // case where a draft persisted ready_to_deploy=false from a buggy turn
  // (pre 4613789) would leave Deploy greyed even after the server-side bug
  // was fixed — because on plain refresh, no setter would ever run to flip it.
  // Declared early so the persist useEffect below can include it in its deps.
  const preview = buildPreview(template, params);
  const requiredRows = preview.rows.filter((r) => !r.optional);
  const filledCount = requiredRows.filter((r) => r.isFilled).length;
  const totalCount = requiredRows.length;
  const readyToDeploy = totalCount > 0 && filledCount === totalCount;

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
            // readyToDeploy is derived from template + params below; no setter
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
              // readyToDeploy is derived from template + params below; no setter
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
        // turn it into the first user message and fire the chat. The intent is
        // the agent's wording, so it is marked as the model's: a wallet in it is
        // never read as one the user stated.
        if (initialIntent && !cancelled) {
          setChatTurns([
            { role: 'assistant', content: 'Hi — let’s build that contract together.', ts: Date.now() },
            { role: 'user', content: initialIntent, ts: Date.now() + 1, fromModel: true },
          ]);
          setTimeout(() => callDeployChat([
            { role: 'user' as const, content: initialIntent, fromModel: true },
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

    // Don't persist a draft until the user has actually contributed something.
    // Without this guard, merely mounting DeployChat (which happens when the
    // user clicks "Create Contract" even briefly) auto-creates an empty draft
    // row in IndexedDB that then shows up in the Drafts list as
    // "No template yet · 0 fields filled." Reported by user 2026-05-26.
    // The draftId is still allocated on mount (hydration effect above) so when
    // the user DOES contribute, the persist effect knows which row to write
    // to. ACTIVE_DRAFT_KEY in localStorage is independent of the IndexedDB
    // row, so active-session pointer-restoration still works.
    const hasUserTurn = chatTurns.some((t) => t.role === 'user');
    const hasParams = Object.keys(params).length > 0;
    const hasTemplate = template !== null;
    if (!hasUserTurn && !hasParams && !hasTemplate) return;

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
      saveDraft(draft)
        .then(() => setLastSavedAt(Date.now()))
        .catch(() => {});
      saveSession({ id: draftId, turns: chatTurns }).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [draftId, template, params, missing, readyToDeploy, chatTurns, wallet, userEmail]);

  // Auto-fill the user's own wallet into the template's principal-side field
  // the moment a template is picked. A1's consumer_agent_id (buyer wallet) and
  // D1's principal_agent_id (authorizer wallet) were originally omitted from
  // their schemas (A1 was B2C, D1 ambiguous). User has SafePal/MetaMask already
  // connected — making them type their own address is silly. C1 already has
  // buyer_agent_id and we let the LLM extract that conversationally; same
  // auto-fill works there too in case the user didn't mention it.
  //
  // `params` is in the deps array on purpose: when a chat round-trip replaces
  // params with a server response that omits our auto-filled field, the
  // effect re-fires and the autoFilledRef-aware logic either no-ops (still
  // present, untouched) or refreshes (got cleared, or wallet changed). Uses
  // `effectiveWallet` so the fill works even when the server-bound `wallet`
  // prop is null but SafePal/MetaMask is connected at the browser level.
  //
  // autoFilledRef tracks the LAST value this effect wrote into each field.
  // When the user switches wallets (A → B), if the field still holds A (i.e.
  // user hasn't typed something else), we know it's safe to overwrite with B.
  // If the field holds something we DIDN'T write (user-typed in chat, or LLM
  // extracted a different wallet), we leave it alone — that user intent wins.
  // Replaces the previous `if (params[field]) return` guard, which left stale
  // wallets stuck on drafts the user couldn't update via chat. (2026-05-26)
  // The maps from template to its own-wallet and agent-wallet parameters live in
  // lib/deploy/request.ts, next to the request body that reads them.
  // A wallet the user stated as their own in chat wins over the connected one
  // (see decideOwnWalletFill), and a later statement corrects an earlier one; a
  // value the model put in the field, or one confirmed through a UI control, is
  // never replaced.
  const autoFilledRef = useRef<Record<string, string | undefined>>({});
  const adoptedRef = useRef<Record<string, string | undefined>>({});
  useEffect(() => {
    if (!template) return;
    const field = FIELD_BY_TEMPLATE[template];
    if (!field) return;

    // The decision and the state it carries between runs live in
    // decideOwnWalletFill; this effect only feeds it and applies the result.
    const statedOwn = statedWalletHistory(chatTurns).own;
    const { write, state } = decideOwnWalletFill({
      current: params[field] as string | undefined,
      state: { lastAuto: autoFilledRef.current[field], adopted: adoptedRef.current[field] },
      stated: statedOwn.at(-1) ?? null,
      statedHistory: statedOwn,
      connected: effectiveWallet,
      confirmed: confirmedFields.has(field),
    });
    autoFilledRef.current[field] = state.lastAuto;
    adoptedRef.current[field] = state.adopted;
    if (write) setParams((p) => ({ ...p, [field]: write }));
  }, [effectiveWallet, template, params, chatTurns, confirmedFields]);

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
  const callDeployChat = useCallback(async (msgs: WireMessage[], opts?: { templateOverride?: string | null; paramsOverride?: Record<string, unknown>; confirmedFieldsOverride?: string[] }) => {
    setThinking(true);
    setError(null);
    // Belt-and-braces client timeout — if the connection drops while waiting
    // for the route, we'd otherwise hang indefinitely. 58s sits just under
    // Vercel's 60s maxDuration; the server's own AbortController (45s on
    // Moonshot/Anthropic) almost always returns before us, so this only trips
    // when the route itself doesn't respond.
    const ctl = new AbortController();
    const ctlTimer = setTimeout(() => ctl.abort(), 58_000);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['X-API-Key'] = apiKey;
      // When a chip pick just set a new template + cleared params, React state
      // hasn't flushed yet, so this closure still holds the OLD values. The
      // caller passes overrides so the server receives the just-picked template
      // (and empty params) on this very turn.
      const bodyTemplate = opts?.templateOverride !== undefined ? opts.templateOverride : template;
      const bodyParams = opts?.paramsOverride !== undefined ? opts.paramsOverride : params;
      const res = await fetch('/api/v1/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mode: 'deploy',
          messages: msgs,
          extracted_params: bodyParams,
          template: bodyTemplate,
          // Fields the user has set via inline UI controls (WalletFieldControl
          // for wallet fields, etc.). Server protects these keys from LLM
          // extraction overwrite. Without this guard, Kimi mis-extracting a
          // "this same" answer would silently overwrite the user's explicit
          // click choice with the wrong wallet. The override exists because
          // this closure goes stale within the same tick as a setConfirmedFields
          // call (confirmedFields is not in the deps array) — a confirm-triggered
          // turn must pass the fresh set itself.
          confirmed_fields: opts?.confirmedFieldsOverride ?? Array.from(confirmedFields),
        }),
        signal: ctl.signal,
      });
      // Defensive JSON parse — when the server times out (Vercel function
      // killed) the response body is HTML, not JSON. Without this we'd
      // throw "Unexpected token 'A', 'An error o...' is not valid JSON" at
      // the user. Show something readable instead.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let json: any = null;
      try {
        json = await res.json();
      } catch {
        if (res.status === 504 || res.status >= 500) {
          throw new Error('The server is taking too long. Please try again in a moment.');
        }
        throw new Error(`Server returned an unexpected response (HTTP ${res.status}). Please try again.`);
      }
      if (!res.ok) {
        throw new Error(json?.message ?? 'Chat failed');
      }
      // A2A (c3-task-execution) is agent-deployed — it has no human form. If the
      // chat classified the intent as A2A (e.g. the user typed "agent to agent"
      // instead of clicking the chip), reroute to the Connect-your-agent card
      // rather than locking the 11-field form. The `finally` block clears
      // `thinking`; we intentionally skip the rest of the form-oriented response
      // handling (param merge, field counter, next-question bubble).
      if (json.template === 'c3-task-execution') {
        setAgentConnectSlug('c3-task-execution');
        return;
      }
      // Adopt the server's template ONLY when we don't already have one locked.
      // Once a template is chosen (chip pick or first classification) it stays
      // put — switching is an explicit chip action (handleTemplatePick). This
      // stops the LLM/server from swapping the contract type mid-conversation.
      setTemplate((prev) => prev ?? json.template ?? null);
      // Merge instead of replace so client-side auto-fills (consumer_agent_id
      // from the connected wallet, etc.) survive chat round-trips. The LLM
      // only ever ADDS to extracted_params — it never intentionally clears a
      // field we sent it — so a shallow merge is safe. If the LLM ever wanted
      // to clear something, it would emit an empty string, which the merge
      // would still propagate. Replace-mode was wiping consumer_agent_id on
      // every turn because the LLM doesn't echo it back (per the prompt:
      // "do NOT ask the user for this field").
      if (json.extracted_params) {
        // Previously the client maintained an agent_id ≠ effectiveWallet guard
        // here, but it stripped silently with no UI feedback (user thought
        // their "Yes use that" answer worked when actually the field stayed
        // empty). That responsibility is now enforced server-side in
        // validateReadyState() — the server strips the duplicate from
        // `merged` AND pushes an explanatory warning into validation_warnings
        // which we surface as a synthetic chat bubble below. Result: same
        // protection, visible to the user. (2026-05-26)
        setParams((prev) => ({ ...prev, ...json.extracted_params }));
      }
      if (Array.isArray(json.missing_params)) {
        setMissing(json.missing_params);
        // Also strip stale local values for fields the server flagged as
        // missing. Without this, the shallow-merge in setParams above keeps
        // the bad value (e.g. agent_id == principal_agent_id after server
        // strip), the preview shows it as "filled", the counter ticks to
        // N/N, and Deploy enables on invalid state. Seen
        // 2026-05-27 on a P2 deploy showing "9 of 9 fields filled" with
        // agent_id duplicating principal_agent_id.
        // Exception: do NOT strip confirmedFields — those were set via an
        // explicit UI click and shouldn't be wiped just because the LLM
        // didn't echo them back this turn.
        if (json.missing_params.length > 0) {
          setParams((prev) => {
            const next = { ...prev };
            for (const k of json.missing_params as string[]) {
              if (!confirmedFields.has(k)) delete next[k];
            }
            return next;
          });
        }
      }
      // Surface any server-side validation warnings as a synthetic assistant
      // bubble in the chat. Without this the server's signal that "agent_id
      // must differ from principal_agent_id" never reached the user — they
      // just saw an empty field with no explanation. Now they get the warning
      // text inline AND the LLM's next_question, so they know exactly what
      // to do.
      if (Array.isArray(json.validation_warnings) && json.validation_warnings.length > 0) {
        const warningText = json.validation_warnings[0];
        setChatTurns((prev) => {
          // Avoid duplicating the warning if the server re-emits the same one
          // on consecutive turns (e.g. user hasn't fixed the issue yet).
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && last.content === `⚠ ${warningText}`) {
            return prev;
          }
          return [...prev, { role: 'assistant', content: `⚠ ${warningText}`, ts: Date.now() }];
        });
      }
      // Accumulate per-turn usage into the session counter (token chip).
      if (json.usage) setSessionUsage((prev) => applyTurnUsage(prev, json.usage));
      // readyToDeploy derives from template + params; server's value is
      // informational only (we use json.ready_to_deploy below for the
      // assistant-message phrasing but no longer store it in state).

      // Compose the assistant bubble. Only add the "ready to deploy" nudge when
      // the server message doesn't ALREADY convey readiness and isn't itself a
      // question — otherwise the bubble doubles up ("All set… Looks good —
      // ready to deploy…") or contradicts itself ("switch to D1, or stick with
      // P2? Looks good — ready to deploy"). (tester P2 session, 2026-06-01.)
      const serverMsg = (json.assistant_message ?? '').trim();
      let tail = '';
      if (json.ready_to_deploy) {
        const alreadyConveysReady = /\b(deploy|ready|all set)\b/i.test(serverMsg);
        const isQuestion = serverMsg.endsWith('?');
        if (!alreadyConveysReady && !isQuestion) {
          tail = 'Looks good — ready to deploy when you are.';
        }
      } else {
        tail = json.next_question ?? '';
      }
      const assistantText = [serverMsg, tail].filter(Boolean).join(' ');

      if (assistantText.trim()) {
        setChatTurns((prev) => [...prev, { role: 'assistant', content: assistantText.trim(), ts: Date.now() }]);
      }
    } catch (e) {
      const err = e as Error;
      const message =
        err.name === 'AbortError'
          ? 'The server is taking too long. Please try again in a moment.'
          : err.message || 'Chat failed';
      setError(message);
      // Surface the server's message when it's specific (e.g., validation details)
      // — keeps the generic friendly tone but tells the user WHY when we know.
      const looksGeneric = message === 'Chat failed' || message.length < 12;
      setChatTurns((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: looksGeneric
            ? 'I hit a snag — could you rephrase or try again?'
            : `I hit a snag — ${message}`,
          ts: Date.now(),
        },
      ]);
    } finally {
      clearTimeout(ctlTimer);
      setThinking(false);
    }
  }, [apiKey, params, template]);

  function send() {
    const text = chatInput.trim();
    if (!text || thinking) return;
    setChatInput('');
    const nextTurns: ChatTurn[] = [...chatTurns, { role: 'user', content: text, ts: Date.now() }];
    setChatTurns(nextTurns);
    callDeployChat(toWire(nextTurns));
  }

  // ─── Template chip → start the chat with a per-template starter prompt ──
  // Chips in the empty preview state used to be visual-only. Now clicking
  // them seeds the chat with a clear opening line so the agent immediately
  // knows the intent. Keeps the agent's classifier in control — we don't
  // pre-set template state; the LLM still extracts it.
  const handleTemplatePick = useCallback((slug: string) => {
    if (thinking) return;
    // A2A is agent-deployed, not form-filled: show the "connect your agent"
    // card instead of seeding the chat flow. (See AgentConnectCard.)
    if (slug === 'c3-task-execution') {
      setAgentConnectSlug(slug);
      return;
    }
    // Deterministic switch: explicitly LOCK this template and reset per-template
    // state so a switch starts clean (no cross-template param leak). The
    // classifier no longer auto-switches templates mid-flow, so the chip IS the
    // switch mechanism — and the overrides below make the server receive this
    // template on the very next turn (state hasn't flushed yet).
    setTemplate(slug);
    setParams({});
    setMissing([]);
    setConfirmedFields(new Set());
    autoFilledRef.current = {};
    adoptedRef.current = {};
    const STARTER_PROMPTS: Record<string, string> = {
      'a1-service-purchase':
        "I'd like to buy a service from a provider. Help me draft the agreement.",
      'd1-general-auth':
        "I'd like to authorize an AI agent to act on my behalf. Help me draft the authorization.",
    };
    const prompt = STARTER_PROMPTS[slug] ?? `Let's set up a ${TEMPLATE_NAMES[slug] ?? slug} contract.`;
    const nextTurns: ChatTurn[] = [...chatTurns, { role: 'user', content: prompt, ts: Date.now() }];
    setChatTurns(nextTurns);
    setChatMinimized(false);
    callDeployChat(toWire(nextTurns), { templateOverride: slug, paramsOverride: {} });
  }, [chatTurns, callDeployChat, thinking]);

  // ─── Wallet field confirmed → advance the conversation ───────────────────
  // Tester bug (2026-07-17): pressing Confirm on a wallet field only updated
  // local state — no turn fired, so the assistant sat silent until the user
  // typed something ("confirmed"). Mirror handleTemplatePick: append a
  // synthetic user turn and call the server with fresh-state overrides — BOTH
  // the params and confirmedFields closures inside callDeployChat are stale
  // within this tick, so each must be passed explicitly. The confirmed_fields
  // override is what keeps the server's protect-strip guarding the clicked
  // value against LLM re-extraction on this very turn.
  const WALLET_FIELD_PHRASE: Record<string, string> = {
    agent_id: "the agent's wallet",
    principal_agent_id: 'my signing wallet',
    consumer_agent_id: 'my signing wallet',
    buyer_agent_id: 'my signing wallet',
  };
  const handleAgentWalletConfirm = useCallback((field: string, wallet: string) => {
    setParams((p) => ({ ...p, [field]: wallet }));
    setConfirmedFields((s) => {
      const next = new Set(s);
      next.add(field);
      return next;
    });
    // Also remove from `missing` so the field counter ticks immediately —
    // the triggered turn below gets the server's re-confirmation.
    setMissing((m) => m.filter((k) => k !== field));
    // If a turn is already in flight, keep the state updates but don't fire a
    // competing request; the next send carries the updated state anyway.
    if (thinking) return;
    const short = wallet.length > 12 ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : wallet;
    const phrase = WALLET_FIELD_PHRASE[field] ?? field.replace(/_/g, ' ');
    const nextTurns: ChatTurn[] = [...chatTurns, { role: 'user', content: `I've set ${phrase} to ${short}.`, ts: Date.now() }];
    setChatTurns(nextTurns);
    callDeployChat(toWire(nextTurns), {
      paramsOverride: { ...params, [field]: wallet },
      confirmedFieldsOverride: [...Array.from(confirmedFields), field],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatTurns, params, confirmedFields, callDeployChat, thinking]);

  // "Use connected wallet" had the identical silent-stall bug — same path now.
  const handleUseConnectedWallet = useCallback((field: string) => {
    if (!effectiveWallet) return;
    autoFilledRef.current[field] = effectiveWallet;
    handleAgentWalletConfirm(field, effectiveWallet);
  }, [effectiveWallet, handleAgentWalletConfirm]);

  // ─── Deploy ──────────────────────────────────────────────────────────────
  async function deploy() {
    if (!readyToDeploy || !template || deploying) return;
    // A one-sided template is signed by the authorizer alone. With no wallet
    // connected and none typed into the form, nobody could ever sign it, so
    // say so here instead of charging for it.
    if (
      template === 'p2-power-of-attorney' &&
      !effectiveWallet &&
      !/^0x[a-fA-F0-9]{40}$/.test(String(params.principal_agent_id ?? '').trim())
    ) {
      setError('Connect your wallet before deploying a Power of Attorney: it is signed with your wallet, and nobody else can sign it.');
      return;
    }
    setDeploying(true);
    setError(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['X-API-Key'] = apiKey;

      const res = await fetch('/api/v1/contracts', {
        method: 'POST',
        headers,
        body: JSON.stringify(buildDeployRequestBody({ template, params, effectiveWallet, userEmail, draftId })),
      });

      // Defensive JSON parse — Vercel function timeout returns HTML, which
      // throws "Unexpected token 'A', 'An error o...' is not valid JSON" if
      // we naively call res.json(). Show the user something actionable.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let json: any = null;
      try {
        json = await res.json();
      } catch {
        if (res.status === 504 || res.status >= 500) {
          throw new Error('Contract generation is taking longer than expected. Please try again in a moment.');
        }
        throw new Error(`Server returned an unexpected response (HTTP ${res.status}). Please try again.`);
      }
      if (!res.ok) {
        if (res.status === 503 && json?.error === 'generation_unavailable') {
          const mins = Math.max(1, Math.ceil(Number(json.retry_after) / 60));
          throw new Error(
            Number.isFinite(mins)
              ? `Contract generation is temporarily unavailable, try again in ${mins} ${mins === 1 ? 'minute' : 'minutes'}.`
              : 'Contract generation is temporarily unavailable, try again later.',
          );
        }
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
    // readyToDeploy will become false automatically since template→null
    setChatTurns([]);
    setSessionUsage(EMPTY_SESSION_USAGE);
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

  // Like startNew() but PRESERVES the current draft in IndexedDB so the user
  // can resume it later from the Drafts sidebar item. Confirms only when there's
  // meaningful work to preserve (>1 turn — the greeting alone doesn't count).
  function startFreshDraft() {
    const hasWork = chatTurns.length > 1 || Object.keys(params).length > 0;
    if (hasWork && !window.confirm('Start a new chat? Your current draft will stay saved under Drafts.')) {
      return;
    }
    setTemplate(null);
    setParams({});
    setMissing([]);
    setLastSavedAt(null);
    const newId = newDraftId();
    setDraftId(newId);
    hydratedFromDraftId.current = null;
    try { localStorage.setItem(ACTIVE_DRAFT_KEY, newId); } catch {}
    setChatTurns([{ role: 'assistant', content: 'Fresh start — what kind of agreement do you need?', ts: Date.now() }]);
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  // preview, requiredRows, filledCount, totalCount, readyToDeploy are all
  // computed once early in the function (above the persist useEffect that
  // depends on readyToDeploy). Don't recompute here.
  const price = template ? TEMPLATE_PRICING_USD[template] ?? 0 : 0;
  // Tier-aware Deploy CTA text. For API-key users the server burns the template's
  // price_cents, so the label names that cost once the template list has loaded
  // and claims no number before.
  const costCredits = template ? priceCents[template] ?? null : null;
  const signerNoticeText = template ? signerNotice(template, params, effectiveWallet) : null;
  const afterDeployText = describeCreditsAfterDeploy(credits, costCredits);
  const deployCost = describeDeployCost({ tier, credits, templateUsdPrice: price, costCredits });

  if (deployed) {
    // Prefill the counterparty email field from already-extracted params.
    // Saves the user re-typing their email when the agent
    // already knows the email from the conversation. Falls through the
    // three template variants — A1 uses consumer_email, D1 uses
    // principal_email (rare, usually self-deploy), C1 uses buyer_email.
    const prefillEmail =
      (params.consumer_email as string | undefined)
      ?? (params.buyer_email as string | undefined)
      ?? (params.principal_email as string | undefined)
      ?? '';
    return (
      <DeploySuccess
        deployed={deployed}
        onStartNew={startNew}
        apiKey={apiKey}
        prefillEmail={prefillEmail}
      />
    );
  }

  // A2A — "Connect your agent" surface. No chat/preview/Deploy button: an A2A
  // contract is deployed by the user's own agent via MCP. This replaces the
  // whole split/focus layout while agentConnectSlug is set.
  if (agentConnectSlug) {
    return (
      <div className="relative">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <p className="text-micro">New contract</p>
            <h1 className="text-xl font-semibold text-text-primary">
              {TEMPLATE_NAMES[agentConnectSlug] ?? 'A2A — Agent-to-Agent'}
            </h1>
          </div>
          <button
            onClick={() => setAgentConnectSlug(null)}
            className="text-xs text-text-secondary hover:text-amber inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border/60 hover:border-amber/40 hover:bg-surface-elevated transition-colors"
          >
            <ArrowRight className="w-3 h-3 rotate-180" /> Back to templates
          </button>
        </div>
        <AgentConnectCard
          apiKey={apiKey || null}
          credits={typeof credits === 'number' ? credits : null}
          priceUsd={TEMPLATE_PRICING_USD[agentConnectSlug] ?? 1.0}
        />
      </div>
    );
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
          <button
            onClick={startFreshDraft}
            className="text-xs text-text-secondary hover:text-amber inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border/60 hover:border-amber/40 hover:bg-surface-elevated transition-colors"
            title="Start a new chat — current draft stays saved under Drafts"
          >
            <Plus className="w-3 h-3" /> New chat
          </button>
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
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4 items-start">
          <ContractPreviewPane
            preview={preview}
            onTemplatePick={handleTemplatePick}
            walletField={template ? FIELD_BY_TEMPLATE[template] ?? null : null}
            effectiveWallet={effectiveWallet}
            onUseConnectedWallet={handleUseConnectedWallet}
            agentWalletField={template ? AGENT_WALLET_FIELD_BY_TEMPLATE[template] ?? null : null}
            principalAgentWallet={
              template
                ? ((params[FIELD_BY_TEMPLATE[template] ?? ''] as string | undefined) ?? effectiveWallet ?? null)
                : null
            }
            isOneSidedTemplate={template === 'p2-power-of-attorney'}
            onAgentWalletConfirm={handleAgentWalletConfirm}
          />
          {/* Sticky rail: pins the chat to the viewport on lg+ so it stays
              visible while the preview column scrolls. On mobile (<lg) it
              falls back to normal block flow under the preview.
              Height: 100vh minus 5rem (page chrome above the sticky Deploy
              button) minus the WalletStatusBar offset (32px when mounted).
              Was 8rem on the 2026-05-26 morning fix — but that left ~110px
              of dead space below the chat panel before the Deploy button.
              5rem brings the chat bottom edge to ~30px above the Deploy
              button, no overlap, no dead space. */}
          <div className="lg:sticky lg:top-4 lg:self-start min-h-[420px]"
               style={{ height: 'calc(100vh - 5rem - var(--wallet-bar-offset, 0px))' }}>
            <ChatPanel
              turns={chatTurns}
              input={chatInput}
              setInput={setChatInput}
              onSend={send}
              thinking={thinking}
              mode="docked"
              templateName={template ? TEMPLATE_NAMES[template] ?? null : null}
              chatBottomRef={chatBottomRef}
              lastSavedAt={lastSavedAt}
              sessionUsage={sessionUsage}
              onResetSession={() => { setChatTurns([]); setSessionUsage(EMPTY_SESSION_USAGE); }}
            />
          </div>
        </div>
      ) : (
        <div className="relative">
          <ContractPreviewPane
            preview={preview}
            onTemplatePick={handleTemplatePick}
            walletField={template ? FIELD_BY_TEMPLATE[template] ?? null : null}
            effectiveWallet={effectiveWallet}
            onUseConnectedWallet={handleUseConnectedWallet}
            agentWalletField={template ? AGENT_WALLET_FIELD_BY_TEMPLATE[template] ?? null : null}
            principalAgentWallet={
              template
                ? ((params[FIELD_BY_TEMPLATE[template] ?? ''] as string | undefined) ?? effectiveWallet ?? null)
                : null
            }
            isOneSidedTemplate={template === 'p2-power-of-attorney'}
            onAgentWalletConfirm={handleAgentWalletConfirm}
          />
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
              lastSavedAt={lastSavedAt}
              sessionUsage={sessionUsage}
              onResetSession={() => { setChatTurns([]); setSessionUsage(EMPTY_SESSION_USAGE); }}
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
          <div className="text-xs text-text-secondary flex items-center gap-3 flex-wrap">
            {template ? (
              <>
                <span className="font-mono text-amber">{TEMPLATE_NAMES[template]?.split(' — ')[0]}</span>
                {totalCount > 0 && (
                  <>
                    <span>·</span>
                    <span>{filledCount} of {totalCount} fields filled</span>
                  </>
                )}
                {/* After-deploy credit count: shown only when the cost is known and the
                    balance covers it, so it never claims a number the server will not burn. */}
                {readyToDeploy && afterDeployText && (
                  <>
                    <span>·</span>
                    <span className="text-text-secondary/70">{afterDeployText}</span>
                  </>
                )}
              </>
            ) : (
              <span>Pick a template above, or describe what you need in the chat.</span>
            )}
            {/* The own-wallet field differs from the connected wallet: say who will sign. */}
            {signerNoticeText && (
              <span className="text-amber/90 flex items-center gap-1 basis-full">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                {signerNoticeText}
              </span>
            )}
            {/* Tier-aware warning (e.g. "out of credits — upgrade or pay via wallet") */}
            {deployCost.warning && (
              <span className="text-amber/90 flex items-center gap-1 basis-full">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                {deployCost.warning}
              </span>
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
                {deployCost.label} <ArrowRight className="w-4 h-4" />
              </>
            ) : (
              totalCount === 0 ? (
                <>Pick a template to start</>
              ) : (
              <>
                {/* Derive from the live preview (totalCount, filledCount) NOT
                    the stale `missing` server state — that state was
                    computed before any client-side cleanup and routinely
                    disagrees with the footer. Matching the footer keeps the
                    two on-screen counters in sync. (2026-05-26) */}
                Deploy contract — {Math.max(0, totalCount - filledCount)} field{(totalCount - filledCount) === 1 ? '' : 's'} left
              </>
              )
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

function ContractPreviewPane({
  preview,
  onTemplatePick,
  walletField,
  effectiveWallet,
  onUseConnectedWallet,
  agentWalletField,
  principalAgentWallet,
  isOneSidedTemplate,
  onAgentWalletConfirm,
}: {
  preview: ReturnType<typeof buildPreview>;
  onTemplatePick?: (slug: string) => void;
  /** The user's own auto-filled wallet field for this template (e.g. principal_agent_id for D1).
   *  When the field's stored value differs from the connected wallet, we render an inline
   *  "Use connected wallet" swap button so users can fix drafts that have a stale wallet
   *  without depending on the chat (which can fail to extract this field — 2026-05-26). */
  walletField?: string | null;
  effectiveWallet?: string | null;
  onUseConnectedWallet?: (field: string) => void;
  /** The COUNTERPARTY-side wallet field — the one the user needs to type in
   *  (agent_id for D1/P2, provider_agent_id for A1). When empty, the row
   *  swaps from "⌽ awaiting…" to <WalletFieldControl> so the user clicks
   *  buttons instead of relying on Kimi to extract their chat answer. */
  agentWalletField?: string | null;
  /** The current value of the principal-side wallet — passed into
   *  WalletFieldControl for the same-wallet detection popover. */
  principalAgentWallet?: string | null;
  isOneSidedTemplate?: boolean;
  onAgentWalletConfirm?: (field: string, wallet: string) => void;
}) {
  const { templateName, rows, introText } = preview;

  if (!templateName) {
    // Empty / starter state — chips are clickable so new users have a one-tap
    // path to start the agent on a specific template, not just freeform chat.
    const chips = templateOptionsForChips();
    return (
      <div className="rounded-2xl border border-border bg-surface-elevated/40 p-8 min-h-[420px] flex flex-col items-center justify-center text-center">
        <FileText className="w-10 h-10 text-amber/40 mb-4" />
        <p className="max-w-md text-sm text-text-secondary mb-6">{introText}</p>
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {chips.map((c) => (
            <button
              key={c.slug}
              onClick={() => onTemplatePick?.(c.slug)}
              disabled={!onTemplatePick}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-amber/60 hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-70"
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-mono text-amber">{c.label}</span>
                <span className="text-xs text-text-secondary">${c.priceUsd.toFixed(2)}</span>
              </div>
              <div className="text-xs text-text-primary">{c.name}</div>
              {c.parties && (
                <div className="text-[10px] text-text-secondary/60 mt-0.5">{c.parties}</div>
              )}
            </button>
          ))}
        </div>
        <p className="mt-6 text-[11px] text-text-secondary/50">
          Click a template to start, or just tell the Ambr Agent in your own words.
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

      <div className="space-y-2 mb-6 text-xs">
        {rows.map((r) => {
          // Show "Use connected wallet" swap action ONLY on the user's own
          // auto-fill wallet field (consumer_agent_id / principal_agent_id /
          // buyer_agent_id), and only when the stored (formatted) wallet
          // doesn't match the formatted version of the currently-connected
          // wallet. r.value is already truncated by formatValue() to the
          // 0xABCD…WXYZ form, so we compare against the same truncation of
          // effectiveWallet. Lets users fix drafts that have a stale wallet
          // without going through the chat.
          const connectedShort =
            effectiveWallet && effectiveWallet.length > 12
              ? `${effectiveWallet.slice(0, 6)}…${effectiveWallet.slice(-4)}`
              : effectiveWallet ?? '';
          const showWalletSwap =
            !!walletField &&
            r.field === walletField &&
            !!effectiveWallet &&
            r.isFilled &&
            r.value.toLowerCase() !== connectedShort.toLowerCase();

          // The counterparty/agent-side wallet field gets a specialised
          // control when empty — clickable buttons instead of "⌽ awaiting…"
          // so the user makes an explicit choice that Kimi can't override.
          const isAgentWalletRow =
            !!agentWalletField &&
            r.field === agentWalletField &&
            r.format === 'wallet' &&
            !r.isFilled;

          return (
            <div key={r.field} className="grid grid-cols-[170px_1fr] gap-3 py-1.5 border-b border-border/30">
              <div className="flex flex-col gap-0.5">
                {/* Plain-English label */}
                <span className="text-text-secondary font-medium">
                  {r.label}
                  {r.optional && <span className="text-text-secondary/50 normal-case font-normal"> (optional)</span>}
                  :
                </span>
                {/* Subtitle in plain language — helps non-lawyer users understand what each field means */}
                {r.hint && (
                  <span className="text-[10px] text-text-secondary/50 normal-case font-normal leading-snug">
                    {r.hint}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                {isAgentWalletRow && onAgentWalletConfirm ? (
                  <WalletFieldControl
                    field={r.field}
                    label={r.label}
                    effectiveWallet={effectiveWallet ?? null}
                    principalWallet={principalAgentWallet ?? null}
                    isOneSided={isOneSidedTemplate}
                    onConfirm={onAgentWalletConfirm}
                  />
                ) : (
                  <span className={`font-mono ${r.isFilled ? 'text-text-primary' : 'text-amber/60 italic'}`}>
                    {r.value}
                  </span>
                )}
                {showWalletSwap && onUseConnectedWallet && (
                  <button
                    type="button"
                    onClick={() => onUseConnectedWallet(walletField!)}
                    title={`Replace with currently connected wallet (${effectiveWallet})`}
                    className="inline-flex items-center gap-1 self-start text-[10px] font-mono px-1.5 py-0.5 rounded border border-amber/40 bg-amber/5 text-amber hover:bg-amber/15 transition-colors"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    Use connected wallet ({connectedShort})
                  </button>
                )}
              </div>
            </div>
          );
        })}
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
  turns, input, setInput, onSend, thinking, mode, templateName, chatBottomRef, lastSavedAt,
  sessionUsage, onResetSession,
}: {
  turns: ChatTurn[];
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  thinking: boolean;
  mode: 'docked' | 'floating';
  templateName: string | null;
  chatBottomRef: React.RefObject<HTMLDivElement | null>;
  lastSavedAt: number | null;
  sessionUsage: SessionUsage;
  /** Clears the turn array + session token counter. */
  onResetSession: () => void;
}) {
  return (
    <div className={`rounded-2xl border border-amber/40 bg-surface/95 backdrop-blur flex flex-col ${mode === 'docked' ? 'h-full' : 'h-[460px] w-full lg:h-[360px] lg:w-[360px]'}`}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
        {/* Left cluster shrinks (min-w-0 + truncate on the label) so the
            TokenChip on the right is never squeezed into a wrap in narrow /
            split-screen widths. */}
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-amber shrink-0" />
          <span className="text-sm font-medium text-text-primary truncate">Ambr Agent</span>
          {lastSavedAt && (
            <span
              className="text-[10px] text-emerald-400/80 inline-flex items-center gap-1 shrink-0"
              title={`Auto-saved to this browser at ${new Date(lastSavedAt).toLocaleString()}`}
            >
              <Check className="w-3 h-3" /> Saved
            </span>
          )}
          {templateName && (
            <span className="text-[10px] font-mono text-text-secondary shrink-0">
              {templateName.split(' — ')[0]}
            </span>
          )}
        </div>
        <div className="ml-auto shrink-0">
          <TokenChip usage={sessionUsage} onReset={onResetSession} compact />
        </div>
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
  lastSavedAt: number | null;
  sessionUsage: SessionUsage;
  onResetSession: () => void;
}) {
  // Below lg the card sits in normal flow under the preview, so dragging it
  // would only shove it over content. SSR-safe: false until mounted.
  const [canDrag, setCanDrag] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setCanDrag(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return (
    <motion.div
      drag={canDrag}
      dragMomentum={false}
      dragConstraints={{ top: -200, left: -1000, right: 1000, bottom: 200 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative mt-4 lg:mt-0 lg:absolute lg:right-4 lg:bottom-4 z-30 lg:cursor-grab lg:active:cursor-grabbing shadow-2xl"
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
  apiKey,
  prefillEmail = '',
}: {
  deployed: { contract_id: string; sha256_hash: string; reader_url: string };
  onStartNew: () => void;
  apiKey: string;
  /** Optional pre-fill for the counterparty email input (extracted from
   *  contract params like consumer_email / buyer_email / principal_email).
   *  Skips the user re-typing an address the agent already captured. */
  prefillEmail?: string;
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
          <p className="text-[10px] uppercase tracking-wider text-text-secondary mb-1">Your reader link (do not forward; it cannot sign for the other party)</p>
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

        <ShareByEmail
          apiKey={apiKey}
          contractId={deployed.contract_id}
          prefillEmail={prefillEmail}
        />

        <p className="mt-6 text-xs text-text-secondary/60">
          To invite your counterparty, use Share by email: their invite link lets their wallet sign, and the paired cNFT mints when they do.
        </p>
      </motion.div>
    </div>
  );
}

// ─── Share-by-email block (deploy success + dashboard re-share) ────────────
// Exported so the dashboard ContractDetail can re-share an already-deployed
// contract (typo recovery — the deploy-success modal is one-shot and once
// dismissed the user had no way to resend with a corrected email). Same
// component, same endpoint, same UX — just mounted in two places.

export function ShareByEmail({
  apiKey,
  contractId,
  prefillEmail = '',
}: {
  apiKey: string;
  contractId: string;
  prefillEmail?: string;
}) {
  const [email, setEmail] = useState(prefillEmail);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const submit = useCallback(async () => {
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErrorMsg('Enter a valid email.');
      setState('error');
      return;
    }
    setState('sending');
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/v1/contracts/${contractId}/share`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_email: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.message || 'Share failed.');
        setState('error');
        return;
      }
      setState('sent');
    } catch {
      setErrorMsg('Network error.');
      setState('error');
    }
  }, [email, apiKey, contractId]);

  return (
    <div className="mt-5 rounded-lg border border-border bg-surface p-4 text-left">
      <div className="flex items-center gap-2 mb-2">
        <Mail className="w-3.5 h-3.5 text-amber" />
        <p className="text-xs font-medium text-text-primary uppercase tracking-wider">Email the reader URL to counterparty</p>
      </div>
      <p className="text-[11px] text-text-secondary/70 mb-3">
        Optional — sends them a one-click link to review and sign.
      </p>
      {state === 'sent' ? (
        <>
          <p className="text-xs text-emerald-400 inline-flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" /> Sent to {email.trim().toLowerCase()}
          </p>
          {/* Critical clarification: "Sent" only confirms the email shipped to
              the counterparty. The DEPLOYER (this user) still has to sign
              their own side. Users were confusing this confirmation with a
              done-state. Surface the next required action explicitly. */}
          <p className="mt-2 text-[11px] text-text-secondary/80 leading-relaxed">
            Next: open the reader URL above and sign with your wallet. The contract activates and the cNFT mints only when BOTH parties have signed.
          </p>
          {/* Typo recovery — user sent to the wrong address (e.g. their own
              instead of the counterparty's). Reset the input so they can
              re-send to the correct email. Each /share call generates a fresh
              token; the previous one stays valid too (no invalidation) but
              the new one is what the email contains. */}
          <button
            onClick={() => {
              setEmail('');
              setState('idle');
              setErrorMsg(null);
            }}
            className="mt-3 text-[11px] text-amber hover:underline inline-flex items-center gap-1"
          >
            Send to a different email →
          </button>
        </>
      ) : (
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="counterparty@example.com"
            disabled={state === 'sending'}
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-amber/50"
          />
          <button
            onClick={submit}
            disabled={state === 'sending' || !email.trim()}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-amber text-background text-xs font-medium hover:bg-amber-light disabled:opacity-50"
          >
            {state === 'sending' ? <><Loader2 className="w-3 h-3 animate-spin" /> Sending</> : <><Send className="w-3 h-3" /> Send</>}
          </button>
        </div>
      )}
      {state === 'error' && errorMsg && (
        <p className="mt-2 text-xs text-red-400">{errorMsg}</p>
      )}
    </div>
  );
}

// Re-export helpers so other components can stay decoupled
export { Maximize2, Minimize2 };
