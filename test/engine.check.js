#!/usr/bin/env node
/* Headless checks for the simulation engine (src/02-engine.js) against the
   Andon URD rules it models. Run: node test/engine.check.js            */
'use strict';
const loadEngine = require('./load-engine');
let failed = 0, passed = 0;
const ok = (cond, msg) => { if (cond) passed++; else { failed++; console.error('  ✗ ' + msg); } };
const section = (name) => console.log('• ' + name);

function warm(M, seed = 11) {
  const S = M.createState(seed, { delayRate: 0.04, mismatchRate: 0.03 });
  S.recording = false; M.runUntil(S, 6 * 3600); S.recording = true; S.cfg.delayRate = 0;
  return S;
}

/* 1. A full production day: two shifts, automatic reset, counts, downtime */
{
  section('full day: shifts, counts, downtime, breaks');
  const M = loadEngine(), S = warm(M);
  M.runUntil(S, 23.25 * 3600);
  const shifts = S.history.filter((h) => h.name);
  ok(shifts.length === 2, `two shifts archived (got ${shifts.length})`);
  for (const h of shifts) {
    for (const a of M.AREA_IDS) {
      const L = h.lines[a];
      ok(L.done >= 24 && L.done <= 36, `${h.name} ${a} completed ${L.done} is plausible`);
      ok(L.down >= 0 && L.down <= h.end - h.start, `${h.name} ${a} downtime within the shift`);
    }
  }
  ok(S.shift.name === null && S.planned && S.planned.kind === 'OFF', 'line is on a planned stop after the last shift');
  // nothing is completed during a break
  const A = M.shiftAt(S, 6 * 3600 + 10);
  const inBreak = S.prod.filter((r) => A.breaks.some((b) => r.t > b.start && r.t < b.end));
  ok(inBreak.length === 0, `no completions during breaks (got ${inBreak.length})`);
  // counts are per shift: Shift B starts at zero
  const B = shifts[1];
  ok(S.prod.filter((r) => r.shiftKey === B.key && r.t < B.start).length === 0, 'Shift B counts only its own units');
  // cycle time recorded for every departed segment
  ok(S.stats.segments.length > 0 && S.stats.segments.every((s) => s.cycle >= s.work - 1), 'cycle time (dwell) recorded and ≥ work time (1 s step)');
  ok(Object.values(S.down).every((D) => Object.values(D.pos).every((x) => x >= 0)), 'station downtime ≥ 0');
}

/* 2. Determinism */
{
  section('determinism');
  const Ma = loadEngine(), Mb = loadEngine();
  const A = warm(Ma), B = warm(Mb); Ma.runUntil(A, 10 * 3600); Mb.runUntil(B, 10 * 3600);
  ok(A.prod.length === B.prod.length && A.calls.length === B.calls.length, 'same seed → same production and calls');
}

/* 3. Offline only at TL6 / FL1–FL7, with a scan; excluded from counts; return to line */
{
  section('offline and return to line');
  const M = loadEngine(), S = warm(M); M.runUntil(S, 7 * 3600);
  const onChassis = Object.values(S.vehicles).find((v) => M.isActive(v) && v.carrierId && S.carriers[v.carrierId].mode === 'POS' && M.POS[S.carriers[v.carrierId].posId].area === 'CHASSIS' && M.POS[S.carriers[v.carrierId].posId].kind === 'work');
  ok(onChassis && !M.canTakeOffLine(S, onChassis.id).ok, 'cannot take a unit offline on the Chassis line');
  M.runWhile(S, () => !(S.pos.FL4.occ && S.pos.FL4.occ.vehicleId && S.pos.FL4.occ.completeT == null), 4000);
  const v = S.vehicles[S.pos.FL4.occ.vehicleId];
  ok(!M.takeOffLine(S, v.id, { reason: 'Part fitment issue', by: 'Test', scan: 'WRONGVIN' }).ok, 'offline refused when the scan does not match');
  const r = M.takeOffLine(S, v.id, { reason: 'Part fitment issue', by: 'Test', scan: v.vin });
  ok(r.ok && v.state === 'OFF_LINE' && v.offline.pos === 'FL4', 'offline at FL4 with a matching scan');
  ok(M.stationCount(S, 'FL4') === 0, 'offlined unit removed from the station count');
  ok(S.scans.some((s) => s.scanner === 'OFFLINE' && s.ok && s.vin === v.vin && s.pos === 'FL4'), 'offline scan recorded with the station');
  M.runUntil(S, S.t + 60);
  ok(M.returnToLine(S, v.id, 'Test').ok && v.state === 'RETURN_QUEUED', 'return requested');
  M.runWhile(S, () => v.state !== 'IN_PROCESS', 3 * 3600);
  ok(v.state === 'IN_PROCESS' && v.posId === 'FL4', `returned unit rejoins at FL4 (state ${v.state}, at ${v.posId})`);
  M.runWhile(S, () => v.state !== 'LINED_OFF', 3 * 3600);
  const rec = S.prod.find((p) => p.vehicleId === v.id && p.area === 'FINAL');
  ok(v.state === 'LINED_OFF' && rec && rec.returned, 'returned unit counts once it completes the line');
  ok(S.prod.filter((p) => p.vehicleId === v.id && p.area === 'FINAL').length === 1, 'counted exactly once');
}

