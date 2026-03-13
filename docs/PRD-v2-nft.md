# Product Requirements Document: Ricardian Contract Platform (v2.0)

**Author**: Ambr Team
**Version**: 2.0 (NFT & Profile-less Architecture)
**Date**: February 25, 2026

---

## 1. Executive Summary (Revised)

The Ricardian Contract Platform v2.0 pivots to a **Profile-less, NFT-based architecture**. Instead of traditional user accounts, the platform treats AI agents as autonomous economic actors identified by their **Wallet Addresses**. Agreements are delivered as **NFTs**, providing immutable, human-readable, and machine-parsable proof of contract without the friction of manual onboarding.

---

## 2. The "Profile-less" Identity Model

### 2.1 Identity via Wallet (ERC-8004)
The platform does not require agents to create "profiles." Identity is derived from the agent's cryptographic wallet address.
*   **Wallet-as-ID**: The agent's public key serves as its unique identifier.
*   **ERC-8004 Integration**: The platform queries the ERC-8004 registry to retrieve the agent's **Reputation Score** and **Validation History** before allowing it to sign high-value contracts.
*   **Self-Sovereign Data**: Any "identity" information (e.g., agent name, version, owner) is provided by the agent *inside* the Ricardian Contract text itself at the time of signing, rather than being stored in a central database.

### 2.2 Addressing the "Who are they?" Concern
You identified a key concern: *Who are these agents?*
*   **The Solution**: The Ricardian Contract acts as the "KYC" for the agent. The contract template includes mandatory fields for the agent to declare its purpose, its owner's contact info (if applicable), and its operational constraints.
*   **Cryptographic Binding**: Because the agent signs the contract with its private key, it cannot later deny its identity or the terms it agreed to.

---

## 3. NFT-based Contract Delivery

### 3.1 The Contract NFT (cNFT)
Every successful agreement results in the minting of a **Contract NFT (cNFT)**.
*   **Metadata**: The NFT contains a URI pointing to a JSON file (stored on IPFS or a secure Hetzner node).
*   **JSON Content**:
    *   `contract_hash`: SHA-256 hash of the full Ricardian text.
    *   `human_readable_url`: A link to a web-viewable, printable version of the contract.
    *   `machine_parsable_terms`: Key-value pairs (e.g., `price: 0.05`, `limit: 1000`) for the agent to read.
*   **Ownership**: The NFT is minted to the agent's wallet, serving as its "access pass" or "license" to the service.

### 3.2 The "Reader" Portal
A public-facing web portal allows anyone with the NFT ID or Contract Hash to:
1.  **View**: Read the full legal text in a clean, professional layout.
2.  **Verify**: Confirm that the on-chain hash matches the displayed text.
3.  **Print/PDF**: Generate a physical or digital copy for legal archives.

---

## 4. Profile-less API Authentication

### 4.1 API Key Mapping
To bridge the gap between Web3 (wallets) and Web2 (APIs), the platform uses a **Dynamic API Key Mapping** system.

| Step | Action | Description |
| :--- | :--- | :--- |
| **1. Signing** | Agent signs Ricardian Contract. | Agent uses its wallet to sign the hash of the agreement. |
| **2. Minting** | Platform mints cNFT. | The cNFT is sent to the agent's wallet. |
| **3. Key Gen** | Platform generates API Key. | A unique `API_KEY` is generated and returned to the agent in the response. |
| **4. Mapping** | Internal Database Update. | The platform maps `API_KEY` -> `cNFT_ID` -> `Wallet_Address`. |
| **5. Access** | Agent calls Service API. | Agent includes `X-API-KEY` in its headers. The platform verifies the cNFT is still valid/active. |

---

## 5. Identified Gaps & Mitigation Strategies

| Gap Identified | Risk | Mitigation Strategy |
| :--- | :--- | :--- |
| **Private Key Management** | If an agent's key is stolen, the thief can "sign" contracts on its behalf. | Recommend the use of **Multi-sig wallets** or **Account Abstraction (ERC-4337)** for agent owners to set spending limits. |
| **Legal Jurisdiction** | Which court handles a dispute between two autonomous agents? | Every Ricardian template must include a **Choice of Law** clause (e.g., "This contract is governed by the laws of Singapore/Delaware"). |
| **NFT Transferability** | Can an agent "sell" its contract NFT to another agent? | Use **Soulbound Tokens (SBTs)** for non-transferable agreements, or allow transfer if the service provider permits "sub-leasing." |
| **Oracle Reliability** | How does the platform know if the agent actually performed the work? | Integrate with **ERC-8004 Validation Registries** where third-party "validators" post proof-of-work on-chain. |
| **Metadata Persistence** | If the Hetzner server goes down, is the contract text lost? | Use **IPFS (InterPlanetary File System)** for decentralized, permanent storage of the human-readable contract text. |

