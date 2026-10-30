import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkInboundMail, formatAge } from '@/lib/health/inbound-mail';

// The inbound-mail check reads the mail log through the ops backend and goes
// red when nothing new has been logged for a week. fetch and the clock are
// stubbed; the backend address and key are made up.

const BASE = 'https://ops.example.test/exec';
const BACKEND_KEY = 'test-backend-key';
const NOW = Date.parse('2026-10-30T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const WEEK = 7 * 24 * HOUR;

const ago = (ms: number) => new Date(NOW - ms).toISOString();

function backendReturns(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({ json: async () => body });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('checkInboundMail', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv('OPS_BASE', BASE);
    vi.stubEnv('OPS_KEY', BACKEND_KEY);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each(['OPS_BASE', 'OPS_KEY'])('is down without %s, and calls nothing', async (name) => {
    vi.stubEnv(name, '');
    const fetchMock = backendReturns({ emails: [] });

    expect(await checkInboundMail()).toEqual({
      status: 'down',
      detail: 'OPS_BASE or OPS_KEY not configured',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('makes a single call, to the mail log', async () => {
    const fetchMock = backendReturns({ emails: [{ date: ago(2 * HOUR) }] });

    await checkInboundMail();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(`${url.origin}${url.pathname}`).toBe(BASE);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      action: 'email_log',
      max: '10',
      key: BACKEND_KEY,
    });
  });

  it('is ok and names the age of the newest logged mail, wherever it sits in the rows', async () => {
    backendReturns({
      emails: [{ date: ago(30 * HOUR) }, { date: ago(2 * HOUR) }, { date: 'not a date' }, {}],
    });

    expect(await checkInboundMail()).toMatchObject({ status: 'ok', detail: 'last inbound 2h ago' });
  });

  it('is degraded when nothing was logged within the last week', async () => {
    backendReturns({ emails: [{ date: ago(8 * 24 * HOUR) }] });

    expect(await checkInboundMail()).toMatchObject({
      status: 'degraded',
      detail: 'no inbound mail logged in 8d',
    });
  });

  it('goes red one minute past a full week, not before', async () => {
    backendReturns({ emails: [{ date: ago(WEEK) }] });
    expect(await checkInboundMail()).toMatchObject({ status: 'ok', detail: 'last inbound 7d ago' });

    backendReturns({ emails: [{ date: ago(WEEK + 60 * 1000) }] });
    expect(await checkInboundMail()).toMatchObject({
      status: 'degraded',
      detail: 'no inbound mail logged in 7d',
    });
  });

  it('honours a shorter quiet window', async () => {
    backendReturns({ emails: [{ date: ago(3 * HOUR) }] });

    expect(await checkInboundMail({ quietMs: HOUR })).toMatchObject({
      status: 'degraded',
      detail: 'no inbound mail logged in 3h',
    });
  });

  it('is degraded when the log is empty or malformed', async () => {
    backendReturns({ emails: [] });
    expect(await checkInboundMail()).toMatchObject({
      status: 'degraded',
      detail: 'no inbound mail logged at all',
    });

    backendReturns({ emails: 'nope' });
    expect(await checkInboundMail()).toMatchObject({
      status: 'degraded',
      detail: 'no inbound mail logged at all',
    });
  });

  it('passes a backend error through as degraded', async () => {
    backendReturns({ error: 'quota exceeded' });

    expect(await checkInboundMail()).toMatchObject({
      status: 'degraded',
      detail: 'ops error: quota exceeded',
    });
  });

  it('reports a slow backend as a timeout, not as broken mail', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));

    const pending = checkInboundMail({ timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(50);

    expect(await pending).toMatchObject({ status: 'degraded', detail: 'ops timeout' });
  });

  it('reports an unreachable backend as degraded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));

    expect(await checkInboundMail()).toMatchObject({ status: 'degraded', detail: 'fetch failed' });
  });
});

describe('formatAge', () => {
  it('uses minutes, then hours below two days, then days', () => {
    expect(formatAge(59 * 60 * 1000)).toBe('59m');
    expect(formatAge(HOUR)).toBe('1h');
    expect(formatAge(47 * HOUR)).toBe('47h');
    expect(formatAge(48 * HOUR)).toBe('2d');
  });
});
