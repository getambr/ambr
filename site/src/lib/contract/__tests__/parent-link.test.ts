import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callerOwnsParent, forgesAmendmentType } from '../parent-link';

let parentRow: Record<string, unknown> | null;
let queriedHash: unknown;

vi.mock('@/lib/supabase-admin', () => {
  const chain = {
    select: () => chain,
    eq: (_col: string, val: unknown) => {
      queriedHash = val;
      return chain;
    },
    single: async () => ({ data: parentRow }),
  };
  return { getSupabaseAdmin: () => ({ from: () => chain }) };
});

const HASH = 'c'.repeat(64);
const PAYER = '0x' + 'a'.repeat(40);

beforeEach(() => {
  parentRow = null;
  queriedHash = undefined;
});

describe('forgesAmendmentType', () => {
  it('lets the default through and refuses everything else', () => {
    expect(forgesAmendmentType(undefined)).toBe(false);
    expect(forgesAmendmentType(null)).toBe(false);
    expect(forgesAmendmentType('original')).toBe(false);
    expect(forgesAmendmentType('amendment')).toBe(true);
    expect(forgesAmendmentType('extension')).toBe(true);
    expect(forgesAmendmentType('anything')).toBe(true);
  });
});

describe('callerOwnsParent', () => {
  it('is false when the parent does not exist', async () => {
    expect(await callerOwnsParent(HASH, { keyId: 'key-1' })).toBe(false);
    expect(queriedHash).toBe(HASH);
  });

  it('is true for the API key that created the parent', async () => {
    parentRow = { api_key_id: 'key-1', payer_wallet: null };
    expect(await callerOwnsParent(HASH, { keyId: 'key-1' })).toBe(true);
  });

  it('is false for another key', async () => {
    parentRow = { api_key_id: 'key-1', payer_wallet: null };
    expect(await callerOwnsParent(HASH, { keyId: 'key-2' })).toBe(false);
  });

  it('is true for the x402 payer of the parent, compared case-insensitively', async () => {
    parentRow = { api_key_id: null, payer_wallet: PAYER.toUpperCase().replace('0X', '0x') };
    expect(await callerOwnsParent(HASH, { payerWallet: PAYER })).toBe(true);
  });

  it('is false for another payer, and for a caller with no identity at all', async () => {
    parentRow = { api_key_id: null, payer_wallet: PAYER };
    expect(await callerOwnsParent(HASH, { payerWallet: '0x' + 'b'.repeat(40) })).toBe(false);
    expect(await callerOwnsParent(HASH, {})).toBe(false);
    expect(await callerOwnsParent(HASH, { keyId: null, payerWallet: null })).toBe(false);
  });

  it('does not let a parent with no key match a caller with no key', async () => {
    parentRow = { api_key_id: null, payer_wallet: null };
    expect(await callerOwnsParent(HASH, { keyId: null })).toBe(false);
  });
});
