/* Everything a person does that changes the plant goes through Act.
   Local mode runs the engine call in this browser at once; remote mode sends a command to the edge
   server. Either way the caller gets a Promise of the engine's result (e.g. { ok, reason }). */
import { M, RT, bump } from './runtime.js';
import { REMOTE, send } from './source.js';

function run(command, local) {
  if (REMOTE) return send(command).finally(bump);
  try { const r = local(RT.S); bump(); return Promise.resolve(r); }
  catch (e) { return Promise.reject(e); }
}

export const Act = {
  // calls (URD req 19–22)
  raiseCall: (pos, callType, by) => run({ type: 'RAISE_CALL', pos, callType }, (S) => M.raiseCall(S, pos, callType, by)),
  respondCall: (callId, by) => run({ type: 'RESPOND_CALL', callId }, (S) => M.respondCall(S, callId, by)),
  clearCall: (callId, by, note) => run({ type: 'CLEAR_CALL', callId, note }, (S) => M.clearCall(S, callId, by, note)),
  ackAlarm: (alarmId, by) => run({ type: 'ACK_ALARM', alarmId }, (S) => M.ackAlarm(S, alarmId, by)),
  // tracking (req 1–7)
  entryScan: (raw, source = 'MANUAL') => run({ type: 'ENTRY_SCAN', raw, source }, (S) => M.entryScan(S, raw, source)),
  takeOffLine: (vehicleId, o) => run({ type: 'TAKE_OFFLINE', vehicleId, reason: o.reason, notes: o.notes || undefined, responsible: o.responsible, scan: o.scan }, (S) => M.takeOffLine(S, vehicleId, o)),
  returnToLine: (vehicleId, by, note) => run({ type: 'RETURN_TO_LINE', vehicleId, note }, (S) => M.returnToLine(S, vehicleId, by, note)),
  correctPosition: (vin, toPos, by, reason) => run({ type: 'CORRECT_POSITION', vin, toPos, reason }, (S) => M.correctPosition(S, vin, toPos, by, reason)),
  clearGhost: (pos, by, reason) => run({ type: 'CLEAR_GHOST', pos, reason }, (S) => M.clearGhost(S, pos, by, reason)),
  manualComplete: (pos) => run({ type: 'MANUAL_COMPLETE', pos }, (S) => M.manualComplete(S, pos)),
  rescanEngine: (pos) => run({ type: 'RESCAN_ENGINE', pos }, (S) => M.rescanEngine(S, pos)),
  // configuration (req 10, 13, 15, 18)
  setTakt: (area, sec, by, reason) => run({ type: 'SET_TAKT', area, sec, reason }, (S) => M.setTakt(S, area, sec, by, reason)),
  setWarnPct: (pct, by, reason) => run({ type: 'SET_WARN_PCT', pct, reason }, (S) => M.setWarnPct(S, pct, by, reason)),
  setDefaultTarget: (area, n, by, reason) => run({ type: 'SET_DEFAULT_TARGET', area, n, reason }, (S) => M.setDefaultTarget(S, area, n, by, reason)),
  setPlan: (date, patch, by, reason) => run({ type: 'SET_PLAN', date, patch, reason }, (S) => M.setPlan(S, date, patch, by, reason)),
  setShiftPattern: (shifts, by, reason) => run({ type: 'SET_SHIFTS', shifts, reason }, (S) => M.setShiftPattern(S, shifts, by, reason)),
  setBuzzer: (pos, on, by, reason) => run({ type: 'SET_BUZZER', pos, on, reason }, (S) => M.setBuzzer(S, pos, on, by, reason)),
  note: (text, extra) => run({ type: 'LOG_NOTE', cat: 'sim', text, extra }, (S) => M.logEvent(S, 'sim', text, extra)),
  // simulator controls
  setSpeed: (speed) => (REMOTE ? send({ type: 'SIM_SPEED', speed }).finally(bump) : (RT.speed = speed, bump(), Promise.resolve())),
  setRunning: (running) => (REMOTE ? send({ type: 'SIM_RUNNING', running }).finally(bump) : (RT.running = running, bump(), Promise.resolve())),
  skipTo: (to) => run({ type: 'SIM_SKIP', to }, (S) => { M.runUntil(S, to, 40000); RT.acc = 0; }),
  pauseArea: (area, on) => run({ type: 'SIM_PAUSE_AREA', area, on }, (S) => M.setPaused(S, area, on)),
  faultCarrier: (carrierId, pos) => run({ type: 'SIM_FAULT_CARRIER', carrierId }, (S) => M.injectCarrierFault(S, carrierId))
    .then(() => Act.note(`SIMULATION · fault injected on ${carrierId}`, { pos })),
  faultSensor: (pos, label) => run({ type: 'SIM_FAULT_SENSOR', pos }, (S) => M.injectSensorFault(S, pos))
    .then(() => Act.note(`SIMULATION · sensor fault injected at ${label}`, { pos })),
  clearFault: (kind, id) => run({ type: 'SIM_CLEAR_FAULT', kind, id }, (S) => M.clearFault(S, kind, id)),
  simConfig: (key, value) => run({ type: 'SIM_CONFIG', key, value }, (S) => { S.cfg[key] = value; }),
  emergency: (pos, on) => run(on ? { type: 'SIM_EMERGENCY', pos } : { type: 'SIM_CLEAR_EMERGENCY', pos }, (S) => (on ? M.callEmergency(S, pos) : M.clearEmergency(S, pos))),
};
