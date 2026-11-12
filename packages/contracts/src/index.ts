/* Shared contracts for the Andon system.
   - PlantEvent: what the shop floor reports (simulator today; PLC, scanners, RFID and the FL7 photo-eye in deployment).
   - Command:    what people do on the screens (calls, offline/return, corrections, configuration).
   - EngineState / Snapshot: the state the rules keep and the screens read.
   Types, plus zod schemas for what crosses the network (commands, client messages). */
import { z } from 'zod';

export type AreaId = 'TRIM' | 'CHASSIS' | 'FINAL';
/** A station or transfer position, e.g. 'TL1', 'CL2', 'BUF', 'FL7'. */
export type PositionId = string;
export type VehicleId = string;
export type CarrierId = string;
export type CallType = 'SUP' | 'MNT';
/** Seconds since the simulation's base date at 00:00 (the engine's clock). */
export type Seconds = number;

/* ── plant events ── */
export type ScanSource = 'MANUAL' | 'SCAN' | 'SIM_AUTO' | 'PHOTO_EYE' | 'SCANNER';
export type PlantEvent =
  /** A carrier (skid, hanger or fixture) stopped at a position; presence confirmed by its sensor. */
  | { type: 'CARRIER_ARRIVED'; pos: PositionId; from: PositionId | 'BUFFER'; carrierId: CarrierId; vehicleId: VehicleId | null }
  /** From a device: presence on at a position; tracking works out which carrier it is. */
  | { type: 'CARRIER_ARRIVED'; pos: PositionId; carrierId: null }
  /** A carrier left a position (presence off). Work there is complete; the carrier moves on or returns. */
  | { type: 'CARRIER_DEPARTED'; pos: PositionId }
  /** A body moved from one loop's carrier to the next (TL6 → hanger, hanger → FL fixture). */
  | { type: 'BODY_TRANSFERRED'; vehicleId: VehicleId | null; from: PositionId; to: PositionId }
  /** Scanner 1 at TL1 read a VIN. */
  | { type: 'ENTRY_SCAN'; raw: string; source: ScanSource }
  /** The registered body is seated on the TL1 skid. */
  | { type: 'UNIT_ENTERED'; vehicleId: VehicleId }
  /** A returned unit is back on its carrier at the station it left. */
  | { type: 'UNIT_RETURNED'; vehicleId: VehicleId }
  /** The team (or an automatic transfer position) finished work at a position. */
  | { type: 'WORK_COMPLETE'; pos: PositionId; by: string }
  /** Optional engine/transmission pairing scan at CL2 (off by default). */
  | { type: 'ENGINE_SCAN'; vehicleId: VehicleId }
  /** The end-of-line photo-eye at FL7 saw a unit leave. */
  | { type: 'LINE_OFF'; vin: string | null; source: ScanSource }
  /** Station call buttons and responders (also available as commands). */
  | { type: 'CALL_RAISED'; pos: PositionId; callType: CallType; by: string; sim?: boolean }
  | { type: 'CALL_RESPONDED'; callId: string; by: string }
  | { type: 'CALL_CLEARED'; callId: string; by: string; note?: string };

export type PlantEventType = PlantEvent['type'];
export const PLANT_EVENT_TYPES = [
  'CARRIER_ARRIVED', 'CARRIER_DEPARTED', 'BODY_TRANSFERRED', 'ENTRY_SCAN', 'UNIT_ENTERED', 'UNIT_RETURNED', 'WORK_COMPLETE',
  'ENGINE_SCAN', 'LINE_OFF', 'CALL_RAISED', 'CALL_RESPONDED', 'CALL_CLEARED',
] as const satisfies readonly PlantEventType[];
export const isPlantEvent = (x: unknown): x is PlantEvent =>
  typeof x === 'object' && x !== null && (PLANT_EVENT_TYPES as readonly string[]).includes((x as { type?: string }).type ?? '');

/* ── commands (what people do on the screens), validated at the edge server ──
   Commands carry no user name: the server takes it from the signed-in session. */
