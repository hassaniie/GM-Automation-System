/* ── factory configuration ────────────────────────────────────────────────
   Topology confirmed by the plant (2026-10-28):
   TL1–TL5  Trim floor conveyor (body on skids; Scanner 1 at TL1 = line-in)
   TL6      Trim work point AND hanger load point; end of Trim (offline scanner)
   CL1–CL3 → BUFFER → CL4   Chassis on hangers; the buffer is normally empty
   FL1      Final work point on the hanger AND unload onto the Final conveyor
   FL2–FL7  Final floor conveyor; completion at FL7 is detected by an
            end-of-line photo-eye (no scan). Final offline scans at FL1–FL7.
   Exactly 4 hangers. Empty hangers return FL1 → TL6 on a separate upper rail.
   Andon URD (draft 2) scope: Chassis CL1–CL4 and Final FL1–FL7 get buzzers
   and assist calls; Trim is scans + display (full Trim Andon = expansion).
   Coordinates in metres, x east, z south. */
import { clamp } from './util.js';

export const RH = 4.8; // overhead hanger rail height
export const RETURN_Y = RH + 1.4; // empty-hanger return rail
export const AREAS = {
  TRIM:    { id: 'TRIM', name: 'Trim Line', short: 'Trim', station: 'Station 1' },
  CHASSIS: { id: 'CHASSIS', name: 'Chassis Line', short: 'Chassis', station: 'Station 2' },
  FINAL:   { id: 'FINAL', name: 'Final Line', short: 'Final', station: 'Station 3' },
};
export const H_TRIM = 0.62, H_TL6 = 0.9, H_CHASSIS = 1.85, H_FL1 = 0.78, H_FINAL = 0.66, H_BUFFER = 0.5;
export const STATION_TARGET = 10 * 60; // default takt: 10:00 on every line (editable per line, URD req 10)
export const POSITIONS = [
  { id: 'TL1', loop: 'TRIM', area: 'TRIM', kind: 'work', x: -39, z: 11, yaw: 0, hang: H_TRIM, target: STATION_TARGET, op: 'Scanner 1 VIN receive · doors removed · sound deadening', team: 'Trim Team 1', scanner: 'ENTRY' },
  { id: 'TL2', loop: 'TRIM', area: 'TRIM', kind: 'work', x: -33, z: 11, yaw: 0, hang: H_TRIM, target: STATION_TARGET, op: 'Main wiring harness', team: 'Trim Team 2' },
  { id: 'TL3', loop: 'TRIM', area: 'TRIM', kind: 'work', x: -27, z: 11, yaw: 0, hang: H_TRIM, target: STATION_TARGET, op: 'Cockpit / instrument panel (manipulator)', team: 'Trim Team 3' },
  { id: 'TL4', loop: 'TRIM', area: 'TRIM', kind: 'work', x: -21, z: 11, yaw: 0, hang: H_TRIM, target: STATION_TARGET, op: 'Headliner, roof trim & glazing', team: 'Trim Team 4' },
  { id: 'TL5', loop: 'TRIM', area: 'TRIM', kind: 'work', x: -15, z: 11, yaw: 0, hang: H_TRIM, target: STATION_TARGET, op: 'HV battery (battery manipulator) · rear interior trim', team: 'Trim Team 5' },
  { id: 'TL6', loop: 'CHASSIS', area: 'TRIM', kind: 'work', x: -9, z: 11, yaw: 0, hang: H_TL6, target: STATION_TARGET, op: 'Brake & fuel lines, electrical connections · on hanger · end of Trim (offline scanner)', team: 'Trim Team 6', hangerPoint: true, scanner: 'OFFLINE' },
  { id: 'CL1', loop: 'CHASSIS', area: 'CHASSIS', kind: 'work', x: 1, z: -5.5, yaw: Math.PI / 2, hang: H_CHASSIS, target: STATION_TARGET, op: 'Fuel tank, heat shields & underbody lines', team: 'Chassis Team 1', hangerPoint: true },
  { id: 'CL2', loop: 'CHASSIS', area: 'CHASSIS', kind: 'work', x: 1, z: -12, yaw: Math.PI / 2, hang: H_CHASSIS, target: STATION_TARGET, op: 'Engine & transmission marriage', team: 'Chassis Team 2', hangerPoint: true },
  { id: 'CL3', loop: 'CHASSIS', area: 'CHASSIS', kind: 'work', x: 7, z: -21, yaw: 0, hang: H_CHASSIS, target: STATION_TARGET, op: 'Exhaust & drive shafts (new station for higher JPH)', team: 'Chassis Team 3', hangerPoint: true },
  { id: 'BUF', loop: 'CHASSIS', area: 'CHASSIS', kind: 'buffer', x: 13, z: -13, yaw: -Math.PI / 2, hang: H_CHASSIS, handling: 0, label: 'Buffer', op: 'Buffer · holds a loaded hanger when CL4 is busy', team: 'No team (buffer)', hangerPoint: true },
  { id: 'CL4', loop: 'CHASSIS', area: 'CHASSIS', kind: 'work', x: 13, z: -5, yaw: -Math.PI / 2, hang: H_CHASSIS, target: STATION_TARGET, op: 'Suspension modules, axles & brakes', team: 'Chassis Team 4', hangerPoint: true },
  { id: 'FL1', loop: 'CHASSIS', area: 'FINAL', kind: 'work', x: 18, z: 11.5, yaw: 0, hang: H_FL1, target: STATION_TARGET, op: 'Tires & wheels · lower onto Final conveyor', team: 'Final Team 1', hangerPoint: true },
  { id: 'FL2', loop: 'FINAL', area: 'FINAL', kind: 'work', x: 24, z: 11.5, yaw: 0, hang: H_FINAL, target: STATION_TARGET, op: 'Doors refit & door trims', team: 'Final Team 2' },
  { id: 'FL3', loop: 'FINAL', area: 'FINAL', kind: 'work', x: 30, z: 11.5, yaw: 0, hang: H_FINAL, target: STATION_TARGET, op: 'Seats, carpets & interior trim', team: 'Final Team 3' },
  { id: 'FL4', loop: 'FINAL', area: 'FINAL', kind: 'work', x: 36, z: 11.5, yaw: 0, hang: H_FINAL, target: STATION_TARGET, op: 'Bumpers, grille & lamps (lift assist)', team: 'Final Team 4' },
  { id: 'FL5', loop: 'FINAL', area: 'FINAL', kind: 'work', x: 42, z: 11.5, yaw: 0, hang: H_FINAL, target: STATION_TARGET, op: 'Fluid fill: brake fluid, coolant, washer fluid, refrigerant', team: 'Final Team 5' },
  { id: 'FL6', loop: 'FINAL', area: 'FINAL', kind: 'work', x: 48, z: 11.5, yaw: 0, hang: H_FINAL, target: STATION_TARGET, op: 'Wipers, mirrors & badging', team: 'Final Team 6' },
  { id: 'FL7', loop: 'FINAL', area: 'FINAL', kind: 'work', x: 54, z: 11.5, yaw: 0, hang: H_FINAL, target: STATION_TARGET, op: 'Final inspection · line-off (end-of-line photo-eye)', team: 'Final Team 7', exit: true, scanner: 'EOL' },
];
export const POS = Object.fromEntries(POSITIONS.map((p, i) => [p.id, { ...p, idx: i }]));
export const ROUTE = POSITIONS.map((p) => p.id);
export const WORK_POS = ROUTE.filter((id) => POS[id].kind === 'work');
export const STATIONS = ROUTE.slice();
export const AREA_IDS = ['TRIM', 'CHASSIS', 'FINAL'];
export const AREA_STATIONS = Object.fromEntries(AREA_IDS.map((a) => [a, WORK_POS.filter((id) => POS[id].area === a)]));
export const AREA_LAST = { TRIM: 'TL6', CHASSIS: 'CL4', FINAL: 'FL7' }; // leaving this station = the unit is complete for that line
export const ANDON_AREAS = ['CHASSIS', 'FINAL']; // URD scope; Trim Andon is an expansion preview (cfg.trimAndon)
export const OFFLINE_POS = ['TL6', 'FL1', 'FL2', 'FL3', 'FL4', 'FL5', 'FL6', 'FL7']; // URD req 2–3: end of Trim, anywhere on Final
export const CALL_TYPES = {
  SUP: { id: 'SUP', label: 'Supervisor', short: 'SUP', level: 'CALL_SUP', role: 'supervisor' },
  MNT: { id: 'MNT', label: 'Maintenance', short: 'MNT', level: 'CALL_MNT', role: 'maintenance' },
};
export const LOOPS = {
  TRIM:    { id: 'TRIM', carrier: 'Skid', prefix: 'S', count: 8, positions: ['TL1','TL2','TL3','TL4','TL5'], hidden: true, returnSec: 70, feedSec: 16 },
  CHASSIS: { id: 'CHASSIS', carrier: 'Hanger', prefix: 'H', count: 4, positions: ['TL6','CL1','CL2','CL3','BUF','CL4','FL1'], hidden: false },
  FINAL:   { id: 'FINAL', carrier: 'Fixture', prefix: 'C', count: 9, positions: ['FL2','FL3','FL4','FL5','FL6','FL7'], hidden: true, returnSec: 90, feedSec: 16 },
};
export const NEXT = {}; Object.values(LOOPS).forEach((L) => L.positions.forEach((p, i) => (NEXT[p] = L.positions[i + 1] || null)));
export const isLoopFirst = (id) => LOOPS[POS[id].loop].positions[0] === id;
export const TRANSFERS = [
  { from: 'TL5', to: 'TL6', sec: 50, label: 'Loading onto hanger at TL6' },
  { from: 'FL1', to: 'FL2', sec: 50, label: 'Lowering from hanger onto Final conveyor' },
];
export const XFER_FROM = Object.fromEntries(TRANSFERS.map((x) => [x.from, x]));
export const XFER_TO = Object.fromEntries(TRANSFERS.map((x) => [x.to, x]));
// Variant change-points ("common line for all variants, with minor change-points").
// None are modelled yet: every variant gets the line's takt at every station.
const VARIANT_DELTA = {};
export const targetFor = (posId, v) => (POS[posId].target || 0) + (v && VARIANT_DELTA[posId] ? VARIANT_DELTA[posId](v) : 0);
// POS[*].target mirrors the active takt of each station's line, so every reader shares one source.
export function applyTakt(S) { for (const id of WORK_POS) POS[id].target = S.cfg.takt[POS[id].area] || STATION_TARGET; }

