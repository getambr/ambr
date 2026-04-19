# A2C Template Specification — a1, a2, a3

> Agent-to-Consumer contract templates for ambr.run.
> These templates enable AI agents to transact with human consumers with legal finality.
> Consumer-facing contracts have stricter legal requirements than B2B (d1-d3, c1-c3).

**Target files:**
- `site/src/lib/templates/seed-data.ts` — SQL INSERT after line 186 (after c3)
- `site/src/lib/llm/prompts.ts` — add to TEMPLATE_PROMPTS object
- `site/src/lib/x402/pricing.ts` — add to defaults map

**Category:** `"consumer"` (new category alongside "delegation" and "commerce")

**Pricing:** All A2C templates = 30 cents ($0.30) per contract

---

## Pattern Reference (follow exactly)

Every template MUST follow the existing d1/c1 pattern:

1. **seed-data.ts:** SQL INSERT with slug, name, description, category, parameter_schema (valid JSON Schema draft-7), price_cents, version
2. **prompts.ts:** Entry in TEMPLATE_PROMPTS keyed by slug. Must start with `${BASE_INSTRUCTIONS}` and include all 13 mandatory sections (Recitals through Signature Block)
3. **pricing.ts:** Entry in defaults map with USDC value (6 decimals)
4. **Tests:** vitest cases in `src/lib/__tests__/prompts.test.ts` verifying prompt content

---

## a1 — Service Purchase Agreement

**Slug:** `a1-service-purchase`
**Name:** Service Purchase Agreement (Agent-to-Consumer)
**Description:** An AI agent sells a defined service to a human consumer — covers scope, fees, delivery timeline, refund policy, and mandatory cooling-off period. Structured with reference to EU Consumer Rights Directive 2011/83/EU, UETA s. 14, and eIDAS Art. 25. Includes EU AI Act Art. 50 transparency disclosure.

**Use cases:**
- AI travel agent books flights for a consumer
- AI customer service agent resolves a dispute with binding terms
- AI marketplace agent sells a product/service to end user

**Price:** 30 cents ($0.30)

### Parameter Schema (JSON Schema draft-7)

```json
{
  "type": "object",
  "required": [
    "consumer_name",
    "consumer_email",
    "provider_name",
    "provider_agent_id",
    "service_description",
    "fee",
    "currency",
    "delivery_timeline",
    "refund_policy",
    "governing_law"
  ],
  "properties": {
    "consumer_name": {
      "type": "string",
      "description": "Full legal name of the consumer purchasing the service"
    },
    "consumer_email": {
      "type": "string",
      "format": "email",
      "description": "Consumer's email address (used for signing via Privy/magic-link, NOT wallet)"
    },
    "provider_name": {
      "type": "string",
      "description": "Legal name of the entity behind the AI agent"
    },
    "provider_agent_id": {
      "type": "string",
      "description": "Agent wallet address (0x...) or platform identifier of the selling agent"
    },
    "service_description": {
      "type": "string",
      "description": "Clear, plain-language description of the service being purchased"
    },
    "fee": {
      "type": "number",
      "description": "Total fee for the service in the specified currency"
    },
    "currency": {
      "type": "string",
      "enum": ["USD", "EUR", "GBP", "SGD", "USDC"],
      "default": "USD",
      "description": "Currency for the fee"
    },
    "delivery_timeline": {
      "type": "string",
      "description": "When and how the service will be delivered (e.g., 'within 24 hours', 'by 2026-05-01')"
    },
    "refund_policy": {
      "type": "string",
      "description": "Clear refund terms — must be prominently stated per Consumer Rights Directive"
    },
    "cooling_off_days": {
      "type": "integer",
      "default": 14,
      "minimum": 14,
      "description": "Cooling-off period in days (EU minimum 14 per Directive 2011/83/EU Art. 9)"
    },
    "governing_law": {
      "type": "string",
      "default": "Singapore",
      "enum": ["Singapore", "Delaware", "England-Wales", "Switzerland", "EU-Consumer"],
      "description": "Governing jurisdiction. Note: for EU consumers, EU-Consumer applies consumer's local law."
    },
    "data_processing_notice": {
      "type": "string",
      "description": "GDPR Art. 13-14 information notice about how consumer data is processed"
    },
    "agent_disclosure": {
      "type": "string",
      "default": "This contract is generated and administered by an AI agent.",
      "description": "EU AI Act Art. 50 transparency disclosure — must be included in contract text"
    }
  }
}
```

