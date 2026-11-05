import { LOOPS, LOOP_GEOM, NEXT, POS, Path, SPEED_RETURN, XFER_FROM, areaPaused, canMove, closeSegment, dispId, edgeDuration, indexCheck, offlinePath, resolveAlarmsFor, returnSlotReady, startOcc, uid, workPositionsOf } from '@mg/core';

function startTransit(S, fromId, toId) {
  const p = S.pos[fromId], c = S.carriers[p.carrierId], occ = p.occ, v = occ.vehicleId && S.vehicles[occ.vehicleId];
  if (v) closeSegment(S, v, fromId, S.t);
  const key = `${fromId}>${toId}`;
  c.mode = 'TRANSIT'; c.posId = null; c.transit = { from: fromId, to: toId, t0: S.t, t1: S.t + edgeDuration(key), edge: key };
  p.carrierId = null; p.occ = null; S.pos[toId].reservedBy = c.id;
  resolveAlarmsFor(S, (a) => a.type === 'BLOCKED' && a.pos === fromId, `Moved to ${dispId(toId)}`);
}
function startReturn(S, fromId) {
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
export function doTransfers(S) {
  // loop ends: empty carriers return
  for (const L of Object.values(LOOPS)) {
    const lastId = L.positions[L.positions.length - 1], last = S.pos[lastId];
    if (!last.carrierId || last.occ.vehicleId || last.occ.pendingBody || S.carriers[last.carrierId].fault) continue;
    if (last.occ.unloadUntil && S.t < last.occ.unloadUntil) continue;
    if (last.occ.completeT == null || S.t < last.occ.completeT) continue;
    startReturn(S, lastId);
  }
  if (S.cfg.transferMode === 'indexed') {
    for (const k of ['FINAL', 'CHASSIS', 'TRIM']) {
      const L = LOOPS[k], ix = indexCheck(S, k); if (!ix.ok) continue;
      const ws = workPositionsOf(k), first = L.positions[0], afterWork = NEXT[ws[ws.length - 1]];
      const movers = [...ws].reverse().filter((id) => S.pos[id].carrierId);
      const feederReady = S.pos[first].carrierId && canMove(S, first, ['dest', 'sync']);
      const all = feederReady ? [...movers, first] : movers;
      if (!all.length || !all.every((id) => canMove(S, id, ['dest', 'sync']))) continue;
      if (S.pos[ws[ws.length - 1]].carrierId && (S.pos[afterWork].carrierId || S.pos[afterWork].reservedBy)) continue;
      for (const id of all) startTransit(S, id, NEXT[id]);
    }
    // positions outside work stretches (exit side) still move independently
    for (const L of Object.values(LOOPS)) for (let i = L.positions.length - 2; i >= 0; i--) {
      const id = L.positions[i]; if (POS[id].kind === 'work' || id === L.positions[0] || XFER_FROM[id]) continue;
      if (S.pos[id].carrierId && canMove(S, id)) startTransit(S, id, NEXT[id]);
    }
    return;
  }
  for (const L of Object.values(LOOPS)) for (let i = L.positions.length - 2; i >= 0; i--) {
    const id = L.positions[i]; if (XFER_FROM[id]) continue;
    if (S.pos[id].carrierId && canMove(S, id)) startTransit(S, id, NEXT[id]);
  }
}