/* ── track geometry ── */
function arcPts(cx, cz, r, a0, a1, n = 18) { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); o.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); } return o; }
export class Path {
  constructor(pts) {
    this.pts = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-6);
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(this.pts[i][0] - this.pts[i - 1][0], this.pts[i][1] - this.pts[i - 1][1]));
    this.len = this.cum[this.cum.length - 1];
  }
  at(u) {
    const d = clamp(u, 0, 1) * this.len; let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < d) i++;
    const a = this.pts[i - 1], b = this.pts[i], seg = this.cum[i] - this.cum[i - 1] || 1, f = (d - this.cum[i - 1]) / seg;
    return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, dx: b[0] - a[0], dz: b[1] - a[1] };
  }
}
export const EDGES = {};
(function () {
  const st = (a, b) => new Path([[POS[a].x, POS[a].z], [POS[b].x, POS[b].z]]);
  ['TL1','TL2','TL3','TL4'].forEach((p) => (EDGES[`${p}>${NEXT[p]}`] = st(p, NEXT[p])));
  EDGES['TL6>CL1'] = new Path([[-9, 11], [-3, 11], ...arcPts(-3, 7, 4, Math.PI / 2, 0), [1, -5.5]]);
  EDGES['CL1>CL2'] = st('CL1', 'CL2');
  EDGES['CL2>CL3'] = new Path([[1, -12], ...arcPts(7, -15, 6, Math.PI, 1.5 * Math.PI)]);
  EDGES['CL3>BUF'] = new Path([...arcPts(7, -15, 6, 1.5 * Math.PI, 2 * Math.PI), [13, -13]]);
  EDGES['BUF>CL4'] = st('BUF', 'CL4');
  EDGES['CL4>FL1'] = new Path([[13, -5], [13, 6.5], ...arcPts(18, 6.5, 5, Math.PI, Math.PI / 2)]);
  ['FL2','FL3','FL4','FL5','FL6'].forEach((p) => (EDGES[`${p}>${NEXT[p]}`] = st(p, NEXT[p])));
})();
// Empty hangers: FL1 → up to the return rail → queue → down to TL6.
// Return rail as sketched by the plant: from FL1 it bends outward and runs straight
// along the outside of the chassis U's open side, then bends back into TL6.
export const HB_X0 = -3.6, HB_PITCH = 5.2, HB_Z = 13.4;
export const hangerSlotX = (k) => HB_X0 + k * HB_PITCH;
export const hangerReturnPath = (slot) => new Path([[18, 11.5], [16.4, 11.5], ...arcPts(16.4, 13.4, 1.9, -Math.PI / 2, -Math.PI, 6), [hangerSlotX(slot), HB_Z]]);
export const HANGER_FEED_PATH = new Path([[hangerSlotX(0), HB_Z], [-5.1, HB_Z], ...arcPts(-5.1, 11, 2.4, Math.PI / 2, Math.PI, 6), [-9, 11]]);
export const LOOP_GEOM = { CHASSIS: { slotX: hangerSlotX, z: HB_Z, ret: hangerReturnPath, feed: HANGER_FEED_PATH } };
// Painted-body buffer from paint shop (6 bodies, from layout).
export const BODY_BUFFER = [[-46, 11], [-46, 6.8], [-46, 15.2], [-51, 11], [-51, 6.8], [-51, 15.2]];
export const bufferToEntryPath = (slot) => { const [x, z] = BODY_BUFFER[slot]; return new Path([[x, z], [-42.5, z], [-42.5, 11], [-39, 11]]); };
// Off-line hold area for units taken off the line (location assumed).
export const OFFLINE_SLOTS = [[-26, -9.5], [-19, -9.5], [-26, -4.5], [-19, -4.5]];
export function offlinePath(posId, slot) {
  const p = POS[posId], [sx, sz] = OFFLINE_SLOTS[slot % OFFLINE_SLOTS.length];
  if (p.hang > 1.5) return new Path([[p.x, p.z], [p.x - 2.6, p.z], [-13, p.z], [-13, sz], [sx, sz]]);
  return new Path([[p.x, p.z], [p.x, 2.2], [-13, 2.2], [-13, sz], [sx, sz]]);
}
export const STORAGE_PATH = new Path([[54, 11.5], [62, 11.5], [70, 11.5], [80, 11.5]]);

