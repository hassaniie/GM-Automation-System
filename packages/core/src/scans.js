/* ── Scanner 1: Trim entry ── */
import { raiseOrUpdate, resolveAlarmsFor } from './alarms.js';
import { closeSegment, startOcc } from './occupancy.js';
import { H_BUFFER, H_FINAL, H_TRIM, STORAGE_PATH, WORK_POS, XFER_FROM, bufferToEntryPath } from './plant.js';
import { logEvent, uid } from './state.js';
import { fmtClock, fmtDur, hash01 } from './util.js';
import { bufferHead, findVehicleByVin, isActive, variantFromVin } from './vehicles.js';
import { validateVinFormat } from './vin.js';

export function entryScan(S, raw, source = 'MANUAL') {
  const fmt = validateVinFormat(raw);
  const res = (ok, reason, extra = {}) => {
    const rec = { id: uid(S, 'scan'), t: S.t, scanner: 'ENTRY', vin: fmt.vin, ok, reason, source, ...extra };
    S.scans.push(rec); if (S.scans.length > 300) S.scans.shift();
    if (!ok) logEvent(S, 'exception', `Scanner 1 rejected ${fmt.vin || '(blank)'} · ${reason}`, { pos: 'TL1' });
    return rec;
  };
  if (!fmt.ok) return res(false, fmt.reason);
  const ex = findVehicleByVin(S, fmt.vin);
  if (ex) {
    if (isActive(ex)) return res(false, `Duplicate: ${fmt.vin} is already in the line at ${locationLabel(S, ex)}. No record was created.`, { vehicleId: ex.id });
    if (ex.state === 'LINED_OFF') return res(false, `Duplicate: ${fmt.vin} lined off at ${fmtClock(ex.lineOffT, false)} and cannot enter again.`, { vehicleId: ex.id });
    if (ex.state === 'OFF_LINE') return res(false, `${fmt.vin} was taken off the line at ${fmtClock(ex.offline.t, false)} from ${dispId(ex.offline.pos)}. Use “Return to line” to put it back where it left.`, { vehicleId: ex.id });
    if (ex.state === 'RETURN_QUEUED' || ex.state === 'RETURNING') return res(false, `${fmt.vin} is already returning to ${dispId(ex.returnReq.pos)}.`, { vehicleId: ex.id });
  }
  // live: the paint-shop buffer is not reported, so the scanned body is the one arriving
  const head = S.plantMode === 'live' && bufferHead(S) < 0 ? -1 : bufferHead(S);
  if (head < 0 && S.plantMode !== 'live') return res(false, 'No body is waiting in the paint-shop buffer, so there is nothing to register.');
  const E = S.pos['TL1'];
  if (!E.carrierId || E.occ.vehicleId || E.occ.pendingBody) return res(false, E.carrierId ? 'TL1 is occupied. Wait for the body ahead to move on to TL2.' : 'No empty skid at TL1 yet. Wait for the returning skid.');
  if (S.carriers[E.carrierId].fault) return res(false, `Skid ${E.carrierId} is in fault.`);
  const body = head >= 0 ? S.bodyBuffer[head] : { paint: { name: 'Not reported', hex: '#9aa0a6' } };
  if (head >= 0) S.bodyBuffer[head] = null;
  const variant = variantFromVin(fmt.vin);
  const v = {
    id: uid(S, 'v'), vin: fmt.vin, variant, paint: body.paint, carrierId: null, state: 'IN_PROCESS', posId: 'TL1',
    entryT: S.t, lineOffT: null, totalDur: null, segments: [], done: {}, credited: {}, history: [],
    offline: null, offlines: [], returns: [], returnReq: null, source, engine: null,
  };
  S.vehicles[v.id] = v; S.vehOrder.push(v.id); S.lastEntryT = S.t;
  E.occ.pendingBody = v.id;
  S.anims.push({ id: uid(S, 'an'), vehicleId: v.id, kind: 'entry', t0: S.t, t1: S.t + 30, path: bufferToEntryPath(Math.max(0, head)), y0: H_BUFFER, y1: H_TRIM });
  logEvent(S, 'scan', `Scanner 1 accepted ${v.vin} · ${variant.name} · ${body.paint.name}. Line-in recorded; assembly timer started.`, { vehicleId: v.id, pos: 'TL1', brief: `Line-in at TL1 · ${variant.name}` });
  return res(true, `Registered ${variant.name}. Assembly timer started at ${fmtClock(S.t)}.`, { vehicleId: v.id });
}
export function finishEntry(S, v) {
  const E = S.pos['TL1'];
  if (!E.occ || E.occ.pendingBody !== v.id) return;
  E.occ.pendingBody = null;
  const c = S.carriers[E.carrierId]; c.vehicleId = v.id; v.carrierId = c.id;
  startOcc(S, 'TL1', c.id, v.id);
}

