import { getSupabaseAdmin } from './supabase-admin';

interface AuditEvent {
  event_type: string;
  severity?: 'info' | 'warn' | 'error';
  actor?: string;
  details?: Record<string, unknown>;
  ip_address?: string;
}

/**
 * Log an audit event. Fire-and-forget — never blocks the caller.
 */
export function logAudit(event: AuditEvent): void {
  const db = getSupabaseAdmin();
  db.from('audit_log')
    .insert({
      event_type: event.event_type,
      severity: event.severity || 'info',
      actor: event.actor,
      details: event.details,
      ip_address: event.ip_address,
    })
    .then(({ error }) => {
      if (error) console.error('Audit log insert failed:', error.message);
    });
}
