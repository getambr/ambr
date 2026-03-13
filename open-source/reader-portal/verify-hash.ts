import { createHash } from 'crypto';

/**
 * Verify a Ricardian Contract's SHA-256 hash.
 *
 * Canonical format:
 *   humanReadable + "\n---\n" + JSON.stringify(sortedMachineReadable)
 *
 * Keys in machineReadable are sorted alphabetically (top-level only)
 * before stringification to ensure deterministic hashing.
 */
export function verifyHash(
  humanReadable: string,
  machineReadable: Record<string, unknown>,
  storedHash: string,
): boolean {
  const computed = computeHash(humanReadable, machineReadable);
  return computed === storedHash;
}

/**
 * Compute the SHA-256 hash of a Ricardian Contract.
 */
export function computeHash(
  humanReadable: string,
  machineReadable: Record<string, unknown>,
): string {
  const sortedKeys = Object.keys(machineReadable).sort();
  const sortedObj = Object.fromEntries(
    sortedKeys.map((k) => [k, machineReadable[k]]),
  );
  const canonical = humanReadable + '\n---\n' + JSON.stringify(sortedObj);
  return createHash('sha256').update(canonical, 'utf-8').digest('hex');
}
