/* Report definitions (URD req 28–29): production, station cycle times, downtime, offlined vehicles and
   assist calls, by shift and line, for one day or a range of days.
   One builder for both sources: the live state in the browser (offline demo) and the line server
   database. Both produce a Dataset; buildReport turns it into the rows the page, Excel and PDF show. */
import { AREAS as AREAS_, AREA_IDS as AREA_IDS_, CALL_TYPES, POS, WORK_POS, callDuration, callResponse, fmtClock, fmtDur } from '@mg/core';

export type Area = 'TRIM' | 'CHASSIS' | 'FINAL';
const AREAS = AREAS_ as Record<string, { name: string; short: string }>;
const AREA_IDS = AREA_IDS_ as Area[];
export const MAX_RANGE_DAYS = 31;

export interface ShiftInfo {
  key: string; date: string; name: string;
  targets: Record<Area, number>;
  down: { pos: Record<string, number>; line: Record<string, number>; cause: Record<string, number> };
}
export interface ProdRec { area: string; vin: string; t: number; shiftKey: string }
export interface SegRec { pos: string; shiftKey: string; cycle: number; target: number }
export interface OffRec { shiftKey: string; area: string; t: number; vin: string; pos: string; reason: string; by?: string | null; returnedT?: number | null }
export interface CallRec { shiftKey: string; area: string; pos: string; type: string; raisedT: number; respondedT: number | null; clearedT: number | null; respondedBy?: string | null; clearedBy?: string | null }
/** Everything a report needs, from either source. `takt` is used for stations with no cycles. */
export interface Dataset { shifts: ShiftInfo[]; prod: ProdRec[]; segments: SegRec[]; offline: OffRec[]; calls: CallRec[]; takt: Record<string, number> }

export interface ProdRow { shift: string; date: string; line: string; target: number; done: number; remaining: number; offline: number; down: number }
export interface CycleRow { shift: string; station: string; line: string; n: number; avg: number; max: number; takt: number; over: number }
export interface DownRow { shift: string; station: string; line: string; down: number; caused: number }
export interface OffRow { shift: string; t: number; vin: string; station: string; reason: string; by: string; returned: string }
export interface CallRow { shift: string; t: number; station: string; type: string; response: number | null; total: number | null; by: string }
export interface DayRow { date: string; line: string; target: number; done: number; down: number }
export interface Report { prod: ProdRow[]; cycle: CycleRow[]; down: DownRow[]; off: OffRow[]; calls: CallRow[]; byDay: DayRow[] }

const NO_DOWN = { pos: {}, line: {}, cause: {} };
const first = (by?: string | null) => (by || '').split(' · ')[0];

/** Lines and work stations for a line filter ('all' or an area id). */
export function selection(line: string) {
  const lines: Area[] = line === 'all' ? AREA_IDS : [line as Area];
  return { lines, stations: (WORK_POS as string[]).filter((id) => lines.includes(POS[id].area as Area)) };
}

