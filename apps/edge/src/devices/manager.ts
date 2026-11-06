/* Runs the plant's devices for the edge server (URD §6 integration):
   - loads and checks the signal map (config/devices.json);
   - connects to every device and turns its signals into plant events (translator.ts);
   - live mode: the events drive the engine; shadow mode: they are only logged, the simulator keeps the
     screens (for commissioning without affecting anyone); simulation mode: no devices;
   - keeps each device's status, the latest value of every signal and the last 500 signals and events;
   - a device that drops or goes silent raises an alarm on the floor (live), cleared when it is back;
   - first connection (go-live): carriers the PLC reports where tracking has none are seated. */
import { readFileSync } from 'node:fs';
import { SignalMap, type DeviceStatus, type PlantEvent, type PlantMode, type SignalConfig, type SignalLogEntry, type TagValue } from '@mg/contracts';
import { deviceAlarm, seatCarrier, trackingMismatch } from '@mg/core';
import type { EngineHost } from '../engine-host.ts';
import { connectorFor, type Connector } from './connectors.ts';
import { Translator } from './translator.ts';

type Log = { info(m: string): void; warn(m: string): void; error(m: string): void };
const LOG_SIZE = 500;
/** How long after the PLC first connects carriers it reports are seated rather than flagged. */
const GO_LIVE_MS = 15_000;

export class DeviceConfigError extends Error {}

/** Reads and checks a signal map file; the message names what is wrong and where. */
export function loadSignalMap(path: string): SignalMap {
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { throw new DeviceConfigError(`Cannot read the device map ${path}: ${(e as Error).message}`); }
  const r = SignalMap.safeParse(raw);
  if (!r.success) throw new DeviceConfigError(`The device map ${path} is not valid:\n${r.error.issues.slice(0, 10).map((i) => `  - ${i.path.join('.') || '(file)'}: ${i.message}`).join('\n')}`);
  return r.data;
}

const describe = (e: PlantEvent) => {
  switch (e.type) {
    case 'CARRIER_ARRIVED': return `Carrier arrived at ${e.pos}`;
    case 'CARRIER_DEPARTED': return `Carrier left ${e.pos}`;
    case 'BODY_TRANSFERRED': return `Body transferred ${e.from} → ${e.to}`;
    case 'LINE_OFF': return 'Unit passed the FL7 photo-eye (line-off)';
    case 'CALL_RAISED': return `${e.callType === 'SUP' ? 'Supervisor' : 'Maintenance'} call at ${e.pos}`;
    case 'WORK_COMPLETE': return `Work done at ${e.pos}`;
    case 'ENTRY_SCAN': return `Scanned ${e.raw}`;
    default: return e.type;
  }
};

export class DeviceManager {
  readonly status = new Map<string, DeviceStatus>();
  readonly log: SignalLogEntry[] = [];
  private tags = new Map<string, TagValue>();
  private connectors: Connector[] = [];
  private translator: Translator;
  private watchdog: NodeJS.Timeout | null = null;
  private goLiveUntil: number | null = null;
  private alarmed = new Set<string>();

  constructor(readonly map: SignalMap, readonly host: EngineHost, readonly mode: PlantMode, private out: Log = { info() {}, warn() {}, error() {} }) {
    for (const s of map.signals) this.tags.set(`${s.device}|${s.address}`, { device: s.device, address: s.address, means: s.means, pos: s.pos, callType: s.callType, label: s.label, value: null, changedAt: null });
    this.translator = new Translator(map, {
      event: (e, meta) => this.event(e, meta.device, meta.address),
      initial: (s, v) => this.initial(s, v),
      changed: (s, v) => this.setTag(s, v),
    });
  }

  start() {
    for (const d of this.map.devices) {
      const target = d.kind === 'opcua' ? d.endpoint : `${d.host}:${d.port}`;
      this.status.set(d.id, { id: d.id, kind: d.kind, target, state: 'connecting', since: Date.now(), lastSignalAt: null, error: null, signals: this.map.signals.filter((s) => s.device === d.id).length });
      const addresses = this.map.signals.filter((s) => s.device === d.id).map((s) => s.address);
      const c = connectorFor(d, addresses, {
        status: (state, error) => this.setStatus(d.id, state, error),
        value: (address, value) => { this.seen(d.id); this.translator.input(d.id, address, value); },
        text: (text) => { this.seen(d.id); this.push({ at: Date.now(), device: d.id, value: text }); this.translator.scan(d.id, text); },
      });
      this.connectors.push(c);
      c.start();
    }
    this.watchdog = setInterval(() => this.checkSilence(), 5000);
    this.watchdog.unref();
    this.out.info(`devices: ${this.map.devices.length} device(s), ${this.map.signals.length} signal(s), mode ${this.mode}`);
  }

