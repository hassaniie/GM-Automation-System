/* Manual position correction (URD req 7): when tracking gets out of step with
   the line, an authorised user moves a VIN to where it really is. If another
   unit is recorded there, the two are swapped. Every correction is audited. */
import { resolveAlarmsFor } from './alarms.js';
import { audit } from './audit.js';
import { curSeg } from './occupancy.js';
import { takeOffLine } from './offline.js';
import { LOOPS, POS, isLoopFirst, targetFor } from './plant.js';
import { locationLabel } from './scans.js';
import { findVehicleByVin, isActive, requiredFor } from './vehicles.js';

export function correctPosition(S, vin, toPos, by, reason) {
  const v = findVehicleByVin(S, (vin || '').trim().toUpperCase());
  if (!v) return { ok: false, reason: 'That VIN is not known to the system.' };
  if (!isActive(v)) return { ok: false, reason: `${v.vin} is not on the line (${locationLabel(S, v)}).` };
  if (!reason || !reason.trim()) return { ok: false, reason: 'Give a reason; corrections are audited.' };
  const cA = v.carrierId && S.carriers[v.carrierId];
  if (!cA || cA.mode !== 'POS' || S.xfers.some((q) => q.vehicleId === v.id)) return { ok: false, reason: `${v.vin} is moving. Correct it once it is at a station.` };
  const from = cA.posId, P = S.pos[toPos];
  if (!P) return { ok: false, reason: 'Unknown station.' };
  if (from === toPos) return { ok: false, reason: `${v.vin} is already recorded at ${toPos}.` };
  if (!P.carrierId || P.occ.pendingBody || S.xfers.some((q) => q.to === toPos || q.from === toPos)) return { ok: false, reason: `${toPos} has no ${LOOPS[POS[toPos].loop].carrier.toLowerCase()} standing at it right now, so nothing can be placed there.` };
  const cB = S.carriers[P.carrierId], other = P.occ.vehicleId ? S.vehicles[P.occ.vehicleId] : null;
  const reseat = (veh, posId, carrier) => {
    const seg = curSeg(veh, veh.posId); if (seg) { seg.end = 'corrected'; seg.departT = S.t; }
    const occ = S.pos[posId].occ;
    occ.vehicleId = veh.id; carrier.vehicleId = veh.id; veh.carrierId = carrier.id; veh.posId = posId;
    if (occ.completeBy === 'PASS') { occ.completeT = null; occ.completeBy = null; occ.required = requiredFor(S, veh, posId); }
    veh.segments.push({ pos: posId, arriveT: occ.arriveT, completeT: occ.completeT, departT: null, work: 0, wait: 0, paused: 0, planned: 0, cycle: null, target: targetFor(posId, veh), credited: false, end: null, corrected: true });
  };
  if (other) reseat(other, from, cA);
  else { const o = S.pos[from].occ; o.vehicleId = null; cA.vehicleId = null; const seg = curSeg(v, from); if (seg) { seg.end = 'corrected'; seg.departT = S.t; } if (!isLoopFirst(from)) { o.completeT = S.t; o.completeBy = 'PASS'; } }
  reseat(v, toPos, cB);
  resolveAlarmsFor(S, (a) => (a.vehicleId === v.id || (other && a.vehicleId === other.id)) && (a.type === 'DELAY' || a.type === 'BLOCKED'), 'Position corrected');
  audit(S, by, 'Position corrected', toPos, `${v.vin.slice(-6)} at ${from}${other ? `, ${other.vin.slice(-6)} at ${toPos}` : ''}`, `${v.vin.slice(-6)} at ${toPos}${other ? `, ${other.vin.slice(-6)} at ${from}` : ''}`, reason);
  return { ok: true, swapped: other ? other.vin : null, from };
}
/* A unit the system shows at a station that is not physically there: record it offline, audited. */
export function clearGhost(S, posId, by, reason) {
  const occ = S.pos[posId] && S.pos[posId].occ, v = occ && occ.vehicleId && S.vehicles[occ.vehicleId];
  if (!v) return { ok: false, reason: `No unit is recorded at ${posId}.` };
  if (!reason || !reason.trim()) return { ok: false, reason: 'Give a reason; corrections are audited.' };
  const r = takeOffLine(S, v.id, { reason: 'Not found at station (position correction)', notes: reason, by, force: true });
  if (r.ok) audit(S, by, 'Unit removed from station', posId, v.vin.slice(-6), 'offline (not present)', reason);
  return r;
}
