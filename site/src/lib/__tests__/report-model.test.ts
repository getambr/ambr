import { describe, it, expect } from 'vitest';
import { worstStatus, sortBySeverity, summarizeByDay, stripStart } from '@/lib/health/report-model';

const ok = { status: 'ok' } as const;
const degraded = { status: 'degraded' } as const;
const down = { status: 'down' } as const;

describe('worstStatus', () => {
  it('is the worst item', () => {
    expect(worstStatus([ok, ok])).toBe('ok');
    expect(worstStatus([ok, degraded, ok])).toBe('degraded');
    expect(worstStatus([degraded, down, ok])).toBe('down');
  });

  it('an empty run is ok', () => {
    expect(worstStatus([])).toBe('ok');
  });
});

describe('sortBySeverity', () => {
  it('puts red first, then amber, then green, keeping the order inside a group', () => {
    const items = [
      { key: 'a', ...ok },
      { key: 'b', ...down },
      { key: 'c', ...degraded },
      { key: 'd', ...ok },
      { key: 'e', ...down },
      { key: 'f', ...degraded },
    ];
    expect(sortBySeverity(items).map((i) => i.key)).toEqual(['b', 'e', 'c', 'f', 'a', 'd']);
  });

  it('does not change the array it is given', () => {
    const items = [{ key: 'a', ...ok }, { key: 'b', ...down }];
    sortBySeverity(items);
    expect(items.map((i) => i.key)).toEqual(['a', 'b']);
  });
});

describe('summarizeByDay', () => {
  const now = new Date('2026-10-30T09:00:00Z');

  it('returns seven cells ending today, empty where no run happened', () => {
    const cells = summarizeByDay([], now);
    expect(cells.map((c) => c.date)).toEqual([
      '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30',
    ]);
    expect(cells.every((c) => c.overall === null && c.runs === 0)).toBe(true);
  });

  it('colours a day by its worst run, so a red run is not hidden by a later green one', () => {
    const cells = summarizeByDay(
      [
        { ran_at: '2026-10-28T06:00:01Z', overall: 'down' },
        { ran_at: '2026-10-28T18:00:00Z', overall: 'ok' },
        { ran_at: '2026-10-29T06:00:00Z', overall: 'degraded' },
        { ran_at: '2026-10-30T06:00:00Z', overall: 'ok' },
      ],
      now,
    );
    const byDate = Object.fromEntries(cells.map((c) => [c.date, c]));
    expect(byDate['2026-10-28']).toMatchObject({ overall: 'down', runs: 2 });
    expect(byDate['2026-10-29']).toMatchObject({ overall: 'degraded', runs: 1 });
    expect(byDate['2026-10-30']).toMatchObject({ overall: 'ok', runs: 1 });
    expect(byDate['2026-10-27'].overall).toBeNull();
  });

  it('ignores runs outside the strip and rows with a bad timestamp', () => {
    const cells = summarizeByDay(
      [
        { ran_at: '2026-10-23T23:59:59Z', overall: 'down' },
        { ran_at: 'not a date', overall: 'down' },
      ],
      now,
    );
    expect(cells.every((c) => c.overall === null)).toBe(true);
  });

  it('days are UTC days', () => {
    expect(stripStart(new Date('2026-10-30T23:59:59Z'), 7).toISOString()).toBe('2026-10-24T00:00:00.000Z');
    expect(stripStart(new Date('2026-10-30T00:00:00Z'), 7).toISOString()).toBe('2026-10-24T00:00:00.000Z');
  });
});
