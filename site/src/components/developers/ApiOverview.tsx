import ScrollReveal from '@/components/ui/ScrollReveal';
import CodeSnippet from './CodeSnippet';

const endpoints = [
  {
    method: 'POST',
    path: '/v1/contracts',
    description: 'Create a new Ricardian Contract from a template. Returns a draft that both parties must sign.',
    code: `const response = await fetch('https://getamber.dev/api/v1/contracts', {
  method: 'POST',
  headers: {
    'X-API-Key': '<API_KEY>',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    template: 'c1-api-access',
    parameters: {
      buyer_name: 'Acme Analytics Ltd.',
      buyer_agent_id: '0x7a3b...9f2e',
      seller_name: 'DataCo Inc.',
      api_endpoint: 'https://api.dataco.io/v1',
      pricing_model: 'per-call',
      price_per_call: 0.002,
      currency: 'USDC', // also supports USDbC, DAI, ETH, WETH, cbETH, cbBTC
      sla_uptime_percent: 99.9,
      governing_law: 'Singapore',
    },
    principal_declaration: {
      agent_id: '0x7a3b...9f2e',
      principal_name: 'Acme Analytics Ltd.',
      principal_type: 'company',
    },
  }),
});
// response.status → 'draft'
// response.sign_url → '/api/v1/contracts/amb-2026-0001/sign'`,
  },
  {
    method: 'POST',
    path: '/v1/contracts/:id/sign',
    description: 'Sign a contract with an ECDSA wallet signature. Both parties must sign to activate.',
    code: `const response = await fetch(
  'https://getamber.dev/api/v1/contracts/amb-2026-0001/sign',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet_address: '0x7a3b...9f2e',
      signature: '0x1234...abcd',
      message: 'I agree to the terms of contract with hash: <sha256_hash>',
    }),
  }
);
// First sig:  draft → pending_signature
// Second sig: pending_signature → active`,
  },
  {
    method: 'GET',
    path: '/v1/contracts/:id',
    description: 'Query contract status, metadata, and amendment chain. Full text requires API key or share token.',
    code: `const contract = await fetch(
  'https://getamber.dev/api/v1/contracts/amb-2026-0001',
  { headers: { 'X-API-Key': '<API_KEY>' } }
).then(r => r.json());

// contract.status → 'draft' | 'handshake' | 'pending_signature' | 'active' | 'amended'
// contract.sha256_hash → 'a1b2c3...'
// contract.amendment_chain → [{ hash, parent_hash, type }]`,
  },
  {
    method: 'POST',
    path: '/v1/contracts/:id/handshake',
    description: 'Submit a handshake response — accept, reject, or request changes to a draft contract. Includes visibility preference.',
    code: `const response = await fetch(
  'https://getamber.dev/api/v1/contracts/amb-2026-0001/handshake',
  {
    method: 'POST',
    headers: {
      'X-API-Key': '<API_KEY>',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'accept', // 'accept' | 'reject' | 'request_changes'
      visibility: 'parties_only', // 'public' | 'parties_only' | 'private'
      message: 'Terms accepted. Proceeding to signature.',
    }),
  }
);
// action: accept → draft → pending_signature
// action: request_changes → remains draft with change request attached`,
  },
  {
    method: 'POST',
    path: '/v1/contracts/:id/wallet-auth',
    description: 'Verify wallet ownership for contract access. Returns a signed challenge for authenticated reads.',
    code: `const response = await fetch(
  'https://getamber.dev/api/v1/contracts/amb-2026-0001/wallet-auth',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet_address: '0x7a3b...9f2e',
      signature: '0xabcd...1234',
      message: 'Authenticate wallet for contract amb-2026-0001',
    }),
  }
);
// response.access_token → short-lived JWT for contract reads`,
  },
  {
    method: 'POST',
    path: '/v1/dashboard/wallet-auth',
    description: 'Dashboard login via wallet signature. Returns a session token for the Ambr dashboard.',
    code: `const response = await fetch(
  'https://getamber.dev/api/v1/dashboard/wallet-auth',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet_address: '0x7a3b...9f2e',
      signature: '0xabcd...1234',
      message: 'Sign in to Ambr Dashboard',
    }),
  }
);
// response.session_token → use in Authorization header for dashboard API`,
  },
  {
    method: 'POST',
    path: '/v1/keys',
    description: 'Activate an API key with on-chain payment verification. Requires a Base L2 transaction hash.',
    code: `const response = await fetch(
  'https://getamber.dev/api/v1/keys',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet_address: '0x7a3b...9f2e',
      tx_hash: '0x9876...fedc',
      chain: 'base',
    }),
  }
);
// response.api_key → 'ambr_live_...'
// response.tier → 'starter' | 'pro' | 'enterprise'`,
  },
];

