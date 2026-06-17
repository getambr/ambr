# Ambr Agent SDK

Attach a readable, signed, on-chain **agreement** to any agent transaction in a few lines.

Agents can already pay (x402, AP2) and identify each other. Ambr is the missing layer: a **Ricardian contract** — human- *and* machine-readable — between verified parties, minted on-chain as a tamper-proof record with revocation + audit history.

Zero runtime dependencies. Uses the global `fetch` and a signer you provide, so it runs in Node, Bun, Deno, or the edge.

## Quick start (API key)

Get an instant free developer key at https://ambr.run → Activate → Developer.

```ts
import { AmbrClient } from '@/lib/sdk';
import { Wallet } from 'ethers';

const ambr = new AmbrClient({ apiKey: process.env.AMBR_API_KEY });
const agent = new Wallet(process.env.AGENT_PRIVATE_KEY!);

// 1. Create the agreement (template slugs: GET /api/v1/templates)
const agreement = await ambr.createAgreement({
  template: '<template-slug>',
  parameters: { /* scope, spend limits, parties — per the template */ },
  principal: { agentId: agent.address, principalName: 'Acme Corp', principalType: 'company' },
  principalWallet: agent.address,
});

// 2. Sign it (ECDSA). Activates + mints the cNFT once both sides sign.
const result = await ambr.sign(agreement.contractId, {
  walletAddress: agent.address,
  signMessage: (msg) => agent.signMessage(msg),
});

console.log(agreement.readerUrl, '→', result.status);
```

## x402 (pay-per-agreement, no API key)

```ts
import { AmbrClient, PaymentRequiredError } from '@/lib/sdk';

const ambr = new AmbrClient(); // no apiKey
try {
  await ambr.createAgreement(input);
} catch (e) {
  if (e instanceof PaymentRequiredError) {
    // e.paymentInfo holds the x402 payment requirements.
    // Build your x402 payment, then retry with the payment header:
    await ambr.createAgreement(input, { extraHeaders: { 'X-PAYMENT': paymentProof } });
  }
}
```

## Read status / binding terms

```ts
const status = await ambr.getStatus(agreement.contractId);
status.isCurrentlyValid; // active, not revoked, not expired
status.bindingTerms;     // what the agent may / may not do (when visible)
```

## API

- `new AmbrClient({ apiKey?, baseUrl?, fetch? })` — `baseUrl` defaults to `https://getamber.dev`.
- `createAgreement(input, { extraHeaders? })` → `Agreement` (throws `PaymentRequiredError` on the x402 path).
- `getStatus(idOrHash)` → `AgreementStatus`.
- `sign(idOrHash, { walletAddress, signMessage, signerEmail? })` → `SignResult`.
- `buildSignMessage(idOrContractId, sha256Hash)` — preview the exact string before signing.

`idOrHash` accepts an `amb-YYYY-NNNN` contract id or a 64-char sha256 hash.

## Notes

- The SDK never holds keys. `signMessage` is yours (ethers / viem / MetaMask) — Ambr only verifies the ECDSA signature server-side.
- This module currently lives inside the Ambr app for shared types + testing; it has no app/runtime dependencies and is intended to be extracted to a standalone published package (`@ambr/agent-sdk`).

## x402 — agreement-gated payments

x402 proves payment; it doesn't carry *what the agent agreed to*. The `x402` helpers attach an Ambr agreement to a 402 handshake — **payment + contract in one round-trip**. It's an extension *on top of* x402 (gateway-agnostic), not a separate rail.

**Server** — gate an endpoint on payment *and* an agreement:

```ts
import { attachAgreement } from '@/lib/sdk';

// `base402` is your normal Ambr 402 body; `agreement` came from createAgreement()
const gated = attachAgreement(base402, agreement, { terms: machineReadableTerms });
return new Response(JSON.stringify(gated), { status: 402 });
```

**Client (agent)** — read what to pay *and* what you're agreeing to:

```ts
import { AmbrClient, parseContractGated402 } from '@/lib/sdk';

const parsed = parseContractGated402(await res.json());
if (parsed) {
  const { payment, agreement } = parsed;
  const terms = (await new AmbrClient().getStatus(agreement.hash)).bindingTerms;
  // pay per `payment`, accept `agreement`, then retry with X-Payment + acceptance
}
```