export const SPEED_LOADED = 0.3, SPEED_RETURN = 0.55; // m/s, illustrative
export const edgeDuration = (key) => Math.round(EDGES[key].len / SPEED_LOADED);

/* MG Pakistan lineup assembled on this line: HS and ZS only (names from mgmotors.com.pk).
   pt = powertrain family used by the CL2 engine/transmission pairing check. Mix shares are assumed. */
export const VARIANTS = [
  { code: 'HS-SH',  model: 'HS', name: 'MG HS Super Hybrid',      trim: 'Super Hybrid',  pt: 'PHEV',   ptLabel: 'Plug-in hybrid · 1.5T + 24.7 kWh', vds: 'A34S6', body: 'L', share: 0.14, hybrid: true },
  { code: 'HS-PH',  model: 'HS', name: 'MG HS PHEV',              trim: 'PHEV',          pt: 'PHEV',   ptLabel: 'Plug-in hybrid', vds: 'A34P6', body: 'L', share: 0.10, hybrid: true },
  { code: 'HS-HP',  model: 'HS', name: 'MG HS Hybrid+',           trim: 'Hybrid+',       pt: 'HEV',    ptLabel: 'Hybrid', vds: 'A34H6', body: 'L', share: 0.12, hybrid: true },
  { code: 'HS-P',   model: 'HS', name: 'MG HS Petrol',            trim: 'Petrol',        pt: 'PETROL', ptLabel: '1.5T · 7-speed DCT', vds: 'A3466', body: 'L', share: 0.20, hybrid: false },
  { code: 'ZS-HPX', model: 'ZS', name: 'MG ZS Hybrid+ Excite',    trim: 'Hybrid+ Excite',  pt: 'HEV',  ptLabel: 'Hybrid · 3-speed hybrid transmission', vds: 'A2YH2', body: 'S', share: 0.12, hybrid: true },
  { code: 'ZS-HPE', model: 'ZS', name: 'MG ZS Hybrid+ Essence',   trim: 'Hybrid+ Essence', pt: 'HEV',  ptLabel: 'Hybrid · 3-speed hybrid transmission', vds: 'A2YH4', body: 'S', share: 0.12, hybrid: true },
  { code: 'ZS-V',   model: 'ZS', name: 'MG ZS Vibe',              trim: 'Vibe',          pt: 'PETROL', ptLabel: 'Petrol', vds: 'A2Y52', body: 'S', share: 0.20, hybrid: false },
];
// Paint names as listed for the HS on mgmotors.com.pk (the ZS page lists only Flare Red; same palette assumed).
export const PAINTS = [
  { name: 'York White', hex: '#e4e6e8' }, { name: 'Black Pearl', hex: '#1b1d20' }, { name: 'Clever Grey', hex: '#5d646b' },
  { name: 'Cashmere Silver', hex: '#b2b6b9' }, { name: 'Flare Red', hex: '#a81c22' },
];
export const OFFLINE_REASONS = ['Exceeded cycle time (fast-mode take-out)', 'Part fitment issue', 'Missing or wrong-spec part', 'Quality defect found at station', 'Body damage', 'Electrical fault', 'Other (see notes)'];

