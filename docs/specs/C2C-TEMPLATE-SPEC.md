# C2C Template Specification — p1, p2, p3

> Consumer-to-Consumer (P2P) contract templates for ambr.run.
> These compete with DocuSign / HelloSign at $0.50/contract.
> NO agent_id required — both parties are human consumers signing via Privy / email magic link.

**Target files:** same as A2C-TEMPLATE-SPEC.md
**Category:** `"peer"` (new category)
**Pricing:** All C2C templates = 50 cents ($0.50) per contract

---

## p1 — Non-Disclosure Agreement

**Slug:** `p1-nda`
**Name:** Non-Disclosure Agreement (P2P)
**Description:** Mutual or one-way NDA between two individuals or entities — defines confidential information scope, term, surviving obligations, and remedies. Both parties sign via email magic link (no wallet required). Structured with reference to UETA/ESIGN and eIDAS Art. 25.

**Price:** 50 cents ($0.50)

### Parameter Schema

```json
{
  "type": "object",
  "required": [
    "party_a_name",
    "party_a_email",
    "party_b_name",
    "party_b_email",
    "nda_type",
    "confidential_scope",
    "term_months",
    "governing_law"
  ],
  "properties": {
    "party_a_name": {
      "type": "string",
      "description": "Full legal name of Party A (disclosing party in one-way NDA)"
    },
    "party_a_email": {
      "type": "string",
      "format": "email",
      "description": "Party A's email for signing via magic link"
    },
    "party_b_name": {
      "type": "string",
      "description": "Full legal name of Party B (receiving party in one-way NDA)"
    },
    "party_b_email": {
      "type": "string",
      "format": "email",
      "description": "Party B's email for signing via magic link"
    },
    "nda_type": {
      "type": "string",
      "enum": ["mutual", "one-way-a-to-b", "one-way-b-to-a"],
      "description": "Mutual: both parties disclose. One-way: only one party discloses."
    },
    "confidential_scope": {
      "type": "string",
      "description": "Description of what information is considered confidential"
    },
    "exclusions": {
      "type": "string",
      "description": "What is NOT confidential (publicly known, independently developed, etc.)"
    },
    "term_months": {
      "type": "integer",
      "description": "Duration of the NDA in months"
    },
    "surviving_obligations_months": {
      "type": "integer",
      "default": 24,
      "description": "How long confidentiality obligations survive after NDA expires"
    },
    "permitted_disclosures": {
      "type": "string",
      "description": "Who else may receive the information (employees, advisors, etc.)"
    },
    "governing_law": {
      "type": "string",
      "default": "Singapore",
      "enum": ["Singapore", "Delaware", "England-Wales", "Switzerland", "California", "New-York"]
    }
  }
}
```

### Key implementation notes
- NO `agent_id` field — both parties are human
- Signing: both parties receive email magic link via Privy adapter
- NDA type controls prompt logic: mutual = symmetric clauses; one-way = asymmetric
- Standard exclusions auto-included: public domain, prior knowledge, compelled disclosure (court order), independent development

---

## p2 — Freelance Service Agreement

**Slug:** `p2-freelance`
**Name:** Freelance Service Agreement (P2P)
**Description:** Client engages freelancer for defined deliverables with milestones, payment terms, and IP ownership clause. Both parties sign via email magic link. Structured with reference to UETA/ESIGN and eIDAS Art. 25.

**Price:** 50 cents ($0.50)

### Parameter Schema

```json
{
  "type": "object",
  "required": [
    "client_name",
    "client_email",
    "freelancer_name",
    "freelancer_email",
    "service_description",
    "deliverables",
    "total_price",
    "currency",
    "payment_terms",
    "ip_ownership",
    "governing_law"
  ],
  "properties": {
    "client_name": {
      "type": "string",
      "description": "Full legal name of the client"
    },
    "client_email": {
      "type": "string",
      "format": "email"
    },
    "freelancer_name": {
      "type": "string",
      "description": "Full legal name of the freelancer"
    },
    "freelancer_email": {
      "type": "string",
      "format": "email"
    },
    "service_description": {
      "type": "string",
      "description": "What the freelancer will do"
    },
    "deliverables": {
      "type": "array",
      "items": { "type": "string" },
      "description": "List of specific deliverables"
    },
    "milestones": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "description": { "type": "string" },
          "amount": { "type": "number" },
          "deadline": { "type": "string", "format": "date" }
        }
      },
      "description": "Payment milestones with amounts and deadlines"
    },
    "total_price": {
      "type": "number",
      "description": "Total contract value"
    },
    "currency": {
      "type": "string",
      "enum": ["USD", "EUR", "GBP", "SGD", "USDC"],
      "default": "USD"
    },
    "payment_terms": {
      "type": "string",
      "description": "When and how payment is made (e.g., 'net 30', 'on delivery', 'milestone-based')"
    },
    "ip_ownership": {
      "type": "string",
      "enum": ["client", "freelancer", "shared"],
      "description": "Who owns the IP created under this contract"
    },
    "revision_rounds": {
      "type": "integer",
      "default": 2,
      "description": "Number of revision rounds included in the price"
    },
    "late_payment_penalty_percent": {
      "type": "number",
      "default": 1.5,
      "description": "Monthly late payment interest rate (%)"
    },
    "governing_law": {
      "type": "string",
      "default": "Singapore",
      "enum": ["Singapore", "Delaware", "England-Wales", "Switzerland", "California", "New-York"]
    }
  }
}
```

