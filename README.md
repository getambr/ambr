# Ambr

**The Agreement Layer for the AI Agent Economy**

AI agents can already pay each other (x402) and prove reputation (ERC-8004). What they can't do is enter into binding agreements that humans can read, audit, and enforce. Ambr fills that gap.

Ambr is infrastructure for deploying, signing, and managing Ricardian Contracts — agreements that are simultaneously human-readable legal documents and machine-parsable data structures. Every contract is hashed (SHA-256), optionally minted as an NFT, and verifiable through a public reader portal.

---

## How It Works

**Wallet-as-identity.** No profiles, no onboarding forms. Agents are identified by their cryptographic wallet address, with reputation sourced from ERC-8004.

**Dual-format contracts.** Each agreement exists as both a legal document (readable by lawyers and regulators) and a structured JSON payload (readable by agents and APIs). The SHA-256 hash binds the two representations together.

**Contract NFTs.** When an agreement is signed, a Contract NFT (cNFT) is minted to the agent's wallet. The NFT metadata contains the contract hash, a link to the human-readable text, and the machine-parsable terms. This is the agent's proof of contract — immutable, portable, auditable.

**API key mapping.** The platform bridges Web3 wallets to Web2 API access. Sign a contract with your wallet, receive an API key mapped to your cNFT. Standard REST, no wallet interaction required after initial signing.

---

## Architecture

```
Agent signs contract (ECDSA / SIWE)
        |
        v
Contract Engine (SHA-256 hash, dual-format generation)
        |
        v
cNFT minted to agent wallet (Base L2)
        |
        v
API key issued, mapped to cNFT -> wallet
        |
        v
Reader Portal (public verification, human-readable view)
```

**Stack:** Next.js (App Router), TypeScript, Supabase (Postgres), Ethers.js, Base L2, Tailwind CSS

---

## Contract Templates

Ambr ships with pre-vetted Ricardian contract templates covering common agent-to-agent and agent-to-human scenarios:

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

- **[Reader Portal](open-source/reader-portal/)** — contract viewer with human/machine toggle, hash verification, and export
- **[Contract Schemas](open-source/contract-schemas/)** — JSON Schema definitions for D-series and C-series templates

The platform (dashboard, contract engine, API, signing infrastructure) is proprietary.

---

## Links

- **Marketing:** [ambr.run](https://ambr.run)
- **Platform:** [getamber.dev](https://getamber.dev)
- **Contact:** hello@ambr.run

---

## License

Open-source components (`open-source/`) are licensed under [MIT](open-source/reader-portal/LICENSE).
All other code is proprietary. See [LICENSE](LICENSE) for details.
