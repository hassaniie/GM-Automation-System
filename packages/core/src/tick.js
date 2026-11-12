import { updateAlarms } from './alarms.js';
import { analyze } from './analysis.js';
import { buzzerOn } from './andon.js';
import { plannedStopAt, updateShift } from './calendar.js';
import { areaPaused } from './interlocks.js';
import { occCycle } from './occupancy.js';
import { POS, ROUTE, WORK_POS, targetFor } from './plant.js';
import { dispId } from './scans.js';
import { logEvent } from './state.js';

export function beginTick(S, dt = 1) {
  S.t += dt; S.rev++;
  updateShift(S);
  S.planned = plannedStopAt(S);
}
/* Rules: time at each station that does not count towards cycle time (planned stops, waiting to leave, paused). */
export function accountTime(S, dt = 1) {
  for (const id of ROUTE) {
    const p = S.pos[id], occ = p.occ; if (!occ || !occ.vehicleId) continue;
    if (S.planned) occ.plannedT += dt;
    if (occ.completeT != null) { if (S.t > occ.completeT && !S.xfers.some((q) => q.from === id)) occ.waitT += dt; continue; }
    if (areaPaused(S, POS[id].area)) { if (!S.planned) occ.pausedT += dt; }
  }
}
export function endTick(S, dt = 1) {
  // 8. analysis + alarms
  S._analysis = analyze(S);
  if (S.recording) for (const [root, list] of Object.entries(S._analysis.impacts)) S.stats.block[dispId(root)] = (S.stats.block[dispId(root)] || 0) + dt * list.length;
  updateAlarms(S);
  // 9. downtime (URD req 11): time a station's unit is over takt; planned stops excluded.
  //    Line downtime = time with at least one station over takt (not the sum).
  //    Cause = the root station from the bottleneck analysis.
  if (S.recording && !S.planned && S.shift) {
    const D = S.down[S.shift.key] || (S.down[S.shift.key] = { pos: {}, line: {}, cause: {} }), any = {};
    for (const id of WORK_POS) {
      const occ = S.pos[id].occ; if (!occ || !occ.vehicleId) continue;
      if (occCycle(S, occ) <= targetFor(id, S.vehicles[occ.vehicleId])) continue;
      D.pos[id] = (D.pos[id] || 0) + dt; any[POS[id].area] = true;
      const an = S._analysis.byPos[id], root = (an && an.root) || id;
      D.cause[root] = (D.cause[root] || 0) + dt;
    }
    for (const a of Object.keys(any)) D.line[a] = (D.line[a] || 0) + dt;
  }
  // 10. buzzers: start when a unit passes takt, stop when it leaves (or the station is switched off)
  for (const id of WORK_POS) {
    const on = buzzerOn(S, id);
    if (on && !S.buzzing[id]) { S.buzzing[id] = S.t; if (S.recording) logEvent(S, 'andon', `Buzzer on at ${id} · unit over takt`, { brief: `Buzzer at ${id}`, pos: id, vehicleId: S.pos[id].occ && S.pos[id].occ.vehicleId }); }
    else if (!on && S.buzzing[id] != null) delete S.buzzing[id];
  }
}
