/* Where the plant state comes from.
   local  — the engine runs in this browser (offline demo, quotation file, Vercel). Default.
   remote — the edge server runs the engine; this screen keeps a copy from a snapshot plus patches and
            sends commands. Chosen by ?edge=1 (same origin) or ?edge=<ws url>, or a build with VITE_EDGE=1.
            ?edge=0 forces local. */
import { applyTakt, Path } from '@mg/core';
import { patch, rehydrate } from '@mg/sync';
import { RT, bump } from './runtime.js';

const q = new URLSearchParams(location.search).get('edge');
export const REMOTE = q === '0' ? false : q ? true : import.meta.env.VITE_EDGE === '1';
const WS_URL = q && /^wss?:\/\//.test(q) ? q : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/live`;

/** Connection status, shown in the top bar and on the line displays. */
RT.conn = { mode: REMOTE ? 'remote' : 'local', state: REMOTE ? 'connecting' : 'local', since: Date.now(), lastAt: 0, rev: 0, server: null, retries: 0 };

let ws = null, nextId = 0, onFirst = null, hold = false, retryTimer = null;
const pending = new Map();
const listeners = new Set();
/** Called on connect/disconnect, so screens can react (e.g. the head-office link banner). */
export const onConnChange = (f) => (listeners.add(f), () => listeners.delete(f));
const setConn = (state) => { if (RT.conn.state === state) return; RT.conn.state = state; RT.conn.since = Date.now(); listeners.forEach((f) => f(state)); bump(); };

function applyClock(c) { if (!c) return; RT.speed = c.speed; RT.running = c.running; RT.conn.mode = c.mode === 'live' ? 'live' : 'remote'; }

function onMessage(m) {
  RT.conn.lastAt = performance.now();
  if (m.type === 'hello') { RT.conn.server = m.version; applyClock(m.clock); return; }
  if (m.type === 'snapshot') {
    RT.S = rehydrate(m.state, Path); applyTakt(RT.S); RT.conn.rev = m.rev; applyClock(m.clock); RT.acc = 0;
    setConn('live'); RT.conn.retries = 0;
    if (onFirst) { const f = onFirst; onFirst = null; f(m.hints || {}); }
    bump(); return;
  }
  if (m.type === 'patch') {
    if (!RT.S || hold) return;
    if (m.rev !== RT.conn.rev + 1) { resync(); return; } // missed a patch: start again from a snapshot
    patch(RT.S, m.ops); rehydrate(RT.S, Path);
    if (m.ops.some((op) => op[0][0] === 'cfg')) applyTakt(RT.S);
    RT.conn.rev = m.rev; applyClock(m.clock); RT.acc = 0; bump(); return;
  }
  if (m.type === 'result') { const p = pending.get(m.id); if (p) { pending.delete(m.id); m.ok ? p.resolve(m.value) : p.reject(new Error(m.error)); } }
}

function connect() {
  clearTimeout(retryTimer);
  ws = new WebSocket(WS_URL);
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  ws.onclose = () => {
    for (const p of pending.values()) p.reject(new Error('Connection to the line server lost'));
    pending.clear();
    if (RT.S) setConn('down');
    const wait = Math.min(10000, 500 * 2 ** RT.conn.retries++);
    retryTimer = setTimeout(connect, wait);
  };
}
/** Drop and reconnect, which brings a fresh snapshot. */
function resync() { try { ws && ws.close(); } catch (e) { /* closing */ } }

/** Starts the remote connection; resolves with the scenario hints once the first snapshot is in. */
export function startRemote() { return new Promise((res) => { onFirst = res; connect(); }); }

/** Sends one command; resolves with the engine's result. */
export function send(command) {
  if (!ws || ws.readyState !== 1) return Promise.reject(new Error('Not connected to the line server'));
  const id = `c${++nextId}`;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ type: 'command', id, command })); });
}

/** Link-loss demo on a remote screen: stop applying updates (the server keeps running), then resync. */
export function holdUpdates(on) { hold = on; if (!on) resync(); }

/** Seconds of simulated time to add when drawing between patches, so movement stays smooth. */
export function remoteAcc(now) {
  if (!RT.running || !RT.conn.lastAt) return 0;
  return Math.min(((now - RT.conn.lastAt) / 1000) * RT.speed, Math.max(1, RT.speed * 0.6));
}
