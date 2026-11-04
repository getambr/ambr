import { describe, it, expect, vi, beforeEach } from 'vitest';

// The amendment approval flow is the only writer of an amendment row: it loads the
// parent itself and passes its hash and the type 'amendment' to storeContract.

const APPROVER = '0x' + 'b'.repeat(40);
const PROPOSER = '0x' + 'a'.repeat(40);
const PARENT_HASH = 'd'.repeat(64);
const PARENT_ID = 'amb-2026-0001';

type Row = Record<string, unknown> | null;
let tables: Record<string, Row>;

const validateApiKey = vi.fn();
const storeContract = vi.fn();

vi.mock('@/lib/api-auth', () => ({ validateApiKey: (...a: unknown[]) => validateApiKey(...a) }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ allowed: true, resetAt: 0 }) }));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/chain/cnft-mint', () => ({ mintContractNFTAsync: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/llm/generate-contract', () => ({
  generateContract: vi.fn().mockResolvedValue({ humanReadable: 'h', machineReadable: {} }),
}));
vi.mock('@/lib/contract-engine', () => ({
  hashContract: () => 'e'.repeat(64),
  generateContractId: async () => 'amb-2026-0002',
  storeContract: (...a: unknown[]) => storeContract(...a),
  decrementCredits: vi.fn().mockResolvedValue(900),
  grantCredits: vi.fn(),
}));
vi.mock('@/lib/supabase-admin', () => {
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      update: () => chain,
      insert: async () => ({ error: null }),
      single: async () => ({ data: tables[table] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve({ error: null }),
    };
    return chain;
  };
  return { getSupabaseAdmin: () => ({ from: builder }) };
});

function approve() {
  return import('../amendments/[proposalId]/approve/route').then(({ POST }) =>
    POST(
      new Request(`https://getamber.dev/api/v1/contracts/${PARENT_ID}/amendments/prop-1/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
      { params: Promise.resolve({ id: PARENT_ID, proposalId: 'prop-1' }) },
    ),
  );
}

beforeEach(() => {
  validateApiKey.mockReset();
  storeContract.mockReset();
  validateApiKey.mockResolvedValue({
    keyId: 'key-approver',
    email: 'approver@example.com',
    credits: 1000,
    principalWallet: APPROVER,
  });
  storeContract.mockResolvedValue({ id: 'row-2', contract_id: 'amb-2026-0002', sha256_hash: 'e'.repeat(64), status: 'active', created_at: 'now' });
  tables = {
    contracts: {
      id: 'row-1',
      contract_id: PARENT_ID,
      sha256_hash: PARENT_HASH,
      template_id: 'tpl-1',
      status: 'active',
      machine_readable: {},
      oversight_threshold_usd: null,
      visibility: 'private',
      nft_token_id: null,
      nft_counterparty_token_id: null,
      principal_declaration: { agent_id: PROPOSER, principal_name: 'Acme', principal_type: 'company' },
    },
    amendment_proposals: {
      id: 'prop-1',
      original_contract_id: 'row-1',
      proposer_wallet: PROPOSER,
      proposed_parameters: { service: 'y' },
      status: 'pending',
      approval_required_from: APPROVER,
      expires_at: null,
      proposed_visibility: null,
    },
    templates: { id: 'tpl-1', slug: 'a1-service-purchase', category: 'consumer', price_cents: 20, is_one_sided: false },
  };
});

describe('amendment approval sets the amendment fields from the parent it loaded', () => {
  it("stores the loaded parent's hash and the type 'amendment'", async () => {
    const res = await approve();
    expect(res.status).toBe(200);
    expect(storeContract).toHaveBeenCalledTimes(1);
    expect(storeContract).toHaveBeenCalledWith(
      expect.objectContaining({ parentContractHash: PARENT_HASH, amendmentType: 'amendment' }),
    );
  });

  it('stores nothing when the caller is not the proposal approver', async () => {
    validateApiKey.mockResolvedValue({
      keyId: 'key-stranger',
      email: 'stranger@example.com',
      credits: 1000,
      principalWallet: '0x' + 'c'.repeat(40),
    });
    const res = await approve();
    expect(res.status).toBe(403);
    expect(storeContract).not.toHaveBeenCalled();
  });
});
