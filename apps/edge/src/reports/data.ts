/* Reports from the line server database (URD req 28–29). The running shift is saved first, so a report
   is at most one flush behind the screens. Only stored records are used: days with nothing stored are
   listed as empty, never filled in. */
import { AREAS, shiftsFor, targetsFor } from '@mg/core';
import { buildReport, dateRange, kpis, type Area, type CallRec, type Dataset, type Kpis, type OffRec, type Report, type ShiftInfo } from '@mg/reports';
import { z } from 'zod';
import type { Db } from '../db/index.ts';
import type { EngineHost } from '../engine-host.ts';
import type { Persistence } from '../persist.ts';

export const ReportQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  shift: z.string().min(1).max(40).default('all'),
  line: z.enum(['all', 'TRIM', 'CHASSIS', 'FINAL']).default('all'),
});
export type ReportQuery = z.infer<typeof ReportQuery>;

export interface ServerReport {
  report: Report; kpis: Kpis; multiDay: boolean;
  /** Days in the range with no stored shift. */
  empty: string[];
  meta: { from: string; to: string; shift: string; line: string; sources: string };
}

type ShiftRow = { key: string; summary: { name: string; date: string; start: number; lines: Record<Area, { target: number }> } | null; downtime: ShiftInfo['down'] | null };

export class ReportRangeError extends Error {}

export async function datasetFromDb(db: Db, host: EngineHost, days: string[], shift: string): Promise<Dataset> {
  const rows = await db.query<ShiftRow>("SELECT key, summary, downtime FROM shifts WHERE left(key, 10) = ANY($1) AND key NOT LIKE '% · off'", [days]);
  const S = host.S;
  const order = (date: string, name: string) => { const i = shiftsFor(S, date).findIndex((s: { name: string }) => s.name === name); return i < 0 ? 99 : i; };
  const shifts: ShiftInfo[] = [];
  for (const r of rows) {
    const date = r.key.slice(0, 10), name = r.key.slice(13); // "YYYY-MM-DD · Name"
    if (shift !== 'all' && name !== shift) continue;
    const targets = r.summary ? (Object.fromEntries(Object.entries(r.summary.lines).map(([a, l]) => [a, l.target])) as Record<Area, number>)
      : S.shift && S.shift.key === r.key ? (S.shift.targets as Record<Area, number>) : (targetsFor(S, date, name) as Record<Area, number>);
    shifts.push({ key: r.key, date, name, targets, down: r.downtime || { pos: {}, line: {}, cause: {} } });
  }
  shifts.sort((a, b) => a.date.localeCompare(b.date) || order(a.date, a.name) - order(b.date, b.name) || a.name.localeCompare(b.name));
  const keys = shifts.map((s) => s.key);
  const [prod, segments, offline, calls] = keys.length ? await Promise.all([
    db.query<{ area: string; vin: string; t: number; shiftKey: string }>('SELECT area, vin, t, shift_key AS "shiftKey" FROM production WHERE shift_key = ANY($1)', [keys]),
    db.query<{ pos: string; shiftKey: string; cycle: number; target: number }>('SELECT pos, shift_key AS "shiftKey", cycle, target FROM segments WHERE shift_key = ANY($1) ORDER BY t', [keys]),
    db.query<{ record: OffRec }>('SELECT record FROM offline_records WHERE shift_key = ANY($1) ORDER BY t', [keys]),
    db.query<{ record: CallRec }>("SELECT record FROM calls WHERE shift_key = ANY($1) AND (record->>'recorded')::boolean ORDER BY raised_t", [keys]),
  ]) : [[], [], [], []];
  return { shifts, prod, segments, offline: offline.map((r) => r.record), calls: calls.map((r) => r.record), takt: { ...S.cfg.takt } };
}

/** The report for a selection. Throws ReportRangeError for a bad or too long range. */
export async function makeReport(db: Db, host: EngineHost, persistence: Persistence | null, q: ReportQuery): Promise<ServerReport> {
  const to = q.to || q.from, days = dateRange(q.from, to);
  if (!days) throw new ReportRangeError('Choose real dates, the start no later than the end, at most 31 days.');
  if (persistence) await persistence.flush(); // the running shift, up to now
  const d = await datasetFromDb(db, host, days, q.shift);
  const multiDay = days.length > 1, report = buildReport(d, q.line, multiDay);
  const stored = new Set(d.shifts.map((s) => s.date));
  return {
    report, kpis: kpis(report, q.line), multiDay, empty: days.filter((x) => !stored.has(x)),
    meta: { from: q.from, to, shift: q.shift === 'all' ? 'All shifts' : q.shift, line: q.line === 'all' ? 'All lines' : AREAS[q.line].name, sources: 'line server database' },
  };
}
