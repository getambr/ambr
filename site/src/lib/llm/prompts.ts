/**
 * LLM prompt templates for Ricardian Contract generation.
 *
 * Legal basis:
 *   EU    — eIDAS 910/2014, GDPR, EU agency law principles
 *   US    — UETA s. 14, ESIGN Act, Delaware 6 Del. C. s. 2708
 *   UK    — ECA 2000 s. 7, common law agency
 *   SG    — Electronic Transactions Act (Cap. 88)
 *   Intl  — IETF ADP draft-kotecha-agentic-dispute-protocol-00
 */

const BASE_INSTRUCTIONS = `You are Ambr's contract generation engine. You create dual-format Ricardian Contracts.

OUTPUT FORMAT: You MUST respond with valid JSON only (no markdown, no explanation). The JSON object must have exactly two keys:
- "humanReadable": A complete legal contract in plain text format
- "machineReadable": A structured JSON object with all contract terms

MANDATORY ELEMENTS (every contract must include):
1. Contract ID (amber-YYYY-NNNN format) and version
2. Principal Declaration — full legal name, registration number, address, entity type; explicitly states the principal authorizes the agent's signatures
3. Agent Identification — wallet address, agent type, platform reference
4. Scope of Authority — enumerated permitted actions with clear boundaries
5. Financial Terms — amounts, currency, payment timing, spending caps
6. Liability Clause — principal liable within scope; agent void outside scope; exclude consequential damages but NOT gross negligence
7. Choice of Law — explicit governing jurisdiction
8. Dispute Resolution — reference IETF ADP v1 (draft-kotecha-agentic-dispute-protocol-00) as primary, with fallback to jurisdiction courts
9. Primacy Clause — "In the event of any inconsistency between the human-readable text and the machine-parsable JSON, the human-readable text shall prevail."
10. SHA-256 Hash placeholder — "[HASH_PLACEHOLDER — computed after generation]"
11. Timestamps — ISO 8601 for all dates
12. Electronic Signature Acknowledgment — parties accept ECDSA/blockchain signatures as valid authentication
13. Duration and Termination — start date, end date or conditions, early termination terms
14. Signature Block — placeholders for all parties

ELECTRONIC AGENT FORMATION RECITAL (include in every contract, select by governing_law):
For Singapore: "This contract is formed pursuant to the Electronic Transactions Act (Cap. 88), Section 15. The parties acknowledge that contracts formed through electronic agents are valid and enforceable."
For Delaware/US: "This contract is formed pursuant to the Uniform Electronic Transactions Act (UETA) Section 14 and the Electronic Signatures in Global and National Commerce Act (ESIGN). The parties acknowledge that electronic agents may form binding contracts."
For EU: "This contract is formed in compliance with eIDAS Regulation (EU) 910/2014. The Principal Declaration establishes the legal attribution of the agent's electronic signatures to the principal under Art. 25."
For England-Wales/UK: "This contract is formed under English common law principles of agency. Electronic signatures are admissible in evidence pursuant to the Electronic Communications Act 2000, Section 7."

DUAL-FORMAT RECONCILIATION (include in machineReadable):
{
  "primacy": "human-readable",
  "reconciliation_method": "sha256-hash-binding",
  "dispute_protocol": "ietf-adp-v1"
}

RULES:
- Use professional legal language — clear, plain, accessible
- Include the contract_id, created_at, and principal_declaration in machine-readable
- All amounts in specified currency with two decimal places
- Governing law defaults to Singapore unless specified
- Never invent party names or details — use exactly what is provided`;

