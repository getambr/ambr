import { getSupabaseAdmin } from './supabase-admin';

interface AuditEvent {
  event_type: string;
  severity?: 'info' | 'warn' | 'error';
  actor?: string;
  details?: Record<string, unknown>;
  ip_address?: string;
}

/**
 * Log an audit event. Fire-and-forget by default — never blocks the caller.
 *
 * Returns the insert promise so a caller that NEEDS the row can await it.
 * Measured: unawaited, roughly one insert in three lands after
 * the serverless response and is delayed or dropped, because the instance can
 * freeze once the response is sent. Fine for background trails, not fine where
 * the row is the only record an event happened. Existing callers ignore the
 * return value and are unaffected.
 */
export function logAudit(event: AuditEvent): PromiseLike<unknown> {
  const db = getSupabaseAdmin();
  return db.from('audit_log')
    .insert({
      // `action` is a legacy NOT NULL column (migration 20260311); migration
      // 20260324 established action == event_type when it added event_type.
      // Omitting it made every logAudit() insert fail the not-null constraint.
      action: event.event_type,
      event_type: event.event_type,
      severity: event.severity || 'info',
      actor: event.actor || 'system', // `actor` is also NOT NULL
      details: event.details,
      ip_address: event.ip_address,
    })
    .then(({ error }) => {
      if (error) console.error('Audit log insert failed:', error.message);
    });
}
