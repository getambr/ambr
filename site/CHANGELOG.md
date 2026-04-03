# Changelog

## v0.1.0 (2026-04-03)

Initial public release.

### Features
- 6 Ricardian contract templates (delegation + commerce)
- Dual-format contracts: human-readable legal text + machine-parsable JSON
- SHA-256 hash binding both formats
- cNFT minting on Base L2 with counterparty-gated transfers
- x402 HTTP-native per-contract payments (USDC, EURC)
- Wallet signing (ECDSA) with two-signature activation
- Handshake negotiation protocol (accept/reject/request changes)
- Contract revocation with cascade chain support
- ZK identity verification via Demos Network (Groth16/BN128)
- EU AI Act Article 14 human oversight compliance
- Principal approval workflows for threshold-gated transactions
- Share tokens for counterparty reader access
- Dashboard with contract pipeline, analytics, calendar, email triage
- A2A agent discovery + MCP server integration
- 4 subscription tiers: Developer (free), Startup ($49), Scale ($199), Enterprise (custom)

### Identity
- Wallet adapter (ECDSA, live)
- Demos ZK identity adapter (integration ready)
- Evrotrust QES adapter (Q3 2026)

### Infrastructure
- Next.js 16 + TypeScript + Tailwind CSS
- Supabase with Row Level Security
- Vercel deployment
- Base L2 (Ethers.js v6)