### Key implementation notes
- IP clause is MANDATORY — most freelance disputes center on IP ownership
- Milestones array enables escrow-style payment (future feature)
- If `ip_ownership` = "client", prompt must include work-for-hire doctrine reference (US) or assignment clause (UK/EU)
- If `ip_ownership` = "freelancer", prompt must include perpetual license grant to client for delivered work
- If `ip_ownership` = "shared", prompt must define scope of each party's rights

---

## p3 — Rental / P2P Settlement

**Slug:** `p3-rental-settlement`
**Name:** Rental Agreement or P2P Settlement
**Description:** Dual-mode template: (1) short-term rental with deposit and notice period, or (2) settlement agreement between two parties resolving a dispute. Mode detected from parameters. Both parties sign via email magic link.

**Price:** 50 cents ($0.50)

### Parameter Schema (dual-mode)

```json
{
  "type": "object",
  "required": [
    "mode",
    "party_a_name",
    "party_a_email",
    "party_b_name",
    "party_b_email",
    "governing_law"
  ],
  "properties": {
    "mode": {
      "type": "string",
      "enum": ["rental", "settlement"],
      "description": "Contract mode: 'rental' for property/equipment rental; 'settlement' for dispute resolution"
    },
    "party_a_name": { "type": "string", "description": "Landlord (rental) or First party (settlement)" },
    "party_a_email": { "type": "string", "format": "email" },
    "party_b_name": { "type": "string", "description": "Tenant (rental) or Second party (settlement)" },
    "party_b_email": { "type": "string", "format": "email" },

    "property_description": { "type": "string", "description": "Rental mode: what is being rented" },
    "rent_amount": { "type": "number", "description": "Rental mode: monthly/periodic rent" },
    "deposit_amount": { "type": "number", "description": "Rental mode: security deposit" },
    "currency": { "type": "string", "enum": ["USD", "EUR", "GBP", "SGD", "USDC"], "default": "USD" },
    "term_months": { "type": "integer", "description": "Rental mode: duration" },
    "notice_period_days": { "type": "integer", "default": 30, "description": "Rental mode: early termination notice" },

    "settlement_description": { "type": "string", "description": "Settlement mode: what dispute is being resolved" },
    "settlement_amount": { "type": "number", "description": "Settlement mode: payment amount" },
    "payment_deadline": { "type": "string", "format": "date", "description": "Settlement mode: when payment is due" },
    "confidentiality": { "type": "boolean", "default": false, "description": "Settlement mode: whether terms are confidential" },
    "mutual_release": { "type": "boolean", "default": true, "description": "Settlement mode: both parties release all claims" },

    "governing_law": {
      "type": "string",
      "default": "Singapore",
      "enum": ["Singapore", "Delaware", "England-Wales", "Switzerland", "California", "New-York"]
    }
  }
}
```

### Key implementation notes
- `mode` field determines which parameters are required
  - Rental mode requires: property_description, rent_amount, deposit_amount, term_months
  - Settlement mode requires: settlement_description, settlement_amount, payment_deadline
- LLM prompt detects mode and generates appropriate legal structure
- Rental: include deposit return conditions, maintenance responsibilities, early termination
- Settlement: include mutual release clause (if enabled), payment terms, binding nature, no-admission clause
- Both modes: IETF ADP dispute resolution + signature block

---

## Implementation Checklist (for the autonomous dev agent)

- [ ] SQL INSERTs for p1, p2, p3 in seed-data.ts (after a1-a3)
- [ ] Category = "peer" for all three
- [ ] parameter_schema valid JSON Schema draft-7
- [ ] LLM prompts in prompts.ts start with `${BASE_INSTRUCTIONS}`
- [ ] NO agent_id required in any C2C template — both parties identified by email
- [ ] Privy/magic-link signing path must work for both parties
- [ ] pricing.ts: 500000n ($0.50 USDC) for each
- [ ] p3 dual-mode: prompt handles both rental and settlement correctly based on `mode` param
- [ ] p2 IP clause: covers all 3 ip_ownership options with correct legal language per jurisdiction
- [ ] Tests verify: prompts non-empty, contain mandatory elements, handle both p3 modes

---

## File references

Same as A2C-TEMPLATE-SPEC.md, plus:
- `docs/LEGAL-RESEARCH-US-UK-SINGAPORE.md` — IP ownership, UCC, agency law
- `docs/LEGAL-RESEARCH-RICARDIAN-STANDARDS.md` — dual-format requirements
