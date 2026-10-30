import { describe, it, expect } from 'vitest';
import { overallStatus } from '@/lib/health/rollup';

const ok = { status: 'ok' } as const;
const degraded = { status: 'degraded' } as const;
const down = { status: 'down' } as const;

describe('overallStatus', () => {
  it('rolls up the counted checks: any down is unhealthy, all ok is healthy', () => {
    expect(overallStatus({ supabase: ok, stripe: ok })).toBe('healthy');
    expect(overallStatus({ supabase: ok, stripe: degraded })).toBe('degraded');
    expect(overallStatus({ supabase: down, stripe: degraded })).toBe('unhealthy');
  });

  // 2026-10-16: three Apps Script timeouts in a row made the endpoint 503 while
  // every product dependency was fine.
  it('ignores a report-only check whether it is degraded or down', () => {
    expect(overallStatus({ supabase: ok, ops_agent: degraded }, ['ops_agent'])).toBe('healthy');
    expect(overallStatus({ supabase: ok, ops_agent: down }, ['ops_agent'])).toBe('healthy');
  });

  it('still reports a counted failure next to a report-only one', () => {
    expect(overallStatus({ supabase: down, ops_agent: ok }, ['ops_agent'])).toBe('unhealthy');
    expect(overallStatus({ resend: degraded, ops_agent: down }, ['ops_agent'])).toBe('degraded');
  });
});
