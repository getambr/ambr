import { describe, it, expect } from 'vitest';
import { buildNftMetadata } from '@/lib/chain/cnft-metadata';

const base = { contract_id: 'AMB-1', sha256_hash: 'a'.repeat(64) };
const status = (m: ReturnType<typeof buildNftMetadata>) => m.attributes.find((a) => a.trait_type === 'Status')?.value;

describe('buildNftMetadata status', () => {
  it('keeps the signed-and-verified wording for an active contract', () => {
    const m = buildNftMetadata({ ...base, status: 'active' });
    expect(status(m)).toBe('active');
    expect(m.description).toContain('Signed and verified on the Ambr protocol');
  });

  it('says when a contract was revoked and drops the active wording', () => {
    const m = buildNftMetadata({ ...base, status: 'revoked', revoked_at: '2026-10-20T12:00:00Z' });
    expect(status(m)).toBe('revoked');
    expect(m.description).toContain('Revoked on 2026-10-20');
    expect(m.description).not.toContain('Signed and verified');
  });

  it('says when a contract expired, by status or by expiry_date', () => {
    const byStatus = buildNftMetadata({ ...base, status: 'expired', expiry_date: '2026-09-01T00:00:00Z' });
    expect(status(byStatus)).toBe('expired');
    expect(byStatus.description).toContain('Expired on 2026-09-01');
    const byDate = buildNftMetadata({ ...base, status: 'active', expiry_date: '2020-01-01T00:00:00Z' });
    expect(status(byDate)).toBe('expired');
  });

  it('marks unsigned contracts pending', () => {
    const m = buildNftMetadata({ ...base, status: 'pending_signature' });
    expect(status(m)).toBe('pending');
    expect(m.description).not.toContain('Signed and verified');
  });
});
