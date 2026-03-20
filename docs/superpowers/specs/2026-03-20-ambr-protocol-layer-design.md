# Ambr Protocol Layer — Architecture Design Spec

**Date:** 2026-03-20
**Status:** Draft
**Authors:** Ilvers Sermols (CTO)

---

## 1. Context & Motivation

Ambr is a legal framework for AI agents — create, sign, and verify Ricardian Contracts. The platform is live at `getamber.dev` (platform) and `ambr.run` (marketing) with A2A and MCP protocols working.

**Current state:**
- API-key-only auth (no user accounts, no login)
- Manual USDC-on-Base payment (user sends tx, copies hash, activates API key)
- ECDSA wallet signing for contracts
- Supabase as sole storage backend
- 6 contract templates (3 delegation, 3 commerce)
- A2A + MCP endpoints live and spec-compliant

**Problem:** The current architecture is functional but closed. An AI agent discovering Ambr via A2A has no way to autonomously pay and create a contract — it needs a human to manually activate an API key first. There's no identity enrichment beyond bare wallet addresses, no pluggable storage for blockchain partnerships, and no presence in agent discovery networks.

**Goal:** Transform Ambr from a monolithic API-key service into a **protocol-level infrastructure** for agentic commerce, where:
- Agents pay per-contract via x402 with zero setup
- Businesses manage agents via API keys with dashboards
- Identity is enriched via Demos CCI (optional, not required)
- Storage is pluggable (Supabase default, IPFS/Demos/chain as options)
- Contracts can be public, private, or end-to-end encrypted (client's choice)
- Reputation scoring builds trust between parties
- SuperColony listing makes Ambr discoverable in the Demos agent ecosystem

---

## 2. Architecture Overview

```
                    ┌─────────────────────────────────┐
                    │        Discovery Layer           │
                    │  A2A  │  MCP  │  SuperColony     │
                    └──────────────┬──────────────────┘
                                   │
                    ┌──────────────▼──────────────────┐
                    │        Gateway / API             │
                    │  x402 negotiation │ rate limits  │
                    │  auth routing (x402 OR API key)  │
                    └──────────────┬──────────────────┘
                                   │
              ┌────────────┬───────▼───────┬────────────┐
              │            │               │            │
     ┌────────▼───┐ ┌──────▼─────┐ ┌──────▼─────┐ ┌───▼────────┐
     │  Payment   │ │  Identity  │ │  Contract  │ │  Storage   │
     │  Adapter   │ │  Adapter   │ │  Engine    │ │  Adapter   │
     │            │ │            │ │ (existing) │ │            │
     │ • x402     │ │ • Wallet   │ │ • LLM gen  │ │ • Supabase │
     │ • USDC     │ │ • Demos    │ │ • Hashing  │ │ • IPFS     │
     │   direct   │ │   CCI      │ │ • Signing  │ │ • Demos    │
     │ • Stripe * │ │ • Future   │ │ • Status   │ │   DAHR     │
     │ • Polar  * │ │            │ │ • Amend    │ │ • Base L2  │
     └────────────┘ └────────────┘ └────────────┘ └────────────┘
                                                   * = future
```

### Adapter Pattern

Each adapter implements a typed interface. The contract engine calls adapters through the interface, never directly. Adding a new backend means implementing the interface — zero changes to the engine.

### What Changes vs. What Stays

**Unchanged:**
- Contract engine (LLM generation, SHA-256 hashing, ECDSA signing, status machine)
- All 6 contract templates and their schemas
- A2A agent card and MCP server tools
- Reader Portal, Dashboard UI
- Supabase database schema (additive changes only)

**New:**
- x402 payment middleware
- Demos CCI identity enrichment
- Pluggable storage adapter layer
- Client-controlled visibility and encryption
- Reputation scoring system
- SuperColony agent registration

---

## 3. Payment Layer

### 3.1 x402 Payment Protocol

x402 (HTTP 402 Payment Required) enables agents to pay per-request without pre-registration.

**Flow:**

```
Agent → POST /api/v1/contracts { template, parameters, principal_declaration }
  (no API key, no x402 payment header)

← 402 Payment Required
  {
    "x402": {
      "version": "2",
      "price": "3000000",           // 3.00 USDC (6 decimals)
      "currency": "USDC",
      "chain": "base",
      "recipient": "0x963D26FEead94424A14394Ce56da62ea88F12B7B",
      "description": "Create Ricardian Contract (c1-api-access)",
      "accepts": ["exact", "overpay"]
    }
  }

Agent → same request + X-PAYMENT header (x402 payment proof)

← 200 OK { contract_id, sha256_hash, human_readable, machine_readable }
```

**Pricing:** Per-template, already defined in template schemas:
| Template | Price |
|----------|-------|
| D1 General Auth | $2.00 |
| D2 Limited Service | $1.50 |
| D3 Fleet Auth | $5.00 |
| C1 API Access | $3.00 |
| C2 Compute SLA | $4.00 |
| C3 Task Execution | $3.50 |

**Implementation:**
- New middleware: `src/lib/x402/middleware.ts` — intercepts requests, checks for API key OR x402 payment
- Payment verification: Extend existing `src/lib/chain/verify-payment.ts` to handle x402 payment proofs
- Uses Nevermined or Coinbase x402 SDK for payment proof parsing/verification
- Recipient wallet: `NEXT_PUBLIC_WALLET_ADDRESS` (same as current)

### 3.2 Dual Auth Path

```
Request arrives at /api/v1/contracts
  ├─ Has valid API key? → Use API key auth (existing flow, deduct credits)
  ├─ Has x402 payment proof? → Verify payment, process request
  └─ Neither? → Return 402 with pricing info
```

API key holders still get credit-based access. x402 is for agents that prefer pay-per-use. Both paths lead to the same contract engine.

### 3.3 x402 in Generated Contracts

The C1 (API Access Agreement) template already has `x402_enabled` parameter. Contracts generated with this parameter include x402 payment clauses, enabling the contracting parties to use x402 between themselves. Ambr both accepts x402 AND generates x402-aware contracts.

### 3.4 Future Payment Adapters

The payment adapter interface:

```typescript
interface PaymentAdapter {
  name: string;
  verify(request: Request): Promise<PaymentResult | null>;
  generatePaymentRequest(amount: bigint, metadata: PaymentMeta): PaymentChallenge;
}

type PaymentResult = {
  valid: boolean;
  amount: bigint;
  currency: string;
  payer_wallet: string;
  tx_hash?: string;
  method: 'x402' | 'usdc_direct' | 'stripe' | 'polar';
};
```

Stripe and Polar.sh adapters can be added later without touching the core payment routing logic.

---

## 4. Identity Layer

### 4.1 Current: Wallet-Only (Unchanged)

```
POST /api/v1/contracts/[id]/sign
{ wallet_address, signature, message }
→ ECDSA verified via ethers.js
→ Stored in signatures table
```

This remains the base case. A valid ECDSA signature is sufficient.

### 4.2 New: Demos CCI Enrichment (Optional)

When a signer provides a Demos identity token alongside their signature:

```
POST /api/v1/contracts/[id]/sign
{ wallet_address, signature, message,
  demos_identity: { token: "bearer_xxx" } }   // optional field
→ ECDSA verified (same as before)
→ IF demos_identity:
    → Verify via @kynesyslabs/demosdk
    → Fetch linked identities (GitHub, X, wallets, domains)
    → Store in signer_identity JSONB column
    → Reader Portal shows "Demos-verified" badge
```

**Schema change (additive):**
```sql
ALTER TABLE signatures ADD COLUMN signer_identity JSONB DEFAULT NULL;
-- Example value:
-- {
--   "demos_verified": true,
--   "demos_address": "demos1abc...",
--   "linked": {
--     "github": "username",
--     "x": "@handle",
--     "wallets": ["0x...", "sol:..."],
--     "domains": ["example.crypto"]
--   },
--   "verified_at": "2026-03-20T..."
-- }
```

**No hard dependency:** If Demos SDK is unreachable or signer has no Demos identity, the signing proceeds normally. Identity enrichment is fire-and-forget.

### 4.3 Identity Adapter Interface

```typescript
interface IdentityAdapter {
  name: string;
  verify(token: string, walletAddress: string): Promise<IdentityResult | null>;
}

type IdentityResult = {
  verified: boolean;
  provider: 'demos' | 'ens' | 'lens' | string;
  address: string;
  linked_identities: Record<string, string>;
  metadata?: Record<string, unknown>;
};
```

Future adapters: ENS resolution, Lens Protocol, Farcaster, etc.

---

## 5. Reputation Scoring

### 5.1 Score Components

| Signal | Source | Weight | Range |
|--------|--------|--------|-------|
| Contracts fulfilled | Ambr status history | 30% | 0-30 |
| Contracts active | Ambr status history | 10% | 0-10 |
| Contracts disputed | Ambr status history | -20% | -20-0 |
| Demos identity depth | Linked identity count | 15% | 0-15 |
| SuperColony attestations | DAHR posts + engagement | 10% | 0-10 |
| Wallet age | On-chain first-tx date | 5% | 0-5 |
| Contract value transacted | Sum of monetary terms | 15% | 0-15 |
| Signing consistency | Signs within SLA time | 15% | 0-15 |

**Output:** 0-100 integer score per wallet address.

### 5.2 Storage

New table:
```sql
CREATE TABLE wallet_reputation (
  wallet_address TEXT PRIMARY KEY,
  score INTEGER NOT NULL DEFAULT 0,
  breakdown JSONB NOT NULL DEFAULT '{}',
  contracts_fulfilled INTEGER DEFAULT 0,
  contracts_disputed INTEGER DEFAULT 0,
  contracts_total INTEGER DEFAULT 0,
  total_value_usdc NUMERIC DEFAULT 0,
  demos_identity_depth INTEGER DEFAULT 0,
  last_computed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.3 API

```
GET /api/v1/reputation/[wallet_address]
→ { score: 85, breakdown: {...}, contracts_total: 23, ... }
```

Public endpoint — anyone can check a wallet's reputation before entering a contract.

### 5.4 Reader Portal Integration

When viewing a signed contract, each signer shows:
- Wallet address (always)
- Reputation score badge (0-100, color-coded)
- Demos-verified identities (if available)
- Contract history summary ("15 fulfilled, 0 disputed")

---

## 6. Pluggable Storage Layer

### 6.1 Adapter Interface

```typescript
interface StorageAdapter {
  name: string;
  store(contract: ContractData): Promise<StorageResult>;
  retrieve(ref: string): Promise<ContractData | null>;
  verify(ref: string, expectedHash: string): Promise<boolean>;
}

type StorageResult = {
  adapter: string;
  reference: string;      // adapter-specific ID (UUID, CID, tx hash, etc.)
  proof?: string;          // verification proof (tx hash, IPFS CID, etc.)
  stored_at: string;       // ISO timestamp
};
```

### 6.2 Adapters

**Supabase (default, Phase 1):**
- Existing implementation, wrapped in adapter interface
- Full CRUD + RLS + share tokens + GDPR visibility
- Always active — every contract has a Supabase copy

**IPFS (Phase 2):**
- Content-addressed storage via Pinata or nft.storage
- Client opts in: `"publish_to": ["ipfs"]`
- Returns IPFS CID, stored in `contracts.ipfs_cid` (column already exists)
- Immutable — once published, can't be modified

**Demos DAHR (Phase 2):**
- Hash attestation published to Demos Network
- Client opts in: `"publish_to": ["demos"]`
- Uses `@kynesyslabs/demosdk` to create DAHR record
- Only metadata + hash (never full contract text)

**Base L2 Hash (Phase 2):**
- SHA-256 hash written to Base L2 as transaction calldata
- Cheapest on-chain proof of existence
- Client opts in: `"publish_to": ["base"]`

### 6.3 Client-Controlled Visibility

Contract creation request includes visibility preferences:

```json
{
  "template": "d1-general-auth",
  "parameters": { ... },
  "principal_declaration": { ... },
  "visibility": "private",              // "private" | "metadata_only" | "public" | "encrypted"
  "publish_to": [],                     // optional: ["ipfs", "demos", "base"]
  "encryption": {                       // required if visibility: "encrypted"
    "method": "x25519-xsalsa20-poly1305",
    "public_keys": ["0x...", "0x..."]
  }
}
```

**Visibility levels:**
| Level | Who can read full text | Metadata visible? | Storage | Use case |
|-------|----------------------|-------------------|---------|----------|
| `private` | Creator + share token holders | Yes (hash, status, dates) | Full text in Supabase, access-controlled | Default. Most business contracts. |
| `metadata_only` | Creator only (no share tokens possible) | Yes | Full text in Supabase, no public API access | Prove contract exists without revealing terms. Like `private` but stricter — no share tokens can be issued. |
| `public` | Anyone | Yes | Full text in Supabase, unrestricted GET | Open agreements, community templates. |
| `encrypted` | Only specified wallet holders (client-side decrypt) | Yes (hash, status) | Encrypted blob in Supabase, Ambr cannot read | Sensitive commercial agreements. Legal safe harbor. |

### 6.4 Encryption (E2E)

When `visibility: "encrypted"`:
1. Contract is generated by LLM (plaintext)
2. SHA-256 hash computed on plaintext (integrity check)
3. Plaintext encrypted with NaCl box using provided public keys
4. Encrypted blob stored in Supabase (replaces `human_readable` and `machine_readable`)
5. Hash stored alongside encrypted blob
6. Decryption happens client-side only (Reader Portal or agent SDK)

**Legal safe harbor:** Ambr stores encrypted data it cannot read. Platform is a tool, not a party.

---

## 7. SuperColony Integration

### 7.1 Agent Registration

Register Ambr as an agent on SuperColony:

```
POST /api/agents/register
{
  "name": "ambr",
  "description": "Legal framework for AI agents — Ricardian Contracts for delegation and commerce",
  "specialties": ["legal", "contracts", "delegation", "commerce", "ricardian"]
}
```

Requires:
- Demos wallet (12-word BIP-39 mnemonic, generated for Ambr)
- Testnet DEM tokens (100 DEM per faucet request)
- `@kynesyslabs/demosdk@^2.11.0`

### 7.2 Activity Publishing

Ambr publishes aggregate activity records (never contract content):
- "Ambr generated 5 contracts today across 3 templates"
- "Agent 0xABC fulfilled contract amb-2026-0042"
- Reputation attestations for active wallets

### 7.3 Integration Paths

SuperColony offers:
- `npx supercolony-mcp` — MCP server (Ambr already has MCP)
- `npm install eliza-plugin-supercolony` — ElizaOS plugin
- Direct SDK via `@kynesyslabs/demosdk/websdk`

Recommended: Direct SDK integration in a background service that publishes attestations periodically.

---

## 8. Contract Lifecycle Flow (Updated)

### 8.1 Full Flow with All Layers

```
1. DISCOVERY
   Agent finds Ambr via A2A (/.well-known/agent.json) or SuperColony

2. AUTHENTICATION (one of):
   a) x402: Agent sends request → gets 402 → pays USDC on Base → retries with payment proof
   b) API key: Business pre-registered with API key, includes in header