/** The rows of the report. With `multiDay`, the shift column carries the date too and By day rows are made. */
export function buildReport(d: Dataset, line = 'all', multiDay = false): Report {
  const { lines, stations } = selection(line);
  const out: Report = { prod: [], cycle: [], down: [], off: [], calls: [], byDay: [] };
  for (const sh of d.shifts) {
    const key = sh.key, label = multiDay ? `${sh.date} ${sh.name}` : sh.name, D = sh.down || NO_DOWN;
    for (const a of lines) {
      const target = sh.targets[a] ?? 0, done = d.prod.filter((r) => r.shiftKey === key && r.area === a).length;
      out.prod.push({ shift: label, date: sh.date, line: AREAS[a].name, target, done, remaining: Math.max(0, target - done), offline: d.offline.filter((o) => o.shiftKey === key && o.area === a).length, down: D.line[a] || 0 });
    }
    for (const id of stations) {
      const segs = d.segments.filter((g) => g.shiftKey === key && g.pos === id), n = segs.length, area = POS[id].area;
      out.cycle.push({ shift: label, station: id, line: AREAS[area].short, n, avg: n ? segs.reduce((x, g) => x + g.cycle, 0) / n : 0, max: n ? Math.max(...segs.map((g) => g.cycle)) : 0, takt: n ? segs.reduce((x, g) => x + g.target, 0) / n : d.takt[area], over: segs.filter((g) => g.cycle > g.target).length });
      out.down.push({ shift: label, station: id, line: AREAS[area].short, down: D.pos[id] || 0, caused: D.cause[id] || 0 });
    }
    d.offline.filter((o) => o.shiftKey === key && (lines as string[]).includes(o.area)).sort((x, y) => x.t - y.t)
      .forEach((o) => out.off.push({ shift: label, t: o.t, vin: o.vin, station: o.pos, reason: o.reason, by: first(o.by), returned: o.returnedT != null ? fmtClock(o.returnedT, false) : '' }));
    d.calls.filter((c) => c.shiftKey === key && (lines as string[]).includes(c.area)).sort((x, y) => x.raisedT - y.raisedT)
      .forEach((c) => out.calls.push({ shift: label, t: c.raisedT, station: c.pos, type: CALL_TYPES[c.type as 'SUP' | 'MNT'].label, response: callResponse(c), total: callDuration(c), by: first(c.clearedBy || c.respondedBy) }));
  }
  if (multiDay) {
    const days = new Map<string, DayRow>();
    for (const r of out.prod) {
      const k = `${r.date}|${r.line}`, row = days.get(k) || { date: r.date, line: r.line, target: 0, done: 0, down: 0 };
      row.target += r.target; row.done += r.done; row.down += r.down; days.set(k, row);
    }
    out.byDay = [...days.values()];
  }
  return out;
}

export interface Kpis { done: number; target: number; offline: number; down: number; calls: number; avgResponse: number | null; avgClear: number | null }
/** The figures above the tables. With all lines, "completed" means vehicles completed on the Final line. */
export function kpis(r: Report, line = 'all'): Kpis {
  const sum = <T>(l: T[], f: (x: T) => number) => l.reduce((x, y) => x + (f(y) || 0), 0);
  const counted = line === 'all' ? r.prod.filter((p) => p.line === AREAS.FINAL.name) : r.prod;
  const answered = r.calls.filter((c) => c.response != null), cleared = answered.filter((c) => c.total != null);
  return {
    done: sum(counted, (p) => p.done), target: sum(counted, (p) => p.target), offline: r.off.length, down: sum(r.prod, (p) => p.down), calls: r.calls.length,
    avgResponse: answered.length ? sum(answered, (c) => c.response!) / answered.length : null,
    avgClear: answered.length ? sum(cleared, (c) => c.total!) / Math.max(1, cleared.length) : null,
  };
}

/* ── from the live state (the engine's own records) ── */
type LiveState = {
  shift: { key: string; date: string; name: string | null; targets: Record<Area, number> } | null;
  history: { key?: string; date: string; name: string; lines: Record<Area, { target: number }> }[];
  down: Record<string, ShiftInfo['down']>;
  prod: ProdRec[]; stats: { segments: SegRec[]; offline: OffRec[] }; calls: (CallRec & { recorded?: boolean })[];
  cfg: { takt: Record<string, number> };
};
/** Whether the live state holds records for this shift (the running one or one that ended in this session). */
export const liveHas = (S: LiveState, key: string) => (S.shift?.key === key && !!S.shift.name) || S.history.some((h) => h.key === key);

/** The dataset for the given shift keys, from the engine state. */
export function datasetFromState(S: LiveState, keys: string[]): Dataset {
  const shifts: ShiftInfo[] = [];
  for (const key of keys) {
    const H = S.history.find((h) => h.key === key);
    if (H) shifts.push({ key, date: H.date, name: H.name, targets: Object.fromEntries(AREA_IDS.map((a) => [a, H.lines[a].target])) as Record<Area, number>, down: S.down[key] || NO_DOWN });
    else if (S.shift && S.shift.key === key && S.shift.name) shifts.push({ key, date: S.shift.date, name: S.shift.name, targets: S.shift.targets, down: S.down[key] || NO_DOWN });
  }
  const want = new Set(shifts.map((s) => s.key));
  return {
    shifts,
    prod: S.prod.filter((r) => want.has(r.shiftKey)),
    segments: S.stats.segments.filter((g) => want.has(g.shiftKey)),
    offline: S.stats.offline.filter((o) => want.has(o.shiftKey)),
    calls: S.calls.filter((c) => want.has(c.shiftKey) && c.recorded),
    takt: { ...S.cfg.takt },
  };
}

