/**
 * Deterministic canonicalization + hashing for DACS artifacts.
 *
 * The DACS signature scheme (§7.7) specifies RFC 8785 (JCS) canonical form.
 * For the MVP we use the same deterministic deep-key-sort + JSON.stringify that
 * `contract-engine.hashContract()` already relies on (Postgres JSONB also sorts
 * keys, so this round-trips). This is JCS-EQUIVALENT for the value shapes we
 * emit (objects, strings, integers within the IEEE-754 safe range, booleans,
 * null, arrays).
 *
 * TODO before cross-implementation conformance: swap in strict RFC 8785 (number
 * formatting + string escaping edge cases). Nothing external verifies our
 * artifacts yet, so the deterministic form is sufficient for now.
 *
 * This module is for SERVER-SIDE DACS ARTIFACT signing/hashing only. It does NOT
 * touch the user contract-signing path (`contract-engine.hashContract` + the
 * sign endpoint) — that invariant is load-bearing for live contracts/cNFTs.
 */

import { createHash } from 'crypto';

function deepSortKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(deepSortKeys);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    sorted[key] = deepSortKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

/** Canonical (deterministic) JSON string of an artifact. */
export function canonicalize(obj: unknown): string {
  return JSON.stringify(deepSortKeys(obj));
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf-8').digest('hex');
}

/** sha256(canonical(obj)), hex-encoded. */
export function canonicalHash(obj: unknown): string {
  return sha256Hex(canonicalize(obj));
}
