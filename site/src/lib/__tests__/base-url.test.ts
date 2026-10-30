import { describe, it, expect } from 'vitest';
import { normalizeBaseUrl } from '@/lib/base-url';

const FALLBACK = 'https://ambr.run';

describe('normalizeBaseUrl', () => {
  // The exact value that broke production: a backslash and an `n`, two
  // ordinary characters, not a newline. `.trim()` leaves this untouched, so a
  // fix that only trims would ship and change nothing.
  it('strips a literal backslash-n, the defect that was live for 180 days', () => {
    expect(normalizeBaseUrl('https://ambr.run\\n', FALLBACK)).toBe('https://ambr.run');
  });

  it('also strips a real newline, which trim would have caught', () => {
    expect(normalizeBaseUrl('https://ambr.run\n', FALLBACK)).toBe('https://ambr.run');
    expect(normalizeBaseUrl('https://ambr.run\r\n', FALLBACK)).toBe('https://ambr.run');
  });

  it('strips literal \\r and \\t too', () => {
    expect(normalizeBaseUrl('https://ambr.run\\r', FALLBACK)).toBe('https://ambr.run');
    expect(normalizeBaseUrl('https://ambr.run\\t', FALLBACK)).toBe('https://ambr.run');
  });

  it('strips a mixture, in any order', () => {
    expect(normalizeBaseUrl('https://ambr.run\\n \\n', FALLBACK)).toBe('https://ambr.run');
  });

  it('strips leading junk as well as trailing', () => {
    expect(normalizeBaseUrl('\\nhttps://ambr.run', FALLBACK)).toBe('https://ambr.run');
    expect(normalizeBaseUrl('  https://ambr.run  ', FALLBACK)).toBe('https://ambr.run');
  });

  it('removes a trailing slash so interpolation never doubles it', () => {
    expect(normalizeBaseUrl('https://ambr.run/', FALLBACK)).toBe('https://ambr.run');
    expect(normalizeBaseUrl('https://ambr.run///', FALLBACK)).toBe('https://ambr.run');
    expect(normalizeBaseUrl('https://ambr.run/\\n', FALLBACK)).toBe('https://ambr.run');
  });

  it('leaves a clean value exactly as it is', () => {
    expect(normalizeBaseUrl('https://getamber.dev', FALLBACK)).toBe('https://getamber.dev');
  });

  it('keeps a port and a path prefix', () => {
    expect(normalizeBaseUrl('http://localhost:3000', FALLBACK)).toBe('http://localhost:3000');
    expect(normalizeBaseUrl('https://example.com/base', FALLBACK)).toBe('https://example.com/base');
  });

  it('falls back when the value is missing or empty', () => {
    expect(normalizeBaseUrl(undefined, FALLBACK)).toBe(FALLBACK);
    expect(normalizeBaseUrl(null, FALLBACK)).toBe(FALLBACK);
    expect(normalizeBaseUrl('', FALLBACK)).toBe(FALLBACK);
    expect(normalizeBaseUrl('   \\n  ', FALLBACK)).toBe(FALLBACK);
  });

  // A value that survives cleaning but is not a URL would be interpolated into links
  // that 404 quietly. The fallback is a worse address but an honest one.
  it('falls back when the value is not a URL', () => {
    expect(normalizeBaseUrl('ambr.run', FALLBACK)).toBe(FALLBACK);
    expect(normalizeBaseUrl('not a url at all', FALLBACK)).toBe(FALLBACK);
  });

  it('falls back on a non-http protocol', () => {
    expect(normalizeBaseUrl('javascript:alert(1)', FALLBACK)).toBe(FALLBACK);
    expect(normalizeBaseUrl('file:///etc/passwd', FALLBACK)).toBe(FALLBACK);
  });

  it('normalizes the fallback itself', () => {
    expect(normalizeBaseUrl(undefined, 'https://ambr.run/')).toBe('https://ambr.run');
  });

  // The end-to-end shape: what production actually served, and what it should serve.
  it('produces the four agent.json URLs correctly from the dirty value', () => {
    const base = normalizeBaseUrl('https://ambr.run\\n', FALLBACK);
    expect(`${base}/llms.txt`).toBe('https://ambr.run/llms.txt');
    expect(`${base}/spec/ricardian-v1`).toBe('https://ambr.run/spec/ricardian-v1');
    expect(`${base}/api/v1/pricing`).toBe('https://ambr.run/api/v1/pricing');
    expect(base).toBe('https://ambr.run');
  });
});