const pos = z.string().min(1).max(8);
const area = z.enum(['TRIM', 'CHASSIS', 'FINAL']);
const reason = z.string().max(500).optional();
// breaks carry a label ("Tea break"), as the screens and the rules engine use (audit B2)
const daySec = z.number().min(0).max(86400);
const breakDef = z.object({ label: z.string().max(60).optional(), start: daySec, end: daySec }).strict();
const shiftDef = z.object({ name: z.string().min(1).max(40), start: daySec, end: daySec, breaks: z.array(breakDef).max(8) }).strict();
const areaKey = z.enum(['TRIM', 'CHASSIS', 'FINAL']);
// a day plan: each key replaces that part of the default; null goes back to the default (audit B3)
const planPatch = z.object({
  shifts: z.array(shiftDef).max(4).nullable().optional(),
  targets: z.record(z.string().max(40), z.partialRecord(areaKey, z.number().int().min(0).max(999))).nullable().optional(),
  takt: z.partialRecord(areaKey, z.number().min(60).max(3600)).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
}).strict();

export const OperatorCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('RAISE_CALL'), pos, callType: z.enum(['SUP', 'MNT']) }),
  z.object({ type: z.literal('RESPOND_CALL'), callId: z.string() }),
  z.object({ type: z.literal('CLEAR_CALL'), callId: z.string(), note: z.string().max(500).optional() }),
  z.object({ type: z.literal('ACK_ALARM'), alarmId: z.string() }),
  z.object({ type: z.literal('ENTRY_SCAN'), raw: z.string().max(64), source: z.enum(['MANUAL', 'SCAN']) }),
  z.object({ type: z.literal('TAKE_OFFLINE'), vehicleId: z.string(), reason: z.string().min(1).max(200), notes: z.string().max(500).optional(), responsible: z.string().max(40).optional(), scan: z.string().max(64) }),
  z.object({ type: z.literal('RETURN_TO_LINE'), vehicleId: z.string(), note: z.string().max(500).optional() }),
  z.object({ type: z.literal('CORRECT_POSITION'), vin: z.string().max(64), toPos: pos, reason: z.string().max(500) }),
  z.object({ type: z.literal('CLEAR_GHOST'), pos, reason: z.string().max(500) }),
  z.object({ type: z.literal('SET_TAKT'), area, sec: z.number().int().min(60).max(3600), reason }),
  z.object({ type: z.literal('SET_WARN_PCT'), pct: z.number().min(0.5).max(0.99), reason }),
  z.object({ type: z.literal('SET_DEFAULT_TARGET'), area, n: z.number().int().min(0).max(500), reason }),
  z.object({ type: z.literal('SET_PLAN'), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), patch: planPatch, reason }),
  z.object({ type: z.literal('SET_SHIFTS'), shifts: z.array(shiftDef).min(1).max(4), reason }),
  z.object({ type: z.literal('SET_BUZZER'), pos, on: z.boolean(), reason }),
  z.object({ type: z.literal('MANUAL_COMPLETE'), pos }),
  z.object({ type: z.literal('RESCAN_ENGINE'), pos }),
  z.object({ type: z.literal('LOG_NOTE'), cat: z.enum(['sim', 'note']), text: z.string().max(500), extra: z.record(z.string(), z.unknown()).optional() }),
]);
/** Settings the simulation console may change directly (not audited plant configuration). */
/** Allowed range of each numeric simulator setting (rates are fractions, times are seconds); the rest are on/off. */
export const SIM_CONFIG_RANGE: Record<string, [number, number]> = { callRate: [0, 0.4], warnPct: [0.5, 0.99], escalateAfter: [30, 1800], blockedAlarmAfter: [30, 1800], delayRate: [0, 0.3] };
export const SIM_CONFIG_KEYS = ['autoFeed', 'autoEntryScan', 'autoExitScan', 'autoComplete', 'autoRespond', 'trimAndon', 'useSchedule', 'engineCheck', 'callRate', 'warnPct', 'escalateAfter', 'blockedAlarmAfter', 'delayRate'] as const;
/** Simulator controls: accepted only when the edge server runs in simulation mode. */
export const SimCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SIM_SPEED'), speed: z.number().min(0.25).max(60) }),
  z.object({ type: z.literal('SIM_RUNNING'), running: z.boolean() }),
  z.object({ type: z.literal('SIM_SKIP'), to: z.number() }),
  z.object({ type: z.literal('SIM_SCENARIO'), n: z.number().int().min(1).max(20) }),
  z.object({ type: z.literal('SIM_PAUSE_AREA'), area, on: z.boolean() }),
  z.object({ type: z.literal('SIM_FAULT_CARRIER'), carrierId: z.string() }),
  z.object({ type: z.literal('SIM_FAULT_SENSOR'), pos }),
  z.object({ type: z.literal('SIM_CLEAR_FAULT'), kind: z.enum(['C', 'P']), id: z.string() }),
  z.object({ type: z.literal('SIM_EMERGENCY'), pos }),
  z.object({ type: z.literal('SIM_CLEAR_EMERGENCY'), pos }),
  z.object({ type: z.literal('SIM_POWER_CUT') }),
  /** Simulator behaviour switches and rates from the simulation console. */
  z.object({ type: z.literal('SIM_CONFIG'), key: z.enum(SIM_CONFIG_KEYS), value: z.union([z.boolean(), z.number().min(0).max(36000)]) })
    .refine((c) => { const r = SIM_CONFIG_RANGE[c.key]; return r ? typeof c.value === 'number' && c.value >= r[0] && c.value <= r[1] : typeof c.value === 'boolean'; }, { message: 'value is outside the range allowed for this setting', path: ['value'] }),
]);
export const Command = z.union([OperatorCommand, SimCommand]);
export type OperatorCommand = z.infer<typeof OperatorCommand>;
export type SimCommand = z.infer<typeof SimCommand>;
export type Command = z.infer<typeof Command>;
export type CommandType = Command['type'];
export const isSimCommand = (c: Command): c is SimCommand => c.type.startsWith('SIM_');

