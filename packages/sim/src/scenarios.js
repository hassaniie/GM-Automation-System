/* Demo scenarios. Each setup puts the plant into a teaching situation and returns hints for the
   screens (what to select, which dialog to open, the speed). Runs in the browser (offline demo) or on
   the edge server (live screens); both get the same state for the same scenario. */
import * as core from '@mg/core';
import { feedBuffer } from './feed.js';
import { runUntil, runWhile, step } from './tick.js';

const M = { ...core, feedBuffer, runUntil, runWhile, step };
const { WORK_POS } = core;

/** The demo's starting point: Shift A at 09:38 with work in progress. `cfg` holds saved settings. */
export function freshState(seed, cfg = {}) {
  const S = M.createState(seed, { ...cfg, delayRate: 0.04, mismatchRate: 0.03 });
  S.recording = false; M.runUntil(S, S.cfg.shiftStart); S.recording = true;
  S.events = S.events.filter((e) => e.t >= S.cfg.shiftStart - 900);
  S.alarms = S.alarms.filter(M.alarmActive); S.alarmByKey = {}; S.alarms.forEach((a) => (S.alarmByKey[a.key] = a));
  M.logEvent(S, 'sim', 'SIMULATION · Shift A started with work in progress carried over');
  M.runUntil(S, 9 * 3600 + 38 * 60);
  S.cfg.delayRate = 0; S.cfg.mismatchRate = 0;
  for (let i = 0; i < 3; i++) M.feedBuffer(S);
  return S;
}
function calmDown(S) {
  for (const id of WORK_POS) { const o = S.pos[id].occ; if (o && o.vehicleId && o.completeT == null) o.required = Math.min(o.required, Math.round(M.targetFor(id, S.vehicles[o.vehicleId]) * 0.92)); }
  S.alarms.filter((a) => M.alarmActive(a) && a.type === 'QUALITY').forEach((a) => M.rescanEngine(S, a.pos));
}
const occOf = (S, id) => S.pos[id].occ;
const waitFresh = (S, ids, maxWork = 150) => M.runWhile(S, () => !ids.every((id) => { const o = occOf(S, id); return o && o.vehicleId && o.completeT == null && o.workT < maxWork; }), 4 * 3600);
/* Scenario 1 demo: after DEMO_AFTER seconds of real running time (paused time does not count),
   CL2 hits an engine-mount problem and reworks in station. It runs past target, escalates, and
   holds up the hangers behind it, so the bottleneck appears without anyone touching the controls. */