/** Joins datasets (e.g. live shifts and generated demo history), keeping the shift order given. */
export function mergeDatasets(parts: Dataset[], takt: Record<string, number>): Dataset {
  return { shifts: parts.flatMap((p) => p.shifts), prod: parts.flatMap((p) => p.prod), segments: parts.flatMap((p) => p.segments), offline: parts.flatMap((p) => p.offline), calls: parts.flatMap((p) => p.calls), takt };
}

/* ── for export: plain rows with readable headings ── */
export interface ReportMeta { from: string; to: string; shift: string; line: string; sources: string; exportedAt: string; by: string }
const dur = (s: number | null | undefined) => (s == null ? '' : fmtDur(s));
const pct = (done: number, target: number) => (target ? Math.round((done / target) * 100) : '');

export function reportSheets(r: Report, meta: ReportMeta): Record<string, (string | number)[][]> {
  const sheets: Record<string, (string | number)[][]> = {};
  if (r.byDay.length) sheets['By day'] = [['Date', 'Line', 'Target', 'Completed', 'Downtime (h:mm:ss)', 'Attainment %'], ...r.byDay.map((d) => [d.date, d.line, d.target, d.done, dur(d.down), pct(d.done, d.target)])];
  Object.assign(sheets, {
    'Production summary': [['Shift', 'Line', 'Target', 'Completed', 'Remaining', 'Offlined', 'Downtime (h:mm:ss)', 'Attainment %'], ...r.prod.map((p) => [p.shift, p.line, p.target, p.done, p.remaining, p.offline, dur(p.down), pct(p.done, p.target)])],
    'Station cycle times': [['Shift', 'Station', 'Line', 'Cycles', 'Average cycle', 'Longest cycle', 'Takt', 'Cycles over takt'], ...r.cycle.map((c) => [c.shift, c.station, c.line, c.n, dur(c.avg), dur(c.max), dur(c.takt), c.over])],
    Downtime: [['Shift', 'Station', 'Line', 'Downtime at station', 'Downtime caused (root)'], ...r.down.map((d) => [d.shift, d.station, d.line, dur(d.down), dur(d.caused)])],
    'Offlined vehicles': [['Shift', 'Time', 'VIN', 'Station', 'Reason', 'By', 'Returned'], ...r.off.map((o) => [o.shift, fmtClock(o.t, false), o.vin, o.station, o.reason, o.by, o.returned || ''])],
    'Assist calls': [['Shift', 'Time', 'Station', 'Call', 'Response time', 'Time to clear', 'Cleared by'], ...r.calls.map((c) => [c.shift, fmtClock(c.t, false), c.station, c.type, dur(c.response), dur(c.total), c.by])],
    About: [['MG GA Andon · report'], ['Date', meta.from === meta.to ? meta.from : `${meta.from} to ${meta.to}`], ['Shift', meta.shift], ['Line', meta.line], ['Exported', meta.exportedAt], ['By', meta.by], ['Data', meta.sources], ['Note', 'SIMULATION: no PLC, scanner or sensor is connected.']],
  });
  return sheets;
}

/** File name for an export, e.g. MG-GA-Andon_2026-11-06_Shift-A_Final-Line. */
export function reportFileName(meta: Pick<ReportMeta, 'from' | 'to' | 'shift' | 'line'>) {
  return `MG-GA-Andon_${meta.from === meta.to ? meta.from : `${meta.from}_to_${meta.to}`}_${meta.shift}_${meta.line}`.replace(/[^\w.-]+/g, '-');
}

/** Dates from `from` to `to` inclusive (YYYY-MM-DD), or null when invalid or longer than MAX_RANGE_DAYS. */
export function dateRange(from: string, to: string): string[] | null {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(from) || !re.test(to)) return null;
  const a = Date.parse(`${from}T00:00:00Z`), b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || new Date(a).toISOString().slice(0, 10) !== from || new Date(b).toISOString().slice(0, 10) !== to) return null;
  const n = Math.round((b - a) / 86_400_000) + 1;
  if (n < 1 || n > MAX_RANGE_DAYS) return null;
  return Array.from({ length: n }, (_, i) => new Date(a + i * 86_400_000).toISOString().slice(0, 10));
}
