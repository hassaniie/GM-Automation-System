/* Taking a unit offline (URD req 2–3, 6): allowed at the end of Trim (TL6) and
   at any Final station. The VIN is scanned there and the station recorded. It
   leaves station counts at once and never counts towards the target unless it
   returns and completes the line. */
import { resolveAlarmsFor } from './alarms.js';
import { buildState } from './analysis.js';
import { closeSegment, occCycle, startOcc } from './occupancy.js';
import { AREAS, OFFLINE_POS, OFFLINE_SLOTS, POS, buildFor, offlinePath, targetFor } from './plant.js';
import { dispId } from './scans.js';
import { logEvent, uid } from './state.js';
import { fmtDur } from './util.js';
import { isActive } from './vehicles.js';
import { validateVinFormat } from './vin.js';

export function canTakeOffLine(S, vehicleId, force = false) {
  const v = S.vehicles[vehicleId]; if (!v || !isActive(v)) return { ok: false, reason: 'Unit is not in the active line.' };
  const c = v.carrierId && S.carriers[v.carrierId];
  if (!c || c.mode !== 'POS' || S.xfers.some((q) => q.vehicleId === v.id)) return { ok: false, reason: 'Unit is moving. Take it off once it arrives at a station.' };
  if (!force && !OFFLINE_POS.includes(c.posId)) return { ok: false, posId: c.posId, reason: `Offline points are TL6 (end of Trim) and FL1–FL7. ${dispId(c.posId)} is on the ${AREAS[POS[c.posId].area].name}, where units are not taken off.` };
  return { ok: true, posId: c.posId };
}
/**
 * Takes a unit off the line at an offline point (URD req 2–3, 6). Needs a matching VIN scan unless forced.
 * @param {import('@mg/contracts').EngineState} S @param {string} vehicleId
 * @param {{ reason: string, notes?: string, responsible?: string, by: string, scan?: string, force?: boolean }} opts
 */
export function takeOffLine(S, vehicleId, { reason, notes, responsible, by, scan, force = false }) {
  const chk = canTakeOffLine(S, vehicleId, force); if (!chk.ok) return chk;
  const v = S.vehicles[vehicleId], posId = chk.posId, occ = S.pos[posId].occ, c = S.carriers[v.carrierId];
  if (!force) {
    const fmt = validateVinFormat(scan);
    const rec = { id: uid(S, 'scan'), t: S.t, scanner: 'OFFLINE', pos: posId, vin: fmt.vin, ok: fmt.ok && fmt.vin === v.vin, source: scan === v.vin ? 'SCAN' : 'MANUAL', vehicleId: v.id };
    rec.reason = !fmt.ok ? fmt.reason : fmt.vin !== v.vin ? `Scanned ${fmt.vin}, but tracking shows ${v.vin} at ${dispId(posId)}. Check the unit, or correct the position first.` : `Offline scan at ${dispId(posId)}`;
    S.scans.push(rec); if (S.scans.length > 300) S.scans.shift();
    if (!rec.ok) { logEvent(S, 'exception', `Offline scan rejected at ${dispId(posId)} · ${rec.reason}`, { pos: posId, vehicleId: v.id }); return { ok: false, reason: rec.reason }; }
  }
  const items = buildFor(v), bs = buildState(S, v);
  const installed = items.filter((b) => (b.key === 'doors' ? bs.doors : bs[b.key]) >= 1).length;
  const tgt = targetFor(posId, v), over = POS[posId].kind === 'work' && occ.completeT == null ? Math.max(0, occ.workT - tgt) : 0;
  closeSegment(S, v, posId, S.t, 'taken off line');
  const cycle = occCycle(S, occ);
  v.offline = { t: S.t, pos: posId, area: POS[posId].area, responsible: responsible || posId, reason, notes, by, workAtStation: occ.workT, cycle, over, inLine: S.t - v.entryT, built: `${installed} / ${items.length}`, carrierId: c.id, scanned: !force, shiftKey: S.shift ? S.shift.key : '' };
  v.offlines.push(v.offline);
  v.state = 'OFF_LINE'; v.carrierId = null; v.posId = null;
  c.vehicleId = null; occ.vehicleId = null; occ.completeT = S.t + 30; occ.completeBy = 'PASS';
  v.offlineSlot = S.offlineBay.length % OFFLINE_SLOTS.length; S.offlineBay.push(v.id);
  S.anims.push({ id: uid(S, 'an'), vehicleId: v.id, kind: 'offline', t0: S.t, t1: S.t + 45, path: offlinePath(posId, v.offlineSlot), y0: POS[posId].hang, y1: 0.36 });
  if (S.recording) S.stats.offline.push({ vin: v.vin, vehicleId: v.id, t: S.t, pos: dispId(posId), area: POS[posId].area, reason, notes, by, variant: v.variant.name, built: v.offline.built, over, cycle, shiftKey: v.offline.shiftKey, returnedT: null });
  resolveAlarmsFor(S, (a) => a.vehicleId === v.id && a.type !== 'FAULT' && a.type !== 'CALL', 'Unit taken off line');
  logEvent(S, 'offline', `Taken offline · ${v.vin} at ${dispId(posId)} · ${reason}${over ? ` · ${fmtDur(over)} over takt` : ''}. Removed from station counts; not counted towards the target. Empty ${c.kind.toLowerCase()} ${c.id} continues.`, { vehicleId: v.id, pos: posId });
  return { ok: true };
}

