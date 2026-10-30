import { describe, it, expect, vi, beforeEach } from 'vitest';

// storeContract is where every contract row is inserted. These cases check the
// columns it writes, not the integrity re-read or the wallet binding after it.
let inserted: Record<string, unknown>[] = [];
let singleCalls = 0;

vi.mock('@/lib/supabase-admin', () => {
  const chain: Record<string, unknown> = {};
  chain.insert = (row: Record<string, unknown>) => {
    inserted.push(row);
    return chain;
  };
  chain.select = () => chain;
  chain.eq = () => chain;
  // The first .single() answers the insert; the integrity re-read finds nothing and is skipped.
  chain.single = async () =>
    singleCalls++ === 0
      ? { data: { id: 'row-1', contract_id: 'amb-2026-0001', sha256_hash: 'h', status: 'draft', created_at: 'now' }, error: null }
      : { data: null, error: null };
  return { getSupabaseAdmin: () => ({ from: () => chain }) };
});

const BASE = {
  contractId: 'amb-2026-0001',
  templateId: 'tpl-1',
  humanReadable: 'h',
  machineReadable: {},
  sha256Hash: 'h',
  principalDeclaration: {},
  parameters: {},
};

beforeEach(() => {
  inserted = [];
  singleCalls = 0;
});

describe('storeContract', () => {
  it('writes the template category to contract_type', async () => {
    const { storeContract } = await import('../contract-engine');
    await storeContract({ ...BASE, contractType: 'delegation' });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ template_id: 'tpl-1', contract_type: 'delegation' });
  });
});
