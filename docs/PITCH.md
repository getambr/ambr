# Amber Protocol — Investor Pitch

**The Legal Framework for AI Agents Acting in the Real World**

---

## We're Already Building This

The site is live. The spec is written. The contract API is next.

This isn't a concept pitch. We're not asking you to fund an idea — we're asking you to back a team that's already shipping. The legal framework for AI agents is being built right now, and we're doing it lean: under $50/month in infrastructure, AI-accelerated development, and a working product in days not months.

---

## The Problem

AI agents are acting on behalf of companies right now. They're buying cloud compute, negotiating vendor contracts, ordering supplies, signing service agreements. Coinbase's x402 V2 has processed over 100 million machine-to-machine payments. ERC-8004 gives agents on-chain identity. Google, OpenAI, and Stripe are all building payment rails for autonomous commerce.

But there's a missing layer: **legal authority and accountability**.

When a company deploys an AI agent to buy supplies — who authorized it? What are the spending limits? When an agent signs a SaaS contract on behalf of a business, is that legally binding? Who's liable when the agent exceeds its mandate?

The AI agent economy has payments. It has identity. **It doesn't have a legal framework.**

eBay updated their terms for AI agent interactions in January 2026. Amazon followed in March. Mayer Brown published guidance the same month saying companies need new contract models for agentic AI. The market is asking for this. Nobody's built it yet.

---

## The Solution

Amber Protocol is the **agreement layer** for the AI agent commerce stack.

We provide Ricardian Contracts — simultaneously human-readable (a lawyer can review them), machine-parsable (an agent can extract terms programmatically), and cryptographically signed (immutable proof of agreement). Each contract is minted as a cNFT on Base L2, giving all parties a verifiable, on-chain record of what was agreed.

Three core functions:

1. **Delegation Contracts** — Power of Attorney for AI agents. Companies authorize agents to act within defined limits: spending caps, action scopes, counterparty requirements, liability terms.

2. **Commerce Contracts** — When agents buy real things or sign real contracts on behalf of companies, Amber produces the legal agreement that a human lawyer can read and enforce in court.

3. **Compliance Audit Trail** — Every contract, delegation, and amendment is minted as a cNFT. The Reader Portal lets compliance teams view, verify, audit, and export contracts by hash or NFT ID.

---

## What We've Already Built