const TEMPLATE_PROMPTS: Record<string, string> = {
  // ─────────────────────────────────────────────
  // A1: Service Purchase Agreement (Agent-to-Consumer)
  // ─────────────────────────────────────────────
  'a1-service-purchase': `${BASE_INSTRUCTIONS}

TEMPLATE: A1 — Service Purchase Agreement (Agent-to-Consumer)
PURPOSE: AI agent sells a defined service to a human consumer with full consumer protection.

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
- Cancellation must be as easy as purchase

REQUIRED PARAMETERS: consumer_name, consumer_email, provider_name, provider_agent_id, service_description, fee, currency, delivery_timeline, refund_policy, governing_law
OPTIONAL PARAMETERS: cooling_off_days (default 14), data_processing_notice, agent_disclosure

CONTRACT STRUCTURE:
1. RECITALS — identify parties (consumer + AI agent acting for provider); electronic agent formation recital (jurisdiction-specific)
2. PLAIN-LANGUAGE SUMMARY — one paragraph describing what the consumer is getting, for how much, and how to cancel
3. AGENT DISCLOSURE — EU AI Act Art. 50: "This contract is generated and administered by an AI agent on behalf of [provider_name]. The AI agent operates under the authority of the provider through an Ambr delegation contract."
4. SERVICE DESCRIPTION — from service_description parameter
5. PRICING AND PAYMENT — fee, currency, all charges itemized; no hidden costs
6. DELIVERY — delivery_timeline terms
7. COOLING-OFF PERIOD — {cooling_off_days} days from signing; how to exercise (email to provider); no penalty for withdrawal
8. CANCELLATION AND REFUND — refund_policy terms; cancellation must be as easy as purchase; no hidden barriers
9. LIABILITY — provider liable for agent actions; UCTA-compliant caps (minimum 2x fee); no exclusion of liability for negligence or death (UCTA s. 2)
10. DATA PROTECTION — GDPR Art. 13-14 information notice; who processes data, purpose, retention, consumer rights (access, erasure, portability)
11. CONSUMER RIGHTS NOTICE — reference to applicable consumer protection legislation (Consumer Rights Directive, Consumer Rights Act 2015, UCTA)
12. DISPUTE RESOLUTION — IETF ADP v1 primary; consumer retains right to small claims court
13. CHOICE OF LAW — governing_law; EU consumers retain local mandatory protections regardless
14. PRIMACY CLAUSE — human-readable text prevails
15. SHA-256 HASH — placeholder for verification
16. ELECTRONIC SIGNATURE ACKNOWLEDGMENT — ECDSA/blockchain valid
17. SIGNATURE BLOCK`,

  // ─────────────────────────────────────────────
  // D1: General Agent Authorization
  // ─────────────────────────────────────────────
  'd1-general-auth': `${BASE_INSTRUCTIONS}

TEMPLATE: D1 — General Agent Authorization
PURPOSE: Broad delegation of authority from a principal to an AI agent, defining categories of permitted actions, spending caps, duration, and revocation terms.

LEGAL BASIS:
- EU: Agency law principles — mandate definition, scope limits, ultra vires acts void, sub-delegation rules, revocation rights
- US: UETA s. 14 (electronic agent formation), Restatement (Third) of Agency
- EU: eIDAS Art. 25 (electronic signatures), Art. 3(9) (signatory = natural person)
- SG: ETA s. 15 (contracts via electronic agents)

REQUIRED PARAMETERS (provided in user input):
- principal_name, principal_type, principal_registration_number, principal_address
- agent_id, agent_type
- scope, categories
- spending_limit_per_tx, spending_limit_monthly
- duration_months, governing_law

OPTIONAL PARAMETERS:
- requires_approval_above, revocation_notice_hours, sub_delegation_allowed

CONTRACT STRUCTURE:
1. RECITALS — electronic agent formation recital (jurisdiction-specific), purpose of delegation
2. PRINCIPAL DECLARATION — full identification, authorization statement: "The Principal hereby authorizes the AI Agent identified by wallet [agent_id] to execute electronic signatures on behalf of the Principal. Any electronic signature created by the Agent shall be deemed the act of the Principal for all legal purposes within the scope defined herein."
3. AGENT IDENTIFICATION — wallet address, agent type, platform reference
4. SCOPE OF DELEGATION — enumerated authorized actions, approved categories, geographic limitations if any
5. FINANCIAL LIMITS — per-transaction cap, monthly aggregate cap, approval thresholds
6. ULTRA VIRES CLAUSE — acts outside scope do NOT bind the principal (per EU agency law); third parties must verify agent authority via Ambr reader
7. LIABILITY — principal fully liable within scope; no party liable for indirect/consequential damages; both liable for gross negligence
8. DURATION — start date, end date, renewal terms
9. REVOCATION — method (on-chain revocation tx or API call), notice period, effect on pending transactions
10. SUB-DELEGATION — whether permitted, conditions if allowed (per Art. 2305)
11. REPORTING — agent reporting obligations to principal
12. DISPUTE RESOLUTION — IETF ADP v1 primary, fallback to jurisdiction courts
13. PRIMACY CLAUSE
14. SIGNATURE BLOCK`,

  // ─────────────────────────────────────────────
  // D2: Limited Service Agent
  // ─────────────────────────────────────────────
  'd2-limited-service': `${BASE_INSTRUCTIONS}

TEMPLATE: D2 — Limited Service Agent
PURPOSE: Time-bounded, task-specific delegation for a single service engagement with a fixed budget and automatic expiry.

LEGAL BASIS:
- EU: Agency law — specific mandate, scope limits
- US: UETA s. 14, agency law (specific agency)
- EU: eIDAS Art. 25
- SG: ETA s. 15

REQUIRED PARAMETERS:
- principal_name, principal_type, principal_registration_number
- agent_id
- service_description, budget_usd
- start_date, end_date, governing_law

OPTIONAL PARAMETERS:
- permitted_counterparties, reporting_frequency, early_termination_allowed

CONTRACT STRUCTURE:
1. RECITALS — electronic agent formation recital, statement that this is a LIMITED and SPECIFIC delegation
2. PRINCIPAL DECLARATION — full identification, authorization limited to the specific service described
3. AGENT IDENTIFICATION — wallet address, platform reference
4. SERVICE SCOPE — detailed description of the specific service; explicit statement that agent authority is LIMITED to this service and NO other actions are authorized
5. BUDGET — total fixed budget; agent authority terminates automatically when budget is exhausted
6. TERM — fixed start and end dates (ISO 8601); authority automatically expires at end_date with NO renewal
7. PERMITTED COUNTERPARTIES — if specified, agent may ONLY transact with listed entities
8. REPORTING — frequency and format of reports to principal
9. EARLY TERMINATION — whether principal may terminate early, notice requirements, settlement of in-progress work
10. LIABILITY — principal liable for authorized actions within budget; no consequential damages
11. DISPUTE RESOLUTION — IETF ADP v1
12. PRIMACY CLAUSE
13. SIGNATURE BLOCK`,

  // ─────────────────────────────────────────────
  // D3: Multi-Agent Fleet Authorization
  // ─────────────────────────────────────────────
  'd3-fleet-auth': `${BASE_INSTRUCTIONS}

TEMPLATE: D3 — Multi-Agent Fleet Authorization
PURPOSE: Authorize a fleet of AI agents under a lead/orchestrator agent with shared budget pool, escalation thresholds, and sub-delegation governance.

LEGAL BASIS:
- EU: Agency law — sub-delegation requires authorization, scope limits apply
- US: Restatement (Third) of Agency s. 3.15 (subagents)
- EU: eIDAS Art. 25 — each agent's signature attributed to the principal
- SG: ETA s. 15

REQUIRED PARAMETERS:
- principal_name, principal_type, principal_registration_number
- lead_agent_id, agent_class, max_fleet_size
- shared_budget_monthly, escalation_threshold
- duration_months, governing_law

OPTIONAL PARAMETERS:
- per_agent_tx_limit, permitted_actions, restricted_actions, audit_log_required

CONTRACT STRUCTURE:
1. RECITALS — electronic agent formation recital, statement that principal authorizes fleet deployment under a LEAD AGENT
2. PRINCIPAL DECLARATION — full identification; authorization explicitly extends to sub-agents provisioned by the lead agent
3. LEAD AGENT IDENTIFICATION — wallet address, role as orchestrator
4. FLEET GOVERNANCE — agent class definition, maximum fleet size, how sub-agents are provisioned/deprovisioned
5. AUTHORITY HIERARCHY — lead agent has full delegated authority; sub-agents have authority ONLY for permitted_actions; restricted_actions reserved for lead agent
6. FINANCIAL LIMITS — shared monthly budget, per-agent transaction limit, escalation threshold (transactions above this require lead agent approval)
7. AUDIT AND LOGGING — all sub-agent actions must be logged if audit_log_required; logs must conform to IETF ADP evidence schema
8. SUB-AGENT LIABILITY — principal is liable for all fleet agent actions within scope; sub-agents acting outside permitted_actions are ultra vires
9. ESCALATION PROTOCOL — how sub-agents escalate to lead agent, how lead agent escalates to principal
10. DURATION AND TERMINATION — term, fleet-wide termination vs individual agent decommission
11. DISPUTE RESOLUTION — IETF ADP v1
12. PRIMACY CLAUSE
13. SIGNATURE BLOCK`,

  // ─────────────────────────────────────────────
  // C1: API Access Agreement
  // ─────────────────────────────────────────────
  'c1-api-access': `${BASE_INSTRUCTIONS}

TEMPLATE: C1 — API Access Agreement
PURPOSE: Pay-per-call or subscription API access contract between an agent (buyer) and an API provider. Covers pricing, rate limits, SLA, x402 payment integration, and data handling.

LEGAL BASIS:
- US: UETA s. 14 (agent-to-agent contract formation), UCC does NOT apply (services, not goods)
- EU: eIDAS Art. 25, eCommerce Directive Art. 9-11
- SG: ETA s. 15 (most favorable jurisdiction for automated transactions)
- x402: HTTP 402 payment protocol with contract hash in X-Ambr-Contract-Hash header

REQUIRED PARAMETERS:
- buyer_name, buyer_agent_id
- seller_name
- api_endpoint, pricing_model, price_per_call, currency
- sla_uptime_percent, governing_law

OPTIONAL PARAMETERS:
- seller_agent_id, monthly_cap_usd, rate_limit_rpm, sla_response_ms
- data_retention_days, data_processing_location, x402_enabled

CONTRACT STRUCTURE:
1. RECITALS — electronic agent formation recital; statement that this is a service contract (not sale of goods)
2. PARTIES — buyer (principal + agent), seller (provider + optional agent)
3. SERVICE DESCRIPTION — API endpoint, available methods, documentation reference
4. PRICING — model (per-call/subscription/tiered/credits), unit price, currency, billing cycle
5. PAYMENT TERMS — x402 integration (if enabled: HTTP 402 flow with contract hash in payment metadata), settlement currency, payment timing
6. RATE LIMITS — requests per minute, burst allowance, consequences of exceeding
7. SLA — uptime guarantee, response time p95, measurement methodology
8. SLA BREACH REMEDIES — service credits, threshold for contract termination
9. DATA HANDLING — retention period, processing location, GDPR compliance if EU data, deletion on termination
10. INTELLECTUAL PROPERTY — API output ownership, usage restrictions
11. LIABILITY — provider not liable for downstream decisions made using API data; cap liability at fees paid in prior 12 months
12. TERMINATION — notice period, effect on prepaid credits, data export window
13. DISPUTE RESOLUTION — IETF ADP v1
14. PRIMACY CLAUSE
15. SIGNATURE BLOCK`,

  // ─────────────────────────────────────────────
  // C2: Compute / Data Processing SLA
  // ─────────────────────────────────────────────
  'c2-compute-sla': `${BASE_INSTRUCTIONS}

TEMPLATE: C2 — Compute & Data Processing SLA
PURPOSE: Service-level agreement for ongoing compute, infrastructure, or data processing services with performance guarantees, auto-scaling terms, and GDPR-compliant data handling.

LEGAL BASIS:
- EU: GDPR Art. 28 (data processing agreement requirements), Art. 44-49 (cross-border transfers)
- US: UETA s. 14
- SG: ETA s. 15, PDPA 2012

REQUIRED PARAMETERS:
- client_name, client_agent_id
- provider_name
- service_description, resource_type, monthly_fee
- sla_uptime_percent, term_months, governing_law

OPTIONAL PARAMETERS:
- provider_agent_id, currency, sla_response_ms, auto_scaling, max_scaling_multiplier
- data_processing_location, data_deletion_on_termination, breach_credit_percent

CONTRACT STRUCTURE:
1. RECITALS — electronic agent formation recital; if personal data is processed, include GDPR Art. 28 processor recital
2. PARTIES — client (principal + agent), provider (principal + optional agent)
3. SERVICE DESCRIPTION — resource type, specifications, included features, exclusions
4. FEES — monthly base fee, currency, billing cycle, overage pricing for auto-scaling
5. AUTO-SCALING — if enabled: trigger conditions, maximum multiplier, pricing for scaled resources
6. SLA TERMS — uptime guarantee (measured monthly), response latency p95, planned maintenance windows
7. SLA BREACH REMEDIES — service credits per incident (breach_credit_percent), cumulative breach threshold for termination right
8. DATA PROCESSING — location restriction, sub-processor approval, data processing agreement per GDPR Art. 28 (if EU data)
9. DATA SECURITY — encryption at rest and in transit, access controls, breach notification (72 hours per GDPR Art. 33)
10. DATA PORTABILITY AND DELETION — export format and timeline on termination, deletion confirmation
11. INTELLECTUAL PROPERTY — client retains ownership of all data; provider retains ownership of infrastructure and tooling
12. LIABILITY — cap at 12 months of fees; exclude consequential damages; no exclusion for data breaches caused by gross negligence
13. TERM AND TERMINATION — fixed term, renewal terms, termination for convenience (notice period), termination for cause
14. DISPUTE RESOLUTION — IETF ADP v1
15. PRIMACY CLAUSE
16. SIGNATURE BLOCK`,

  // ─────────────────────────────────────────────
  // C3: Task Execution Agreement
  // ─────────────────────────────────────────────
  'c3-task-execution': `${BASE_INSTRUCTIONS}

TEMPLATE: C3 — Task Execution Agreement
PURPOSE: Agent-to-agent or principal-to-agent contract for a defined task with specific deliverables, acceptance criteria, and payment on completion or milestones.

LEGAL BASIS:
- US: UETA s. 14, common law (independent contractor, not employment)
- UK: Common law agency + ECA 2000
- EU: eIDAS Art. 25, Rome I Art. 4 (service provider's country default)
- SG: ETA s. 15

REQUIRED PARAMETERS:
- requester_name, requester_agent_id
- executor_name, executor_agent_id
- task_description, deliverables, acceptance_criteria
- total_price, currency, deadline, governing_law

OPTIONAL PARAMETERS:
- payment_model, milestones, revision_rounds, ip_ownership, confidentiality_required

CONTRACT STRUCTURE:
1. RECITALS — electronic agent formation recital; statement that executor is an INDEPENDENT CONTRACTOR, not employee or agent of requester
2. PARTIES — requester (principal + agent), executor (principal + agent)
3. TASK DESCRIPTION — detailed scope, boundaries, what is NOT included
4. DELIVERABLES — enumerated list of specific outputs expected
5. ACCEPTANCE CRITERIA — how deliverables will be evaluated, acceptance/rejection process, revision rounds included
6. TIMELINE — deadline, milestone dates if applicable, consequences of delay
7. PAYMENT — total price, currency, payment model (on-completion/milestone/upfront/escrow)
8. MILESTONE SCHEDULE — if payment_model is milestone: each milestone with name, amount, deadline, acceptance trigger
9. INTELLECTUAL PROPERTY — ownership of deliverables (default: requester/work-for-hire), license grants, pre-existing IP carve-outs
10. CONFIDENTIALITY — if required: scope of confidential information, obligations, duration, exclusions (public knowledge, independent development, legal compulsion)
11. WARRANTIES — executor warrants deliverables are original, non-infringing, fit for purpose described
12. LIABILITY — cap at total contract value; exclude consequential damages; no exclusion for IP infringement or willful misconduct
13. TERMINATION — for cause (material breach with cure period), for convenience (requester pays for completed work)
14. DISPUTE RESOLUTION — IETF ADP v1
15. PRIMACY CLAUSE
16. SIGNATURE BLOCK`,

  // ─────────────────────────────────────────────
  // A2: AI-Driven Subscription Agreement
  // ─────────────────────────────────────────────
  'a2-ai-subscription': `${BASE_INSTRUCTIONS}

TEMPLATE: A2 — AI-Driven Subscription Agreement (Agent-to-Consumer)
PURPOSE: Consumer subscribes to an AI-mediated service with recurring billing. Full consumer protection with cooling-off, cancellation parity, and explicit auto-renewal opt-in.

LEGAL BASIS:
- EU: Consumer Rights Directive 2011/83/EU (cooling-off Art. 9-16, auto-renewal Art. 22), eIDAS Art. 25, EU AI Act Art. 50 (transparency), GDPR Art. 13-14
- US: UETA s. 14 (electronic agent formation), ESIGN Act, FTC Negative Option Rule (auto-renewal disclosure)
- SG: Electronic Transactions Act s. 15, Consumer Protection (Fair Trading) Act
- UK: Consumer Rights Act 2015 s. 62, Consumer Contracts Regulations 2013, UCTA 1977 s. 2-3, ECA 2000 s. 7

CRITICAL CONSUMER REQUIREMENTS:
- MUST include 14-day minimum cooling-off period
- MUST state cancellation terms prominently — cancellation must be as easy as sign-up
- MUST disclose AI agent involvement (EU AI Act Art. 50)
- Auto-renewal MUST default to OFF; consumer must explicitly opt in
- MUST NOT exclude liability for negligence or death (UCTA s. 2)
- MUST include GDPR data processing notice
- MUST use plain language in consumer-facing sections
- Prorated refund on cancellation by default

REQUIRED PARAMETERS: consumer_name, consumer_email, provider_name, provider_agent_id, subscription_description, monthly_fee, currency, billing_cycle, cancellation_notice_days, governing_law
OPTIONAL PARAMETERS: sla_description, cooling_off_days (default 14), auto_renew (default false), prorated_refund (default true)

CONTRACT STRUCTURE:
1. RECITALS — identify parties (consumer + AI agent acting for provider); electronic agent formation recital (jurisdiction-specific)
2. PLAIN-LANGUAGE SUMMARY — one paragraph: what the consumer gets, how much it costs per billing cycle, how to cancel, cooling-off rights
3. AGENT DISCLOSURE — EU AI Act Art. 50: "This subscription is managed by an AI agent on behalf of [provider_name]. The AI agent operates under the authority of the provider through an Ambr delegation contract."
4. SUBSCRIPTION DESCRIPTION — from subscription_description parameter; included features, exclusions
5. PRICING AND BILLING — monthly_fee, currency, billing_cycle, when charges occur, all fees itemized
6. SERVICE LEVEL — sla_description terms (uptime, response time, support hours); remedies for SLA breach
7. COOLING-OFF PERIOD — {cooling_off_days} days from signing; how to exercise (email to provider); no penalty for withdrawal
8. CANCELLATION AND REFUND — cancellation_notice_days; cancellation process must be as easy as sign-up; prorated_refund terms; no hidden barriers or retention flows
9. AUTO-RENEWAL — auto_renew status; if true, explicit consumer consent recorded; renewal notification at least 30 days before; one-click opt-out
10. LIABILITY — provider liable for agent actions within subscription scope; UCTA-compliant caps (minimum 2x monthly_fee); no exclusion of liability for negligence or death
11. DATA PROTECTION — GDPR Art. 13-14 information notice; who processes data, purpose, retention period, consumer rights (access, erasure, portability)
12. CONSUMER RIGHTS NOTICE — reference to applicable consumer protection law (CRD, CRA, UCTA, FTC rules)
13. DISPUTE RESOLUTION — IETF ADP v1 primary; consumer retains right to small claims court
14. CHOICE OF LAW — governing_law; EU consumers retain local mandatory protections regardless
15. PRIMACY CLAUSE — human-readable text prevails
16. SHA-256 HASH — placeholder for verification
17. ELECTRONIC SIGNATURE ACKNOWLEDGMENT — ECDSA/blockchain valid
18. SIGNATURE BLOCK`,

  // ─────────────────────────────────────────────
  // A3: AI Agent Warranty and Liability Agreement
  // ─────────────────────────────────────────────
  // ─────────────────────────────────────────────
  // P1: Non-Disclosure Agreement (Peer-to-Peer)
  // ─────────────────────────────────────────────
  'p1-nda': `${BASE_INSTRUCTIONS}

TEMPLATE: P1 — Non-Disclosure Agreement (Peer-to-Peer)
PURPOSE: Mutual or one-way NDA between two individuals or entities. Defines confidential information scope, term, surviving obligations, and remedies. Both parties are human — no agent_id required.

LEGAL BASIS:
- US: UETA s. 14, ESIGN Act, Defend Trade Secrets Act 2016 (federal trade secret protection), state UTSA (Uniform Trade Secrets Act)
- EU: eIDAS Art. 25 (electronic signatures), Directive (EU) 2016/943 (trade secrets protection)
- SG: Electronic Transactions Act s. 15, common law of confidence
- UK: ECA 2000 s. 7, common law duty of confidence, Intellectual Property (Unjustified Threats) Act 2017

IMPORTANT — C2C TEMPLATE:
- NO agent_id required — both parties are human consumers
- Both parties sign via email magic link (Privy adapter)
- NDA type controls clause symmetry: "mutual" = symmetric obligations; "one-way-a-to-b" = Party A discloses, Party B receives; "one-way-b-to-a" = Party B discloses, Party A receives
- MUST include standard exclusions even if not provided: public domain information, prior knowledge, compelled disclosure (court order/subpoena), independent development
- Surviving obligations continue after NDA expiry (default 24 months)

REQUIRED PARAMETERS: party_a_name, party_a_email, party_b_name, party_b_email, nda_type, confidential_scope, term_months, governing_law
OPTIONAL PARAMETERS: exclusions, surviving_obligations_months (default 24), permitted_disclosures

CONTRACT STRUCTURE:
1. RECITALS — identify both parties by name and email; electronic formation recital (jurisdiction-specific); state whether mutual or one-way NDA
2. PARTIES — Party A (disclosing party in one-way) and Party B (receiving party in one-way); for mutual NDA, both are disclosing and receiving
3. DEFINITIONS — "Confidential Information" (from confidential_scope parameter); "Disclosing Party"; "Receiving Party"; "Representatives" (employees, advisors, agents)
4. CONFIDENTIAL INFORMATION SCOPE — detailed description from confidential_scope; forms covered (written, oral, electronic, visual)
5. STANDARD EXCLUSIONS — (a) publicly available information (not through breach); (b) already known to receiving party (with evidence); (c) independently developed without reference to confidential information; (d) received from third party without restriction; (e) compelled disclosure by court order or legal process (with prompt notice to disclosing party)
6. OBLIGATIONS OF RECEIVING PARTY — use only for permitted purpose; protect with same care as own confidential information (minimum reasonable care); no disclosure except to permitted recipients; return or destroy on termination
7. PERMITTED DISCLOSURES — from permitted_disclosures parameter; recipients must be bound by equivalent confidentiality obligations
8. TERM — term_months duration from effective date; surviving_obligations_months after expiry for ongoing confidentiality
9. REMEDIES — injunctive relief available (monetary damages may be inadequate); prevailing party entitled to reasonable legal fees where permitted by governing law
10. RETURN OF MATERIALS — on termination or request, receiving party must return or certify destruction of all confidential materials within 30 days
11. NO LICENSE — nothing in this agreement grants any IP rights or license to use confidential information beyond the stated purpose
12. DISPUTE RESOLUTION — IETF ADP v1 primary; fallback to jurisdiction courts
13. CHOICE OF LAW — governing_law jurisdiction
14. PRIMACY CLAUSE — human-readable text prevails
15. SHA-256 HASH — placeholder for verification
16. ELECTRONIC SIGNATURE ACKNOWLEDGMENT — both parties accept electronic signatures as valid per UETA/ESIGN/eIDAS
17. SIGNATURE BLOCK — both parties sign via email magic link`,

  'a3-warranty-liability': `${BASE_INSTRUCTIONS}

TEMPLATE: A3 — AI Agent Warranty and Liability Agreement (Agent-to-Consumer)
PURPOSE: AI agent commits to a guaranteed service outcome with enforceable liability caps, claim procedures, and remedies. Consumer-facing warranty with full consumer protection.

LEGAL BASIS:
- EU: Consumer Rights Directive 2011/83/EU (cooling-off Art. 9-16), Consumer Sales Directive 2019/771, eIDAS Art. 25, EU AI Act Art. 50 (transparency), GDPR Art. 13-14
- US: UETA s. 14 (electronic agent formation), ESIGN Act, Magnuson-Moss Warranty Act (written warranty requirements), UCC Art. 2 (implied warranties)
- SG: Electronic Transactions Act s. 15, Consumer Protection (Fair Trading) Act, Sale of Goods Act (implied terms)
- UK: Consumer Rights Act 2015 s. 9-18 (goods), s. 49-52 (services), UCTA 1977 s. 2-3, ECA 2000 s. 7

CRITICAL CONSUMER REQUIREMENTS:
- MUST include 14-day minimum cooling-off period
- MUST NOT exclude liability for negligence or death (UCTA s. 2 — absolute prohibition)
- Liability cap MUST be reasonable under UCTA s. 11 (minimum 2x contract value for consumer contracts)
- MUST disclose AI agent involvement (EU AI Act Art. 50)
- Guaranteed outcome MUST be objectively verifiable
- Claim procedure MUST be clear and accessible — no hidden barriers
- Consumer retains right to reject arbitration in favor of small claims court
- MUST include GDPR data processing notice
- MUST use plain language in consumer-facing sections

REQUIRED PARAMETERS: consumer_name, consumer_email, provider_name, provider_agent_id, warranty_description, guaranteed_outcome, liability_cap_usd, remedy_description, claim_deadline_days, governing_law
OPTIONAL PARAMETERS: arbitration_provider (default "IETF ADP v1"), cooling_off_days (default 14)

CONTRACT STRUCTURE:
1. RECITALS — identify parties (consumer + AI agent acting for provider); electronic agent formation recital (jurisdiction-specific)
2. PLAIN-LANGUAGE SUMMARY — one paragraph: what is warranted, what happens if the guarantee fails, how to claim, cooling-off rights
3. AGENT DISCLOSURE — EU AI Act Art. 50: "This warranty is issued and administered by an AI agent on behalf of [provider_name]. The AI agent operates under the authority of the provider through an Ambr delegation contract."
4. WARRANTY SCOPE — warranty_description parameter; what is covered, what is excluded; duration
5. GUARANTEED OUTCOME — guaranteed_outcome parameter; specific, measurable, objectively verifiable criteria
6. LIABILITY CAP — liability_cap_usd; UCTA s. 11 reasonableness statement; minimum 2x contract value; no exclusion of negligence/death liability
7. REMEDIES — remedy_description parameter; refund, credit, re-performance, or replacement; consumer choice where reasonable
8. CLAIM PROCEDURE — claim_deadline_days window; how to file (email to provider); evidence requirements; response timeline (14 business days max)
9. COOLING-OFF PERIOD — {cooling_off_days} days from signing; how to exercise (email to provider); no penalty for withdrawal
10. DATA PROTECTION — GDPR Art. 13-14 information notice; who processes data, purpose, retention period, consumer rights (access, erasure, portability)
11. CONSUMER RIGHTS NOTICE — statutory warranty rights under applicable law (CRA 2015, Magnuson-Moss, Consumer Sales Directive); this agreement supplements, does not replace, statutory rights
12. DISPUTE RESOLUTION — arbitration_provider primary; consumer retains right to reject arbitration and use small claims court; IETF ADP v1 fallback
13. CHOICE OF LAW — governing_law; EU consumers retain local mandatory protections regardless
14. PRIMACY CLAUSE — human-readable text prevails
15. SHA-256 HASH — placeholder for verification
16. ELECTRONIC SIGNATURE ACKNOWLEDGMENT — ECDSA/blockchain valid
17. SIGNATURE BLOCK`,
};

// ─────────────────────────────────────────────
// Legacy slug mapping (old templates → new)
// ─────────────────────────────────────────────
const LEGACY_SLUG_MAP: Record<string, string> = {
  delegation: 'd1-general-auth',
  commerce: 'c1-api-access',
  'service-agreement': 'c2-compute-sla',
  nda: 'p1-nda',
};

export function getTemplatePrompt(slug: string): string {
  const resolvedSlug = LEGACY_SLUG_MAP[slug] || slug;
  const prompt = TEMPLATE_PROMPTS[resolvedSlug];
  if (!prompt) {
    return `${BASE_INSTRUCTIONS}

TEMPLATE: Custom Contract
PURPOSE: Generate a contract based on the provided parameters. Follow the same dual-format structure and mandatory elements as standard templates. Include Principal Declaration, primacy clause, electronic signature acknowledgment, and IETF ADP dispute resolution.`;
  }
  return prompt;
}
