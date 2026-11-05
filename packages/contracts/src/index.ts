/* Shared contracts for the Andon system.
   - PlantEvent: what the shop floor reports (simulator today; PLC, scanners, RFID and the FL7 photo-eye in deployment).
   - Command:    what people do on the screens (calls, offline/return, corrections, configuration).
   - EngineState / Snapshot: the state the rules keep and the screens read.
   Types only, plus the list of event types for runtime validation at the device gateway. */

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

/* ── operator commands (served by the API from phase 3) ── */
export type Command =
  | { type: 'RAISE_CALL'; pos: PositionId; callType: CallType }
  | { type: 'RESPOND_CALL'; callId: string }
  | { type: 'CLEAR_CALL'; callId: string; note?: string }
  | { type: 'TAKE_OFFLINE'; vehicleId: VehicleId; reason: string; notes?: string; responsible?: PositionId; scan: string }
  | { type: 'RETURN_TO_LINE'; vehicleId: VehicleId; note?: string }
  | { type: 'CORRECT_POSITION'; vin: string; toPos: PositionId; reason: string }
  | { type: 'CLEAR_GHOST'; pos: PositionId; reason: string }
  | { type: 'SET_TAKT'; area: AreaId; sec: Seconds; reason?: string }
  | { type: 'SET_DEFAULT_TARGET'; area: AreaId; n: number; reason?: string }
  | { type: 'SET_PLAN'; date: string; patch: PlanPatch; reason?: string }
  | { type: 'SET_SHIFTS'; shifts: ShiftDef[]; reason?: string }
  | { type: 'SET_BUZZER'; pos: PositionId; on: boolean; reason?: string }
  | { type: 'ACK_ALARM'; alarmId: string };
/** Every command carries who did it; the server fills this from the signed-in user. */
export type CommandEnvelope = Command & { by: string };

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
  seed: number; t: Seconds; rev: number; cfg: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
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
