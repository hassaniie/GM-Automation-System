/* The plant emulator: the simulator, with nothing exposed but what the real devices would show.
   - an OPC UA server (the PLC): one Boolean variable per signal, ns=1;s=GA.<key>
   - a Modbus TCP server (the same PLC another way): one coil per signal
   - a network scanner on TL1: a TCP server that sends each VIN read, one per line
   The simulator starts with an empty line on the plant clock, like a real go-live. Within each simulated
   second, arrivals come first, then pulses (transfer done, work done, calls, photo-eye), then departures,
   so a carrier passing through a position still turns its sensor on and off. Pulses last 250 ms. */
import net from 'node:net';
import { createState } from '@mg/core';
import { runEmitting } from '@mg/sim';
import { plantSignals, type PlantSignal } from './map.ts';

export interface EmulatorOptions { seed?: number; speed?: number; tz?: string; opcuaPort?: number; modbusPort?: number; scannerPort?: number; host?: string; log?: (m: string) => void }

function plantNow(tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, sec: Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second) };
}

type Ev = { type: string; pos?: string; from?: string; callType?: string; raw?: string };

export class PlantEmulator {
  readonly signals: PlantSignal[] = plantSignals();
  readonly values = new Map<string, boolean>();
  readonly S: ReturnType<typeof createState>;
  private byPosMeans = new Map<string, PlantSignal>();
  private opcVars = new Map<string, { setValueFromSource(v: unknown): void }>();
  private opc: import('node-opcua').OPCUAServer | null = null;
  private modbus: { close(cb: () => void): void } | null = null;
  private scanner: net.Server | null = null;
  private scannerClients = new Set<net.Socket>();
  private timers = new Set<NodeJS.Timeout>();
  private loop: NodeJS.Timeout | null = null;
  private ua: typeof import('node-opcua') | null = null;
  private paused = false;
  readonly opts: Required<Omit<EmulatorOptions, 'log'>> & { log: (m: string) => void };

  constructor(o: EmulatorOptions = {}) {
    this.opts = { seed: 11, speed: 1, tz: 'Asia/Karachi', opcuaPort: 4840, modbusPort: 5020, scannerPort: 5101, host: '127.0.0.1', log: () => {}, ...o };
    for (const s of this.signals) { this.values.set(s.key, false); this.byPosMeans.set(`${s.means}|${s.pos}|${s.callType || ''}`, s); }
    const now = plantNow(this.opts.tz);
    this.S = createState(this.opts.seed, { delayRate: 0.04, baseDate: now.date });
    this.S.t = now.sec;
  }

  async start() {
    await this.startOpcUa();
    await this.startModbus();
    await this.startScanner();
    this.loop = setInterval(() => this.second(), 1000 / this.opts.speed);
    this.opts.log(`plant emulator: OPC UA opc.tcp://${this.opts.host}:${this.opts.opcuaPort}/UA/MGPlant · Modbus TCP ${this.opts.host}:${this.opts.modbusPort} · scanner ${this.opts.host}:${this.opts.scannerPort} · ${this.signals.length} signals`);
  }

  async stop() {
    if (this.loop) clearInterval(this.loop);
    for (const t of this.timers) clearTimeout(t);
    for (const c of this.scannerClients) c.destroy();
    await new Promise<void>((r) => (this.scanner ? this.scanner.close(() => r()) : r()));
    await new Promise<void>((r) => (this.modbus ? this.modbus.close(() => r()) : r()));
    await this.opc?.shutdown(0);
  }

  /** Stops sending (devices "go quiet") without dropping connections; for watchdog tests. */
  pause(on: boolean) { this.paused = on; }