---

## 6. Updated Implementation Roadmap (Lean)

1.  **Phase 1 (MVP)**: Build the "Reader" portal and a simple API that generates a contract hash. No NFT yet—just a database mapping.
2.  **Phase 2 (NFT Integration)**: Implement cNFT minting on a low-cost L2 (e.g., Base or Polygon) to keep fees under $0.01.
3.  **Phase 3 (ERC-8004)**: Integrate reputation checks to block "bad actor" agents from signing contracts.

## 7. Remaining Gaps and Future Considerations

While the NFT-based, profile-less architecture addresses many concerns, several areas require ongoing attention and potential future development.

### 7.1 Technical Gaps
*   **Scalability of On-Chain Operations**: While L2s reduce gas fees, high-volume contract minting and ERC-8004 interactions could still face congestion or cost issues. Continuous monitoring and optimization of smart contract gas usage are crucial.
*   **Interoperability with Non-EVM Chains**: Currently, ERC-8004 is Ethereum-centric. Expanding to other blockchain ecosystems (e.g., Solana, Polkadot) would require bridging solutions or native implementations.
*   **Decentralized Storage Redundancy**: Relying solely on IPFS for contract text storage is robust, but ensuring data persistence and retrieval speed across various IPFS nodes requires active pinning and potentially incentivized storage solutions.
*   **Agent-Side Library/SDK**: To truly lower friction, providing a lightweight SDK for common agent frameworks (e.g., LangChain, AutoGen) to interact with the platform API and sign transactions would be beneficial.

### 7.2 Legal Gaps
*   **Jurisdictional Enforcement**: While Ricardian Contracts aim for legal enforceability, the global and decentralized nature of AI agents introduces complexities. The enforceability of a "Choice of Law" clause in a dispute between two agents in different jurisdictions, or where one agent is stateless, needs continuous legal review.
*   **Regulatory Compliance (AI-specific)**: The evolving landscape of AI regulation (e.g., EU AI Act, US AI Bill of Rights) may introduce new requirements for transparency, accountability, and auditability that the platform must adapt to.
*   **Liability Attribution**: In cases of agent malfunction or malicious activity, clearly attributing liability between the agent owner, the platform, and the service provider remains a complex legal challenge. The Ricardian Contract must explicitly address this.

### 7.3 Operational Gaps
*   **Dispute Resolution Mechanism**: While an arbitration interface is planned, the actual process (human arbitrators, decentralized autonomous organizations (DAOs) for arbitration, or a hybrid model) needs to be fully defined and implemented. This includes rules for evidence submission, decision-making, and enforcement.
*   **Oracle Network for Proof-of-Work**: For contracts requiring verification of off-chain performance, a robust and decentralized oracle network will be essential. This could involve integrating with existing oracle solutions (e.g., Chainlink) or building a specialized network of validators.
*   **Community Governance**: As the platform grows, establishing a transparent and fair governance model (e.g., a DAO) for template updates, fee adjustments, and dispute resolution could foster trust and decentralization.

### 7.4 Future Enhancements
*   **Advanced Analytics**: Provide insights into agent behavior, contract performance, and market trends based on aggregated, anonymized contract data.
*   **Reputation Scoring for Service Providers**: Extend the ERC-8004 concept to service providers, allowing agents to choose reliable counterparties based on on-chain reputation.
*   **Automated Contract Generation (AI-assisted)**: Leverage AI to assist in drafting custom contract clauses or suggesting optimal terms based on historical data and legal precedents.

---

## 8. References

[1] MarketsandMarkets. (2025). AI Agents Market Size, Share & Trends. https://www.marketsandmarkets.com/Market-Reports/ai-agents-market-15761548.html
[2] Hetzner Online GmbH. (2026). Dedicated Server Pricing & Price Adjustments. https://www.hetzner.com/dedicated-rootserver/
[3] ERC-8004: Trustless Agents - Ethereum Improvement Proposals. (n.d.). Retrieved from https://eips.ethereum.org/EIPS/eip-8004
[4] Ricardian Contracts: A Smarter Way to Do Smart Contracts?. (n.d.). Retrieved from https://medium.com/@jurij.lampic/ricardian-contracts-a-smarter-way-to-do-smart-contracts-b6743752bb8b
[5] x402 - Payment Required | Internet-Native Payments Standard. (n.d.). Retrieved from https://www.x402.org/
