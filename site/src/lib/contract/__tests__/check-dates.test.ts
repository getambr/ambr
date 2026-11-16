import { describe, expect, it } from 'vitest';
import type { CheckOutcome } from '../check-terms';
import { goldens, runGolden } from './check-fixtures';

type Json = Record<string, unknown>;

const d1 = goldens()['d1-general-auth'];
const d2 = goldens()['d2-limited-service'];

const entry = (r: CheckOutcome, path: string) => r.not_checked.find((n) => n.path === path);
const reasons = (r: CheckOutcome) => r.reasons.join(' ');

describe('the window comes only from the agreement\'s own keys', () => {
  it('does not take a phase, a milestone or a window deep in the tree as the end of the agreement', () => {
    const r = runGolden(d1, {
      mr: (m) => {
        m.phases = [{ name: 'Phase one', start: '2026-01-01', end: '2026-02-01' }];
        m.maintenance_window = { start: '02:00 UTC', end: '04:00 UTC' };
        m.delivery = { milestones: [{ title: 'First delivery', end_date: '2026-03-01', start_date: '2027-01-01' }] };
      },
    });
    expect(r.verdict).toBe('within_limits');
    for (const path of ['phases[0].start', 'phases[0].end', 'maintenance_window.start', 'maintenance_window.end', 'delivery.milestones[0].end_date', 'delivery.milestones[0].start_date']) {
      expect(entry(r, path), path).toMatchObject({ kind: 'agreement_text' });
    }
    expect(JSON.stringify(r.checks.filter((c) => c.rule === 'validity_window'))).not.toContain('2026-02-01');
  });

  it('still reads a deep start or end whose value is not a date or a time as something it cannot place', () => {
    const r = runGolden(d1, { mr: (m) => { m.maintenance_window = { start: '02:00 UTC', end: 'after USD 500 is spent' }; } });
    expect(r.verdict).toBe('incomplete');
  });

  it('reads the keys at the top level and directly under a term container', () => {
    const top = runGolden(d1, { mr: (m) => { m.end_date = '2026-06-10'; } });
    expect(top.verdict).toBe('out_of_scope');
    expect(reasons(top)).toContain('ended on 2026-06-10');
    for (const container of ['duration', 'term', 'validity', 'agreement_term']) {
      const r = runGolden(d1, { mr: (m) => { m[container] = { ...((m[container] as Json) ?? {}), end_date: '2026-06-10' }; } });
      expect(r.verdict, container).toBe('out_of_scope');
    }
    const early = runGolden(d1, { mr: (m) => { m.start_date = '2026-07-01'; } });
    expect(early.verdict).toBe('out_of_scope');
    expect(reasons(early)).toContain('has not started');
  });
});

describe('an end date under a key the check does not know', () => {
  const keys = ['valid_through', 'expires_on', 'contract_end_date', 'valid_till', 'term_end', 'expiration'];

  it('is handed back and makes the check incomplete, at the top level and under the term', () => {
    for (const key of keys) {
      const top = runGolden(d1, { mr: (m) => { m[key] = '2026-12-31'; } });
      expect(top.verdict, key).toBe('incomplete');
      expect(entry(top, key), key).toMatchObject({ kind: 'agreement_text' });
      const nested = runGolden(d1, { mr: (m) => { (m.duration as Json)[key] = '2026-12-31'; } });
      expect(nested.verdict, key).toBe('incomplete');
      expect(entry(nested, `duration.${key}`), key).toBeDefined();
    }
  });

  it('is incomplete for a date written inside the key as well', () => {
    const r = runGolden(d1, { mr: (m) => { m.valid_through = { date: '2026-12-31' }; } });
    expect(r.verdict).toBe('incomplete');
    expect(entry(r, 'valid_through.date')).toBeDefined();
  });

  it('is incomplete even when the date has passed, and is not read as the window', () => {
    const r = runGolden(d1, { mr: (m) => { m.expires_on = '2026-06-10'; } });
    expect(r.verdict).toBe('incomplete');
    expect(JSON.stringify(r.checks.filter((c) => c.rule === 'validity_window'))).not.toContain('2026-06-10');
  });

  it('leaves the keys it knows alone', () => {
    for (const key of ['end_date', 'expiry_date', 'valid_until', 'termination_date']) {
      const r = runGolden(d1, { mr: (m) => { (m.duration as Json)[key] = '2030-01-01'; } });
      expect(r.verdict, key).not.toBe('out_of_scope');
    }
  });
});

describe('an end date in the text against the end the form answers give', () => {
  const window = (end: string) => ({
    parameters: (p: Json) => { p.start_date = '2026-01-01'; p.end_date = '2026-12-31'; },
    mr: (m: Json) => { m.duration = { start_date: '2026-01-01', end_date: end }; },
  });

  it('is incomplete when it differs, whether it is earlier or later', () => {
    expect(runGolden(d2, window('2026-12-31')).verdict).toBe('within_limits');
    for (const end of ['2027-06-30', '2026-09-30']) {
      const r = runGolden(d2, window(end));
      expect(r.verdict, end).toBe('incomplete');
      expect(reasons(r), end).toContain('differs from the form answers');
    }
  });

  it('is incomplete when it differs from the end that a duration in months gives', () => {
    // created 2026-06-01, twelve months: the end is 2027-06-01
    const withEnd = (end: string) => runGolden(d1, { mr: (m) => { (m.duration as Json).end_date = end; } });
    expect(withEnd('2027-06-01').verdict).toBe('within_limits');
    for (const end of ['2027-12-31', '2026-12-31']) {
      const r = withEnd(end);
      expect(r.verdict, end).toBe('incomplete');
      expect(reasons(r), end).toContain('differs from the end the form answers give');
    }
  });
});