/* Build sequence: which components each station installs. */
export const BUILD = [
  { key: 'doors',      st: 'TL1', label: 'Doors removed for trim (refit at FL2)', remove: true },
  { key: 'deadener',   st: 'TL1', label: 'Sound deadening' },
  { key: 'harness',    st: 'TL2', label: 'Main wiring harness' },
  { key: 'cockpit',    st: 'TL3', label: 'Cockpit / instrument panel' },
  { key: 'headliner',  st: 'TL4', label: 'Headliner & roof trim' },
  { key: 'glass',      st: 'TL4', label: 'Windscreen, rear & quarter glass' },
  { key: 'battery',    st: 'TL5', label: 'HV battery pack', when: (v) => v.variant.hybrid },
  { key: 'parcel',     st: 'TL5', label: 'Rear interior trim & parcel shelf', when: (v) => !v.variant.hybrid },
  { key: 'lines',      st: 'TL6', label: 'Brake & fuel lines, electrical connections' },
  { key: 'tank',       st: 'CL1', label: 'Fuel tank & heat shields' },
  { key: 'powertrain', st: 'CL2', label: 'Engine & transmission' },
  { key: 'exhaust',    st: 'CL3', label: 'Exhaust & drive shafts' },
  { key: 'suspension', st: 'CL4', label: 'Suspension modules, axles & brakes' },
  { key: 'wheels',     st: 'FL1', label: 'Tires & wheels' },
  { key: 'doorsRefit', st: 'FL2', label: 'Doors & door trims' },
  { key: 'seats',      st: 'FL3', label: 'Seats, carpets & interior trim' },
  { key: 'bumpers',    st: 'FL4', label: 'Bumpers & grille' },
  { key: 'lamps',      st: 'FL4', label: 'Head & tail lamps' },
  { key: 'fluids',     st: 'FL5', label: 'Brake fluid, coolant & washer fluid' },
  { key: 'wipers',     st: 'FL6', label: 'Wipers, mirrors & badging' },
  { key: 'badges',     st: 'FL7', label: 'Final inspection' },
];
export const buildFor = (v) => BUILD.filter((b) => !b.when || b.when(v));

