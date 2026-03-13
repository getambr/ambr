# Amber Protocol -- Legal Research Report: AI Agent Contract Enforceability

**Date**: March 3, 2026
**Purpose**: Legal framework analysis for Ricardian Contracts executed by AI agents on behalf of principals
**Jurisdictions**: United States (Delaware primary), United Kingdom, Singapore (secondary)
**Status**: Research document -- not legal advice. Consult qualified counsel before deploying templates.

---

## 1. US Contract Law

### 1.1 Why Delaware

Delaware is the preferred jurisdiction for commercial agreements in the United States:

- **Court of Chancery**: Specialized equity court with expert judges (no juries) handling complex commercial disputes efficiently.
- **Extensive body of precedent**: Over a century of corporate and commercial law decisions. More than 60% of Fortune 500 companies are incorporated in Delaware.
- **Freedom of contract doctrine**: Delaware courts strongly uphold the freedom of parties to contract on their own terms.
- **Choice of law enforceability**: Under 6 Del. C. s. 2708, parties to a contract involving consideration of $100,000 or more may agree that Delaware law governs, even without connection to Delaware.

### 1.2 UCC (Uniform Commercial Code) Applicability

**UCC s. 2-204: Formation in General**

> (1) A contract for sale of goods may be made in any manner sufficient to show agreement, including conduct by both parties which recognizes the existence of such a contract.
> (3) Even though one or more terms are left open a contract for sale does not fail for indefiniteness if the parties have intended to make a contract and there is a reasonably certain basis for giving an appropriate remedy.

**Applicability to Amber**: Most AI agent transactions involve *services* (API calls, compute time, data processing), so **common law applies to most Amber commerce contracts, not the UCC**. The UCC only applies to "goods" (tangible movable property).

**UCC s. 2-201: Statute of Frauds** -- Contracts for sale of goods >= $500 must be in writing. The SHA-256 hash linked to IPFS-stored Ricardian Contract text satisfies this via UETA s. 7.

### 1.3 Consideration Doctrine

- The agent itself does not provide consideration. The principal provides consideration through the agent.
- Micropayments ($0.001 per API call) constitute valid consideration -- courts do not inquire into adequacy.
- **RISK FLAG**: Delegation contracts (unilateral authorization) may lack consideration. **Mitigation**: Frame as bilateral -- principal authorizes AND agent assumes reporting/compliance obligations.

### 1.4 Statute of Frauds

| Category | Must Be Written | Amber Relevance |
|----------|----------------|-----------------|
| Sale of goods >= $500 | YES (UCC s. 2-201) | Commerce templates involving tangible goods |
| Cannot be performed within one year | YES | Delegation contracts with >12-month terms |
| Sale of real property | YES | Generally N/A |
| Suretyship / guaranty | YES | Indemnification clauses may trigger |

Ricardian Contracts on IPFS with SHA-256 hashes and digital signatures satisfy "writing" and "signature" requirements under UETA and ESIGN.

### 1.5 ESIGN Act (15 U.S.C. ss. 7001-7006)

- **s. 7001(a)**: Electronic signatures, contracts, and records cannot be denied legal effect solely because electronic.
- **s. 7006(2) -- "Electronic Agent"**: "a computer program or an electronic or other automated means used independently to initiate an action or respond to electronic records or performances in whole or in part without review or action by an individual at the time of the action or response."
- **s. 7006(5) -- "Electronic Signature"**: "an electronic sound, symbol, or process, attached to or logically associated with a contract or other record and executed or adopted by a person with the intent to sign the record."

The ESIGN definition of "electronic agent" explicitly encompasses AI agents acting independently. The delegation contract must establish that the principal intends for the agent's signatures to bind them.

### 1.6 UETA Section 14 -- THE KEY PROVISION

**UETA s. 14(1)**: "A contract may be formed by the interaction of electronic agents of the parties, even if no individual was aware of or reviewed the electronic agents' actions or the resulting terms and agreements."

**UETA s. 14(2)**: "A contract may be formed by the interaction of an electronic agent and an individual, acting on the individual's own behalf or for another person."

**UETA s. 14(3)**: Substantive law still applies -- all other contract law requirements (consideration, capacity, legality) remain.

**Official Comment 3**: "This section validates contracts formed by machines functioning as electronic agents for parties to a transaction. It negates any claim that a lack of human intent, at the time of contract formation, prevents contract formation."

**RISK FLAGS**:
- UETA applies only to transactions between parties who have **agreed to conduct the transaction electronically** (s. 5(b))
- **New York has NOT adopted UETA** -- uses ESRA instead, which is less explicit about electronic agents

