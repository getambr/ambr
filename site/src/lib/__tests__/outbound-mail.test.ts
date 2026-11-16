import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkOutboundMail } from '@/lib/health/outbound-mail';

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('checkOutboundMail', () => {
  const saved = process.env.RESEND_API_KEY;
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test_key_value';
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = saved;
  });

  it('is green when ambr.run is verified, ignoring other domains', async () => {
    const f = vi.fn(() =>
      json({ data: [{ name: 'other.example', status: 'failed' }, { name: 'ambr.run', status: 'verified' }] }),
    );
    const r = await checkOutboundMail(f as unknown as typeof fetch);
    expect(r.status).toBe('ok');
    expect(f).toHaveBeenCalledOnce();
    // Read-only: a GET to the domains list, nothing is sent.
    expect((f.mock.calls[0] as unknown[])[0]).toBe('https://api.resend.com/domains');
  });

  it('is amber while Resend is still verifying, red when it failed', async () => {
    const run = (status: string) =>
      checkOutboundMail((() => json({ data: [{ name: 'ambr.run', status }] })) as unknown as typeof fetch);
    expect((await run('pending')).status).toBe('degraded');
    expect((await run('not_started')).status).toBe('degraded');
    expect((await run('failed')).status).toBe('down');
    expect((await run('temporary_failure')).status).toBe('down');
  });

  it('is red when the domain is not in the account, or the API refuses', async () => {
    const none = await checkOutboundMail((() => json({ data: [] })) as unknown as typeof fetch);
    expect(none.status).toBe('down');
    const refused = await checkOutboundMail((() => json({}, 401)) as unknown as typeof fetch);
    expect(refused.status).toBe('down');
    expect(refused.detail).toContain('401');
  });

  it('is amber, not red, when Resend rate limits', async () => {
    const r = await checkOutboundMail((() => json({ message: 'Too many requests' }, 429)) as unknown as typeof fetch);
    expect(r.status).toBe('degraded');
    expect(r.detail).toBe('Resend is rate limiting; could not check.');
  });

  it('is amber, not "not set up", when a 200 carries no domain list', async () => {
    for (const body of [{}, { data: null }, { data: { name: 'ambr.run' } }, { message: 'ok' }]) {
      const r = await checkOutboundMail((() => json(body)) as unknown as typeof fetch);
      expect(r.status).toBe('degraded');
      expect(r.detail).not.toContain('not set up');
    }
    const notJson = await checkOutboundMail((() => Promise.resolve(new Response('<html>', { status: 200 }))) as unknown as typeof fetch);
    expect(notJson.status).toBe('degraded');
    expect(notJson.detail).not.toContain('not set up');
  });

  it('is red without a key and never puts the key in a message', async () => {
    delete process.env.RESEND_API_KEY;
    const r = await checkOutboundMail((() => json({})) as unknown as typeof fetch);
    expect(r.status).toBe('down');
    process.env.RESEND_API_KEY = 're_test_key_value';
    const failed = await checkOutboundMail((() => Promise.reject(new Error('socket re_test_key_value'))) as unknown as typeof fetch);
    expect(failed.status).toBe('down');
    expect(JSON.stringify(failed)).not.toContain('re_test_key_value');
  });
});
