# Changelog

All notable changes to Ambr are documented here. This file follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [SemVer](https://semver.org/).

## [0.3.4] — 2026-04-23

### Added
- **Legibility Principle** as a canonical governance assertion across the discovery surface — MCP tool descriptions, A2A agent card extensions, and `llms.txt` all now carry the clause that agents whose actions are not simultaneously legible to humans and machines are a systemic liability.
- **Public spec page `/spec/ricardian-v1`** — documents the Ambr dual-format Ricardian contract shape (URN `urn:ambr:ricardian-v1`, MIT-licensed). First public standardization seed; gives third parties a stable URL to federate against.
- **Extended A2A agent card** (`/.well-known/agent.json`): `platformVersion`, `releasedAt`, `apiVersion`, `additionalInterfaces` (MCP + `/api/health`), `pricing.source` pointing at `/api/v1/pricing`, `compliesWith: ['urn:ambr:ricardian-v1']`, `implementsSpec` link, and `extensions['io.ambr.governance']` holding the principle text.
- **`src/lib/governance/principle.ts`** — shared source of truth for `LEGIBILITY_CLAUSE`, `LEGIBILITY_PRINCIPLE`, `RICARDIAN_URN`, `GOVERNANCE_NAMESPACE`. Prevents drift between the three surfaces that reference the principle.
- **`server.json`** — static MCP discovery config alongside the `agent.json` card.

### Changed
- **`public/llms.txt`**: new "Legibility Principle" section after the tagline; Key Pages expanded with MCP, health, spec, and founder links; free-tier and pricing references aligned with the live `/api/v1/pricing` source of truth.
- **Every MCP tool description** (`ambr_list_templates`, `ambr_create_contract`, `ambr_get_contract`, `ambr_get_contract_status`, `ambr_verify_hash`, `agent_handshake`) appends the legibility clause so `tools/list` responses carry the principle alongside the schema.

---

## [0.3.3] — 2026-04-23

### Added
- **Public `/status` page** on ambr.run — per-service status dots (7 services), cNFT contract card linking to BaseScan, 30s auto-refresh. No auth required.
- **`contracts/deployments/base.json`** — live AmbrContractNFT address, deployment tx, block, and deployer captured in git.
- **Hardhat `verify:base` / `verify:base-sepolia` scripts** + `etherscan` block and `customChains` for Base mainnet (8453) and Base Sepolia (84532). BaseScan verification is now one command given a `BASESCAN_API_KEY`.

### Changed
- **`/api/health` public response** now returns per-service status strings and a `cnft` block with BaseScan URL. `Access-Control-Allow-Origin: *` added on the public branch so the marketing domain can fetch the platform domain's health endpoint. Admin response unchanged.
- **Footer `SYS.STATUS`** is now a live `<Link>` to `/status` (was a static string).
- **Contract-generation prompts** (`src/lib/llm/prompts.ts`): EU recital reframed around eIDAS Art. 26 Advanced Electronic Signature criteria, with Principal Declaration attributing the wallet signature to the natural/legal person under Art. 3(9). Liability sections reference UCTA s. 11 reasonableness test rather than asserting "UCTA-compliant." GDPR language reframed around Art. 5 principles.
- **Public copy** in `docs/page.tsx`, `templates/seed-data.ts`, and `contract-sample.ts` — replaced "compliant with" / "legally-binding" / "ADP-compliant" wording with reference-style framing.
- **A2C backend pricing** (`src/lib/a2a/handler.ts`) aligned to `$0.20` across a1/a2/a3 slugs, matching marketing, x402 middleware, and docs. Dashboard developer-tier display aligned to `25/mo`.
- **`brand.ts`** social handles aligned to `@ambr_run`, correct GitHub repo URL, and real Discord invite code.
- **`package.json` bumped to `0.3.3`** to match `/api/health` version string (was 0.3.0 while endpoint reported 0.3.2).

### Fixed
- **`.env.example`** — documents all previously-undocumented secrets: `BASESCAN_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `ADMIN_SECRET`, `OPS_BASE`, `OPS_KEY`. Fresh clones no longer fail health checks silently.

---

## [0.3.0] — 2026-04-20

### Added
- **MCP x402 payment wiring** — AI agents calling paid tools without an API key now receive HTTP 402 with machine-readable x402 payment instructions (USDC on Base L2). Previously returned dead-end JSON-RPC errors. ([f15e7f9](https://github.com/getambr/ambr/commit/f15e7f9))
- **Dashboard billing panel** — Buy More Credits card + Payment History section in the Account tab. Topup mode adds credits to the current key instead of creating a new one. (Session 2026-04-13)
- **Stripe live integration** — Live keys deployed to Vercel production. Statement descriptor override to `AMBR.RUN` so customers see the product name instead of "OMRA CORP" on their card statements. Webhook endpoint and signing secret configured. (Session 2026-04-13)
- **Bruno Krisjanis CBO onboarding** — Added `brunokrisjanis99@gmail.com` to `ADMIN_EMAILS`, `team_members` table row with `bruno@ambr.run` alias, role='admin'. (Session 2026-04-13)
- **Founder Program** — `/founders` marketing page with enrollment form. `founder_partners` DB table with RLS, 10-spot cap, admin approval workflow. `POST /api/v1/founders/enroll` endpoint. ([aced7b2](https://github.com/getambr/ambr/commit/aced7b2))
- **`GET /api/v1/pricing`** — Single source of truth for pricing across all surfaces. Pulled from DB `templates.price_cents`, cached 1h at edge. ([e7ff09c](https://github.com/getambr/ambr/commit/e7ff09c))
- **Disposable email blocklist** — Free tier signup now rejects known disposable email providers (mailinator, guerrillamail, 10minutemail, etc. — 30+ domains). Audit-logged. ([aced7b2](https://github.com/getambr/ambr/commit/aced7b2))
- **Sensitive flag on Vercel env vars** — All 8 production secrets (Supabase service role, Stripe, Anthropic, cNFT minter, Resend, Ops, Admin) now marked as `--sensitive` to harden against future exposure classes. (Session 2026-04-20)
- **`/api/health` endpoint** — Public lightweight ping with detail view for admins. Checks Supabase, Base RPC, Anthropic, Ops Agent. Used by paperclip team for monitoring.

### Changed
- **Pricing realignment** based on [Ambr Financial Model v34](docs/internal/Ambr_Financial_Model_v34.xlsx):
  - Consumer (A2C, a1/a2/a3): **$0.30 → $0.20** per contract
  - Delegation (A2A): $0.50 (unchanged)
  - Commerce (B2A): $1.00 (unchanged)
  - Fleet: $2.50 (unchanged)
- **Free developer tier: 5 → 25 contracts/month** for new signups.
- **Marketing homepage PricingSection**: 3 tiers → 4 tiers (added Consumer A2C row), dropped "theoretical pricing" disclaimer, linked to `/api/v1/pricing`.
- **Docs pricing table**: added Consumer tier, clarified A2A/B2A labels, removed stale cNFT minting $0.25 line (gas absorbed into contract price).
- **ADMIN_SECRET rotated** to a fresh 64-char hex as part of Vercel security incident response.
- **Dashboard refactor for topup mode**: `/api/v1/stripe/checkout` accepts `mode: 'topup'`; webhook adds credits to existing key instead of creating a new one when mode is topup. ([earlier session])

### Fixed
- **Vercel env var corruption** — Long JWT-style values were corrupted during the "--sensitive flag" rotation (stdin pipe issue). Restored via `--value` flag. (Session 2026-04-20)
- **`SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY`** restored after accidental wipe during rotation. Dashboard login and AI contract generation back to healthy.
- **`/api/health` version string** bumped from stale `0.2.0` to `0.3.0`. ([f0719dd](https://github.com/getambr/ambr/commit/f0719dd))

### Security
- Vercel April 2026 security incident response: all critical env vars marked sensitive. See [`docs/internal/PAPERCLIP-TEAM-ONBOARDING.md`](docs/internal/PAPERCLIP-TEAM-ONBOARDING.md) for post-incident verification checklist.
- On-chain audit verified: **no unauthorized cNFT mints** during incident window. Only 2 legitimate mints ever (amb-2026-0013 tokens #1 and #2). See [incident plan](https://github.com/getambr/ambr/blob/master/plans/async-dancing-whale.md) for full analysis.

### Pre-existing but worth calling out (delivered v0.2.x → v0.3.0)
- Privy consumer signing adapter (PR #9)
- p1-nda non-disclosure template (PR #10)
- a2-ai-subscription, a3-warranty-liability templates
- Visibility flag enforcement (`visibility`: private/metadata_only/public/encrypted)
- Security hardening: RLS on `contracts.SELECT`, ECDSA required for wallet contract lookup, admin auth on debug endpoints
- MCP discovery endpoint caching (90%+ cache hit rate, saves massive function invocations)

---

## [0.2.0] — 2026-04-10

### Added
- **Bilateral amendments** — Two-party approval flow for contract amendments. Proposal → counterparty accepts/rejects → new version with new hash.
- **Paired cNFTs** — Active contracts mint 2 NFTs on Base L2 (one per party) instead of 1 shared token.
- **EU AI Act Article 14 oversight** — `oversight_threshold_usd` field on parent delegation contracts; child contracts exceeding threshold require principal approval.
- **Security hardening** — MCP discovery caching, debug endpoint admin auth, rate limiter, compliance language review, merged SecretTrees work.

See [project_ambr_v020_session.md](~/.claude/projects/memory/project_ambr_v020_session.md) for full v0.2.0 details.

---

## [0.1.0] — 2026-03-23

### Added
- Initial public release.
- Core Ricardian contract engine (human-readable + machine-readable, SHA-256 hash).
- 6 contract templates (delegation, commerce, consumer categories).
- Reader Portal at `/reader/[hash]`.
- REST API for contract CRUD.
- A2A well-known endpoint + agent card discovery.
- MCP server (6 tools, JSON-RPC over Streamable HTTP).
- x402 payment middleware for REST endpoints (USDC on Base L2).
- API key developer + paid tiers.
- cNFT minting on Base L2.