/* ── Line-off at FL7: detected by the end-of-line photo-eye (URD §6: no scan is planned there).
   The VIN comes from tracking, not from a scan; the detection is still recorded for traceability. ── */
export function exitScan(S, raw, source = 'PHOTO_EYE') {
  const fmt = validateVinFormat(raw);
  const res = (ok, reason, extra = {}) => {
    const rec = { id: uid(S, 'scan'), t: S.t, scanner: 'EOL', vin: fmt.vin, ok, reason, source, ...extra };
    S.scans.push(rec); if (S.scans.length > 300) S.scans.shift();
    if (!ok) logEvent(S, 'exception', `End-of-line detection rejected ${fmt.vin || '(blank)'} · ${reason}`, { pos: 'FL7', vehicleId: extra.vehicleId });
    return rec;
  };
  if (!fmt.ok) return res(false, fmt.reason);
  const v = findVehicleByVin(S, fmt.vin);
  if (!v) return res(false, `Unknown VIN: ${fmt.vin} was never registered at Scanner 1. No production record was created.`);
  if (v.state === 'LINED_OFF') return res(false, `Duplicate: ${fmt.vin} already lined off at ${fmtClock(v.lineOffT, false)}.`, { vehicleId: v.id });
  if (v.state === 'OFF_LINE') return res(false, `${fmt.vin} was taken off the line at ${fmtClock(v.offline.t, false)} from ${dispId(v.offline.pos)}. It is recorded as off-line, not as a completed vehicle.`, { vehicleId: v.id });
  const c = v.carrierId && S.carriers[v.carrierId];
  if (!c || c.mode !== 'POS' || c.posId !== 'FL7') return res(false, `${fmt.vin} is at ${locationLabel(S, v)}, not at line-off.`, { vehicleId: v.id });
  if (S.pos.FL7.occ.completeT == null) return res(false, `${fmt.vin} is still being worked on at FL7.`, { vehicleId: v.id });
  const missing = WORK_POS.filter((p) => !v.done[p] && !v.credited[p]);
  if (missing.length) return res(false, `Operations not confirmed complete: ${missing.join(', ')}.`, { vehicleId: v.id });
  const occ = S.pos.FL7.occ;
  occ.completeT = S.t; occ.completeBy = 'EXIT_SCAN';
  closeSegment(S, v, 'FL7', S.t);
  v.state = 'LINED_OFF'; v.lineOffT = S.t; v.totalDur = S.t - v.entryT;
  c.vehicleId = null; v.carrierId = null; occ.vehicleId = null; occ.unloadUntil = S.t + 30;
  const sk = S.shift ? S.shift.key : '';
  if (S.recording) S.stats.completed.push({ vin: v.vin, t: S.t, dur: v.totalDur, variant: v.variant.code, name: v.variant.name, model: v.variant.model, paint: v.paint.name, shiftKey: sk, returned: v.returns.length > 0, n: S.stats.completed.filter((c) => c.shiftKey === sk).length + 1 });
  S.anims.push({ id: uid(S, 'an'), vehicleId: v.id, kind: 'storage', t0: S.t, t1: S.t + 40, path: STORAGE_PATH, y0: H_FINAL, y1: 0.36 });
  logEvent(S, 'scan', `End-of-line photo-eye · ${v.vin} completed. Lined off after ${fmtDur(v.totalDur)}.`, { vehicleId: v.id, pos: 'FL7', brief: `Completed · ${fmtDur(v.totalDur)}` });
  resolveAlarmsFor(S, (a) => a.vehicleId === v.id, 'Vehicle lined off');
  return res(true, `Completion recorded. Total assembly time ${fmtDur(v.totalDur)}.`, { vehicleId: v.id, dur: v.totalDur });
}

