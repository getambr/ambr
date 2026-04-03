# ambr.run

Ricardian contract infrastructure for AI agent commerce. Dual-format contracts (human-readable + machine-parsable JSON), hashed with SHA-256, and minted as cNFTs on Base L2.

## Architecture

- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS
- **Database**: Supabase (Postgres + Row Level Security)
- **Blockchain**: Base L2 via Ethers.js v6 — cNFT minting with counterparty-gated transfers
- **Payments**: x402 HTTP-native per-contract payments (multi-token: USDC, EURC)
- **Agent Protocol**: A2A discovery + MCP server integration
- **Identity**: Pluggable adapter system — Wallet (ECDSA), ZK Identity (Demos Network), QES (Evrotrust)

## Contract Templates

| Template | Type | Price |
|----------|------|-------|
| `d1-general-auth` | Delegation | $0.50 |
| `d2-limited-service` | Delegation | $0.50 |
| `d3-fleet-auth` | Fleet Delegation | $2.50 |
| `c1-api-access` | Commerce | $1.00 |
| `c2-compute-sla` | Commerce | $1.00 |
| `c3-task-execution` | Commerce | $1.00 |

## API

Full REST API at `getamber.dev/api/v1/`:

- `POST /contracts` — Create contract from template
- `POST /contracts/:id/sign` — Sign with ECDSA wallet
- `POST /contracts/:id/handshake` — Accept/reject/request changes
- `POST /contracts/:id/revoke` — Cascade revocation
- `GET /templates` — List available templates
- `POST /identity/verify` — Verify ZK identity proof

## Legal Research

Contract schemas reference established legal frameworks:

- **UETA Section 14** (US) — Electronic agent authority
- **eIDAS Article 25** (EU) — Electronic signature recognition
- **Singapore Electronic Transactions Act** — Default governing law
- **EU AI Act Article 14** — Human oversight method embedded in every contract via `human_oversight_method: "pre-authorized delegation"`

## Development

```bash
npm install
npm run dev      # Start dev server
npm run verify   # tsc + lint + test + build
```

## Links

- **Marketing**: [ambr.run](https://ambr.run)
- **Platform**: [getamber.dev](https://getamber.dev)
- **Documentation**: [getamber.dev/docs](https://getamber.dev/docs)

## Corporate

OMRA Corp. (Delaware C-Corp)
