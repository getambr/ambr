'use client';

/**
 * Inline wallet-field control that replaces chat-driven extraction for
 * wallet fields (agent_id, provider_agent_id, seller_agent_id, etc.).
 *
 * Why this exists: Kimi K2.6 keeps mis-extracting wallet answers like
 * "this same" / "the connected one" — it extracts the user's own wallet as
 * agent_id, server strips it, agent re-asks, loop. Seen in a P2 test on
 * 2026-05-26. Rather than fight LLM text interpretation
 * on wallet fields, we surface explicit click-buttons so the user makes a
 * traceable choice and Kimi never has to parse the wallet answer at all.
 *
 * Three actions:
 *   - "Use connected wallet" → fills with effectiveWallet, with a same-as-
 *     principal popover when applicable
 *   - "Paste different address" → reveals an inline 0x input
 *   - "Help me create one" → opens a brief guide modal
 *
 * The component is purely presentational + local state. The parent owns
 * the params object and the userConfirmedFields set; we just call
 * `onConfirm(field, value)` with the chosen address.
 */

import { useState } from 'react';
import { Wallet, ClipboardPaste, HelpCircle, AlertCircle, X } from 'lucide-react';

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

interface WalletFieldControlProps {
  /** The form field this control is filling — e.g. 'agent_id'. */
  field: string;
  /** Friendly label for the field, shown in the create-help modal. */
  label: string;
  /** The currently connected wallet (from EIP-6963 / SafePal / MetaMask), if any. */
  effectiveWallet: string | null;
  /**
   * The principal-side wallet for this contract — e.g. principal_agent_id
   * for D1/P2, consumer_agent_id for A1. When the user picks "Use connected
   * wallet" and the connected wallet equals this principal value, we show
   * the same-wallet popover instead of just filling. Pass null when there
   * is no principal-side wallet to compare against.
   */
  principalWallet: string | null;
  /**
   * Whether the template is one-sided (P2). For P2, same-wallet POA is
   * EXPECTED — the primary use case is delegating a local AI agent that
   * signs from the principal's own wallet (contract acts as a public
   * scope declaration). We show an informational note when same-wallet
   * is picked but allow proceed. For D1 (bilateral), we hard-block
   * same-wallet because D1 requires two distinct signers.
   */
  isOneSided?: boolean;
  /** Called with the chosen wallet address. Parent updates params + records
   *  the field in userConfirmedFields so chat extraction can't overwrite. */
  onConfirm: (field: string, wallet: string) => void;
}

type Stage = 'idle' | 'paste' | 'same-warn' | 'create-help';

