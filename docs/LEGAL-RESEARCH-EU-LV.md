# Legal Research Report: EU and Latvian Contract Law for AI Agent-Executed Ricardian Contracts

**Prepared for:** Amber Protocol
**Date:** 2026-03-03
**Scope:** Latvia (primary jurisdiction), EU framework, DACH region (secondary)
**Purpose:** Inform contract template design for AI agent delegation and commerce contracts

---

## DISCLAIMER

This document is a legal research summary, not legal advice. It is based on publicly available statutory texts, EU regulations, and legal scholarship. A licensed Latvian/EU attorney should review all contract templates before commercial deployment.

---

## 1. Latvian Contract Law (Primary Jurisdiction)

### 1.1 Valid Contract Formation under Civillikums

The Latvian Civil Law (Civillikums), originally enacted in 1937 and restored in 1992-1993, governs contract formation in Part Four: Obligations (Ceturta dala: Saistību tiesibas).

**Essential elements for a valid contract (Articles 1427-1593):**

| Element | Civillikums Reference | Requirement |
|---------|----------------------|-------------|
| **Capacity** (Tiesibspeja/Ricibspeja) | Art. 1405-1409 | Parties must have legal capacity. Natural persons: 18+. Legal entities: through authorized representatives |
| **Consent** (Griba) | Art. 1427-1448 | Free and genuine expression of will. No error, fraud, or duress |
| **Lawful object** (Prieksmets) | Art. 1449-1453 | Subject matter must be lawful, possible, and determinate or determinable |
| **Cause** (Pamats) | Art. 1454-1460 | Must have a lawful purpose/basis |
| **Form** | Art. 1473-1495 | Generally no form requirement (freedom of form), but exceptions exist for real property, certain guarantees |

**Key principle (Art. 1473):** Latvian law follows the **principle of freedom of form** -- contracts can be oral, written, or in any other form unless a specific statute requires otherwise. This is favorable for Amber Protocol's electronic contract model.

**Art. 1488:** Written form can be satisfied by any document bearing the parties' signatures. Combined with the Electronic Documents Law, electronic signatures can satisfy written form requirements.

### 1.2 Electronic Contracts and Signatures in Latvia

**Electronic Documents Law (Elektronisko dokumentu likums, 2002):**

- **Section 3**: An electronic document has the same legal force as a paper document if it complies with this law
- **Section 4**: An electronic signature on an electronic document has the same legal effect as a handwritten signature, provided it is a **secure electronic signature** (dross elektroniskais paraksts) -- corresponding to a **qualified electronic signature (QES)** under eIDAS
- **Section 3(2)**: If law requires written form, an electronic document with a secure electronic signature satisfies this

**Latvia's qualified signature provider:** eParaksts, operated by LVRTC (Latvian State Radio and Television Centre).

**Critical implication for Amber Protocol:** ECDSA blockchain signatures are **NOT** qualified electronic signatures under Latvian law. They would be classified as "simple electronic signatures" or possibly "advanced electronic signatures" under eIDAS. For B2B contracts where written form is not legally mandated, ECDSA signatures **can be** valid evidence of consent, but carry lower evidential weight than QES. The Principal Declaration must explicitly state that the principal accepts ECDSA/blockchain signatures as their chosen authentication method.

### 1.3 Power of Attorney (Pilnvara) -- Critical for Delegation Contracts

**Civillikums Part Four, Articles 2289-2318 (Agency/Mandate):**

| Requirement | Article | Detail |
|-------------|---------|--------|
| **Definition** | Art. 2289 | A mandate is a contract whereby one person (agent/pilnvarnieks) undertakes to perform certain legal acts on behalf of another (principal/pilnvardevejs) |
| **Scope** | Art. 2291 | Must specify the scope of authority -- general or specific. Special transactions require specific authorization |
| **Form** | Art. 2292-2293 | If the underlying transaction requires a specific form (e.g., notarial), the power of attorney must be in the same form. Otherwise no specific form required |
| **Scope limitation** | Art. 2298 | Agent must act within the mandate scope. Acts beyond scope do NOT bind the principal unless ratified |
| **Ratification** | Art. 2301 | Principal may ratify unauthorized acts, which then bind retroactively |
| **Third party protection** | Art. 2302-2303 | Third parties dealing with the agent are protected if they could reasonably rely on apparent authority |
| **Revocation** | Art. 2310-2312 | Principal may revoke at any time. Effective upon notice to agent |
| **Sub-delegation** | Art. 2305 | Agent may delegate to a substitute only if authorized by principal or if circumstances require it |

