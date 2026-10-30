'use client';

import { useState } from 'react';
import { Bot, Copy, Check, Wallet, KeyRound, Coins } from 'lucide-react';

/**
 * AgentConnectCard — the A2A ("Agent-to-Agent") entry surface.
 *
 * A2A contracts (template `c3-task-execution`) are deployed by AI agents, not
 * by a human filling a form. So instead of opening the 11-field chat flow, the
 * A2A chip shows THIS card: a copy-paste snippet the user hands to their own
 * agent, which then creates the contract itself via the Ambr MCP using the
 * account's API key (spends 1 credit / $1.00). It points only at rails that
 * already exist — no new backend:
 *   - MCP `ambr_create_contract` (create the draft, API-key auth)
 *   - MCP `ambr_get_contract`     (read the terms anytime)
 *   - POST /contracts/[id]/sign   (ECDSA over the hash; a declared wallet needs
 *                                  no API key. An open principal side needs the
 *                                  creator, an open counterparty side the
 *                                  invite share_token)
 *
 * Honest wallet split (do NOT over-promise "no wallet"):
 *   - Deploy  → API key only, no wallet.
 *   - Sign    → each agent's own 0x wallet (ECDSA). A2A is bilateral.
 *   - cNFT    → mints to each agent's wallet.
 *   - Read/track in this dashboard → API-key login only, no wallet.
 * The card STATES the agent-wallet requirement; it does not generate keys.
 */

const PLATFORM = 'https://getamber.dev';

