# Digital Signature Laws & AI Agent Contract Signing
# Legal-Technical Research Report for Amber Protocol

**Date:** 2026-03-03
**Scope:** eIDAS (EU), ESIGN/UETA (US), ECA 2000 (UK), ETA (Singapore), ECDSA/Ethereum signing, AI agent signing authority
**Purpose:** Inform the signing architecture for Amber Protocol's 6 Ricardian Contract templates

---

## 1. Jurisdiction-by-Jurisdiction Signature Law

### 1.1 EU -- eIDAS Regulation (910/2014)

#### Three Signature Levels

| Type | eIDAS Reference | ECDSA Qualification | Legal Effect |
|------|----------------|---------------------|--------------|
| **Simple (SES)** | Art. 3(10) | YES -- always qualifies | Cannot be denied legal effect (Art. 25(1)) |
| **Advanced (AES)** | Art. 3(11), Art. 26 | YES -- with Principal Declaration + proper key mgmt | Higher evidential value |
| **Qualified (QES)** | Art. 3(12) | NO -- no QTSP for secp256k1, no QSCD certification | Equivalent to handwritten (Art. 25(2)) |

**AES Requirements (Art. 26):**
1. Uniquely linked to signatory -- ECDSA private key is unique. **MET.**
2. Identifies signatory -- Ethereum address identifies key holder. With Principal Declaration mapping to legal person: **MET.**
3. Sole control -- Depends on key management. HSM/hardware wallet: **MET.** Shared server `.env` file: **NOT MET.**
4. Detects subsequent changes -- ECDSA inherently satisfies. **MET.**

**AI Agent Signing under eIDAS:** An AI agent CANNOT be a "signatory" (Art. 3(9) requires natural person). The ECDSA signature is legally attributed to the principal who authorized the agent. **Principal Declaration is legally essential.**

**eIDAS 2.0 (2024/1183) Updates:**
- EU Digital Identity Wallet framework (potential extension to agent wallets)
- Electronic Attestations of Attributes (Principal Declaration could use this)
- Electronic Ledgers (Art. 45i-l): "shall not be denied legal effect solely on electronic grounds" -- directly relevant to cNFT architecture

### 1.2 US -- ESIGN Act + UETA

**ESIGN s. 7006(5) -- "Electronic Signature"**: Deliberately broad. ECDSA clearly qualifies. Key element: **intent to sign** -- mapped through principal's authorization.

**UETA s. 2(5) -- "Electronic Agent"**: "a computer program or an electronic or other automated means used independently to initiate an action or respond to electronic records or performances in whole or in part, without review or action by an individual" -- **precisely describes an AI agent.**

**UETA s. 14(1)**: "A contract may be formed by the interaction of electronic agents of the parties to a transaction. A contract formed by such interaction is enforceable." **THE KEY PROVISION.**

**UETA s. 9 -- Attribution**: Combined with Principal Declaration: ECDSA proof (cryptographic attribution) + Principal Declaration (legal attribution) = complete chain.

**New York Exception**: No UETA. Uses ESRA instead, lacking explicit electronic agent provisions. Rely on federal ESIGN Act for NY-governed contracts.

### 1.3 UK -- ECA 2000 + Common Law

- **Section 7(1)**: Electronic signatures admissible in evidence. Admissibility standard, not validity standard.
- Common law agency is the strongest basis for AI agent signing in UK.
- **Law Commission (2021)**: Electronic signatures can satisfy statutory signing requirements; signatures by electronic agents can be valid if authorized.

### 1.4 Singapore -- ETA (Cap. 88)

- **Section 8**: Electronic signatures satisfy signature requirements.
- Two-tier system: Electronic Signature (broad) + Secure Electronic Signature (carries presumptions).
- ECDSA meets all four "secure" criteria (unique, identifies, sole control, linked to data).
- **Most favorable jurisdiction overall for Amber.**

---

## 2. ECDSA Legal Classification Summary

| Jurisdiction | Minimum Classification | Can Reach AES/Equivalent? | Can Reach QES? |
|---|---|---|---|
| **EU (eIDAS)** | SES | Yes, with Principal Declaration + key mgmt | No |
| **US (ESIGN/UETA)** | Valid electronic signature | N/A (no tiers) | N/A |
| **UK** | Admissible electronic signature | Yes, under retained eIDAS | Theoretically |
| **Singapore** | Valid electronic signature | Yes, meets "secure" criteria | N/A |

