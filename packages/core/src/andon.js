/* ── Andon state per station (URD req 12) and the buzzer (req 16–18) ── */
import { netElapsed } from './calendar.js';
import { areaPaused } from './interlocks.js';
import { occCycle } from './occupancy.js';
import { ANDON_AREAS, AREA_STATIONS, POS, ROUTE, targetFor } from './plant.js';

export function andonState(S, posId) {
  const p = S.pos[posId], occ = p.occ, P = POS[posId];
  if (P.kind !== 'work' || !occ || !occ.vehicleId) return { state: 'idle', cycle: 0, takt: P.target || 0, ratio: 0, count: occ && occ.pendingBody ? 1 : 0 };
  const v = S.vehicles[occ.vehicleId], takt = targetFor(posId, v), cycle = occCycle(S, occ), ratio = takt ? cycle / takt : 0;
  return { state: ratio >= 1 ? 'over' : ratio >= S.cfg.warnPct ? 'near' : 'normal', cycle, takt, ratio, count: 1, vehicleId: v.id, stopped: areaPaused(S, P.area) };
}
export const andonActive = (S, posId) => ANDON_AREAS.includes(POS[posId].area) || !!S.cfg.trimAndon;
export const buzzerEnabled = (S, posId) => POS[posId].kind === 'work' && S.cfg.buzzer[posId] !== false;
export function buzzerOn(S, posId) {
  if (!buzzerEnabled(S, posId) || S.planned) return false;
  return andonState(S, posId).state === 'over';
}
export function stationCount(S, posId) { const o = S.pos[posId].occ; return o ? (o.vehicleId ? 1 : 0) + (o.pendingBody ? 1 : 0) : 0; }
export function lineWip(S, area) {
  let n = 0;
  for (const id of ROUTE) if (POS[id].area === area) n += stationCount(S, id) - (S.xfers.some((q) => q.to === id && POS[q.from].area === area) ? 1 : 0);
  for (const c of Object.values(S.carriers)) if (c.mode === 'TRANSIT' && c.vehicleId && POS[c.transit.to].area === area) n++;
  return n;
}
export function linePace(S, area) {
  const sh = S.shift || { key: '', targets: {}, breaks: [] }, target = sh.targets[area] || 0;
  const done = S.prod.filter((r) => r.shiftKey === sh.key && r.area === area).length;
  const netTotal = sh.name ? netElapsed(sh, sh.end) : 0, frac = netTotal ? netElapsed(sh, S.t) / netTotal : 0;
  const plan = target * frac, D = S.down[sh.key] || { pos: {}, line: {} };
  return { target, done, remaining: Math.max(0, target - done), plan, delta: done - Math.floor(plan), frac, down: D.line[area] || 0, wip: lineWip(S, area), lastHour: S.prod.filter((r) => r.area === area && r.t > S.t - 3600).length };
}
export function lineAndon(S, area) {
  const st = AREA_STATIONS[area].map((id) => andonState(S, id).state);
  const calls = S.calls.filter((c) => c.area === area && c.clearedT == null);
  const stopped = S.paused[area] ? 'STOP' : S.planned ? 'PLANNED' : null;
  return { over: st.filter((x) => x === 'over').length, near: st.filter((x) => x === 'near').length, calls: calls.length, state: stopped || (st.includes('over') ? 'over' : st.includes('near') ? 'near' : 'normal') };
}
