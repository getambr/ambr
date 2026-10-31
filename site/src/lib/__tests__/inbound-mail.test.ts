import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkInboundMail, formatAge } from '@/lib/health/inbound-mail';

// The inbound-mail check asks the ops backend two things: how many company
// messages sit in Spam, and when the newest mail was logged. It goes red on
// either. fetch and the clock are stubbed; the backend address and key are made up.

const BASE = 'https://ops.example.test/exec';
const BACKEND_KEY = 'test-backend-key';
const NOW = Date.parse('2026-10-30T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const WEEK = 7 * 24 * HOUR;

const ago = (ms: number) => new Date(NOW - ms).toISOString();

// Answers each call by its action: the spam search and the mail log.
function backendReturns(log: unknown, spam: unknown = { count: 0 }) {
  const fetchMock = vi.fn(async (url: string) => {
    const body = new URL(url).searchParams.get('action') === 'gmail_search' ? spam : log;
    return { status: 200, json: async () => body };
  });
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

  it('makes two calls: the spam search and the mail log', async () => {
    const fetchMock = backendReturns({ emails: [{ date: ago(2 * HOUR) }] });

    await checkInboundMail();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const params = fetchMock.mock.calls.map(([url]) => {
      const u = new URL(url);
      expect(`${u.origin}${u.pathname}`).toBe(BASE);
      return Object.fromEntries(u.searchParams);
    });
    expect(params).toContainEqual({
      action: 'gmail_search',
      q: 'in:spam to:(@ambr.run)',
      max: '25',
      key: BACKEND_KEY,
    });
    expect(params).toContainEqual({ action: 'email_log', max: '10', key: BACKEND_KEY });
  });

  it('is ok and names the age of the newest logged mail, wherever it sits in the rows', async () => {
    backendReturns({
      emails: [{ date: ago(30 * HOUR) }, { date: ago(2 * HOUR) }, { date: 'not a date' }, {}],
    });

    expect(await checkInboundMail()).toMatchObject({
      status: 'ok',
      detail: 'spam clear, last inbound 2h ago',
    });
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
    expect(await checkInboundMail()).toMatchObject({
      status: 'ok',
      detail: 'spam clear, last inbound 7d ago',
    });

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

  it('is degraded and counts the company messages sitting in Spam', async () => {
    backendReturns({ emails: [{ date: ago(2 * HOUR) }] }, { count: 3 });
    expect(await checkInboundMail()).toMatchObject({
      status: 'degraded',
      detail: '3 company messages in Spam',
    });

    backendReturns({ emails: [{ date: ago(2 * HOUR) }] }, { count: 1 });
    expect(await checkInboundMail()).toMatchObject({
      status: 'degraded',
      detail: '1 company message in Spam',
    });
  });

  it('shows a full page of spam as a floor, not a total', async () => {
    backendReturns({ emails: [{ date: ago(2 * HOUR) }] }, { count: 25 });

    expect(await checkInboundMail()).toMatchObject({
      status: 'degraded',
      detail: '25+ company messages in Spam',
    });
  });

  it('is degraded when the spam probe returns no count', async () => {
    backendReturns({ emails: [{ date: ago(2 * HOUR) }] }, {});

    expect(await checkInboundMail()).toMatchObject({
      status: 'degraded',
      detail: 'spam probe returned no count',
    });
  });

  it('reports spam and a quiet log together', async () => {
    backendReturns({ emails: [{ date: ago(8 * 24 * HOUR) }] }, { count: 2 });

    expect(await checkInboundMail()).toMatchObject({
      status: 'degraded',
      detail: '2 company messages in Spam; no inbound mail logged in 8d',
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

  it('reports an unreachable backend with a fixed phrase, never the error text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error(`fetch failed for ?key=${BACKEND_KEY}`)),
    );

    const result = await checkInboundMail();

    expect(result).toMatchObject({
      status: 'degraded',
      detail: 'Could not reach the ops assistant.',
    });
    expect(JSON.stringify(result)).not.toContain(BACKEND_KEY);
  });

  it('tells a non-JSON answer apart from an unreachable backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 502,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      }),
    );

    expect(await checkInboundMail()).toMatchObject({
      status: 'degraded',
      detail: 'The ops assistant sent a non-JSON answer (502).',
    });
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
