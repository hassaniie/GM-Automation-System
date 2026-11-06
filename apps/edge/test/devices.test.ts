/* Devices without hardware: the plant emulator serves the simulator as a real OPC UA PLC, a Modbus TCP PLC
   and a network VIN scanner; the edge server connects to them as it will on site.
   Proves: signals are translated and debounced; a bad map stops start-up with a clear message; in live mode
   the line is tracked from device signals alone; a silent or disconnected device raises an alarm and clears
   it when back; a bad VIN from the scanner is rejected; shadow mode logs without touching the plant. */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import type { PlantEvent, SignalMap } from '@mg/contracts';
import { PlantEmulator } from '../../emulator/src/emulator.ts';
import { exampleMap } from '../../emulator/src/map.ts';
import { buildServer } from '../src/server.ts';
import { DeviceConfigError, loadSignalMap } from '../src/devices/manager.ts';
import { Translator } from '../src/devices/translator.ts';

const dir = mkdtempSync(join(tmpdir(), 'mg-devices-'));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (f: () => boolean, ms = 60_000, what = 'condition') => { const end = Date.now() + ms; while (Date.now() < end) { if (f()) return; await wait(100); } throw new Error(`timed out waiting for ${what}`); };
/** A time zone where it is now about 10:00, inside Shift A, so the emulated line is running. */
function morningZone() { let x = 10 - new Date().getUTCHours(); if (x > 14) x -= 24; if (x < -12) x += 24; return x === 0 ? 'Etc/GMT' : `Etc/GMT${x > 0 ? '-' : '+'}${Math.abs(x)}`; }
const port = () => 20000 + Math.floor(Math.random() * 20000);
const writeMap = (name: string, m: SignalMap) => { const f = join(dir, name); writeFileSync(f, JSON.stringify(m)); return f; };

describe('signal translation', () => {
  test('edges become plant events; short blips are ignored; inverted inputs; first values are not edges', async () => {
    const map: SignalMap = { devices: [{ id: 'plc', kind: 'modbus', host: 'x', port: 502, unitId: 1, pollMs: 100 }], silentAfterSec: 600, signals: [
      { device: 'plc', address: 'coil:1', means: 'presence', pos: 'CL2', invert: false, debounceMs: 40 },
      { device: 'plc', address: 'coil:2', means: 'photo-eye', pos: 'FL7', invert: true, debounceMs: 0 },
      { device: 'plc', address: 'coil:3', means: 'call-button', pos: 'FL3', callType: 'MNT', invert: false, debounceMs: 0 },
    ] };
    const events: PlantEvent[] = [], initial: string[] = [];
    const t = new Translator(map, { event: (e) => events.push(e), initial: (s, v) => initial.push(`${s.address}=${v}`), changed: () => {} });
    t.input('plc', 'coil:1', false); t.input('plc', 'coil:2', true); t.input('plc', 'coil:3', false);
    expect(initial).toEqual(['coil:1=false', 'coil:2=false', 'coil:3=false']); // photo-eye inverted: wire true = beam not broken
    t.input('plc', 'coil:1', true); await wait(10); t.input('plc', 'coil:1', false); await wait(60); // 10 ms blip
    expect(events).toEqual([]);
    t.input('plc', 'coil:1', true); await wait(60);
    t.input('plc', 'coil:2', false); // beam broken
    t.input('plc', 'coil:3', true); t.input('plc', 'coil:3', false);
    t.input('plc', 'coil:1', false); await wait(60);
    t.scan('scanner', '  LSJA2YH49TP248214\r ');
    expect(events).toEqual([
      { type: 'CARRIER_ARRIVED', pos: 'CL2', carrierId: null },
      { type: 'LINE_OFF', vin: null, source: 'PHOTO_EYE' },
      { type: 'CALL_RAISED', pos: 'FL3', callType: 'MNT', by: 'Station button' },
      { type: 'CARRIER_DEPARTED', pos: 'CL2' },
      { type: 'ENTRY_SCAN', raw: 'LSJA2YH49TP248214', source: 'SCANNER' },
    ]);
    t.stop();
  });

  test('a device map with mistakes is refused with a clear message', () => {
    const bad = writeMap('bad.json', { devices: [{ id: 'plc', kind: 'opcua', endpoint: 'http://wrong' }], signals: [{ device: 'plc2', address: 'x', means: 'call-button', pos: 'FL3' }] } as never);
    expect(() => loadSignalMap(bad)).toThrow(DeviceConfigError);
    try { loadSignalMap(bad); } catch (e) { expect((e as Error).message).toMatch(/devices\.0\.endpoint/); expect((e as Error).message).toMatch(/callType/); }
    expect(() => loadSignalMap(join(dir, 'missing.json'))).toThrow(/Cannot read the device map/);
  });
});

