/* ── the step ── */
import { LOOPS, LOOP_GEOM, POS, ROUTE, TRANSFERS, XFER_FROM, accountTime, apply, areaPaused, beginTick, bufferHead, callAllowedAt, canMove, endTick, engineScan, hash01, logEvent, releasePitch, resolveAlarmsFor } from '@mg/core';
import { feedBuffer } from './feed.js';
import { doTransfers, processReturns } from './movement.js';

/* ── one simulated second ──
   The rules (core) and the plant (simulator) are separate halves of each tick:
   beginTick:       clock, shift calendar, planned stops (rules)
   settleMovements: arrivals and transfers that finish now (plant; live: queued device events)
   accountTime:     cycle-time accounting per station (rules)
   advance:         simulated teams, responders, feeds and new movements (plant; live: nothing)
   endTick:   bottleneck analysis, alarms, downtime, buzzers (rules)                                   */
export function step(S, dt = 1) {
  beginTick(S, dt);
  settleMovements(S);
  accountTime(S, dt);
  advance(S, dt);
  endTick(S, dt);
}
/* Plant: movements that finish this second (arrivals, body transfers, units leaving or rejoining). */
function settleMovements(S) {
  // 1. carrier arrivals, returns, feeds
  for (const c of Object.values(S.carriers)) {
    if (c.mode === 'TRANSIT' && S.t >= c.transit.t1) {
      const { to, from } = c.transit; c.mode = 'POS'; c.posId = to; c.transit = null;
      apply(S, { type: 'CARRIER_ARRIVED', pos: to, from, carrierId: c.id, vehicleId: c.vehicleId });
    } else if (c.mode === 'RETURN' && S.t >= c.transit.t1) { c.mode = 'BUFFER'; c.transit = null; S.loopBuf[c.loop].push(c.id); }
    else if (c.mode === 'FEED' && S.t >= c.transit.t1) { const first = LOOPS[c.loop].positions[0]; c.mode = 'POS'; c.posId = first; c.transit = null; apply(S, { type: 'CARRIER_ARRIVED', pos: first, from: 'BUFFER', carrierId: c.id, vehicleId: null }); }
  }
  // 2. body transfers between loops
  for (let i = S.xfers.length - 1; i >= 0; i--) {
    const x = S.xfers[i]; if (S.t < x.t1) continue;
    S.xfers.splice(i, 1);
    apply(S, { type: 'BODY_TRANSFERRED', vehicleId: x.vehicleId, from: x.from, to: x.to });
  }
  // 3. animations (vehicles leaving or rejoining the line)
  for (let i = S.anims.length - 1; i >= 0; i--) {
    const a = S.anims[i]; if (S.t < a.t1) continue; S.anims.splice(i, 1);
    if (a.kind === 'entry') apply(S, { type: 'UNIT_ENTERED', vehicleId: a.vehicleId });
    else if (a.kind === 'return') apply(S, { type: 'UNIT_RETURNED', vehicleId: a.vehicleId });
  }
}
function advance(S, dt = 1) {
  const C = S.cfg;
  // 4. simulated teams: work progress, line-off photo-eye, station calls, completion
  for (const id of ROUTE) {
    const p = S.pos[id], occ = p.occ; if (!occ || !occ.vehicleId) continue;
    const v = S.vehicles[occ.vehicleId], P = POS[id];
    if (occ.completeT != null) {
      if (P.exit && C.autoExitScan && !S.holdExit[v.id] && S.t - occ.completeT >= 30 && !areaPaused(S, P.area)) apply(S, { type: 'LINE_OFF', vin: v.vin, source: 'PHOTO_EYE' });
      continue;
    }
    if (areaPaused(S, P.area)) continue;
    if (P.kind !== 'work' && (S.carriers[p.carrierId].fault || p.fault)) continue;
    occ.workT += dt;
    if (C.engineCheck) {
      if (id === 'CL2' && !v.engine && occ.workT >= Math.min(120, occ.required * 0.2)) apply(S, { type: 'ENGINE_SCAN', vehicleId: v.id });
      if (id === 'CL2' && v.engine && !v.engine.ok && C.autoComplete && S.t - v.engine.t >= (C.qualityFixSec || 300)) { logEvent(S, 'sim', 'SIMULATION · quality team swapped the engine/transmission and rescanned', { vehicleId: v.id, pos: id }); engineScan(S, v, true); }
    }
    // simulated station calls: a few units need a supervisor or maintenance
    if (S.recording && C.callRate > 0 && P.kind === 'work' && occ.workT === 200 && callAllowedAt(S, id)) {
      const u = hash01(v.vin + id + 'call');
      if (u < C.callRate) apply(S, { type: 'CALL_RAISED', pos: id, callType: u < C.callRate * 0.55 ? 'SUP' : 'MNT', by: 'Station button', sim: true });
    }
    const holdQ = C.engineCheck && id === 'CL2' && !(v.engine && v.engine.ok);
    if (occ.workT >= occ.required && !holdQ && (P.kind !== 'work' || C.autoComplete)) apply(S, { type: 'WORK_COMPLETE', pos: id, by: P.kind === 'work' ? 'TEAM_SIM' : 'AUTO' });
  }
  // 4b. simulated responders on the floor
  if (C.autoRespond) for (const c of S.calls) {
    if (c.clearedT != null || c.simRespondAt == null) continue;
    if (c.respondedT == null && S.t >= c.simRespondAt) apply(S, { type: 'CALL_RESPONDED', callId: c.id, by: c.type === 'SUP' ? 'Line supervisor (sim)' : 'Maintenance tech (sim)' });
    else if (c.respondedT != null && S.t >= c.simClearAt) apply(S, { type: 'CALL_CLEARED', callId: c.id, by: c.respondedBy || 'Responder (sim)' });
  }
  if (S.returnQueue.length) processReturns(S);
  // 5. feed empty carriers to each loop's first position
  for (const L of Object.values(LOOPS)) {
    const first = S.pos[L.positions[0]];
    if (first.carrierId || first.reservedBy || !S.loopBuf[L.id].length) continue;
    const cid = S.loopBuf[L.id].shift(), c = S.carriers[cid];
    c.mode = 'FEED';
    c.transit = L.hidden ? { from: 'BUFFER', to: L.positions[0], t0: S.t, t1: S.t + L.feedSec } : { from: 'BUFFER', to: L.positions[0], t0: S.t, t1: S.t + Math.round(LOOP_GEOM[L.id].feed.len / 0.35), path: LOOP_GEOM[L.id].feed };
    first.reservedBy = cid;
  }
  // 6. paint-shop feed and automatic entry scan
  if (C.autoFeed && S.t >= S.nextFeedT && feedBuffer(S)) S.nextFeedT = S.t + Math.round(C.feedMin + S.rng() * (C.feedMax - C.feedMin));
  const E = S.pos['TL1'];
  if (C.autoEntryScan && !areaPaused(S, 'TRIM') && S.t - S.lastEntryT >= releasePitch(S) && E.carrierId && E.occ && !E.occ.vehicleId && !E.occ.pendingBody && !S.carriers[E.carrierId].fault && bufferHead(S) >= 0) {
    const b = S.bodyBuffer[bufferHead(S)]; apply(S, { type: 'ENTRY_SCAN', raw: b.label, source: 'SIM_AUTO' });
  }
  // 7. transfers between loops, then movement within loops
  for (const x of TRANSFERS) {
    const U = S.pos[x.from];
    if (!U.carrierId || !U.occ.vehicleId || S.xfers.some((q) => q.from === x.from)) continue;
    if (!canMove(S, x.from, ['sync'])) continue;
    const L = S.pos[x.to]; L.occ.pendingBody = U.occ.vehicleId;
    resolveAlarmsFor(S, (a) => a.type === 'BLOCKED' && a.pos === x.from, `${XFER_FROM[x.from].label} started`);
    S.xfers.push({ vehicleId: U.occ.vehicleId, from: x.from, to: x.to, t0: S.t, t1: S.t + x.sec });
  }
  doTransfers(S);
}
export function runUntil(S, tEnd, max = 200000) { let n = 0; while (S.t < tEnd && n++ < max) step(S, 1); }
export function runWhile(S, pred, maxSec) { const t0 = S.t; while (pred() && S.t - t0 < maxSec) step(S, 1); }
