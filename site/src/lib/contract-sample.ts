export interface SampleContract {
  humanReadable: string;
  machineReadable: Record<string, unknown>;
  sha256Hash: string;
  principalDeclaration: {
    agentId: string;
    principalName: string;
    principalType: 'company' | 'individual';
  };
  amendmentChain: {
    contractHash: string;
    parentContractHash: string | null;
    type: 'original' | 'amendment' | 'extension';
    label: string;
  }[];
}

export const sampleContract: SampleContract = {
  humanReadable: `RICARDIAN CONTRACT — DELEGATION OF AUTHORITY

Contract ID: amber-2026-0042
Date: February 25, 2026

PRINCIPAL DECLARATION
Principal: Acme Logistics Ltd.
Agent: 0x7a3b...9f2e (ProcureBot AI)
Authorization: Authorized Representative

SCOPE OF DELEGATION
1. Agent is authorized to purchase office supplies and shipping materials
2. Spending limit: $5,000 per calendar month
3. Approved vendor categories: Office Supplies, Packaging, Shipping
4. Excluded vendors: None specified
5. Agent may negotiate terms but may NOT accept liability exceeding $10,000

LIABILITY
6. Principal assumes liability for all purchases within authorized scope
7. Agent actions outside authorized scope are void and non-binding
8. Dispute resolution: IETF ADP-based arbitration

DURATION
Start: 2026-02-25T00:00:00Z
End: 2026-08-25T00:00:00Z (6 months, renewable)

SIGNATURES
Principal (Acme Logistics): 0x9d2f...4b1a [signed]
Agent (ProcureBot AI): 0x7a3b...9f2e [signed]

SHA-256: a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890`,
  machineReadable: {
    contract_id: 'amber-2026-0042',
    contract_type: 'delegation_of_authority',
    version: '1.0',
    created_at: '2026-02-25T00:00:00Z',
    principal_declaration: {
      agent_id: '0x7a3b...9f2e',
      agent_name: 'ProcureBot AI',
      principal_name: 'Acme Logistics Ltd.',
      principal_type: 'company',
      role: 'authorized_representative',
    },
    scope: {
      authorized_actions: ['purchase', 'negotiate_terms'],
      spending_limit: { amount: 5000, currency: 'USD', period: 'month' },
      approved_categories: ['office_supplies', 'packaging', 'shipping'],
      excluded_vendors: [],
      max_liability: 10000,
    },
    liability: {
      principal_liable_within_scope: true,
      agent_actions_outside_scope: 'void',
      dispute_resolution: 'ietf_adp',
    },
    duration: {
      start: '2026-02-25T00:00:00Z',
      end: '2026-08-25T00:00:00Z',
      renewable: true,
    },
    signatures: {
      principal: '0x9d2f...4b1a',
      agent: '0x7a3b...9f2e',
    },
    sha256: 'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890',
  },
  sha256Hash: 'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890',
  principalDeclaration: {
    agentId: '0x7a3b...9f2e',
    principalName: 'Acme Logistics Ltd.',
    principalType: 'company',
  },
  amendmentChain: [
    {
      contractHash: 'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890',
      parentContractHash: null,
      type: 'original',
      label: 'Original Delegation Authority',
    },
    {
      contractHash: 'd4e5f6a7b8c90123abcdef4567890123abcdef4567890123abcdef4567890123',
      parentContractHash: 'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890',
      type: 'amendment',
      label: 'Spending Limit Increase ($10K/mo)',
    },
    {
      contractHash: 'g7h8i9j0k1l23456abcdef7890123456abcdef7890123456abcdef7890123456',
      parentContractHash: 'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890',
      type: 'extension',
      label: '6-Month Extension',
    },
  ],
};