### 1.7 State-Specific Variations

- **Delaware**: Adopted UETA as 6 Del. C. Chapter 12A. 6 Del. C. s. 2708 allows Delaware law choice for contracts >= $100K.
- **California**: Consumer can withdraw electronic consent at any time. CCPA/CPRA data privacy requirements apply.
- **New York**: Uses ESRA, NOT UETA. For NY-governed contracts, rely on federal ESIGN Act.

---

## 2. UK Contract Law

### 2.1 Contract Formation Requirements

1. **Offer**: Clear, definite statement of terms. AI agent's presentation of Ricardian Contract terms can constitute an offer.
2. **Acceptance**: Unqualified assent (mirror image rule, stricter than US).
3. **Consideration**: Some benefit/detriment. Even $0.001 per API call suffices.
4. **Intention to create legal relations**: Presumed in commercial transactions (*Edwards v Skyways Ltd* [1964]).
5. **Certainty of terms**: Dual-format strengthens certainty -- machine-parsable format eliminates ambiguity.
6. **Capacity**: AI agents have no legal personality. Contract is between principals.

**Battle of the Forms**: English law applies "last shot" doctrine (*Butler Machine Tool Co v Ex-Cell-O Corporation* [1979]). Amber should define clear rules for which terms prevail when agents negotiate.

### 2.2 Electronic Communications Act 2000

- **Section 7**: Electronic signatures admissible in evidence for authenticity/integrity.
- Does NOT provide blanket equivalence between electronic and handwritten signatures.
- English law is technology-neutral -- any form of authentication applied with intent to sign can be valid (*Golden Ocean Group Ltd v Salgaocar Mining Industries* [2012]).

### 2.3 UK GDPR / Data Protection Act 2018

**MANDATORY for templates involving personal data**:
- Lawful basis for processing (Art. 6)
- Data processing agreements (Art. 28) if one party is processor
- International data transfer safeguards (Art. 44-49)
- Automated decision-making rights (Art. 22)

Non-compliance: fines up to GBP 17.5 million or 4% of worldwide turnover.

### 2.4 UCTA 1977

- **s. 2(1)**: CANNOT exclude liability for death/personal injury from negligence. Absolute.
- **s. 2(2)**: Other negligence liability excludable only if "reasonable."
- **s. 3**: On standard terms, cannot unreasonably exclude liability or render substantially different performance.

Templates MUST use reasonable caps (e.g., 2x contract value) rather than blanket exclusions.

### 2.5 Consumer Rights Act 2015

Terms in consumer contracts are unfair if they cause significant imbalance to consumer's detriment (s. 62). **Recommendation**: Mark templates as "B2B only" unless consumer-specific templates are developed.

### 2.6 Choice of Law Post-Brexit

Rome I Regulation retained. Parties free to choose governing law. UK overriding mandatory provisions still apply. For B2B between US/UK parties, Delaware is a strong choice.

---

## 3. Agency Law for AI Agents

### 3.1 Can an AI Legally Be an "Agent"?

**US (Restatement Third of Agency)**: An "agent" must be a "person" with legal capacity. AI does not qualify. However, UETA s. 14 and ESIGN s. 7006(2) treat AI as a **tool** of the principal -- the principal is bound by the electronic agent's actions.

**UK (Common Law)**: AI treated as instrument of principal, not agent with fiduciary duties. Principal bound to extent of granted authority.

### 3.2 Authority Types

- **Actual Authority** (Restatement s. 2.01): The Delegation Contract IS the manifestation. Express scope + implied authority to do what's reasonably necessary.
- **Apparent Authority** (s. 2.03): If principal creates appearance of authority, principal bound even if agent exceeded actual authority. **Biggest risk for Amber.**
- **Ratification** (s. 4.01): Principal can ratify unauthorized acts after the fact.

**RISK FLAG -- APPARENT AUTHORITY**: If AI agent commits to $50K when authorized for $5K, principal may still be bound if counterparty had no reason to know the limitation.

**MITIGATION**:
1. Publish delegation scope limits via machine-readable metadata
2. Require counterparty verification before transacting
3. Include clause giving counterparties constructive knowledge of published limits

### 3.3 Liability When Agent Exceeds Authority

- **Authorized acts**: Principal fully liable
- **Unauthorized (apparent authority)**: Principal bound if third party reasonably relied
- **Undisclosed principal**: Principal exclusively liable (agent has no legal personality)

Every template must include: disclosure of principal, scope limits, authority verification clause, liability cap for unauthorized acts.

---

## 4. Singapore Law

### 4.1 Why Singapore