3. CONTRACT CREATION
   POST /api/v1/contracts
   {
     "template": "d1-general-auth",
     "parameters": { ... },
     "principal_declaration": { ... },
     "visibility": "private",
     "publish_to": ["ipfs"],
     "encryption": null
   }

4. ENGINE (unchanged)
   → Validate input (Zod schemas)
   → Generate via LLM (human + machine readable)
   → Compute SHA-256 hash
   → Generate contract ID (amb-YYYY-NNNN)

5. STORAGE
   → Supabase (always)
   → IPFS (if requested) → store CID
   → Demos DAHR (if requested) → publish attestation
   → Base L2 (if requested) → write hash on-chain

6. RESPONSE
   ← { contract_id, sha256_hash, human_readable, machine_readable,
       storage: { supabase: true, ipfs: { cid: "Qm..." } },
       visibility: "private" }

7. HANDSHAKE (new — pre-signing intent confirmation)
   Both parties review contract, signal intent before committing cryptographically.
   See Section 8.3 for details.

8. SIGNING
   POST /api/v1/contracts/[id]/sign
   { wallet_address, signature, message, demos_identity? }
   → ECDSA verified
   → Demos identity enriched (if provided)
   → Reputation updated
   → Status transitions (draft → handshake → pending_signature → active)

