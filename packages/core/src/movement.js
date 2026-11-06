/* ── carrier movement bookkeeping ──
   What happens to the state when a carrier leaves a position, returns empty to its loop, or a unit goes back
   onto the line. Used by the simulator (which decides when to move) and by live devices (where the conveyor
   moves by itself and the PLC reports it). */
import { resolveAlarmsFor } from './alarms.js';
import { areaPaused } from './interlocks.js';
import { closeSegment, startOcc } from './occupancy.js';
import { returnSlotReady } from './offline.js';
import { LOOPS, LOOP_GEOM, POS, Path, SPEED_RETURN, edgeDuration, offlinePath } from './plant.js';
import { dispId } from './scans.js';
import { uid } from './state.js';

export function startTransit(S, fromId, toId) {
  const p = S.pos[fromId], c = S.carriers[p.carrierId], occ = p.occ, v = occ.vehicleId && S.vehicles[occ.vehicleId];
  if (v) closeSegment(S, v, fromId, S.t);
  const key = `${fromId}>${toId}`;
  c.mode = 'TRANSIT'; c.posId = null; c.transit = { from: fromId, to: toId, t0: S.t, t1: S.t + edgeDuration(key), edge: key };
  p.carrierId = null; p.occ = null; S.pos[toId].reservedBy = c.id;
  resolveAlarmsFor(S, (a) => a.type === 'BLOCKED' && a.pos === fromId, `Moved to ${dispId(toId)}`);
}
export function startReturn(S, fromId) {
  const p = S.pos[fromId], c = S.carriers[p.carrierId], L = LOOPS[c.loop];
  c.mode = 'RETURN'; c.posId = null; c.cycles++;
  if (L.hidden) c.transit = { from: fromId, to: 'BUFFER', t0: S.t, t1: S.t + L.returnSec };
  else { const slot = Math.min(4, S.loopBuf[c.loop].length + Object.values(S.carriers).filter((x) => x.loop === c.loop && x.mode === 'RETURN').length); const path = LOOP_GEOM[c.loop].ret(slot); c.transit = { from: fromId, to: 'BUFFER', t0: S.t, t1: S.t + Math.round(path.len / SPEED_RETURN), path, slot }; }
  p.carrierId = null; p.occ = null;
}
export function processReturns(S) {
  for (let i = S.returnQueue.length - 1; i >= 0; i--) {
    const v = S.vehicles[S.returnQueue[i]], posId = v.returnReq.pos;
    if (areaPaused(S, POS[posId].area)) continue;
    const how = returnSlotReady(S, posId); if (!how) continue;
    S.returnQueue.splice(i, 1);
    const p = S.pos[posId];
    if (how === 'feed') { const cid = S.loopBuf[POS[posId].loop].shift(), c = S.carriers[cid]; c.mode = 'POS'; c.posId = posId; c.transit = null; startOcc(S, posId, cid, null); }
    p.occ.pendingBody = v.id; p.occ.completeT = null; p.occ.completeBy = null;
    S.offlineBay = S.offlineBay.filter((x) => x !== v.id);
    v.state = 'RETURNING';
    const back = offlinePath(posId, v.offlineSlot || 0);
    S.anims.push({ id: uid(S, 'an'), vehicleId: v.id, kind: 'return', t0: S.t, t1: S.t + 45, path: new Path(back.pts.slice().reverse()), y0: 0.36, y1: POS[posId].hang });
  }
}
