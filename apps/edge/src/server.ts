/* Edge server: runs the plant engine and serves the screens.
     GET  /api/health     liveness and clock
     GET  /api/snapshot   full state (JSON)
     POST /api/commands   one command → its result (for integrations)
     WS   /api/live       hello + snapshot, then patches; commands in, results out
     GET  /api/reports…   reports from the database, Excel and PDF (reports/routes.ts)
   It also serves the web app (apps/web/dist-edge) so one process runs the plant PC. */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import { ClientMessage, type ServerMessage } from '@mg/contracts';
import { EngineHost, type HostOptions } from './engine-host.ts';
import { CommandError, SYSTEM, runCommand, type Actor } from './commands.ts';
import { actorOf, registerAuth, seedUsers } from './auth/routes.ts';
import { registerOidc, type OidcSettings } from './auth/oidc.ts';
import { COOKIE, Sessions, type Session } from './auth/sessions.ts';
import { createDb, migrate, type Db } from './db/index.ts';
import { Persistence, type PersistOptions } from './persist.ts';
import { registerReports, saveShiftReport } from './reports/routes.ts';

export const VERSION = '0.3.0';
const MAX_BUFFERED = 8 * 1024 * 1024; // a client this far behind is dropped; it reconnects and resyncs

export interface ServerOptions extends HostOptions {
  webDir?: string | null; logger?: boolean; autostart?: boolean;
  /** PostgreSQL; without it the server keeps everything in memory (tests, quick demos). */
  databaseUrl?: string; persist?: PersistOptions; retentionDays?: number;
  /** Demo mode: seeds the demo accounts on first run and allows the role switch. */
  demo?: boolean; admin?: { empId?: string; password?: string };
  /** Single sign-on; off when not given. */
  sso?: OidcSettings | null;
}

