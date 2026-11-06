/* Reports from the database (URD req 28–29): the same rows as from memory, before and after memory is
   trimmed; ranges and empty days; Excel and PDF files; permissions and the access log; the report saved
   at the end of each shift. The plant is driven by hand (no timers) for determinism. */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import ExcelJS from 'exceljs';
import { MGE } from '@mg/engine';
import { dateKeyOf, shiftKey, trimHistory } from '@mg/core';
import { buildReport, datasetFromState } from '@mg/reports';
import { buildServer } from '../src/server.ts';
import { runCommand, type Actor } from '../src/commands.ts';
import { datasetFromDb } from '../src/reports/data.ts';
import { freshDatabase } from './helpers/db.ts';

let T: Awaited<ReturnType<typeof freshDatabase>>;
let srv: Awaited<ReturnType<typeof buildServer>>;
let base = '', day1 = '', day0 = '';
const sup: Actor = { kind: 'user', id: 'u3', name: 'Usman Tariq', role: 'supervisor' };
const maint: Actor = { kind: 'user', id: 'u4', name: 'Bilal Ahmed', role: 'maintenance' };

async function drive(until: number, every = 600) {
  const host = srv.host;
  while (host.S.t < until) {
    MGE.runUntil(host.S, Math.min(until, host.S.t + every));
    host.onAdvance?.(host.S);
    host.publish();
    await srv.persistence!.flush();
  }
}
const waitFor = async (f: () => Promise<boolean>, ms = 30_000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await f()) return; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timed out'); };

