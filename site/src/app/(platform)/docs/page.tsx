export default function DocsPage() {
  return (
    <main className="pt-28 pb-[60vh] px-4 lg:px-6">

      {/* ──────────────────────────────────────────────── */}
      {/* GETTING STARTED                                  */}
      {/* ──────────────────────────────────────────────── */}

      <section id="what-is-ambr" className="scroll-mt-24 mb-16">
        <p className="text-micro mb-3">§ 01 — Getting Started</p>
        <h2 className="font-serif text-3xl text-text-primary mb-4">What is Ambr</h2>
        <p className="text-[#a39b8c] text-sm leading-relaxed">
          Ambr is the Agent Mandate &amp; Binding Registry: the authorization and liability record for
          autonomous agents. An Agent Mandate records who authorized an agent, in what scope, under
          which law. Create, sign, and verify these dual-format Ricardian contracts through a single API
          -- no human bottleneck, no PDF workflows.
        </p>
      </section>

      <section id="get-api-key" className="scroll-mt-24 mb-16">
        <h3 className="font-serif text-xl text-text-primary mb-4">Get a Free Developer Key</h3>
        <p className="text-[#a39b8c] text-sm leading-relaxed mb-4">
          Go to{' '}
          <a
            href="https://getamber.dev/activate"
            className="text-amber underline underline-offset-4"
          >
            getamber.dev/activate
          </a>
          , enter your email, and open the link we send you — that verifies the address
          and reveals your key. The link works once and expires in 30 minutes. The free
          developer tier includes 500 credits (cents) once per verified key, with no payment
          required. Keys are stored hashed and cannot be shown twice, so save it when you
          get there; if you lose it, request another link and it will issue a replacement.
        </p>
      </section>

      <section id="first-contract" className="scroll-mt-24 mb-16">
        <h3 className="font-serif text-xl text-text-primary mb-4">Your First Mandate</h3>
        <p className="text-[#a39b8c] text-sm leading-relaxed mb-4">
          Create a delegation mandate (template <code className="font-mono text-amber/80">d1-general-auth</code>)
          with a single POST request. Every request needs a <code className="font-mono text-amber/80">template</code>{' '}
          slug, a <code className="font-mono text-amber/80">principal_declaration</code>, and the template&apos;s
          required <code className="font-mono text-amber/80">parameters</code>:
        </p>
        <pre className="bg-[#111] border border-amber/20 rounded-none p-4 font-mono text-sm text-text-secondary overflow-x-auto">
{`curl -X POST https://getamber.dev/api/v1/contracts \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_KEY" \\
  -d '{
    "template": "d1-general-auth",
    "principal_declaration": {
      "agent_id": "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
      "principal_name": "Acme Corp",
      "principal_type": "company"
    },
    "parameters": {
      "principal_name": "Acme Corp",
      "principal_type": "corporation",
      "principal_registration_number": "DE-5589021",
      "principal_address": "1209 Orange St, Wilmington, DE 19801",
      "agent_id": "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
      "agent_type": "autonomous",
      "scope": "procurement and vendor payments",
      "categories": ["procurement", "api-calls"],
      "spending_limit_per_tx": 2500,
      "spending_limit_monthly": 10000,
      "duration_months": 12,
      "governing_law": "Delaware"
    }
  }'`}
        </pre>
        <p className="text-[#a39b8c] text-sm leading-relaxed mt-4">
          The response returns the mandate&apos;s <code className="font-mono text-amber/80">contract_id</code>,
          a SHA-256 content hash, a reader URL for the counterparty, and a sign URL for wallet-based execution.
          Call <code className="font-mono text-amber/80">GET /api/v1/templates</code> for each template&apos;s full
          parameter list.
        </p>
      </section>

      <div className="h-px bg-gradient-to-r from-transparent via-amber/20 to-transparent my-16" />

      {/* ──────────────────────────────────────────────── */}
      {/* CONTRACT LIFECYCLE                               */}
      {/* ──────────────────────────────────────────────── */}

      <section id="create" className="scroll-mt-24 mb-16">
        <p className="text-micro mb-3">§ 02 — Contract Lifecycle</p>
        <h2 className="font-serif text-3xl text-text-primary mb-4">Create</h2>
        <p className="text-[#a39b8c] text-sm leading-relaxed mb-4">
          <code className="font-mono text-amber/80">POST /api/v1/contracts</code> creates a new
          Agent Mandate (a dual-format Ricardian contract) from a template. The response includes the
          mandate&apos;s ID, a SHA-256 content hash, a reader URL (with embedded share token), a sign URL,
          and a handshake URL.
        </p>
        <pre className="bg-[#111] border border-amber/20 rounded-none p-4 font-mono text-sm text-text-secondary overflow-x-auto">
{`{
  "contract_id": "amb-2026-0042",
  "sha256_hash": "9f86d081884c...",
  "status": "draft",
  "reader_url": "https://getamber.dev/reader/9f86d081884c...?token=...",
  "sign_url": "https://getamber.dev/api/v1/contracts/amb-2026-0042/sign",
  "handshake_url": "https://getamber.dev/api/v1/contracts/amb-2026-0042/handshake",
  "next_step": "Contract created as draft. Both parties sign (ECDSA) to activate."
}`}
        </pre>
      </section>

      <section id="share" className="scroll-mt-24 mb-16">
        <h3 className="font-serif text-xl text-text-primary mb-4">Share</h3>
        <p className="text-[#a39b8c] text-sm leading-relaxed">
          The <code className="font-mono text-amber/80">reader_url</code> in the create response
          is your own link: it opens the full mandate without an API key, but it cannot fill an
          open counterparty side. To invite the counterparty, call{' '}
          <code className="font-mono text-amber/80">POST /api/v1/contracts/:id/share</code> with your
          API key and send them the <code className="font-mono text-amber/80">share_url</code> it
          returns, or add <code className="font-mono text-amber/80">recipient_email</code> to have it
          emailed. The invite lets them review the full terms before the handshake or signature.
          Pass <code className="font-mono text-amber/80">&quot;purpose&quot;: &quot;deployer&quot;</code> for
          another link of your own, or{' '}
          <code className="font-mono text-amber/80">&quot;access_level&quot;: &quot;scope&quot;</code> for one
          that shows only what the agent may do.
        </p>
      </section>

      <section id="handshake" className="scroll-mt-24 mb-16">
        <h3 className="font-serif text-xl text-text-primary mb-4">Handshake</h3>
        <p className="text-[#a39b8c] text-sm leading-relaxed mb-4">
          <code className="font-mono text-amber/80">POST /api/v1/contracts/:id/handshake</code>{' '}
          lets the counterparty accept, reject, or request changes to a mandate. The handshake
          also records a visibility preference (private, metadata-only, public, or encrypted).
        </p>
        <pre className="bg-[#111] border border-amber/20 rounded-none p-4 font-mono text-sm text-text-secondary overflow-x-auto">
{`{
  "action": "accept",        // "accept" | "reject" | "request_changes"
  "visibility": "private",   // "private" | "metadata_only" | "public" | "encrypted"
  "wallet_address": "0x..."
}`}
        </pre>
      </section>

      <section id="sign" className="scroll-mt-24 mb-16">
        <h3 className="font-serif text-xl text-text-primary mb-4">Sign</h3>
        <p className="text-[#a39b8c] text-sm leading-relaxed mb-4">
          <code className="font-mono text-amber/80">POST /api/v1/contracts/:id/sign</code>{' '}
          submits an ECDSA wallet signature. Bilateral mandates require two signatures: the first
          moves the mandate to <code className="font-mono text-amber/80">pending</code> status,
          the second activates it and triggers on-chain minting. One-sided mandates (P2 Power of
          Attorney) activate on the principal&apos;s single signature.
        </p>
        <p className="text-[#a39b8c] text-sm leading-relaxed mb-4">
          A wallet named in the contract signs without an API key. If the principal side names no
          wallet, only the creator can fill it: the creating account&apos;s bound wallet if it has one,
          otherwise the creating API key (<code className="font-mono text-amber/80">X-API-Key</code>).
          If the counterparty side names no wallet, it is filled by invitation: send the token from{' '}
          <code className="font-mono text-amber/80">POST /api/v1/contracts/:id/share</code> as{' '}
          <code className="font-mono text-amber/80">share_token</code> in the sign body (full access;
          a scope token is not enough).
        </p>
      </section>

      <section id="verify" className="scroll-mt-24 mb-16">
        <h3 className="font-serif text-xl text-text-primary mb-4">Verify</h3>
        <p className="text-[#a39b8c] text-sm leading-relaxed">
          <code className="font-mono text-amber/80">GET /api/v1/contracts/:id</code> returns the
          full mandate including its SHA-256 hash. Compare this hash against the on-chain record
          to verify the mandate has not been tampered with since signing.
        </p>
      </section>

      <div className="h-px bg-gradient-to-r from-transparent via-amber/20 to-transparent my-16" />

      {/* ──────────────────────────────────────────────── */}
      {/* AGENT INTEGRATION                                */}
      {/* ──────────────────────────────────────────────── */}

      <section id="a2a-discovery" className="scroll-mt-24 mb-16">
        <p className="text-micro mb-3">§ 03 — Agent Integration</p>
        <h2 className="font-serif text-3xl text-text-primary mb-4">A2A Discovery</h2>
        <p className="text-[#a39b8c] text-sm leading-relaxed mb-4">
          AI agents discover Ambr through the standard A2A well-known endpoint:
        </p>
        <pre className="bg-[#111] border border-amber/20 rounded-none p-4 font-mono text-sm text-text-secondary overflow-x-auto">
{`GET https://getamber.dev/.well-known/agent.json`}
        </pre>
        <p className="text-[#a39b8c] text-sm leading-relaxed mt-4">
          The agent card describes available capabilities, authentication methods, and
          supported interaction protocols.
        </p>
      </section>

      <section id="mcp-server" className="scroll-mt-24 mb-16">
        <h3 className="font-serif text-xl text-text-primary mb-4">MCP Server</h3>
        <p className="text-[#a39b8c] text-sm leading-relaxed mb-4">
          Add Ambr as an MCP server in your agent configuration:
        </p>
        <pre className="bg-[#111] border border-amber/20 rounded-none p-4 font-mono text-sm text-text-secondary overflow-x-auto">
{`{
  "mcpServers": {
    "ambr": {
      "url": "https://getamber.dev/api/mcp",
      "headers": { "X-API-Key": "YOUR_KEY" }
    }
  }
}`}
        </pre>
        <p className="text-[#a39b8c] text-sm leading-relaxed mt-4">
          The MCP server exposes six tools -- <code className="font-mono text-amber/80">ambr_list_templates</code>,{' '}
          <code className="font-mono text-amber/80">ambr_create_contract</code>,{' '}
          <code className="font-mono text-amber/80">ambr_get_contract</code>,{' '}
          <code className="font-mono text-amber/80">ambr_get_contract_status</code>,{' '}
          <code className="font-mono text-amber/80">ambr_verify_hash</code>, and{' '}
          <code className="font-mono text-amber/80">ambr_agent_handshake</code> -- so any MCP-compatible agent
          can manage mandates natively. Contract creation accepts an API key or x402 pay-per-call.
        </p>
      </section>

      <section id="rest-api" className="scroll-mt-24 mb-16">
        <h3 className="font-serif text-xl text-text-primary mb-4">REST API</h3>
        <p className="text-[#a39b8c] text-sm leading-relaxed mb-4">
          All endpoints accept and return JSON. Authenticate with the{' '}
          <code className="font-mono text-amber/80">X-API-Key</code> header or a share token
          where noted. Base URL:{' '}
          <code className="font-mono text-amber/80">https://getamber.dev/api/v1</code>
        </p>
      </section>

      <section id="x402-payments" className="scroll-mt-24 mb-16">
        <h3 className="font-serif text-xl text-text-primary mb-4">x402 Pay-per-mandate</h3>
        <p className="text-[#a39b8c] text-sm leading-relaxed">
          Instead of an API key, agents can pay per mandate using the x402 protocol. Include a
          payment header with each request. The server validates the payment proof on-chain before
          processing the mandate creation. This enables fully autonomous agent-to-agent commerce
          without pre-registration.
        </p>
      </section>

      <div className="h-px bg-gradient-to-r from-transparent via-amber/20 to-transparent my-16" />

      {/* ──────────────────────────────────────────────── */}
      {/* API REFERENCE                                    */}
      {/* ──────────────────────────────────────────────── */}

      <section id="endpoints" className="scroll-mt-24 mb-16">
        <p className="text-micro mb-3">§ 04 — API Reference</p>
        <h2 className="font-serif text-3xl text-text-primary mb-6">Endpoints</h2>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-amber/30">
                <th className="text-left py-3 pr-4 font-mono text-[0.7rem] uppercase tracking-wider text-amber/70">
                  Method
                </th>
                <th className="text-left py-3 pr-4 font-mono text-[0.7rem] uppercase tracking-wider text-amber/70">
                  Path
                </th>
                <th className="text-left py-3 pr-4 font-mono text-[0.7rem] uppercase tracking-wider text-amber/70">
                  Auth
                </th>
                <th className="text-left py-3 font-mono text-[0.7rem] uppercase tracking-wider text-amber/70">
                  Description
                </th>
              </tr>
            </thead>
            <tbody className="text-text-secondary">
              <tr className="border-b border-border">
                <td className="py-3 pr-4 font-mono text-amber/80">POST</td>
                <td className="py-3 pr-4 font-mono text-xs">/v1/contracts</td>
                <td className="py-3 pr-4 text-xs">API Key or x402</td>
                <td className="py-3 text-xs">Create contract</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-3 pr-4 font-mono text-amber/80">GET</td>
                <td className="py-3 pr-4 font-mono text-xs">/v1/contracts/:id</td>
                <td className="py-3 pr-4 text-xs">API Key or share token</td>
                <td className="py-3 text-xs">Get contract</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-3 pr-4 font-mono text-amber/80">POST</td>
                <td className="py-3 pr-4 font-mono text-xs">/v1/contracts/:id/handshake</td>
                <td className="py-3 pr-4 text-xs">Share token + wallet</td>
                <td className="py-3 text-xs">Accept / reject</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-3 pr-4 font-mono text-amber/80">POST</td>
                <td className="py-3 pr-4 font-mono text-xs">/v1/contracts/:id/sign</td>
                <td className="py-3 pr-4 text-xs">Wallet signature; open principal side: creator; open counterparty side: share token</td>
                <td className="py-3 text-xs">Sign contract</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-3 pr-4 font-mono text-amber/80">POST</td>
                <td className="py-3 pr-4 font-mono text-xs">/v1/contracts/:id/wallet-auth</td>
                <td className="py-3 pr-4 text-xs">Wallet signature</td>
                <td className="py-3 text-xs">Prove wallet association</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-3 pr-4 font-mono text-amber/80">GET</td>
                <td className="py-3 pr-4 font-mono text-xs">/v1/templates</td>
                <td className="py-3 pr-4 text-xs">None</td>
                <td className="py-3 text-xs">List templates</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-3 pr-4 font-mono text-amber/80">POST</td>
                <td className="py-3 pr-4 font-mono text-xs">/v1/keys</td>
                <td className="py-3 pr-4 text-xs">None</td>
                <td className="py-3 text-xs">Activate API key (developer free; credit packs paid via Base USDC — Team subscription via /activate)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-3 pr-4 font-mono text-amber/80">POST</td>
                <td className="py-3 pr-4 font-mono text-xs">/v1/identity/verify</td>
                <td className="py-3 pr-4 text-xs">API Key or share token</td>
                <td className="py-3 text-xs">Submit a ZK identity proof</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-3 pr-4 font-mono text-amber/80">POST</td>
                <td className="py-3 pr-4 font-mono text-xs">/v1/dashboard</td>
                <td className="py-3 pr-4 text-xs">API Key</td>
                <td className="py-3 text-xs">Dashboard data</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-3 pr-4 font-mono text-amber/80">POST</td>
                <td className="py-3 pr-4 font-mono text-xs">/v1/dashboard/wallet-auth</td>
                <td className="py-3 pr-4 text-xs">Wallet signature</td>
                <td className="py-3 text-xs">Dashboard via wallet</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-[#a39b8c]">
          Copy-paste request examples for every endpoint — including error codes and rate limits —
          live on the{' '}
          <a href="/developers" className="text-amber underline underline-offset-4">developers page</a>.
        </p>
      </section>

      <div className="h-px bg-gradient-to-r from-transparent via-amber/20 to-transparent my-16" />

      {/* ──────────────────────────────────────────────── */}
      {/* WALLET & IDENTITY                                */}
      {/* ──────────────────────────────────────────────── */}

      <section id="connect-wallet" className="scroll-mt-24 mb-16">
        <p className="text-micro mb-3">§ 05 — Wallet &amp; Identity</p>
        <h2 className="font-serif text-3xl text-text-primary mb-4">Connect Wallet</h2>
        <p className="text-[#a39b8c] text-sm leading-relaxed">
          The Ambr dashboard supports dual login: authenticate with your API key or connect a
          wallet directly. Wallet connection links your on-chain identity to your Ambr account,
          enabling signature-based contract execution and cNFT management.
        </p>
      </section>

      <section id="wallet-auth" className="scroll-mt-24 mb-16">
        <h3 className="font-serif text-xl text-text-primary mb-4">Wallet Auth</h3>
        <p className="text-[#a39b8c] text-sm leading-relaxed">
          The Reader Portal uses ECDSA signature verification for counterparty authentication.
          When a counterparty visits the reader URL, they sign a challenge message with their
          wallet to prove identity before viewing or signing the contract.
        </p>
      </section>

      <section id="cnft" className="scroll-mt-24 mb-16">
        <h3 className="font-serif text-xl text-text-primary mb-4">Contract NFTs</h3>
        <p className="text-[#a39b8c] text-sm leading-relaxed">
          Each fully-signed contract is minted as an ERC-721 cNFT on Base L2. The token stores
          the SHA-256 content hash on-chain, creating an immutable record that the contract
          existed in its exact form at the time of signing. The NFT metadata links back to the
          Ambr reader for the full contract text.
        </p>
      </section>

      <section id="transfers" className="scroll-mt-24 mb-16">
        <h3 className="font-serif text-xl text-text-primary mb-4">Transfers</h3>
        <p className="text-[#a39b8c] text-sm leading-relaxed">
          Contract NFTs use counterparty-gated transfers. Both signing parties must approve a
          transfer before the NFT can move to a new wallet. This prevents unilateral reassignment
          of contractual obligations.
        </p>
      </section>

      <div className="h-px bg-gradient-to-r from-transparent via-amber/20 to-transparent my-16" />

      {/* ──────────────────────────────────────────────── */}
      {/* PAYMENT METHODS                                  */}
      {/* ──────────────────────────────────────────────── */}

      <section id="pricing" className="scroll-mt-24 mb-16">
        <p className="text-micro mb-3">§ 06 — Payment Methods</p>
        <h2 className="font-serif text-3xl text-text-primary mb-4">Pricing</h2>

        <h4 className="font-serif text-lg text-text-primary mb-3 mt-6">x402 Pay-per-Mandate (Agent-Native)</h4>
        <p className="text-[#a39b8c] text-sm leading-relaxed mb-4">
          No account needed. Agents pay per mandate in USDC on Base L2 with a standard x402 v2 client: the first call returns 402 with a <code className="font-mono text-amber/80">PAYMENT-REQUIRED</code> header, and the retry carries a signed <code className="font-mono text-amber/80">PAYMENT-SIGNATURE</code> header.
          Live rates for the full catalog: <code className="font-mono text-amber/80">GET /api/v1/pricing</code>.
        </p>
        <div className="overflow-x-auto mb-6">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-amber/30">
                <th className="text-left py-2 pr-4 font-mono text-[0.7rem] uppercase tracking-wider text-amber/70">Mandate</th>
                <th className="text-left py-2 pr-4 font-mono text-[0.7rem] uppercase tracking-wider text-amber/70">Price</th>
                <th className="text-left py-2 font-mono text-[0.7rem] uppercase tracking-wider text-amber/70">Use Case</th>
              </tr>
            </thead>
            <tbody className="text-text-secondary">
              <tr className="border-b border-border"><td className="py-2 pr-4 font-mono text-xs">Power of Attorney (P2)</td><td className="py-2 pr-4 font-mono text-xs text-amber">$0.20</td><td className="py-2 text-xs">Authorize your own agent — one signature</td></tr>
              <tr className="border-b border-border"><td className="py-2 pr-4 font-mono text-xs">Delegation (D1)</td><td className="py-2 pr-4 font-mono text-xs text-amber">$0.50</td><td className="py-2 text-xs">Delegate authority to your agent, with spending caps</td></tr>
              <tr className="border-b border-border"><td className="py-2 pr-4 font-mono text-xs">Agent-to-Agent (A2A)</td><td className="py-2 pr-4 font-mono text-xs text-amber">$1.00</td><td className="py-2 text-xs">One agent commissions and pays another</td></tr>
              <tr className="border-b border-border"><td className="py-2 pr-4 font-mono text-xs">Fleet (d3)</td><td className="py-2 pr-4 font-mono text-xs text-amber">$2.50</td><td className="py-2 text-xs">Shared budgets &amp; sub-delegation across a fleet</td></tr>
              <tr className="border-b border-border"><td className="py-2 pr-4 font-mono text-xs">cNFT minting (gas)</td><td className="py-2 pr-4 font-mono text-xs text-text-secondary">included</td><td className="py-2 text-xs">Base L2 mint cost absorbed</td></tr>
              <tr className="border-b border-border"><td className="py-2 pr-4 font-mono text-xs">Handshake / Sign / Verify</td><td className="py-2 pr-4 font-mono text-xs text-success">Free</td><td className="py-2 text-xs">Lifecycle actions never charged</td></tr>
              <tr className="border-b border-border"><td className="py-2 pr-4 font-mono text-xs">Reader Access</td><td className="py-2 pr-4 font-mono text-xs text-success">Free</td><td className="py-2 text-xs">Counterparties always free</td></tr>
            </tbody>
          </table>
        </div>

        <h4 className="font-serif text-lg text-text-primary mb-3 mt-8">Monthly Subscriptions (Predictable Billing)</h4>
        <p className="text-[#a39b8c] text-sm leading-relaxed mb-4">
          For teams that prefer a monthly plan with included credits.
          Purchase via{' '}
          <a href="https://getamber.dev/activate" className="text-amber underline underline-offset-4">getamber.dev/activate</a>{' '}
          (Stripe Checkout). The free tier -- 500 credits (cents) once per verified key, no card -- is described above.
        </p>
        <div className="overflow-x-auto mb-6">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-amber/30">
                <th className="text-left py-2 pr-4 font-mono text-[0.7rem] uppercase tracking-wider text-amber/70">Plan</th>
                <th className="text-left py-2 pr-4 font-mono text-[0.7rem] uppercase tracking-wider text-amber/70">Price</th>
                <th className="text-left py-2 pr-4 font-mono text-[0.7rem] uppercase tracking-wider text-amber/70">Credits</th>
                <th className="text-left py-2 font-mono text-[0.7rem] uppercase tracking-wider text-amber/70">Notes</th>
              </tr>
            </thead>
            <tbody className="text-text-secondary">
                            <tr className="border-b border-border"><td className="py-2 pr-4 font-mono text-xs">Team</td><td className="py-2 pr-4 font-mono text-xs text-amber">$29/month</td><td className="py-2 pr-4 text-xs">3,000</td><td className="py-2 text-xs">Granted per paid invoice; buy a pack for more</td></tr>
              <tr className="border-b border-border"><td className="py-2 pr-4 font-mono text-xs">Enterprise</td><td className="py-2 pr-4 font-mono text-xs text-amber">$4,800/year</td><td className="py-2 pr-4 text-xs">24,000</td><td className="py-2 text-xs">Private verifier, DPA, audit export</td></tr>
            </tbody>
          </table>
        </div>

        <h4 className="font-serif text-lg text-text-primary mb-3 mt-8">Credit Packs (One-Time)</h4>
        <p className="text-[#a39b8c] text-sm leading-relaxed mb-4">
          Prefer to top up without a subscription? Buy a one-time credit pack -- credits are added to your
          key and do not expire.
        </p>
        <div className="overflow-x-auto mb-4">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-amber/30">
                <th className="text-left py-2 pr-4 font-mono text-[0.7rem] uppercase tracking-wider text-amber/70">Pack</th>
                <th className="text-left py-2 pr-4 font-mono text-[0.7rem] uppercase tracking-wider text-amber/70">Price</th>
                <th className="text-left py-2 font-mono text-[0.7rem] uppercase tracking-wider text-amber/70">Credits</th>
              </tr>
            </thead>
            <tbody className="text-text-secondary">
              <tr className="border-b border-border"><td className="py-2 pr-4 font-mono text-xs">Starter Pack</td><td className="py-2 pr-4 font-mono text-xs text-amber">$49</td><td className="py-2 text-xs">4,900</td></tr>
              <tr className="border-b border-border"><td className="py-2 pr-4 font-mono text-xs">Scale Pack</td><td className="py-2 pr-4 font-mono text-xs text-amber">$199</td><td className="py-2 text-xs">21,900</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="crypto" className="scroll-mt-24 mb-16">
        <h3 className="font-serif text-xl text-text-primary mb-4">Crypto</h3>
        <p className="text-[#a39b8c] text-sm leading-relaxed mb-4">
          Pay for contracts with 7 tokens on Base L2:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-amber/30">
                <th className="text-left py-2 pr-4 font-mono text-[0.7rem] uppercase tracking-wider text-amber/70">
                  Token
                </th>
                <th className="text-left py-2 font-mono text-[0.7rem] uppercase tracking-wider text-amber/70">
                  Type
                </th>
              </tr>
            </thead>
            <tbody className="text-text-secondary">
              <tr className="border-b border-border">
                <td className="py-2 pr-4 font-mono text-xs">USDC</td>
                <td className="py-2 text-xs">Stablecoin</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 pr-4 font-mono text-xs">USDbC</td>
                <td className="py-2 text-xs">Bridged USDC</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 pr-4 font-mono text-xs">DAI</td>
                <td className="py-2 text-xs">Stablecoin</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 pr-4 font-mono text-xs">ETH</td>
                <td className="py-2 text-xs">Native</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 pr-4 font-mono text-xs">WETH</td>
                <td className="py-2 text-xs">Wrapped ETH</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 pr-4 font-mono text-xs">cbETH</td>
                <td className="py-2 text-xs">Coinbase staked ETH</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 pr-4 font-mono text-xs">cbBTC</td>
                <td className="py-2 text-xs">Coinbase wrapped BTC</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="card" className="scroll-mt-24 mb-16">
        <h3 className="font-serif text-xl text-text-primary mb-4">Card Payments</h3>
        <p className="text-[#a39b8c] text-sm leading-relaxed">
          Stripe Checkout handles card payments for the Team monthly subscription and for
          the Starter and Scale credit packs. Enterprise is a contact CTA. Use the free tier or
          x402 crypto payments to get started without a card.
        </p>
      </section>

      <div className="h-px bg-gradient-to-r from-transparent via-amber/20 to-transparent my-16" />

      {/* ──────────────────────────────────────────────── */}
      {/* TRUST LAYER                                      */}
      {/* ──────────────────────────────────────────────── */}

      <section id="zk-identity" className="scroll-mt-24 mb-16">
        <p className="text-micro mb-3">§ 07 — Trust Layer</p>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="font-serif text-3xl text-text-primary">ZK Identity</h2>
          <div className="flex items-center gap-1.5 border border-amber/25 bg-[#0c0b09] px-3 py-1">
            <img src="/demos-logo.svg" alt="Demos" className="h-4 w-4" />
            <span className="text-xs font-mono text-text-secondary">Demos Network</span>
          </div>
        </div>
        <p className="text-[#a39b8c] text-sm leading-relaxed mb-4">
          Ambr uses zero-knowledge proof identity verification via Groth16/BN128 zk-SNARKs powered by
          the DemosSDK. Counterparties prove attributes about themselves — jurisdiction, accreditation,
          age, or KYC status — without revealing the underlying data. The verifier receives a
          cryptographic proof, not raw personal information.
        </p>
        <p className="text-[#a39b8c] text-sm leading-relaxed mb-4">
          Proofs are verified server-side using the identity_with_merkle circuit. Each proof generates
          a unique nullifier that prevents replay attacks. Identity attestations are stored alongside
          the contract signature in the immutable record.
        </p>
        <p className="text-[#a39b8c] text-sm leading-relaxed mb-4">
          Enable ZK identity verification on any contract by setting <code className="font-mono text-amber/70 text-xs">require_zk_identity: true</code> in
          the contract creation parameters. When enabled, signers must complete identity verification
          before their signature is accepted.
        </p>
        <div className="border border-amber/20 bg-[#0c0b09] p-4">
          <p className="text-micro mb-2">Usage</p>
          <pre className="text-xs font-mono text-text-secondary overflow-x-auto">
{`POST /api/v1/contracts
{
  "template": "d1-general-auth",
  "require_zk_identity": true,
  "parameters": { ... },
  "principal_declaration": { ... }
}`}
          </pre>
        </div>
      </section>

    </main>
  );
}