**Commercial Law (Komerclikums) additions:**

- **Section 12**: Legal entities act through their management bodies (valde/board)
- **Section 221-231**: Board members' representation rights registered in Komercregistrs
- **Section 32-34**: Prokura (commercial power of attorney) -- broad agency, must be registered in Commercial Register
- **Section 35-38**: General commercial authorization (komercpilnvara) -- narrower, no registration required

**What Amber Protocol Delegation Contracts MUST contain under Latvian law:**

1. **[MANDATORY]** Identity of the Principal -- full legal name, registration number (companies) or personal code (natural persons)
2. **[MANDATORY]** Identity of the Agent -- wallet address, with Principal Declaration linking to responsible human/entity
3. **[MANDATORY]** Scope of authority -- specific acts the agent is authorized to perform
4. **[MANDATORY]** Limitations -- maximum transaction values, permitted categories, duration
5. **[RECOMMENDED]** Statement accepting electronic/blockchain authentication
6. **[RECOMMENDED]** Explicit enumeration of acts requiring separate principal approval
7. **[RECOMMENDED]** Revocation mechanism and notice requirements

**RISK FLAG:** Under Art. 2298, if an AI agent exceeds its delegated authority, the resulting contract does NOT bind the principal. The third party's only recourse would be against the agent -- but AI agents have no legal personality. This creates a potential liability gap where the third party has NO recourse. This is the single largest legal risk in the Amber Protocol system.

### 1.4 Consumer Protection

**Consumer Rights Protection Law (Pateretaju tiesibu aizsardzibas likums):**

If one party is a consumer (natural person acting outside trade/business):

- Right of withdrawal (14 days) for distance contracts
- Unfair contract terms are void
- Pre-contractual information requirements (trader identity, characteristics, total price, withdrawal procedure)

**Recommendation for Amber Protocol MVP:** Focus on B2B templates only. Add B2C templates in Phase 2 with full consumer protection compliance.

### 1.5 Arbitration Validity in Latvia

The Latvian Law on Arbitration Courts (Skirtiesu likums) allows parties to agree to arbitration for civil law disputes. The arbitration agreement must be in writing. The Latvian Chamber of Commerce and Industry operates an arbitration court. International arbitration (ICC, LCIA, SCC) is also recognized.

**Consumer disputes** cannot generally be forced into pre-dispute arbitration under EU law (Directive 2013/11/EU).

---

## 2. EU Contract Framework

### 2.1 eIDAS Regulation (910/2014)

Directly applicable in all EU Member States. Establishes three tiers of electronic signatures:

| Type | eIDAS Article | Requirements | Legal Effect | Amber Protocol Applicability |
|------|--------------|--------------|--------------|------------------------------|
| **Simple Electronic Signature (SES)** | Art. 3(10) | Data in electronic form attached to/logically associated with other data used to sign | Cannot be denied legal effect solely because electronic (Art. 25(1)) | **ECDSA signatures qualify as SES** |
| **Advanced Electronic Signature (AdES)** | Art. 3(11), Art. 26 | Uniquely linked to signatory, identifies signatory, created using data under signatory's sole control, detects subsequent changes | Same as SES with higher evidential value | **ECDSA signatures may qualify as AdES** if wallet private key is under sole control |
| **Qualified Electronic Signature (QES)** | Art. 3(12) | AdES created by qualified signature creation device, based on qualified certificate | Equivalent to handwritten signature (Art. 25(2)) | **NOT achievable** with standard blockchain wallets |

