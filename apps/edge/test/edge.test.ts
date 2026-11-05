/* Edge server: REST, live WebSocket, commands shared between screens. In-process on a random port. */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import WebSocket from 'ws';
import { patch, type Op } from '@mg/sync';
import type { ServerMessage } from '@mg/contracts';
import { buildServer } from '../src/server.ts';

type Built = Awaited<ReturnType<typeof buildServer>>;
let srv: Built, base = '', wsUrl = '';

beforeAll(async () => {
  srv = await buildServer({ seed: 11, speed: 15, tickMs: 50, webDir: null });
  await srv.app.listen({ port: 0, host: '127.0.0.1' });
  const addr = srv.app.server.address() as { port: number };
  base = `http://127.0.0.1:${addr.port}`; wsUrl = `ws://127.0.0.1:${addr.port}/api/live`;
});
afterAll(async () => { await srv.app.close(); });

/** A screen: keeps a copy of the state from snapshot + patches, sends commands. */
class Screen {
  ws: WebSocket; state: any = null; rev = 0; revs: number[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  private waiting = new Map<string, (m: Extract<ServerMessage, { type: 'result' }>) => void>();
  private n = 0;
  ready: Promise<void>;
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ready = new Promise((res) => {
      this.ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString()) as ServerMessage;
        if (m.type === 'snapshot') { this.state = m.state; this.rev = m.rev; res(); }
        else if (m.type === 'patch') { patch(this.state, m.ops as Op[]); this.rev = m.rev; this.revs.push(m.rev); }
        else if (m.type === 'result') this.waiting.get(m.id)?.(m);
      });
    });
  }
  send(command: unknown) {
    const id = `c${++this.n}`;
    return new Promise<Extract<ServerMessage, { type: 'result' }>>((res) => { this.waiting.set(id, res); this.ws.send(JSON.stringify({ type: 'command', id, command })); });
  }
  async until(pred: () => boolean, ms = 2000) {
    const t0 = Date.now();
    while (!pred()) { if (Date.now() - t0 > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 20)); }
  }
  close() { this.ws.close(); }
}

describe('edge server', () => {
  test('health and snapshot', async () => {
    const h = await (await fetch(`${base}/api/health`)).json();
    expect(h.ok).toBe(true);
    expect(h.clock.mode).toBe('simulation');
    const s = await (await fetch(`${base}/api/snapshot`)).json();
    expect(Object.keys(s.state.pos)).toContain('FL7');
    expect(s.state.rng).toBeUndefined();
  });

  test('a screen gets a snapshot, then patches in order, and its copy matches the server', async () => {
    const a = new Screen(wsUrl); await a.ready;
    await a.until(() => a.revs.length >= 5);
    expect(a.revs.every((r, i) => i === 0 || r > a.revs[i - 1])).toBe(true);
    srv.host.stop(); await new Promise((r) => setTimeout(r, 120)); // let in-flight patches land
    const server = JSON.parse(JSON.stringify(srv.host.S, (_k, v) => (typeof v === 'function' ? undefined : v)));
    expect(a.state.t).toBe(server.t);
    expect(a.state.pos).toEqual(server.pos);
    expect(a.state.calls).toEqual(server.calls);
    srv.host.start();
    a.close();
  });

  test('a call raised on one screen appears on another within a second', async () => {
    const a = new Screen(wsUrl), b = new Screen(wsUrl); await Promise.all([a.ready, b.ready]);
    const r = await a.send({ type: 'RAISE_CALL', pos: 'FL4', callType: 'MNT' });
    expect(r.ok).toBe(true);
    const id = (r.value as { id: string }).id;
    await b.until(() => b.state.calls.some((c: { id: string }) => c.id === id), 1000);
    expect((await b.send({ type: 'RESPOND_CALL', callId: id })).ok).toBe(true);
    await a.until(() => a.state.calls.find((c: { id: string; respondedBy: string | null }) => c.id === id)?.respondedBy != null, 1000);
    a.close(); b.close();
  });

  test('engine refusals come back as results, bad commands are rejected', async () => {
    const a = new Screen(wsUrl); await a.ready;
    const vid = Object.values(a.state.pos as Record<string, { occ: { vehicleId: string | null } | null }>).map((p) => p.occ?.vehicleId).find(Boolean)!;
    const wrong = await a.send({ type: 'TAKE_OFFLINE', vehicleId: vid, reason: 'Part fitment issue', scan: 'LSJA00000TP000000' });
    expect(wrong.ok).toBe(true);
    expect((wrong.value as { ok: boolean }).ok).toBe(false);
    const bad = await a.send({ type: 'SET_TAKT', area: 'PAINT', sec: 10 });
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/Invalid command/);
    const unknown = await a.send({ type: 'DROP_TABLES' });
    expect(unknown.ok).toBe(false);
    const rest = await fetch(`${base}/api/commands`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'SET_TAKT', area: 'CHASSIS', sec: 540, reason: 'test' }) });
    expect((await rest.json()).value).toBe(true);
    expect(srv.host.S.audit.some((x) => x.action === 'Takt time changed' && x.reason === 'test')).toBe(true);
    a.close();
  });

  test('simulator controls: speed, scenario reload sends a fresh snapshot; refused outside simulation', async () => {
    const a = new Screen(wsUrl); await a.ready;
    const before = a.rev;
    const r = await a.send({ type: 'SIM_SCENARIO', n: 7 });
    expect(r.ok).toBe(true);
    await a.until(() => a.rev > before && a.state.calls.filter((c: { clearedT: number | null }) => c.clearedT == null).length >= 2);
    expect((await a.send({ type: 'SIM_SPEED', speed: 5 })).ok).toBe(true);
    expect((await a.send({ type: 'SIM_CONFIG', key: 'autoRespond', value: false })).ok).toBe(true);
    expect(srv.host.S.cfg.autoRespond).toBe(false);
    expect((await a.send({ type: 'SIM_CONFIG', key: 'shiftStart', value: 0 })).ok).toBe(false); // not a console setting
    expect(srv.host.clock.speed).toBe(5);
    srv.host.clock.mode = 'live';
    const refused = await a.send({ type: 'SIM_SPEED', speed: 60 });
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/simulation mode/);
    srv.host.clock.mode = 'simulation';
    a.close();
  });

  test('power cut: state is restored and screens resync', async () => {
    const a = new Screen(wsUrl); await a.ready;
    const occupied = Object.values(srv.host.S.pos).filter((p) => p.occ && p.occ.vehicleId).length;
    const r = await a.send({ type: 'SIM_POWER_CUT' });
    expect((r.value as { restored: number }).restored).toBe(occupied);
    const t = srv.host.S.t;
    await a.until(() => a.state.t > t + 5);
    a.close();
  });
});
