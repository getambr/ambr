import { describe, it, expect, afterEach, vi } from 'vitest';
import { isZKIdentityEnabled, zkSigningGate } from '../feature';

afterEach(() => vi.unstubAllEnvs());

describe('isZKIdentityEnabled', () => {
  it('is off when the variable is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_ZK_IDENTITY_ENABLED', undefined as unknown as string);
    expect(isZKIdentityEnabled()).toBe(false);
  });

  it.each(['', 'false', '1', 'TRUE', 'True', ' true'])('is off for %j', (v) => {
    vi.stubEnv('NEXT_PUBLIC_ZK_IDENTITY_ENABLED', v);
    expect(isZKIdentityEnabled()).toBe(false);
  });

  it('is on only for exactly "true"', () => {
    vi.stubEnv('NEXT_PUBLIC_ZK_IDENTITY_ENABLED', 'true');
    expect(isZKIdentityEnabled()).toBe(true);
  });
});

describe('zkSigningGate', () => {
  it('changes nothing for a contract that does not require a ZK identity', () => {
    expect(zkSigningGate(false, false)).toBe('not_required');
    expect(zkSigningGate(undefined, false)).toBe('not_required');
    expect(zkSigningGate(false, true)).toBe('not_required');
  });

  it('shows the coming-soon notice when required and the flag is off', () => {
    expect(zkSigningGate(true, false)).toBe('coming_soon');
  });

  it('offers verification when required and the flag is on', () => {
    expect(zkSigningGate(true, true)).toBe('verify');
  });
});
