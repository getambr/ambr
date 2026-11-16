import { describe, it, expect } from 'vitest';
import { isBearerAuthorized } from '@/lib/bearer-auth';

const req = (authorization?: string) =>
  new Request('https://example.test/x', {
    headers: authorization === undefined ? {} : { authorization },
  });

describe('isBearerAuthorized', () => {
  it('fails closed when the secret is unset', () => {
    expect(isBearerAuthorized(req('Bearer undefined'), undefined)).toBe(false);
    expect(isBearerAuthorized(req('Bearer '), undefined)).toBe(false);
  });

  it('fails closed when the secret is empty', () => {
    expect(isBearerAuthorized(req('Bearer '), '')).toBe(false);
    expect(isBearerAuthorized(req(''), '')).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(isBearerAuthorized(req(), 's3cret')).toBe(false);
  });

  it('rejects a wrong secret of the same length', () => {
    expect(isBearerAuthorized(req('Bearer s3creX'), 's3cret')).toBe(false);
  });

  it('rejects a header of a different length without throwing', () => {
    expect(isBearerAuthorized(req('Bearer s3cret-and-more'), 's3cret')).toBe(false);
    expect(isBearerAuthorized(req('Bearer s3'), 's3cret')).toBe(false);
  });

  it('rejects the bare secret without the Bearer scheme', () => {
    expect(isBearerAuthorized(req('s3cret'), 's3cret')).toBe(false);
  });

  it('accepts the right secret', () => {
    expect(isBearerAuthorized(req('Bearer s3cret'), 's3cret')).toBe(true);
  });
});