**Can an AI Agent "Sign" under eIDAS?**

**No, not directly.** eIDAS Art. 3(9) defines "signatory" as *"a natural person who creates an electronic signature."* An AI agent:
- Cannot be a "signatory" under eIDAS
- Cannot create a legally recognized electronic signature in its own right
- Any signature created by an AI must be legally attributed to the natural person who authorized it

**This makes the Principal Declaration legally essential, not optional.** The ECDSA signature by an AI agent wallet is legally the act of the principal who authorized the agent. Templates must include explicit language:

> *"The undersigned Principal hereby authorizes the AI Agent identified by wallet [address] to execute electronic signatures on behalf of the Principal. Any electronic signature created by the Agent wallet shall be deemed the act of the Principal for all legal purposes."*

### 2.2 eCommerce Directive (2000/31/EC)

Requirements for Amber Protocol as an information society service provider:

- **Art. 5**: Must provide service provider identification (name, address, email, trade register number, VAT number)
- **Art. 9**: Member States must ensure legal systems allow electronic contract conclusion
- **Art. 10(1)**: Pre-contractual information -- technical steps for contract conclusion, whether contract will be filed/accessible, means for correcting input errors, available languages
- **Art. 10(3)**: Contract terms and general conditions must be available for storage and reproduction
- **Art. 11**: Must acknowledge receipt of order without undue delay

Amber Protocol's SHA-256 hash verification and IPFS storage provide strong compliance with Art. 10(3).

### 2.3 GDPR (Regulation 2016/679)

| Area | GDPR Articles | Amber Protocol Requirement |
|------|--------------|---------------------------|
| **Lawful basis** | Art. 6(1)(b) | Processing contract data is lawful when necessary for contract performance |
| **Data minimization** | Art. 5(1)(c) | Only collect personal data necessary for contract purpose |
| **Right to erasure** | Art. 17 | **RISK FLAG**: IPFS is immutable -- potential conflict with right to erasure |
| **Cross-border transfers** | Art. 44-49 | Adequate safeguards required for processing outside EU/EEA |
| **Data processing agreements** | Art. 28 | If Amber acts as data processor, DPA required |
| **Data protection by design** | Art. 25 | Must implement appropriate technical/organizational measures |
| **Records of processing** | Art. 30 | Must maintain records of processing activities |

**RISK FLAG -- IPFS and Right to Erasure:** This is a significant tension. Mitigation strategies:

1. Store personal data in Supabase (deletable). IPFS stores only pseudonymized/wallet-addressed versions
2. Include explicit consent clause for IPFS storage of any personal data
3. Provide that the IPFS version can reference parties by wallet address only, with a lookup table in the deletable database

### 2.4 Rome I Regulation (593/2008) -- Choice of Law

- **Art. 3(1)**: Parties are free to choose governing law. The choice must be expressed or clearly demonstrated
- **Art. 4**: Default rules if no choice: services -> service provider's country; sale -> seller's country
- **Art. 6**: Consumer's habitual residence law applies for mandatory consumer protections regardless of choice-of-law clause
- **Art. 9**: Overriding mandatory provisions of the forum state apply regardless

**Recommendation:** Default to Latvian law, consistent with the existing JDA approach.

### 2.5 Consumer Rights Directive (2011/83/EU)

If one party is a consumer:
- **14-day withdrawal right** for distance/electronic contracts (Art. 9)
- **Pre-contractual information** requirements (Art. 6)
- **Confirmation** on durable medium (Art. 8)

Commerce Contracts must detect B2C scenarios and include withdrawal rights.

---

## 3. DACH Region (Secondary)

### 3.1 Germany -- BGB

#### Contract Formation (Vertragsschluss, ss. 145-157)

- Offer (Angebot) and acceptance (Annahme) must match (mirror image rule)
- Freedom of form (Formfreiheit) by default
- **Electronic form** (s. 126a): Requires a **qualified electronic signature** per eIDAS. Simple/advanced signatures do NOT satisfy s. 126a
- **Text form** (s. 126b): Lower threshold -- readable declaration on durable medium with identification. No signature required

