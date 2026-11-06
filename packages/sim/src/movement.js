import { LOOPS, NEXT, POS, XFER_FROM, canMove, indexCheck, startReturn, startTransit, workPositionsOf } from '@mg/core';

/* The simulator decides when carriers move; the bookkeeping is in core (movement.js). */
export { processReturns } from '@mg/core';

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
