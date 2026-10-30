import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import {
  generateClaimToken,
  hashClaimToken,
  normalizeEmail,
  buildClaimUrl,
  CLAIM_TOKEN_TTL_MINUTES,
} from '@/lib/keys/claim-token';
import { renderKeyClaim } from '@/lib/email/key-claim-template';

describe('generateClaimToken', () => {
  it('stores only the hash — the raw token must not be derivable from the database', () => {
    const { token, tokenHash } = generateClaimToken();
    expect(tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(tokenHash).not.toContain(token);
    expect(tokenHash).toHaveLength(64);
  });

  it('is unguessable — 32 bytes of entropy, never repeating', () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateClaimToken().token));
    expect(seen.size).toBe(500);
    // base64url of 32 bytes is 43 chars; anything shorter means lost entropy.
    expect([...seen][0].length).toBeGreaterThanOrEqual(43);
  });

  it('is URL-safe so the link survives email clients intact', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateClaimToken().token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('expires TTL minutes after the supplied clock, not the wall clock', () => {
    const now = Date.parse('2026-07-28T12:00:00.000Z');
    const { expiresAt } = generateClaimToken(now);
    expect(Date.parse(expiresAt) - now).toBe(CLAIM_TOKEN_TTL_MINUTES * 60_000);
  });
});

describe('hashClaimToken', () => {
  it('is deterministic, so a redeemed link matches its stored row', () => {
    expect(hashClaimToken('abc')).toBe(hashClaimToken('abc'));
  });

  it('separates tokens that differ by a single character', () => {
    expect(hashClaimToken('abc')).not.toBe(hashClaimToken('abd'));
  });
});

describe('normalizeEmail', () => {
  // Regression: the duplicate check used .eq('email', email) with no unique
  // constraint, so these were two separate free developer keys.
  it.each([
    ['User@Example.com', 'user@example.com'],
    ['  user@example.com  ', 'user@example.com'],
    ['USER@EXAMPLE.COM', 'user@example.com'],
  ])('normalises %j to %j', (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });

  it('collapses case variants to one identity', () => {
    expect(normalizeEmail('A@b.com')).toBe(normalizeEmail('a@B.COM'));
  });
});

describe('buildClaimUrl', () => {
  it('points at the reveal page and percent-encodes the token', () => {
    const url = buildClaimUrl('a+b/c=d');
    expect(url).toContain('/activate/reveal?token=');
    expect(url).toContain('a%2Bb%2Fc%3Dd');
    expect(url).not.toContain('a+b/c=d');
  });
});

describe('renderKeyClaim', () => {
  const base = { claimUrl: 'https://getamber.dev/activate/reveal?token=TOK', expiresMinutes: 30 };

  it('never puts an API key in the email body', () => {
    for (const purpose of ['claim', 'rotate'] as const) {
      const mail = renderKeyClaim({ ...base, purpose, existingPrefix: 'amb_a1b2' });
      // The whole point of the link: a live credential must not persist in an inbox.
      expect(mail.text).not.toMatch(/amb_[A-Za-z0-9_-]{20,}/);
      expect(mail.html).not.toMatch(/amb_[A-Za-z0-9_-]{20,}/);
    }
  });

  it('states the expiry so a stale link is self-explanatory', () => {
    const mail = renderKeyClaim({ ...base, purpose: 'claim' });
    expect(mail.text).toContain('30 minutes');
    expect(mail.html).toContain('30 minutes');
  });

  it('warns that replacement is destructive, and names the key being replaced', () => {
    const mail = renderKeyClaim({ ...base, purpose: 'rotate', existingPrefix: 'amb_a1b2' });
    expect(mail.subject).toBe('Replace your Ambr API key');
    expect(mail.text).toContain('amb_a1b2');
    expect(mail.text).toMatch(/stop your current key/i);
    // Reassurance that ignoring the mail is safe — it is what makes an
    // unsolicited rotation email harmless.
    expect(mail.text).toMatch(/Nothing changes if you ignore/i);
  });

  it('uses verification wording, not replacement wording, for a first claim', () => {
    const mail = renderKeyClaim({ ...base, purpose: 'claim' });
    expect(mail.subject).toMatch(/Verify your email/i);
    expect(mail.text).not.toMatch(/stop your current key/i);
  });

  it('tells an unintended recipient that ignoring it changes nothing', () => {
    const mail = renderKeyClaim({ ...base, purpose: 'claim' });
    expect(mail.text).toMatch(/didn't request this/i);
    expect(mail.html).toMatch(/didn't request this/i);
  });

  it('includes the claim link in both parts', () => {
    const mail = renderKeyClaim({ ...base, purpose: 'claim' });
    expect(mail.text).toContain(base.claimUrl);
    expect(mail.html).toContain(base.claimUrl);
  });
});
