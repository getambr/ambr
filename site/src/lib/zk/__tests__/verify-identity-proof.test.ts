import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';
import { contractAttestationContext } from '../context';
import type { IdentityAttestationPayload } from '../types';

// The SDK's root export pulls in chain bridges, so the SDK is mocked, but its
// context encoding is the real one: the module has no dependencies, and the
// test then checks the server against the SDK's own field encoding.
const { verifyProof } = vi.hoisted(() => ({ verifyProof: vi.fn() }));
vi.mock('@kynesyslabs/demosdk', async () => {
  const real = await import(
    /* @vite-ignore */ pathToFileURL(
      path.resolve(process.cwd(), 'node_modules/@kynesyslabs/demosdk/build/encryption/zK/identity/attestationContext.js'),
    ).href
  );
  return {
    encryption: {
      zK: {
        identity: {
          ProofGenerator: { verifyProof },
          attestationContextSignal: real.attestationContextSignal,
          ZK_ATTESTATION_CONTEXT: real.ZK_ATTESTATION_CONTEXT,
        },
      },
    },
  };
});

import { verifyZKIdentityProof } from '../verify-identity-proof';

// The SDK's own encoding, through the mock above (variable specifier, as in the
// code under test, so the SDK's types are not loaded).
const sdkName = '@kynesyslabs/demosdk';
const { attestationContextSignal, ZK_ATTESTATION_CONTEXT } = (await import(/* @vite-ignore */ sdkName)).encryption.zK
  .identity as { attestationContextSignal: (context?: string) => string; ZK_ATTESTATION_CONTEXT: string };

const CONTRACT = 'amb-2026-0042';
const OTHER_CONTRACT = 'amb-2026-0043';
const NULLIFIER = '14803402396258771566883424012284251433283393560425651975718333321404285374';
const ROOT = '9137417598265364738265234618237364018277364598273645982734659827346598273';
const FIELD = '21888242871839275222246405745257275088548364400416034343698204186575808495617';

function attestation(over: Partial<IdentityAttestationPayload> = {}): IdentityAttestationPayload {
  return {
    nullifier_hash: NULLIFIER,
    merkle_root: ROOT,
    proof: { pi_a: ['1', '2', '1'], pi_b: [['1', '2'], ['3', '4'], ['1', '0']], pi_c: ['1', '2', '1'], protocol: 'groth16' },
    public_signals: [NULLIFIER, attestationContextSignal(contractAttestationContext(CONTRACT)), ROOT],
    provider: 'wallet',
    ...over,
  };
}

const fetchMock = vi.fn();
const nodeSays = (body: unknown, status = 200) =>
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  verifyProof.mockReset().mockResolvedValue(true);
  fetchMock.mockReset();
  nodeSays({ rootHash: ROOT });
  vi.stubGlobal('fetch', fetchMock);
  delete process.env.DEMOS_RPC_URL;
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.DEMOS_RPC_URL;
});

