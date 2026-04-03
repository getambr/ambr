export default function DocsPage() {
  return (
    <main className="pt-28 pb-[60vh] px-4 lg:px-6">

      {/* ──────────────────────────────────────────────── */}
      {/* GETTING STARTED                                  */}
      {/* ──────────────────────────────────────────────── */}

      <section id="what-is-ambr" className="scroll-mt-24 mb-16">
        <p className="text-micro mb-3">Getting Started</p>
        <h2 className="font-serif text-3xl text-text-primary mb-4">What is Ambr</h2>
        <p className="text-[#999] text-sm leading-relaxed">
          Ambr is Ricardian legal infrastructure for AI agents. It lets autonomous software
          create, negotiate, sign, and verify legally-binding contracts through a single API
          -- no human bottleneck, no PDF workflows.
        </p>
      </section>

      <section id="get-api-key" className="scroll-mt-24 mb-16">
        <h3 className="font-serif text-xl text-text-primary mb-4">Get a Free Developer Key</h3>
        <p className="text-[#999] text-sm leading-relaxed mb-4">
          Go to{' '}
          <a
            href="https://getamber.dev/activate"
            className="text-amber underline underline-offset-4"
          >
            getamber.dev/activate
          </a>
          , enter your email, and receive an API key instantly. The free developer tier
          includes 25 contracts per month with no payment required.
        </p>
      </section>

      <section id="first-contract" className="scroll-mt-24 mb-16">
        <h3 className="font-serif text-xl text-text-primary mb-4">Your First Contract</h3>
        <p className="text-[#999] text-sm leading-relaxed mb-4">
          Create a delegation contract with a single POST request:
        </p>
        <pre className="bg-[#111] border border-amber/20 rounded-none p-4 font-mono text-sm text-text-secondary overflow-x-auto">
{`curl -X POST https://getamber.dev/api/v1/contracts \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_KEY" \\
  -d '{
    "template_slug": "delegation-d1",
    "parameters": {
      "principal_name": "Acme Corp",
      "agent_name": "ProcureBot AI",
      "scope": "procurement up to $10,000",
      "duration": "90 days"
    }
  }'`}
        </pre>
        <p className="text-[#999] text-sm leading-relaxed mt-4">
          The response includes the contract object with a SHA-256 content hash,
          a reader URL for the counterparty, and a sign URL for wallet-based execution.
        </p>
      </section>

      <div className="h-px bg-gradient-to-r from-transparent via-amber/20 to-transparent my-16" />

      {/* ──────────────────────────────────────────────── */}
      {/* CONTRACT LIFECYCLE                               */}
      {/* ──────────────────────────────────────────────── */}

      <section id="create" className="scroll-mt-24 mb-16">
        <p className="text-micro mb-3">Contract Lifecycle</p>
        <h2 className="font-serif text-3xl text-text-primary mb-4">Create</h2>
        <p className="text-[#999] text-sm leading-relaxed mb-4">
          <code className="font-mono text-amber/80">POST /api/v1/contracts</code> creates a new
          Ricardian contract from a template. The response includes the contract body, a SHA-256
          content hash, a reader URL (with embedded share token), and a sign URL.
        </p>
        <pre className="bg-[#111] border border-amber/20 rounded-none p-4 font-mono text-sm text-text-secondary overflow-x-auto">
{`{
  "id": "ctr_abc123",
  "hash": "sha256:9f86d08...",
  "status": "draft",
  "reader_url": "https://getamber.dev/reader/ctr_abc123?token=...",
  "sign_url": "https://getamber.dev/reader/ctr_abc123?token=...&sign=true"
}`}
        </pre>
      </section>

      <section id="share" className="scroll-mt-24 mb-16">
        <h3 className="font-serif text-xl text-text-primary mb-4">Share</h3>
        <p className="text-[#999] text-sm leading-relaxed">
          Send the <code className="font-mono text-amber/80">reader_url</code> to the
          counterparty. The URL contains a share token that grants read access to the contract
          without requiring an API key. The counterparty can review the full contract terms
          before proceeding to handshake or signature.
        </p>
      </section>

      <section id="handshake" className="scroll-mt-24 mb-16">
        <h3 className="font-serif text-xl text-text-primary mb-4">Handshake</h3>
        <p className="text-[#999] text-sm leading-relaxed mb-4">
          <code className="font-mono text-amber/80">POST /api/v1/contracts/:id/handshake</code>{' '}
          lets the counterparty accept, reject, or request changes to a contract. The handshake
          also records a visibility preference (public or private).
        </p>
        <pre className="bg-[#111] border border-amber/20 rounded-none p-4 font-mono text-sm text-text-secondary overflow-x-auto">
{`{
  "action": "accept",        // "accept" | "reject" | "request_changes"
  "visibility": "public",    // "public" | "private"
  "wallet_address": "0x..."
}`}
        </pre>
      </section>

      <section id="sign" className="scroll-mt-24 mb-16">
        <h3 className="font-serif text-xl text-text-primary mb-4">Sign</h3>
        <p className="text-[#999] text-sm leading-relaxed mb-4">
          <code className="font-mono text-amber/80">POST /api/v1/contracts/:id/sign</code>{' '}
          submits an ECDSA wallet signature. Contracts require two signatures: the first moves
          the contract to <code className="font-mono text-amber/80">pending</code> status,
          the second activates it and triggers on-chain minting.
        </p>
      </section>

      <section id="verify" className="scroll-mt-24 mb-16">
        <h3 className="font-serif text-xl text-text-primary mb-4">Verify</h3>
        <p className="text-[#999] text-sm leading-relaxed">
          <code className="font-mono text-amber/80">GET /api/v1/contracts/:id</code> returns the
          full contract including its SHA-256 hash. Compare this hash against the on-chain record
          to verify the contract has not been tampered with since signing.
        </p>
      </section>

      <div className="h-px bg-gradient-to-r from-transparent via-amber/20 to-transparent my-16" />

      {/* ──────────────────────────────────────────────── */}
      {/* AGENT INTEGRATION                                */}
      {/* ──────────────────────────────────────────────── */}

      <section id="a2a-discovery" className="scroll-mt-24 mb-16">
        <p className="text-micro mb-3">Agent Integration</p>
        <h2 className="font-serif text-3xl text-text-primary mb-4">A2A Discovery</h2>
        <p className="text-[#999] text-sm leading-relaxed mb-4">
          AI agents discover Ambr through the standard A2A well-known endpoint:
        </p>
        <pre className="bg-[#111] border border-amber/20 rounded-none p-4 font-mono text-sm text-text-secondary overflow-x-auto">
{`GET https://getamber.dev/.well-known/agent.json`}
        </pre>
        <p className="text-[#999] text-sm leading-relaxed mt-4">
          The agent card describes available capabilities, authentication methods, and
          supported interaction protocols.
        </p>
      </section>

      <section id="mcp-server" className="scroll-mt-24 mb-16">
        <h3 className="font-serif text-xl text-text-primary mb-4">MCP Server</h3>
        <p className="text-[#999] text-sm leading-relaxed mb-4">
          Add Ambr as an MCP server in your agent configuration:
        </p>
        <pre className="bg-[#111] border border-amber/20 rounded-none p-4 font-mono text-sm text-text-secondary overflow-x-auto">
{`{
  "mcpServers": {
    "ambr": {
      "url": "https://getamber.dev/api/v1/mcp",
      "headers": { "X-API-Key": "YOUR_KEY" }
    }
  }
}`}
        </pre>
        <p className="text-[#999] text-sm leading-relaxed mt-4">
          The MCP server exposes tools for contract creation, retrieval, handshake, and signing
          -- enabling any MCP-compatible agent to manage contracts natively.
        </p>
      </section>

      <section id="rest-api" className="scroll-mt-24 mb-16">
        <h3 className="font-serif text-xl text-text-primary mb-4">REST API</h3>
        <p className="text-[#999] text-sm leading-relaxed mb-4">
          All endpoints accept and return JSON. Authenticate with the{' '}
          <code className="font-mono text-amber/80">X-API-Key</code> header or a share token
          where noted. Base URL:{' '}
          <code className="font-mono text-amber/80">https://getamber.dev/api/v1</code>
        </p>
      </section>

      <section id="x402-payments" className="scroll-mt-24 mb-16">
        <h3 className="font-serif text-xl text-text-primary mb-4">x402 Pay-per-contract</h3>
        <p className="text-[#999] text-sm leading-relaxed">
          Instead of an API key, agents can pay per contract using the x402 protocol. Include a
          payment header with each request. The server validates the payment proof on-chain before
          processing the contract creation. This enables fully autonomous agent-to-agent commerce
          without pre-registration.
        </p>
      </section>

      <div className="h-px bg-gradient-to-r from-transparent via-amber/20 to-transparent my-16" />

      {/* ──────────────────────────────────────────────── */}
      {/* API REFERENCE                                    */}
      {/* ──────────────────────────────────────────────── */}

      <section id="endpoints" className="scroll-mt-24 mb-16">
        <p className="text-micro mb-3">API Reference</p>
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
                <td className="py-3 pr-4 text-xs">Share token + wallet</td>
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
                <td className="py-3 pr-4 font-mono text-xs">/v1/keys/free</td>
                <td className="py-3 pr-4 text-xs">None</td>
                <td className="py-3 text-xs">Activate API key (developer, startup, scale, enterprise)</td>
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
      </section>

      <div className="h-px bg-gradient-to-r from-transparent via-amber/20 to-transparent my-16" />

      {/* ──────────────────────────────────────────────── */}
      {/* WALLET & IDENTITY                                */}
      {/* ──────────────────────────────────────────────── */}

      <section id="connect-wallet" className="scroll-mt-24 mb-16">
        <p className="text-micro mb-3">Wallet &amp; Identity</p>
        <h2 className="font-serif text-3xl text-text-primary mb-4">Connect Wallet</h2>
        <p className="text-[#999] text-sm leading-relaxed">
          The Ambr dashboard supports dual login: authenticate with your API key or connect a
          wallet directly. Wallet connection links your on-chain identity to your Ambr account,
          enabling signature-based contract execution and cNFT management.
        </p>
      </section>

      <section id="wallet-auth" className="scroll-mt-24 mb-16">
        <h3 className="font-serif text-xl text-text-primary mb-4">Wallet Auth</h3>
        <p className="text-[#999] text-sm leading-relaxed">
          The Reader Portal uses ECDSA signature verification for counterparty authentication.
          When a counterparty visits the reader URL, they sign a challenge message with their
          wallet to prove identity before viewing or signing the contract.
        </p>
      </section>

      <section id="cnft" className="scroll-mt-24 mb-16">
        <h3 className="font-serif text-xl text-text-primary mb-4">Contract NFTs</h3>
        <p className="text-[#999] text-sm leading-relaxed">
          Each fully-signed contract is minted as an ERC-721 cNFT on Base L2. The token stores
          the SHA-256 content hash on-chain, creating an immutable record that the contract
          existed in its exact form at the time of signing. The NFT metadata links back to the
          Ambr reader for the full contract text.
        </p>
      </section>

      <section id="transfers" className="scroll-mt-24 mb-16">
        <h3 className="font-serif text-xl text-text-primary mb-4">Transfers</h3>
        <p className="text-[#999] text-sm leading-relaxed">
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
        <p className="text-micro mb-3">Payment Methods</p>
        <h2 className="font-serif text-3xl text-text-primary mb-4">Pricing</h2>

        <h4 className="font-serif text-lg text-text-primary mb-3 mt-6">x402 Pay-per-Contract (Agent-Native)</h4>
        <p className="text-[#999] text-sm leading-relaxed mb-4">
          No account needed. Agents pay per contract directly with crypto on Base L2. Include the transaction hash in the <code className="font-mono text-amber/80">X-Payment</code> header.
        </p>
        <div className="overflow-x-auto mb-6">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-amber/30">
                <th className="text-left py-2 pr-4 font-mono text-[0.7rem] uppercase tracking-wider text-amber/70">Contract Type</th>
                <th className="text-left py-2 pr-4 font-mono text-[0.7rem] uppercase tracking-wider text-amber/70">Price</th>
                <th className="text-left py-2 font-mono text-[0.7rem] uppercase tracking-wider text-amber/70">Use Case</th>
              </tr>
            </thead>
            <tbody className="text-text-secondary">
              <tr className="border-b border-border"><td className="py-2 pr-4 font-mono text-xs">Delegation (d-series)</td><td className="py-2 pr-4 font-mono text-xs text-amber">$0.50</td><td className="py-2 text-xs">Agent authority setup</td></tr>
              <tr className="border-b border-border"><td className="py-2 pr-4 font-mono text-xs">Commerce (c-series)</td><td className="py-2 pr-4 font-mono text-xs text-amber">$1.00</td><td className="py-2 text-xs">Agent transactions</td></tr>
              <tr className="border-b border-border"><td className="py-2 pr-4 font-mono text-xs">Fleet Auth (d3)</td><td className="py-2 pr-4 font-mono text-xs text-amber">$2.50</td><td className="py-2 text-xs">Multi-agent orchestration</td></tr>
              <tr className="border-b border-border"><td className="py-2 pr-4 font-mono text-xs">cNFT Minting</td><td className="py-2 pr-4 font-mono text-xs text-amber">$0.25</td><td className="py-2 text-xs">On-chain record (Base L2)</td></tr>
              <tr className="border-b border-border"><td className="py-2 pr-4 font-mono text-xs">Handshake / Sign / Verify</td><td className="py-2 pr-4 font-mono text-xs text-success">Free</td><td className="py-2 text-xs">Lifecycle actions never charged</td></tr>
              <tr className="border-b border-border"><td className="py-2 pr-4 font-mono text-xs">Reader Access</td><td className="py-2 pr-4 font-mono text-xs text-success">Free</td><td className="py-2 text-xs">Counterparties always free</td></tr>
            </tbody>
          </table>
        </div>

        <h4 className="font-serif text-lg text-text-primary mb-3 mt-8">API Key Tiers (Predictable Billing)</h4>
        <p className="text-[#999] text-sm leading-relaxed mb-4">
          For teams that prefer monthly billing with included contract limits. Visit{' '}
          <a href="https://getamber.dev/activate" className="text-amber underline underline-offset-4">getamber.dev/activate</a>{' '}
          to get started.
        </p>
        <div className="overflow-x-auto mb-4">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-amber/30">
                <th className="text-left py-2 pr-4 font-mono text-[0.7rem] uppercase tracking-wider text-amber/70">Tier</th>
                <th className="text-left py-2 pr-4 font-mono text-[0.7rem] uppercase tracking-wider text-amber/70">Monthly</th>
                <th className="text-left py-2 pr-4 font-mono text-[0.7rem] uppercase tracking-wider text-amber/70">Contracts/mo</th>
                <th className="text-left py-2 font-mono text-[0.7rem] uppercase tracking-wider text-amber/70">Overage</th>
              </tr>
            </thead>
            <tbody className="text-text-secondary">
              <tr className="border-b border-border"><td className="py-2 pr-4 font-mono text-xs">Developer</td><td className="py-2 pr-4 font-mono text-xs text-success">Free</td><td className="py-2 pr-4 text-xs">25</td><td className="py-2 text-xs">N/A</td></tr>
              <tr className="border-b border-border"><td className="py-2 pr-4 font-mono text-xs">Startup</td><td className="py-2 pr-4 font-mono text-xs text-amber">$49</td><td className="py-2 pr-4 text-xs">200</td><td className="py-2 text-xs">$0.35/ea</td></tr>
              <tr className="border-b border-border"><td className="py-2 pr-4 font-mono text-xs">Scale</td><td className="py-2 pr-4 font-mono text-xs text-amber">$199</td><td className="py-2 pr-4 text-xs">1,000</td><td className="py-2 text-xs">$0.25/ea</td></tr>
              <tr className="border-b border-border"><td className="py-2 pr-4 font-mono text-xs">Enterprise</td><td className="py-2 pr-4 font-mono text-xs text-amber">Custom</td><td className="py-2 pr-4 text-xs">Unlimited</td><td className="py-2 text-xs">Custom SLA</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="crypto" className="scroll-mt-24 mb-16">
        <h3 className="font-serif text-xl text-text-primary mb-4">Crypto</h3>
        <p className="text-[#999] text-sm leading-relaxed mb-4">
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
        <p className="text-[#999] text-sm leading-relaxed">
          Stripe checkout for card payments is available for Startup, Scale, and Enterprise tiers.
          Use the developer tier or x402 crypto payments to get started without a card.
        </p>
      </section>

      <div className="h-px bg-gradient-to-r from-transparent via-amber/20 to-transparent my-16" />

      {/* ──────────────────────────────────────────────── */}
      {/* TRUST LAYER                                      */}
      {/* ──────────────────────────────────────────────── */}

      <section id="zk-identity" className="scroll-mt-24 mb-16">
        <p className="text-micro mb-3">Trust Layer</p>
        <h2 className="font-serif text-3xl text-text-primary mb-4">ZK Identity <span className="font-mono text-sm text-amber/50 ml-2">coming soon</span></h2>
        <p className="text-[#999] text-sm leading-relaxed mb-4">
          Ambr is integrating zero-knowledge proof identity verification via Groth16/BN128 zk-SNARKs.
          Counterparties will be able to prove attributes about themselves — jurisdiction, accreditation,
          age, or KYC status — without revealing the underlying data. The verifier receives a
          cryptographic proof, not raw personal information.
        </p>
        <p className="text-[#999] text-sm leading-relaxed mb-4">
          Proofs are verified on-chain via a Merkle root oracle bridge to Base L2, making identity
          attestations part of the immutable contract record alongside the cNFT and SHA-256 hash.
          No personal data touches the chain.
        </p>
        <p className="text-[#999] text-sm leading-relaxed">
          This replaces ERC-8004 in the Ambr trust layer. Integration is in development and will be
          available as an optional contract parameter — <code className="font-mono text-amber/70 text-xs">require_zk_identity: true</code> — on
          supported templates.
        </p>
      </section>

    </main>
  );
}
