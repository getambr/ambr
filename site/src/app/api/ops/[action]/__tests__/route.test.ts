import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NextRequest } from 'next/server';
import { OPS_GET_PARAMS, OPS_POST_FIELDS } from '@/lib/ops-actions';
import { GET, POST } from '../route';

// The ops proxy forwards only the actions the team dashboard calls, with only
// the query parameters / body fields each one sends. The expected tables below
// are written out on purpose: changing the allowlist means changing them here
// too, and the drift guard at the end ties both to lib/team-api.ts.

const BASE = 'https://ops.example.test/exec';
const BACKEND_KEY = 'test-backend-key';
const CALLER = 'admin@example.test';

const EXPECTED_GET: Record<string, string[]> = {
  calendar: ['days'],
  email_log: ['max', 'to_filter'],
  email_body: ['messageId'],
  gmail_unread: [],
  draft_queue: [],
  outreach: [],
  suggest_slots: ['duration', 'days'],
  sent_log: ['max'],
  get_assignments: [],
};

const EXPECTED_POST: Record<string, string[]> = {
  draft_reply: ['emailId', 'instructions'],
  archive_email: ['messageId'],
  improve_draft: ['emailId', 'currentBody'],
  send_thread_reply: ['emailId', 'body'],
  send_new_email: ['to', 'subject', 'body', 'fromAlias', 'attachments'],
  generate_new_draft: ['to', 'subject', 'intent', 'fromAlias'],
  improve_compose: ['currentBody', 'subject', 'fromAlias'],
  approve_draft: ['draftId', 'editedSubject', 'editedBody'],
  update_draft: ['draftId', 'subject', 'body'],
  create_event: ['title', 'start', 'end', 'description', 'location', 'guests'],
  archive_drafts: ['draftIds'],
  assign_email: ['messageId', 'assignees'],
};

const validateApiKey = vi.fn();
const isAdmin = vi.fn();
const fetchMock = vi.fn();

vi.mock('@/lib/api-auth', () => ({ validateApiKey: (...a: unknown[]) => validateApiKey(...a) }));
vi.mock('@/lib/admin-emails', () => ({ isAdmin: (...a: unknown[]) => isAdmin(...a) }));

const ctx = (action: string) => ({ params: Promise.resolve({ action }) });

function getReq(action: string, query = '') {
  return new NextRequest(`https://getamber.dev/api/ops/${action}${query}`, {
    headers: { 'X-API-Key': 'test-key' },
  });
}