#### AGB Law (ss. 305-310) -- CRITICALLY IMPORTANT

Because Amber Protocol provides pre-formulated contract templates, these are **AGB (Allgemeine Geschaftsbedingungen)** under German law:

| Rule | BGB Section | Effect for Amber |
|------|-------------|-----------------|
| **Incorporation** | s. 305(2) | Standard terms only part of contract if user clearly refers to them and gives reasonable review opportunity |
| **Surprise clauses** | s. 305c(1) | Unusual clauses the other party could not reasonably expect are **void** |
| **Contra proferentem** | s. 305c(2) | Ambiguities interpreted against the drafter (Amber/template user) |
| **Content control** | s. 307 | Terms unreasonably disadvantaging the other party contrary to good faith are **void** |
| **Specific prohibitions** | s. 308 | Unreasonably long deadlines, secondary obligation changes, fictitious declarations |
| **Absolute prohibitions** | s. 309 | Short warranty periods, blanket liability exclusions, burden of proof shifts |
| **B2B scope** | s. 310(1) | ss. 308-309 don't apply directly to B2B, but s. 307 general content control still applies |

**RISK FLAG:** If Amber Protocol templates contain a clause excluding ALL liability for AI agent actions, this would likely be **void under s. 307/309 BGB** for German-law contracts. Liability clauses should exclude indirect/consequential damages but NOT exclude liability for intentional misconduct (Vorsatz) or gross negligence (grobe Fahrlassigkeit).

### 3.2 Austria

Substantially similar to German law. ABGB ss. 861-937 for contract formation. Standard terms controlled by s. 879 ABGB and KSchG (Consumer Protection Act) for B2C.

### 3.3 Switzerland

Switzerland is **NOT** an EU/EEA member:

- **Electronic signatures**: ZertES (Federal Act on Electronic Signatures) instead of eIDAS. Swiss QES is not automatically cross-recognized with EU QES
- **Data protection**: FADP/DSG (revised 2023) instead of GDPR. Similar principles but separate regime
- **AGB control**: No AGB-specific statute. Controlled by Art. 8 UWG (Unfair Competition Act) for B2C, general good faith (Art. 2 ZGB) for B2B. Less strict than German law
- **Choice of law**: IPRG Art. 116 -- parties free to choose governing law for commercial contracts

**For Swiss counterparties:** Replace eIDAS references with ZertES, supplement GDPR references with FADP/DSG.

---

## 4. Mandatory Clauses for EU-Compliant Contracts

### 4.1 Universal Mandatory Clauses (All Templates)

| # | Clause | Legal Basis | Status |
|---|--------|-------------|--------|
| 1 | **Party identification** (full legal name, registration number, registered address, contact) | Civillikums Art. 1427, eCommerce Dir. Art. 5, BGB s. 145 | **MANDATORY** |
| 2 | **Principal Declaration** (identifies human/entity behind AI agent) | eIDAS Art. 3(9), Civillikums Art. 2289 | **MANDATORY** |
| 3 | **Subject matter / scope** (clear, determinate description) | Civillikums Art. 1449-1453, BGB s. 154 | **MANDATORY** |
| 4 | **Price / payment terms** (amount, currency, payment method, timing) | Civillikums Art. 1454, BGB s. 145 | **MANDATORY** |
| 5 | **Governing law clause** (explicit choice) | Rome I Art. 3(1) | **MANDATORY** |
| 6 | **Dispute resolution** (court/arbitration specification) | Civillikums, Civilprocesa likums | **STRONGLY RECOMMENDED** |
| 7 | **Electronic signature acknowledgment** (parties accept ECDSA signatures) | eIDAS Art. 25, LV Electronic Documents Law | **MANDATORY** |
| 8 | **Data protection clause** | GDPR Art. 6, 13-14, 28 | **MANDATORY** if personal data |
| 9 | **Contract effective date** | Civillikums Art. 1427 | **MANDATORY** |
| 10 | **Termination provisions** | General contract law | **RECOMMENDED** |

