/* The shared report builder gives exactly the rows the Reports page built before (reference copy of the
   old in-page code below), and the range helpers behave. */
import { expect, test } from 'vitest';
import { AREAS, CALL_TYPES, POS, callDuration, callResponse, createState, fmtClock, raiseCall, respondCall, clearCall, takeOffLine, returnToLine, shiftKey, shiftsFor, dateKeyOf } from '@mg/core';
import { runUntil } from '@mg/sim';
import { buildReport, dateRange, datasetFromState, kpis, reportFileName, reportSheets, selection } from '../src/index.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
// the Reports page's previous code for shifts with live records (apps/web/src/reports.js before Phase 5)
function oldLiveRows(S: any, key: string, sh: string, lines: string[], stations: string[], out: any) {
  const H = S.history.find((h: any) => h.key === key), D = S.down[key] || { pos: {}, line: {}, cause: {} };
  for (const a of lines) {
    const target = H ? H.lines[a].target : S.shift.targets[a], done = S.prod.filter((r: any) => r.shiftKey === key && r.area === a).length;
    out.prod.push({ shift: sh, line: (AREAS as any)[a].name, target, done, remaining: Math.max(0, target - done), offline: S.stats.offline.filter((o: any) => o.shiftKey === key && o.area === a).length, down: D.line[a] || 0 });
  }
  for (const id of stations) {
    const segs = S.stats.segments.filter((g: any) => g.shiftKey === key && g.pos === id), n = segs.length;
    out.cycle.push({ shift: sh, station: id, line: (AREAS as any)[POS[id].area].short, n, avg: n ? segs.reduce((x: number, g: any) => x + g.cycle, 0) / n : 0, max: n ? Math.max(...segs.map((g: any) => g.cycle)) : 0, takt: n ? segs.reduce((x: number, g: any) => x + g.target, 0) / n : S.cfg.takt[POS[id].area], over: segs.filter((g: any) => g.cycle > g.target).length });
    out.down.push({ shift: sh, station: id, line: (AREAS as any)[POS[id].area].short, down: D.pos[id] || 0, caused: D.cause[id] || 0 });
  }
  S.stats.offline.filter((o: any) => o.shiftKey === key && lines.includes(o.area)).forEach((o: any) => out.off.push({ shift: sh, t: o.t, vin: o.vin, station: o.pos, reason: o.reason, by: (o.by || '').split(' · ')[0], returned: o.returnedT != null ? fmtClock(o.returnedT, false) : '' }));
  S.calls.filter((c: any) => c.shiftKey === key && c.recorded && lines.includes(c.area)).forEach((c: any) => out.calls.push({ shift: sh, t: c.raisedT, station: c.pos, type: (CALL_TYPES as any)[c.type].label, response: callResponse(c), total: callDuration(c), by: (c.clearedBy || c.respondedBy || '').split(' · ')[0] }));
}

function plant() {
  const S: any = createState(11, { delayRate: 0.04 });
  runUntil(S, 9 * 3600);
  const v = ['FL4', 'FL5', 'FL3', 'FL6', 'FL2'].map((p) => S.pos[p].occ?.vehicleId).find(Boolean);
  expect(v).toBeTruthy();
  if (v) expect(takeOffLine(S, v, { reason: 'Part fitment issue', by: 'Usman Tariq · Supervisor', scan: S.vehicles[v].vin }).ok).toBe(true);
  raiseCall(S, 'CL2', 'SUP', 'Operator'); const c1 = S.calls[S.calls.length - 1].id;
  raiseCall(S, 'FL3', 'MNT', 'Operator'); const c2 = S.calls[S.calls.length - 1].id;
  runUntil(S, S.t + 90); respondCall(S, c1, 'Usman Tariq · Supervisor');
  runUntil(S, S.t + 200); clearCall(S, c1, 'Usman Tariq · Supervisor'); respondCall(S, c2, 'Bilal Ahmed · Maintenance');
  runUntil(S, 12 * 3600);
  if (v && S.vehicles[v]) returnToLine(S, v, 'Usman Tariq · Supervisor');
  runUntil(S, 22 * 3600); // shift A over, B running
  return S;
}

test('rows are identical to the previous in-page report, for every shift and line', () => {
  const S = plant(), date = dateKeyOf(S, 0);
  const names = shiftsFor(S, date).map((s: { name: string }) => s.name);
  expect(names.length).toBeGreaterThan(1);
  for (const line of ['all', 'TRIM', 'CHASSIS', 'FINAL']) {
    const { lines, stations } = selection(line);
    for (const sh of names) {
      const key = shiftKey(date, sh), old: any = { prod: [], cycle: [], down: [], off: [], calls: [] };
      oldLiveRows(S, key, sh, lines, stations, old);
      const r = buildReport(datasetFromState(S, [key]), line);
      for (const k of ['prod', 'cycle', 'down', 'off', 'calls']) expect((r as any)[k].map(({ date: _d, ...x }: any) => x), `${line} ${sh} ${k}`).toEqual(old[k]);
    }
  }
  const all = buildReport(datasetFromState(S, names.map((n: string) => shiftKey(date, n))), 'all');
  expect(all.off.length).toBeGreaterThan(0);
  const mine = all.calls.find((c) => c.station === 'CL2' && c.response === 90);
  expect(mine && mine.by).toBe('Usman Tariq');
});

test('a range adds By day totals and labels shifts with their date', () => {
  const S = plant(), date = dateKeyOf(S, 0), keys = shiftsFor(S, date).map((s: { name: string }) => shiftKey(date, s.name));
  const r = buildReport(datasetFromState(S, keys), 'FINAL', true);
  expect(r.prod[0].shift).toBe(`${date} ${r.prod[0].shift.split(' ').slice(1).join(' ')}`);
  expect(r.byDay).toEqual([{ date, line: 'Final Line', target: r.prod.reduce((x, p) => x + p.target, 0), done: r.prod.reduce((x, p) => x + p.done, 0), down: r.prod.reduce((x, p) => x + p.down, 0) }]);
  const k = kpis(r, 'FINAL');
  expect(k.done).toBe(r.byDay[0].done);
  const sheets = reportSheets(r, { from: date, to: date, shift: 'All shifts', line: 'Final Line', sources: 'test', exportedAt: 'now', by: 'Tester' });
  expect(Object.keys(sheets)).toEqual(['By day', 'Production summary', 'Station cycle times', 'Downtime', 'Offlined vehicles', 'Assist calls', 'About']);
  expect(sheets['Production summary'].length).toBe(r.prod.length + 1);
});

test('date ranges: inclusive, at most 31 days, real dates only', () => {
  expect(dateRange('2026-11-01', '2026-11-03')).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
  expect(dateRange('2026-11-03', '2026-11-03')).toEqual(['2026-11-03']);
  expect(dateRange('2026-10-01', '2026-10-31')!.length).toBe(31);
  expect(dateRange('2026-10-01', '2026-11-01')).toBeNull();
  expect(dateRange('2026-11-03', '2026-11-01')).toBeNull();
  expect(dateRange('2026-02-30', '2026-03-01')).toBeNull();
  expect(dateRange('yesterday', '2026-03-01')).toBeNull();
  expect(reportFileName({ from: '2026-11-01', to: '2026-11-03', shift: 'All shifts', line: 'Final Line' })).toBe('MG-GA-Andon_2026-11-01_to_2026-11-03_All-shifts_Final-Line');
});