const methodColors: Record<string, string> = {
  GET: 'text-emerald-400 bg-emerald-500/10',
  POST: 'text-amber bg-amber-glow',
};

export default function ApiOverview() {
  return (
    <div className="space-y-8">
      {endpoints.map((ep, i) => (
        <ScrollReveal key={ep.path} delay={i * 0.08}>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className={`rounded-md px-2 py-0.5 text-xs font-mono font-bold ${methodColors[ep.method] || 'text-text-secondary'}`}>
                {ep.method}
              </span>
              <code className="font-mono text-sm text-text-primary">{ep.path}</code>
            </div>
            <p className="text-sm text-text-secondary mb-3">{ep.description}</p>
            <CodeSnippet code={ep.code} title={`${ep.method} ${ep.path}`} />
          </div>
        </ScrollReveal>
      ))}

      <ScrollReveal delay={0.3}>
        <div className="rounded-xl border border-amber/20 bg-amber-glow p-5">
          <h3 className="text-base font-semibold text-amber mb-2">Contract Lifecycle</h3>
          <p className="text-sm text-text-secondary leading-relaxed">
            Contracts are created as <strong className="text-text-primary">drafts</strong>. The counterparty
            reviews and submits a <strong className="text-text-primary">handshake</strong> — accepting, rejecting,
            or requesting changes. Once accepted, the first ECDSA wallet signature moves the contract
            to <strong className="text-text-primary">pending_signature</strong>.
            When the second party signs, the contract becomes <strong className="text-text-primary">active</strong>.
            Both signatures are cryptographically verified — no API key needed to sign, just a valid wallet.
          </p>
        </div>
      </ScrollReveal>

      <ScrollReveal delay={0.35}>
        <div className="mt-4">
          <h3 className="text-lg font-semibold text-text-primary mb-4">MCP Integration</h3>
          <p className="text-sm text-text-secondary mb-4">
            Add Ambr to your AI agent with one config block. Works with Claude Code, Cursor, and any MCP-compatible client.
            Your agent gets 6 tools: list templates, create contracts, get/verify contracts, check status, and agent handshake.
          </p>

          <div className="space-y-4">
            <div>
              <p className="text-xs font-mono text-text-secondary mb-2">Claude Code — settings.json</p>
              <CodeSnippet code={`{
  "mcpServers": {
    "ambr": {
      "type": "url",
      "url": "https://getamber.dev/api/mcp",
      "headers": {
        "X-API-Key": "YOUR_API_KEY"
      }
    }
  }
}`} title="Claude Code MCP Config" />
            </div>

            <div>
              <p className="text-xs font-mono text-text-secondary mb-2">Cursor — .cursor/mcp.json</p>
              <CodeSnippet code={`{
  "mcpServers": {
    "ambr": {
      "url": "https://getamber.dev/api/mcp",
      "headers": {
        "X-API-Key": "YOUR_API_KEY"
      }
    }
  }
}`} title="Cursor MCP Config" />
            </div>
          </div>

          <p className="text-xs text-text-secondary mt-3">
            Get your API key at <a href="/activate" className="text-amber hover:underline">/activate</a>.
            Tools that modify state (create contract, agent handshake) require a valid key.
            Read-only tools (list templates, verify hash) work without authentication.
          </p>
        </div>
      </ScrollReveal>
    </div>
  );
}