### 4.2 Delegation Contract-Specific Clauses

| # | Clause | Status |
|---|--------|--------|
| D1 | Scope of agent authority (enumerated permitted actions) | **MANDATORY** |
| D2 | Agent limitations (max transaction value, categories, geography, time) | **MANDATORY** |
| D3 | Spending limits (per-transaction and aggregate) | **MANDATORY** |
| D4 | Revocation mechanism (method, timing, effect on pending transactions) | **MANDATORY** |
| D5 | Principal liability acknowledgment | **MANDATORY** |
| D6 | Acts requiring separate approval | **RECOMMENDED** |
| D7 | Agent identification (wallet address, agent type) | **MANDATORY** |
| D8 | Duration (fixed term or open-ended with termination) | **MANDATORY** |
| D9 | Reporting obligations | **RECOMMENDED** |

### 4.3 Commerce Contract-Specific Clauses

| # | Clause | Status |
|---|--------|--------|
| C1 | Service/product description | **MANDATORY** |
| C2 | SLA / quality terms | **RECOMMENDED** |
| C3 | Payment method and timing (x402 details) | **MANDATORY** |
| C4 | Delivery / performance | **MANDATORY** |
| C5 | Liability limitations (carefully drafted; no blanket exclusions for BGB) | **RECOMMENDED** |
| C6 | Force majeure | **RECOMMENDED** |
| C7 | Intellectual property (if IP involved) | **CONDITIONAL** |
| C8 | Confidentiality | **RECOMMENDED** |
| C9 | Warranty | **RECOMMENDED** |
| C10 | Consumer withdrawal right (14-day) | **MANDATORY if B2C** |

---

## 5. AI Agent-Specific Legal Issues

### 5.1 Legal Personhood

**AI agents have NO legal personhood in any EU jurisdiction.** This is consistent across Latvia (Civillikums Art. 1-40), Germany (BGB ss. 1-89), Austria (ABGB), and Switzerland (ZGB Art. 11, 52-89). The European Parliament rejected the "electronic personhood" proposal in 2017.

**Consequence:** Every contract must have a human or legal entity as the actual contracting party. The Principal Declaration is the legal mechanism that makes this work. The agent's wallet address is an authentication mechanism, not a party identifier.

### 5.2 EU AI Act (Regulation 2024/1689)

Entered into force August 2024, phased implementation through 2027.

| Area | Provision | Amber Protocol Impact |
|------|-----------|----------------------|
| **Risk classification** | Art. 6, Annex III | AI agent executing commercial contracts likely does NOT fall into Annex III (high-risk) categories -- classified as limited/minimal risk |
| **Transparency** | Art. 50 | AI systems interacting with natural persons must disclose they are AI. Templates should clearly state the counterparty is an AI agent |
| **Provider obligations** | Art. 16-29 | If high-risk: risk management, documentation, human oversight. Likely not applicable to Amber's use case |
| **Deployer obligations** | Art. 26 | The Principal must ensure AI is used per instructions, implement oversight, monitor operation |
| **GPAI models** | Art. 51-56 | LLMs used for contract generation must comply with transparency requirements |

**Recommendation:** All LLM-generated contracts should carry a notice: *"This contract was generated with the assistance of an AI language model. The terms have been reviewed and accepted by the undersigned Principal."*

### 5.3 Liability When AI Agent Exceeds Authority

**Resolution hierarchy under Latvian law:**

1. **Principal bound by authorized acts** -- Delegation Contract defines scope
2. **Agency by estoppel** (Art. 2302) -- if principal created appearance of authority, principal may be bound
3. **Platform liability** -- if Amber failed to enforce scope limitations or misrepresented authority
4. **Liability gap** -- if agent acts outside scope, principal didn't create apparent authority, platform operated correctly -- third party may have no recourse

**Template recommendations:**
- Delegation Contracts: *"The Principal acknowledges and accepts liability for all acts performed by the Agent within the scope of authority defined in this contract."*
- Commerce Contracts: *"Party A acknowledges that Party B's agent operates under a Delegation Contract with defined scope limitations. Party A may verify the agent's authority scope via the Amber Protocol Reader Portal."*
- Include mandatory "Authority Verification" clause pointing to the API endpoint