---

## 3. AI Agent Signing Analysis

### The Core Legal Answer

**When an AI agent signs, the principal is legally signing.** Consistent across all jurisdictions. No jurisdiction recognizes AI legal personality.

### Three Signing Scenarios

**Scenario A: Company wallet -> AI agent signs**
- Valid under UETA s. 14, eIDAS SES/AES, UK common law, Singapore ETA.
- Delegation Contract formalizes the relationship.
- Risk: key compromise makes company liable for unauthorized signatures.

**Scenario B: Agent's own wallet (ERC-8004) -> agent signs**
- Wallet legally belongs to agent's operator/principal.
- Without Principal Declaration, enforceability severely weakened -- counterparty can't sue "wallet 0x1234."
- Principal Declaration non-negotiable even for agents with own wallets.

**Scenario C: Multi-sig (human + AI co-signing)**
- Strongest model across all jurisdictions.
- Provides: clear intent, identified person, oversight, reduced unauthorized risk.
- Mirrors traditional corporate dual-authorization.
- Slower; not ideal for high-frequency low-value transactions.
- **Recommended as default for Commerce Contracts above configurable threshold.**

### Key Custody Models

| Model | Legal Strength | Risk Level |
|---|---|---|
| Plaintext in environment | Minimal | Critical |
| Encrypted at rest | Low-moderate | High |
| Cloud KMS (AWS/GCP/Azure) | Moderate | Medium |
| HSM (FIPS 140-2 certified) | Strong | Low |
| Threshold signatures (MPC) | Strong | Low |
| **ERC-4337 Account Abstraction** | **Strongest for AI agents** | **Lowest** |

**ERC-4337 Benefits**: Spending limits, approved actions, session keys, social recovery, whitelisted destinations -- all enforced at protocol level. The principal deploys the wallet, the wallet enforces Delegation Contract constraints technically, and the principal retains override/recovery.

---

## 4. ECDSA / Ethereum Signing Technical Specifics

### EIP-712 (Typed Structured Data Signing) -- RECOMMENDED

**Example EIP-712 type for Amber:**
```
RicardianContract {
    bytes32 contractHash;      // SHA-256 of human-readable text
    string contractId;         // e.g., "amber-2026-0001"
    string contractType;       // "delegation" or "commerce"
    address principal;
    address agent;
    uint256 timestamp;
    string ipfsCid;
    string governingLaw;
}
```

**Why EIP-712 over raw ECDSA / EIP-191:**
- Structured data display in wallet UI (transparency / informed consent)
- Replay protection via domain separator
- Efficient on-chain verification
- Stronger evidence of intent to sign
- Standard tooling across all major wallets

### Smart Contract Wallets (ERC-4337 + ERC-1271)

- ERC-4337: Account Abstraction with `validateUserOp` for custom signing logic
- ERC-1271: `isValidSignature(bytes32 hash, bytes signature)` for smart contract wallets
- Amber's signature verification should support both `ecrecover` (EOA) and `isValidSignature` (ERC-1271)

### Multi-Signature Configurations

| Config | Use Case |
|---|---|
| 2-of-2 (Human + AI) | Maximum security |
| 1-of-2 (Human OR AI) | Maximum speed, low-value only |
| 2-of-3 (Human + AI + Recovery) | Best for enterprise |

---

## 5. Evidence and Record-Keeping

### SHA-256 Hash as Evidence

Accepted across all jurisdictions:
- **US**: FRE 901(b)(9), 902(14)
- **EU**: eIDAS Art. 46
- **UK**: Civil Evidence Act 1995 ss. 8-9
- **Singapore**: ETA s. 6, Evidence Act s. 116A
- **Vermont** (12 V.S.A. s. 1913): Explicitly self-authenticating blockchain records

### IPFS Storage

| Criteria | Assessment |
|---|---|
| Integrity | Strong (content-addressing) |
| Accessibility | Moderate risk (requires pinning) |
| Retention | Weak without pinning services |
| Authentication | Strong with CID verification |

**Mitigation**: Primary IPFS (Pinata Pro) + secondary Supabase + tertiary on-chain hash in cNFT.