  async stop() {
    if (this.watchdog) clearInterval(this.watchdog);
    this.translator.stop();
    await Promise.all(this.connectors.map((c) => c.stop()));
  }

  /** Commissioning: a signal by hand, as if the device had sent it (not in live mode). */
  inject(device: string, address: string, value: boolean | string) {
    if (this.mode === 'live') throw new Error('Manual signals are not allowed while the plant runs live.');
    if (typeof value === 'string') { this.push({ at: Date.now(), device, value, note: 'by hand' }); this.translator.scan(device, value); return; }
    if (!this.translator.signalFor(device, address)) throw new Error(`No signal ${address} on ${device} in the device map.`);
    this.push({ at: Date.now(), device, address, value, note: 'by hand' });
    this.translator.input(device, address, value);
  }

  view() {
    return { mode: this.mode, devices: [...this.status.values()], tags: [...this.tags.values()], log: this.log.slice(-LOG_SIZE).reverse(), silentAfterSec: this.map.silentAfterSec };
  }

  /* ── internals ── */
  private event(e: PlantEvent, device: string, address?: string) {
    const live = this.mode === 'live';
    this.push({ at: Date.now(), device, address, event: describe(e) + (live ? '' : ' (shadow: not applied)') });
    if (live) this.host.enqueue(e); // tracking problems show up as alarms when the engine applies it
  }

  private initial(s: SignalConfig, v: boolean) {
    this.setTag(s, v);
    this.push({ at: Date.now(), device: s.device, address: s.address, value: v, note: 'first value after connecting' });
    if (this.mode !== 'live' || s.means !== 'presence') return;
    const S = this.host.S, tracked = !!S.pos[s.pos]?.carrierId;
    if (v === tracked) return;
    if (v && this.goLiveUntil && Date.now() < this.goLiveUntil && seatCarrier(S, s.pos)) { this.host.publish(); return; }
    trackingMismatch(S, s.pos, v ? 'The PLC reports a carrier here after reconnecting, but tracking has none.' : 'The PLC reports no carrier here after reconnecting, but tracking has one.');
    this.push({ at: Date.now(), device: s.device, address: s.address, note: `tracking differs at ${s.pos}`, problem: true });
    this.host.publish();
  }

  private setTag(s: SignalConfig, v: boolean) {
    const t = this.tags.get(`${s.device}|${s.address}`);
    if (t) { if (t.value !== null && t.value !== v) this.push({ at: Date.now(), device: s.device, address: s.address, value: v }); t.value = v; t.changedAt = Date.now(); }
  }

  private setStatus(id: string, state: 'connecting' | 'connected' | 'down', error?: string) {
    const st = this.status.get(id)!;
    if (st.state !== state) { st.state = state; st.since = Date.now(); }
    st.error = error ?? (state === 'connected' ? null : st.error);
    if (state === 'down') this.translator.reset(id);
    if (state === 'connected') {
      // the first connection of a fresh live line is the go-live: seat the carriers the PLC reports
      const fresh = !this.host.S.vehOrder.length && Object.values(this.host.S.pos).every((p) => !p.carrierId);
      if (this.mode === 'live' && fresh && this.goLiveUntil === null) this.goLiveUntil = Date.now() + GO_LIVE_MS;
      this.clearAlarm(id, 'Device connected again');
    } else if (state === 'down') this.raiseAlarm(id, `${id} is not connected${error ? ` (${error})` : ''}; the line is not being tracked from it.`);
    this.push({ at: Date.now(), device: id, note: `${state}${error ? ` · ${error}` : ''}`, problem: state === 'down' });
  }

  private seen(id: string) {
    const st = this.status.get(id)!;
    st.lastSignalAt = Date.now();
    if (st.state === 'silent') { st.state = 'connected'; st.since = Date.now(); this.clearAlarm(id, 'Signals received again'); }
  }

  private checkSilence() {
    const limit = this.map.silentAfterSec * 1000;
    for (const st of this.status.values()) {
      if (st.state !== 'connected') continue;
      const last = st.lastSignalAt ?? st.since;
      if (Date.now() - last > limit) { st.state = 'silent'; st.since = Date.now(); this.raiseAlarm(st.id, `No signal from ${st.id} for ${Math.round(limit / 60000)} min; check the device.`); }
    }
  }

  private raiseAlarm(id: string, msg: string) {
    if (this.mode !== 'live' || this.alarmed.has(id)) return;
    this.alarmed.add(id); deviceAlarm(this.host.S, id, true, msg); this.host.publish();
  }
  private clearAlarm(id: string, msg: string) {
    if (!this.alarmed.delete(id)) return;
    deviceAlarm(this.host.S, id, false, msg); this.host.publish();
  }

  private push(e: SignalLogEntry) {
    this.log.push(e);
    if (this.log.length > LOG_SIZE * 2) this.log.splice(0, this.log.length - LOG_SIZE);
  }
}