9. REPUTATION
   → Wallet reputation score updated
   → SuperColony attestation published (if opted in)

10. DEPLOY (optional, Phase 2+)
    → Mint contract as cNFT on-chain (additional fee)
```

### 8.2 A2A Multi-Turn Negotiation Flow

The A2A protocol supports multi-turn conversations via JSON-RPC `message/send`. Agents negotiate contract terms through Ambr before committing.

**A2A Task Lifecycle States:**

| A2A State | Ambr Mapping |
|-----------|-------------|
| `submitted` | Agent sent initial request (template + params) |
| `working` | Ambr generating draft contract via LLM |
| `input-required` | Ambr needs clarification or payment (402) |
| `completed` | Contract created, ready for handshake/signing |
| `failed` | Validation error, payment failure, or LLM error |

**Multi-turn negotiation example:**

```
Turn 1: Agent A → message/send
  "I need a delegation contract for Agent B, $500 spending cap, 30 days"
  → Ambr: task.status = "working"
  → Ambr generates draft, returns as artifact
  → task.status = "completed" (draft ready)

Turn 2: Agent A → message/send (same task_id)
  "Change spending cap to $1000 and add weekly reporting"
  → Ambr: task.status = "working"
  → Ambr regenerates with modified params
  → task.status = "completed" (revised draft)

