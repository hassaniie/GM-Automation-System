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
  /** A body moved from one loop's carrier to the next (TL6 → hanger, hanger → FL fixture). */
  | { type: 'BODY_TRANSFERRED'; vehicleId: VehicleId; from: PositionId; to: PositionId }
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
  | { type: 'LINE_OFF'; vin: string; source: ScanSource }
  /** Station call buttons and responders (also available as commands). */
  | { type: 'CALL_RAISED'; pos: PositionId; callType: CallType; by: string; sim?: boolean }
  | { type: 'CALL_RESPONDED'; callId: string; by: string }
  | { type: 'CALL_CLEARED'; callId: string; by: string; note?: string };

export type PlantEventType = PlantEvent['type'];
export const PLANT_EVENT_TYPES = [
  'CARRIER_ARRIVED', 'BODY_TRANSFERRED', 'ENTRY_SCAN', 'UNIT_ENTERED', 'UNIT_RETURNED', 'WORK_COMPLETE',
  'ENGINE_SCAN', 'LINE_OFF', 'CALL_RAISED', 'CALL_RESPONDED', 'CALL_CLEARED',
] as const satisfies readonly PlantEventType[];
export const isPlantEvent = (x: unknown): x is PlantEvent =>
  typeof x === 'object' && x !== null && (PLANT_EVENT_TYPES as readonly string[]).includes((x as { type?: string }).type ?? '');

/* ── commands (what people do on the screens), validated at the edge server ──
   Phase 3: `by` is sent by the client. Phase 4 replaces it with the signed-in user on the server. */
const pos = z.string().min(1).max(8);
const area = z.enum(['TRIM', 'CHASSIS', 'FINAL']);
const by = z.string().min(1).max(120);
const reason = z.string().max(500).optional();
const breakDef = z.object({ name: z.string(), start: z.number(), end: z.number() }).passthrough();
const shiftDef = z.object({ name: z.string(), start: z.number(), end: z.number(), breaks: z.array(breakDef) }).passthrough();

export const OperatorCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('RAISE_CALL'), pos, callType: z.enum(['SUP', 'MNT']), by }),
  z.object({ type: z.literal('RESPOND_CALL'), callId: z.string(), by }),
  z.object({ type: z.literal('CLEAR_CALL'), callId: z.string(), by, note: z.string().max(500).optional() }),
  z.object({ type: z.literal('ACK_ALARM'), alarmId: z.string(), by: by.optional() }),
  z.object({ type: z.literal('ENTRY_SCAN'), raw: z.string().max(64), source: z.enum(['MANUAL', 'SCAN']) }),
  z.object({ type: z.literal('TAKE_OFFLINE'), vehicleId: z.string(), reason: z.string().min(1).max(200), notes: z.string().max(500).optional(), responsible: z.string().max(40).optional(), scan: z.string().max(64), by }),
  z.object({ type: z.literal('RETURN_TO_LINE'), vehicleId: z.string(), by, note: z.string().max(500).optional() }),
  z.object({ type: z.literal('CORRECT_POSITION'), vin: z.string().max(64), toPos: pos, by, reason: z.string().max(500) }),
  z.object({ type: z.literal('CLEAR_GHOST'), pos, by, reason: z.string().max(500) }),
  z.object({ type: z.literal('SET_TAKT'), area, sec: z.number().int().min(60).max(3600), by, reason }),
  z.object({ type: z.literal('SET_WARN_PCT'), pct: z.number().min(0.5).max(0.99), by, reason }),
  z.object({ type: z.literal('SET_DEFAULT_TARGET'), area, n: z.number().int().min(0).max(500), by, reason }),
  z.object({ type: z.literal('SET_PLAN'), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), patch: z.record(z.string(), z.unknown()), by, reason }),
  z.object({ type: z.literal('SET_SHIFTS'), shifts: z.array(shiftDef).min(1).max(4), by, reason }),
  z.object({ type: z.literal('SET_BUZZER'), pos, on: z.boolean(), by, reason }),
  z.object({ type: z.literal('MANUAL_COMPLETE'), pos }),
  z.object({ type: z.literal('RESCAN_ENGINE'), pos }),
  z.object({ type: z.literal('LOG_NOTE'), cat: z.enum(['sim', 'note']), text: z.string().max(500), extra: z.record(z.string(), z.unknown()).optional() }),
]);
/** Settings the simulation console may change directly (not audited plant configuration). */
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
  z.object({ type: z.literal('SIM_CONFIG'), key: z.enum(SIM_CONFIG_KEYS), value: z.union([z.boolean(), z.number().min(0).max(36000)]) }),
]);
export const Command = z.union([OperatorCommand, SimCommand]);
export type OperatorCommand = z.infer<typeof OperatorCommand>;
export type SimCommand = z.infer<typeof SimCommand>;
export type Command = z.infer<typeof Command>;
export type CommandType = Command['type'];
export const isSimCommand = (c: Command): c is SimCommand => c.type.startsWith('SIM_');

/* ── live connection (WS /api/live) ── */
export interface Clock { speed: number; running: boolean; mode: 'simulation' | 'live' }
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
  /** Opt-in log of every plant event applied (see apply() in @mg/core). */
  journal?: (PlantEvent & { t: Seconds })[];
  [k: string]: unknown;
}
/** What a screen receives: the state, read-only. From phase 3 it is sent by the edge server. */
export type Snapshot = Readonly<EngineState>;