### 5.4 Is the Principal Declaration Sufficient?

The Principal Declaration as designed is **sufficient for B2B purposes** but should be enhanced:

1. **Add registration number requirement** -- for Latvian companies, the Komercregistrs number should be mandatory
2. **Add signatory authority statement** -- confirm the person signing has board-level authority (valdes loceklis or prokura)
3. **Add duration** -- explicit validity period or default expiration
4. **Add explicit liability assumption** -- "We accept full legal responsibility for all acts within authorized scope"

**Recommended enhanced Principal Declaration structure:**

```
PRINCIPAL DECLARATION (PILNVARDEVEJA DEKLARACIJA)

I/We, [Full Legal Name], registration number [number], registered at [address],
represented by [Name], acting as [position/authority basis],

hereby declare that:

1. The AI Agent identified by wallet address [0x...] is authorized to act on
   our behalf within the scope defined in this contract.
2. We accept full legal responsibility for all acts performed by the Agent
   within the authorized scope.
3. Any electronic signature created by the Agent's wallet shall be deemed
   our act for all legal purposes under eIDAS Regulation 910/2014.
4. This declaration is valid from [date] until [date/revocation].
5. We confirm that the undersigned has legal authority to make this
   declaration on behalf of [entity name].
```

---

## 6. Risk Register

### 6.1 High-Risk Issues

| # | Risk | Severity | Mitigation |
|---|------|----------|-----------|
| R1 | ECDSA signatures not recognized as equivalent to handwritten signatures | HIGH | Principal Declaration + contractual acknowledgment. Both parties explicitly agree to accept ECDSA signatures |
| R2 | AI agent exceeds delegated authority -- liability gap | HIGH | Narrow, specific scope in Delegation Contract. Authority verification API. Technical enforcement of scope limits |
| R3 | IPFS storage conflicts with GDPR right to erasure | HIGH | Personal data in Supabase (deletable). IPFS stores only pseudonymized data. Explicit consent for IPFS storage |
| R4 | German AGB control invalidates template clauses | MEDIUM | Review templates against BGB ss. 305-310. No blanket liability exclusions. No surprise clauses |
| R5 | Consumer contract requirements not met | HIGH | MVP: B2B only. Flag B2C scenarios. Full B2C compliance in Phase 2 |
| R6 | Principal Declaration signer lacks authority | MEDIUM | Require Commercial Register number. Phase 3: integrate Business Register API for verification |
| R7 | Cross-border enforcement challenges | MEDIUM | Clear governing law clause (Rome I). Arbitration clause for B2B |
| R8 | AI Act transparency requirements | LOW | Already mitigated by Principal Declaration. Add LLM-generated content notice |

### 6.2 Key Unresolved Legal Questions

- Can blockchain timestamps serve as legal evidence of contract formation date? (No EU-wide precedent)
- If two AI agents contract, who are the actual parties? (Both principals, per Principal Declarations)
- Are Ricardian Contracts a recognized legal form? (No -- treated as ordinary contracts with electronic signature elements)

---

## 7. Template Recommendations

### 7.1 Three Delegation Templates

**D1 -- General Agent Authorization:** Company authorizes AI agent for general commercial activities within defined limits. All mandatory delegation clauses D1-D9.

**D2 -- Limited Task Delegation:** Single specific task or transaction type. Narrowly scoped, time-limited, lower spending limits, auto-expires.

**D3 -- Sub-Agent Delegation:** Authorized agent delegates sub-task to another agent. Must reference parent Delegation Contract via `parent_contract_hash`. Scope MUST be subset of parent scope. Requires ultimate Principal's explicit consent per Civillikums Art. 2305. **Consider restricting to Phase 3 due to legal complexity.**

### 7.2 Three Commerce Templates

**C1 -- API Service Access Agreement:** Pay-per-call or subscription API access. Includes SLA, rate limits, IP rights for outputs, liability cap.

