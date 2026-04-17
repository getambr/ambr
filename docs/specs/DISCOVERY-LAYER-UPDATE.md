# Discovery Layer Update — A2C + C2C Templates

> Changes to agent.json, llms.txt, MCP, and Schema.org when new templates go live.
> Most updates are AUTOMATIC (MCP + API read from DB). Only agent.json and llms.txt need manual edits.

---

## 1. agent.json — Add 2 new skills

**File:** `site/src/app/.well-known/agent.json/route.ts`

Add to the `skills` array (after existing 6 skills):

```json
{
  "id": "create_a2c_contract",
  "name": "Create A2C Contract",
  "description": "Generate a consumer-facing Ricardian contract from an A2C template (a1 Service Purchase, a2 AI Subscription, a3 Warranty/Liability). Consumer signs via email magic link — no wallet required. EU Consumer Rights Directive and AI Act Art. 50 compliant.",
  "tags": ["contracts", "consumer", "a2c", "eu-compliant"],
  "examples": [
    "Create a service purchase agreement for a consumer buying flight booking from an AI travel agent",
    "Generate an AI subscription contract with 14-day cooling-off period",
    "Create a warranty agreement where the AI agent guarantees delivery within 24 hours"
  ]
},
{
  "id": "create_c2c_contract",
  "name": "Create C2C Contract",
  "description": "Generate a peer-to-peer Ricardian contract from a C2C template (p1 NDA, p2 Freelance Agreement, p3 Rental/Settlement). Both parties sign via email magic link. No agent involvement required — pure consumer-to-consumer.",
  "tags": ["contracts", "p2p", "c2c", "nda", "freelance"],
  "examples": [
    "Create a mutual NDA between two individuals",
    "Generate a freelance agreement with milestone payments and IP assignment to client",
    "Create a rental agreement for a short-term property lease with deposit terms"
  ]
}
```

Also update the `stats` section (lines ~140-180) to include new template counts:
- `templates_active`: increment from 6 to 12
- Add `consumer_templates: 3` and `peer_templates: 3`

---

## 2. llms.txt — Add template descriptions

**File:** `public/llms.txt`

Append after existing 6 template entries:

```
## A2C Templates (Agent-to-Consumer)

a1-service-purchase: Service Purchase Agreement — AI agent sells service to consumer. $0.30/contract.
  Consumer signs via email. 14-day cooling-off. EU Consumer Rights Directive compliant.

a2-ai-subscription: AI-Driven Subscription — Consumer subscribes via agent. $0.30/contract.
  Recurring billing. No auto-renewal default. Cancellation as easy as sign-up.

a3-warranty-liability: Warranty/Liability Binding — Agent guarantees outcome. $0.30/contract.
  Enforceable liability caps. Consumer can reject arbitration for small claims court.

## C2C Templates (Consumer-to-Consumer / P2P)

p1-nda: Non-Disclosure Agreement — Mutual or one-way NDA between individuals. $0.50/contract.
  Both parties sign via email magic link. No wallet required.

p2-freelance: Freelance Service Agreement — Client engages freelancer. $0.50/contract.
  Milestone payments. IP ownership clause. Revision rounds.

p3-rental-settlement: Rental or Settlement Agreement — Dual-mode template. $0.50/contract.
  Rental: property/equipment lease with deposit. Settlement: dispute resolution with mutual release.
```

---

## 3. MCP tools — AUTOMATIC (no manual change needed)

The MCP server at `site/src/app/api/mcp/route.ts` reads templates from the database via `ambr_list_templates`. When new templates are INSERT'd into the `templates` table (via seed-data.ts), they automatically appear in:

- `tools/list` response (new templates visible to MCP clients)
- `ambr_create_contract` tool (accepts new slugs)

**Verify after deploy:**
```bash
curl -X POST https://getamber.dev/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
| jq '.result.tools[] | .name'
```

Expected: should now list a1, a2, a3, p1, p2, p3 alongside existing d1-d3, c1-c3.

---

## 4. Schema.org JSON-LD — Add Product entries

**File:** `site/src/app/layout.tsx` or `site/src/app/(marketing)/page.tsx` (wherever existing JSON-LD lives)

Add inside the existing `@graph` array:

```json
{
  "@type": "Product",
  "@id": "https://getamber.dev#a2c-templates",
  "name": "Ambr A2C Contract Templates",
  "description": "AI agent-to-consumer Ricardian contract templates with EU consumer protection compliance",
  "offers": {
    "@type": "Offer",
    "price": "0.30",
    "priceCurrency": "USD",
    "availability": "https://schema.org/InStock"
  }
},
{
  "@type": "Product",
  "@id": "https://getamber.dev#c2c-templates",
  "name": "Ambr C2C Contract Templates",
  "description": "Peer-to-peer Ricardian contract templates — NDA, freelance, rental, settlement",
  "offers": {
    "@type": "Offer",
    "price": "0.50",
    "priceCurrency": "USD",
    "availability": "https://schema.org/InStock"
  }
}
```

---

## 5. robots.txt — No change needed

Current `public/robots.txt` already allows all AI crawlers (GPTBot, ChatGPT-User, ClaudeBot, Google-Extended, PerplexityBot, cohere-ai). New templates will be discoverable automatically once llms.txt is updated.

---

## 6. A2A protocol — Auto-discovery

The A2A handler at `site/src/app/api/a2a/route.ts` reads skills from agent.json (see #1 above). Once agent.json is updated, A2A agent discovery will include the new create_a2c_contract and create_c2c_contract skills. No separate code change needed beyond agent.json.

---

## Verification checklist

After implementing all discovery layer changes:

- [ ] `curl getamber.dev/.well-known/agent.json | jq '.skills | length'` returns 8 (was 6)
- [ ] `curl getamber.dev/llms.txt` includes a1-a3 and p1-p3 descriptions
- [ ] MCP `tools/list` includes 12 templates (was 6)
- [ ] Schema.org JSON-LD validates at schema.org validator
- [ ] A2A discovery returns 8 skills
- [ ] Google/Bing structured data test recognizes new Product entries