Turn 3: Agent A → message/send (same task_id)
  "Approved. Finalize this contract."
  → Ambr stores contract, returns contract_id + hash
  → task.status = "completed" with final artifacts

Turn 4: Signing happens via REST API (out of A2A flow)
  POST /api/v1/contracts/[id]/sign
```

**x402 within A2A:**
- Payment is requested via `input-required` state with x402 pricing in the task artifact
- Agent pays out-of-band (sends USDC on Base), then resumes the A2A task with payment proof
- Task transitions from `input-required` → `working` → `completed`

**JSON-RPC methods mapped to Ambr skills:**

| A2A Skill | JSON-RPC Method | Payment Required |
|-----------|----------------|-----------------|
| `list_templates` | `message/send` | No |
| `create_contract` | `message/send` | Yes (x402 or API key) |
| `get_contract` | `message/send` | No (visibility rules apply) |
| `verify_hash` | `message/send` | No |
| `get_status` | `message/send` | No |

### 8.3 Handshake Protocol (Pre-Signing Intent)

The handshake is a lightweight intent-lock between contract parties before cryptographic signing. It builds confidence without commitment — like a term sheet before a binding agreement.

**Why handshake matters for B2A:**
- Business reviews contract terms generated by their agent
- Counterparty signals they've read and intend to sign
- Neither party commits cryptographically until both have shaken hands
- Prevents wasted signing gas/effort on contracts the other party hasn't reviewed

**Status flow with handshake:**

```
draft → handshake → pending_signature → active
  │                     │
  │  (Party A accepts)  │  (Party A signs with wallet)
  │  (Party B accepts)  │  (Party B signs with wallet)
  │                     │
  └─ Both must accept ──┘── Both must sign ──→ active
     before signing           before active
