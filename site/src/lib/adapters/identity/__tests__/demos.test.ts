import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/zk/verify-identity-proof', () => ({ verifyZKIdentityProof: vi.fn() }));

import { verifyZKIdentityProof } from '@/lib/zk/verify-identity-proof';
import { DemosIdentityAdapter } from '../demos';

const attestation = {
  nullifier_hash: '9999',
  merkle_root: '8888',
  proof: { pi_a: [], pi_b: [], pi_c: [], protocol: 'groth16' },
  public_signals: ['1111', '3333', '2222'],
  provider: 'wallet',
};
const token = JSON.stringify(attestation);

beforeEach(() => {
  vi.mocked(verifyZKIdentityProof).mockReset();
  vi.mocked(verifyZKIdentityProof).mockResolvedValue({ valid: true, nullifier: '1111', merkleRoot: '2222' });
});

describe('DemosIdentityAdapter', () => {
  it('verifies for the given contract and reports the proof\'s own nullifier and root', async () => {
    const res = await new DemosIdentityAdapter().verify(token, '0xAbC', 'amb-2026-0042');
    expect(vi.mocked(verifyZKIdentityProof).mock.calls[0][1]).toBe('amb-2026-0042');
    expect(res?.metadata).toMatchObject({ nullifier_hash: '1111', merkle_root: '2222' });
  });

  it('verifies nothing without a contract', async () => {
    expect(await new DemosIdentityAdapter().verify(token, '0xAbC')).toBeNull();
    expect(verifyZKIdentityProof).not.toHaveBeenCalled();
  });

  it('returns null for a proof that does not verify', async () => {
    vi.mocked(verifyZKIdentityProof).mockResolvedValue({ valid: false, nullifier: '', merkleRoot: '', code: 'zk_proof_invalid' });
    expect(await new DemosIdentityAdapter().verify(token, '0xAbC', 'amb-2026-0042')).toBeNull();
  });
});