**C2 -- Data Purchase Agreement:** Dataset or data feed procurement. Enhanced GDPR clause for personal data in datasets. Data license terms, quality warranties, deletion obligations.

**C3 -- General Procurement Agreement:** Goods or services procurement. Delivery terms (Incoterms for physical goods), quality/warranty, acceptance procedure, mutual liability caps.

### 7.3 Cross-Template Mandatory Elements

Every template MUST include:
1. Contract header (type, ID, hash, timestamps)
2. Principal Declaration(s) in enhanced format
3. Electronic Signature Acknowledgment (citing eIDAS Art. 25)
4. Governing Law clause (default: Republic of Latvia)
5. Dispute Resolution clause
6. Data Protection clause (GDPR-compliant)
7. Immutable Storage Notice (IPFS consent)
8. AI Act Transparency Notice

### 7.4 Jurisdiction-Specific Addenda

| Counterparty Jurisdiction | Additional Clause |
|--------------------------|-------------------|
| **Germany/Austria** | AGB notice (s. 305(2) BGB): confirm review opportunity. No blanket liability exclusions |
| **Switzerland** | Replace eIDAS with ZertES, GDPR with FADP/DSG |
| **UK** (post-Brexit) | Replace eIDAS with UK eIDAS, GDPR with UK GDPR |
| **USA** | Separate template needed (ESIGN Act/UETA, no GDPR, UCC for commercial) |

---

## 8. Implementation Priority for MVP

### Must-Have (Milestone 3, Week 2-3)
1. Enhanced Principal Declaration format
2. Electronic Signature Acknowledgment clause
3. Governing Law clause (default: Latvia)
4. Dispute Resolution clause
5. Party identification with registration number validation
6. Scope/authority structure for Delegation Contracts
7. Data Protection baseline clause

### Should-Have (pre-launch)
8. IPFS immutable storage notice
9. AI Act transparency notice
10. Force majeure clause
11. BGB-compliant liability limitation clause
12. Confidentiality clause

### Phase 2-3
13. B2C consumer withdrawal clause
14. German AGB incorporation notice
15. Swiss ZertES alternative
16. Automated Commercial Register verification
17. Sub-delegation chain-of-authority tracking
18. Authority Verification API endpoint

---

## 9. Summary of Key Findings

1. **Latvian law supports electronic contracts** but ECDSA/blockchain signatures are NOT qualified electronic signatures. The Principal Declaration and contractual acknowledgment clauses bridge this gap.

2. **AI agents cannot be parties to contracts** under any EU jurisdiction. The Principal Declaration is legally essential -- it must include registration number, signatory authority verification, and explicit liability assumption.

3. **German AGB law** (BGB ss. 305-310) poses the biggest risk to pre-formulated templates. Blanket liability exclusions and surprise clauses would be struck down. All templates should be reviewed against these provisions.

4. **GDPR and IPFS create a tension** that must be architecturally resolved: personal data in deletable database, pseudonymized versions on IPFS.

5. **The EU AI Act** does not prohibit AI agents from executing contracts but imposes transparency requirements. LLM-generated contracts must disclose AI involvement.

6. **Arbitration is valid** for B2B across all target jurisdictions. For B2C, default to court jurisdiction.

7. **The governing law clause is the single most impactful clause** for enforceability. Default to Latvian law.

8. **Sub-delegation** requires explicit principal consent under Latvian law (Art. 2305) and creates significant complexity. Consider restricting to Phase 3.

---

**Key statutory references:** Civillikums (LV Civil Law), Komerclikums (LV Commercial Law), Electronic Documents Law (LV), eIDAS Regulation (EU) 910/2014, eCommerce Directive 2000/31/EC, GDPR (EU) 2016/679, Rome I Regulation (EU) 593/2008, Consumer Rights Directive 2011/83/EU, EU AI Act (EU) 2024/1689, BGB (German Civil Code), ABGB (Austrian Civil Code), Swiss OR (Code of Obligations), Swiss ZertES.
