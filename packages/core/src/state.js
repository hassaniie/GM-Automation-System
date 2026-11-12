/* ── state ─────────────────────────────────────────────────────────────── */
import { DEFAULT_CFG, LOOPS, ROUTE, applyTakt } from './plant.js';
import { pad2, stateRng } from './util.js';

/**
 * A fresh plant state at 22:00 the day before the base date (two hours of warm-up before Shift A).
 * @param {number} [seed] @param {Record<string, any>} [cfg] @returns {import('@mg/contracts').EngineState}
 */
export function createState(seed = 7, cfg = {}) {
  const S = {
    seed, rng: null, rngState: seed, t: -2 * 3600, rev: 0, cfg: { ...DEFAULT_CFG, ...cfg },
    pos: {}, carriers: {}, loopBuf: { TRIM: [], CHASSIS: [], FINAL: [] }, vehicles: {}, vehOrder: [],
    bodyBuffer: [null, null, null, null, null, null], offlineBay: [], emergency: { TRIM: [], CHASSIS: [], FINAL: [] }, paused: { TRIM: false, CHASSIS: false, FINAL: false },
    alarms: [], alarmByKey: {}, events: [], scans: [], anims: [], xfers: [],
    stats: { completed: [], offline: [], segments: [], block: {}, overdue: {}, assist: 0, emergency: 0, quality: 0 },
    vinSerial: 248101 + (seed % 97) * 10, engSerial: 51200 + (seed % 89) * 7, nextFeedT: -2 * 3600 + 30, nextId: 1,
    holdExit: {}, recording: true, forceMismatch: {},
    // Andon
    shift: null, planned: null, shiftCheckT: -Infinity, history: [],
    prod: [], calls: [], audit: [], down: {}, buzzing: {}, returnQueue: [], lastEntryT: -Infinity,
  };
  S.rng = stateRng(S);
  S.cfg.takt = { ...DEFAULT_CFG.takt, ...(cfg.takt || {}) };
  S.cfg.targets = { ...DEFAULT_CFG.targets, ...(cfg.targets || {}) };
  S.cfg.buzzer = { ...DEFAULT_CFG.buzzer, ...(cfg.buzzer || {}) };
  applyTakt(S);
  ROUTE.forEach((id) => (S.pos[id] = { id, carrierId: null, reservedBy: null, fault: null, occ: null }));
  Object.values(LOOPS).forEach((L) => {
    for (let i = 1; i <= L.count; i++) {
      const id = L.carrier === 'Hanger' ? `${L.prefix}${i}` : `${L.prefix}-${pad2(i)}`;
      S.carriers[id] = { id, loop: L.id, kind: L.carrier, posId: null, vehicleId: null, mode: 'BUFFER', transit: null, fault: null, cycles: 0 };
      S.loopBuf[L.id].push(id);
    }
  });
  return S;
}
export const uid = (S, p) => `${p}${S.nextId++}`;
export function logEvent(S, cat, text, extra = {}) {
  const ev = { id: uid(S, 'ev'), t: S.t, cat, text, ...extra };
  S.events.push(ev); if (S.events.length > 900) S.events.splice(0, S.events.length - 900);
  if (extra.vehicleId && S.vehicles[extra.vehicleId]) { const v = S.vehicles[extra.vehicleId]; v.history.push({ t: S.t, cat, text }); if (v.history.length > 90) v.history.shift(); }
  Integration.publish(ev);
  return ev;
}

/* ── integration boundary ─────────────────────────────────────────────────
   In SIMULATION nothing leaves the browser. A production adapter would
   ingest PLC / scanner / sensor telemetry into the engine and publish these
   events to MES. Motion authorization is never issued from here.        */
export const Integration = {
  mode: 'SIMULATION', subscribers: [], requests: [],
  publish(ev) { for (const fn of this.subscribers) { try { fn(ev); } catch (e) { /* never break the sim */ } } },
  request(S, kind, payload) { const r = { t: S.t, kind, payload, mode: this.mode, note: 'Recorded only — no PLC connection' }; this.requests.push(r); if (this.requests.length > 200) this.requests.shift(); return r; },
};

/**
 * Drops history older than `beforeT` from memory once it is stored elsewhere (the edge server's database):
 * units lined off before then, their production / cycle-time / offline records, cleared calls and old
 * shift downtime. Units still in the plant, open calls and anything newer are kept. Returns counts.
 * @param {import('@mg/contracts').EngineState} S @param {number} beforeT
 */
export function trimHistory(S, beforeT) {
  const gone = new Set();
  for (const id of S.vehOrder) { const v = S.vehicles[id]; if (v && v.state === 'LINED_OFF' && v.lineOffT != null && v.lineOffT < beforeT) gone.add(id); }
  for (const id of gone) delete S.vehicles[id];
  S.vehOrder = S.vehOrder.filter((id) => !gone.has(id));
  const keep = (r) => r.t >= beforeT;
  const before = { prod: S.prod.length, segments: S.stats.segments.length, completed: S.stats.completed.length, offline: S.stats.offline.length, calls: S.calls.length };
  S.prod = S.prod.filter(keep);
  S.stats.segments = S.stats.segments.filter(keep);
  S.stats.completed = S.stats.completed.filter(keep);
  S.stats.offline = S.stats.offline.filter((r) => keep(r) || (S.vehicles[r.vehicleId] && S.vehicles[r.vehicleId].state !== 'LINED_OFF'));
  S.calls = S.calls.filter((c) => c.clearedT == null || c.clearedT >= beforeT);
  for (const h of S.history) if (h.key && h.end != null && h.end < beforeT) delete S.down[h.key];
  const alarmsBefore = S.alarms.length;
  S.alarms = S.alarms.filter((a) => a.resolvedT == null || a.resolvedT >= beforeT);
  for (const [k, a] of Object.entries(S.alarmByKey || {})) if (a && a.resolvedT != null && a.resolvedT < beforeT) delete S.alarmByKey[k];
  return {
    alarms: alarmsBefore - S.alarms.length,
    vehicles: gone.size, prod: before.prod - S.prod.length, segments: before.segments - S.stats.segments.length,
    completed: before.completed - S.stats.completed.length, offline: before.offline - S.stats.offline.length, calls: before.calls - S.calls.length,
  };
}