describe('verifyZKIdentityProof', () => {
  it('accepts a proof for this contract against the node\'s current root, and returns the signals\' nullifier and root', async () => {
    const a = attestation();
    const res = await verifyZKIdentityProof(a, CONTRACT);
    expect(res).toEqual({ valid: true, nullifier: NULLIFIER, merkleRoot: ROOT });
    expect(verifyProof).toHaveBeenCalledWith(a.proof, a.public_signals);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://rpc.demos.sh/zk/merkle-root');
  });

  it('does not need the request to repeat the nullifier and root', async () => {
    const res = await verifyZKIdentityProof(
      attestation({ nullifier_hash: undefined, merkle_root: undefined } as unknown as Partial<IdentityAttestationPayload>),
      CONTRACT,
    );
    expect(res).toEqual({ valid: true, nullifier: NULLIFIER, merkleRoot: ROOT });
  });

  it('reads the root from DEMOS_RPC_URL when it is set', async () => {
    process.env.DEMOS_RPC_URL = 'https://node.example.test/';
    await verifyZKIdentityProof(attestation(), CONTRACT);
    expect(fetchMock.mock.calls[0][0]).toBe('https://node.example.test/zk/merkle-root');
  });

  it('accepts a node root written in hex when it is the same number', async () => {
    nodeSays({ rootHash: '0x' + BigInt(ROOT).toString(16) });
    expect((await verifyZKIdentityProof(attestation(), CONTRACT)).valid).toBe(true);
  });

  describe('public signals', () => {
    it.each([
      ['two signals', [NULLIFIER, ROOT]],
      ['four signals', [NULLIFIER, attestationContextSignal(contractAttestationContext(CONTRACT)), ROOT, '1']],
      ['none', []],
    ])('rejects %s without verifying or asking the node', async (_name, signals) => {
      const res = await verifyZKIdentityProof(attestation({ public_signals: signals }), CONTRACT);
      expect(res).toMatchObject({ valid: false, code: 'zk_bad_signals', nullifier: '', merkleRoot: '' });
      expect(verifyProof).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects public_signals that is not an array', async () => {
      const res = await verifyZKIdentityProof(
        attestation({ public_signals: 'abc' as unknown as string[] }),
        CONTRACT,
      );
      expect(res).toMatchObject({ valid: false, code: 'zk_bad_signals' });
    });

    const ctx = attestationContextSignal(contractAttestationContext(CONTRACT));
    it.each([
      ['hex', ['0x1', ctx, ROOT]],
      ['a leading zero', ['0123', ctx, ROOT]],
      ['a negative number', ['-5', ctx, ROOT]],
      ['a number, not a string', [5 as unknown as string, ctx, ROOT]],
      ['a value at the field order', [NULLIFIER, ctx, FIELD]],
      ['an empty string', ['', ctx, ROOT]],
    ])('rejects %s as a signal', async (_name, signals) => {
      const res = await verifyZKIdentityProof(attestation({ public_signals: signals, nullifier_hash: undefined, merkle_root: undefined } as unknown as Partial<IdentityAttestationPayload>), CONTRACT);
      expect(res).toMatchObject({ valid: false, code: 'zk_bad_signals' });
      expect(verifyProof).not.toHaveBeenCalled();
    });

    it('rejects the 2.x signal order [nullifier, merkleRoot, context]', async () => {
      const res = await verifyZKIdentityProof(
        attestation({ public_signals: [NULLIFIER, ROOT, ctx] }),
        CONTRACT,
      );
      expect(res).toMatchObject({ valid: false, code: 'zk_signal_mismatch' });
    });
  });

  describe('the request\'s own nullifier and root fields', () => {
    it('rejects a nullifier_hash that is not the first signal, even though the proof verifies', async () => {
      const res = await verifyZKIdentityProof(attestation({ nullifier_hash: '12345' }), CONTRACT);
      expect(res).toMatchObject({ valid: false, code: 'zk_signal_mismatch', nullifier: '' });
      expect(verifyProof).not.toHaveBeenCalled();
    });

    it('rejects a merkle_root that is not the third signal', async () => {
      const res = await verifyZKIdentityProof(attestation({ merkle_root: '12345' }), CONTRACT);
      expect(res).toMatchObject({ valid: false, code: 'zk_signal_mismatch' });
    });

    it('rejects a field that is present but not a string', async () => {
      const res = await verifyZKIdentityProof(
        attestation({ nullifier_hash: 5 as unknown as string }),
        CONTRACT,
      );
      expect(res).toMatchObject({ valid: false, code: 'zk_signal_mismatch' });
    });
  });

  describe('context', () => {
    it('rejects a proof made for another contract', async () => {
      const other = attestation({
        public_signals: [NULLIFIER, attestationContextSignal(contractAttestationContext(OTHER_CONTRACT)), ROOT],
      });
      const res = await verifyZKIdentityProof(other, CONTRACT);
      expect(res).toMatchObject({ valid: false, code: 'zk_context_mismatch' });
      expect(verifyProof).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a proof under the SDK\'s default context', async () => {
      const dflt = attestation({
        public_signals: [NULLIFIER, attestationContextSignal(ZK_ATTESTATION_CONTEXT), ROOT],
      });
      expect(await verifyZKIdentityProof(dflt, CONTRACT)).toMatchObject({ valid: false, code: 'zk_context_mismatch' });
    });

    it('rejects a context signal of zero', async () => {
      const res = await verifyZKIdentityProof(attestation({ public_signals: [NULLIFIER, '0', ROOT] }), CONTRACT);
      expect(res).toMatchObject({ valid: false, code: 'zk_context_mismatch' });
    });

    it('uses the encoding of the context string the client proves under', () => {
      expect(contractAttestationContext(CONTRACT)).toBe(`ambr_contract:${CONTRACT}`);
    });
  });

  describe('missing input', () => {
    it('rejects a missing contract id', async () => {
      expect(await verifyZKIdentityProof(attestation(), '')).toMatchObject({ valid: false, code: 'zk_missing_fields' });
    });

    it('rejects a missing proof or signals', async () => {
      expect(
        await verifyZKIdentityProof(attestation({ proof: undefined } as unknown as Partial<IdentityAttestationPayload>), CONTRACT),
      ).toMatchObject({ valid: false, code: 'zk_missing_fields' });
      expect(
        await verifyZKIdentityProof(attestation({ public_signals: undefined } as unknown as Partial<IdentityAttestationPayload>), CONTRACT),
      ).toMatchObject({ valid: false, code: 'zk_missing_fields' });
    });
  });

  describe('the Groth16 proof', () => {
    it('rejects a proof that does not verify, without asking the node', async () => {
      verifyProof.mockResolvedValue(false);
      const res = await verifyZKIdentityProof(attestation(), CONTRACT);
      expect(res).toMatchObject({ valid: false, code: 'zk_proof_invalid', nullifier: '', merkleRoot: '' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects when the verifier throws', async () => {
      verifyProof.mockRejectedValue(new Error('ZK proof verification failed: bad point'));
      const res = await verifyZKIdentityProof(attestation(), CONTRACT);
      expect(res).toMatchObject({ valid: false, code: 'zk_proof_invalid' });
      expect(res.error).toContain('bad point');
    });
  });

  describe('the Merkle root', () => {
    it('rejects a root that is not the node\'s current root', async () => {
      nodeSays({ rootHash: '777' });
      const res = await verifyZKIdentityProof(attestation(), CONTRACT);
      expect(res).toMatchObject({ valid: false, code: 'zk_root_mismatch', nullifier: '', merkleRoot: '' });
    });

    it('fails closed when the node cannot be reached', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));
      const res = await verifyZKIdentityProof(attestation(), CONTRACT);
      expect(res).toMatchObject({ valid: false, code: 'zk_root_unverified' });
    });

    it('fails closed when the request times out', async () => {
      fetchMock.mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
      expect(await verifyZKIdentityProof(attestation(), CONTRACT)).toMatchObject({
        valid: false,
        code: 'zk_root_unverified',
      });
    });

    it('asks the node with a timeout and without caching', async () => {
      await verifyZKIdentityProof(attestation(), CONTRACT);
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(init.cache).toBe('no-store');
    });

    it('fails closed when the node answers with an error status', async () => {
      nodeSays({ error: 'busy' }, 503);
      expect(await verifyZKIdentityProof(attestation(), CONTRACT)).toMatchObject({ valid: false, code: 'zk_root_unverified' });
    });

    it.each([
      ['no rootHash', {}],
      ['a rootHash that is not a string', { rootHash: 5 }],
      ['an empty rootHash', { rootHash: '' }],
      ['junk', { rootHash: 'not a number' }],
      ['null', null],
    ])('fails closed when the node answers with %s', async (_name, body) => {
      nodeSays(body);
      expect(await verifyZKIdentityProof(attestation(), CONTRACT)).toMatchObject({ valid: false, code: 'zk_root_unverified' });
    });

    it('fails closed when the node answers with something that is not JSON', async () => {
      fetchMock.mockResolvedValue(new Response('<html>', { status: 200 }));
      expect(await verifyZKIdentityProof(attestation(), CONTRACT)).toMatchObject({ valid: false, code: 'zk_root_unverified' });
    });
  });
});
