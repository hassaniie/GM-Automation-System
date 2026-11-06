/* Connections to the plant's devices. Each reports values (or scanner text) and its connection state, and
   reconnects by itself with back-off. Nothing here writes to a device: the Andon system only listens. */
import net from 'node:net';
import type { DeviceConfig } from '@mg/contracts';

export interface ConnectorEvents {
  status: (state: 'connecting' | 'connected' | 'down', error?: string) => void;
  value: (address: string, value: boolean) => void;
  text: (text: string) => void;
}
export interface Connector { start(): void; stop(): Promise<void> }

export function connectorFor(d: DeviceConfig, addresses: string[], on: ConnectorEvents): Connector {
  if (d.kind === 'opcua') return new OpcUaConnector(d, addresses, on);
  if (d.kind === 'modbus') return new ModbusConnector(d, addresses, on);
  return new ScannerConnector(d, on);
}

const backoff = (n: number) => Math.min(10_000, 500 * 2 ** Math.min(n, 5));

/* ── OPC UA: a subscription with a monitored item per signal (queue keeps short pulses) ── */
class OpcUaConnector implements Connector {
  private client: import('node-opcua').OPCUAClient | null = null;
  private session: import('node-opcua').ClientSession | null = null;
  private stopped = false;
  private retries = 0;
  private timer: NodeJS.Timeout | null = null;
  constructor(private d: Extract<DeviceConfig, { kind: 'opcua' }>, private nodes: string[], private on: ConnectorEvents) {}
  start() { void this.connect(); }
  private async connect() {
    if (this.stopped) return;
    const ua = await import('node-opcua');
    this.on.status('connecting');
    const client = ua.OPCUAClient.create({
      applicationName: 'MG GA Andon', endpointMustExist: false, keepSessionAlive: true,
      securityMode: ua.MessageSecurityMode[this.d.securityMode], securityPolicy: ua.SecurityPolicy[this.d.securityPolicy],
      connectionStrategy: { initialDelay: 500, maxDelay: 10_000, maxRetry: 1 },
    });
    this.client = client;
    try {
      await client.connect(this.d.endpoint);
      const password = process.env[`DEVICE_${this.d.id.toUpperCase().replace(/-/g, '_')}_PASSWORD`];
      this.session = await client.createSession(this.d.user ? { type: ua.UserTokenType.UserName, userName: this.d.user, password: password || '' } : undefined);
      const sub = ua.ClientSubscription.create(this.session, { requestedPublishingInterval: this.d.samplingMs, requestedLifetimeCount: 600, requestedMaxKeepAliveCount: 10, maxNotificationsPerPublish: 0, publishingEnabled: true, priority: 10 });
      for (const nodeId of this.nodes) {
        const item = ua.ClientMonitoredItem.create(sub, { nodeId, attributeId: ua.AttributeIds.Value }, { samplingInterval: this.d.samplingMs, discardOldest: false, queueSize: 100 }, ua.TimestampsToReturn.Both);
        item.on('changed', (dv) => { if (dv.statusCode.isGood()) this.on.value(nodeId, !!dv.value.value); });
        item.on('err', (m: string) => this.on.status('connected', `${nodeId}: ${m}`));
      }
      client.on('connection_lost', () => this.on.status('down', 'Connection lost; reconnecting'));
      client.on('connection_reestablished', () => this.on.status('connected'));
      client.on('close', () => { if (!this.stopped) this.retry('Connection closed'); });
      this.retries = 0;
      this.on.status('connected');
    } catch (e) {
      this.retry((e as Error).message);
    }
  }
  private retry(error: string) {
    this.on.status('down', error);
    const c = this.client; this.client = null; this.session = null;
    void c?.disconnect().catch(() => {});
    if (!this.stopped) this.timer = setTimeout(() => void this.connect(), backoff(this.retries++));
  }
  async stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.session?.close().catch(() => {});
    await this.client?.disconnect().catch(() => {});
  }
}