- Regulatory clarity (MAS frameworks, Payment Services Act 2019)
- Common law system (compatible with UK/US)
- UNCITRAL Model Law adoption
- Neutral jurisdiction for international contracts
- SIAC (highly respected arbitration)
- No capital gains tax

### 4.2 Electronic Transactions Act (Cap. 88)

- **Section 6**: Electronic records not denied legal effect
- **Section 8**: Offer and acceptance may be electronic
- **Section 15**: Contracts formed by automated message systems shall not be denied validity solely because no human reviewed the actions. **Equivalent to UETA s. 14.**

Singapore is ideal as default governing law for international A2A commerce contracts.

---

## 5. Mandatory Clauses for US/UK Contracts

| # | Clause | Status | US Basis | UK Basis |
|---|--------|--------|----------|----------|
| 1 | Party identification | MANDATORY | Common law; UETA s. 14 | Common law; Companies Act 2006 |
| 2 | Principal Declaration | MANDATORY | UETA s. 14; Restatement s. 2.01 | Common law agency |
| 3 | Consideration / mutual obligation | MANDATORY | Common law | *Currie v Misa* [1875] |
| 4 | Subject matter / scope | MANDATORY | UCC s. 2-204(3) | Common law certainty |
| 5 | Payment terms | STRONGLY RECOMMENDED | Implied, but essential | Sale of Goods Act 1979 |
| 6 | Duration / term | STRONGLY RECOMMENDED | Statute of Frauds (>1 year) | Common law |
| 7 | Limitation of liability | STRONGLY RECOMMENDED | Enforceable if not unconscionable | UCTA ss. 2-3 |
| 8 | Indemnification | STRONGLY RECOMMENDED | Generally enforceable B2B | Subject to UCTA reasonableness |
| 9 | Dispute resolution | STRONGLY RECOMMENDED | FAA favors arbitration | Arbitration Act 1996 |
| 10 | Governing law | STRONGLY RECOMMENDED | Restatement s. 187; Del. s. 2708 | Rome I Art. 3 |
| 11 | Severability | RECOMMENDED | Prevents entire contract failure | Standard practice |
| 12 | Entire agreement | RECOMMENDED | Activates parol evidence rule | Less absolute than US |
| 13 | Force majeure | RECOMMENDED | NOT implied in US | NOT implied; frustration is narrower |
| 14 | IP rights | RECOMMENDED | Unsettled for AI content | CDPA 1988 s.9(3) |
| 15 | Data protection | MANDATORY (if PII) | CCPA/CPRA | UK GDPR Art. 28 |

### Amber-Specific Mandatory Clauses

| # | Clause | Status | Rationale |
|---|--------|--------|-----------|
| A1 | Electronic Agent Disclosure | MANDATORY | UETA s. 14(2) constructive knowledge |
| A2 | Wallet-Based Signature Agreement | MANDATORY | Parties must agree wallet signatures are valid |
| A3 | Hash Integrity Clause | STRONGLY RECOMMENDED | SHA-256 as definitive identifier |
| A4 | Format Reconciliation (human-readable controls) | MANDATORY | Resolve dual-format conflicts |
| A5 | IETF ADP Compliance | RECOMMENDED | Dispute resolution standards |
| A6 | On-Chain Record Clause | RECOMMENDED | cNFT as evidence |
| A7 | Principal Liability for Agent Actions | MANDATORY | Explicitly state principal is liable |

---

## 6. Ricardian Contract Legal Status

### 6.1 Legally Binding?

**Yes**, if standard formation requirements are met. No US/UK/SG court has specifically ruled on Ricardian Contracts, but the legal principles are clear: electronic format cannot be the sole basis for denying enforceability under UETA/ESIGN/ETA.

### 6.2 Dual-Format Resolution

**MANDATORY** in every template:

> "This contract consists of a human-readable text and a machine-parsable data representation. Both formats are part of this contract. In the event of any conflict or inconsistency between the human-readable text and the machine-parsable data, the human-readable text shall control."

### 6.3 SHA-256 Hash as Evidence

- **US FRE 901(b)(9)**: Authentication via process producing accurate result. SHA-256 satisfies.
- **US FRE 902(14)**: Self-authentication of electronic data.
- **UK Civil Evidence Act 1995 s. 8**: Electronic documents admissible if authenticated.

### 6.4 IPFS Storage

**RISK**: Persistence depends on pinning. **MITIGATION**: Professional pinning (Pinata Pro) + Supabase backup + on-chain cNFT hash + contractual obligation for parties to maintain copies for limitation period (6 years UK, 3-7 years US).

---

## 7. Template Recommendations