beforeAll(async () => {
  T = await freshDatabase();
  srv = await buildServer({ seed: 11, webDir: null, databaseUrl: T.url, demo: true, autostart: false });
  await srv.app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(srv.app.server.address() as { port: number }).port}`;
  const S = srv.host.S;
  day0 = dateKeyOf(S, -1); day1 = dateKeyOf(S, 0);
  await drive(9 * 3600);
  const vid = ['FL4', 'FL5', 'FL3', 'FL6', 'FL2'].map((x) => S.pos[x].occ?.vehicleId).find(Boolean)!;
  expect((await runCommand(srv.host, { type: 'TAKE_OFFLINE', vehicleId: vid, reason: 'Part fitment issue', scan: S.vehicles[vid].vin }, sup)).ok).toBe(true);
  const call = (await runCommand(srv.host, { type: 'RAISE_CALL', pos: 'CL2', callType: 'MNT' }, sup)) as { id: string };
  await drive(9 * 3600 + 120, 60);
  await runCommand(srv.host, { type: 'RESPOND_CALL', callId: call.id }, maint);
  await drive(9 * 3600 + 400, 60);
  await runCommand(srv.host, { type: 'CLEAR_CALL', callId: call.id }, maint);
  await drive(12 * 3600);
  await runCommand(srv.host, { type: 'RETURN_TO_LINE', vehicleId: vid }, sup);
  await drive(20 * 3600); // Shift A over, Shift B running
}, 240_000);
afterAll(async () => { await srv.app.close(); await T.drop(); });

async function signIn(id: string, password: string) {
  const r = await fetch(`${base}/api/auth/sign-in`, { method: 'POST', headers: { 'x-mg-client': 'web', 'content-type': 'application/json' }, body: JSON.stringify({ id, password }) });
  expect(r.status).toBe(200);
  return (r.headers.get('set-cookie') || '').split(';')[0];
}
const get = (path: string, cookie: string) => fetch(base + path, { headers: { cookie } });

describe('reports from the database', () => {
  test('match the report from memory, for every shift and line, also after memory is trimmed', async () => {
    const S = srv.host.S, keys = ['Shift A', 'Shift B'].map((n) => shiftKey(day1, n));
    const fromMemory = (line: string) => buildReport(datasetFromState(S, keys), line);
    const fromDb = async (line: string) => buildReport(await datasetFromDb(T.db, srv.host, [day1], 'all'), line);
    await srv.persistence!.flush();
    const expected: Record<string, ReturnType<typeof fromMemory>> = {};
    for (const line of ['all', 'TRIM', 'CHASSIS', 'FINAL']) { expected[line] = fromMemory(line); expect(await fromDb(line), line).toEqual(expected[line]); }
    expect(expected.all.prod.find((p) => p.shift === 'Shift A' && p.line === 'Final Line')!.done).toBeGreaterThan(20);
    expect(expected.all.off.some((o) => o.by === 'Usman Tariq' && o.returned)).toBe(true);
    expect(expected.all.calls.some((c) => c.station === 'CL2' && c.by === 'Bilal Ahmed' && c.total != null)).toBe(true);
    // what leaves memory is still in the reports
    const copy = structuredClone({ prod: S.prod, segments: S.stats.segments, offline: S.stats.offline, calls: S.calls });
    trimHistory(S, S.t);
    (srv.persistence as unknown as { savedT: number }).savedT -= 7200; // a flush after the trim re-sends recent rows and the shifts
    await srv.persistence!.flush();
    for (const line of ['all', 'FINAL']) expect(await fromDb(line), `trimmed ${line}`).toEqual(expected[line]);
    Object.assign(S, { prod: copy.prod, calls: copy.calls }); Object.assign(S.stats, { segments: copy.segments, offline: copy.offline });
  });

  test('the API: ranges, empty days, the shift filter, permissions and bad input', async () => {
    const viewer = await signIn('MG-9001', 'View@2026');
    const one = await (await get(`/api/reports?from=${day1}&shift=Shift%20A&line=FINAL`, viewer)).json();
    expect(one.ok).toBe(true);
    expect(one.report.prod.map((p: { shift: string }) => p.shift)).toEqual(['Shift A']);
    expect(one.multiDay).toBe(false);
    const range = await (await get(`/api/reports?from=${day0}&to=${day1}`, viewer)).json();
    expect(range.empty).toEqual([day0]); // before the server started: nothing stored, nothing invented
    expect(range.report.byDay.filter((d: { date: string }) => d.date === day1).map((d: { done: number }) => d.done))
      .toEqual(['Trim Line', 'Chassis Line', 'Final Line'].map((l) => one.report.prod.length && range.report.prod.filter((p: { line: string }) => p.line === l).reduce((x: number, p: { done: number }) => x + p.done, 0)));
    expect(range.report.prod[0].shift).toBe(`${day1} Shift A`);
    expect((await get(`/api/reports?from=2026-01-01&to=2026-03-01`, viewer)).status).toBe(400);
    expect((await get(`/api/reports?from=tomorrow`, viewer)).status).toBe(400);
    expect((await get(`/api/reports?from=${day1}&line=PAINT`, viewer)).status).toBe(400);
    expect((await fetch(`${base}/api/reports?from=${day1}`)).status).toBe(401);
    // a line TV (display link) has no reports
    const admin = await signIn('MG-1001', 'Admin@2026');
    const link = await (await fetch(`${base}/api/displays`, { method: 'POST', headers: { 'x-mg-client': 'web', 'content-type': 'application/json', cookie: admin }, body: JSON.stringify({ name: 'Final TV', line: 'final' }) })).json();
    const tv = await fetch(`${base}/api/auth/display`, { method: 'POST', headers: { 'x-mg-client': 'web', 'content-type': 'application/json' }, body: JSON.stringify({ token: link.token }) });
    expect((await get(`/api/reports?from=${day1}`, (tv.headers.get('set-cookie') || '').split(';')[0])).status).toBe(403);
  });

  test('Excel and PDF files, written to the access log', async () => {
    const sup = await signIn('MG-3112', 'Line@2026');
    const x = await get(`/api/reports/file.xlsx?from=${day1}&line=FINAL`, sup);
    expect(x.status).toBe(200);
    expect(x.headers.get('content-disposition')).toBe(`attachment; filename="MG-GA-Andon_${day1}_All-shifts_Final-Line.xlsx"`);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await x.arrayBuffer()) as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Production summary', 'Station cycle times', 'Downtime', 'Offlined vehicles', 'Assist calls', 'About']);
    const json = await (await get(`/api/reports?from=${day1}&line=FINAL`, sup)).json();
    expect(wb.getWorksheet('Station cycle times')!.rowCount).toBe(json.report.cycle.length + 1);
    expect(wb.getWorksheet('Offlined vehicles')!.getRow(2).getCell(3).value).toBe(json.report.off[0].vin);
    expect(String(wb.getWorksheet('About')!.getRow(6).getCell(2).value)).toBe('Usman Tariq · Supervisor');

    const p = await get(`/api/reports/file.pdf?from=${day1}`, sup);
    expect(p.status).toBe(200);
    expect(p.headers.get('content-type')).toBe('application/pdf');
    const pdf = Buffer.from(await p.arrayBuffer());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length).toBeGreaterThan(1);
    expect(pdf.toString('latin1')).toMatch(/MG GA Andon report/); // document title (uncompressed info)
    const log = await T.db.query<{ who: string; detail: string }>("SELECT who, detail FROM auth_log WHERE action = 'Report exported' ORDER BY id");
    expect(log.map((l) => l.detail)).toEqual([`XLSX · ${day1} · All shifts · Final Line`, `PDF · ${day1} · All shifts · All lines`]);
    expect(log[0].who).toBe('Usman Tariq');
  });

  test('each finished shift gets one saved Excel and PDF report', async () => {
    const keyA = shiftKey(day1, 'Shift A');
    await waitFor(async () => (await T.db.query('SELECT 1 FROM saved_reports WHERE shift_key = $1', [keyA])).length === 2);
    const viewer = await signIn('MG-9001', 'View@2026');
    const list = await (await get('/api/reports/saved', viewer)).json();
    const a = list.saved.find((s: { shiftKey: string }) => s.shiftKey === keyA);
    expect(a).toMatchObject({ date: day1, shift: 'Shift A' });
    const f = await get(`/api/reports/saved/${a.pdf}`, viewer);
    expect(f.headers.get('content-disposition')).toBe(`attachment; filename="MG-GA-Andon_${day1}_Shift-A_All-lines.pdf"`);
    expect(Buffer.from(await f.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
    expect((await get('/api/reports/saved/999999', viewer)).status).toBe(404);
    // asking again (e.g. after a restart) adds nothing
    const { saveShiftReport } = await import('../src/reports/routes.ts');
    await saveShiftReport(T.db, srv.host, srv.persistence, keyA);
    expect((await T.db.query('SELECT 1 FROM saved_reports WHERE shift_key = $1', [keyA])).length).toBe(2);
  });
});