The marketing site is live at [site-phi-mauve-66.vercel.app](https://site-phi-mauve-66.vercel.app). The full product spec — requirements, design, and implementation tasks — is written. The contract API is in active development.

Here's what a delegation contract looks like in our dual-format system:

**Human-readable (legal text):**
```
RICARDIAN CONTRACT — DELEGATION OF AUTHORITY
Contract ID: amber-2026-0042
Date: February 25, 2026

PRINCIPAL DECLARATION
Principal: Acme Logistics Ltd.
Agent: 0x7a3b...9f2e (ProcureBot AI)
Authorization: Authorized Representative

SCOPE OF DELEGATION
1. Agent is authorized to purchase office supplies and shipping materials
2. Spending limit: $5,000 per calendar month
3. Approved vendor categories: Office Supplies, Packaging, Shipping
4. Agent may negotiate terms but may NOT accept liability exceeding $10,000

LIABILITY
5. Principal assumes liability for all purchases within authorized scope
6. Agent actions outside authorized scope are void and non-binding
7. Dispute resolution: IETF ADP-compliant arbitration

SHA-256: a1b2c3d4e5f67890abcdef1234567890...
```

**Machine-parsable (what the agent reads):**
```json
{
  "contract_id": "amber-2026-0042",
  "version": "1.0",
  "type": "delegation",
  "principal": {
    "name": "Acme Logistics Ltd.",
    "wallet": "0x9d2f...4b1a"
  },
  "agent": {
    "wallet": "0x7a3b...9f2e",
    "name": "ProcureBot AI"
  },
  "scope": {
    "authorized_actions": ["purchase", "negotiate", "sign"],
    "spending_limit_usd": 5000,
    "period": "monthly",
    "categories": ["office_supplies", "packaging", "shipping"],
    "max_liability_usd": 10000
  },
  "dispute_resolution": "ietf-adp-v1",
  "hash": "a1b2c3d4e5f67890abcdef1234567890..."
}
```

Both formats are linked by a SHA-256 hash. The agent reads the JSON. The lawyer reads the text. The cNFT proves both exist and were agreed to.

---

## Where Amber Fits in the Stack

Amber doesn't replace existing infrastructure — it fills the gap nobody else is filling:

| Layer | Protocol | What It Does |
|-------|----------|--------------|
| Discovery | A2A Agent Cards, MCP | Agents find each other |
| **Agreements** | **Amber Protocol** | **Agents get authorized, terms get defined** |
| Trust | ERC-8004 | Identity and reputation |
| Escrow | KAMIYO, x0 Protocol | Conditional payment holding |
| Payments | x402 V2, ACP, AP2 | Money moves |

Every other layer is being built by well-funded teams. The agreement layer has no serious player. That's the gap.

---

## Why Nobody Else Is Doing This

- **x402 V2 / Nevermined** — payments and metering, no legal layer, no delegation authority
- **KAMIYO** — escrow and quality verification, no human-readable contracts, no delegation framework
- **ERC-8004** — on-chain identity, no agreement terms, no authorization limits
- **Accord Project** (Linux Foundation) — built Ricardian contract tooling, dormant, no AI agent focus
- **Enterprise CLM platforms** (Sirion, Juro) — Web2 contract management, not agent-native
- **eBay / Amazon** — updated their terms for AI agents, but provide no standardized delegation framework for others to use

Amber is the only project building the legal framework for AI agents acting in the real world.

---

## The Moat

The moat isn't code — it's the contract library.

Every industry has different delegation requirements. A procurement agent needs different authorization terms than a trading agent or a content licensing agent. Building legally vetted, industry-specific templates takes time and legal expertise. Once we have 50 templates that companies actually use, the switching cost is high — their agents are already authorized under Amber's framework, their compliance teams are already using the Reader Portal, their contracts are already on-chain.

The network effect compounds: every company that mints a delegation contract creates a counterparty expectation. Vendors who receive Amber contracts start expecting them. Platforms that verify Amber cNFTs before transacting create a standard.

We're not just building software. We're establishing a protocol.

---

## Target Customers

| Segment | Pain Point | What They Pay For |
|---------|-----------|-------------------|
| Companies deploying AI agents | "My agent agreed to WHAT?" | Delegation contracts + Reader Portal |
| Legal / compliance teams | No audit trail of agent actions | Reader Portal subscription ($99/mo) |
| E-commerce platforms | Need standardized agent terms | Template licensing ($29–$499) |
| Enterprises | Need PoA docs for their agents | Custom delegation templates |
| Agent platform operators | Need to verify authorization before transacting | API access (usage-based) |

---

## Revenue Model

| Stream | Pricing |
|--------|---------|
| Delegation + commerce contracts | $0.50–$5.00 per contract |
| Template licensing | $29–$499 per template |
| Reader Portal (enterprise) | $99/month |
| Dispute resolution | $10–$50 per case |
| API access | Usage-based |

Conservative projections: $85K Year 1, $520K Year 2, $3.2M Year 3. 80–90% net margins at scale — infrastructure costs are near-zero (Base L2 gas is sub-$0.01 per mint, Supabase free tier handles early volume).

---

## Current Status

**Site is live. MVP ships in days.**

| Done | In Progress |
|------|-------------|
| Marketing website (live on Vercel) | Delegation contract API |
| Full product spec (requirements + design + tasks) | LLM contract generation |
| Business research and competitive analysis | Reader Portal |
| Gap analysis and landscape review | cNFT minting on Base testnet |
| Design system and component library | x402 V2 extension |

**Real infrastructure cost: under $50/month.**
Supabase free tier. Base testnet (free gas). Vercel free tier. ~$12 domain.

We're not burning runway to figure out if this is viable. We're shipping to prove it.

---

## MVP Timeline (AI-Accelerated)

| Day | Milestone |
|-----|-----------|
| 1–2 | Delegation contract API — create, sign, store |
| 3–4 | LLM contract generation — natural language → dual-format Ricardian Contract |
| 5–6 | Reader Portal — view, verify, audit by hash |
| 7 | cNFT minting on Base testnet |
| 8+ | x402 V2 extension — contract hashes in payment metadata |

What a traditional team would take 3 months to build, we're doing in a week. AI-assisted development isn't a buzzword here — it's how the spec was written, how the site was built, and how the contract engine will be generated.

---

## What We're Asking For

We don't need funding to start. We need funding to move faster and establish the standard before someone else does.

Specifically:
- **Legal review** — getting the contract templates reviewed by actual lawyers ($5–15K)
- **Ecosystem integrations** — dedicated time to build x402 V2 and ERC-8004 integrations properly
- **Early customer acquisition** — reaching the compliance teams and enterprise AI teams who need this now
- **Protocol establishment** — submitting Amber's delegation format as an IETF draft standard

The window is open. The AI agent economy is being built right now. The legal layer is the last piece nobody's claimed.

---

*Amber Protocol — the legal framework for AI agents acting in the real world.*
