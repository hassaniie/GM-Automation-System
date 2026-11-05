/* ── occupancy & segments ── */
import { resolveAlarmsFor } from './alarms.js';
import { AREA_LAST, POS, isLoopFirst, targetFor } from './plant.js';
import { logEvent } from './state.js';
import { fmtDur } from './util.js';
import { requiredFor } from './vehicles.js';

export function startOcc(S, posId, carrierId, vehicleId) {
  const p = S.pos[posId]; p.carrierId = carrierId; p.reservedBy = null;
  const v = vehicleId ? S.vehicles[vehicleId] : null;
  p.occ = { carrierId, vehicleId: vehicleId || null, arriveT: S.t, workT: 0, waitT: 0, pausedT: 0, plannedT: 0, required: v ? requiredFor(S, v, posId) : 0, completeT: null, completeBy: null, unloadUntil: null, pendingBody: null };
  if (!v) { if (!isLoopFirst(posId)) { p.occ.completeT = S.t; p.occ.completeBy = 'PASS'; } return; }
  v.posId = posId;
  v.segments.push({ pos: posId, arriveT: S.t, completeT: null, departT: null, work: 0, wait: 0, paused: 0, planned: 0, cycle: null, target: targetFor(posId, v) || POS[posId].handling || 0, credited: !!v.credited[posId], end: null });
}
export function curSeg(v, posId) { for (let i = v.segments.length - 1; i >= 0; i--) if (v.segments[i].pos === posId && v.segments[i].end == null) return v.segments[i]; return null; }
/* Cycle time (URD req 9) = time the vehicle has spent at the station, less planned stops (breaks). */
export const occCycle = (S, occ) => (occ ? S.t - occ.arriveT - (occ.plannedT || 0) : 0);
export function closeSegment(S, v, posId, t, endReason = 'departed') {
  const seg = curSeg(v, posId); if (!seg) return;
  const occ = S.pos[posId].occ;
  seg.work = occ ? occ.workT : seg.work; seg.wait = occ ? occ.waitT : seg.wait; seg.paused = occ ? occ.pausedT : 0; seg.planned = occ ? occ.plannedT || 0 : 0;
  seg.departT = t; seg.end = endReason; seg.cycle = t - seg.arriveT - seg.planned;
  const area = POS[posId].area, sk = S.shift ? S.shift.key : '';
  if (S.recording && POS[posId].kind === 'work' && endReason === 'departed') {
    S.stats.segments.push({ pos: posId, area, vin: v.vin, t, shiftKey: sk, cycle: seg.cycle, work: seg.work, wait: seg.wait, target: seg.target, over: Math.max(0, seg.cycle - seg.target), overdue: Math.max(0, seg.work - seg.target), credited: seg.credited });
    if (S.stats.segments.length > 8000) S.stats.segments.shift();
  }
  // leaving the last station of a line = one unit completed for that line (URD req 14)
  if (S.recording && endReason === 'departed' && AREA_LAST[area] === posId) {
    S.prod.push({ area, vin: v.vin, vehicleId: v.id, t, shiftKey: sk, returned: v.returns.length > 0 });
    if (S.prod.length > 6000) S.prod.shift();
  }
}
export function completeWork(S, posId, by) {
  const p = S.pos[posId], occ = p.occ; if (!occ || occ.completeT != null) return;
  occ.completeT = S.t; occ.completeBy = by;
  const v = occ.vehicleId && S.vehicles[occ.vehicleId];
  if (v) {
    const seg = curSeg(v, posId); if (seg) { seg.completeT = S.t; seg.work = occ.workT; }
    if (POS[posId].kind === 'work') {
      v.done[posId] = true;
      const tgt = targetFor(posId, v), over = occ.workT - tgt;
      logEvent(S, over > 0 ? 'alarm' : 'work', `${posId} complete · ${v.vin.slice(-6)} · ${fmtDur(occ.workT)} vs ${fmtDur(tgt)}${over > 0 ? ` (+${fmtDur(over)})` : ''} · ${by === 'MANUAL' ? 'confirmed by team' : 'detected (simulated sensor)'}`, { vehicleId: v.id, pos: posId });
    }
    if (POS[posId].exit) { v.state = 'AWAITING_LINE_OFF'; logEvent(S, 'work', `${v.vin.slice(-6)} finished at ${posId} · driving off past the end-of-line photo-eye`, { vehicleId: v.id, pos: posId }); }
  }
  resolveAlarmsFor(S, (a) => a.type === 'DELAY' && a.pos === posId && a.vehicleId === occ.vehicleId, `Work confirmed complete after ${fmtDur(occ.workT)}`);
}
