// @ts-check
/* ── plant events (URD §6 integration boundary) ──
   Everything the shop floor reports goes through apply(): the simulator today, PLC / scanner / photo-eye
   adapters in deployment. Each event maps to one rule in the core. */
import { resolveAlarmsFor } from './alarms.js';
import { clearCall, raiseCall, respondCall } from './calls.js';
import { closeSegment, completeWork, startOcc } from './occupancy.js';
import { finishReturn } from './offline.js';
import { XFER_FROM } from './plant.js';
import { dispId, engineScan, entryScan, exitScan, finishEntry } from './scans.js';
import { logEvent } from './state.js';

/** @typedef {import('@mg/contracts').EngineState} EngineState */
/** @typedef {import('@mg/contracts').PlantEvent} PlantEvent */

/**
 * @param {EngineState} S @param {string} pos @param {string} from @param {string} carrierId @param {string | null} vehicleId
 */
function arrive(S, pos, from, carrierId, vehicleId) {
  startOcc(S, pos, carrierId, vehicleId);
  if (vehicleId) logEvent(S, 'move', `${S.vehicles[vehicleId].vin.slice(-6)} arrived ${dispId(pos)} from ${dispId(from)} on ${carrierId} · presence confirmed`, { vehicleId, pos });
}
/** @param {EngineState} S @param {string} vehicleId @param {string} from @param {string} to */
function transferBody(S, vehicleId, from, to) {
  const v = S.vehicles[vehicleId], U = S.pos[from], L = S.pos[to];
  if (!v || !U || !L || !U.carrierId || !L.carrierId || !U.occ || !L.occ) throw new Error(`BODY_TRANSFERRED ${vehicleId} ${from} → ${to}: no carrier seated at both positions`);
  const cu = S.carriers[U.carrierId], cl = S.carriers[L.carrierId], uo = U.occ, lo = L.occ;
  closeSegment(S, v, from, S.t);
  resolveAlarmsFor(S, (/** @type {{ type: string, pos: string, vehicleId: string }} */ al) => al.type === 'BLOCKED' && al.pos === from && al.vehicleId === v.id, 'Transferred');
  cu.vehicleId = null; uo.vehicleId = null; uo.completeT = S.t; uo.completeBy = 'PASS';
  lo.pendingBody = null; cl.vehicleId = v.id; v.carrierId = cl.id;
  startOcc(S, to, cl.id, v.id);
  logEvent(S, 'move', `${v.vin.slice(-6)} transferred ${cu.kind.toLowerCase()} ${cu.id} → ${cl.kind.toLowerCase()} ${cl.id} · ${XFER_FROM[from].label}`, { vehicleId: v.id, pos: to });
}
/**
 * Applies one plant event to the state and returns what the rule returns (e.g. the scan record).
 * @param {EngineState} S @param {PlantEvent} e
 */
export function apply(S, e) {
  // Opt-in journal of every plant event (the edge server stores these from phase 3).
  if (Array.isArray(S.journal)) S.journal.push({ t: S.t, ...e });
  switch (e.type) {
    case 'CARRIER_ARRIVED': return arrive(S, e.pos, e.from, e.carrierId, e.vehicleId);
    case 'BODY_TRANSFERRED': return transferBody(S, e.vehicleId, e.from, e.to);
    case 'ENTRY_SCAN': return entryScan(S, e.raw, e.source);
    case 'UNIT_ENTERED': return finishEntry(S, S.vehicles[e.vehicleId]);
    case 'UNIT_RETURNED': return finishReturn(S, S.vehicles[e.vehicleId]);
    case 'WORK_COMPLETE': return completeWork(S, e.pos, e.by);
    case 'ENGINE_SCAN': return engineScan(S, S.vehicles[e.vehicleId]);
    case 'LINE_OFF': return exitScan(S, e.vin, e.source);
    case 'CALL_RAISED': return raiseCall(S, e.pos, e.callType, e.by, e.sim);
    case 'CALL_RESPONDED': return respondCall(S, e.callId, e.by);
    case 'CALL_CLEARED': return clearCall(S, e.callId, e.by, e.note);
    default: {
      /** @type {never} */ const unknown = e;
      throw new Error(`Unknown plant event: ${JSON.stringify(unknown)}`);
    }
  }
}