### Consumer-Mandatory Clauses (in addition to 13 base sections)

The LLM prompt for a1 MUST instruct generation of these additional sections:

14. **PLAIN-LANGUAGE SUMMARY** — first section after Recitals. One paragraph, no legal jargon, consumer-readable.
15. **COOLING-OFF PERIOD** — state the exact number of days (minimum 14), how to exercise (email to provider), no penalty for withdrawal.
16. **CANCELLATION TERMS** — within first 3 sections. Cancellation must be as easy as purchase. No hidden barriers.
17. **PRICING TRANSPARENCY** — all fees, taxes, additional charges listed explicitly. No hidden costs.
18. **AGENT DISCLOSURE** — "This contract is generated and administered by an AI agent on behalf of [provider_name]. The AI agent operates under the authority of the provider through an Ambr delegation contract."
19. **DATA PROTECTION NOTICE** — GDPR Art. 13-14 information (who processes data, purpose, retention, rights).
20. **CONSUMER RIGHTS NOTICE** — reference to applicable consumer protection law (CRD, CRA, UCTA).

### LLM Prompt Structure (prompts.ts entry)

```
'd1-service-purchase': `${BASE_INSTRUCTIONS}

TEMPLATE: A1 — Service Purchase Agreement (Agent-to-Consumer)
PURPOSE: AI agent sells defined service to human consumer with full consumer protection.

LEGAL BASIS:
- EU: Consumer Rights Directive 2011/83/EU (cooling-off Art. 9-16), eIDAS Art. 25, EU AI Act Art. 50 (transparency), GDPR Art. 13-14
- US: UETA s. 14 (electronic agent formation), ESIGN Act, FTC Act s. 5 (unfair practices)
- SG: Electronic Transactions Act s. 15, Consumer Protection (Fair Trading) Act
- UK: Consumer Rights Act 2015 s. 62, UCTA 1977 s. 2-3, ECA 2000 s. 7

CRITICAL CONSUMER REQUIREMENTS:
- MUST include 14-day minimum cooling-off period
- MUST state refund policy in first 3 sections
- MUST disclose AI agent involvement (EU AI Act Art. 50)
- MUST NOT exclude liability for negligence or death (UCTA s. 2)
- MUST include GDPR data processing notice
- MUST use plain language (no dense legal jargon in consumer sections)

REQUIRED PARAMETERS: consumer_name, consumer_email, provider_name, provider_agent_id, service_description, fee, currency, delivery_timeline, refund_policy, governing_law
OPTIONAL PARAMETERS: cooling_off_days (default 14), data_processing_notice, agent_disclosure

CONTRACT STRUCTURE:
1. RECITALS — identify parties (consumer + AI agent acting for provider)
2. PLAIN-LANGUAGE SUMMARY — one paragraph describing what consumer is getting, for how much, and how to cancel
3. AGENT DISCLOSURE — EU AI Act Art. 50 transparency statement
4. SERVICE DESCRIPTION — from service_description parameter
5. PRICING AND PAYMENT — fee, currency, all charges itemized
6. DELIVERY — delivery_timeline terms
7. COOLING-OFF PERIOD — {cooling_off_days} days from signing; how to exercise
8. CANCELLATION AND REFUND — refund_policy terms; cancellation must be as easy as purchase
9. LIABILITY — provider liable for agent actions; UCTA-compliant caps (minimum 2x fee)
10. DATA PROTECTION — GDPR notice; data_processing_notice content
11. CONSUMER RIGHTS — reference to applicable consumer protection legislation
12. DISPUTE RESOLUTION — IETF ADP v1 + consumer's right to small claims court
13. CHOICE OF LAW — governing_law; EU consumers retain local mandatory protections
14. PRIMACY CLAUSE — human-readable text prevails
15. SHA-256 HASH — placeholder for verification
16. ELECTRONIC SIGNATURE ACKNOWLEDGMENT — ECDSA/blockchain valid
17. SIGNATURE BLOCK`
```

