/* ── alarms ── */
import { POS, ROUTE, WORK_POS, targetFor } from './plant.js';
import { dispId } from './scans.js';
import { logEvent, uid } from './state.js';

/** What an alarm level is called in the event log (the codes stay internal). */
const LEVEL_LABELS = { WARNING: 'Close to limit', OVERDUE: 'Over takt', ESCALATED: 'Escalated', FAULT: 'Fault', HOLD: 'Quality hold', BLOCKED: 'Blocked', ASSIST: 'Assistance', CALL_SUP: 'Supervisor call', CALL_MNT: 'Maintenance call', EMERGENCY: 'Emergency' };
export const levelLabel = (level) => LEVEL_LABELS[level] || level;
export const SEV = { WARNING: 1, ASSIST: 2, CALL_SUP: 2, CALL_MNT: 2, EMERGENCY: 5, BLOCKED: 2, OVERDUE: 3, FAULT: 3, HOLD: 3, ESCALATED: 4 };
export function raiseOrUpdate(S, key, data) {
  let a = S.alarmByKey[key];
  if (a && a.resolvedT == null) {
    if (data.level && data.level !== a.level && SEV[data.level] > SEV[a.level]) {
      a.history.push({ t: S.t, text: `${a.level} → ${data.level}` });
      a.level = data.level; a.levelT = S.t; a.msg = data.msg || a.msg; a.ackT = null; a.ackBy = null;
      logEvent(S, 'alarm', `${levelLabel(data.level)} · ${dispId(a.pos)} · ${a.msg}`, { vehicleId: a.vehicleId, pos: a.pos });
    }
    return a;
  }
  a = { id: uid(S, 'al'), key, raisedT: S.t, levelT: S.t, ackT: null, ackBy: null, resolvedT: null, resolution: null, history: [{ t: S.t, text: `Raised as ${data.level}` }], ...data };
  S.alarms.push(a); S.alarmByKey[key] = a;
  if (S.alarms.length > 400) { const old = S.alarms.shift(); if (S.alarmByKey[old.key] === old) delete S.alarmByKey[old.key]; }
  if (data.level !== 'WARNING') logEvent(S, 'alarm', `${levelLabel(data.level)} · ${dispId(data.pos)} · ${data.msg}`, { vehicleId: data.vehicleId, pos: data.pos });
  return a;
}
export function resolveAlarmsFor(S, pred, resolution) {
  for (const a of S.alarms) if (a.resolvedT == null && pred(a)) {
    a.resolvedT = S.t; a.resolution = resolution; a.history.push({ t: S.t, text: `Resolved · ${resolution}` });
    if (a.level !== 'WARNING') logEvent(S, 'alarm', `Resolved · ${dispId(a.pos)} · ${resolution}`, { vehicleId: a.vehicleId, pos: a.pos });
  }
}
export function ackAlarm(S, id, by = 'Supervisor') {
  const a = S.alarms.find((x) => x.id === id); if (!a || a.resolvedT != null || a.ackT != null) return;
  a.ackT = S.t; a.ackBy = by; a.history.push({ t: S.t, text: `Acknowledged by ${by} (condition still open)` });
  logEvent(S, 'alarm', `Acknowledged · ${levelLabel(a.level)} · ${dispId(a.pos)} · condition still open`, { vehicleId: a.vehicleId, pos: a.pos });
}
export const alarmActive = (a) => a.resolvedT == null;
export const alarmUnacked = (a) => a.resolvedT == null && a.ackT == null;
export function updateAlarms(S) {
  const C = S.cfg;
  for (const id of WORK_POS) {
    const p = S.pos[id], occ = p.occ;
    if (!occ || !occ.vehicleId || occ.completeT != null) continue;
    const v = S.vehicles[occ.vehicleId];
    const tgt = targetFor(id, v); let level = null;
    if (occ.workT - tgt >= C.escalateAfter) level = 'ESCALATED'; else if (occ.workT >= tgt) level = 'OVERDUE'; else if (occ.workT / tgt >= C.warnPct) level = 'WARNING';
    if (!level) continue;
    const msg = level === 'WARNING' ? `${POS[id].team} approaching target` : level === 'OVERDUE' ? `${POS[id].team} over target time` : `${POS[id].team} unresolved delay, escalated`;
    const a = raiseOrUpdate(S, `DELAY:${id}:${v.id}`, { type: 'DELAY', level, pos: id, vehicleId: v.id, vin: v.vin, carrierId: p.carrierId, msg });
    if (level !== 'WARNING' && !a.counted && S.recording) { a.counted = true; S.stats.overdue[id] = (S.stats.overdue[id] || 0) + 1; }
  }
  for (const id of ROUTE) {
    const p = S.pos[id], occ = p.occ;
    if (!occ || !occ.vehicleId || occ.completeT == null || POS[id].exit || POS[id].kind === 'buffer') continue;
    if (S.t - occ.completeT >= C.blockedAlarmAfter) {
      const v = S.vehicles[occ.vehicleId], an = S._analysis && S._analysis.byPos[id];
      if (!an || !an.cause || an.cause.normal || S.xfers.some((q) => q.from === id)) continue;
      const root = an && an.root && an.root !== id ? an.root : null;
      const a = raiseOrUpdate(S, `BLOCK:${id}:${v.id}`, { type: 'BLOCKED', level: 'BLOCKED', pos: id, vehicleId: v.id, vin: v.vin, carrierId: p.carrierId, msg: `Work complete, transfer blocked${root ? ` by ${dispId(root)}` : ''}`, root });
      if (root && a.root !== root) { a.root = root; a.msg = `Work complete, transfer blocked by ${dispId(root)}`; }
    }
  }
}