export const DEMO_AFTER = 150, DEMO_EXTRA = 8 * 60;
export function injectDemoDelay(S) {
  const o = occOf(S, 'CL2'), msg = 'engine mount bolt cross-threaded, rework in station';
  if (o && o.vehicleId && o.completeT == null) {
    o.required = M.targetFor('CL2', S.vehicles[o.vehicleId]) + DEMO_EXTRA;
    M.logEvent(S, 'sim', `SIMULATION · CL2: ${msg}`, { pos: 'CL2' });
  } else {
    S.pendingDelay = { pos: 'CL2', extra: DEMO_EXTRA };
    M.logEvent(S, 'sim', `SIMULATION · CL2: ${msg} on the next unit`, { pos: 'CL2' });
  }
}
export const SCENARIOS = [
  { n: 1, title: 'Normal production', desc: 'Every station runs inside its 10:00 takt. After about 2½ minutes of watching, a problem arises on its own at CL2: it passes takt, the buzzer sounds and the hold-up spreads.', setup(S) { calmDown(S); return { view: 'overview', speed: 15, demo: true }; } },
  { n: 2, title: 'Over takt · buzzer', desc: 'CL3 runs past its takt. The station turns red, its buzzer rings, and it stops by itself when the unit leaves.',
    setup(S) { calmDown(S); waitFresh(S, ['CL3'], 240); const o = occOf(S, 'CL3'); const v = S.vehicles[o.vehicleId], t = M.targetFor('CL3', v); o.arriveT = S.t - (t - 70) - o.plannedT; o.workT = t - 70; o.required = t + 4 * 60; M.logEvent(S, 'sim', 'SIMULATION · scenario 2: CL3 work content increased', { pos: 'CL3' }); return { select: { kind: 'pos', id: 'CL3' }, speed: 5, view: 'CHASSIS' }; } },
  { n: 3, title: 'Completed but blocked', desc: 'CL1 finishes its work, but CL2 still holds its hanger. Finished is not the same as free to move, and the downtime is put down to CL2.',
    setup(S) { calmDown(S); waitFresh(S, ['CL1', 'CL2'], 400); const a = occOf(S, 'CL1'), b = occOf(S, 'CL2'); a.workT = Math.max(a.workT, 7 * 60); a.required = a.workT + 6; b.workT = 4 * 60; b.required = Math.round(M.targetFor('CL2', S.vehicles[b.vehicleId]) * 1.2); return { select: { kind: 'pos', id: 'CL1' }, speed: 5 }; } },
  { n: 4, title: 'Waiting for a hanger', desc: 'FL1 is slow to finish, so all 4 hangers fill up. TL5 is done but has no empty hanger to load onto at TL6.',
    setup(S) { calmDown(S); waitFresh(S, ['FL1'], 120); const o = occOf(S, 'FL1'); o.required = o.workT + 30 * 60; M.logEvent(S, 'sim', 'SIMULATION · scenario 4: wheel fitment at FL1 slowed down', { pos: 'FL1' }); M.runWhile(S, () => { const o = occOf(S, 'TL5'), p = M.permissives(S, 'TL5'); return !(o && o.vehicleId && o.completeT != null && S.t - o.completeT > 30 && p && p.find((c) => c.key === 'dest' && /All 4 hangers/.test(c.detail))); }, 4 * 3600); return { select: { kind: 'pos', id: 'TL5' }, speed: 5, view: 'overview' }; } },
  { n: 5, title: 'Take a unit offline', desc: 'The unit at FL3 has a fitment issue. Scan its VIN at the station to take it offline; it leaves the counts and the target.',
    setup(S) { calmDown(S); waitFresh(S, ['FL3'], 300); const o = occOf(S, 'FL3'), v = S.vehicles[o.vehicleId]; M.logEvent(S, 'sim', 'SIMULATION · scenario 5: seat fitment issue at FL3', { pos: 'FL3' }); return { select: { kind: 'pos', id: 'FL3' }, speed: 1, dialog: { type: 'offline', vehicleId: v.id, reason: M.OFFLINE_REASONS[1] } }; } },
  { n: 6, title: 'Hanger fault', desc: 'Hanger at CL4 reports a lift-encoder fault. Travel is inhibited even though the team has finished.',
    setup(S) { calmDown(S); waitFresh(S, ['CL4'], 300); const o = occOf(S, 'CL4'); o.required = o.workT + 45; M.injectCarrierFault(S, S.pos['CL4'].carrierId); M.logEvent(S, 'sim', `SIMULATION · fault injected on hanger ${S.pos['CL4'].carrierId}`, { pos: 'CL4' }); return { select: { kind: 'pos', id: 'CL4' }, speed: 5 }; } },
  { n: 7, title: 'Supervisor and maintenance calls', desc: 'CL2 calls its supervisor and FL4 calls maintenance. Respond, then clear each call; response and clear times are recorded.',
    setup(S) { calmDown(S); S.cfg.callRate = 0; M.raiseCall(S, 'CL2', 'SUP', 'Station button'); M.runUntil(S, S.t + 40); M.raiseCall(S, 'FL4', 'MNT', 'Station button'); M.runUntil(S, S.t + 25); return { speed: 1, drawer: 'calls' }; } },
  { n: 8, title: 'Emergency stop (test)', desc: 'A simulated emergency at CL2 stops the Chassis line until it is cleared. Not an Andon button; it tests the line-stop path.',
    setup(S) { calmDown(S); waitFresh(S, ['CL2'], 300); M.callEmergency(S, 'CL2'); return { select: { kind: 'pos', id: 'CL2' }, speed: 5 }; } },
  { n: 9, title: 'Offline and return', desc: 'A unit was taken off at FL4. Send it back: it rejoins at FL4 when the station is free and counts only when it completes.',
    setup(S) { calmDown(S); waitFresh(S, ['FL4'], 200); const v = S.vehicles[occOf(S, 'FL4').vehicleId]; M.takeOffLine(S, v.id, { reason: M.OFFLINE_REASONS[2], notes: 'Wrong-spec grille fitted; correct part on its way', by: 'Line supervisor', scan: v.vin }); M.runUntil(S, S.t + 60); return { select: { kind: 'veh', id: v.id }, speed: 5 }; } },
  { n: 10, title: 'Invalid scan', desc: 'Scanner 1 reads a VIN that is already on the line. The scan is rejected and nothing changes.',
    setup(S) { calmDown(S); const id = ['TL2', 'TL3', 'CL1', 'FL3'].find((p) => occOf(S, p) && occOf(S, p).vehicleId); return { view: 'TRIM', speed: 1, dialog: { type: 'scan', scanner: 'ENTRY', vin: S.vehicles[occOf(S, id).vehicleId].vin } }; } },
];
/** Builds scenario n from a fresh state. Returns the state and the screen hints. */
export function buildScenario(n, cfg = {}, seed = 11) {
  const sc = SCENARIOS.find((s) => s.n === n) || SCENARIOS[0];
  const S = freshState(seed, cfg);
  const hints = sc.setup(S) || {}; S.holdExit = {};
  M.step(S, 1);
  M.logEvent(S, 'sim', `SIMULATION · scenario ${sc.n}: ${sc.title}`);
  return { S, hints: { ...hints, n: sc.n } };
}
