/* Commands from the screens → engine calls. Validated with the zod schemas in @mg/contracts.
   Each returns the engine's own result (e.g. { ok, reason } or a scan record) to the sender. */
import { OperatorCommand, SimCommand, isSimCommand, type Command as Cmd } from '@mg/contracts';
import { MGE as M } from '@mg/engine';
import type { EngineHost } from './engine-host.ts';

export class CommandError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export function runCommand(host: EngineHost, input: unknown): unknown {
  const type = typeof input === 'object' && input !== null ? (input as { type?: unknown }).type : undefined;
  const parsed = (typeof type === 'string' && type.startsWith('SIM_') ? SimCommand : OperatorCommand).safeParse(input);
  if (!parsed.success) throw new CommandError(`Invalid command: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'command'} ${i.message}`).join('; ')}`);
  const c: Cmd = parsed.data;
  if (isSimCommand(c) && host.clock.mode !== 'simulation') throw new CommandError('Simulator controls are only available in simulation mode', 403);
  // TODO(phase 4): take `by` from the signed-in session and check the role's permission for c.type.
  const S = host.S;
  const result = exec(host, S, c);
  host.publish(); // send the change now rather than at the next tick
  return result ?? null;
}

function exec(host: EngineHost, S: EngineHost['S'], c: Cmd): unknown {
  switch (c.type) {
    case 'RAISE_CALL': return M.raiseCall(S, c.pos, c.callType, c.by);
    case 'RESPOND_CALL': return M.respondCall(S, c.callId, c.by);
    case 'CLEAR_CALL': return M.clearCall(S, c.callId, c.by, c.note);
    case 'ACK_ALARM': return M.ackAlarm(S, c.alarmId, c.by);
    case 'ENTRY_SCAN': return M.entryScan(S, c.raw, c.source);
    case 'TAKE_OFFLINE': return M.takeOffLine(S, c.vehicleId, { reason: c.reason, notes: c.notes, responsible: c.responsible, by: c.by, scan: c.scan });
    case 'RETURN_TO_LINE': return M.returnToLine(S, c.vehicleId, c.by, c.note);
    case 'CORRECT_POSITION': return M.correctPosition(S, c.vin, c.toPos, c.by, c.reason);
    case 'CLEAR_GHOST': return M.clearGhost(S, c.pos, c.by, c.reason);
    case 'SET_TAKT': return M.setTakt(S, c.area, c.sec, c.by, c.reason);
    case 'SET_WARN_PCT': return M.setWarnPct(S, c.pct, c.by, c.reason);
    case 'SET_DEFAULT_TARGET': return M.setDefaultTarget(S, c.area, c.n, c.by, c.reason);
    case 'SET_PLAN': return M.setPlan(S, c.date, c.patch, c.by, c.reason);
    case 'SET_SHIFTS': return M.setShiftPattern(S, c.shifts, c.by, c.reason);
    case 'SET_BUZZER': return M.setBuzzer(S, c.pos, c.on, c.by, c.reason);
    case 'MANUAL_COMPLETE': return M.manualComplete(S, c.pos);
    case 'RESCAN_ENGINE': return M.rescanEngine(S, c.pos);
    case 'LOG_NOTE': return M.logEvent(S, c.cat, c.text, c.extra), true;
    // simulator controls
    case 'SIM_SPEED': host.clock.speed = c.speed; return host.clock;
    case 'SIM_RUNNING': host.clock.running = c.running; return host.clock;
    case 'SIM_SKIP': M.runUntil(S, c.to, 40000); return { t: S.t };
    case 'SIM_SCENARIO': return host.loadScenario(c.n);
    case 'SIM_PAUSE_AREA': return M.setPaused(S, c.area, c.on), true;
    case 'SIM_FAULT_CARRIER': return M.injectCarrierFault(S, c.carrierId), true;
    case 'SIM_FAULT_SENSOR': return M.injectSensorFault(S, c.pos), true;
    case 'SIM_CLEAR_FAULT': return M.clearFault(S, c.kind, c.id), true;
    case 'SIM_EMERGENCY': return M.callEmergency(S, c.pos), true;
    case 'SIM_CLEAR_EMERGENCY': return M.clearEmergency(S, c.pos), true;
    case 'SIM_POWER_CUT': return host.powerCut();
    case 'SIM_CONFIG': S.cfg[c.key] = c.value; return true;
  }
}
