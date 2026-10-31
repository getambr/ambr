/**
 * Shapes and pure logic of the daily report. No server imports on purpose: a
 * client-side view may import this file, and anything that pulls in the database
 * client would end up in the browser bundle.
 */

export type ReportStatus = 'ok' | 'degraded' | 'down';

export interface ReportItem {
  key: string;
  /** Plain English, for a reader who is not an engineer. */
  label: string;
  status: ReportStatus;
  /** Plain English. Never a secret, a key or a raw upstream payload. */
  detail?: string;
  latency_ms?: number;
}

const SEVERITY: Record<ReportStatus, number> = { ok: 0, degraded: 1, down: 2 };

/** The overall status of a run is its worst item. An empty run is ok. */
export function worstStatus(items: ReadonlyArray<{ status: ReportStatus }>): ReportStatus {
  let worst: ReportStatus = 'ok';
  for (const item of items) {
    if (SEVERITY[item.status] > SEVERITY[worst]) worst = item.status;
  }
  return worst;
}

/** Red first, then amber, then green; within a group the original order stays. */
export function sortBySeverity<T extends { status: ReportStatus }>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => SEVERITY[b.item.status] - SEVERITY[a.item.status] || a.index - b.index)
    .map(({ item }) => item);
}

export interface DaySummary {
  /** UTC calendar day, YYYY-MM-DD. */
  date: string;
  /** Worst status of any run that day, or null when no run happened. */
  overall: ReportStatus | null;
  runs: number;
}

function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** First instant of the oldest day shown by a strip of `days` days ending today (UTC). */
export function stripStart(now: Date, days: number): Date {
  const today = Date.parse(`${utcDay(now.getTime())}T00:00:00.000Z`);
  return new Date(today - (days - 1) * 86_400_000);
}

/**
 * One cell per UTC day, oldest first, the last cell being today. A day with
 * several runs shows the worst of them, so a red run is not hidden by a later green one.
 */
export function summarizeByDay(
  rows: ReadonlyArray<{ ran_at: string; overall: ReportStatus }>,
  now: Date,
  days = 7,
): DaySummary[] {
  const first = stripStart(now, days).getTime();
  const cells: DaySummary[] = [];
  for (let i = 0; i < days; i++) {
    cells.push({ date: utcDay(first + i * 86_400_000), overall: null, runs: 0 });
  }
  for (const row of rows) {
    const t = Date.parse(row.ran_at);
    if (!Number.isFinite(t)) continue;
    const cell = cells.find((c) => c.date === utcDay(t));
    if (!cell) continue;
    cell.runs += 1;
    cell.overall = cell.overall ? worstStatus([{ status: cell.overall }, { status: row.overall }]) : row.overall;
  }
  return cells;
}
