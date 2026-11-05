/* Edge server: runs the plant engine and serves the screens.
     GET  /api/health     liveness and clock
     GET  /api/snapshot   full state (JSON)
     POST /api/commands   one command → its result (for integrations)
     WS   /api/live       hello + snapshot, then patches; commands in, results out
   It also serves the web app (apps/web/dist-edge) so one process runs the plant PC. */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { ClientMessage, type ServerMessage } from '@mg/contracts';
import { EngineHost, type HostOptions } from './engine-host.ts';
import { CommandError, SYSTEM, runCommand } from './commands.ts';

export const VERSION = '0.3.0';
const MAX_BUFFERED = 8 * 1024 * 1024; // a client this far behind is dropped; it reconnects and resyncs

export interface ServerOptions extends HostOptions { webDir?: string | null; logger?: boolean; autostart?: boolean }

export async function buildServer(opts: ServerOptions = {}): Promise<{ app: FastifyInstance; host: EngineHost }> {
  const host = new EngineHost(opts);
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 256 * 1024 });
  await app.register(websocket, { options: { maxPayload: 64 * 1024 } });

  app.get('/api/health', async () => ({ ok: true, version: VERSION, clock: host.clock, t: host.S.t, rev: host.rev, clients: host.listenerCount }));
  app.get('/api/snapshot', async () => ({ rev: host.rev, clock: host.clock, state: JSON.parse(JSON.stringify(host.S, (_k, v) => (typeof v === 'function' ? undefined : v))) }));
  app.post('/api/commands', async (req, reply) => {
    try { return { ok: true, value: await runCommand(host, req.body, SYSTEM) }; } // phase 4 step 5: the signed-in actor
    catch (e) { const err = e as Error; reply.code(e instanceof CommandError ? e.status : 500); return { ok: false, error: err.message }; }
  });

  app.get('/api/live', { websocket: true }, (socket) => {
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
        const value = await runCommand(host, msg.command, SYSTEM);
        send({ type: 'result', id, ok: true, value });
      } catch (e) {
        send({ type: 'result', id, ok: false, error: (e as Error).message });
      }
    });
    socket.on('close', () => off());
  });

  const webDir = opts.webDir === undefined ? join(dirname(fileURLToPath(import.meta.url)), '../../web/dist-edge') : opts.webDir;
  if (webDir && existsSync(webDir)) {
    await app.register(fastifyStatic, { root: webDir, index: ['index.html'] });
  }

  app.addHook('onClose', async () => host.stop());
  if (opts.autostart !== false) host.start();
  return { app, host };
}
