import { describe, it, expect } from 'vitest';
import { hashContract } from '../contract-engine';

describe('hashContract', () => {
  it('produces a valid 64-char hex SHA-256 hash', () => {
    const hash = hashContract('Hello World', { key: 'value' });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic — same input produces same hash', () => {
    const human = 'This is a contract between parties A and B.';
    const machine = { party_a: 'Alice', party_b: 'Bob', amount: 100 };
    const hash1 = hashContract(human, machine);
    const hash2 = hashContract(human, machine);
    expect(hash1).toBe(hash2);
  });

  it('changes when human-readable text changes', () => {
    const machine = { party_a: 'Alice', amount: 100 };
    const hash1 = hashContract('Version 1 of the contract.', machine);
    const hash2 = hashContract('Version 2 of the contract.', machine);
    expect(hash1).not.toBe(hash2);
  });

  it('changes when machine-readable data changes', () => {
    const human = 'Same human-readable text.';
    const hash1 = hashContract(human, { amount: 100 });
    const hash2 = hashContract(human, { amount: 200 });
    expect(hash1).not.toBe(hash2);
  });

  it('produces same hash regardless of key insertion order', () => {
    const human = 'Contract text.';
    const hash1 = hashContract(human, { b: 2, a: 1, c: 3 });
    const hash2 = hashContract(human, { a: 1, c: 3, b: 2 });
    expect(hash1).toBe(hash2);
  });

  it('handles empty machine-readable object', () => {
    const hash = hashContract('Some text.', {});
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles complex nested machine-readable data', () => {
    const human = 'Complex contract.';
    const machine = {
      principal_declaration: {
        agent_id: '0x1234',
        principal_name: 'Acme Corp',
        principal_type: 'company',
      },
      terms: {
        spending_limit: 10000,
        categories: ['cloud', 'data'],
      },
      created_at: '2026-01-01T00:00:00Z',
    };
    const hash = hashContract(human, machine);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    // Verify determinism with same complex input
    expect(hashContract(human, machine)).toBe(hash);
  });

  it('handles unicode content', () => {
    const hash = hashContract(
      'Līgums starp pusēm — šis ir tests ar latviešu valodas burtiem.',
      { puse_a: 'Jānis', puse_b: 'Pēteris' },
    );
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