export default function WalletFieldControl({
  field,
  label,
  effectiveWallet,
  principalWallet,
  isOneSided,
  onConfirm,
}: WalletFieldControlProps) {
  const [stage, setStage] = useState<Stage>('idle');
  const [pasteValue, setPasteValue] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);

  const connectedShort =
    effectiveWallet && effectiveWallet.length > 12
      ? `${effectiveWallet.slice(0, 6)}…${effectiveWallet.slice(-4)}`
      : effectiveWallet ?? '';

  function handleUseConnected() {
    if (!effectiveWallet) return;
    // Same-wallet check. For P2 (one-sided), same wallet is the COMMON case
    // (local AI agent signs from principal's wallet) — show an info popover
    // but allow proceed. For D1 (bilateral), same wallet is invalid — hard
    // block with the "create new wallet" path.
    if (
      principalWallet &&
      effectiveWallet.toLowerCase() === principalWallet.toLowerCase()
    ) {
      if (isOneSided) {
        // P2 same-wallet: fill directly, no popover. The deploy will produce
        // a public scope declaration. (If we want to surface a one-time tip
        // about this, do it in the preview as a row hint, not as a gate.)
        onConfirm(field, effectiveWallet);
        return;
      }
      setStage('same-warn');
      return;
    }
    onConfirm(field, effectiveWallet);
  }

  function handlePasteSubmit() {
    const v = pasteValue.trim();
    if (!WALLET_RE.test(v)) {
      setPasteError('Enter a valid Ethereum address (0x + 40 hex chars).');
      return;
    }
    if (
      principalWallet &&
      v.toLowerCase() === principalWallet.toLowerCase()
    ) {
      if (isOneSided) {
        setPasteError(null);
        onConfirm(field, v);
        return;
      }
      // D1 only: same gate as Use connected.
      setStage('same-warn');
      return;
    }
    setPasteError(null);
    onConfirm(field, v);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {stage === 'idle' && (
        <div className="flex flex-wrap items-center gap-1.5">
          {effectiveWallet && (
            <button
              type="button"
              onClick={handleUseConnected}
              className="inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded border border-amber/40 bg-amber/5 text-amber hover:bg-amber/15 transition-colors"
              title={`Fill with your connected wallet (${effectiveWallet})`}
            >
              <Wallet className="w-3 h-3" />
              Use connected wallet ({connectedShort})
            </button>
          )}
          <button
            type="button"
            onClick={() => setStage('paste')}
            className="inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded border border-border bg-surface text-text-primary hover:border-amber/40 hover:text-amber transition-colors"
          >
            <ClipboardPaste className="w-3 h-3" />
            Paste different address
          </button>
          <button
            type="button"
            onClick={() => setStage('create-help')}
            className="inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded border border-border bg-surface text-text-secondary hover:text-amber hover:border-amber/40 transition-colors"
          >
            <HelpCircle className="w-3 h-3" />
            Help me create one
          </button>
        </div>
      )}

      {stage === 'paste' && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={pasteValue}
              onChange={(e) => { setPasteValue(e.target.value); setPasteError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handlePasteSubmit(); }}
              placeholder="0x…"
              className="flex-1 min-w-0 text-[11px] font-mono px-2 py-1 rounded border border-border bg-background text-text-primary placeholder-text-secondary/40 focus:outline-none focus:border-amber/60"
              autoFocus
            />
            <button
              type="button"
              onClick={handlePasteSubmit}
              className="text-[10px] font-mono px-2 py-1 rounded border border-amber/40 bg-amber/15 text-amber hover:bg-amber/25"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => { setStage('idle'); setPasteValue(''); setPasteError(null); }}
              className="text-[10px] font-mono px-1.5 py-1 rounded border border-border text-text-secondary hover:text-text-primary"
              title="Cancel"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          {pasteError && (
            <span className="text-[10px] text-red-400 font-mono">{pasteError}</span>
          )}
        </div>
      )}

      {stage === 'same-warn' && (
        // D1-only path now. P2 same-wallet auto-fills without prompting.
        <div className="flex flex-col gap-1.5 rounded border border-amber/40 bg-amber/5 p-2">
          <div className="flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-amber mt-0.5 shrink-0" />
            <p className="text-[11px] text-text-primary leading-snug">
              That&apos;s your own wallet. D1 Delegation is bilateral — the agent needs its own wallet so it can sign as counterparty. If you want to declare scope for an AI on YOUR wallet, use P2 Power of Attorney instead.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <button
              type="button"
              onClick={() => setStage('create-help')}
              className="text-[10px] font-mono px-2 py-1 rounded border border-amber/40 bg-amber/15 text-amber hover:bg-amber/25"
            >
              Create a new wallet for the agent →
            </button>
            <button
              type="button"
              onClick={() => effectiveWallet && onConfirm(field, effectiveWallet)}
              className="text-[10px] font-mono px-2 py-1 rounded border border-border text-text-secondary hover:text-text-primary"
              title="Last-resort: deploy a self-directed D1 anyway"
            >
              Continue anyway
            </button>
            <button
              type="button"
              onClick={() => { setStage('idle'); setPasteValue(''); }}
              className="text-[10px] font-mono px-1.5 py-1 rounded text-text-secondary hover:text-text-primary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {stage === 'create-help' && (
        <div className="flex flex-col gap-2 rounded border border-border bg-surface-elevated/60 p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] font-semibold text-text-primary">
              Create a new wallet for your AI agent
            </p>
            <button
              type="button"
              onClick={() => { setStage('idle'); setPasteValue(''); setPasteError(null); }}
              className="text-text-secondary hover:text-text-primary"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <ol className="list-decimal list-inside space-y-1 text-[11px] text-text-secondary leading-relaxed">
            <li>Open your wallet (MetaMask / SafePal / Coinbase Wallet).</li>
            <li>Add a new account (usually a &ldquo;+&rdquo; button next to your accounts list).</li>
            <li>Name it something like &ldquo;Ambr Agent — {label}&rdquo; so you can find it later.</li>
            <li>Copy its address and paste it below.</li>
          </ol>
          <div className="flex items-center gap-1.5 pt-1">
            <input
              type="text"
              value={pasteValue}
              onChange={(e) => { setPasteValue(e.target.value); setPasteError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handlePasteSubmit(); }}
              placeholder="0x…"
              className="flex-1 min-w-0 text-[11px] font-mono px-2 py-1 rounded border border-border bg-background text-text-primary placeholder-text-secondary/40 focus:outline-none focus:border-amber/60"
              autoFocus
            />
            <button
              type="button"
              onClick={handlePasteSubmit}
              className="text-[10px] font-mono px-2 py-1 rounded border border-amber/40 bg-amber/15 text-amber hover:bg-amber/25"
            >
              Confirm
            </button>
          </div>
          {pasteError && (
            <span className="text-[10px] text-red-400 font-mono">{pasteError}</span>
          )}
        </div>
      )}
    </div>
  );
}
