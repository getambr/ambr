export interface UseCase {
  id: string;
  title: string;
  scenario: string;
  parties: string[];
  contractTerms: string;
  outcome: string;
  integrations: {
    payments: string;
    reputation: string;
    contract: string;
  };
}

export const useCases: UseCase[] = [
  {
    id: 'agent-delegation',
    title: 'Agent Delegation Authorization',
    scenario:
      'A logistics company authorizes its AI procurement agent to purchase supplies up to $5,000/month. The Delegation Contract specifies spending caps, approved vendor categories, and liability terms — giving the agent verifiable, on-chain proof of authorization.',
    parties: ['Acme Logistics (Principal)', 'Procurement Agent (Authorized Representative)'],
    contractTerms: 'Spending cap ($5,000/mo), approved categories (office supplies, shipping materials), excluded vendors list, liability terms',
    outcome: 'Delegation Contract signed, cNFT minted to company + agent wallets, agent can prove authorization to any vendor',
    integrations: {
      payments: 'x402 V2 payments on Base within authorized limits',
      reputation: 'ERC-8004 identity registry verifies the agent\'s principal company',
      contract: 'Ricardian Delegation Contract with Principal Declaration naming Acme Logistics as the authorizing entity',
    },
  },
  {
    id: 'agent-procurement',
    title: 'Agent-Executed Procurement',
    scenario:
      'A company\'s authorized agent negotiates and purchases cloud compute from a vendor. Ambr generates a dual-format Commerce Contract — human-readable for the vendor\'s legal team, machine-parsable JSON for the agent — with payment flowing via x402 V2.',
    parties: ['TechCorp (Principal)', 'Purchasing Agent (Authorized)', 'CloudVendor Inc. (Counterparty)'],
    contractTerms: 'GPU allocation (A100 x4), 99.9% uptime SLA, $2,400/mo pricing, 90-day term, auto-renewal clause',
    outcome: 'Commerce Contract signed by agent on behalf of TechCorp, cNFT minted, vendor legal team can review via Reader Portal',
    integrations: {
      payments: 'x402 V2 session-based billing with Nevermined metering',
      reputation: 'ERC-8004 reputation check on vendor before contract signing',
      contract: 'Dual-format Ricardian Contract — legal text for vendor counsel, structured JSON for agent enforcement',
    },
  },
  {
    id: 'agent-service-agreement',
    title: 'Agent-Signed Service Agreement',
    scenario:
      'A marketing agency\'s AI agent negotiates and signs a SaaS analytics contract on behalf of the agency. The contract includes data handling terms, SLA guarantees, and an IETF ADP dispute resolution clause — all enforceable under the agency\'s delegation authority.',
    parties: ['BrightStar Agency (Principal)', 'Negotiation Agent (Authorized)', 'AnalyticsPro SaaS (Counterparty)'],
    contractTerms: 'Enterprise tier access, data retention (12 months), GDPR compliance clause, 99.5% uptime SLA, $499/mo',
    outcome: 'Service agreement signed at machine speed, cNFT as proof of agreement, amendment chain for future upgrades',
    integrations: {
      payments: 'Monthly billing via x402 V2 with automatic renewal payments',
      reputation: 'ERC-8004 validation registry confirms SaaS provider\'s track record',
      contract: 'Ricardian Contract with IETF ADP dispute resolution, Principal Declaration naming BrightStar Agency',
    },
  },
  {
    id: 'compliance-audit',
    title: 'Compliance Audit Trail',
    scenario:
      'An enterprise legal team needs to review all contracts their AI agents have executed over the past quarter. Using the Reader Portal, they search by agent wallet, verify on-chain hashes, follow amendment chains, and export PDF reports for regulatory filing.',
    parties: ['Enterprise Legal Team', 'Multiple AI Agents (Company-Authorized)', 'Various Counterparties'],
    contractTerms: 'All delegation and commerce contracts executed in Q1 2026, including amendments and extensions',
    outcome: 'Full audit trail via Reader Portal — view, verify, print any contract by hash or cNFT ID, follow amendment chains',
    integrations: {
      payments: 'Payment records linked to each contract via x402 V2 transaction metadata',
      reputation: 'ERC-8004 identity verification confirms which agents acted on behalf of the company',
      contract: 'Immutable cNFT records with parent_contract_hash linking originals to amendments and extensions',
    },
  },
];