export function locationLabel(S, v) {
  if (!v) return '—';
  if (v.state === 'LINED_OFF') return 'Lined off → storage';
  if (v.state === 'OFF_LINE') return `Offline · taken off at ${dispId(v.offline.pos)}`;
  if (v.state === 'RETURN_QUEUED') return `Offline · waiting to rejoin at ${dispId(v.returnReq.pos)}`;
  if (v.state === 'RETURNING') return `Rejoining the line at ${dispId(v.returnReq.pos)}`;
  const x = S.xfers.find((q) => q.vehicleId === v.id); if (x) return `${XFER_FROM[x.from].label}`;
  const c = v.carrierId && S.carriers[v.carrierId];
  if (c && c.mode === 'TRANSIT') return `In transit ${dispId(c.transit.from)} → ${dispId(c.transit.to)}`;
  if (c && c.mode === 'POS') return dispId(c.posId);
  const an = S.anims.find((a) => a.vehicleId === v.id);
  if (an && an.kind === 'entry') return 'Buffer → trim entry';
  return v.posId ? dispId(v.posId) : '—';
}
export const dispId = (id) => id;

/* ── engine / transmission pairing at CL2 (from layout: “Scanning of Engine/Transmission”) ── */
export function engineScan(S, v, forceOk = false) {
  const n = S.engSerial++;
  const mism = !forceOk && (S.forceMismatch[v.id] || hash01(v.vin + 'eng' + n) < S.cfg.mismatchRate);
  const expect = v.variant.pt === 'PHEV' ? '15E4E-P' : v.variant.pt === 'HEV' ? '15E4E-H' : '15E4E-T';
  const got = mism ? (expect.endsWith('T') ? '15E4E-H' : '15E4E-T') : expect;
  v.engine = { t: S.t, engineNo: `${got}${String(n).padStart(6, '0')}`, transNo: `${got.endsWith('T') ? '7DCT' : got.endsWith('P') ? 'EDU2' : 'HEV3'}-${String(n * 3 + 11).padStart(6, '0')}`, ok: !mism, expect };
  delete S.forceMismatch[v.id];
  if (mism) {
    raiseOrUpdate(S, `QUAL:CL2:${v.id}`, { type: 'QUALITY', level: 'HOLD', pos: 'CL2', vehicleId: v.id, vin: v.vin, msg: `Engine scan mismatch: ${got}… is not valid for ${v.variant.name} (expects ${expect}…)` });
    if (S.recording) S.stats.quality++;
    logEvent(S, 'exception', `CL2 engine/transmission scan mismatch on ${v.vin.slice(-6)} · quality hold`, { vehicleId: v.id, pos: 'CL2', brief: 'CL2 scan mismatch · hold' });
  } else {
    resolveAlarmsFor(S, (a) => a.key === `QUAL:CL2:${v.id}`, 'Correct engine/transmission scanned and paired');
    logEvent(S, 'scan', `CL2 paired engine ${v.engine.engineNo} / transmission ${v.engine.transNo} to ${v.vin.slice(-6)}`, { vehicleId: v.id, pos: 'CL2', brief: 'CL2 engine paired' });
  }
}