  /** One simulated second, played out over the wall-clock second. */
  private second() {
    if (this.paused) return;
    const span = 1000 / this.opts.speed;
    runEmitting(this.S, this.S.t + 1, (_t: number, events: Ev[]) => {
      for (const e of events) {
        if (e.type === 'CARRIER_ARRIVED') this.set(this.sig('presence', e.pos!), true);
        else if (e.type === 'CARRIER_DEPARTED') this.later(span * 0.7, () => this.set(this.sig('presence', e.pos!), false));
        else if (e.type === 'ENTRY_SCAN') this.later(span * 0.2, () => this.scan(e.raw!));
        else {
          const s = e.type === 'BODY_TRANSFERRED' ? this.sig('transfer-done', e.from!) : e.type === 'LINE_OFF' ? this.sig('photo-eye', 'FL7') : e.type === 'CALL_RAISED' ? this.sig('call-button', e.pos!, e.callType) : e.type === 'WORK_COMPLETE' ? this.sig('work-done', e.pos!) : null;
          if (s) this.later(span * 0.2, () => this.pulse(s, Math.min(250, span * 0.25)));
        }
      }
    });
  }

  private sig(means: string, pos: string, callType?: string) { return this.byPosMeans.get(`${means}|${pos}|${callType || ''}`)!; }
  private later(ms: number, f: () => void) { const t = setTimeout(() => { this.timers.delete(t); f(); }, ms); this.timers.add(t); }
  pulse(s: PlantSignal, ms = 250) { this.set(s, true); this.later(ms, () => this.set(s, false)); }

  set(s: PlantSignal | undefined, v: boolean) {
    if (!s || this.values.get(s.key) === v) return;
    this.values.set(s.key, v);
    this.opcVars.get(s.key)?.setValueFromSource(new this.ua!.Variant({ dataType: this.ua!.DataType.Boolean, value: v }));
  }

  scan(text: string) { for (const c of this.scannerClients) c.write(`${text}\r\n`); }

  private async startOpcUa() {
    const ua = (this.ua = await import('node-opcua'));
    const server = new ua.OPCUAServer({
      port: this.opts.opcuaPort, resourcePath: '/UA/MGPlant', allowAnonymous: true,
      securityModes: [ua.MessageSecurityMode.None], securityPolicies: [ua.SecurityPolicy.None],
      buildInfo: { productName: 'MG GA plant emulator', buildNumber: '1', buildDate: new Date() },
    });
    await server.initialize();
    const space = server.engine.addressSpace!, ns = space.getOwnNamespace();
    const folder = ns.addFolder(space.rootFolder.objects, { browseName: 'GA' });
    for (const s of this.signals) {
      const v = ns.addVariable({ componentOf: folder, browseName: s.key, nodeId: `s=GA.${s.key}`, dataType: 'Boolean', minimumSamplingInterval: 0, value: { dataType: ua.DataType.Boolean, value: false } as never });
      this.opcVars.set(s.key, v as never);
    }
    await server.start();
    this.opc = server;
  }

  private async startModbus() {
    const { ServerTCP } = (await import('modbus-serial')).default as unknown as { ServerTCP: new (vector: unknown, opts: unknown) => { close(cb: () => void): void; on(e: string, f: (err: unknown) => void): void } };
    const byCoil = new Map(this.signals.map((s) => [s.coil, s.key]));
    const get = (addr: number) => !!this.values.get(byCoil.get(addr) || '');
    const vector = {
      getCoil: (addr: number) => get(addr), getDiscreteInput: (addr: number) => get(addr),
      getInputRegister: () => 0, getHoldingRegister: () => 0,
      setCoil: () => undefined, setRegister: () => undefined,
    };
    const srv = new ServerTCP(vector, { host: this.opts.host, port: this.opts.modbusPort, unitID: 1, debug: false });
    srv.on('socketError', () => {});
    this.modbus = srv;
  }

  private startScanner() {
    return new Promise<void>((resolve) => {
      this.scanner = net.createServer((c) => { this.scannerClients.add(c); c.on('close', () => this.scannerClients.delete(c)); c.on('error', () => {}); });
      this.scanner.listen(this.opts.scannerPort, this.opts.host, () => resolve());
    });
  }
}