/* ── roles and permissions (URD req 30): shared by the screens and the edge server ── */
export type RoleId = 'admin' | 'authorised' | 'supervisor' | 'maintenance' | 'viewer';
export type Permission = '*' | 'call' | 'respond.SUP' | 'respond.MNT' | 'offline' | 'buzzer' | 'takt' | 'plan' | 'correct' | 'reports' | 'audit' | 'users' | 'sim';
export interface RoleDef { label: string; short: string; home: string; perms: Permission[]; desc: string }
export const ROLES: Record<RoleId, RoleDef> = {
  admin:       { label: 'Administrator', short: 'Admin', home: 'dash', perms: ['*'] as Permission[], desc: 'Everything, including users and the audit log.' },
  authorised:  { label: 'Authorised person', short: 'Authorised', home: 'floor', perms: ['call', 'offline', 'buzzer', 'takt', 'plan', 'correct', 'reports', 'audit'], desc: 'Sets takt, targets and shifts; corrects positions; switches buzzers.' },
  supervisor:  { label: 'Line supervisor', short: 'Supervisor', home: 'floor', perms: ['call', 'respond.SUP', 'offline', 'reports'], desc: 'Responds to and clears supervisor calls; takes units offline.' },
  maintenance: { label: 'Maintenance', short: 'Maintenance', home: 'floor', perms: ['call', 'respond.MNT', 'reports'], desc: 'Responds to and clears maintenance calls.' },
  viewer:      { label: 'View only · management', short: 'View only', home: 'dash', perms: ['reports'], desc: 'Dashboard, line displays, reports and VIN lookup.' },
};
/** Demo accounts (fictional people). Seeded by the edge server in demo mode; used by the offline demo. */
export const DEMO_ACCOUNTS: { id: string; name: string; empId: string; email: string; role: RoleId; pw: string }[] = [
  { id: 'u1', name: 'Hamza Siddiqui', empId: 'MG-1001', email: 'hamza.siddiqui@mgjw.pk', role: 'admin', pw: 'Admin@2026' },
  { id: 'u2', name: 'Ayesha Malik', empId: 'MG-2040', email: 'ayesha.malik@mgjw.pk', role: 'authorised', pw: 'Plan@2026' },
  { id: 'u3', name: 'Usman Tariq', empId: 'MG-3112', email: 'usman.tariq@mgjw.pk', role: 'supervisor', pw: 'Line@2026' },
  { id: 'u4', name: 'Bilal Ahmed', empId: 'MG-4207', email: 'bilal.ahmed@mgjw.pk', role: 'maintenance', pw: 'Fix@2026' },
  { id: 'u5', name: 'Head Office', empId: 'MG-9001', email: 'ho.viewer@mgjw.pk', role: 'viewer', pw: 'View@2026' },
];
export const ROLE_IDS = Object.keys(ROLES) as RoleId[];
export const roleCan = (role: RoleId | undefined | null, perm: Permission) => {
  const P = role && ROLES[role] ? ROLES[role].perms : [];
  return P.includes('*') || P.includes(perm);
};
/** Permission each command needs. Calls are answered by the matching team (respond.SUP / respond.MNT). */
export const COMMAND_PERMISSION: Record<CommandType, Permission | 'respond'> = {
  RAISE_CALL: 'call', ACK_ALARM: 'call', RESPOND_CALL: 'respond', CLEAR_CALL: 'respond',
  TAKE_OFFLINE: 'offline', RETURN_TO_LINE: 'offline', ENTRY_SCAN: 'offline',
  CORRECT_POSITION: 'correct', CLEAR_GHOST: 'correct',
  SET_TAKT: 'takt', SET_WARN_PCT: 'takt', SET_PLAN: 'plan', SET_DEFAULT_TARGET: 'plan', SET_SHIFTS: 'plan', SET_BUZZER: 'buzzer',
  MANUAL_COMPLETE: 'sim', RESCAN_ENGINE: 'sim', LOG_NOTE: 'sim',
  SIM_SPEED: 'sim', SIM_RUNNING: 'sim', SIM_SKIP: 'sim', SIM_SCENARIO: 'sim', SIM_PAUSE_AREA: 'sim', SIM_FAULT_CARRIER: 'sim', SIM_FAULT_SENSOR: 'sim',
  SIM_CLEAR_FAULT: 'sim', SIM_EMERGENCY: 'sim', SIM_CLEAR_EMERGENCY: 'sim', SIM_POWER_CUT: 'sim', SIM_CONFIG: 'sim',
};

