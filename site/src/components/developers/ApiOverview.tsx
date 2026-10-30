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
    template: 'd1-general-auth',
    parameters: {
      principal_name: 'Acme Analytics Ltd.',
      principal_type: 'corporation',
      principal_registration_number: 'DE-5589021',
      principal_address: '1209 Orange St, Wilmington, DE',
      agent_id: '0x7a3b...9f2e',
      agent_type: 'autonomous',
      scope: 'procurement and vendor payments',
      categories: ['procurement', 'api-calls'],
      spending_limit_per_tx: 2500,
      spending_limit_monthly: 10000,
      duration_months: 12,
      governing_law: 'Delaware',
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
    description: 'Sign a contract with an ECDSA wallet signature. A declared wallet signs without an API key. An open principal side needs the creator: the creating account’s bound wallet if it has one, otherwise the creating API key (X-API-Key header). An open counterparty side needs the invite token from POST /v1/contracts/:id/share, sent as share_token in the body. Bilateral templates need both parties; one-sided templates (p2 power of attorney) activate on the principal’s single signature.',
    code: `const message = [
  'I am signing Ambr contract amb-2026-0001',
  '',
  'Contract SHA-256: <sha256_hash>',
  '',
  'Timestamp: ' + new Date().toISOString(),
].join('\\n');

const response = await fetch(
  'https://getamber.dev/api/v1/contracts/amb-2026-0001/sign',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Open principal side, creating account without a bound wallet:
      // 'X-API-Key': '<the key that created the contract>',
    },
    body: JSON.stringify({
      wallet_address: '0x7a3b...9f2e',
      signature: await wallet.signMessage(message),
      message,
      // Open counterparty side: the token from POST /share
      // share_token: '<token>',
    }),
  }
);
// Bilateral — first sig:  draft → pending_signature
//             second sig: pending_signature → active
// One-sided (p2) — principal's sig: draft → active`,
  },
  {
    method: 'GET',
    path: '/v1/contracts/:id',
    description: 'Query contract status, metadata, and amendment chain. Full text requires API key or share token.',
    code: `const contract = await fetch(
  'https://getamber.dev/api/v1/contracts/amb-2026-0001',
  { headers: { 'X-API-Key': '<API_KEY>' } }
).then(r => r.json());

// contract.status → 'draft' | 'awaiting_principal_approval' | 'handshake'
//                   | 'pending_signature' | 'active' | 'amended'
//                   | 'revoked' | 'expired' | 'terminated'
// contract.sha256_hash → 'a1b2c3...'
// contract.amendment_chain → [{ hash, parent_hash, type }]`,
  },
  {
    method: 'GET',
    path: '/v1/contracts/:id/status',
    description: 'Public validity check — no auth required. Answers "is this authority in force right now?" from status, revocation, expiry, the signatures on file and the stored text’s hash together.',
    code: `const status = await fetch(
  'https://getamber.dev/api/v1/contracts/amb-2026-0001/status'
).then(r => r.json());

// status.status             → 'active'
// status.is_currently_valid → true only while active, not revoked, not expired,
//                             fully signed, and the text still matches its hash
// status.validity_reasons   → [] when valid, else e.g. ['missing_signatures']
// status.missing_signers    → ['principal' | 'counterparty'] still to sign
// status.is_expired         → true once expiry_date is in the past
// status.revoked_at         → null | ISO timestamp
// status.expiry_date        → null | ISO timestamp`,
  },
  {
    method: 'POST',
    path: '/v1/contracts/:id/revoke',
    description: 'Revoke an active, pending_signature, or handshake contract. Either party may withdraw — the creator via API key, or any party wallet via signature; revoked_by records who. Irreversible; cascades to child contracts in the delegation chain.',
    code: `const response = await fetch(
  'https://getamber.dev/api/v1/contracts/amb-2026-0001/revoke',
  {
    method: 'POST',
    headers: {
      'X-API-Key': '<API_KEY>',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason: 'Engagement ended early' }),
  }
);
// Wallet auth instead of API key: send wallet_address + signature + message
// in the body. The signed message must state revocation intent and contain
// the contract SHA-256 hash, e.g.:
//   "I revoke Ambr contract amb-2026-0001 with hash <sha256_hash>"
//
// response.status → 'revoked' (terminal — cannot be undone)
// response.cascade.children_revoked → child delegations revoked with the parent`,
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
      visibility: 'private', // 'private' | 'metadata_only' | 'public' | 'encrypted'
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
    description: 'Activate an API key. The developer tier is free (verified email, 500 credits once); credit-pack tiers verify a Base L2 USDC payment by transaction hash.',
    code: `const response = await fetch(
  'https://getamber.dev/api/v1/keys',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'dev@yourco.com',
      tier: 'developer', // free — or 'startup' ($49 pack) / 'scale' ($199 pack)
      // tx_hash: '0x9876...fedc', // required for paid tiers (Base L2 USDC)
    }),
  }
);
// response.api_key → 'amb_...' — shown once, save it
// response.credits → 25 (developer) | 200 (startup) | 1000 (scale)`,
  },
];

const methodColors: Record<string, string> = {
  GET: 'text-[#e8d9bb] border border-amber/25',
  POST: 'text-amber border border-amber/50',
};