### 7.1 Delegation Templates

**D1: General Delegation of Authority** -- Principal Declaration, UETA s. 14 reference, full scope definition, spending limits, prohibited actions, liability allocation, ADP dispute resolution.

**D2: Limited Delegation** -- Narrow scope, transaction-specific, auto-expiry, no renewal.

**D3: Enterprise Delegation** -- Multi-agent roster, hierarchical authority, audit/reporting, compliance requirements (SOX, Bribery Act, FCPA).

### 7.2 Commerce Templates

**C1: API Access / Pay-Per-Call** -- SLA, payment terms (x402), usage limits, IP rights, data protection.

**C2: Compute / Data Processing SLA** -- Performance metrics, security requirements, SOC 2/ISO 27001, service credits.

**C3: Agent-to-Agent Commerce (A2A)** -- Both principals identified, mutual delegation references, authority verification, ADP dispute resolution, battle of forms resolution.

---

## 8. Risk Register

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| R1 | Agent exceeds scope; principal bound under apparent authority | HIGH | Publish limits; require counterparty verification |
| R2 | Court refuses Ricardian Contract due to novel format | MEDIUM | No legal barrier; include "legally binding" recital |
| R3 | Human/machine-readable versions conflict | HIGH | Reconciliation clause; human-readable controls |
| R4 | IPFS data loss | HIGH | Professional pinning + backup + on-chain hash |
| R5 | Wallet signature challenged | MEDIUM | Explicit agreement clause; qualifies as AES |
| R6 | Consideration challenge on delegation contracts | MEDIUM | Bilateral structure; mutual obligations |
| R7 | New York law applied -- UETA s. 14 unavailable | MEDIUM | Include electronic agent clause; rely on ESIGN |
| R8 | UCTA/CRA invalidates liability limitations | MEDIUM | Reasonable caps; separate B2B/B2C templates |
| R9 | UK GDPR non-compliance | HIGH | Data processing addendum |
| R10 | cNFT classified as regulated instrument | HIGH | Design as proof-of-agreement, not investment |

---

## Appendix: Recommended Recital Language

### Electronic Agent Formation Recital (US)

> WHEREAS, the Parties acknowledge that this contract may be formed, executed, and performed through the use of electronic agents as defined in the Uniform Electronic Transactions Act ("UETA") Section 2(6) and the Electronic Signatures in Global and National Commerce Act ("ESIGN") 15 U.S.C. s. 7006(2);
>
> WHEREAS, pursuant to UETA Section 14, a contract may be formed by the interaction of electronic agents of the parties, even if no individual was aware of or reviewed the electronic agents' actions or the resulting terms and agreements;
>
> NOW THEREFORE, the Parties agree as follows:

### Electronic Agent Formation Recital (UK)

> WHEREAS, the Parties acknowledge that this contract may be formed, executed, and performed through the use of automated message systems and electronic agents;
>
> WHEREAS, in accordance with the Electronic Communications Act 2000 and the eIDAS Regulation (as retained in UK law), the Parties agree that electronic signatures applied by their respective electronic agents shall be admissible and sufficient to evidence authentication and intent to be bound;
>
> NOW THEREFORE, the Parties agree as follows:

### Electronic Agent Formation Recital (Singapore)

> WHEREAS, the Parties acknowledge that this contract may be formed, executed, and performed through the use of automated message systems as contemplated by Section 15 of the Electronic Transactions Act (Cap. 88) of Singapore;
>
> NOW THEREFORE, the Parties agree as follows:

### Format Reconciliation Clause

> **Dual-Format Contract**: This contract is presented in both a human-readable text format and a machine-parsable data format (collectively, the "Ricardian Contract"). In the event of any conflict between the human-readable text and the machine-parsable data, the human-readable text shall prevail.

### Hash Integrity Clause

> **Contract Integrity**: The integrity of this contract is verified by its SHA-256 cryptographic hash: [HASH VALUE]. Any copy whose SHA-256 hash matches the recorded hash is deemed authentic and complete.

---

**Key statutory references:** UETA ss. 2(6), 7, 14; ESIGN 15 U.S.C. ss. 7001, 7006; UCC ss. 2-201, 2-204; 6 Del. C. s. 2708; Restatement (Third) of Agency ss. 1.01, 2.01, 2.03; ECA 2000 s. 7; eIDAS (retained) Arts. 3, 25, 26; UCTA 1977 ss. 2, 3; UK GDPR Arts. 6, 22, 28; Singapore ETA ss. 6, 8, 15; FAA; Arbitration Act 1996; FRE 901(b)(9), 902(14).
