import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the payload handed to audit_log.insert() without touching a real DB.
// The row parameter must be declared on the mock's TYPE, or
// `insertMock.mock.calls[0]` types as an empty tuple and every `calls[0][0]`
// read below is a compile error.
const { insertMock } = vi.hoisted(() => ({
  insertMock: vi.fn<(row: Record<string, unknown>) => Promise<{ error: null }>>(
    () => Promise.resolve({ error: null }),
  ),
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({ insert: insertMock }),
  }),
}));

import { logAudit } from '../audit';

describe('logAudit', () => {
  beforeEach(() => insertMock.mockClear());

  // Regression: audit_log.action is a legacy NOT NULL column. Omitting it made
  // every logAudit() insert fail with 23502 in prod (silently, fire-and-forget).
  it('always supplies the NOT NULL `action` column (mirrors event_type)', () => {
    logAudit({ event_type: 'contract_revoked', actor: '0xabc' });

    expect(insertMock).toHaveBeenCalledTimes(1);
    const payload = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.action).toBe('contract_revoked');
    expect(payload.action).not.toBeNull();
    expect(payload.action).not.toBeUndefined();
  });

  it('defaults the NOT NULL `actor` column when the caller omits it', () => {
    logAudit({ event_type: 'system_event' });

    const payload = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.actor).toBe('system');
  });

  it('still populates event_type and a default severity', () => {
    logAudit({ event_type: 'key_created', actor: 'admin' });

    const payload = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.event_type).toBe('key_created');
    expect(payload.severity).toBe('info');
  });
});
