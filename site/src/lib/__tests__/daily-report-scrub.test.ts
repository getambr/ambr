import { describe, it, expect, afterEach } from 'vitest';
import { scrubDetail } from '@/lib/health/daily-report';

describe('scrubDetail', () => {
  it('hides URLs and secret-looking query values', () => {
    const out = scrubDetail('TypeError: Failed to parse URL from https://script.example/exec?action=draft_queue&key=abc123');
    expect(out).not.toContain('abc123');
    expect(out).not.toContain('script.example');
    expect(scrubDetail('bad key=abc123 here')).toBe('bad key=[hidden] here');
  });

  it('caps the length', () => {
    expect(scrubDetail('word '.repeat(100)).length).toBe(200);
  });

  it('leaves plain sentences alone', () => {
    expect(scrubDetail('Signature key found.')).toBe('Signature key found.');
    expect(scrubDetail('Could not reach Resend.')).toBe('Could not reach Resend.');
  });

  it('leaves status numbers, labels and the fixed phrases of the probes alone', () => {
    for (const text of [
      'The database refused the request (401).',
      'Base RPC sent a non-JSON answer (502).',
      'The payment facilitator refused the key (401).',
      'HTTP 401 and HTTP 502 came back from the server',
      'Basic authentication failed',
      'Basic HTTP-authentication is not supported here',
      'Ops assistant (company mail and calendar)',
      'DMARC policy is reject: spoofed mail is blocked.',
      'Missing on the send subdomain: Mail server and SPF.',
      'deployed (0x1234…abcd)',
      'request 123e4567-e89b-12d3-a456-426614174000 failed',
      'write to person@example.com failed at 12:30',
      'pct=0 and keys: none',
    ]) {
      expect(scrubDetail(text)).toBe(text);
    }
  });
});

describe('scrubDetail: more secret shapes', () => {
  // Every value here is made up; none is a real credential.
  it.each([
    ['Basic credentials', 'header Basic RkFLRXVzZXI6RkFLRXBhc3N3b3Jk rejected', 'header Basic [hidden] rejected'],
    ['Basic credentials with padding', 'got Basic RkFLRXVzZXI6RkFL== back', 'got Basic [hidden] back'],
    ['a webhook secret', 'got whsec_FAKEFAKEFAKE1234 back', 'got [hidden] back'],
    [
      'JSON pairs with a secret-looking key',
      '{"api_key":"FAKEjsonVALUE123","client_secret": "FAKEjson2","count": 3}',
      '{"api_key": "[hidden]","client_secret": "[hidden]","count": 3}',
    ],
    ['a JSON pair with a number', '{"access_token": 123456789}', '{"access_token": "[hidden]"}'],
    ['a JSON pair with a URL value', '{"secret_url":"https://x.example/a?b=c"} end', '{"secret_url": "[hidden]"} end'],
    ['a JSON pair that is itself escaped', 'body {\\"password\\":\\"FAKEpass 1\\"} end', 'body {"password": "[hidden]"} end'],
    ['a colon', 'token: FAKEcolonVALUE end', 'token: [hidden] end'],
    ['an equals sign with spaces', 'bad api_key = FAKEspaced end', 'bad api_key = [hidden] end'],
    ['a suffix word', 'got access-token:FAKE1 and client_secret: FAKE2 end', 'got access-token:[hidden] and client_secret: [hidden] end'],
    ['a quoted value', 'password: "FAKE two words" end', 'password: [hidden] end'],
    ['user and password before a host', 'connect FAKEuser:FAKEpass@db.example.com:5432 failed', 'connect [hidden]@db.example.com:5432 failed'],
    ['a URL with credentials', 'postgres://FAKEuser:FAKEpass@db.example.com/x failed', '[url] failed'],
    ['a long hex run', `hash ${'4f3c2a1b'.repeat(4)} end`, 'hash [hidden] end'],
    ['a 0x-prefixed long hex run', `tx 0x${'4f3c2a1b'.repeat(8)} end`, 'tx 0x[hidden] end'],
    ['a long base64url run', `blob ${'QUJDREVG'.repeat(5)} end`, 'blob [hidden] end'],
  ])('hides %s', (_name, input, expected) => {
    expect(scrubDetail(input)).toBe(expected);
  });

  it.each([
    ['real line breaks', '-----BEGIN EC PRIVATE KEY-----\nFAKEbase64one\nFAKEbase64two\n-----END EC PRIVATE KEY-----'],
    ['line breaks written as backslash and n', '-----BEGIN EC PRIVATE KEY-----\\nFAKEbase64one\\nFAKEbase64two\\n-----END EC PRIVATE KEY-----'],
    ['spaces for line breaks', '-----BEGIN PRIVATE KEY----- FAKEbase64one FAKEbase64two -----END PRIVATE KEY-----'],
  ])('hides a PEM block with %s', (_name, pem) => {
    const out = scrubDetail(`before ${pem} after`);
    expect(out).toBe('before [hidden] after');
  });

  it('hides a PEM block whose end was cut off', () => {
    const out = scrubDetail('key=-----BEGIN PRIVATE KEY----- MIIFAKEFAKE12 FAKEFAKE');
    expect(out).not.toContain('FAKE');
    expect(out).not.toContain('BEGIN');
  });
});

