import { describe, it, expect } from 'vitest';
import { contractRefColumn } from '@/lib/contract/lookup';

describe('contractRefColumn', () => {
  it('maps the three accepted forms to their columns', () => {
    expect(contractRefColumn('amb-2026-0042')).toBe('contract_id');
    expect(contractRefColumn('a'.repeat(64))).toBe('sha256_hash');
    expect(contractRefColumn('3f2b8c1e-9d4a-4e6b-8f7c-1a2b3c4d5e6f')).toBe('id');
  });

  // The placeholder agents copied from the docs on 2026-10-14; it used to reach
  // Postgres as id=eq.uuid-example and fail there as an invalid uuid.
  it('refuses the docs placeholder instead of sending it to the uuid column', () => {
    expect(contractRefColumn('uuid-example')).toBeNull();
  });

  it('refuses a uuid-shaped prefix, a short hash and an empty string', () => {
    expect(contractRefColumn('3f2b8c1e-9d4a-zzzz')).toBeNull();
    expect(contractRefColumn('a'.repeat(63))).toBeNull();
    expect(contractRefColumn('')).toBeNull();
  });
});
