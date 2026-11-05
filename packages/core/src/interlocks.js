/* ── movement permissives (simulated interlocks) ── */
import { AREAS, LOOPS, NEXT, POS, XFER_FROM, XFER_TO, isLoopFirst, targetFor } from './plant.js';
import { dispId } from './scans.js';
import { fmtClock, fmtDur } from './util.js';

// A line is stopped by a line stop / emergency (S.paused) or by a planned stop (break, off-shift).
export const areaPaused = (S, a) => S.paused[a] || !!S.planned;
export function permissives(S, posId) {
  const p = S.pos[posId], occ = p.occ, out = [];
  if (!occ || !p.carrierId) return null;
  const c = S.carriers[p.carrierId], v = occ.vehicleId && S.vehicles[occ.vehicleId], P = POS[posId];
  const xf = XFER_FROM[posId];
  const next = xf ? xf.to : NEXT[posId];
  let workOk = occ.completeT != null && occ.completeT <= S.t, d = '';
  if (P.exit && v && workOk) { workOk = false; d = 'Work done · driving off past the end-of-line photo-eye'; }
  else if (P.exit && !v && occ.unloadUntil && S.t < occ.unloadUntil) { workOk = false; d = `Vehicle driving off · ${fmtDur(occ.unloadUntil - S.t)}`; }
  else if (!v && isLoopFirst(posId)) { workOk = false; d = posId === 'TL1' ? 'Empty skid waiting for the next body (Scanner 1)' : `Empty ${c.kind.toLowerCase()} waiting for a body from ${XFER_TO[posId].from}`; }
  else if (occ.pendingBody) { workOk = false; d = 'Body being placed'; }
  else if (!workOk && v && posId === 'CL2' && v.engine && !v.engine.ok) d = 'Quality hold · engine/transmission mismatch';
  else if (!workOk && occ.completeT != null) d = `Empty ${c.kind.toLowerCase()} releasing in ${fmtDur(occ.completeT - S.t)}`;
  else if (!workOk) d = P.kind === 'work' ? `Team working · ${fmtDur(occ.workT)} of ${fmtDur(targetFor(posId, v))} takt` : `Handling · ${fmtDur(Math.max(0, occ.required - occ.workT))} left`;
  out.push({ key: 'work', ok: workOk, label: P.exit ? 'Completion detected (photo-eye)' : P.kind === 'buffer' ? 'Body settled in buffer' : 'Station work finished', detail: workOk ? (v ? `Detected ${fmtClock(occ.completeT, false)}` : 'Empty carrier (pass-through)') : d });
  if (posId === 'CL2' && v && S.cfg.engineCheck) out.push({ key: 'engine', ok: !!(v.engine && v.engine.ok), label: 'Engine & transmission paired to VIN', detail: !v.engine ? 'Scan pending at CL2' : v.engine.ok ? `${v.engine.engineNo} · ${v.engine.transNo}` : `Mismatch: ${v.engine.engineNo}` });
  out.push({ key: 'carrier', ok: !c.fault, label: `${c.kind} ${c.id} ready`, detail: c.fault ? `${c.fault.code} · ${c.fault.text}` : '' });
  const destP = next && S.pos[next];
  const sf = p.fault || (destP && destP.fault);
  out.push({ key: 'sensors', ok: !sf, label: 'Position sensors confirmed', detail: sf ? `${sf === p.fault ? dispId(posId) : dispId(next)}: ${sf.code} · ${sf.text}` : '' });
  const pa = areaPaused(S, P.area) ? P.area : next && areaPaused(S, POS[next].area) ? POS[next].area : null;
  out.push({ key: 'area', ok: !pa, label: 'No line stop', detail: pa ? (S.planned && !S.paused[pa] ? `Planned stop · ${S.planned.label}` : `${AREAS[pa].name} stopped${S.emergency[pa] && S.emergency[pa].length ? ` · emergency at ${S.emergency[pa].join(', ')}` : ''}`) : '' });
  if (xf) {
    const d2 = S.pos[xf.to], dc = d2.carrierId && S.carriers[d2.carrierId];
    let ok = !!(dc && !d2.occ.vehicleId && !d2.occ.pendingBody && !dc.fault), detail = '', blocker = null;
    if (!dc && d2.reservedBy) detail = `Empty ${LOOPS[POS[xf.to].loop].carrier.toLowerCase()} ${d2.reservedBy} arriving`;
    else if (!dc && LOOPS[POS[xf.to].loop].carrier === 'Hanger') {
      // All 4 hangers are elsewhere: the one furthest along the loop frees first, so it is the blocker.
      const held = LOOPS.CHASSIS.positions.filter((id) => S.pos[id].carrierId).reverse();
      const ret = Object.values(S.carriers).filter((x) => x.loop === 'CHASSIS' && ['RETURN', 'FEED', 'BUFFER'].includes(x.mode)).map((x) => x.id);
      detail = ret.length ? `Hanger ${ret.join(', ')} on the return rail` : `All ${LOOPS.CHASSIS.count} hangers in use · ${held.slice().reverse().map((id) => `${S.pos[id].carrierId} at ${id}`).join(', ')}`;
      if (!ret.length && held.length) blocker = held[0];
    } else if (!dc) detail = `No empty ${LOOPS[POS[xf.to].loop].carrier.toLowerCase()} at ${dispId(xf.to)}`;
    else if (d2.occ.vehicleId) { detail = `${dispId(xf.to)} still holds ${S.vehicles[d2.occ.vehicleId].vin.slice(-6)}`; blocker = NEXT[xf.to] && S.pos[xf.to].carrierId ? xf.to : null; ok = false; }
    else if (dc.fault) detail = `${dc.kind} ${dc.id} fault`;
    if (S.xfers.some((q) => q.from === posId)) { ok = true; detail = 'Transfer in progress'; }
    // a hanger already on its way back is normal flow, not a blockage
    const normal = !ok && !dc && (!!d2.reservedBy || /return rail/.test(detail));
    out.push({ key: 'dest', ok, label: `Empty ${LOOPS[POS[xf.to].loop].carrier.toLowerCase()} ready at ${dispId(xf.to)}`, detail, blocker, normal });
  } else if (next) {
    const dd = S.pos[next]; let ok = !dd.carrierId && !dd.reservedBy, detail = '', blocker = null;
    if (dd.carrierId) { blocker = next; detail = `${dispId(next)} occupied · ${describeOcc(S, next)}`; }
    else if (dd.reservedBy) detail = `${dispId(next)} reserved · ${dd.reservedBy} inbound`;
    out.push({ key: 'dest', ok, label: `Destination ${dispId(next)} free`, detail, blocker });
  } else out.push({ key: 'dest', ok: true, label: 'Carrier return clear', detail: '' });
  if (S.cfg.transferMode === 'indexed' && P.kind === 'work') {
    const ix = indexCheck(S, P.loop);
    out.push({ key: 'sync', ok: ix.ok, label: `${AREAS[P.loop].short} conveyor index ready`, detail: ix.ok ? 'All occupied positions complete' : ix.reason, blockers: ix.blockers });
  }
  return out;
}
export function describeOcc(S, posId) {
  const occ = S.pos[posId].occ; if (!occ) return 'empty';
  const v = occ.vehicleId && S.vehicles[occ.vehicleId];
  if (!v) return 'empty carrier';
  if (occ.completeT == null) return POS[posId].kind === 'work' ? `working ${fmtDur(occ.workT)} / ${fmtDur(targetFor(posId, v))}` : 'handling';
  return 'complete, waiting';
}
export const workPositionsOf = (loop) => LOOPS[loop].positions.filter((id) => POS[id].kind === 'work');
export function indexCheck(S, loop) {
  const ws = workPositionsOf(loop);
  if (ws.some((id) => S.pos[id].reservedBy)) return { ok: false, reason: 'Index in progress', blockers: [] };
  const inc = ws.filter((id) => { const p = S.pos[id]; return p.carrierId && !(p.occ.completeT != null && p.occ.completeT <= S.t); });
  if (inc.length) { const w = inc.slice().sort((a, b) => ratioOf(S, b) - ratioOf(S, a))[0]; return { ok: false, reason: `Waiting for ${inc.join(', ')} (${w}: ${describeOcc(S, w)})`, blockers: inc }; }
  const last = ws[ws.length - 1], o = S.pos[NEXT[last]];
  if (S.pos[last].carrierId && (o.carrierId || o.reservedBy)) return { ok: false, reason: `Outflow ${dispId(NEXT[last])} not free`, blockers: [NEXT[last]] };
  return { ok: true, reason: '', blockers: [] };
}
export function ratioOf(S, posId) { const occ = S.pos[posId].occ; if (!occ || POS[posId].kind !== 'work' || !occ.vehicleId) return 0; return occ.workT / targetFor(posId, S.vehicles[occ.vehicleId]); }
export const canMove = (S, id, ignore = []) => { const pm = permissives(S, id); return pm && pm.filter((c) => !ignore.includes(c.key)).every((c) => c.ok); };