/* ── live connection (WS /api/live) ── */
export interface Clock { speed: number; running: boolean; mode: 'simulation' | 'live' | 'shadow' }
export type ServerMessage =
  | { type: 'hello'; server: string; version: string; clock: Clock }
  | { type: 'snapshot'; rev: number; clock: Clock; state: unknown; hints?: Record<string, unknown> }
  | { type: 'patch'; rev: number; clock: Clock; ops: unknown[] }
  | { type: 'result'; id: string; ok: boolean; value?: unknown; error?: string }
  | { type: 'notice'; level: 'info' | 'warn'; text: string };
export const ClientMessage = z.object({ type: z.literal('command'), id: z.string().max(64), command: z.unknown() });
export type ClientMessage = z.infer<typeof ClientMessage>;

/* ── configuration ── */
export interface BreakDef { name: string; start: Seconds; end: Seconds }
export interface ShiftDef { name: string; start: Seconds; end: Seconds; breaks: BreakDef[] }
export interface PlanPatch { targets?: Partial<Record<AreaId, number>>; shifts?: ShiftDef[]; note?: string }

/* ── state ── */
export interface Occupancy {
  carrierId: CarrierId; vehicleId: VehicleId | null; arriveT: Seconds;
  workT: Seconds; waitT: Seconds; pausedT: Seconds; plannedT: Seconds; required: Seconds;
  completeT: Seconds | null; completeBy: string | null; unloadUntil: Seconds | null; pendingBody: VehicleId | null;
}
export interface PositionState { id: PositionId; carrierId: CarrierId | null; reservedBy: CarrierId | null; fault: unknown; occ: Occupancy | null }
export interface Segment {
  pos: PositionId; arriveT: Seconds; completeT: Seconds | null; departT: Seconds | null;
  work: Seconds; wait: Seconds; paused: Seconds; planned: Seconds; cycle: Seconds | null; target: Seconds; credited: boolean; end: string | null;
}
export type VehicleState = 'IN_PROCESS' | 'AWAITING_LINE_OFF' | 'LINED_OFF' | 'OFF_LINE' | 'RETURN_QUEUED' | 'RETURNING';
export interface Vehicle {
  id: VehicleId; vin: string; variant: { code: string; name: string; model: string; [k: string]: unknown };
  paint: { name: string; hex: string }; carrierId: CarrierId | null; state: VehicleState; posId: PositionId | null;
  entryT: Seconds; lineOffT: Seconds | null; totalDur: Seconds | null; segments: Segment[];
  done: Record<PositionId, boolean>; credited: Record<PositionId, boolean>;
  offline: OfflineRecord | null; offlines: OfflineRecord[]; returns: unknown[]; returnReq: { pos: PositionId; [k: string]: unknown } | null;
  source: string; [k: string]: unknown;
}
export interface OfflineRecord { t: Seconds; pos: PositionId; area: AreaId; reason: string; by: string; [k: string]: unknown }
export interface Carrier {
  id: CarrierId; loop: AreaId; kind: string; posId: PositionId | null; vehicleId: VehicleId | null;
  mode: 'BUFFER' | 'POS' | 'TRANSIT' | 'RETURN' | 'FEED'; transit: { from: string; to: string; t0: Seconds; t1: Seconds; [k: string]: unknown } | null; fault: unknown; cycles: number;
}
export interface Call {
  id: string; pos: PositionId; area: AreaId; type: CallType; raisedT: Seconds; raisedBy: string; vehicleId: VehicleId | null; vin: string | null;
  respondedT: Seconds | null; respondedBy: string | null; clearedT: Seconds | null; clearedBy: string | null; note: string; shiftKey: string; [k: string]: unknown;
}
export interface AuditEntry { t: Seconds; by: string; action: string; target: string; before: unknown; after: unknown; reason: string; [k: string]: unknown }
export interface Downtime { pos: Record<PositionId, Seconds>; line: Partial<Record<AreaId, Seconds>>; cause: Record<PositionId, Seconds> }