```

**Handshake endpoint:**

```
POST /api/v1/contracts/[id]/handshake
{
  "wallet_address": "0xABC...",
  "intent": "accept",           // "accept" | "reject" | "request_changes"
  "message": "optional note"    // e.g., "Please adjust clause 3.2"
}
```

- `accept`: Party signals intent to sign. No cryptographic commitment.
- `reject`: Party declines. Contract stays in `draft` for renegotiation or cancellation.
- `request_changes`: Party wants modifications. Returns to negotiation (A2A turn 2+).

**Handshake is optional:** For pure A2A autonomous flows, agents can skip handshake and go straight to signing. For B2A where humans review, handshake provides the confidence step.

**Schema:**

```sql
CREATE TABLE handshakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id),
  wallet_address TEXT NOT NULL,
  intent TEXT NOT NULL CHECK (intent IN ('accept', 'reject', 'request_changes')),
  message TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contract_id, wallet_address)  -- one handshake per party per contract
);
```

---

## 9. Database Changes (Additive Only)

### New Columns

```sql
-- signatures table
ALTER TABLE signatures ADD COLUMN signer_identity JSONB DEFAULT NULL;

-- contracts table: make api_key_id nullable for x402 contracts
ALTER TABLE contracts ALTER COLUMN api_key_id DROP NOT NULL;
-- Note: existing contract queries that filter by api_key_id must also support
-- filtering by payer_wallet for x402-created contracts. The GET /api/v1/contracts
-- endpoint needs a dual filter: WHERE api_key_id = ? OR payer_wallet = ?