export async function buildServer(opts: ServerOptions = {}): Promise<{ app: FastifyInstance; host: EngineHost; db: Db | null; persistence: Persistence | null }> {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 256 * 1024 });
  let db: Db | null = null, persistence: Persistence | null = null, restored = false;
  if (opts.databaseUrl) {
    db = createDb(opts.databaseUrl);
    const applied = await migrate(db);
    if (applied.length) app.log.info(`database migrations applied: ${applied.join(', ')}`);
    const state = await Persistence.latest(db);
    if (state) { opts = { ...opts, state }; restored = true; }
  }
  const host = new EngineHost(opts);
  if (db) {
    persistence = new Persistence(db, host, { log: app.log, ...opts.persist });
    if (restored) app.log.info(`restarted from checkpoint at plant time ${host.S.t}`);
  }
  await app.register(websocket, { options: { maxPayload: 64 * 1024 } });
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], connectSrc: ["'self'", 'ws:', 'wss:'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'], workerSrc: ["'self'", 'blob:'], objectSrc: ["'none'"], frameAncestors: ["'none'"], upgradeInsecureRequests: null,
    } },
    hsts: false, // the plant PC may serve plain HTTP on the LAN; set HSTS at the TLS proxy
  });

  // sign-in (needs the database). Without a database the server is open: tests and local experiments only.
  const sessions = db ? new Sessions(db) : null;
  const live = new Map<{ close(code: number, reason: string): void }, { session: Session | null; token?: string }>();
  if (db && sessions) {
    const seeded = await seedUsers(db, !!opts.demo, opts.admin);
    if (seeded) app.log.info(`created ${seeded} first user account(s)${opts.demo ? ' (demo accounts)' : ''}`);
    registerAuth(app, db, sessions, { demo: !!opts.demo, sso: opts.sso ? { enabled: true, label: opts.sso.label || 'Company account' } : undefined }, {
      onRevoke: (match) => { for (const [sock, c] of live) if (c.session && match(c.session)) sock.close(4401, 'Signed out'); },
    });
    if (opts.sso) await registerOidc(app, db, sessions, opts.sso);
    registerReports(app, db, host, persistence);
    const p = persistence!, d = db;
    p.onShiftEnd = (key) => saveShiftReport(d, host, p, key, app.log);
    // sessions can expire or be revoked while a screen is connected
    const sweep = setInterval(async () => {
      for (const [sock, c] of live) if (c.token && !(await sessions.resolve(c.token))) sock.close(4401, 'Session ended');
    }, 60_000);
    sweep.unref();
    app.addHook('onClose', async () => clearInterval(sweep));
  }
  const actorFor = (session: Session | null): Actor => (session ? actorOf(session) : SYSTEM);

  app.get('/api/health', async () => ({
    ok: true, version: VERSION, clock: host.clock, t: host.S.t, rev: host.rev, clients: host.listenerCount,
    db: db ? (persistence!.dbUp ? 'up' : 'down') : 'none', lastSaved: persistence?.lastFlushAt ?? null, lastCheckpoint: persistence?.lastCheckpointAt ?? null,
  }));
  /** Vehicle record by VIN (URD req 5): in memory first, then the stored history. */
  app.get<{ Params: { vin: string } }>('/api/vehicles/:vin', async (req, reply) => {
    const vin = req.params.vin.trim().toUpperCase();
    const live = host.S.vehOrder.map((id) => host.S.vehicles[id]).find((v) => v && v.vin === vin);
    if (live) return { source: 'live', vehicle: live };
    const row = db ? await db.one<{ record: unknown }>('SELECT record FROM vehicles WHERE vin = $1', [vin]) : null;
    if (!row) { reply.code(404); return { error: 'That VIN is not known to the system.' }; }
    return { source: 'history', vehicle: row.record };
  });
  app.get('/api/snapshot', async () => ({ rev: host.rev, clock: host.clock, state: JSON.parse(JSON.stringify(host.S, (_k, v) => (typeof v === 'function' ? undefined : v))) }));
  app.post('/api/commands', async (req, reply) => {
    try { return { ok: true, value: await runCommand(host, req.body, actorFor(req.session)) }; }
    catch (e) { const err = e as Error; reply.code(e instanceof CommandError ? e.status : 500); return { ok: false, error: err.message }; }
  });

  app.get('/api/live', {
    websocket: true,
    // a browser page on another site must not open a live connection with this site's cookie
    preValidation: async (req, reply) => {
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) return reply.code(403).send({ ok: false, error: 'Wrong origin' });
    },
  }, (socket, req) => {
    const session = req.session ?? null;
    live.set(socket, { session, token: req.cookies?.[COOKIE] });
    const send = (m: ServerMessage) => {
      if (socket.readyState !== socket.OPEN) return;
      if (socket.bufferedAmount > MAX_BUFFERED) { socket.close(1013, 'Too far behind; reconnect'); return; }
      socket.send(JSON.stringify(m));
    };
    send({ type: 'hello', server: 'mg-andon-edge', version: VERSION, clock: host.clock });
    const off = host.subscribe({
      snapshot: (rev, clock, state, hints) => send({ type: 'snapshot', rev, clock, state, hints }),
      patch: (rev, clock, ops) => send({ type: 'patch', rev, clock, ops }),
    });
    socket.on('message', async (raw: Buffer) => {
      let id = '';
      try {
        const msg = ClientMessage.parse(JSON.parse(raw.toString()));
        id = msg.id;
        const value = await runCommand(host, msg.command, actorFor(session));
        send({ type: 'result', id, ok: true, value });
      } catch (e) {
        send({ type: 'result', id, ok: false, error: (e as Error).message });
      }
    });
    socket.on('close', () => { off(); live.delete(socket); });
  });

  const webDir = opts.webDir === undefined ? join(dirname(fileURLToPath(import.meta.url)), '../../web/dist-edge') : opts.webDir;
  if (webDir && existsSync(webDir)) {
    await app.register(fastifyStatic, { root: webDir, index: ['index.html'] });
  }

  app.addHook('onClose', async () => {
    host.stop();
    if (persistence) await persistence.stop();
    if (db) await db.close();
  });
  if (opts.autostart !== false) {
    host.start();
    if (persistence) {
      persistence.start();
      const purge = () => persistence!.purge(opts.retentionDays ?? 730).catch((e) => app.log.error(`purge failed: ${(e as Error).message}`));
      const daily = setInterval(purge, 24 * 3600e3); daily.unref();
      app.addHook('onClose', async () => clearInterval(daily));
    }
  }
  return { app, host, db, persistence };
}