describe('live, against the emulated plant', () => {
  const tz = morningZone(), ports = { opcuaPort: port(), modbusPort: port(), scannerPort: port() };
  let em: PlantEmulator, srv: Awaited<ReturnType<typeof buildServer>>;
  afterAll(async () => { await srv?.app.close(); await em?.stop(); });

  test('OPC UA PLC and network scanner: the line is tracked from device signals alone', async () => {
    em = new PlantEmulator({ seed: 11, speed: 8, tz, ...ports });
    await em.start();
    const map = exampleMap({ protocol: 'opcua', plcHost: '127.0.0.1', plcPort: ports.opcuaPort, scannerHost: '127.0.0.1', scannerPort: ports.scannerPort });
    map.silentAfterSec = 5;
    for (const s of map.signals) s.debounceMs = 0;
    (map.devices[0] as { samplingMs: number }).samplingMs = 10;
    srv = await buildServer({ plantMode: 'live', devicesFile: writeMap('live.json', map), tz, webDir: null, tickMs: 100 });
    const S = () => srv.host.S;
    expect(srv.host.clock.mode).toBe('live');
    await until(() => srv.devices!.status.get('plc')!.state === 'connected' && srv.devices!.status.get('scanner-tl1')!.state === 'connected', 30_000, 'devices to connect');
    // the emulated paint shop feeds a body; the scanner reads it; the PLC reports the skid and its moves
    await until(() => S().vehOrder.length > 0, 60_000, 'a unit registered by the scanner');
    const v = S().vehicles[S().vehOrder[0]];
    expect(v.vin).toBe(em.S.vehicles[em.S.vehOrder[0]].vin);
    await until(() => !!S().vehicles[S().vehOrder[0]].segments.find((g: { pos: string }) => g.pos === 'TL2'), 150_000, 'the unit to reach TL2');
    expect(S().alarms.filter((a) => a.type === 'TRACKING').map((a) => a.msg)).toEqual([]);
    // the engine's view of the line matches the plant's
    const occupied = (st: typeof em.S) => Object.entries(st.pos).filter(([, p]) => (p as { carrierId: string | null }).carrierId).map(([id]) => id).sort();
    await wait(300);
    expect(occupied(S())).toEqual(occupied(em.S));
    const view = srv.devices!.view();
    expect(view.tags.find((t) => t.address === 'ns=1;s=GA.TL2.Presence')!.value).toBe(true);
    expect(view.log.some((l) => l.event?.startsWith('Carrier arrived at TL2'))).toBe(true);
  }, 240_000);

  test('a bad VIN from the scanner is rejected and logged', async () => {
    const n = srv.host.S.scans.length;
    em.scan('NOT-A-VIN');
    await until(() => srv.host.S.scans.length > n, 10_000, 'the scan');
    const rec = srv.host.S.scans[srv.host.S.scans.length - 1];
    expect(rec.ok).toBe(false);
    expect(srv.host.S.events.some((e) => e.cat === 'exception' && /Scanner 1 rejected/.test(e.text))).toBe(true);
  });

  test('a silent device and a lost connection raise an alarm, cleared when it is back', async () => {
    em.pause(true);
    await until(() => srv.devices!.status.get('scanner-tl1')!.state === 'silent', 20_000, 'the scanner to go silent');
    expect(srv.host.S.alarms.some((a) => a.type === 'DEVICE' && a.pos === 'scanner-tl1' && a.resolvedT == null)).toBe(true);
    em.pause(false);
    em.scan('LSJA2YH49TP000000');
    await until(() => srv.devices!.status.get('scanner-tl1')!.state === 'connected', 10_000, 'the scanner to be heard again');
    expect(srv.host.S.alarms.some((a) => a.type === 'DEVICE' && a.pos === 'scanner-tl1' && a.resolvedT == null)).toBe(false);
    // the emulator goes away: the PLC and scanner connections drop, then come back with it
    await em.stop();
    await until(() => srv.devices!.status.get('plc')!.state === 'down', 30_000, 'the PLC to be reported down');
    expect(srv.host.S.alarms.some((a) => a.type === 'DEVICE' && a.pos === 'plc' && a.resolvedT == null)).toBe(true);
    em = new PlantEmulator({ seed: 11, speed: 8, tz, ...ports });
    await em.start();
    await until(() => srv.devices!.status.get('plc')!.state === 'connected', 60_000, 'the PLC to reconnect');
    expect(srv.host.S.alarms.some((a) => a.type === 'DEVICE' && a.pos === 'plc' && a.resolvedT == null)).toBe(false);
  }, 180_000);
});

describe('shadow, over Modbus TCP', () => {
  test('signals are read and logged, the plant on the screens stays the simulator', async () => {
    const tz = morningZone(), ports = { opcuaPort: port(), modbusPort: port(), scannerPort: port() };
    const em = new PlantEmulator({ seed: 11, speed: 8, tz, ...ports });
    await em.start();
    const map = exampleMap({ protocol: 'modbus', plcHost: '127.0.0.1', plcPort: ports.modbusPort, scannerHost: '127.0.0.1', scannerPort: ports.scannerPort });
    for (const s of map.signals) s.debounceMs = 0;
    (map.devices[0] as { pollMs: number }).pollMs = 20;
    const srv = await buildServer({ plantMode: 'shadow', devicesFile: writeMap('shadow.json', map), tz, webDir: null, tickMs: 100, speed: 1 });
    try {
      expect(srv.host.clock.mode).toBe('shadow');
      await until(() => srv.devices!.view().log.some((l) => l.event?.includes('(shadow: not applied)')), 60_000, 'a device event');
      expect(srv.devices!.status.get('plc')!.state).toBe('connected');
      expect(srv.host.S.plantMode).toBeUndefined(); // the screens still run the simulator
      // signals can be sent by hand for commissioning (not in live mode)
      srv.devices!.inject('plc', 'coil:0', true);
      expect(srv.devices!.view().log[0].note).toBe('by hand');
    } finally { await srv.app.close(); await em.stop(); }
  }, 120_000);
});