ALTER TABLE contracts ADD COLUMN visibility TEXT DEFAULT 'private'
  CHECK (visibility IN ('private', 'metadata_only', 'public', 'encrypted'));
ALTER TABLE contracts ADD COLUMN publish_targets TEXT[] DEFAULT '{}';
ALTER TABLE contracts ADD COLUMN encryption_metadata JSONB DEFAULT NULL;
ALTER TABLE contracts ADD COLUMN payer_wallet TEXT DEFAULT NULL;
ALTER TABLE contracts ADD COLUMN payment_method TEXT DEFAULT 'api_key'
  CHECK (payment_method IN ('api_key', 'x402', 'usdc_direct'));
-- ipfs_cid column already exists
-- Note: 'stripe' and 'polar' added to CHECK when those adapters ship
```

### New Tables

```sql
-- wallet reputation
CREATE TABLE wallet_reputation (
  wallet_address TEXT PRIMARY KEY,
  score INTEGER NOT NULL DEFAULT 0,
  breakdown JSONB NOT NULL DEFAULT '{}',
  contracts_fulfilled INTEGER DEFAULT 0,
  contracts_disputed INTEGER DEFAULT 0,
  contracts_total INTEGER DEFAULT 0,
  total_value_usdc NUMERIC DEFAULT 0,
  demos_identity_depth INTEGER DEFAULT 0,
  last_computed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- x402 payment log
CREATE TABLE x402_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_hash TEXT UNIQUE NOT NULL,
  payer_wallet TEXT NOT NULL,
  amount_usdc NUMERIC NOT NULL,
  contract_id UUID REFERENCES contracts(id),  -- NULL if payment claimed but contract gen failed
  template_slug TEXT NOT NULL,
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  chain TEXT DEFAULT 'base',
  raw_proof JSONB DEFAULT NULL
);

-- handshake intent records
CREATE TABLE handshakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id),
  wallet_address TEXT NOT NULL,
  intent TEXT NOT NULL CHECK (intent IN ('accept', 'reject', 'request_changes')),
  message TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contract_id, wallet_address)
);
```

---

## 10. File Structure (New/Modified)

```
site/src/lib/
  adapters/
    payment/
      index.ts                    # PaymentAdapter interface + router
      x402.ts                     # x402 payment verification
      usdc-direct.ts              # Existing USDC flow (refactored from verify-payment.ts)
    identity/
      index.ts                    # IdentityAdapter interface + router
      wallet.ts                   # Existing ECDSA (refactored)
      demos.ts                    # Demos CCI enrichment
    storage/
      index.ts                    # StorageAdapter interface + router
      supabase.ts                 # Existing Supabase (refactored from contract-engine.ts)
      ipfs.ts                     # IPFS via Pinata/nft.storage
      demos-dahr.ts               # Demos Network attestation
      base-l2.ts                  # On-chain hash storage
  reputation/
    score.ts                      # Reputation computation
    update.ts                     # Score update triggers
  x402/
    middleware.ts                  # 402 response generation + payment verification
    pricing.ts                    # Template-based pricing
  encryption/
    encrypt.ts                    # NaCl box encryption for E2E contracts
    decrypt.ts                    # Client-side decryption helpers
  supercolony/
    register.ts                   # Agent registration
    publish.ts                    # Activity attestation publishing

site/src/app/api/
  v1/contracts/[id]/handshake/route.ts  # Handshake intent endpoint
  v1/reputation/[wallet]/route.ts       # Public reputation endpoint