/* 4. Assist calls: two types, one call per press, response and clear times */
{
  section('assist calls');
  const M = loadEngine(), S = warm(M); S.cfg.callRate = 0; M.runUntil(S, 7 * 3600);
  const c1 = M.raiseCall(S, 'CL2', 'SUP', 'Test operator');
  const again = M.raiseCall(S, 'CL2', 'SUP', 'Test operator');
  ok(c1 && again === c1, 'pressing a lit button again does not open a second call');
  const c2 = M.raiseCall(S, 'CL2', 'MNT', 'Test operator');
  ok(c2 && c2 !== c1 && M.callsAt(S, 'CL2').length === 2, 'supervisor and maintenance calls are separate');
  M.runUntil(S, S.t + 75); M.respondCall(S, c1.id, 'Supervisor A');
  M.runUntil(S, S.t + 120); M.clearCall(S, c1.id, 'Supervisor A');
  ok(M.callResponse(c1) === 75 && M.callDuration(c1) === 195, `response 75 s and total 195 s recorded (got ${M.callResponse(c1)}, ${M.callDuration(c1)})`);
  ok(!M.callActive(S, 'SUP', 'CL2') && M.callActive(S, 'MNT', 'CL2'), 'clearing one call leaves the other lit');
  ok(!M.raiseCall(S, 'BUF', 'SUP', 'x'), 'no call buttons on the buffer');
}

/* 5. Takt, targets, buzzer, corrections: audited */
{
  section('configuration, buzzer, corrections');
  const M = loadEngine(), S = warm(M); S.cfg.callRate = 0; M.runUntil(S, 7 * 3600);
  ok(M.setTakt(S, 'CHASSIS', 480, 'Planner', 'Rebalance') && M.POS.CL3.target === 480 && M.POS.FL3.target === 600, 'takt is per line');
  ok(S.audit.some((a) => a.action === 'Takt time changed' && a.by === 'Planner'), 'takt change audited');
  // with a 4:30 takt the 9:00 teams go over → buzzer on, off when the unit leaves
  M.setTakt(S, 'CHASSIS', 270, 'Planner', 'test');
  M.runWhile(S, () => !M.buzzerOn(S, 'CL2'), 2000);
  const vid = S.pos.CL2.occ && S.pos.CL2.occ.vehicleId;
  ok(M.buzzerOn(S, 'CL2') && M.andonState(S, 'CL2').state === 'over', 'buzzer rings when the unit passes takt');
  M.runWhile(S, () => S.pos.CL2.occ && S.pos.CL2.occ.vehicleId === vid, 2000);
  ok(!S.buzzing.CL2 || S.pos.CL2.occ.vehicleId !== vid, 'buzzer stops when the unit leaves');
  M.setBuzzer(S, 'CL3', false, 'Planner', 'noise test');
  ok(!M.buzzerOn(S, 'CL3') && S.audit.some((a) => a.target === 'CL3'), 'buzzer can be switched off per station, audited');
  M.setTakt(S, 'CHASSIS', 600, 'Planner', 'restore');
  // correction: swap two units on the Final line
  M.runWhile(S, () => !(S.pos.FL3.occ && S.pos.FL3.occ.vehicleId && S.pos.FL5.occ && S.pos.FL5.occ.vehicleId), 4000);
  const a = S.vehicles[S.pos.FL3.occ.vehicleId], b = S.vehicles[S.pos.FL5.occ.vehicleId];
  ok(!M.correctPosition(S, a.vin, 'FL5', 'Planner', '').ok, 'correction needs a reason');
  const r = M.correctPosition(S, a.vin, 'FL5', 'Planner', 'Units swapped on the floor');
  ok(r.ok && a.posId === 'FL5' && b.posId === 'FL3' && S.pos.FL5.occ.vehicleId === a.id, 'correction swaps the two units');
  ok(S.audit.some((x) => x.action === 'Position corrected'), 'correction audited');
  // scheduled plan for tomorrow
  const tomorrow = M.dateKeyAt(S, S.t + 86400);
  M.setPlan(S, tomorrow, { targets: { 'Shift A': { TRIM: 20, CHASSIS: 20, FINAL: 20 } } }, 'Planner', 'Reduced plan');
  M.runUntil(S, 86400 + 6 * 3600 + 30);
  ok(S.shift.name === 'Shift A' && S.shift.targets.FINAL === 20, `scheduled target applied next day (got ${S.shift.targets.FINAL})`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