/** The rules' state. Fields marked as plant state are written by the simulator or device adapters. */
export interface EngineState {
  seed: number; rngState: number; t: Seconds; rev: number; cfg: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  pos: Record<PositionId, PositionState>;
  carriers: Record<CarrierId, Carrier>;
  vehicles: Record<VehicleId, Vehicle>; vehOrder: VehicleId[];
  calls: Call[]; audit: AuditEntry[]; down: Record<string, Downtime>; buzzing: Record<PositionId, Seconds>;
  shift: { key: string; name: string; [k: string]: unknown } | null; planned: unknown; history: unknown[]; prod: unknown[];
  xfers: { vehicleId: VehicleId; from: PositionId; to: PositionId; t0: Seconds; t1: Seconds }[];
  anims: { id: string; vehicleId: VehicleId; kind: string; t0: Seconds; t1: Seconds; [k: string]: unknown }[];
  recording: boolean;
  stats: { completed: unknown[]; offline: unknown[]; segments: unknown[]; [k: string]: unknown };
  /** Opt-in log of every plant event applied (see apply() in @mg/core). */
  journal?: (PlantEvent & { t: Seconds })[];
  [k: string]: unknown;
}
/** What a screen receives: the state, read-only. From phase 3 it is sent by the edge server. */
export type Snapshot = Readonly<EngineState>;
export * from './devices.ts';