---

## a2 — AI-Driven Subscription

**Slug:** `a2-ai-subscription`
**Name:** AI-Driven Subscription Agreement
**Description:** Consumer subscribes to an AI-mediated service with recurring billing — covers monthly fee, SLA, cancellation, auto-renewal controls, and mandatory cooling-off. Structured with reference to EU Consumer Rights Directive, UETA s. 14, and eIDAS Art. 25. No auto-renewal without explicit opt-in per EU directive.

**Price:** 30 cents ($0.30)

### Parameter Schema (JSON Schema draft-7)

```json
{
  "type": "object",
  "required": [
    "consumer_name",
    "consumer_email",
    "provider_name",
    "provider_agent_id",
    "subscription_description",
    "monthly_fee",
    "currency",
    "billing_cycle",
    "cancellation_notice_days",
    "governing_law"
  ],
  "properties": {
    "consumer_name": {
      "type": "string",
      "description": "Full legal name of the subscribing consumer"
    },
    "consumer_email": {
      "type": "string",
      "format": "email",
      "description": "Consumer's email address for signing + billing notifications"
    },
    "provider_name": {
      "type": "string",
      "description": "Legal name of the entity behind the AI agent"
    },
    "provider_agent_id": {
      "type": "string",
      "description": "Agent wallet address (0x...) or platform identifier"
    },
    "subscription_description": {
      "type": "string",
      "description": "Clear description of what the subscription includes"
    },
    "monthly_fee": {
      "type": "number",
      "description": "Monthly subscription fee"
    },
    "currency": {
      "type": "string",
      "enum": ["USD", "EUR", "GBP", "SGD", "USDC"],
      "default": "USD"
    },
    "billing_cycle": {
      "type": "string",
      "enum": ["monthly", "quarterly", "annual"],
      "default": "monthly",
      "description": "How often the consumer is billed"
    },
    "sla_description": {
      "type": "string",
      "description": "Service Level Agreement — uptime, response time, support availability"
    },
    "cancellation_notice_days": {
      "type": "integer",
      "default": 30,
      "description": "Days of notice required for cancellation"
    },
    "cooling_off_days": {
      "type": "integer",
      "default": 14,
      "minimum": 14,
      "description": "Cooling-off period per EU Consumer Rights Directive"
    },
    "auto_renew": {
      "type": "boolean",
      "default": false,
      "description": "Auto-renewal MUST be opt-in (default false). EU consumers must explicitly consent."
    },
    "prorated_refund": {
      "type": "boolean",
      "default": true,
      "description": "Whether unused portion is refunded on cancellation"
    },
    "governing_law": {
      "type": "string",
      "default": "Singapore",
      "enum": ["Singapore", "Delaware", "England-Wales", "Switzerland", "EU-Consumer"]
    }
  }
}
```

### Key differences from a1
- Recurring billing requires explicit auto-renewal opt-in
- Cancellation must be as easy as sign-up (EU directive)
- Prorated refund default true
- SLA terms included
- billing_cycle field drives payment schedule

---

## a3 — Warranty / Liability Binding

**Slug:** `a3-warranty-liability`
**Name:** AI Agent Warranty and Liability Agreement
**Description:** AI agent commits to a guaranteed service outcome with enforceable liability caps and remedies. Covers warranty scope, liability limits, claim procedures, and arbitration. Consumer may reject arbitration in favor of small claims court. UCTA-compliant: no exclusion of liability for negligence or death.

**Price:** 30 cents ($0.30)

### Parameter Schema (JSON Schema draft-7)