export default function AgentConnectCard({
  apiKey,
  credits,
  priceUsd,
}: {
  apiKey: string | null;
  credits: number | null;
  priceUsd: number;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const keyFull = apiKey ?? 'amb_YOUR_API_KEY';
  // Masked for ON-SCREEN display so a screenshot / shared screen never leaks a
  // live key — the Copy buttons still write the full key to the clipboard.
  const keyMask = apiKey ? `${apiKey.slice(0, 8)}…` : 'amb_YOUR_API_KEY';
  const keyMissing = !apiKey;

  const buildPrompt = (k: string) =>
    `Deploy an Ambr A2A (agent-to-agent) contract on my behalf. ` +
    `Use the Ambr MCP server at ${PLATFORM}/api/mcp — call the tool ` +
    `ambr_create_contract with template "c3-task-execution" and these ` +
    `parameters: requester_name, requester_agent_id (my agent wallet, 0x… on ` +
    `Base), executor_name, executor_agent_id (the other agent's wallet, 0x…), ` +
    `task_description, deliverables, acceptance_criteria, total_price, ` +
    `currency, deadline, governing_law. Authenticate with the header ` +
    `X-API-Key: ${k}. The call returns a draft contract_id and a ` +
    `SHA-256 hash. To make it binding, sign that hash with your wallet (ECDSA) ` +
    `and POST it to ${PLATFORM}/api/v1/contracts/{contract_id}/sign. ` +
    `The contract will appear in my Ambr dashboard.`;

  const buildMachine = (k: string) => [
    `# 1) Create the A2A contract (draft) — Ambr MCP, JSON-RPC`,
    `POST ${PLATFORM}/api/mcp        Header: X-API-Key: ${k}`,
    `  tools/call -> ambr_create_contract {`,
    `    "template": "c3-task-execution",`,
    `    "parameters": {`,
    `      "requester_name": "...",`,
    `      "requester_agent_id": "0x…",   // your agent wallet (Base)`,
    `      "executor_name": "...",`,
    `      "executor_agent_id": "0x…",    // counterparty agent wallet (Base)`,
    `      "task_description": "...",`,
    `      "deliverables": "...",`,
    `      "acceptance_criteria": "...",`,
    `      "total_price": "...",`,
    `      "currency": "USDC",`,
    `      "deadline": "...",`,
    `      "governing_law": "..."`,
    `    },`,
    `    "principal_declaration": {`,
    `      "agent_id": "0x…",`,
    `      "principal_name": "...",`,
    `      "principal_type": "company"`,
    `    }`,
    `  }`,
    `  -> returns { contract_id, sha256_hash, status: "draft" }`,
    ``,
    `# 2) Read the terms anytime`,
    `POST ${PLATFORM}/api/mcp`,
    `  tools/call -> ambr_get_contract { "id": "<contract_id>" }`,
    ``,
    `# 3) Sign to activate — ECDSA over the hash, NO api key. Each agent signs.`,
    `POST ${PLATFORM}/api/v1/contracts/<contract_id>/sign`,
    `  {`,
    `    "wallet_address": "0x…",`,
    `    "signature": "0x…",`,
    `    "message": "I am signing Ambr contract <contract_id>\\nContract hash: <sha256_hash>"`,
    `  }`,
  ].join('\n');

  // Displayed (masked) vs copied (full): the Copy button hands the agent the
  // real key while the screen only ever shows the masked form.
  const promptMasked = buildPrompt(keyMask);
  const promptFull = buildPrompt(keyFull);
  const machineMasked = buildMachine(keyMask);
  const machineFull = buildMachine(keyFull);

  function copy(key: string, text: string) {
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(key);
        setTimeout(() => setCopied(null), 1500);
      },
      () => {},
    );
  }

  const copyBtn = (key: string, text: string) => (
    <button
      type="button"
      onClick={() => copy(key, text)}
      className="inline-flex items-center gap-1 text-[11px] text-text-secondary hover:text-amber transition-colors"
    >
      {copied === key ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied === key ? 'Copied' : 'Copy'}
    </button>
  );

  return (
    <div className="rounded-2xl border border-border bg-surface/40 p-6 lg:p-8 min-h-[420px] relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber/30 to-transparent" />

      <div className="flex items-center gap-2 mb-1">
        <Bot className="h-4 w-4 text-amber" />
        <h2 className="text-lg font-semibold text-text-primary">A2A contracts are deployed by your agent</h2>
      </div>
      <p className="text-sm text-text-secondary mb-5 leading-relaxed max-w-2xl">
        An agent-to-agent agreement&apos;s parties are AI agents, not the person at the keyboard — so
        there&apos;s no form to fill. Hand one of the snippets below to your agent and it deploys the
        contract itself through the Ambr MCP, using your account&apos;s credits.
      </p>

      {/* Credentials */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg border border-border bg-background px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1 text-[10px] uppercase tracking-wider text-text-secondary">
            <KeyRound className="h-3 w-3" /> API key
          </div>
          <p className="font-mono text-xs text-text-primary truncate">
            {apiKey ? `${apiKey.slice(0, 10)}…` : 'Not in session'}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-background px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1 text-[10px] uppercase tracking-wider text-text-secondary">
            <Coins className="h-3 w-3" /> Credits
          </div>
          <p className="font-mono text-xs text-text-primary">
            {credits === null ? '—' : credits === -1 ? 'Unlimited' : `${credits} remaining`}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-background px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1 text-[10px] uppercase tracking-wider text-text-secondary">
            <Wallet className="h-3 w-3" /> Price
          </div>
          <p className="font-mono text-xs text-text-primary">${priceUsd.toFixed(2)} / contract</p>
        </div>
      </div>

      {keyMissing && (
        <p className="mb-4 text-[11px] text-amber/90 leading-snug">
          Your API key isn&apos;t in this session (you signed in with a wallet). The snippets use a
          placeholder — paste your <span className="font-mono">amb_…</span> key from Account → API Key
          before handing them to your agent.
        </p>
      )}

      {/* Agent-wallet requirement — stated, not solved */}
      <div className="mb-5 rounded-lg border border-border/70 bg-surface-elevated/40 px-3 py-2.5">
        <p className="text-[11px] text-text-secondary leading-relaxed">
          <Wallet className="inline h-3 w-3 text-amber mr-1 -mt-0.5" />
          Your agent needs its <span className="text-text-primary">own 0x wallet on Base</span> — it
          signs the contract with that wallet and receives the cNFT. A2A is bilateral: the
          <span className="text-text-primary"> requester agent</span> and the
          <span className="text-text-primary"> executor agent</span> each sign.
        </p>
      </div>

      <p className="text-[10px] text-text-secondary/60 mb-2">
        Your API key is shown <span className="text-text-secondary">masked</span> below — the
        <span className="text-text-secondary"> Copy</span> button still copies your real key to the clipboard.
      </p>

      {/* Natural-language prompt */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[11px] uppercase tracking-wider text-text-secondary">Paste into your agent&apos;s chat</p>
          {copyBtn('prompt', promptFull)}
        </div>
        <pre className="whitespace-pre-wrap break-words rounded-lg border border-border bg-background px-3 py-2.5 text-[11px] leading-relaxed text-text-primary font-mono">
{promptMasked}
        </pre>
      </div>

      {/* Machine endpoints */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[11px] uppercase tracking-wider text-text-secondary">Endpoints</p>
          {copyBtn('machine', machineFull)}
        </div>
        <pre className="overflow-x-auto rounded-lg border border-border bg-background px-3 py-2.5 text-[10px] leading-relaxed text-text-primary font-mono">
{machineMasked}
        </pre>
      </div>

      {/* What happens next */}
      <div className="mt-5 rounded-lg border border-amber/20 bg-amber/5 px-3 py-2.5">
        <p className="text-[11px] uppercase tracking-wider text-amber/80 mb-1">What happens next</p>
        <p className="text-xs text-text-secondary leading-relaxed">
          Once your agent deploys it, the contract shows up here under <span className="text-text-primary">All Contracts</span> as
          a <span className="text-text-primary">draft</span>. Each agent signs with its own wallet
          (Signing → Active), the paired cNFTs mint to the agent wallets, and you can read the full
          contract + track who&apos;s signed right here — <span className="text-text-primary">no wallet
          needed for the reading view</span>.
        </p>
      </div>
    </div>
  );
}
