/* ── live plant ──
   On the real line the conveyor moves by itself; the PLC and scanners only report what happened. These are
   the rules for that: a carrier leaving a position, a carrier arriving without the PLC knowing which one it
   is (tracking decides), and one second of plant time with no simulator. */
import { raiseOrUpdate, resolveAlarmsFor } from './alarms.js';
import { apply } from './events.js';
import { areaPaused } from './interlocks.js';
import { processReturns, startReturn, startTransit } from './movement.js';
import { completeWork } from './occupancy.js';
import { LOOPS, NEXT, POS, ROUTE, isLoopFirst } from './plant.js';
import { dispId, exitScan } from './scans.js';
import { logEvent } from './state.js';
import { accountTime, beginTick, endTick } from './tick.js';

/** Tracking could not follow what a device reported: logged and raised, so people correct the position. */
export function trackingMismatch(S, pos, msg) {
  logEvent(S, 'exception', `Tracking · ${dispId(pos)} · ${msg}`, { pos });
  raiseOrUpdate(S, `TRACK:${pos}`, { type: 'TRACKING', level: 'FAULT', pos, msg: `${msg} Check the line and use Correct position.` });
  return { ok: false, reason: msg };
}

/** A carrier left `pos` (presence went off). Work there is complete; the carrier moves on, or back to its loop. */
export function departCarrier(S, pos) {
  const p = S.pos[pos];
  if (!p) return { ok: false, reason: `Unknown position ${pos}` };
  if (!p.carrierId) return trackingMismatch(S, pos, 'A carrier left, but tracking shows the position empty.');
  const occ = p.occ;
  if (occ && occ.vehicleId && occ.completeT == null) completeWork(S, pos, 'PLC');
  else if (occ && occ.completeT == null) { occ.completeT = S.t; occ.completeBy = 'PASS'; }
  const L = LOOPS[POS[pos].loop], last = L.positions[L.positions.length - 1];
  if (pos === last) {
    if (occ && occ.vehicleId) return trackingMismatch(S, pos, `The carrier left the end of its loop still holding ${S.vehicles[occ.vehicleId].vin}.`);
    startReturn(S, pos);
  } else startTransit(S, pos, NEXT[pos]);
  resolveAlarmsFor(S, (a) => a.type === 'TRACKING' && a.pos === pos, 'Carrier left as tracked');
  return { ok: true };
}

/** The carrier that has just arrived at `pos`: the one travelling there, or for a loop's first position the
    next empty carrier back from the loop's return. Null when tracking has none. */
export function carrierArriving(S, pos) {
  const all = Object.values(S.carriers);
  const moving = all.filter((c) => (c.mode === 'TRANSIT' || c.mode === 'FEED') && c.transit && c.transit.to === pos).sort((a, b) => a.transit.t0 - b.transit.t0);
  if (moving.length) return moving[0];
  if (!isLoopFirst(pos)) return null;
  const loop = POS[pos].loop;
  if (S.loopBuf[loop].length) return S.carriers[S.loopBuf[loop].shift()];
  const back = all.filter((c) => c.loop === loop && c.mode === 'RETURN').sort((a, b) => a.transit.t0 - b.transit.t0);
  return back[0] || null;
}

/** A device arrival (presence on, carrier unknown): the tracked carrier, now seated. Null if none expected. */
export function arrivalOf(S, pos) {
  if (S.pos[pos].carrierId) return null; // already there (a repeated signal)
  const c = carrierArriving(S, pos);
  if (!c) { trackingMismatch(S, pos, 'A carrier arrived that tracking did not expect.'); return null; }
  const from = c.transit && c.transit.from ? c.transit.from : 'BUFFER';
  c.mode = 'POS'; c.posId = pos; c.transit = null;
  resolveAlarmsFor(S, (a) => a.type === 'TRACKING' && a.pos === pos, 'Carrier arrived as tracked');
  return { from, carrierId: c.id, vehicleId: c.vehicleId };
}

/** A device reported a body transfer from `from`: the body tracked there. Null (and an alarm) if none. */
export function transferOf(S, from) {
  S.xfers = S.xfers.filter((x) => x.from !== from);
  const occ = S.pos[from].occ;
  if (!occ || !occ.vehicleId) { trackingMismatch(S, from, 'A body transfer was reported, but tracking shows no body here.'); return null; }
  return occ.vehicleId;
}

/** The end-of-line photo-eye saw a unit leave: the unit tracked at FL7 is complete and lined off. */
export function lineOffAt(S, pos, source = 'PHOTO_EYE') {
  const occ = S.pos[pos].occ, v = occ && occ.vehicleId && S.vehicles[occ.vehicleId];
  if (!v) return trackingMismatch(S, pos, 'The photo-eye saw a unit leave, but tracking shows no vehicle at line-off.');
  if (occ.completeT == null) completeWork(S, pos, source);
  return exitScan(S, v.vin, source);
}

const EARLY = new Set(['CARRIER_ARRIVED', 'BODY_TRANSFERRED', 'UNIT_ENTERED', 'UNIT_RETURNED']);

/** One second of the live plant. `events` are the device events of this second, in the order they happened.
    Order matches the simulator's: arrivals and transfers, time accounting, work time, the rest, departures. */
export function liveStep(S, dt = 1, events = []) {
  beginTick(S, dt);
  // movements that only take time: units finishing the lift onto or back onto the line, carriers reaching the loop return
  for (let i = S.anims.length - 1; i >= 0; i--) {
    const a = S.anims[i]; if (S.t < a.t1) continue; S.anims.splice(i, 1);
    if (a.kind === 'entry') apply(S, { type: 'UNIT_ENTERED', vehicleId: a.vehicleId });
    else if (a.kind === 'return') apply(S, { type: 'UNIT_RETURNED', vehicleId: a.vehicleId });
  }
  for (const c of Object.values(S.carriers)) if (c.mode === 'RETURN' && S.t >= c.transit.t1) { c.mode = 'BUFFER'; c.transit = null; S.loopBuf[c.loop].push(c.id); }
  const run = (e) => applyDevice(S, e);
  events.filter((e) => EARLY.has(e.type)).forEach(run);
  accountTime(S, dt);
  for (const id of ROUTE) {
    const occ = S.pos[id].occ; if (!occ || !occ.vehicleId || occ.completeT != null || areaPaused(S, POS[id].area)) continue;
    occ.workT += dt;
  }
  events.filter((e) => !EARLY.has(e.type) && e.type !== 'CARRIER_DEPARTED').forEach(run);
  if (S.returnQueue.length) processReturns(S);
  events.filter((e) => e.type === 'CARRIER_DEPARTED').forEach(run);
  endTick(S, dt);
}

/** Applies a device event; a rule that refuses it is logged instead of stopping the line. */
function applyDevice(S, e) {
  try { return apply(S, e); }
  catch (err) { return trackingMismatch(S, e.pos || e.from || 'TL1', `${e.type} could not be applied: ${err.message}`); }
}
