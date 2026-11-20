import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/zk/verify-identity-proof', () => ({ verifyZKIdentityProof: vi.fn() }));

import { verifyZKIdentityProof } from '@/lib/zk/verify-identity-proof';
import { POST } from '../route';

const body = {
  nullifier_hash: '1111',
  merkle_root: '2222',
  proof: { pi_a: [], pi_b: [], pi_c: [], protocol: 'groth16' },
  public_signals: ['1111', '3333', '2222'],
  provider: 'wallet',
  contract_id: 'amb-2026-0042',
};

const post = (b: unknown) =>
  POST(new Request('https://x.test/api/v1/identity/verify', { method: 'POST', body: JSON.stringify(b) }));

beforeEach(() => {
  vi.mocked(verifyZKIdentityProof).mockReset();
});

describe('POST /api/v1/identity/verify', () => {
  it('requires the contract the proof is for', async () => {
    const res = await post({ ...body, contract_id: undefined });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation_error');
    expect(verifyZKIdentityProof).not.toHaveBeenCalled();
  });

  it('verifies for that contract and answers with the proof\'s own nullifier and root', async () => {
    vi.mocked(verifyZKIdentityProof).mockResolvedValue({ valid: true, nullifier: '1111', merkleRoot: '2222' });
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ valid: true, nullifier_hash: '1111', merkle_root: '2222' });
    expect(vi.mocked(verifyZKIdentityProof).mock.calls[0][1]).toBe('amb-2026-0042');
  });

  it('answers 400 with the code for a proof that does not hold, and echoes no nullifier', async () => {
    vi.mocked(verifyZKIdentityProof).mockResolvedValue({
      valid: false, nullifier: '', merkleRoot: '', code: 'zk_root_mismatch', error: 'stale',
    });
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ valid: false, error: 'stale', code: 'zk_root_mismatch' });
  });

  it('answers 503 when the node\'s root cannot be checked', async () => {
    vi.mocked(verifyZKIdentityProof).mockResolvedValue({
      valid: false, nullifier: '', merkleRoot: '', code: 'zk_root_unverified', error: 'down',
    });
    expect((await post(body)).status).toBe(503);
  });
});
