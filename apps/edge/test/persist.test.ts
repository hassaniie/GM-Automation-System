/* Persistence against a real PostgreSQL: the database matches memory, restarts resume exactly, and a
   database outage is caught up afterwards. The plant is driven by hand (no timers) for determinism. */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { MGE } from '@mg/engine';
import { toWire } from '@mg/sync';
import { EngineHost } from '../src/engine-host.ts';
import { Persistence } from '../src/persist.ts';
import { runCommand, type Actor } from '../src/commands.ts';
import type { Db } from '../src/db/index.ts';
import { dbAvailable, freshDatabase } from './helpers/db.ts';

let T: Awaited<ReturnType<typeof freshDatabase>>;
const NO_DB = !(await dbAvailable());
beforeEach((c) => { if (NO_DB) c.skip(); });
beforeAll(async () => {
  if (NO_DB) return; T = await freshDatabase(); });
afterAll(async () => { await T?.drop(); });

const planner: Actor = { kind: 'user', id: 'u2', name: 'Ayesha Malik', role: 'authorised' };
const count = async (db: Db, table: string) => (await db.one<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`))!.n;
/** Advances the plant like the host's timer would, flushing every `every` plant seconds. */
async function drive(host: EngineHost, p: Persistence | null, until: number, every = 600) {
  while (host.S.t < until) {
    MGE.runUntil(host.S, Math.min(until, host.S.t + every));
    host.onAdvance?.(host.S);
    host.publish();
    if (p) await p.flush();
  }
}
const comparable = (S: object) => { const w = toWire(S) as Record<string, unknown>; delete w.journal; return w; };

describe('persistence', () => {
  test('two shifts: database rows match memory, and flushing again adds no duplicates', async () => {
    const host = new EngineHost({ seed: 11 });
    const p = new Persistence(T.db, host);
    await drive(host, p, 12 * 3600);
    const vid = host.S.pos.FL4.occ?.vehicleId;
    if (vid) await runCommand(host, { type: 'TAKE_OFFLINE', vehicleId: vid, reason: 'Part fitment issue', scan: host.S.vehicles[vid].vin }, planner);
    await runCommand(host, { type: 'SET_TAKT', area: 'CHASSIS', sec: 540, reason: 'rebalance' }, planner);
    await runCommand(host, { type: 'RAISE_CALL', pos: 'CL2', callType: 'SUP' }, planner);
    await drive(host, p, 22.9 * 3600);
    const S = host.S;
    expect(await count(T.db, 'production')).toBe(S.prod.length);
    expect(await count(T.db, 'segments')).toBe(S.stats.segments.length);
    expect(await count(T.db, 'calls')).toBe(S.calls.length);
    expect(await count(T.db, 'audit')).toBe(S.audit.length);
    expect(await count(T.db, 'offline_records')).toBe(S.stats.offline.length);
    expect(await count(T.db, 'vehicles')).toBe(S.vehOrder.length);
    const audit = await T.db.one<{ by: string; action: string }>("SELECT by, action FROM audit WHERE action = 'Takt time changed'");
    expect(audit!.by).toBe('Ayesha Malik · Authorised'); // the server's actor, not anything the screen sent
    const cmds = await T.db.query<{ type: string; actor: string; ok: boolean }>("SELECT type, actor, ok FROM events WHERE kind = 'command' ORDER BY id");
    expect(cmds.map((c) => c.type)).toEqual(['TAKE_OFFLINE', 'SET_TAKT', 'RAISE_CALL'].filter((t) => t !== 'TAKE_OFFLINE' || vid));
    expect(await count(T.db, "events WHERE kind = 'plant'")).toBeGreaterThan(1000);
    const shiftA = await T.db.one<{ summary: { lines: Record<string, { done: number }> } }>("SELECT summary FROM shifts WHERE key LIKE '%Shift A'");
    expect(shiftA!.summary.lines.FINAL.done).toBeGreaterThan(20);
    const lined = await T.db.one<{ record: { segments: unknown[] } }>("SELECT record FROM vehicles WHERE state = 'LINED_OFF' LIMIT 1");
    expect(lined!.record.segments.length).toBeGreaterThan(10);
    // a repeated flush of the same tail is harmless
    const before = await count(T.db, 'segments');
    (p as unknown as { savedT: number }).savedT -= 7200;
    await p.flush();
    expect(await count(T.db, 'segments')).toBe(before);
  }, 240_000);

  test('a restart from the latest checkpoint continues exactly where it stopped', async () => {
    const a = new EngineHost({ seed: 3 });
    const p = new Persistence(T.db, a);
    await drive(a, p, 11 * 3600);
    await p.checkpoint();
    const b = new EngineHost({ state: (await Persistence.latest(T.db))! });
    expect(comparable(b.S)).toEqual(comparable(a.S));
    // both carry on identically, which needs the random generator to resume too
    MGE.runUntil(a.S, a.S.t + 3 * 3600); MGE.runUntil(b.S, b.S.t + 3 * 3600);
    expect(comparable(b.S)).toEqual(comparable(a.S));
    expect(b.S.rngState).toBe(a.S.rngState);
  }, 240_000);

  test('when the database is down the plant keeps running, and the history is caught up later', async () => {
    const db2 = await freshDatabase();
    let down = false;
    const flaky: Db = { ...db2.db, tx: (fn) => (down ? Promise.reject(new Error('connect ECONNREFUSED')) : db2.db.tx(fn)) };
    const host = new EngineHost({ seed: 42 });
    const p = new Persistence(flaky, host);
    await drive(host, p, 10 * 3600);
    down = true;
    await drive(host, p, 12 * 3600);
    expect(p.dbUp).toBe(false);
    down = false;
    await p.flush();
    expect(p.dbUp).toBe(true);
    expect(await count(db2.db, 'production')).toBe(host.S.prod.length);
    expect(await count(db2.db, 'segments')).toBe(host.S.stats.segments.length);
    await db2.drop();
  }, 240_000);

  test('power cut: the state goes through the database and comes back the same', async () => {
    const host = new EngineHost({ seed: 11 });
    const p = new Persistence(T.db, host);
    await drive(host, p, 10.5 * 3600);
    const pick = (S: object) => { const w = comparable(S) as Record<string, unknown>; return { t: w.t, rngState: w.rngState, pos: w.pos, carriers: w.carriers, vehicles: w.vehicles, calls: w.calls, audit: w.audit, cfg: w.cfg, down: w.down, prod: w.prod }; };
    const before = pick(host.S);
    const r = await host.powerCut() as { restored: number };
    expect(r.restored).toBeGreaterThan(5);
    expect(pick(host.S)).toEqual(before);
  }, 240_000);
  test('a unit returned hours after it was taken off has its return stored', async () => {
    const db2 = await freshDatabase();
    const host = new EngineHost({ seed: 11 });
    const p = new Persistence(db2.db, host);
    await drive(host, p, 9 * 3600);
    const vid = ['FL4', 'FL5', 'FL3', 'FL6', 'FL2'].map((x) => host.S.pos[x].occ?.vehicleId).find(Boolean)!;
    const vin = host.S.vehicles[vid].vin;
    expect((await runCommand(host, { type: 'TAKE_OFFLINE', vehicleId: vid, reason: 'Part fitment issue', scan: vin }, planner)).ok).toBe(true);
    await drive(host, p, 12.5 * 3600); // well past the writer's one-hour overlap
    expect((await runCommand(host, { type: 'RETURN_TO_LINE', vehicleId: vid }, planner)).ok).toBe(true);
    await drive(host, p, 13 * 3600);
    const row = await db2.db.one<{ shift_key: string; returned_t: number | null }>('SELECT shift_key, returned_t FROM offline_records WHERE vin = $1', [vin]);
    expect(row!.shift_key).toMatch(/Shift A$/);
    expect(row!.returned_t).toBeGreaterThan(12.5 * 3600 - 1);
    await db2.drop();
  }, 240_000);
});