export default function ApiOverview() {
  return (
    <div className="space-y-8">
      {endpoints.map((ep, i) => (
        <ScrollReveal key={ep.path} delay={i * 0.08}>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className={`rounded-none px-2 py-0.5 text-[11px] font-mono uppercase tracking-wider ${methodColors[ep.method] || 'text-text-secondary'}`}>
                {ep.method}
              </span>
              <code className="font-mono text-sm text-text-primary">{ep.path}</code>
            </div>
            <p className="text-sm text-[#a39b8c] mb-3">{ep.description}</p>
            <CodeSnippet code={ep.code} title={`${ep.method} ${ep.path}`} />
          </div>
        </ScrollReveal>
      ))}

      <ScrollReveal delay={0.3}>
        <div className="relative rounded-none border border-amber/30 bg-[#0c0b09] p-6">
          <span className="pointer-events-none absolute left-2 top-2 h-1 w-1 bg-amber" aria-hidden />
          <span className="pointer-events-none absolute right-2 top-2 h-1 w-1 bg-amber" aria-hidden />
          <span className="pointer-events-none absolute bottom-2 left-2 h-1 w-1 bg-amber" aria-hidden />
          <span className="pointer-events-none absolute bottom-2 right-2 h-1 w-1 bg-amber" aria-hidden />
          <h3 className="font-serif text-lg text-amber mb-2">Mandate Lifecycle</h3>
          <p className="text-sm text-[#a39b8c] leading-relaxed">
            Mandates are created as <strong className="text-text-primary">drafts</strong>. The counterparty
            reviews and submits a <strong className="text-text-primary">handshake</strong> — accepting, rejecting,
            or requesting changes. Once accepted, the first ECDSA wallet signature moves the contract
            to <strong className="text-text-primary">pending_signature</strong>.
            When the second party signs, the contract becomes <strong className="text-text-primary">active</strong>.
            One-sided templates (such as the p2 power of attorney) skip this — the principal&apos;s
            single signature activates them immediately.
            Both signatures are cryptographically verified. A wallet named in the contract signs without an
            API key; an open principal side is signed by the creator (their bound wallet, or the creating
            API key), and an open counterparty side by the holder of the invite token from the share link.
          </p>
          <p className="text-sm text-[#a39b8c] leading-relaxed mt-3">
            An active mandate can end three recorded ways: <strong className="text-text-primary">amended</strong>{' '}
            (replaced by a successor contract), <strong className="text-text-primary">revoked</strong>{' '}
            (a party&apos;s human override), or <strong className="text-text-primary">terminated</strong>.
            Expiry is <em>derived</em>: past its expiry date (taken from the contract&apos;s own terms,
            anchored at signing) the status column may still read <code>active</code>, but{' '}
            <code className="text-text-primary">is_currently_valid</code> flips to false and{' '}
            <code className="text-text-primary">is_expired</code> to true. All end states are terminal.
            For the live answer, always check <code className="text-text-primary">GET /:id/status</code> →{' '}
            <code className="text-text-primary">is_currently_valid</code>.
          </p>
        </div>
      </ScrollReveal>

      <ScrollReveal delay={0.32}>
        <div className="relative rounded-none border border-amber/20 bg-[#0c0b09] p-6">
          <span className="pointer-events-none absolute left-2 top-2 h-1 w-1 bg-amber/60" aria-hidden />
          <span className="pointer-events-none absolute right-2 top-2 h-1 w-1 bg-amber/60" aria-hidden />
          <span className="pointer-events-none absolute bottom-2 left-2 h-1 w-1 bg-amber/60" aria-hidden />
          <span className="pointer-events-none absolute bottom-2 right-2 h-1 w-1 bg-amber/60" aria-hidden />
          <h3 className="font-serif text-lg text-text-primary mb-2">Errors &amp; rate limits</h3>
          <ul className="text-sm text-text-secondary leading-relaxed space-y-1 font-mono">
            <li><span className="text-text-primary">400 bad_request</span> — malformed JSON body</li>
            <li><span className="text-text-primary">400 validation_error / invalid_signature / hash_mismatch / message_mismatch</span> — sign &amp; revoke flows: missing fields, unverifiable signature, or a signed message without the required contract hash / intent</li>
            <li><span className="text-text-primary">401 unauthorized / signature_mismatch</span> — missing or invalid credentials (API key, or signature not matching the wallet)</li>
            <li><span className="text-text-primary">403 unauthorized</span> — wallet not associated with this contract</li>
            <li><span className="text-text-primary">404 not_found</span> — unknown contract id or hash</li>
            <li><span className="text-text-primary">409 already_revoked / invalid_state</span> — action was already applied or conflicts with current state</li>
            <li><span className="text-text-primary">422 invalid_status</span> — action not allowed in the contract&apos;s current status</li>
            <li><span className="text-text-primary">429 rate_limited</span> — response includes <code>retry_after_ms</code></li>
          </ul>
          <p className="text-xs text-text-secondary mt-3">
            Exact error codes vary slightly per endpoint — the snippets above show each endpoint&apos;s behavior.
            Several write endpoints are rate-limited, per IP or per API key (revocation allows 5 requests
            per minute per IP). Back off and retry after <code>retry_after_ms</code> on 429.
          </p>
        </div>
      </ScrollReveal>

      <ScrollReveal delay={0.35}>
        <div className="mt-4">
          <h3 className="font-serif text-lg text-text-primary mb-4">MCP Integration</h3>
          <p className="text-sm text-[#a39b8c] mb-4">
            Add Ambr to your AI agent with one config block. Works with Claude Code, Cursor, and any MCP-compatible client.
            Your agent gets 6 tools: list templates, create mandates, get/verify mandates, check status, and agent handshake.
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
