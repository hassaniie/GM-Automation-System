/* The key proof for live devices: a day of the simulated plant is reduced to what its devices would report
   (presence on/off, transfers done, work-done buttons, call buttons, VIN scans, the photo-eye; no carrier or
   vehicle ids), and those reports alone drive a second engine in live mode, with no simulator. The live
   engine must track the same vehicles to the same results. */
import { expect, test } from 'vitest';
import { clearCall, createState, liveStep, openCall, respondCall } from '@mg/core';
import { runEmitting, runUntil } from '@mg/sim';

/* eslint-disable @typescript-eslint/no-explicit-any */
function replay(seed: number, start: number, end: number) {
  const sim: any = createState(seed, { delayRate: 0.04 }), live: any = createState(seed, { delayRate: 0.04 });
  runUntil(sim, start); runUntil(live, start); // the same line at go-live
  live.plantMode = 'live';
  const byT = new Map<number, unknown[]>();
  let n = 0;
  runEmitting(sim, end, (t: number, events: unknown[]) => { byT.set(t, events); n += events.length; });
  // people answer calls on the screens (commands, not devices): at the times they did in the simulated run
  const answers = new Map<number, [string, string, 'respond' | 'clear', string][]>();
  const at = (t: number, x: [string, string, 'respond' | 'clear', string]) => answers.set(t, [...(answers.get(t) || []), x]);
  for (const c of sim.calls) if (c.raisedT > start) {
    if (c.respondedT != null) at(c.respondedT, [c.pos, c.type, 'respond', c.respondedBy]);
    if (c.clearedT != null) at(c.clearedT, [c.pos, c.type, 'clear', c.clearedBy]);
  }
  while (live.t < end) {
    liveStep(live, 1, (byT.get(live.t + 1) || []) as never[]);
    for (const [pos, type, what, by] of answers.get(live.t) || []) {
      const c = openCall(live, pos, type);
      if (c) { if (what === 'respond') respondCall(live, c.id, by); else clearCall(live, c.id, by); }
    }
  }
  return { sim, live, n };
}

for (const seed of [11, 42]) test(`seed ${seed}: device reports alone reproduce the day`, () => {
  const { sim, live, n } = replay(seed, 6 * 3600, 24 * 3600);
  expect(n).toBeGreaterThan(2000);
  // nothing the devices reported confused tracking
  expect(live.alarms.filter((a: any) => a.type === 'TRACKING').map((a: any) => a.msg)).toEqual([]);
  // exactly the same vehicles lined off, in the same order, at the same times
  expect(live.stats.completed.map((c: any) => [c.vin, c.t])).toEqual(sim.stats.completed.map((c: any) => [c.vin, c.t]));
  expect(sim.stats.completed.length).toBeGreaterThan(40);
  // the same completions per line and shift
  const count = (S: any) => { const m: Record<string, number> = {}; for (const p of S.prod) m[`${p.shiftKey}|${p.area}`] = (m[`${p.shiftKey}|${p.area}`] || 0) + 1; return m; };
  expect(count(live)).toEqual(count(sim));
  // the same calls from the station buttons
  const calls = (S: any) => S.calls.map((c: any) => [c.pos, c.type, c.raisedT, c.vin, c.respondedT, c.clearedT]);
  expect(calls(live)).toEqual(calls(sim));
  // cycle times per vehicle and station within 2 s
  const segs = (S: any) => new Map<string, number>(S.stats.segments.map((g: any) => [`${g.vin}|${g.pos}|${g.t}`, g.cycle]));
  const a = segs(sim), b = segs(live);
  expect(b.size).toBe(a.size);
  for (const [k, c] of a) expect(Math.abs(b.get(k)! - c), k).toBeLessThanOrEqual(2);
  // downtime per station and line within 1%
  for (const key of Object.keys(sim.down)) for (const kind of ['pos', 'line'] as const) for (const [id, sec] of Object.entries(sim.down[key][kind] as Record<string, number>)) {
    const got = (live.down[key]?.[kind]?.[id] as number) || 0;
    expect(Math.abs(got - sec), `${key} ${kind} ${id}`).toBeLessThanOrEqual(Math.max(2, sec * 0.01));
  }
});

test('reports tracking cannot follow raise an alarm and do not stop the line', () => {
  const S: any = createState(11, { delayRate: 0.04 });
  runUntil(S, 9 * 3600);
  S.plantMode = 'live';
  const empty = ['FL3', 'FL4', 'FL5', 'CL1', 'CL2', 'TL3'].find((p) => !S.pos[p].carrierId && !S.pos[p].reservedBy)!;
  liveStep(S, 1, [{ type: 'CARRIER_ARRIVED', pos: empty, carrierId: null }, { type: 'CARRIER_DEPARTED', pos: empty }, { type: 'LINE_OFF', vin: null, source: 'PHOTO_EYE' }] as never[]);
  const track = S.alarms.filter((a: any) => a.type === 'TRACKING');
  expect(track.length).toBeGreaterThanOrEqual(2);
  expect(track[0].msg).toMatch(/Correct position/);
  for (let i = 0; i < 60; i++) liveStep(S, 1, []); // still running
  expect(S.t).toBe(9 * 3600 + 61);
  // a scan in live mode registers the body even though the paint-shop buffer is not reported
  S.bodyBuffer = S.bodyBuffer.map(() => null);
  const tl1 = S.pos.TL1;
  if (tl1.carrierId && !tl1.occ.vehicleId && !tl1.occ.pendingBody) {
    liveStep(S, 1, [{ type: 'ENTRY_SCAN', raw: 'LSJA2YH49TP299999', source: 'SCANNER' }] as never[]);
    expect(S.scans[S.scans.length - 1].reason).not.toMatch(/paint-shop buffer/);
  }
});
