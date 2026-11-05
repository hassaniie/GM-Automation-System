/* ── operator actions ── */
import { completeWork } from './occupancy.js';
import { engineScan } from './scans.js';

export function manualComplete(S, posId) {
  const occ = S.pos[posId].occ; if (!occ || !occ.vehicleId || occ.completeT != null) return false;
  const v = S.vehicles[occ.vehicleId];
  if (S.cfg.engineCheck && posId === 'CL2' && !(v.engine && v.engine.ok)) return false;
  completeWork(S, posId, 'MANUAL'); return true;
}
export function rescanEngine(S, posId) { const occ = S.pos[posId].occ, v = occ && S.vehicles[occ.vehicleId]; if (v) engineScan(S, v, true); }
