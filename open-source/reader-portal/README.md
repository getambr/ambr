# Ambr Reader Portal

Open-source components for viewing, verifying, and exporting Ricardian Contracts.

## Components

### `ContractViewer.tsx`
Toggle between human-readable and machine-parsable (JSON) views of a contract.
Uses Framer Motion for transitions. Requires React 18+ and `framer-motion`.

### `ExportButtons.tsx`
Export contracts as JSON, Markdown, or plain text. Client-side download with
metadata (contract ID, SHA-256 hash, timestamps). No server dependency.

### `verify-hash.ts`
SHA-256 hash verification for Ricardian Contracts. Recomputes the hash from
human-readable text + sorted machine-readable JSON in canonical format.

## Hash Verification Algorithm

Ambr contracts are linked by SHA-256 hash computed from:

```
canonical = humanReadable + "\n---\n" + JSON.stringify(sortedMachineReadable)
hash = SHA-256(canonical, "utf-8")
```

Where `sortedMachineReadable` is the machine-readable JSON object with keys
sorted alphabetically (top-level only).

## License

MIT
