import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const runDailyReport = vi.fn();
vi.mock('@/lib/health/daily-report', () => ({ runDailyReport: () => runDailyReport() }));

import { GET } from '../route';

const SECRET = 'test-health-report-secret';
const call = (authorization?: string) =>
  GET(
    new Request('https://example.test/api/internal/health-report', {
      headers: authorization === undefined ? {} : { authorization },
    }),
  );

describe('GET /api/internal/health-report', () => {
  beforeEach(() => {
    runDailyReport.mockReset();
    vi.stubEnv('HEALTH_REPORT_SECRET', SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('answers 503 when the secret is not configured', async () => {
    vi.stubEnv('HEALTH_REPORT_SECRET', '');
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'Not configured' });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
    expect(runDailyReport).not.toHaveBeenCalled();
  });

  it('answers 503 when the secret is only whitespace', async () => {
    vi.stubEnv('HEALTH_REPORT_SECRET', ' \n');
    const res = await call('Bearer ');
    expect(res.status).toBe(503);
    expect(runDailyReport).not.toHaveBeenCalled();
  });

  it('accepts the right bearer when the stored secret has a trailing newline', async () => {
    vi.stubEnv('HEALTH_REPORT_SECRET', `${SECRET}\n`);
    runDailyReport.mockResolvedValue({ overall: 'ok', items: [], duration_ms: 1 });
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(runDailyReport).toHaveBeenCalledTimes(1);
  });

  it('answers 401 without a bearer header', async () => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
    expect(runDailyReport).not.toHaveBeenCalled();
  });

  it('answers 401 with a wrong bearer', async () => {
    const res = await call('Bearer nope');
    expect(res.status).toBe(401);
    expect(runDailyReport).not.toHaveBeenCalled();
  });

  it('returns exactly overall, items and duration_ms on the right bearer', async () => {
    runDailyReport.mockResolvedValue({
      overall: 'ok',
      items: [{ key: 'supabase', label: 'Database', status: 'ok', detail: 'fine' }],
      duration_ms: 1234,
      extra: 'must not leak',
    });
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      overall: 'ok',
      items: [{ key: 'supabase', label: 'Database', status: 'ok', detail: 'fine' }],
      duration_ms: 1234,
    });
    expect(runDailyReport).toHaveBeenCalledTimes(1);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
  });
});