**GDPR concern**: IPFS content cannot be deleted. Minimize PII. Store PII in Supabase (deletable). Hash PII rather than storing directly.

### Blockchain Timestamps

Prove existence, ordering, tamper-evidence. Vermont explicitly recognizes. eIDAS 2.0 Art. 45i-l provides EU framework. Amber's cNFT on Base L2 provides admissible timestamp across all jurisdictions.

---

## 6. Practical Signing Architecture for Amber

### Signing Flow

**Delegation Contract**: Principal creates -> SHA-256 hash -> IPFS -> Principal signs (EIP-712) -> Verified -> Active -> (Phase 2) cNFT minted.

**Commerce Contract**: Agent creates within delegated authority -> Platform verifies Delegation -> SHA-256 + IPFS -> Agent signs (EIP-712) -> Counterparty signs -> Both verified -> Active -> (Phase 2) cNFT minted.

### Signing Requirements per Template

| Contract Type | Signatures | Multi-sig | Key Management |
|---|---|---|---|
| D1: General Authority | 1 (principal) | Not required | Principal: hardware wallet / Cloud KMS |
| D2: Spending Limit | 1 (principal) | Recommended for agent wallet (ERC-4337) | Agent: ERC-4337 with encoded limits |
| D3: Scoped Authority | 1 (principal) | Optional | Agent: ERC-4337 with whitelists |
| C1: API Access | 2 (agent + provider) | Not typically required | Agent: Cloud KMS / ERC-4337 session key |
| C2: Data Processing | 2 (agent + processor) | Recommended (GDPR visibility) | Agent: ERC-4337 with principal co-approval |
| C3: Procurement | 2 (agent + vendor) | **Mandatory above threshold** | Agent: ERC-4337 with spending limits |

### Recommended Defaults

| Setting | Value | Rationale |
|---|---|---|
| Signing standard | EIP-712 | Structured data, replay protection, wallet UI |
| Multi-sig threshold | USD 1,000 (configurable) | Balance autonomy and oversight |
| Minimum key management | Cloud KMS | Reasonable security for production |
| Recommended key management | ERC-4337 + HSM | Technical and legal enforcement |
| Principal Declaration | Mandatory, validated | Non-negotiable for enforceability |

---

## 7. Risk Flags

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| Court refuses ECDSA as valid signature | High | Low | eIDAS 25(1), ESIGN, ETA prevent refusal. PDF fallback for high-value. |
| Agent exceeds delegated authority | High | Medium | Delegation Contract + ERC-4337 technical enforcement + counterparty verification |
| Private key compromise | Critical | Medium | HSM/Cloud KMS. ERC-4337 limits. Emergency revocation. Key rotation. |
| Pseudonymity (can't identify signer) | High | Low with Principal Declaration | Mandatory, validated Principal Declaration |
| Cross-jurisdictional enforcement | Medium | Medium | Choice of Law. ADP arbitration. Singapore/Delaware defaults. |
| GDPR vs IPFS immutability | Medium | Medium | Minimize PII on IPFS. Supabase for deletable data. |

### Untested Legal Territory

1. No court has adjudicated an AI agent contract dispute
2. AI agent error liability under UETA s. 15 untested with LLM-based agents
3. Delegation Contract as PoA for AI -- sound but no specific precedent
4. NFT as proof of contract -- novel; frame as evidence, not contract itself
5. Cross-chain signature validity -- no precedent

---

## References

### Statutes
- eIDAS (EU) 910/2014; eIDAS 2.0 (EU) 2024/1183
- ESIGN Act 15 U.S.C. ss. 7001-7031
- UETA (1999, adopted 49 states + DC)
- ECA 2000 (UK); UK eIDAS (retained)
- Singapore ETA (Cap. 88)
- Vermont 12 V.S.A. s. 1913

### Standards
- EIP-191, EIP-712, ERC-1271, ERC-4337, ERC-8004
- IETF ADP (draft-kotecha-agentic-dispute-protocol-00)
- ETSI TS 119 312; FIPS 140-2

### Secondary Sources
- Law Commission of England and Wales, "Electronic Execution of Documents" (2019)
- Mayer Brown, "Contracting for Agentic AI" (Feb 2026)
- UETA Official Comments, Section 14