/* Shift pattern (assumed; the plant enters its own in Settings). Times are seconds from midnight. */
const H = 3600;
export const DEFAULT_SHIFTS = [
  { name: 'Shift A', start: 6 * H, end: 14.5 * H, breaks: [{ start: 8.5 * H, end: 8.5 * H + 600, label: 'Tea break' }, { start: 11.5 * H, end: 12 * H, label: 'Lunch & prayer' }] },
  { name: 'Shift B', start: 14.5 * H, end: 23 * H, breaks: [{ start: 17 * H, end: 17 * H + 600, label: 'Tea break' }, { start: 19.5 * H, end: 20 * H, label: 'Dinner & prayer' }] },
];
export const DEFAULT_CFG = {
  // derived from the active shift each step (kept for older readers)
  shiftName: 'Shift A', shiftStart: 6 * 3600, shiftEnd: 14.5 * 3600, shiftTarget: 32,
  warnPct: 0.95, workPct: 0.9, escalateAfter: 180, blockedAlarmAfter: 90,
  transferMode: 'independent', autoFeed: true, autoEntryScan: true, autoExitScan: true, autoComplete: true,
  feedMin: 9 * 60, feedMax: 9 * 60, delayRate: 0, mismatchRate: 0,
  // Andon (URD draft 2)
  baseDate: '2026-11-05',            // sim day 0
  takt: { TRIM: STATION_TARGET, CHASSIS: STATION_TARGET, FINAL: STATION_TARGET }, // req 10
  targets: { TRIM: 30, CHASSIS: 30, FINAL: 30 },  // per shift, per line (req 13)
  shifts: DEFAULT_SHIFTS,            // req 15
  calendar: {},                      // 'YYYY-MM-DD' → { shifts?, targets?: {shift:{line:n}}, takt?: {line:sec} } scheduled in advance (req 14, 15)
  buzzer: { TL1: false, TL2: false, TL3: false, TL4: false, TL5: false, TL6: false }, // per-station switch (req 18); Trim is off (outside URD scope)
  trimAndon: true,                   // expansion preview: full tracking & calls on Trim (req 34)
  useSchedule: true,                 // breaks / off-shift stop the line (planned stops)
  engineCheck: false,                // CL2 engine/gearbox pairing scan: future option, outside URD
  callRate: 0.05, autoRespond: true, // simulated station calls and responders
};
