import { describe, it, expect, beforeEach, vi } from 'vitest';

const probes = vi.hoisted(() => {
  const ok =
    (detail = 'fine') =>
    async (): Promise<{ status: 'ok' | 'degraded' | 'down'; detail?: string }> => ({ status: 'ok', detail });
  const item = (key: string) => async () => ({ key, label: key, status: 'ok' as const });
  return {
    checkSupabase: vi.fn(ok()),
    checkBaseRpc: vi.fn(ok()),
    checkAnthropic: vi.fn(ok()),
    checkOpsAgent: vi.fn(ok()),
    checkResend: vi.fn(ok()),
    checkStripe: vi.fn(ok()),
    checkCnftContract: vi.fn(ok()),
    checkX402Facilitator: vi.fn(ok()),
    checkInboundMail: vi.fn(item('inbound_mail')),
    checkOutboundMail: vi.fn(item('outbound_mail')),
    checkMailDns: vi.fn(async () => [{ key: 'dns_mx', label: 'mx', status: 'ok' as const }]),
    ok,
    item,
  };
});

vi.mock('@/lib/health/checks', () => ({
  checkSupabase: probes.checkSupabase,
  checkBaseRpc: probes.checkBaseRpc,
  checkAnthropic: probes.checkAnthropic,
  checkOpsAgent: probes.checkOpsAgent,
  checkResend: probes.checkResend,
  checkStripe: probes.checkStripe,
  checkCnftContract: probes.checkCnftContract,
  checkX402Facilitator: probes.checkX402Facilitator,
}));
vi.mock('@/lib/health/inbound-mail', () => ({ checkInboundMail: probes.checkInboundMail }));
vi.mock('@/lib/health/outbound-mail', () => ({ checkOutboundMail: probes.checkOutboundMail }));
vi.mock('@/lib/health/mail-dns', () => ({ checkMailDns: probes.checkMailDns }));

import { runDailyReport } from '@/lib/health/daily-report';

const never = () => new Promise<never>(() => {});

describe('runDailyReport', () => {
  beforeEach(() => {
    probes.checkStripe.mockImplementation(probes.ok());
    probes.checkResend.mockImplementation(probes.ok());
    probes.checkMailDns.mockImplementation(async () => [{ key: 'dns_mx', label: 'mx', status: 'ok' as const }]);
  });

  it('is green when every probe is, with one item per probe plus the DNS items', async () => {
    const report = await runDailyReport({ deadlineMs: 1000 });
    expect(report.overall).toBe('ok');
    expect(report.items).toHaveLength(11);
    expect(report.items.map((i) => i.key)).toContain('dns_mx');
  });

  it('turns a probe that throws into a red item with the fixed sentence, without the error text', async () => {
    probes.checkStripe.mockImplementation(async () => {
      throw new Error('boom re_FAKEFAKEFAKE1234');
    });
    const report = await runDailyReport({ deadlineMs: 1000 });
    const stripe = report.items.find((i) => i.key === 'stripe');
    expect(stripe).toMatchObject({ status: 'down', detail: 'The check crashed before it could report.' });
    expect(JSON.stringify(report)).not.toContain('re_FAKEFAKEFAKE1234');
    expect(report.overall).toBe('down');
    expect(report.items.filter((i) => i.status === 'ok')).toHaveLength(10);
  });

  it('scrubs the detail a probe returns', async () => {
    probes.checkResend.mockImplementation(async () => ({ status: 'down' as const, detail: 'sent Bearer re_FAKEFAKEFAKE1234 to https://x.example/?key=abc' }));
    const report = await runDailyReport({ deadlineMs: 1000 });
    const detail = report.items.find((i) => i.key === 'resend')?.detail ?? '';
    expect(detail).toBe('sent Bearer [hidden] to [url]');
  });

  it('stops waiting for a probe that hangs and still returns the rest', async () => {
    probes.checkStripe.mockImplementation(never);
    const started = Date.now();
    const report = await runDailyReport({ deadlineMs: 50 });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(report.items).toHaveLength(11);
    expect(report.items.find((i) => i.key === 'stripe')).toMatchObject({
      status: 'degraded',
      detail: 'The check did not finish in time.',
    });
    expect(report.items.find((i) => i.key === 'supabase')?.status).toBe('ok');
    expect(report.overall).toBe('degraded');
  });

  it('reports a hung DNS group as one amber item', async () => {
    probes.checkMailDns.mockImplementation(never);
    const report = await runDailyReport({ deadlineMs: 50 });
    expect(report.items.find((i) => i.key === 'dns')).toMatchObject({ status: 'degraded' });
    expect(report.items).toHaveLength(11);
  });

  it('the overall status is the worst item: red beats amber', async () => {
    probes.checkStripe.mockImplementation(never);
    probes.checkResend.mockImplementation(async () => ({ status: 'down' as const, detail: 'no answer' }));
    const report = await runDailyReport({ deadlineMs: 50 });
    expect(report.overall).toBe('down');
  });
});
