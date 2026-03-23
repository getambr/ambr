# Ambr

**The Agreement Layer for the AI Agent Economy**

AI agents can already pay each other (x402) and prove reputation (ERC-8004). What they can't do is enter into binding agreements that humans can read, audit, and enforce. Ambr fills that gap.

Ambr is infrastructure for deploying, signing, and managing Ricardian Contracts — agreements that are simultaneously human-readable legal documents and machine-parsable data structures. Every contract is hashed (SHA-256), minted as a cNFT on Base L2, and verifiable through a public reader portal.

---

## How It Works

**Wallet-as-identity.** No profiles, no onboarding forms. Agents and users are identified by their cryptographic wallet address.

**Dual-format contracts.** Each agreement exists as both a legal document (readable by lawyers and regulators) and a structured JSON payload (readable by agents and APIs). The SHA-256 hash binds the two representations together.

**Handshake protocol.** Before signing, both parties review the contract via the Reader Portal, negotiate visibility preferences (private, metadata-only, public, or encrypted), and accept or request changes. Signing is blocked until both parties agree.

**Contract NFTs (cNFTs).** Each signed agreement is minted as a single ERC-721 NFT on Base L2. The token stores the SHA-256 hash permanently on-chain. Transfers require counterparty approval — preventing unilateral ownership changes.

**Multi-token payments.** Contract creation is paid via x402 on Base L2, accepting USDC, USDbC, DAI, ETH, WETH, cbETH, and cbBTC. Volatile assets are priced via Chainlink oracles.

**A2A discovery.** Agents discover Ambr via the Agent-to-Agent protocol at `getamber.dev/.well-known/agent.json`. JSON-RPC endpoint at `getamber.dev/api/a2a`.

---

## Architecture

```
Agent or user connects wallet (ECDSA)
        |
        v
Contract Engine (SHA-256 hash, dual-format generation)
        |
        v
Reader Portal (review, handshake, visibility negotiation)
        |
        v
Mutual signing (both parties)
        |
        v
cNFT minted on Base L2 (hash on-chain, counterparty-gated)
        |
        v
API key issued, mapped to wallet
```

**Stack:** Next.js (App Router), TypeScript, Supabase (Postgres + RLS), Ethers.js v6, Base L2, Tailwind CSS

**Deployed cNFT contract:** [`0x20cEE8DdeB9b700dA6f9E00cD6A430Fb351DB250`](https://basescan.org/address/0x20cEE8DdeB9b700dA6f9E00cD6A430Fb351DB250) (Base mainnet)

---

## Contract Templates

Pre-vetted Ricardian contract templates covering common agent-to-agent and agent-to-human scenarios:

**Delegation (D-series)**
- General Authorization — broad operational permissions
- Limited Service — scoped task delegation with constraints
- Fleet Authorization — multi-agent orchestration rights

**Commerce (C-series)**
- API Access — usage-based service agreements
- Compute SLA — performance guarantees with escrow
- Task Execution — deliverable-based contracts with milestones

Templates are informed by legal research across EU (eIDAS, GDPR), US (UETA, E-SIGN), UK, and Singapore jurisdictions.

---

## Open Source

The Reader Portal and contract template schemas are released under the MIT License:

- **[Reader Portal](open-source/reader-portal/)** — contract viewer with human/machine toggle, SHA-256 hash verification, and export (JSON, Markdown, text)
- **[Contract Schemas](open-source/contract-schemas/)** — JSON Schema definitions for D-series and C-series templates

The platform (dashboard, contract engine, API, payment infrastructure) is proprietary.

---

## Links

- **Marketing:** [ambr.run](https://ambr.run)
- **Platform:** [getamber.dev](https://getamber.dev)
- **A2A Agent Card:** [getamber.dev/.well-known/agent.json](https://getamber.dev/.well-known/agent.json)
- **Contact:** hello@ambr.run

---

## License

Open-source components (`open-source/`) are licensed under [MIT](open-source/reader-portal/LICENSE).
All other code is proprietary. See [LICENSE](LICENSE) for details.

---

Development Partner: OMRA Corp.
