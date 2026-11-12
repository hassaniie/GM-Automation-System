/* Assist calls (URD req 19–22). Every station has two buttons: Call Supervisor
   and Call Maintenance. A call is raised at the station, responded to (help
   arrived) and cleared by the responder; both durations are recorded.      */
import { raiseOrUpdate, resolveAlarmsFor } from './alarms.js';
import { ANDON_AREAS, AREAS, CALL_TYPES, POS } from './plant.js';
import { dispId } from './scans.js';
import { logEvent, uid } from './state.js';
import { fmtDur, hash01 } from './util.js';

export const callsAt = (S, posId) => S.calls.filter((c) => c.pos === posId && c.clearedT == null);
export const openCall = (S, posId, type) => S.calls.find((c) => c.pos === posId && c.type === type && c.clearedT == null) || null;
export const callAllowedAt = (S, posId) => POS[posId] && POS[posId].kind === 'work' && (ANDON_AREAS.includes(POS[posId].area) || S.cfg.trimAndon);
// sim = raised by the simulated shop floor; only those get simulated responders.
export function raiseCall(S, posId, type, by = 'Station button', sim = false) {
  if (!CALL_TYPES[type] || !callAllowedAt(S, posId)) return null;
  const ex = openCall(S, posId, type); if (ex) return ex; // a lit button pressed again is still one call
  const occ = S.pos[posId].occ, v = occ && occ.vehicleId && S.vehicles[occ.vehicleId], T = CALL_TYPES[type];
  const c = { id: uid(S, 'call'), pos: posId, area: POS[posId].area, type, raisedT: S.t, raisedBy: by, vehicleId: v ? v.id : null, vin: v ? v.vin : null,
    respondedT: null, respondedBy: null, clearedT: null, clearedBy: null, note: '', shiftKey: S.shift ? S.shift.key : '', recorded: S.recording };
  S.calls.push(c); if (S.calls.length > 3000) S.calls.shift();
  raiseOrUpdate(S, `CALL:${type}:${posId}`, { type: 'CALL', callType: type, callId: c.id, level: T.level, pos: posId, vehicleId: c.vehicleId, vin: c.vin, msg: `${POS[posId].team} is calling ${T.label.toLowerCase()}` });
  if (S.recording) S.stats.assist++;
  if (sim && S.cfg.autoRespond) {
    const u = hash01(c.id + posId);
    c.simRespondAt = S.t + Math.round(40 + u * 140); c.simClearAt = c.simRespondAt + Math.round(60 + hash01(c.id + 'clr') * 260);
  }
  return c;
}
export function respondCall(S, callId, by) {
  const c = S.calls.find((x) => x.id === callId); if (!c || c.respondedT != null || c.clearedT != null) return false;
  c.respondedT = S.t; c.respondedBy = by;
  const a = S.alarmByKey[`CALL:${c.type}:${c.pos}`];
  if (a && a.resolvedT == null) { a.ackT = S.t; a.ackBy = by; a.history.push({ t: S.t, text: `${by} responded after ${fmtDur(S.t - c.raisedT)}` }); }
  logEvent(S, 'call', `${CALL_TYPES[c.type].label} responded at ${dispId(c.pos)} · ${by} · ${fmtDur(S.t - c.raisedT)} after the call`, { pos: c.pos, vehicleId: c.vehicleId, brief: `${CALL_TYPES[c.type].label} came · ${fmtDur(S.t - c.raisedT)}` });
  return true;
}
export function clearCall(S, callId, by, note = '') {
  const c = S.calls.find((x) => x.id === callId); if (!c || c.clearedT != null) return false;
  if (c.respondedT == null) { c.respondedT = S.t; c.respondedBy = by; }
  c.clearedT = S.t; c.clearedBy = by; c.note = note || c.note;
  resolveAlarmsFor(S, (a) => a.key === `CALL:${c.type}:${c.pos}`, `${CALL_TYPES[c.type].label} call cleared by ${by} · help given in ${fmtDur(c.clearedT - c.respondedT)}`);
  return true;
}
export const callResponse = (c) => (c.respondedT != null ? c.respondedT - c.raisedT : null);
export const callDuration = (c) => (c.clearedT != null ? c.clearedT - c.raisedT : null);
export function callEmergency(S, posId) {
  const area = POS[posId].area, occ = S.pos[posId].occ, v = occ && occ.vehicleId && S.vehicles[occ.vehicleId];
  S.emergency[area] = [...new Set([...(S.emergency[area] || []), posId])];
  S.paused[area] = true;
  raiseOrUpdate(S, `EMERG:${posId}`, { type: 'EMERGENCY', level: 'EMERGENCY', pos: posId, vehicleId: v ? v.id : null, vin: v ? v.vin : null, msg: `Emergency call at ${posId} · ${AREAS[area].name} stopped` });
  if (S.recording) S.stats.emergency++;
}
export function clearEmergency(S, posId) {
  const area = POS[posId].area;
  S.emergency[area] = (S.emergency[area] || []).filter((x) => x !== posId);
  if (!S.emergency[area].length) S.paused[area] = false;
  resolveAlarmsFor(S, (a) => a.key === `EMERG:${posId}`, `Emergency cleared${S.paused[area] ? '' : ` · ${AREAS[area].name} restarted`}`);
}
export const callActive = (S, kind, posId) => { if (CALL_TYPES[kind]) return !!openCall(S, posId, kind); const a = S.alarmByKey[`${kind}:${posId}`]; return !!(a && a.resolvedT == null); };