/* Returning an offlined unit (URD §6): it rejoins at the station it left from,
   once that station is free. Work at that station restarts; it counts towards
   the target only when it completes the line. */
export function canReturn(S, vehicleId) {
  const v = S.vehicles[vehicleId];
  if (!v || v.state !== 'OFF_LINE') return { ok: false, reason: v && (v.state === 'RETURN_QUEUED' || v.state === 'RETURNING') ? 'Already returning to the line.' : 'Only offlined units can return to the line.' };
  if (S.anims.some((a) => a.vehicleId === v.id)) return { ok: false, reason: 'The unit is still moving to the offline area.' };
  return { ok: true, pos: v.offline.pos };
}
export function returnToLine(S, vehicleId, by, note = '') {
  const chk = canReturn(S, vehicleId); if (!chk.ok) return chk;
  const v = S.vehicles[vehicleId];
  v.state = 'RETURN_QUEUED'; v.returnReq = { t: S.t, by, pos: chk.pos, note };
  S.returnQueue.push(v.id);
  logEvent(S, 'offline', `Return to line requested · ${v.vin} → ${dispId(chk.pos)} · by ${by}. It rejoins when the station is free.`, { vehicleId: v.id, pos: chk.pos });
  return { ok: true };
}
export function returnSlotReady(S, posId) {
  const p = S.pos[posId];
  if (p.carrierId) {
    const c = S.carriers[p.carrierId];
    return !c.fault && !p.occ.vehicleId && !p.occ.pendingBody && !S.xfers.some((q) => q.to === posId || q.from === posId) ? 'carrier' : null;
  }
  return !p.reservedBy && S.loopBuf[POS[posId].loop].length ? 'feed' : null;
}
export function finishReturn(S, v) {
  const posId = v.returnReq.pos, p = S.pos[posId];
  if (!p.occ || p.occ.pendingBody !== v.id) return;
  const c = S.carriers[p.carrierId]; p.occ.pendingBody = null;
  c.vehicleId = v.id; v.carrierId = c.id; v.state = 'IN_PROCESS';
  delete v.done[posId];
  startOcc(S, posId, c.id, v.id);
  const r = { t: S.t, pos: posId, by: v.returnReq.by, requestedT: v.returnReq.t, offlineT: v.offline.t };
  v.returns.push(r);
  const st = S.stats.offline.find((o) => o.vehicleId === v.id && o.returnedT == null); if (st) st.returnedT = S.t;
  logEvent(S, 'offline', `Returned to line · ${v.vin} rejoined at ${dispId(posId)} after ${fmtDur(S.t - v.offline.t)} offline. Work at ${dispId(posId)} restarts; it counts only when it completes.`, { vehicleId: v.id, pos: posId });
}
