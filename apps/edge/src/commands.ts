/* Commands from the screens → engine calls. Validated with the zod schemas in @mg/contracts and checked
   against the signed-in person's role. The person's name comes from the session, never from the screen.
   Each returns the engine's own result (e.g. { ok, reason } or a scan record) to the sender. */
import { COMMAND_PERMISSION, OperatorCommand, ROLES, SimCommand, isSimCommand, roleCan, type Command as Cmd, type RoleId } from '@mg/contracts';
import { MGE as M } from '@mg/engine';
import type { EngineHost } from './engine-host.ts';

export class CommandError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

/** Who sent a command: a signed-in person, or a line display (read-only). */
export interface Actor { kind: 'user' | 'display' | 'system'; id: string; name: string; role: RoleId | null }
export const actorLabel = (a: Actor) => (a.role ? `${a.name} · ${ROLES[a.role].short}` : a.name);
export const SYSTEM: Actor = { kind: 'system', id: 'system', name: 'System', role: 'admin' };

export function parseCommand(input: unknown): Cmd {
  const type = typeof input === 'object' && input !== null ? (input as { type?: unknown }).type : undefined;
  const parsed = (typeof type === 'string' && type.startsWith('SIM_') ? SimCommand : OperatorCommand).safeParse(input);
  if (!parsed.success) throw new CommandError(`Invalid command: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'command'} ${i.message}`).join('; ')}`);
  return parsed.data;
}

/** Throws a 403 CommandError when the actor may not run the command. */
export function authorize(host: EngineHost, actor: Actor, c: Cmd) {
  if (actor.kind === 'display') throw new CommandError('Line displays are read-only', 403);
  let need = COMMAND_PERMISSION[c.type];
  if (need === 'respond') {
    const call = host.S.calls.find((x) => x.id === (c as { callId: string }).callId);
    if (!call) throw new CommandError('That call is not open', 404);
    need = call.type === 'SUP' ? 'respond.SUP' : 'respond.MNT';
  }
  if (!roleCan(actor.role, need)) throw new CommandError(`${actor.role ? ROLES[actor.role].label : 'This account'} may not do that (${c.type})`, 403);
}

export async function runCommand(host: EngineHost, input: unknown, actor: Actor): Promise<unknown> {
  const c = parseCommand(input);
  if (isSimCommand(c) && host.clock.mode !== 'simulation') throw new CommandError('Simulator controls are only available in simulation mode', 403);
  try { authorize(host, actor, c); } catch (e) { host.onCommand?.(actor, c, false, (e as Error).message); throw e; }
  const result = await exec(host, host.S, c, actorLabel(actor));
  host.onCommand?.(actor, c, true);
  host.publish(); // send the change now rather than at the next tick
  return result ?? null;
}

async function exec(host: EngineHost, S: EngineHost['S'], c: Cmd, by: string): Promise<unknown> {
  switch (c.type) {
    case 'RAISE_CALL': return M.raiseCall(S, c.pos, c.callType, `${by} · station button`);
    case 'RESPOND_CALL': return M.respondCall(S, c.callId, by);
    case 'CLEAR_CALL': return M.clearCall(S, c.callId, by, c.note);
    case 'ACK_ALARM': return M.ackAlarm(S, c.alarmId, by);
    case 'ENTRY_SCAN': return M.entryScan(S, c.raw, c.source);
    case 'TAKE_OFFLINE': return M.takeOffLine(S, c.vehicleId, { reason: c.reason, notes: c.notes, responsible: c.responsible, by, scan: c.scan });
    case 'RETURN_TO_LINE': return M.returnToLine(S, c.vehicleId, by, c.note);
    case 'CORRECT_POSITION': return M.correctPosition(S, c.vin, c.toPos, by, c.reason);
    case 'CLEAR_GHOST': return M.clearGhost(S, c.pos, by, c.reason);
    case 'SET_TAKT': return M.setTakt(S, c.area, c.sec, by, c.reason);
    case 'SET_WARN_PCT': return M.setWarnPct(S, c.pct, by, c.reason);
    case 'SET_DEFAULT_TARGET': return M.setDefaultTarget(S, c.area, c.n, by, c.reason);
    case 'SET_PLAN': return M.setPlan(S, c.date, c.patch, by, c.reason);
    case 'SET_SHIFTS': return M.setShiftPattern(S, c.shifts, by, c.reason);
    case 'SET_BUZZER': return M.setBuzzer(S, c.pos, c.on, by, c.reason);
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