```json
{
  "type": "object",
  "required": [
    "consumer_name",
    "consumer_email",
    "provider_name",
    "provider_agent_id",
    "warranty_description",
    "guaranteed_outcome",
    "liability_cap_usd",
    "remedy_description",
    "claim_deadline_days",
    "governing_law"
  ],
  "properties": {
    "consumer_name": {
      "type": "string",
      "description": "Full legal name of the consumer"
    },
    "consumer_email": {
      "type": "string",
      "format": "email",
      "description": "Consumer's email for signing + claim notifications"
    },
    "provider_name": {
      "type": "string",
      "description": "Legal name of the entity behind the AI agent"
    },
    "provider_agent_id": {
      "type": "string",
      "description": "Agent wallet address (0x...)"
    },
    "warranty_description": {
      "type": "string",
      "description": "What is warranted — clear, specific, measurable"
    },
    "guaranteed_outcome": {
      "type": "string",
      "description": "The specific outcome the agent guarantees (must be objectively verifiable)"
    },
    "liability_cap_usd": {
      "type": "number",
      "description": "Maximum liability in USD. UCTA s. 11: must be reasonable (minimum 2x contract value for consumer contracts)"
    },
    "remedy_description": {
      "type": "string",
      "description": "What happens if the guarantee is not met (refund, credit, re-performance, etc.)"
    },
    "claim_deadline_days": {
      "type": "integer",
      "default": 90,
      "description": "Days after service delivery within which consumer must file a warranty claim"
    },
    "arbitration_provider": {
      "type": "string",
      "default": "IETF ADP v1",
      "description": "Arbitration body for disputes. Consumer retains right to reject in favor of small claims court."
    },
    "cooling_off_days": {
      "type": "integer",
      "default": 14,
      "minimum": 14
    },
    "governing_law": {
      "type": "string",
      "default": "Singapore",
      "enum": ["Singapore", "Delaware", "England-Wales", "Switzerland", "EU-Consumer"]
    }
  }
}
```

### Key differences from a1/a2
- Guaranteed outcome clause (agent commits to measurable result)
- Liability cap with UCTA reasonableness test (2x minimum for consumers)
- Claim deadline and procedure
- Consumer can reject arbitration for small claims
- No exclusion of liability for negligence/death (UCTA s. 2 — absolute requirement)

---

## Implementation Checklist (for the autonomous dev agent)

After implementing each template:

- [ ] SQL INSERT in seed-data.ts follows exact pattern of d1-d3/c1-c3
- [ ] parameter_schema is valid JSON Schema draft-7 (test with `ajv` or equivalent)
- [ ] LLM prompt in prompts.ts starts with `${BASE_INSTRUCTIONS}`
- [ ] Prompt includes all 13 base mandatory sections + 7 consumer-mandatory sections
- [ ] Prompt references correct legal basis (CRD, UCTA, CRA, GDPR, eIDAS, EU AI Act Art. 50)
- [ ] pricing.ts defaults map has new entry (300000n = $0.30 USDC)
- [ ] `consumer_email` is used instead of requiring wallet address for consumer party
- [ ] `cooling_off_days` defaults to 14 with minimum 14
- [ ] `auto_renew` defaults to false (a2 only)
- [ ] `governing_law` includes `EU-Consumer` option
- [ ] Tests in prompts.test.ts verify: non-empty prompt, contains all mandatory elements, references eIDAS + IETF ADP + consumer rights
- [ ] Passed CONSUMER-COMPLIANCE-CHECKLIST.md (all items checked)

---

## File references (read before implementing)

- `site/src/lib/templates/seed-data.ts:120-186` — existing 6 templates (pattern source)
- `site/src/lib/llm/prompts.ts:1-293` — BASE_INSTRUCTIONS + all template prompts
- `site/src/lib/llm/generate-contract.ts` — generation flow, sanitization, cross-check
- `site/src/lib/x402/pricing.ts:14-57` — USDC pricing defaults
- `docs/LEGAL-RESEARCH-US-UK-SINGAPORE.md` — consumer protection requirements
- `docs/LEGAL-RESEARCH-RICARDIAN-STANDARDS.md` — mandatory Ricardian elements
- `site/src/lib/compliance/art14.ts` — EU AI Act Article 14 oversight implementation