describe('scrubDetail: bare key shapes', () => {
  // Every value here is made up; none is a real credential.
  it.each([
    ['a bearer token', 'header Bearer abc.DEF-123_xyz/456= rejected', 'header Bearer [hidden] rejected'],
    ['a Resend key', 'rejected re_FAKEFAKEFAKE1234 as invalid', 'rejected [hidden] as invalid'],
    ['a Stripe live key', 'got sk_live_FAKEFAKEFAKE1234 back', 'got [hidden] back'],
    ['a Stripe test key', 'got sk_test_FAKEFAKEFAKE1234 back', 'got [hidden] back'],
    ['a Stripe restricted key', 'got rk_live_FAKEFAKEFAKE1234 back', 'got [hidden] back'],
    ['an Anthropic key', 'got sk-ant-api03-FAKEFAKE_FAKE-1234 back', 'got [hidden] back'],
    ['a GitHub token', 'got ghp_FAKEFAKEFAKE1234567890 back', 'got [hidden] back'],
    ['a JWT', 'got eyJFAKEHEAD.eyJFAKEBODY.FAKESIG_123-x back', 'got [hidden] back'],
  ])('hides %s', (_name, input, expected) => {
    expect(scrubDetail(input)).toBe(expected);
  });

  it.each(['access_token', 'client_secret', 'refresh_token', 'api_key', 'x-api-key', 'Authorization-Token'])(
    'hides the value of %s=',
    (name) => {
      expect(scrubDetail(`bad ${name}=FAKEVALUE123 here`)).toBe(`bad ${name}=[hidden] here`);
    },
  );

  it('does not touch ordinary words that merely contain "re_" or "key"', () => {
    expect(scrubDetail('are_you sure? keyboard monkey pct=0')).toBe('are_you sure? keyboard monkey pct=0');
  });
});

describe('scrubDetail: configured secret values', () => {
  const NAMES = ['RESEND_API_KEY', 'STRIPE_SECRET_KEY', 'ANTHROPIC_API_KEY', 'OPS_KEY', 'CDP_API_KEY_SECRET', 'SUPABASE_SERVICE_ROLE_KEY'];
  const saved = Object.fromEntries(NAMES.map((n) => [n, process.env[n]]));
  afterEach(() => {
    for (const n of NAMES) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
  });

  it.each(NAMES)('hides the live value of %s wherever it appears', (name) => {
    // No recognisable shape on purpose: only the env match can catch this.
    process.env[name] = 'plainfakevalue 99';
    expect(scrubDetail('failed with plainfakevalue 99 in it')).toBe('failed with [hidden] in it');
  });

  it('hides the URL-encoded form too', () => {
    process.env.OPS_KEY = 'fake value/with+chars';
    expect(scrubDetail(`sent ${encodeURIComponent('fake value/with+chars')} to the server`)).toBe('sent [hidden] to the server');
  });

  it('ignores a value shorter than eight characters', () => {
    process.env.OPS_KEY = 'short';
    expect(scrubDetail('a short answer')).toBe('a short answer');
  });

  it('hides the trimmed form of a value with stray whitespace, and its URL-encoded form', () => {
    process.env.OPS_KEY = '  fake padded value 7  \n';
    expect(scrubDetail('header fake padded value 7 rejected')).toBe('header [hidden] rejected');
    expect(scrubDetail(`sent ${encodeURIComponent('fake padded value 7')} on`)).toBe('sent [hidden] on');
    expect(scrubDetail('raw   fake padded value 7  \n end')).toBe('raw [hidden] end');
  });

  it('ignores a value that is shorter than eight characters once trimmed', () => {
    process.env.OPS_KEY = '   short   ';
    expect(scrubDetail('a short answer')).toBe('a short answer');
  });
});

describe('scrubDetail on a cut input', () => {
  it('drops a key fragment split by the length cut', () => {
    const out = scrubDetail(`${' '.repeat(996)}re_FAKEFAKEFAKE1234`);
    expect(out).not.toContain('re_');
    expect(out).not.toContain('FAKE');
  });
});
