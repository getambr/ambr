'use client';

import { useState } from 'react';
import { Bot, Copy, Check } from 'lucide-react';

/**
 * AgentHandoff — copy-paste "hand this to your agent" panel.
 *
 * An A2A (and any agent-party) contract's real signatories are AI agents, not
 * the human filling the form. This panel gives the user a machine-readable
 * handoff they can paste to their agent — or share with the counterparty's
 * agent — so the agent can read the terms and sign programmatically. It points
 * only at rails Ambr already exposes:
 *   - MCP (JSON-RPC) at /api/mcp → ambr_get_contract to read terms
 *   - REST GET /api/v1/contracts/[id] (metadata; full terms need a share token)
 *   - POST /api/v1/contracts/[id]/sign — ECDSA over the hash; a declared wallet
 *     needs no API key, an open counterparty side needs the invite share_token
 *   - reader page at /reader/[hash]
 * No backend changes; this is purely a presentation of existing endpoints.
 */

const PLATFORM = 'https://getamber.dev';

export default function AgentHandoff({
  contractId,
  sha256Hash,
  isOneSided,
  isAgentToAgent,
}: {
  contractId: string;
  sha256Hash: string;
  isOneSided: boolean;
  /** True only for A2A (c3-task-execution), where BOTH parties are AI agents.
   *  For other bilateral templates (D1/C1/A1) one party is the human principal,
   *  so we must NOT claim "this contract's parties are AI agents". */
  isAgentToAgent: boolean;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const readerUrl = `${PLATFORM}/reader/${sha256Hash}`;
  // One-sided (P2): the agent is NOT a signatory ("acceptance by performance"),
  // so the handoff is READ-ONLY — never instruct the agent to sign. Bilateral:
  // the counterparty's agent signs.
  const recipient = isOneSided ? 'your agent' : "the counterparty's agent";

  const promptBlock = isOneSided
    ? `Read this Ambr contract: ${contractId}. ` +
      `Use the Ambr MCP at ${PLATFORM}/api/mcp — call ambr_get_contract with ` +
      `id "${contractId}" to read the full terms. You act under this ` +
      `authorization — the principal's signature grants it; no signature is ` +
      `required from you. Human view: ${readerUrl}`
    : `Review and sign this Ambr contract: ${contractId}. ` +
      `Use the Ambr MCP at ${PLATFORM}/api/mcp — call ambr_get_contract with ` +
      `id "${contractId}" to read the full terms. If you accept, sign the ` +
      `SHA-256 hash (${sha256Hash}) with your wallet and POST it to ` +
      `${PLATFORM}/api/v1/contracts/${contractId}/sign. Human view: ${readerUrl}`;

  const readSteps = [
    `# Ambr contract ${contractId}`,
    `# hash ${sha256Hash}`,
    ``,
    `# 1) Read the terms — MCP (JSON-RPC) or REST`,
    `POST ${PLATFORM}/api/mcp`,
    `  tools/call → ambr_get_contract { "id": "${contractId}" }`,
    `GET  ${PLATFORM}/api/v1/contracts/${contractId}`,
  ];
  const signSteps = [
    ``,
    `# 2) Accept + sign — ECDSA over the hash; a wallet named in the contract needs no API key.`,
    `#    If the counterparty side names no wallet, add the invite token from the share link:`,
    `#    "share_token": "<token from the reader link>"`,
    `POST ${PLATFORM}/api/v1/contracts/${contractId}/sign`,
    `  {`,
    `    "wallet_address": "0x…",`,
    `    "signature": "0x…",`,
    `    "message": "I am signing Ambr contract ${contractId}\\nContract hash: ${sha256Hash}"`,
    `  }`,
  ];
  // One-sided contracts omit the sign step entirely (the agent doesn't sign).
  const machineBlock = [
    ...readSteps,
    ...(isOneSided ? [] : signSteps),
    ``,
    `# Human-readable reader: ${readerUrl}`,
  ].join('\n');

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
    <div className="rounded-xl border border-border bg-surface/80 p-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber/30 to-transparent" />
      <div className="flex items-center gap-2 mb-1">
        <Bot className="h-4 w-4 text-amber" />
        <p className="text-micro">Hand this to {recipient}</p>
      </div>
      <p className="text-xs text-text-secondary mb-4 leading-relaxed">
        {isOneSided ? (
          <>This is a one-sided authorization — your signature grants it and the agent does
          <span className="text-text-primary"> not sign</span>. Hand this to your agent so it can
          read the terms and act under the grant — no dashboard needed.</>
        ) : isAgentToAgent ? (
          <>This contract&apos;s parties are AI agents — each signs the same hash with its own
          wallet. Give one of these to {recipient} so each can read the terms and sign
          machine-to-machine — no dashboard needed.</>
        ) : (
          <>Hand this to {recipient} so it can read the terms and sign the hash with its own
          wallet, machine-to-machine — no dashboard needed.</>
        )}
      </p>

      {/* Natural-language agent prompt */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[11px] uppercase tracking-wider text-text-secondary">Paste into the agent&apos;s chat</p>
          {copyBtn('prompt', promptBlock)}
        </div>
        <pre className="whitespace-pre-wrap break-words rounded-lg border border-border bg-background px-3 py-2.5 text-[11px] leading-relaxed text-text-primary font-mono">
{promptBlock}
        </pre>
      </div>

      {/* Machine endpoints */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[11px] uppercase tracking-wider text-text-secondary">Endpoints</p>
          {copyBtn('machine', machineBlock)}
        </div>
        <pre className="overflow-x-auto rounded-lg border border-border bg-background px-3 py-2.5 text-[10px] leading-relaxed text-text-primary font-mono">
{machineBlock}
        </pre>
      </div>

      <p className="mt-3 text-[10px] text-text-secondary/60 leading-snug">
        Private contracts return metadata only to unknown callers — if the agent needs the
        full terms, use &ldquo;Share with counterparty&rdquo; above to mint a reader link with a token.
      </p>
    </div>
  );
}
