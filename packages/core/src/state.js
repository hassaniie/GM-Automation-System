/* ── state ─────────────────────────────────────────────────────────────── */
import { DEFAULT_CFG, LOOPS, ROUTE, applyTakt } from './plant.js';
import { mulberry32, pad2 } from './util.js';

/**
 * A fresh plant state at 22:00 the day before the base date (two hours of warm-up before Shift A).
 * @param {number} [seed] @param {Record<string, any>} [cfg] @returns {import('@mg/contracts').EngineState}
 */
export function createState(seed = 7, cfg = {}) {
  const S = {
    seed, rng: mulberry32(seed), t: -2 * 3600, rev: 0, cfg: { ...DEFAULT_CFG, ...cfg },
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