/* ── Modbus TCP: coils (coil:N) and discrete inputs (input:N), polled ── */
class ModbusConnector implements Connector {
  private stopped = false;
  private retries = 0;
  private timer: NodeJS.Timeout | null = null;
  private client: import('modbus-serial').default | null = null;
  private groups: { kind: 'coil' | 'input'; from: number; count: number; addrs: Map<number, string> }[] = [];
  constructor(private d: Extract<DeviceConfig, { kind: 'modbus' }>, addresses: string[], private on: ConnectorEvents) {
    for (const kind of ['coil', 'input'] as const) {
      const list = addresses.map((a) => ({ a, m: a.match(/^(coil|input):(\d+)$/) })).filter((x) => x.m && x.m[1] === kind).map((x) => ({ a: x.a, n: Number(x.m![2]) }));
      if (!list.length) continue;
      const from = Math.min(...list.map((x) => x.n)), to = Math.max(...list.map((x) => x.n));
      this.groups.push({ kind, from, count: to - from + 1, addrs: new Map(list.map((x) => [x.n, x.a])) });
    }
  }
  start() { void this.connect(); }
  private async connect() {
    if (this.stopped) return;
    this.on.status('connecting');
    try {
      const Modbus = (await import('modbus-serial')).default;
      const c = new Modbus();
      await c.connectTCP(this.d.host, { port: this.d.port });
      c.setID(this.d.unitId); c.setTimeout(2000);
      this.client = c; this.retries = 0;
      this.on.status('connected');
      void this.poll();
    } catch (e) { this.retry((e as Error).message); }
  }
  private async poll() {
    if (this.stopped || !this.client) return;
    try {
      for (const g of this.groups) {
        const r = g.kind === 'coil' ? await this.client.readCoils(g.from, g.count) : await this.client.readDiscreteInputs(g.from, g.count);
        for (const [n, addr] of g.addrs) this.on.value(addr, !!r.data[n - g.from]);
      }
      this.timer = setTimeout(() => void this.poll(), this.d.pollMs);
    } catch (e) { this.retry((e as Error).message); }
  }
  private retry(error: string) {
    this.on.status('down', error);
    const c = this.client; this.client = null;
    try { c?.close(() => {}); } catch { /* already closed */ }
    if (!this.stopped) this.timer = setTimeout(() => void this.connect(), backoff(this.retries++));
  }
  async stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    try { this.client?.close(() => {}); } catch { /* already closed */ }
  }
}

/* ── network scanner: the scanner is a TCP server; one code per line ── */
class ScannerConnector implements Connector {
  private sock: net.Socket | null = null;
  private stopped = false;
  private retries = 0;
  private timer: NodeJS.Timeout | null = null;
  constructor(private d: Extract<DeviceConfig, { kind: 'scanner-tcp' }>, private on: ConnectorEvents) {}
  start() { this.connect(); }
  private connect() {
    if (this.stopped) return;
    this.on.status('connecting');
    let buf = '';
    const s = net.connect({ host: this.d.host, port: this.d.port });
    this.sock = s;
    s.setKeepAlive(true, 10_000);
    s.on('connect', () => { this.retries = 0; this.on.status('connected'); });
    s.on('data', (chunk) => {
      buf += chunk.toString('latin1');
      if (buf.length > 4096) buf = buf.slice(-256); // garbage on the line: keep the tail
      let i;
      while ((i = buf.search(/[\r\n]/)) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim()) this.on.text(line); }
    });
    s.on('error', () => {});
    s.on('close', () => {
      if (this.stopped) return;
      this.on.status('down', 'Scanner connection closed; reconnecting');
      this.timer = setTimeout(() => this.connect(), backoff(this.retries++));
    });
  }
  async stop() { this.stopped = true; if (this.timer) clearTimeout(this.timer); this.sock?.destroy(); }
}
