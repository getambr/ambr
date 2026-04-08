# Changelog

## v0.2.0 (2026-04-08)

Bilateral contract governance: both parties now have on-chain proof of participation, and contract changes require mutual consent instead of unilateral edits.

### Paired cNFT minting
- Every active bilateral contract mints TWO tokens on Base L2 — one per party
- Smart contract enforces bilateral consent on every transfer via `approveTransfer()`
- New `nft_counterparty_token_id` / `nft_counterparty_tx_hash` columns on `contracts`
- Dashboard WalletSection shows PAIRED badge + token IDs for paired contracts
- Dashboard WalletSection shows NOVATED badge when the connected wallet is a current holder via bilateral transfer, not the original signer

### Bilateral amendment workflow (Phase 2)
- New `amendment_proposals` table — pending/approved/rejected/expired/escalated lifecycle
- `POST /api/v1/contracts/[id]/amend` creates a PENDING proposal instead of unilaterally generating the amendment. Counterparty must explicitly approve.
- `POST /api/v1/contracts/[id]/amendments/[proposalId]/approve` — counterparty approval. Awaits Kimi generation + paired cNFT mint synchronously (no fire-and-forget on Vercel serverless).
- `POST /api/v1/contracts/[id]/amendments/[proposalId]/reject` — counterparty rejection with optional reason. Original contract stays active.
- `GET /api/v1/contracts/[id]/amendments` — public list of all proposals for audit trail
- Dashboard ContractDetail renders Pending Amendments card with Approve / Reject buttons
- Amendment contracts get synthetic signature rows (`signature_level: 'simple'`) so the cNFT minter can enumerate parties without going through `/sign`

### Amendment visibility changes
- Optional `visibility` field in the `/amend` request body — proposer can request `private` / `metadata_only` / `public` / `encrypted`
- New `amendment_proposals.proposed_visibility` column
- `/approve` route honors the proposer's requested visibility if set
- Dashboard proposal card renders "Visibility → public" chip + orange warning on public-to-private (cached copies cannot be recalled)
- Reader portal amendment timeline shows "Requested visibility change → PUBLIC"

### Novation support
- New `src/lib/chain/cnft-holders.ts` helper queries live `ownerOf()` on Base mainnet for paired tokens with a signatures-table fallback for legacy contracts
- `/amend` + `/reject` routes use live chain ownership as the source of truth for "who is a party" instead of the signatures snapshot
- A wallet that received a cNFT via `approveTransfer()` is now a recognized amender/rejecter even though the signatures table still shows the original signer
- New errors: `proposer_not_party`, `rejecter_not_party` (both 403) + `proposer_cannot_reject` (proposer must let their own proposal expire)

### EU AI Act Article 14 enforcement on amendments
- `/approve` route checks the spending delta of the proposed amendment against `original.oversight_threshold_usd`
- If the change exceeds the threshold AND the caller is a delegated agent (not the principal), proposal moves to `status='escalated'` and returns 403 `human_approval_required`
- Audit log entry `eu_ai_act_art14_escalation` with spending_change + threshold
- Dashboard escalated proposals render an orange Art 14 banner

### Reader portal (Phase 6)
- `/reader/[hashOrId]` now fetches amendment_proposals and renders a public timeline below the contract
- Shows proposer → counterparty wallets, status badge, diff_summary, timestamps, rejection reason, Art 14 escalation note
- Approved proposals link to the resulting amendment contract by `contract_id`
- Visible to all viewers — proposal metadata is public audit trail regardless of whether proposal text is gated

### Dashboard + UX
- Email triage action hub: inline reply-with-Ambr + compose new email + per-alias Resend sending from @ambr.run aliases with proper signatures
- EIP-6963 multi-wallet discovery with picker fallback (SafePal, Rabby, Rainbow, Coinbase Wallet, Brave, MetaMask all supported)
- Connected NFT wallet persists across section navigation via localStorage
- Ops backend proxied through `/api/ops/[action]` with server-side API key injection (no more OPS_KEY in public bundle)
- Homepage repositioned as "permission layer for AI agents"
- Starter / Scale renamed to "packs" with one-time pricing (credits never expire)
- /terms Section 6 expanded with card/USD payment, refund process, chargebacks

### Fixes
- Pre-existing `signatures.created_at` bug — the column is actually `signed_at`. Four files fixed: cnft-mint, amend route, reader page, wallet-auth route.
- Amendment contracts missing signature rows — fixed by synthesizing rows at approve time with `signature_level: 'simple'` (eIDAS nomenclature, matches existing CHECK constraint)
- Vercel killed fire-and-forget cNFT mint — approval now awaits mint synchronously (~10-15s response time but caller gets real token IDs)
- Same-day migration files renamed to unique YYYYMMDDHHMMSS timestamps
- `/activate` db error code surfaced on key insert failure

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