```

---

## 11. Security Considerations

1. **x402 payment verification must be server-side** — never trust client-provided payment proofs without on-chain verification
2. **x402 replay protection:** Use `INSERT INTO x402_payments ... ON CONFLICT (tx_hash) DO NOTHING RETURNING id` as an atomic claim. If the insert returns no rows, the tx_hash was already used. This prevents concurrent requests from double-spending the same payment proof. No advisory locks needed — the UNIQUE constraint handles it.
3. **x402 payment-then-failure:** If payment is verified but contract generation fails (LLM timeout, Supabase down), the x402_payments row is created with `contract_id = NULL`. The agent can retry the same request with the same payment proof — the system detects the unclaimed payment and resumes contract creation. Effectively idempotent retry.
4. **Encrypted contracts:** Ambr stores what it cannot read. For encrypted contracts, `verify()` can only confirm the hash was stored alongside the blob (metadata check), not recompute it from the encrypted content. API responses for encrypted contracts include `_verification: "metadata_only"` to indicate this limitation.
5. **Demos SDK failures:** Graceful degradation — if SDK is unreachable, signing proceeds without enrichment
6. **Rate limiting:** x402 requests get same rate limits as API key requests (10 req/min per wallet). For the initial 402 response (before payment, no wallet known), rate limit by IP (10 req/min per IP).
7. **No free access:** Every contract creation requires either valid API key (with credits) or x402 payment. No exceptions.
8. **Wallet reputation is public** but contract content respects visibility settings
9. **SuperColony publishes aggregates only** — never contract text, never party details without consent
10. **Reputation anti-gaming:** Minimum contract value threshold of $10 for reputation credit. Require distinct counterparty wallets (self-contracts don't count). Weight by counterparty reputation to resist sybil attacks.
11. **SuperColony wallet key:** Ambr's Demos wallet mnemonic stored as `DEMOS_WALLET_MNEMONIC` environment variable (Vercel encrypted env). Never committed to code or logs.

---

## 12. Phased Implementation

### Phase 1 (Current Sprint) — Core Protocol Layer
- [ ] Adapter interfaces (payment, identity, storage)
- [ ] Refactor existing code into Supabase storage adapter + wallet identity adapter + USDC payment adapter
- [ ] x402 payment middleware + adapter (with replay protection)
- [ ] Database migrations (new columns + tables + handshakes)
- [ ] Dual auth routing (API key OR x402)
- [ ] Make `api_key_id` nullable; support wallet-based contract ownership for x402
- [ ] Handshake endpoint (`/api/v1/contracts/[id]/handshake`)
- [ ] Updated contract creation flow with visibility + publish_to
- [ ] Update A2A handler for multi-turn negotiation + x402 payment flow
- [ ] Update agent card to advertise x402 as alternative auth

### Phase 2 — Identity + Discovery
- [ ] Demos CCI identity adapter
- [ ] Reputation scoring system + API endpoint (with anti-gaming measures)
- [ ] SuperColony agent registration + initial attestation posts
- [ ] IPFS storage adapter

### Phase 3 — Advanced Features
- [ ] Encryption (E2E) for contracts + Reader Portal decryption UX
- [ ] SuperColony activity publishing (ongoing attestations)
- [ ] Reader Portal: reputation badges, Demos-verified indicators
- [ ] Stripe/Polar.sh payment adapters (if market demands)

### Phase 4 (If Demanded)
- [ ] Demos DAHR storage adapter
- [ ] Base L2 hash storage adapter (on-chain proof of existence)
- [ ] cNFT contract minting

---

## 13. Revenue Model

| Channel | Mechanism | Phase |
|---------|-----------|-------|
| x402 per-contract | Pay USDC per template price via HTTP 402 | Phase 1 |
| API key tiers | Starter $29 / Builder $99 / Enterprise $299 (credit packs) | Existing |
| Volume discounts | API key holders get reduced per-contract rates | Phase 2 |
| Premium templates | Higher-priced specialized templates | Phase 2 |
| Reputation API | Free tier + paid detailed reports | Phase 3 |

**Wallet:** `0x963D26FEead94424A14394Ce56da62ea88F12B7B` (Base L2, USDC)

---

## 14. Open Questions

1. Which x402 SDK to use? Nevermined (`@nevermined-io/payments`) vs Coinbase x402 reference implementation
2. SuperColony testnet vs mainnet for initial registration?
3. Encryption key management — should Ambr provide a key management helper or leave entirely to clients?
4. Should reputation scores decay over time (old fulfilled contracts worth less than recent ones)?
