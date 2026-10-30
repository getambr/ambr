/**
 * Which `contracts` column a caller-supplied contract reference addresses.
 *
 * Callers identify a contract three ways: the public `amb-…` id, the SHA-256
 * hash of its text, or the row UUID. Anything else used to fall through to the
 * `id` column, which is a uuid, so a docs placeholder such as `uuid-example`
 * reached Postgres and failed there (22P02) instead of being refused here.
 * A null result means the reference is none of the three; answer
 * INVALID_CONTRACT_REF with status 400 without querying.
 */
export type ContractRefColumn = 'contract_id' | 'sha256_hash' | 'id';

const SHA256_RE = /^[a-f0-9]{64}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function contractRefColumn(ref: string): ContractRefColumn | null {
  if (ref.startsWith('amb-')) return 'contract_id';
  if (SHA256_RE.test(ref)) return 'sha256_hash';
  if (UUID_RE.test(ref)) return 'id';
  return null;
}

export const INVALID_CONTRACT_REF = {
  error: 'invalid_contract_id',
  message: 'Contract id must be an amb- contract id, a 64-character SHA-256 hash, or a UUID.',
} as const;