function postRaw(action: string, raw: string) {
  return new NextRequest(`https://getamber.dev/api/ops/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': 'test-key' },
    body: raw,
  });
}

const postJson = (action: string, body: unknown) => postRaw(action, JSON.stringify(body));

function run(method: 'GET' | 'POST', action: string) {
  return method === 'GET'
    ? GET(getReq(action), ctx(action))
    : POST(postJson(action, {}), ctx(action));
}

/** The one backend call the route made. */
function backendCall() {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [target, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
  return { target, url: new URL(target), init };
}

const queryOf = (url: URL) => Object.fromEntries(url.searchParams);
const payloadOf = (url: URL) => JSON.parse(url.searchParams.get('payload') ?? 'null');

function sampleValue(field: string): unknown {
  if (field === 'assignees') return ['alice', 'unknown-id'];
  if (field === 'attachments') return [{ filename: 'a.txt', content: 'QQ==' }];
  if (field === 'draftIds') return ['d1', 'd2'];
  return `v_${field}`;
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  validateApiKey.mockReset();
  isAdmin.mockReset();
  fetchMock.mockReset();
  validateApiKey.mockResolvedValue({ keyId: 'k1', email: CALLER });
  isAdmin.mockReturnValue(true);
  fetchMock.mockImplementation(async () => Response.json({ ok: true }));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('OPS_BASE', BASE);
  vi.stubEnv('OPS_KEY', BACKEND_KEY);
  vi.stubEnv('TEAM_MEMBER_MAP', 'alice:alice@example.test,bob:bob@example.test');
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  errorSpy.mockRestore();
});

describe('allowlist tables', () => {
  it('match the expected actions and fields', () => {
    expect(OPS_GET_PARAMS).toEqual(EXPECTED_GET);
    expect(OPS_POST_FIELDS).toEqual(EXPECTED_POST);
  });

  it('never include a name the route sets itself or an object-prototype name', () => {
    for (const p of Object.values(OPS_GET_PARAMS).flat()) {
      expect(['action', 'key', 'caller_email', 'payload']).not.toContain(p);
    }
    for (const f of Object.values(OPS_POST_FIELDS).flat()) {
      expect(['action', 'key', 'senderEmail', '__proto__', 'constructor', 'prototype']).not.toContain(f);
    }
  });
});

describe('unknown and wrong-method actions', () => {
  const unknown = ['not_a_dashboard_action', 'constructor', '__proto__', 'toString', 'hasOwnProperty'];

  it.each(unknown)('GET %s is 404 with no auth check and no fetch', async (action) => {
    const res = await GET(getReq(action), ctx(action));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
    expect(validateApiKey).not.toHaveBeenCalled();
    expect(isAdmin).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(unknown)('POST %s is 404 with no auth check and no fetch', async (action) => {
    const res = await POST(postJson(action, { a: 1 }), ctx(action));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
    expect(validateApiKey).not.toHaveBeenCalled();
    expect(isAdmin).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 404 before the config check', async () => {
    vi.stubEnv('OPS_BASE', '');
    vi.stubEnv('OPS_KEY', '');
    const res = await GET(getReq('not_a_dashboard_action'), ctx('not_a_dashboard_action'));
    expect(res.status).toBe(404);
  });

  it.each(Object.keys(EXPECTED_POST))('POST-only action %s is 404 on GET', async (action) => {
    const res = await GET(getReq(action), ctx(action));
    expect(res.status).toBe(404);
    expect(validateApiKey).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(Object.keys(EXPECTED_GET))('GET-only action %s is 404 on POST', async (action) => {
    const res = await POST(postJson(action, {}), ctx(action));
    expect(res.status).toBe(404);
    expect(validateApiKey).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('auth and config on allowed actions', () => {
  it.each(['GET', 'POST'] as const)('%s without a valid key is 401', async (method) => {
    validateApiKey.mockResolvedValue(null);
    const res = await run(method, method === 'GET' ? 'calendar' : 'archive_email');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['GET', 'POST'] as const)('%s from a non-admin is 403', async (method) => {
    validateApiKey.mockResolvedValue({ keyId: 'k2', email: 'member@example.test' });
    isAdmin.mockReturnValue(false);
    const res = await run(method, method === 'GET' ? 'calendar' : 'archive_email');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Admin only' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['GET', 'POST'] as const)('%s with missing config is 500 with no details', async (method) => {
    vi.stubEnv('OPS_BASE', '');
    vi.stubEnv('OPS_KEY', '   ');
    const res = await run(method, method === 'GET' ? 'calendar' : 'archive_email');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Ops backend not configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['GET', 'POST'] as const)('%s checks auth before config', async (method) => {
    vi.stubEnv('OPS_BASE', '');
    validateApiKey.mockResolvedValue(null);
    const res = await run(method, method === 'GET' ? 'calendar' : 'archive_email');
    expect(res.status).toBe(401);
  });
});

describe('GET forwarding', () => {
  it.each(Object.entries(EXPECTED_GET))('%s forwards exactly its own parameters', async (action, allowed) => {
    const query = new URLSearchParams({
      ...Object.fromEntries(allowed.map((p) => [p, `v_${p}`])),
      payload: '{"x":1}',
      not_allowed: 'x',
      caller_email: 'spoof@example.test',
      key: 'spoof-key',
      action: 'spoof_action',
    });
    const res = await GET(getReq(action, `?${query}`), ctx(action));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const { url, init } = backendCall();
    expect(url.origin + url.pathname).toBe(BASE);
    expect(init).toEqual({ redirect: 'follow' });
    expect(queryOf(url)).toEqual({
      ...Object.fromEntries(allowed.map((p) => [p, `v_${p}`])),
      action,
      key: BACKEND_KEY,
      caller_email: CALLER,
    });
  });

  it('uses the first value of a repeated parameter and skips absent ones', async () => {
    await GET(getReq('calendar', '?days=3&days=9'), ctx('calendar'));
    expect(queryOf(backendCall().url)).toEqual({
      days: '3',
      action: 'calendar',
      key: BACKEND_KEY,
      caller_email: CALLER,
    });
  });

  it('does not forward a parameter that belongs to another action', async () => {
    await GET(getReq('calendar', '?days=3&max=5&messageId=m1'), ctx('calendar'));
    expect(queryOf(backendCall().url)).toEqual({
      days: '3',
      action: 'calendar',
      key: BACKEND_KEY,
      caller_email: CALLER,
    });
  });

  it('scrubs email_log rows that are not addressed to the team domain', async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({
        count: 3,
        emails: [
          { messageId: 'm1', to_address: 'info@ambr.run' },
          { messageId: 'm2', to_address: 'someone@personal.example.test' },
          { messageId: 'm3' },
        ],
      })
    );
    const res = await GET(getReq('email_log', '?max=12'), ctx('email_log'));
    expect(await res.json()).toEqual({
      count: 1,
      emails: [{ messageId: 'm1', to_address: 'info@ambr.run' }],
    });
  });

  it('maps stored assignee addresses back to ids on get_assignments', async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({
        assignments: {
          m1: ['alice@example.test', 'gone@example.test'],
          m2: ['bob@example.test'],
        },
      })
    );
    const res = await GET(getReq('get_assignments'), ctx('get_assignments'));
    expect(await res.json()).toEqual({ assignments: { m1: ['alice'], m2: ['bob'] } });
  });

  it('passes the backend status through', async () => {
    fetchMock.mockImplementation(async () => Response.json({ error: 'nope' }, { status: 429 }));
    const res = await GET(getReq('calendar'), ctx('calendar'));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'nope' });
  });
});

describe('POST forwarding', () => {
  it.each(Object.entries(EXPECTED_POST))('%s forwards only its own fields', async (action, allowed) => {
    const fields = Object.fromEntries(allowed.map((f) => [f, sampleValue(f)]));
    const res = await POST(
      postJson(action, {
        ...fields,
        senderEmail: 'spoof@example.test',
        action: 'spoof_action',
        key: 'spoof-key',
        payload: '{"x":1}',
        not_allowed: 'x',
      }),
      ctx(action)
    );
    expect(res.status).toBe(200);

    const { url, init } = backendCall();
    expect(url.origin + url.pathname).toBe(BASE);
    expect(init).toEqual({ redirect: 'follow' });
    const expected: Record<string, unknown> = { ...fields, senderEmail: CALLER };
    if (action === 'assign_email') expected.assignees = ['alice@example.test'];
    expect(payloadOf(url)).toEqual(expected);
    expect(url.searchParams.get('action')).toBe(action);
    expect(url.searchParams.get('key')).toBe(BACKEND_KEY);
    expect([...url.searchParams.keys()].sort()).toEqual(['action', 'key', 'payload']);
  });

  it('omits allowed fields the body does not carry', async () => {
    await POST(postJson('draft_reply', { emailId: 'e1' }), ctx('draft_reply'));
    expect(payloadOf(backendCall().url)).toEqual({ emailId: 'e1', senderEmail: CALLER });
  });

  it('sends a large payload as a real POST with action and key from the route', async () => {
    const attachments = [{ filename: 'a.txt', content: 'QQ==' }];
    const body = {
      to: 'rcpt@example.test',
      subject: 's',
      body: 'x'.repeat(7000),
      fromAlias: 'info',
      attachments,
      senderEmail: 'spoof@example.test',
      action: 'spoof_action',
      key: 'spoof-key',
      not_allowed: 'x',
    };
    await POST(postJson('send_new_email', body), ctx('send_new_email'));

    const { target, init } = backendCall();
    expect(target).toBe(BASE);
    expect(init?.method).toBe('POST');
    expect(init?.redirect).toBe('follow');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init?.body as string)).toEqual({
      to: body.to,
      subject: body.subject,
      body: body.body,
      fromAlias: body.fromAlias,
      attachments,
      senderEmail: CALLER,
      action: 'send_new_email',
      key: BACKEND_KEY,
    });
  });

  it.each([
    ['an array', '[1,2]'],
    ['a string', '"hello"'],
    ['null', 'null'],
    ['a number', '42'],
    ['invalid JSON', '{not json'],
    ['an empty body', ''],
  ])('treats %s as an empty body', async (_label, raw) => {
    await POST(postRaw('archive_email', raw), ctx('archive_email'));
    expect(payloadOf(backendCall().url)).toEqual({ senderEmail: CALLER });
  });

  it('does not copy __proto__, constructor or prototype from the body', async () => {
    const raw =
      '{"__proto__":{"polluted":"yes"},"constructor":{"x":1},"prototype":"y","messageId":"m1"}';
    await POST(postRaw('archive_email', raw), ctx('archive_email'));
    const { url } = backendCall();
    expect(payloadOf(url)).toEqual({ messageId: 'm1', senderEmail: CALLER });
    expect(url.searchParams.get('payload')).not.toContain('polluted');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('assign_email maps ids to addresses outbound and back to ids inbound', async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({
        updated: true,
        messageId: 'm1',
        assignees: ['alice@example.test', 'gone@example.test', 'bob@example.test'],
      })
    );
    const res = await POST(
      postJson('assign_email', { messageId: 'm1', assignees: ['alice', 'bob', 'not-a-member'] }),
      ctx('assign_email')
    );

    expect(payloadOf(backendCall().url)).toEqual({
      messageId: 'm1',
      assignees: ['alice@example.test', 'bob@example.test'],
      senderEmail: CALLER,
    });
    expect(await res.json()).toEqual({
      updated: true,
      messageId: 'm1',
      assignees: ['alice', 'bob'],
    });
  });
});

describe('backend failures', () => {
  it.each(['GET', 'POST'] as const)('%s: a fetch that throws is a fixed 502', async (method) => {
    fetchMock.mockRejectedValue(new Error(`connect failed ${BASE}?key=${BACKEND_KEY} boom-detail`));
    const res = await run(method, method === 'GET' ? 'calendar' : 'archive_email');
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'Ops backend unreachable' });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(errorSpy.mock.calls[0]);
    for (const secret of ['ops.example.test', BACKEND_KEY, 'boom-detail']) {
      expect(logged).not.toContain(secret);
    }
  });

  it.each(['GET', 'POST'] as const)('%s: a body that is not JSON is a fixed 502', async (method) => {
    fetchMock.mockImplementation(async () => new Response('<html>backend-page-detail</html>'));
    const res = await run(method, method === 'GET' ? 'calendar' : 'archive_email');
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: 'Ops backend unreachable' });
    expect(text).not.toContain('backend-page-detail');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(errorSpy.mock.calls[0]);
    for (const secret of ['ops.example.test', BACKEND_KEY, 'backend-page-detail']) {
      expect(logged).not.toContain(secret);
    }
  });
});

describe('drift guard against lib/team-api.ts', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../../../../../lib/team-api.ts', import.meta.url)),
    'utf8'
  );
  // Every call site: opsGet<...>('action' or opsPost<...>('action'. The two
  // generic declarations (opsGet<T = unknown>) are not call sites.
  const callRe = /\bops(Get|Post)<(?!T = unknown>)[\s\S]*?>\s*\(\s*'([a-z_]+)'/g;
  const calls = [...source.matchAll(callRe)].map((m) => ({ method: m[1], action: m[2] }));

  it('finds every call site', () => {
    const mentions = (source.match(/\bops(Get|Post)</g) ?? []).length;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.length).toBe(mentions - 2);
  });

  it('every action team-api.ts calls is allowlisted for that method', () => {
    for (const { method, action } of calls) {
      const table = method === 'Get' ? OPS_GET_PARAMS : OPS_POST_FIELDS;
      expect(Object.keys(table), `${method} ${action}`).toContain(action);
    }
  });

  it('every allowlisted action is called by team-api.ts', () => {
    const called = (method: string) => calls.filter((c) => c.method === method).map((c) => c.action).sort();
    expect(Object.keys(OPS_GET_PARAMS).sort()).toEqual(called('Get'));
    expect(Object.keys(OPS_POST_FIELDS).sort()).toEqual(called('Post'));
  });
});
