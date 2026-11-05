/* ════════════════════════════════════════════════════════════════════════
   MG GA OPERATIONS — SIMULATION ENGINE v2
   Line flow confirmed by the plant: paint-shop buffer → Trim conveyor TL1–TL5
   → TL6 (load onto one of 4 hangers) → CL1 → CL2 → CL3 → Buffer → CL4 → FL1
   (lower onto conveyor) → Final conveyor FL2–FL7 → line-off. Empty hangers
   return FL1 → TL6 on a separate rail. Units with fitment issues or excess time are
   taken off the line immediately and recorded (no in-shop repair).
   The engine is the only source of truth. Deterministic: seeded PRNG,
   fixed 1-second steps.
   ════════════════════════════════════════════════════════════════════════ */
'use strict';

/* ── utilities ─────────────────────────────────────────────────────────── */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const pad2 = (n) => String(n).padStart(2, '0');
function fmtClock(t, secs = true) {
  let s = Math.floor(t); s = ((s % 86400) + 86400) % 86400;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return secs ? `${pad2(h)}:${pad2(m)}:${pad2(ss)}` : `${pad2(h)}:${pad2(m)}`;
}
function fmtDur(sec) {
  const neg = sec < 0; let s = Math.floor(Math.abs(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const body = h > 0 ? `${h}:${pad2(m)}:${pad2(ss)}` : `${pad2(m)}:${pad2(ss)}`;
  return (neg ? '−' : '') + body;
}
const shortVin = (vin) => (vin ? '…' + vin.slice(-6) : '—');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* VIN: ISO 3779 structure with the North-American check digit (position 9). */
const VIN_TRANSLIT = { A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9 };
const VIN_WEIGHTS = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];
function vinCheckDigit(vin) {
  let sum = 0;
  for (let i = 0; i < 17; i++) { const c = vin[i]; const v = /[0-9]/.test(c) ? +c : VIN_TRANSLIT[c]; sum += (v || 0) * VIN_WEIGHTS[i]; }
  const r = sum % 11; return r === 10 ? 'X' : String(r);
}
function validateVinFormat(raw) {
  const vin = (raw || '').trim().toUpperCase();
  if (vin.length !== 17) return { ok: false, vin, reason: `A VIN has 17 characters; this one has ${vin.length}.` };
  if (/[IOQ]/.test(vin)) return { ok: false, vin, reason: 'VINs never contain I, O or Q. Check for a misread 1 or 0.' };
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return { ok: false, vin, reason: 'Only A–Z (except I, O, Q) and 0–9 are valid VIN characters.' };
  const cd = vinCheckDigit(vin);
  if (vin[8] !== cd) return { ok: false, vin, reason: `Check digit mismatch: position 9 reads “${vin[8]}”, expected “${cd}”. Rescan the label.` };
  return { ok: true, vin };
}

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
const RH = 4.8; // overhead hanger rail height
const RETURN_Y = RH + 1.4; // empty-hanger return rail
const AREAS = {
  TRIM:    { id: 'TRIM', name: 'Trim Line', short: 'Trim', station: 'Station 1' },
  CHASSIS: { id: 'CHASSIS', name: 'Chassis Line', short: 'Chassis', station: 'Station 2' },
  FINAL:   { id: 'FINAL', name: 'Final Line', short: 'Final', station: 'Station 3' },
};
const H_TRIM = 0.62, H_TL6 = 0.9, H_CHASSIS = 1.85, H_FL1 = 0.78, H_FINAL = 0.66, H_BUFFER = 0.5;
const STATION_TARGET = 10 * 60; // default takt: 10:00 on every line (editable per line, URD req 10)
const POSITIONS = [
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
const POS = Object.fromEntries(POSITIONS.map((p, i) => [p.id, { ...p, idx: i }]));
const ROUTE = POSITIONS.map((p) => p.id);
const WORK_POS = ROUTE.filter((id) => POS[id].kind === 'work');
const STATIONS = ROUTE.slice();
const AREA_IDS = ['TRIM', 'CHASSIS', 'FINAL'];
const AREA_STATIONS = Object.fromEntries(AREA_IDS.map((a) => [a, WORK_POS.filter((id) => POS[id].area === a)]));
const AREA_LAST = { TRIM: 'TL6', CHASSIS: 'CL4', FINAL: 'FL7' }; // leaving this station = the unit is complete for that line
const ANDON_AREAS = ['CHASSIS', 'FINAL']; // URD scope; Trim Andon is an expansion preview (cfg.trimAndon)
const OFFLINE_POS = ['TL6', 'FL1', 'FL2', 'FL3', 'FL4', 'FL5', 'FL6', 'FL7']; // URD req 2–3: end of Trim, anywhere on Final
const CALL_TYPES = {
  SUP: { id: 'SUP', label: 'Supervisor', short: 'SUP', level: 'CALL_SUP', role: 'supervisor' },
  MNT: { id: 'MNT', label: 'Maintenance', short: 'MNT', level: 'CALL_MNT', role: 'maintenance' },
};
const LOOPS = {
  TRIM:    { id: 'TRIM', carrier: 'Skid', prefix: 'S', count: 8, positions: ['TL1','TL2','TL3','TL4','TL5'], hidden: true, returnSec: 70, feedSec: 16 },
  CHASSIS: { id: 'CHASSIS', carrier: 'Hanger', prefix: 'H', count: 4, positions: ['TL6','CL1','CL2','CL3','BUF','CL4','FL1'], hidden: false },
  FINAL:   { id: 'FINAL', carrier: 'Fixture', prefix: 'C', count: 9, positions: ['FL2','FL3','FL4','FL5','FL6','FL7'], hidden: true, returnSec: 90, feedSec: 16 },
};
const NEXT = {}; Object.values(LOOPS).forEach((L) => L.positions.forEach((p, i) => (NEXT[p] = L.positions[i + 1] || null)));
const isLoopFirst = (id) => LOOPS[POS[id].loop].positions[0] === id;
const TRANSFERS = [
  { from: 'TL5', to: 'TL6', sec: 50, label: 'Loading onto hanger at TL6' },
  { from: 'FL1', to: 'FL2', sec: 50, label: 'Lowering from hanger onto Final conveyor' },
];
const XFER_FROM = Object.fromEntries(TRANSFERS.map((x) => [x.from, x]));
const XFER_TO = Object.fromEntries(TRANSFERS.map((x) => [x.to, x]));
// Variant change-points ("common line for all variants, with minor change-points").
// None are modelled yet: every variant gets the line's takt at every station.
const VARIANT_DELTA = {};
const targetFor = (posId, v) => (POS[posId].target || 0) + (v && VARIANT_DELTA[posId] ? VARIANT_DELTA[posId](v) : 0);
// POS[*].target mirrors the active takt of each station's line, so every reader shares one source.
function applyTakt(S) { for (const id of WORK_POS) POS[id].target = S.cfg.takt[POS[id].area] || STATION_TARGET; }

/* ── track geometry ── */
function arcPts(cx, cz, r, a0, a1, n = 18) { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); o.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); } return o; }
class Path {
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
const EDGES = {};
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
const HB_X0 = -3.6, HB_PITCH = 5.2, HB_Z = 13.4;
const hangerSlotX = (k) => HB_X0 + k * HB_PITCH;
const hangerReturnPath = (slot) => new Path([[18, 11.5], [16.4, 11.5], ...arcPts(16.4, 13.4, 1.9, -Math.PI / 2, -Math.PI, 6), [hangerSlotX(slot), HB_Z]]);
const HANGER_FEED_PATH = new Path([[hangerSlotX(0), HB_Z], [-5.1, HB_Z], ...arcPts(-5.1, 11, 2.4, Math.PI / 2, Math.PI, 6), [-9, 11]]);
const LOOP_GEOM = { CHASSIS: { slotX: hangerSlotX, z: HB_Z, ret: hangerReturnPath, feed: HANGER_FEED_PATH } };
// Painted-body buffer from paint shop (6 bodies, from layout).
const BODY_BUFFER = [[-46, 11], [-46, 6.8], [-46, 15.2], [-51, 11], [-51, 6.8], [-51, 15.2]];
const bufferToEntryPath = (slot) => { const [x, z] = BODY_BUFFER[slot]; return new Path([[x, z], [-42.5, z], [-42.5, 11], [-39, 11]]); };
// Off-line hold area for units taken off the line (location assumed).
const OFFLINE_SLOTS = [[-26, -9.5], [-19, -9.5], [-26, -4.5], [-19, -4.5]];
function offlinePath(posId, slot) {
  const p = POS[posId], [sx, sz] = OFFLINE_SLOTS[slot % OFFLINE_SLOTS.length];
  if (p.hang > 1.5) return new Path([[p.x, p.z], [p.x - 2.6, p.z], [-13, p.z], [-13, sz], [sx, sz]]);
  return new Path([[p.x, p.z], [p.x, 2.2], [-13, 2.2], [-13, sz], [sx, sz]]);
}
const STORAGE_PATH = new Path([[54, 11.5], [62, 11.5], [70, 11.5], [80, 11.5]]);

const SPEED_LOADED = 0.3, SPEED_RETURN = 0.55; // m/s, illustrative
const edgeDuration = (key) => Math.round(EDGES[key].len / SPEED_LOADED);

/* MG Pakistan lineup assembled on this line: HS and ZS only (names from mgmotors.com.pk).
   pt = powertrain family used by the CL2 engine/transmission pairing check. Mix shares are assumed. */
const VARIANTS = [
  { code: 'HS-SH',  model: 'HS', name: 'MG HS Super Hybrid',      trim: 'Super Hybrid',  pt: 'PHEV',   ptLabel: 'Plug-in hybrid · 1.5T + 24.7 kWh', vds: 'A34S6', body: 'L', share: 0.14, hybrid: true },
  { code: 'HS-PH',  model: 'HS', name: 'MG HS PHEV',              trim: 'PHEV',          pt: 'PHEV',   ptLabel: 'Plug-in hybrid', vds: 'A34P6', body: 'L', share: 0.10, hybrid: true },
  { code: 'HS-HP',  model: 'HS', name: 'MG HS Hybrid+',           trim: 'Hybrid+',       pt: 'HEV',    ptLabel: 'Hybrid', vds: 'A34H6', body: 'L', share: 0.12, hybrid: true },
  { code: 'HS-P',   model: 'HS', name: 'MG HS Petrol',            trim: 'Petrol',        pt: 'PETROL', ptLabel: '1.5T · 7-speed DCT', vds: 'A3466', body: 'L', share: 0.20, hybrid: false },
  { code: 'ZS-HPX', model: 'ZS', name: 'MG ZS Hybrid+ Excite',    trim: 'Hybrid+ Excite',  pt: 'HEV',  ptLabel: 'Hybrid · 3-speed hybrid transmission', vds: 'A2YH2', body: 'S', share: 0.12, hybrid: true },
  { code: 'ZS-HPE', model: 'ZS', name: 'MG ZS Hybrid+ Essence',   trim: 'Hybrid+ Essence', pt: 'HEV',  ptLabel: 'Hybrid · 3-speed hybrid transmission', vds: 'A2YH4', body: 'S', share: 0.12, hybrid: true },
  { code: 'ZS-V',   model: 'ZS', name: 'MG ZS Vibe',              trim: 'Vibe',          pt: 'PETROL', ptLabel: 'Petrol', vds: 'A2Y52', body: 'S', share: 0.20, hybrid: false },
];
// Paint names as listed for the HS on mgmotors.com.pk (the ZS page lists only Flare Red; same palette assumed).
const PAINTS = [
  { name: 'York White', hex: '#e4e6e8' }, { name: 'Black Pearl', hex: '#1b1d20' }, { name: 'Clever Grey', hex: '#5d646b' },
  { name: 'Cashmere Silver', hex: '#b2b6b9' }, { name: 'Flare Red', hex: '#a81c22' },
];
const OFFLINE_REASONS = ['Exceeded cycle time (fast-mode take-out)', 'Part fitment issue', 'Missing or wrong-spec part', 'Quality defect found at station', 'Body damage', 'Electrical fault', 'Other (see notes)'];

/* Build sequence: which components each station installs. */
const BUILD = [
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
const buildFor = (v) => BUILD.filter((b) => !b.when || b.when(v));

/* Shift pattern (assumed; the plant enters its own in Settings). Times are seconds from midnight. */
const H = 3600;
const DEFAULT_SHIFTS = [
  { name: 'Shift A', start: 6 * H, end: 14.5 * H, breaks: [{ start: 8.5 * H, end: 8.5 * H + 600, label: 'Tea break' }, { start: 11.5 * H, end: 12 * H, label: 'Lunch & prayer' }] },
  { name: 'Shift B', start: 14.5 * H, end: 23 * H, breaks: [{ start: 17 * H, end: 17 * H + 600, label: 'Tea break' }, { start: 19.5 * H, end: 20 * H, label: 'Dinner & prayer' }] },
];
const DEFAULT_CFG = {
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

/* ── state ─────────────────────────────────────────────────────────────── */
function createState(seed = 7, cfg = {}) {
  const S = {
    seed, rng: mulberry32(seed), t: -2 * 3600, rev: 0, cfg: { ...DEFAULT_CFG, ...cfg },
    pos: {}, carriers: {}, loopBuf: { TRIM: [], CHASSIS: [], FINAL: [] }, vehicles: {}, vehOrder: [],
    bodyBuffer: [null, null, null, null, null, null], offlineBay: [], emergency: { TRIM: [], CHASSIS: [], FINAL: [] }, paused: { TRIM: false, CHASSIS: false, FINAL: false },
    alarms: [], alarmByKey: {}, events: [], scans: [], anims: [], xfers: [],
    stats: { completed: [], offline: [], segments: [], block: {}, overdue: {}, assist: 0, emergency: 0, quality: 0 },
    vinSerial: 248101 + (seed % 97) * 10, engSerial: 51200 + (seed % 89) * 7, nextFeedT: -2 * 3600 + 30, nextId: 1,
    holdExit: {}, recording: true, forceMismatch: {},
    // Andon
    shift: null, planned: null, shiftCheckT: -Infinity, history: [],
    prod: [], calls: [], audit: [], down: {}, buzzing: {}, returnQueue: [], lastEntryT: -Infinity,
  };
  S.cfg.takt = { ...DEFAULT_CFG.takt, ...(cfg.takt || {}) };
  S.cfg.targets = { ...DEFAULT_CFG.targets, ...(cfg.targets || {}) };
  S.cfg.buzzer = { ...DEFAULT_CFG.buzzer, ...(cfg.buzzer || {}) };
  applyTakt(S);
  ROUTE.forEach((id) => (S.pos[id] = { id, carrierId: null, reservedBy: null, fault: null, occ: null }));
  Object.values(LOOPS).forEach((L) => {
    for (let i = 1; i <= L.count; i++) {
      const id = L.carrier === 'Hanger' ? `${L.prefix}${i}` : `${L.prefix}-${pad2(i)}`;
      S.carriers[id] = { id, loop: L.id, kind: L.carrier, posId: null, vehicleId: null, mode: 'BUFFER', transit: null, fault: null, cycles: 0 };
      S.loopBuf[L.id].push(id);
    }
  });
  return S;
}
const uid = (S, p) => `${p}${S.nextId++}`;
function logEvent(S, cat, text, extra = {}) {
  const ev = { id: uid(S, 'ev'), t: S.t, cat, text, ...extra };
  S.events.push(ev); if (S.events.length > 900) S.events.splice(0, S.events.length - 900);
  if (extra.vehicleId && S.vehicles[extra.vehicleId]) { const v = S.vehicles[extra.vehicleId]; v.history.push({ t: S.t, cat, text }); if (v.history.length > 90) v.history.shift(); }
  Integration.publish(ev);
  return ev;
}

/* ── integration boundary ─────────────────────────────────────────────────
   In SIMULATION nothing leaves the browser. A production adapter would
   ingest PLC / scanner / sensor telemetry into the engine and publish these
   events to MES. Motion authorization is never issued from here.        */
const Integration = {
  mode: 'SIMULATION', subscribers: [], requests: [],
  publish(ev) { for (const fn of this.subscribers) { try { fn(ev); } catch (e) { /* never break the sim */ } } },
  request(S, kind, payload) { const r = { t: S.t, kind, payload, mode: this.mode, note: 'Recorded only — no PLC connection' }; this.requests.push(r); if (this.requests.length > 200) this.requests.shift(); return r; },
};

/* ── vehicles & VINs ───────────────────────────────────────────────────── */
function pickVariant(serial, seed) { const u = hash01('variant' + serial + seed); let acc = 0; for (const v of VARIANTS) { acc += v.share; if (u < acc) return v; } return VARIANTS[0]; }
function makeVin(S) {
  const serial = S.vinSerial++, variant = pickVariant(serial, S.seed);
  const body = 'LSJ' + variant.vds + '0' + 'T' + 'P' + String(serial).padStart(6, '0');
  return { vin: body.slice(0, 8) + vinCheckDigit(body) + body.slice(9), variant };
}
function variantFromVin(vin) { return VARIANTS.find((v) => vin.slice(3, 8) === v.vds) || { code: 'UNK', name: `Unrecognised variant (VDS ${vin.slice(3, 8)})`, body: 'L', hybrid: false, model: '?', trim: '—', pt: 'PETROL', ptLabel: 'Unknown' }; }
function findVehicleByVin(S, vin) { for (const id of S.vehOrder) if (S.vehicles[id].vin === vin) return S.vehicles[id]; return null; }
const ACTIVE_STATES = ['IN_PROCESS', 'AWAITING_LINE_OFF'];
const isActive = (v) => v && ACTIVE_STATES.includes(v.state);
function requiredFor(S, v, posId) {
  const p = POS[posId];
  if (p.kind !== 'work') return p.handling || 0;
  if (v.credited[posId]) return 90;
  const tgt = targetFor(posId, v);
  if (S.pendingDelay && S.pendingDelay.pos === posId) { const d = S.pendingDelay; S.pendingDelay = null; return tgt + d.extra; }
  const u2 = hash01(v.vin + posId + 'd');
  if (u2 < S.cfg.delayRate) return Math.round(tgt * 1.15);
  return Math.round(tgt * S.cfg.workPct); // fixed work content, no random spread
}

/* ── paint-shop feed into the body buffer ── */
function feedBuffer(S) {
  const free = S.bodyBuffer.findIndex((b) => !b); if (free < 0) return false;
  const { vin, variant } = makeVin(S);
  const paint = PAINTS[Math.floor(hash01(vin + 'paint') * PAINTS.length)];
  S.bodyBuffer[free] = { id: uid(S, 'b'), label: vin, variant, paint, t: S.t };
  return true;
}
const bufferHead = (S) => { let best = -1; S.bodyBuffer.forEach((b, i) => { if (b && (best < 0 || b.t < S.bodyBuffer[best].t)) best = i; }); return best; };

/* ── Scanner 1: Trim entry ── */
function entryScan(S, raw, source = 'MANUAL') {
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
  const head = bufferHead(S);
  if (head < 0) return res(false, 'No body is waiting in the paint-shop buffer, so there is nothing to register.');
  const E = S.pos['TL1'];
  if (!E.carrierId || E.occ.vehicleId || E.occ.pendingBody) return res(false, E.carrierId ? 'TL1 is occupied. Wait for the body ahead to move on to TL2.' : 'No empty skid at TL1 yet. Wait for the returning skid.');
  if (S.carriers[E.carrierId].fault) return res(false, `Skid ${E.carrierId} is in fault.`);
  const body = S.bodyBuffer[head]; S.bodyBuffer[head] = null;
  const variant = variantFromVin(fmt.vin);
  const v = {
    id: uid(S, 'v'), vin: fmt.vin, variant, paint: body.paint, carrierId: null, state: 'IN_PROCESS', posId: 'TL1',
    entryT: S.t, lineOffT: null, totalDur: null, segments: [], done: {}, credited: {}, history: [],
    offline: null, offlines: [], returns: [], returnReq: null, source, engine: null,
  };
  S.vehicles[v.id] = v; S.vehOrder.push(v.id); S.lastEntryT = S.t;
  E.occ.pendingBody = v.id;
  S.anims.push({ id: uid(S, 'an'), vehicleId: v.id, kind: 'entry', t0: S.t, t1: S.t + 30, path: bufferToEntryPath(head), y0: H_BUFFER, y1: H_TRIM });
  logEvent(S, 'scan', `Scanner 1 accepted ${v.vin} · ${variant.name} · ${body.paint.name}. Line-in recorded; assembly timer started.`, { vehicleId: v.id, pos: 'TL1' });
  return res(true, `Registered ${variant.name}. Assembly timer started at ${fmtClock(S.t)}.`, { vehicleId: v.id });
}
function finishEntry(S, v) {
  const E = S.pos['TL1'];
  if (!E.occ || E.occ.pendingBody !== v.id) return;
  E.occ.pendingBody = null;
  const c = S.carriers[E.carrierId]; c.vehicleId = v.id; v.carrierId = c.id;
  startOcc(S, 'TL1', c.id, v.id);
}

/* ── Line-off at FL7: detected by the end-of-line photo-eye (URD §6: no scan is planned there).
   The VIN comes from tracking, not from a scan; the detection is still recorded for traceability. ── */
function exitScan(S, raw, source = 'PHOTO_EYE') {
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
  logEvent(S, 'scan', `End-of-line photo-eye · ${v.vin} completed. Lined off after ${fmtDur(v.totalDur)}.`, { vehicleId: v.id, pos: 'FL7' });
  resolveAlarmsFor(S, (a) => a.vehicleId === v.id, 'Vehicle lined off');
  return res(true, `Completion recorded. Total assembly time ${fmtDur(v.totalDur)}.`, { vehicleId: v.id, dur: v.totalDur });
}

function locationLabel(S, v) {
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
const dispId = (id) => id;

/* ── occupancy & segments ── */
function startOcc(S, posId, carrierId, vehicleId) {
  const p = S.pos[posId]; p.carrierId = carrierId; p.reservedBy = null;
  const v = vehicleId ? S.vehicles[vehicleId] : null;
  p.occ = { carrierId, vehicleId: vehicleId || null, arriveT: S.t, workT: 0, waitT: 0, pausedT: 0, plannedT: 0, required: v ? requiredFor(S, v, posId) : 0, completeT: null, completeBy: null, unloadUntil: null, pendingBody: null };
  if (!v) { if (!isLoopFirst(posId)) { p.occ.completeT = S.t; p.occ.completeBy = 'PASS'; } return; }
  v.posId = posId;
  v.segments.push({ pos: posId, arriveT: S.t, completeT: null, departT: null, work: 0, wait: 0, paused: 0, planned: 0, cycle: null, target: targetFor(posId, v) || POS[posId].handling || 0, credited: !!v.credited[posId], end: null });
}
function curSeg(v, posId) { for (let i = v.segments.length - 1; i >= 0; i--) if (v.segments[i].pos === posId && v.segments[i].end == null) return v.segments[i]; return null; }
/* Cycle time (URD req 9) = time the vehicle has spent at the station, less planned stops (breaks). */
const occCycle = (S, occ) => (occ ? S.t - occ.arriveT - (occ.plannedT || 0) : 0);
function closeSegment(S, v, posId, t, endReason = 'departed') {
  const seg = curSeg(v, posId); if (!seg) return;
  const occ = S.pos[posId].occ;
  seg.work = occ ? occ.workT : seg.work; seg.wait = occ ? occ.waitT : seg.wait; seg.paused = occ ? occ.pausedT : 0; seg.planned = occ ? occ.plannedT || 0 : 0;
  seg.departT = t; seg.end = endReason; seg.cycle = t - seg.arriveT - seg.planned;
  const area = POS[posId].area, sk = S.shift ? S.shift.key : '';
  if (S.recording && POS[posId].kind === 'work' && endReason === 'departed') {
    S.stats.segments.push({ pos: posId, area, vin: v.vin, t, shiftKey: sk, cycle: seg.cycle, work: seg.work, wait: seg.wait, target: seg.target, over: Math.max(0, seg.cycle - seg.target), overdue: Math.max(0, seg.work - seg.target), credited: seg.credited });
    if (S.stats.segments.length > 8000) S.stats.segments.shift();
  }
  // leaving the last station of a line = one unit completed for that line (URD req 14)
  if (S.recording && endReason === 'departed' && AREA_LAST[area] === posId) {
    S.prod.push({ area, vin: v.vin, vehicleId: v.id, t, shiftKey: sk, returned: v.returns.length > 0 });
    if (S.prod.length > 6000) S.prod.shift();
  }
}
function completeWork(S, posId, by) {
  const p = S.pos[posId], occ = p.occ; if (!occ || occ.completeT != null) return;
  occ.completeT = S.t; occ.completeBy = by;
  const v = occ.vehicleId && S.vehicles[occ.vehicleId];
  if (v) {
    const seg = curSeg(v, posId); if (seg) { seg.completeT = S.t; seg.work = occ.workT; }
    if (POS[posId].kind === 'work') {
      v.done[posId] = true;
      const tgt = targetFor(posId, v), over = occ.workT - tgt;
      logEvent(S, over > 0 ? 'alarm' : 'work', `${posId} complete · ${v.vin.slice(-6)} · ${fmtDur(occ.workT)} vs ${fmtDur(tgt)}${over > 0 ? ` (+${fmtDur(over)})` : ''} · ${by === 'MANUAL' ? 'confirmed by team' : 'detected (simulated sensor)'}`, { vehicleId: v.id, pos: posId });
    }
    if (POS[posId].exit) { v.state = 'AWAITING_LINE_OFF'; logEvent(S, 'work', `${v.vin.slice(-6)} finished at ${posId} · driving off past the end-of-line photo-eye`, { vehicleId: v.id, pos: posId }); }
  }
  resolveAlarmsFor(S, (a) => a.type === 'DELAY' && a.pos === posId && a.vehicleId === occ.vehicleId, `Work confirmed complete after ${fmtDur(occ.workT)}`);
}

/* ── engine / transmission pairing at CL2 (from layout: “Scanning of Engine/Transmission”) ── */
function engineScan(S, v, forceOk = false) {
  const n = S.engSerial++;
  const mism = !forceOk && (S.forceMismatch[v.id] || hash01(v.vin + 'eng' + n) < S.cfg.mismatchRate);
  const expect = v.variant.pt === 'PHEV' ? '15E4E-P' : v.variant.pt === 'HEV' ? '15E4E-H' : '15E4E-T';
  const got = mism ? (expect.endsWith('T') ? '15E4E-H' : '15E4E-T') : expect;
  v.engine = { t: S.t, engineNo: `${got}${String(n).padStart(6, '0')}`, transNo: `${got.endsWith('T') ? '7DCT' : got.endsWith('P') ? 'EDU2' : 'HEV3'}-${String(n * 3 + 11).padStart(6, '0')}`, ok: !mism, expect };
  delete S.forceMismatch[v.id];
  if (mism) {
    raiseOrUpdate(S, `QUAL:CL2:${v.id}`, { type: 'QUALITY', level: 'HOLD', pos: 'CL2', vehicleId: v.id, vin: v.vin, msg: `Engine scan mismatch: ${got}… is not valid for ${v.variant.name} (expects ${expect}…)` });
    if (S.recording) S.stats.quality++;
    logEvent(S, 'exception', `CL2 engine/transmission scan mismatch on ${v.vin.slice(-6)} · quality hold`, { vehicleId: v.id, pos: 'CL2' });
  } else {
    resolveAlarmsFor(S, (a) => a.key === `QUAL:CL2:${v.id}`, 'Correct engine/transmission scanned and paired');
    logEvent(S, 'scan', `CL2 paired engine ${v.engine.engineNo} / transmission ${v.engine.transNo} to ${v.vin.slice(-6)}`, { vehicleId: v.id, pos: 'CL2' });
  }
}

/* ── movement permissives (simulated interlocks) ── */
// A line is stopped by a line stop / emergency (S.paused) or by a planned stop (break, off-shift).
const areaPaused = (S, a) => S.paused[a] || !!S.planned;
function permissives(S, posId) {
  const p = S.pos[posId], occ = p.occ, out = [];
  if (!occ || !p.carrierId) return null;
  const c = S.carriers[p.carrierId], v = occ.vehicleId && S.vehicles[occ.vehicleId], P = POS[posId];
  const xf = XFER_FROM[posId];
  const next = xf ? xf.to : NEXT[posId];
  let workOk = occ.completeT != null && occ.completeT <= S.t, d = '';
  if (P.exit && v && workOk) { workOk = false; d = 'Work done · driving off past the end-of-line photo-eye'; }
  else if (P.exit && !v && occ.unloadUntil && S.t < occ.unloadUntil) { workOk = false; d = `Vehicle driving off · ${fmtDur(occ.unloadUntil - S.t)}`; }
  else if (!v && isLoopFirst(posId)) { workOk = false; d = posId === 'TL1' ? 'Empty skid waiting for the next body (Scanner 1)' : `Empty ${c.kind.toLowerCase()} waiting for a body from ${XFER_TO[posId].from}`; }
  else if (occ.pendingBody) { workOk = false; d = 'Body being placed'; }
  else if (!workOk && v && posId === 'CL2' && v.engine && !v.engine.ok) d = 'Quality hold · engine/transmission mismatch';
  else if (!workOk && occ.completeT != null) d = `Empty ${c.kind.toLowerCase()} releasing in ${fmtDur(occ.completeT - S.t)}`;
  else if (!workOk) d = P.kind === 'work' ? `Team working · ${fmtDur(occ.workT)} of ${fmtDur(targetFor(posId, v))} takt` : `Handling · ${fmtDur(Math.max(0, occ.required - occ.workT))} left`;
  out.push({ key: 'work', ok: workOk, label: P.exit ? 'Completion detected (photo-eye)' : P.kind === 'buffer' ? 'Body settled in buffer' : 'Station work finished', detail: workOk ? (v ? `Detected ${fmtClock(occ.completeT, false)}` : 'Empty carrier (pass-through)') : d });
  if (posId === 'CL2' && v && S.cfg.engineCheck) out.push({ key: 'engine', ok: !!(v.engine && v.engine.ok), label: 'Engine & transmission paired to VIN', detail: !v.engine ? 'Scan pending at CL2' : v.engine.ok ? `${v.engine.engineNo} · ${v.engine.transNo}` : `Mismatch: ${v.engine.engineNo}` });
  out.push({ key: 'carrier', ok: !c.fault, label: `${c.kind} ${c.id} ready`, detail: c.fault ? `${c.fault.code} · ${c.fault.text}` : '' });
  const destP = next && S.pos[next];
  const sf = p.fault || (destP && destP.fault);
  out.push({ key: 'sensors', ok: !sf, label: 'Position sensors confirmed', detail: sf ? `${sf === p.fault ? dispId(posId) : dispId(next)}: ${sf.code} · ${sf.text}` : '' });
  const pa = areaPaused(S, P.area) ? P.area : next && areaPaused(S, POS[next].area) ? POS[next].area : null;
  out.push({ key: 'area', ok: !pa, label: 'No line stop', detail: pa ? (S.planned && !S.paused[pa] ? `Planned stop · ${S.planned.label}` : `${AREAS[pa].name} stopped${S.emergency[pa] && S.emergency[pa].length ? ` · emergency at ${S.emergency[pa].join(', ')}` : ''}`) : '' });
  if (xf) {
    const d2 = S.pos[xf.to], dc = d2.carrierId && S.carriers[d2.carrierId];
    let ok = !!(dc && !d2.occ.vehicleId && !d2.occ.pendingBody && !dc.fault), detail = '', blocker = null;
    if (!dc && d2.reservedBy) detail = `Empty ${LOOPS[POS[xf.to].loop].carrier.toLowerCase()} ${d2.reservedBy} arriving`;
    else if (!dc && LOOPS[POS[xf.to].loop].carrier === 'Hanger') {
      // All 4 hangers are elsewhere: the one furthest along the loop frees first, so it is the blocker.
      const held = LOOPS.CHASSIS.positions.filter((id) => S.pos[id].carrierId).reverse();
      const ret = Object.values(S.carriers).filter((x) => x.loop === 'CHASSIS' && ['RETURN', 'FEED', 'BUFFER'].includes(x.mode)).map((x) => x.id);
      detail = ret.length ? `Hanger ${ret.join(', ')} on the return rail` : `All ${LOOPS.CHASSIS.count} hangers in use · ${held.slice().reverse().map((id) => `${S.pos[id].carrierId} at ${id}`).join(', ')}`;
      if (!ret.length && held.length) blocker = held[0];
    } else if (!dc) detail = `No empty ${LOOPS[POS[xf.to].loop].carrier.toLowerCase()} at ${dispId(xf.to)}`;
    else if (d2.occ.vehicleId) { detail = `${dispId(xf.to)} still holds ${S.vehicles[d2.occ.vehicleId].vin.slice(-6)}`; blocker = NEXT[xf.to] && S.pos[xf.to].carrierId ? xf.to : null; ok = false; }
    else if (dc.fault) detail = `${dc.kind} ${dc.id} fault`;
    if (S.xfers.some((q) => q.from === posId)) { ok = true; detail = 'Transfer in progress'; }
    // a hanger already on its way back is normal flow, not a blockage
    const normal = !ok && !dc && (!!d2.reservedBy || /return rail/.test(detail));
    out.push({ key: 'dest', ok, label: `Empty ${LOOPS[POS[xf.to].loop].carrier.toLowerCase()} ready at ${dispId(xf.to)}`, detail, blocker, normal });
  } else if (next) {
    const dd = S.pos[next]; let ok = !dd.carrierId && !dd.reservedBy, detail = '', blocker = null;
    if (dd.carrierId) { blocker = next; detail = `${dispId(next)} occupied · ${describeOcc(S, next)}`; }
    else if (dd.reservedBy) detail = `${dispId(next)} reserved · ${dd.reservedBy} inbound`;
    out.push({ key: 'dest', ok, label: `Destination ${dispId(next)} free`, detail, blocker });
  } else out.push({ key: 'dest', ok: true, label: 'Carrier return clear', detail: '' });
  if (S.cfg.transferMode === 'indexed' && P.kind === 'work') {
    const ix = indexCheck(S, P.loop);
    out.push({ key: 'sync', ok: ix.ok, label: `${AREAS[P.loop].short} conveyor index ready`, detail: ix.ok ? 'All occupied positions complete' : ix.reason, blockers: ix.blockers });
  }
  return out;
}
function describeOcc(S, posId) {
  const occ = S.pos[posId].occ; if (!occ) return 'empty';
  const v = occ.vehicleId && S.vehicles[occ.vehicleId];
  if (!v) return 'empty carrier';
  if (occ.completeT == null) return POS[posId].kind === 'work' ? `working ${fmtDur(occ.workT)} / ${fmtDur(targetFor(posId, v))}` : 'handling';
  return 'complete, waiting';
}
const workPositionsOf = (loop) => LOOPS[loop].positions.filter((id) => POS[id].kind === 'work');
function indexCheck(S, loop) {
  const ws = workPositionsOf(loop);
  if (ws.some((id) => S.pos[id].reservedBy)) return { ok: false, reason: 'Index in progress', blockers: [] };
  const inc = ws.filter((id) => { const p = S.pos[id]; return p.carrierId && !(p.occ.completeT != null && p.occ.completeT <= S.t); });
  if (inc.length) { const w = inc.slice().sort((a, b) => ratioOf(S, b) - ratioOf(S, a))[0]; return { ok: false, reason: `Waiting for ${inc.join(', ')} (${w}: ${describeOcc(S, w)})`, blockers: inc }; }
  const last = ws[ws.length - 1], o = S.pos[NEXT[last]];
  if (S.pos[last].carrierId && (o.carrierId || o.reservedBy)) return { ok: false, reason: `Outflow ${dispId(NEXT[last])} not free`, blockers: [NEXT[last]] };
  return { ok: true, reason: '', blockers: [] };
}
function ratioOf(S, posId) { const occ = S.pos[posId].occ; if (!occ || POS[posId].kind !== 'work' || !occ.vehicleId) return 0; return occ.workT / targetFor(posId, S.vehicles[occ.vehicleId]); }
const canMove = (S, id, ignore = []) => { const pm = permissives(S, id); return pm && pm.filter((c) => !ignore.includes(c.key)).every((c) => c.ok); };

function startTransit(S, fromId, toId) {
  const p = S.pos[fromId], c = S.carriers[p.carrierId], occ = p.occ, v = occ.vehicleId && S.vehicles[occ.vehicleId];
  if (v) closeSegment(S, v, fromId, S.t);
  const key = `${fromId}>${toId}`;
  c.mode = 'TRANSIT'; c.posId = null; c.transit = { from: fromId, to: toId, t0: S.t, t1: S.t + edgeDuration(key), edge: key };
  p.carrierId = null; p.occ = null; S.pos[toId].reservedBy = c.id;
  resolveAlarmsFor(S, (a) => a.type === 'BLOCKED' && a.pos === fromId, `Moved to ${dispId(toId)}`);
}
function startReturn(S, fromId) {
  const p = S.pos[fromId], c = S.carriers[p.carrierId], L = LOOPS[c.loop];
  c.mode = 'RETURN'; c.posId = null; c.cycles++;
  if (L.hidden) c.transit = { from: fromId, to: 'BUFFER', t0: S.t, t1: S.t + L.returnSec };
  else { const slot = Math.min(4, S.loopBuf[c.loop].length + Object.values(S.carriers).filter((x) => x.loop === c.loop && x.mode === 'RETURN').length); const path = LOOP_GEOM[c.loop].ret(slot); c.transit = { from: fromId, to: 'BUFFER', t0: S.t, t1: S.t + Math.round(path.len / SPEED_RETURN), path, slot }; }
  p.carrierId = null; p.occ = null;
}

/* ── alarms ── */
const SEV = { WARNING: 1, ASSIST: 2, CALL_SUP: 2, CALL_MNT: 2, EMERGENCY: 5, BLOCKED: 2, OVERDUE: 3, FAULT: 3, HOLD: 3, ESCALATED: 4 };
function raiseOrUpdate(S, key, data) {
  let a = S.alarmByKey[key];
  if (a && a.resolvedT == null) {
    if (data.level && data.level !== a.level && SEV[data.level] > SEV[a.level]) {
      a.history.push({ t: S.t, text: `${a.level} → ${data.level}` });
      a.level = data.level; a.levelT = S.t; a.msg = data.msg || a.msg; a.ackT = null; a.ackBy = null;
      logEvent(S, 'alarm', `${data.level} · ${dispId(a.pos)} · ${a.msg}`, { vehicleId: a.vehicleId, pos: a.pos });
    }
    return a;
  }
  a = { id: uid(S, 'al'), key, raisedT: S.t, levelT: S.t, ackT: null, ackBy: null, resolvedT: null, resolution: null, history: [{ t: S.t, text: `Raised as ${data.level}` }], ...data };
  S.alarms.push(a); S.alarmByKey[key] = a;
  if (S.alarms.length > 400) { const old = S.alarms.shift(); if (S.alarmByKey[old.key] === old) delete S.alarmByKey[old.key]; }
  if (data.level !== 'WARNING') logEvent(S, 'alarm', `${data.level} · ${dispId(data.pos)} · ${data.msg}`, { vehicleId: data.vehicleId, pos: data.pos });
  return a;
}
function resolveAlarmsFor(S, pred, resolution) {
  for (const a of S.alarms) if (a.resolvedT == null && pred(a)) {
    a.resolvedT = S.t; a.resolution = resolution; a.history.push({ t: S.t, text: `Resolved · ${resolution}` });
    if (a.level !== 'WARNING') logEvent(S, 'alarm', `Resolved · ${dispId(a.pos)} · ${resolution}`, { vehicleId: a.vehicleId, pos: a.pos });
  }
}
function ackAlarm(S, id, by = 'Supervisor') {
  const a = S.alarms.find((x) => x.id === id); if (!a || a.resolvedT != null || a.ackT != null) return;
  a.ackT = S.t; a.ackBy = by; a.history.push({ t: S.t, text: `Acknowledged by ${by} (condition still open)` });
  logEvent(S, 'alarm', `Acknowledged · ${a.level} · ${dispId(a.pos)} · condition still open`, { vehicleId: a.vehicleId, pos: a.pos });
}
const alarmActive = (a) => a.resolvedT == null;
const alarmUnacked = (a) => a.resolvedT == null && a.ackT == null;
function updateAlarms(S) {
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

/* ── faults, station calls, line stop ── */
function injectCarrierFault(S, cid, code, text) {
  const c = S.carriers[cid]; if (!c || c.fault) return;
  const dflt = c.kind === 'Hanger' ? ['HGR-ENC-214', 'Lift encoder deviation > 8 mm; hanger travel inhibited'] : c.kind === 'Skid' ? ['SKD-LCK-031', 'Skid lock pin not confirmed; conveyor index inhibited'] : ['FIX-POS-118', 'Fixture height out of tolerance; conveyor inhibited'];
  c.fault = { code: code || dflt[0], text: text || dflt[1], t: S.t };
  const pos = c.posId || (c.transit && c.transit.from) || '—', v = c.vehicleId && S.vehicles[c.vehicleId];
  raiseOrUpdate(S, `FAULT:C:${cid}`, { type: 'FAULT', level: 'FAULT', pos, vehicleId: v ? v.id : null, vin: v ? v.vin : null, carrierId: cid, msg: `${c.kind} ${cid} fault · ${c.fault.code}` });
}
function injectSensorFault(S, posId, code = 'PX-2 NO-CONFIRM', text = 'Presence sensor not confirming carrier position') {
  const p = S.pos[posId]; if (!p || p.fault) return;
  p.fault = { code, text, t: S.t };
  const v = p.occ && p.occ.vehicleId && S.vehicles[p.occ.vehicleId];
  raiseOrUpdate(S, `FAULT:P:${posId}`, { type: 'FAULT', level: 'FAULT', pos: posId, vehicleId: v ? v.id : null, vin: v ? v.vin : null, msg: `Sensor fault at ${dispId(posId)} · ${code}` });
}
function clearFault(S, kind, id) {
  if (kind === 'C') { const c = S.carriers[id]; if (!c || !c.fault) return; c.fault = null; resolveAlarmsFor(S, (a) => a.key === `FAULT:C:${id}`, 'Fault cleared (simulation recovery)'); }
  else { const p = S.pos[id]; if (!p || !p.fault) return; p.fault = null; resolveAlarmsFor(S, (a) => a.key === `FAULT:P:${id}`, 'Fault cleared (simulation recovery)'); }
  logEvent(S, 'sim', `SIMULATION · fault recovery on ${id}`, { pos: kind === 'P' ? id : undefined });
}
/* Assist calls (URD req 19–22). Every station has two buttons: Call Supervisor
   and Call Maintenance. A call is raised at the station, responded to (help
   arrived) and cleared by the responder; both durations are recorded.      */
const callsAt = (S, posId) => S.calls.filter((c) => c.pos === posId && c.clearedT == null);
const openCall = (S, posId, type) => S.calls.find((c) => c.pos === posId && c.type === type && c.clearedT == null) || null;
const callAllowedAt = (S, posId) => POS[posId] && POS[posId].kind === 'work' && (ANDON_AREAS.includes(POS[posId].area) || S.cfg.trimAndon);
// sim = raised by the simulated shop floor; only those get simulated responders.
function raiseCall(S, posId, type, by = 'Station button', sim = false) {
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
function respondCall(S, callId, by) {
  const c = S.calls.find((x) => x.id === callId); if (!c || c.respondedT != null || c.clearedT != null) return false;
  c.respondedT = S.t; c.respondedBy = by;
  const a = S.alarmByKey[`CALL:${c.type}:${c.pos}`];
  if (a && a.resolvedT == null) { a.ackT = S.t; a.ackBy = by; a.history.push({ t: S.t, text: `${by} responded after ${fmtDur(S.t - c.raisedT)}` }); }
  logEvent(S, 'call', `${CALL_TYPES[c.type].label} responded at ${dispId(c.pos)} · ${by} · ${fmtDur(S.t - c.raisedT)} after the call`, { pos: c.pos, vehicleId: c.vehicleId });
  return true;
}
function clearCall(S, callId, by, note = '') {
  const c = S.calls.find((x) => x.id === callId); if (!c || c.clearedT != null) return false;
  if (c.respondedT == null) { c.respondedT = S.t; c.respondedBy = by; }
  c.clearedT = S.t; c.clearedBy = by; c.note = note || c.note;
  resolveAlarmsFor(S, (a) => a.key === `CALL:${c.type}:${c.pos}`, `${CALL_TYPES[c.type].label} call cleared by ${by} · help given in ${fmtDur(c.clearedT - c.respondedT)}`);
  return true;
}
const callResponse = (c) => (c.respondedT != null ? c.respondedT - c.raisedT : null);
const callDuration = (c) => (c.clearedT != null ? c.clearedT - c.raisedT : null);
function callEmergency(S, posId) {
  const area = POS[posId].area, occ = S.pos[posId].occ, v = occ && occ.vehicleId && S.vehicles[occ.vehicleId];
  S.emergency[area] = [...new Set([...(S.emergency[area] || []), posId])];
  S.paused[area] = true;
  raiseOrUpdate(S, `EMERG:${posId}`, { type: 'EMERGENCY', level: 'EMERGENCY', pos: posId, vehicleId: v ? v.id : null, vin: v ? v.vin : null, msg: `Emergency call at ${posId} · ${AREAS[area].name} stopped` });
  if (S.recording) S.stats.emergency++;
}
function clearEmergency(S, posId) {
  const area = POS[posId].area;
  S.emergency[area] = (S.emergency[area] || []).filter((x) => x !== posId);
  if (!S.emergency[area].length) S.paused[area] = false;
  resolveAlarmsFor(S, (a) => a.key === `EMERG:${posId}`, `Emergency cleared${S.paused[area] ? '' : ` · ${AREAS[area].name} restarted`}`);
}
const callActive = (S, kind, posId) => { if (CALL_TYPES[kind]) return !!openCall(S, posId, kind); const a = S.alarmByKey[`${kind}:${posId}`]; return !!(a && a.resolvedT == null); };
function setPaused(S, area, on) { S.paused[area] = on; logEvent(S, 'sim', `SIMULATION · ${AREAS[area].name} ${on ? 'stopped (simulated line stop)' : 'restarted'}`); }

/* ── operator actions ── */
function manualComplete(S, posId) {
  const occ = S.pos[posId].occ; if (!occ || !occ.vehicleId || occ.completeT != null) return false;
  const v = S.vehicles[occ.vehicleId];
  if (S.cfg.engineCheck && posId === 'CL2' && !(v.engine && v.engine.ok)) return false;
  completeWork(S, posId, 'MANUAL'); return true;
}
function rescanEngine(S, posId) { const occ = S.pos[posId].occ, v = occ && S.vehicles[occ.vehicleId]; if (v) engineScan(S, v, true); }

/* ── audit trail (URD req 7, 10): every configuration change and correction ── */
function audit(S, by, action, target, before, after, reason = '') {
  const r = { id: uid(S, 'au'), t: S.t, date: dateKeyAt(S, S.t), by: by || 'System', action, target, before, after, reason };
  S.audit.push(r); if (S.audit.length > 2000) S.audit.shift();
  logEvent(S, 'config', `${action} · ${target}: ${before} → ${after} · by ${r.by}${reason ? ` · ${reason}` : ''}`, { pos: POS[target] ? target : undefined });
  return r;
}

/* Taking a unit offline (URD req 2–3, 6): allowed at the end of Trim (TL6) and
   at any Final station. The VIN is scanned there and the station recorded. It
   leaves station counts at once and never counts towards the target unless it
   returns and completes the line. */
function canTakeOffLine(S, vehicleId, force = false) {
  const v = S.vehicles[vehicleId]; if (!v || !isActive(v)) return { ok: false, reason: 'Unit is not in the active line.' };
  const c = v.carrierId && S.carriers[v.carrierId];
  if (!c || c.mode !== 'POS' || S.xfers.some((q) => q.vehicleId === v.id)) return { ok: false, reason: 'Unit is moving. Take it off once it arrives at a station.' };
  if (!force && !OFFLINE_POS.includes(c.posId)) return { ok: false, posId: c.posId, reason: `Offline points are TL6 (end of Trim) and FL1–FL7. ${dispId(c.posId)} is on the ${AREAS[POS[c.posId].area].name}, where units are not taken off.` };
  return { ok: true, posId: c.posId };
}
function takeOffLine(S, vehicleId, { reason, notes, responsible, by, scan, force = false }) {
  const chk = canTakeOffLine(S, vehicleId, force); if (!chk.ok) return chk;
  const v = S.vehicles[vehicleId], posId = chk.posId, occ = S.pos[posId].occ, c = S.carriers[v.carrierId];
  if (!force) {
    const fmt = validateVinFormat(scan);
    const rec = { id: uid(S, 'scan'), t: S.t, scanner: 'OFFLINE', pos: posId, vin: fmt.vin, ok: fmt.ok && fmt.vin === v.vin, source: scan === v.vin ? 'SCAN' : 'MANUAL', vehicleId: v.id };
    rec.reason = !fmt.ok ? fmt.reason : fmt.vin !== v.vin ? `Scanned ${fmt.vin}, but tracking shows ${v.vin} at ${dispId(posId)}. Check the unit, or correct the position first.` : `Offline scan at ${dispId(posId)}`;
    S.scans.push(rec); if (S.scans.length > 300) S.scans.shift();
    if (!rec.ok) { logEvent(S, 'exception', `Offline scan rejected at ${dispId(posId)} · ${rec.reason}`, { pos: posId, vehicleId: v.id }); return { ok: false, reason: rec.reason }; }
  }
  const items = buildFor(v), bs = buildState(S, v);
  const installed = items.filter((b) => (b.key === 'doors' ? bs.doors : bs[b.key]) >= 1).length;
  const tgt = targetFor(posId, v), over = POS[posId].kind === 'work' && occ.completeT == null ? Math.max(0, occ.workT - tgt) : 0;
  closeSegment(S, v, posId, S.t, 'taken off line');
  const cycle = occCycle(S, occ);
  v.offline = { t: S.t, pos: posId, area: POS[posId].area, responsible: responsible || posId, reason, notes, by, workAtStation: occ.workT, cycle, over, inLine: S.t - v.entryT, built: `${installed} / ${items.length}`, carrierId: c.id, scanned: !force, shiftKey: S.shift ? S.shift.key : '' };
  v.offlines.push(v.offline);
  v.state = 'OFF_LINE'; v.carrierId = null; v.posId = null;
  c.vehicleId = null; occ.vehicleId = null; occ.completeT = S.t + 30; occ.completeBy = 'PASS';
  v.offlineSlot = S.offlineBay.length % OFFLINE_SLOTS.length; S.offlineBay.push(v.id);
  S.anims.push({ id: uid(S, 'an'), vehicleId: v.id, kind: 'offline', t0: S.t, t1: S.t + 45, path: offlinePath(posId, v.offlineSlot), y0: POS[posId].hang, y1: 0.36 });
  if (S.recording) S.stats.offline.push({ vin: v.vin, vehicleId: v.id, t: S.t, pos: dispId(posId), area: POS[posId].area, reason, notes, by, variant: v.variant.name, built: v.offline.built, over, cycle, shiftKey: v.offline.shiftKey, returnedT: null });
  resolveAlarmsFor(S, (a) => a.vehicleId === v.id && a.type !== 'FAULT' && a.type !== 'CALL', 'Unit taken off line');
  logEvent(S, 'offline', `Taken offline · ${v.vin} at ${dispId(posId)} · ${reason}${over ? ` · ${fmtDur(over)} over takt` : ''}. Removed from station counts; not counted towards the target. Empty ${c.kind.toLowerCase()} ${c.id} continues.`, { vehicleId: v.id, pos: posId });
  return { ok: true };
}

/* Returning an offlined unit (URD §6): it rejoins at the station it left from,
   once that station is free. Work at that station restarts; it counts towards
   the target only when it completes the line. */
function canReturn(S, vehicleId) {
  const v = S.vehicles[vehicleId];
  if (!v || v.state !== 'OFF_LINE') return { ok: false, reason: v && (v.state === 'RETURN_QUEUED' || v.state === 'RETURNING') ? 'Already returning to the line.' : 'Only offlined units can return to the line.' };
  if (S.anims.some((a) => a.vehicleId === v.id)) return { ok: false, reason: 'The unit is still moving to the offline area.' };
  return { ok: true, pos: v.offline.pos };
}
function returnToLine(S, vehicleId, by, note = '') {
  const chk = canReturn(S, vehicleId); if (!chk.ok) return chk;
  const v = S.vehicles[vehicleId];
  v.state = 'RETURN_QUEUED'; v.returnReq = { t: S.t, by, pos: chk.pos, note };
  S.returnQueue.push(v.id);
  logEvent(S, 'offline', `Return to line requested · ${v.vin} → ${dispId(chk.pos)} · by ${by}. It rejoins when the station is free.`, { vehicleId: v.id, pos: chk.pos });
  return { ok: true };
}
function returnSlotReady(S, posId) {
  const p = S.pos[posId];
  if (p.carrierId) {
    const c = S.carriers[p.carrierId];
    return !c.fault && !p.occ.vehicleId && !p.occ.pendingBody && !S.xfers.some((q) => q.to === posId || q.from === posId) ? 'carrier' : null;
  }
  return !p.reservedBy && S.loopBuf[POS[posId].loop].length ? 'feed' : null;
}
function processReturns(S) {
  for (let i = S.returnQueue.length - 1; i >= 0; i--) {
    const v = S.vehicles[S.returnQueue[i]], posId = v.returnReq.pos;
    if (areaPaused(S, POS[posId].area)) continue;
    const how = returnSlotReady(S, posId); if (!how) continue;
    S.returnQueue.splice(i, 1);
    const p = S.pos[posId];
    if (how === 'feed') { const cid = S.loopBuf[POS[posId].loop].shift(), c = S.carriers[cid]; c.mode = 'POS'; c.posId = posId; c.transit = null; startOcc(S, posId, cid, null); }
    p.occ.pendingBody = v.id; p.occ.completeT = null; p.occ.completeBy = null;
    S.offlineBay = S.offlineBay.filter((x) => x !== v.id);
    v.state = 'RETURNING';
    const back = offlinePath(posId, v.offlineSlot || 0);
    S.anims.push({ id: uid(S, 'an'), vehicleId: v.id, kind: 'return', t0: S.t, t1: S.t + 45, path: new Path(back.pts.slice().reverse()), y0: 0.36, y1: POS[posId].hang });
  }
}
function finishReturn(S, v) {
  const posId = v.returnReq.pos, p = S.pos[posId];
  if (!p.occ || p.occ.pendingBody !== v.id) return;
  const c = S.carriers[p.carrierId]; p.occ.pendingBody = null;
  c.vehicleId = v.id; v.carrierId = c.id; v.state = 'IN_PROCESS';
  delete v.done[posId];
  startOcc(S, posId, c.id, v.id);
  const r = { t: S.t, pos: posId, by: v.returnReq.by, requestedT: v.returnReq.t, offlineT: v.offline.t };
  v.returns.push(r);
  const st = S.stats.offline.find((o) => o.vehicleId === v.id && o.returnedT == null); if (st) st.returnedT = S.t;
  logEvent(S, 'offline', `Returned to line · ${v.vin} rejoined at ${dispId(posId)} after ${fmtDur(S.t - v.offline.t)} offline. Work at ${dispId(posId)} restarts; it counts only when it completes.`, { vehicleId: v.id, pos: posId });
}

/* Manual position correction (URD req 7): when tracking gets out of step with
   the line, an authorised user moves a VIN to where it really is. If another
   unit is recorded there, the two are swapped. Every correction is audited. */
function correctPosition(S, vin, toPos, by, reason) {
  const v = findVehicleByVin(S, (vin || '').trim().toUpperCase());
  if (!v) return { ok: false, reason: 'That VIN is not known to the system.' };
  if (!isActive(v)) return { ok: false, reason: `${v.vin} is not on the line (${locationLabel(S, v)}).` };
  if (!reason || !reason.trim()) return { ok: false, reason: 'Give a reason; corrections are audited.' };
  const cA = v.carrierId && S.carriers[v.carrierId];
  if (!cA || cA.mode !== 'POS' || S.xfers.some((q) => q.vehicleId === v.id)) return { ok: false, reason: `${v.vin} is moving. Correct it once it is at a station.` };
  const from = cA.posId, P = S.pos[toPos];
  if (!P) return { ok: false, reason: 'Unknown station.' };
  if (from === toPos) return { ok: false, reason: `${v.vin} is already recorded at ${toPos}.` };
  if (!P.carrierId || P.occ.pendingBody || S.xfers.some((q) => q.to === toPos || q.from === toPos)) return { ok: false, reason: `${toPos} has no ${LOOPS[POS[toPos].loop].carrier.toLowerCase()} standing at it right now, so nothing can be placed there.` };
  const cB = S.carriers[P.carrierId], other = P.occ.vehicleId ? S.vehicles[P.occ.vehicleId] : null;
  const reseat = (veh, posId, carrier) => {
    const seg = curSeg(veh, veh.posId); if (seg) { seg.end = 'corrected'; seg.departT = S.t; }
    const occ = S.pos[posId].occ;
    occ.vehicleId = veh.id; carrier.vehicleId = veh.id; veh.carrierId = carrier.id; veh.posId = posId;
    if (occ.completeBy === 'PASS') { occ.completeT = null; occ.completeBy = null; occ.required = requiredFor(S, veh, posId); }
    veh.segments.push({ pos: posId, arriveT: occ.arriveT, completeT: occ.completeT, departT: null, work: 0, wait: 0, paused: 0, planned: 0, cycle: null, target: targetFor(posId, veh), credited: false, end: null, corrected: true });
  };
  if (other) reseat(other, from, cA);
  else { const o = S.pos[from].occ; o.vehicleId = null; cA.vehicleId = null; const seg = curSeg(v, from); if (seg) { seg.end = 'corrected'; seg.departT = S.t; } if (!isLoopFirst(from)) { o.completeT = S.t; o.completeBy = 'PASS'; } }
  reseat(v, toPos, cB);
  resolveAlarmsFor(S, (a) => (a.vehicleId === v.id || (other && a.vehicleId === other.id)) && (a.type === 'DELAY' || a.type === 'BLOCKED'), 'Position corrected');
  audit(S, by, 'Position corrected', toPos, `${v.vin.slice(-6)} at ${from}${other ? `, ${other.vin.slice(-6)} at ${toPos}` : ''}`, `${v.vin.slice(-6)} at ${toPos}${other ? `, ${other.vin.slice(-6)} at ${from}` : ''}`, reason);
  return { ok: true, swapped: other ? other.vin : null, from };
}
/* A unit the system shows at a station that is not physically there: record it offline, audited. */
function clearGhost(S, posId, by, reason) {
  const occ = S.pos[posId] && S.pos[posId].occ, v = occ && occ.vehicleId && S.vehicles[occ.vehicleId];
  if (!v) return { ok: false, reason: `No unit is recorded at ${posId}.` };
  if (!reason || !reason.trim()) return { ok: false, reason: 'Give a reason; corrections are audited.' };
  const r = takeOffLine(S, v.id, { reason: 'Not found at station (position correction)', notes: reason, by, force: true });
  if (r.ok) audit(S, by, 'Unit removed from station', posId, v.vin.slice(-6), 'offline (not present)', reason);
  return r;
}

/* ── configuration that authorised users change (URD req 10, 13, 15, 18) ── */
function setTakt(S, area, sec, by, reason = '') {
  sec = Math.round(clamp(+sec || 0, 60, 3600)); const before = S.cfg.takt[area];
  if (!AREAS[area] || before === sec) return false;
  S.cfg.takt = { ...S.cfg.takt, [area]: sec }; applyTakt(S);
  audit(S, by, 'Takt time changed', AREAS[area].name, fmtDur(before), fmtDur(sec), reason);
  return true;
}
function setDefaultTarget(S, area, n, by, reason = '') {
  n = Math.round(clamp(+n || 0, 0, 999)); const before = S.cfg.targets[area];
  if (!AREAS[area] || before === n) return false;
  S.cfg.targets = { ...S.cfg.targets, [area]: n };
  if (S.shift && !(S.cfg.calendar[S.shift.date] && S.cfg.calendar[S.shift.date].targets)) S.shift.targets = targetsFor(S, S.shift.date, S.shift.name);
  audit(S, by, 'Default target per shift changed', AREAS[area].name, before, n, reason);
  return true;
}
/* Scheduled plan for a date: targets per shift and line, takt per line, shift pattern. */
function setPlan(S, date, patch, by, reason = '') {
  const before = JSON.stringify(S.cfg.calendar[date] || {});
  const next = { ...(S.cfg.calendar[date] || {}), ...patch };
  Object.keys(next).forEach((k) => next[k] == null && delete next[k]);
  S.cfg.calendar = { ...S.cfg.calendar, [date]: next };
  if (!Object.keys(next).length) { const c = { ...S.cfg.calendar }; delete c[date]; S.cfg.calendar = c; }
  if (S.shift && S.shift.date === date) { S.shift.targets = targetsFor(S, date, S.shift.name); S.shiftCheckT = -Infinity; }
  audit(S, by, 'Production plan scheduled', date, summarizePlan(JSON.parse(before)), summarizePlan(next), reason);
  return true;
}
function summarizePlan(p) {
  const out = [];
  if (p.targets) out.push('targets ' + Object.entries(p.targets).map(([sh, t]) => `${sh}: ${AREA_IDS.map((a) => t[a] != null ? `${AREAS[a].short} ${t[a]}` : '').filter(Boolean).join('/')}`).join('; '));
  if (p.takt) out.push('takt ' + Object.entries(p.takt).map(([a, s]) => `${AREAS[a].short} ${fmtDur(s)}`).join('/'));
  if (p.shifts) out.push(p.shifts.length ? 'shifts ' + p.shifts.map((s) => `${s.name} ${fmtClock(s.start, false)}–${fmtClock(s.end, false)}`).join(', ') : 'no production');
  if (p.note) out.push(`“${p.note}”`);
  return out.join(' · ') || 'default plan';
}
function setShiftPattern(S, shifts, by, reason = '') {
  const fmt = (L) => L.map((s) => `${s.name} ${fmtClock(s.start, false)}–${fmtClock(s.end, false)} (${(s.breaks || []).length} breaks)`).join(', ');
  const before = fmt(S.cfg.shifts);
  S.cfg.shifts = shifts.map((s) => ({ ...s, breaks: (s.breaks || []).slice().sort((a, b) => a.start - b.start) })).sort((a, b) => a.start - b.start);
  S.shiftCheckT = -Infinity;
  audit(S, by, 'Default shift timings changed', 'Shift pattern', before, fmt(S.cfg.shifts), reason);
  return true;
}
function setBuzzer(S, posId, on, by, reason = '') {
  const before = S.cfg.buzzer[posId] !== false;
  if (before === !!on) return false;
  S.cfg.buzzer = { ...S.cfg.buzzer, [posId]: !!on };
  audit(S, by, on ? 'Buzzer switched on' : 'Buzzer switched off', posId, before ? 'on' : 'off', on ? 'on' : 'off', reason);
  return true;
}

/* ── production calendar: shifts, breaks, targets (URD req 13–15) ──────────
   Sim time is seconds from midnight of day 0 (cfg.baseDate). Each date uses
   its scheduled plan when one exists, otherwise the defaults.            */
const DAY = 86400;
const dayOf = (t) => Math.floor(t / DAY);
function dateKeyOf(S, day) { const [y, m, d] = S.cfg.baseDate.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d) + day * DAY * 1000).toISOString().slice(0, 10); }
const dateKeyAt = (S, t) => dateKeyOf(S, dayOf(t));
function dayOfDate(S, date) { const [y, m, d] = S.cfg.baseDate.split('-').map(Number), [y2, m2, d2] = date.split('-').map(Number); return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y, m - 1, d)) / (DAY * 1000)); }
const shiftsFor = (S, date) => (S.cfg.calendar[date] && S.cfg.calendar[date].shifts) || S.cfg.shifts;
function targetsFor(S, date, shiftName) {
  const p = S.cfg.calendar[date], t = p && p.targets && p.targets[shiftName];
  return Object.fromEntries(AREA_IDS.map((a) => [a, t && t[a] != null ? t[a] : S.cfg.targets[a]]));
}
const shiftKey = (date, name) => `${date} · ${name}`;
function shiftAt(S, t) {
  const day = dayOf(t), date = dateKeyOf(S, day), base = day * DAY;
  for (const sh of shiftsFor(S, date)) {
    const start = base + sh.start, end = base + sh.end;
    if (t >= start && t < end) return { key: shiftKey(date, sh.name), date, day, name: sh.name, start, end, breaks: (sh.breaks || []).map((b) => ({ ...b, start: base + b.start, end: base + b.end })) };
  }
  return null;
}
// net productive seconds of a shift between its start and t (breaks excluded)
function netElapsed(sh, t) {
  const e = clamp(t, sh.start, sh.end); let s = e - sh.start;
  for (const b of sh.breaks) s -= Math.max(0, Math.min(e, b.end) - Math.max(sh.start, b.start));
  return Math.max(0, s);
}
function nextBoundary(S, t) {
  let best = Infinity;
  for (const dd of [0, 1]) {
    const day = dayOf(t) + dd, date = dateKeyOf(S, day), base = day * DAY;
    for (const sh of shiftsFor(S, date)) for (const x of [sh.start, sh.end, ...(sh.breaks || []).flatMap((b) => [b.start, b.end])]) if (base + x > t && base + x < best) best = base + x;
  }
  return best === Infinity ? t + DAY : best;
}
function updateShift(S) {
  if (S.t < S.shiftCheckT) return;
  const sh = shiftAt(S, S.t), prev = S.shift;
  const key = sh ? sh.key : `${dateKeyAt(S, S.t)} · off`;
  if (!prev || prev.key !== key) {
    if (prev && prev.name && S.recording) S.history.push(summarizeShift(S, prev));
    if (sh) {
      sh.targets = targetsFor(S, sh.date, sh.name);
      const plan = S.cfg.calendar[sh.date];
      if (plan && plan.takt) for (const [a, sec] of Object.entries(plan.takt)) if (S.cfg.takt[a] !== sec) { const b = S.cfg.takt[a]; S.cfg.takt = { ...S.cfg.takt, [a]: sec }; applyTakt(S); audit(S, 'Schedule', 'Scheduled takt applied', AREAS[a].name, fmtDur(b), fmtDur(sec), `plan for ${sh.date}`); }
      S.shift = sh;
      Object.assign(S.cfg, { shiftName: sh.name, shiftStart: sh.start, shiftEnd: sh.end, shiftTarget: sh.targets.FINAL });
      if (S.recording) logEvent(S, 'shift', `${sh.name} started · ${sh.date} · counts reset · targets ${AREA_IDS.map((a) => `${AREAS[a].short} ${sh.targets[a]}`).join(', ')}`);
    } else {
      S.shift = { key, date: dateKeyAt(S, S.t), day: dayOf(S.t), name: null, start: S.t, end: nextBoundary(S, S.t), breaks: [], targets: { TRIM: 0, CHASSIS: 0, FINAL: 0 } };
      if (S.recording && prev && prev.name) logEvent(S, 'shift', `${prev.name} ended · no production scheduled until ${fmtClock(S.shift.end, false)}`);
    }
  }
  S.shiftCheckT = nextBoundary(S, S.t);
}
function plannedStopAt(S) {
  if (!S.recording || !S.cfg.useSchedule) return null;
  const sh = S.shift; if (!sh || !sh.name) return { kind: 'OFF', label: 'No shift scheduled', until: sh ? sh.end : null };
  const b = sh.breaks.find((x) => S.t >= x.start && S.t < x.end);
  return b ? { kind: 'BREAK', label: b.label || 'Break', until: b.end } : null;
}
function summarizeShift(S, sh) {
  const lines = {};
  for (const a of AREA_IDS) {
    const D = S.down[sh.key] || { pos: {}, line: {} };
    lines[a] = { target: sh.targets[a], done: S.prod.filter((r) => r.shiftKey === sh.key && r.area === a).length, down: D.line[a] || 0 };
  }
  return { key: sh.key, date: sh.date, name: sh.name, start: sh.start, end: sh.end, lines, offline: S.stats.offline.filter((o) => o.shiftKey === sh.key).length, calls: S.calls.filter((c) => c.shiftKey === sh.key).length };
}

/* Bodies are released into Trim at the planned pitch (net shift time ÷ Trim target),
   so the line is paced by the plan rather than flooded from the paint-shop buffer. */
function releasePitch(S) {
  if (S.cfg.releasePitch != null) return S.cfg.releasePitch;
  const sh = S.shift && S.shift.name ? S.shift : shiftAt(S, dayOf(S.t) * DAY + S.cfg.shifts[0].start + 1);
  if (!sh) return 0;
  const tgt = (sh.targets || targetsFor(S, sh.date, sh.name)).TRIM;
  return tgt > 0 ? Math.floor(netElapsed(sh, sh.end) / tgt) : Infinity;
}

/* ── Andon state per station (URD req 12) and the buzzer (req 16–18) ── */
function andonState(S, posId) {
  const p = S.pos[posId], occ = p.occ, P = POS[posId];
  if (P.kind !== 'work' || !occ || !occ.vehicleId) return { state: 'idle', cycle: 0, takt: P.target || 0, ratio: 0, count: occ && occ.pendingBody ? 1 : 0 };
  const v = S.vehicles[occ.vehicleId], takt = targetFor(posId, v), cycle = occCycle(S, occ), ratio = takt ? cycle / takt : 0;
  return { state: ratio >= 1 ? 'over' : ratio >= S.cfg.warnPct ? 'near' : 'normal', cycle, takt, ratio, count: 1, vehicleId: v.id, stopped: areaPaused(S, P.area) };
}
const andonActive = (S, posId) => ANDON_AREAS.includes(POS[posId].area) || !!S.cfg.trimAndon;
const buzzerEnabled = (S, posId) => POS[posId].kind === 'work' && S.cfg.buzzer[posId] !== false;
function buzzerOn(S, posId) {
  if (!buzzerEnabled(S, posId) || S.planned) return false;
  return andonState(S, posId).state === 'over';
}
function stationCount(S, posId) { const o = S.pos[posId].occ; return o ? (o.vehicleId ? 1 : 0) + (o.pendingBody ? 1 : 0) : 0; }
function lineWip(S, area) {
  let n = 0;
  for (const id of ROUTE) if (POS[id].area === area) n += stationCount(S, id) - (S.xfers.some((q) => q.to === id && POS[q.from].area === area) ? 1 : 0);
  for (const c of Object.values(S.carriers)) if (c.mode === 'TRANSIT' && c.vehicleId && POS[c.transit.to].area === area) n++;
  return n;
}
function linePace(S, area) {
  const sh = S.shift || { key: '', targets: {}, breaks: [] }, target = sh.targets[area] || 0;
  const done = S.prod.filter((r) => r.shiftKey === sh.key && r.area === area).length;
  const netTotal = sh.name ? netElapsed(sh, sh.end) : 0, frac = netTotal ? netElapsed(sh, S.t) / netTotal : 0;
  const plan = target * frac, D = S.down[sh.key] || { pos: {}, line: {} };
  return { target, done, remaining: Math.max(0, target - done), plan, delta: done - Math.floor(plan), frac, down: D.line[area] || 0, wip: lineWip(S, area), lastHour: S.prod.filter((r) => r.area === area && r.t > S.t - 3600).length };
}
function lineAndon(S, area) {
  const st = AREA_STATIONS[area].map((id) => andonState(S, id).state);
  const calls = S.calls.filter((c) => c.area === area && c.clearedT == null);
  const stopped = S.paused[area] ? 'STOP' : S.planned ? 'PLANNED' : null;
  return { over: st.filter((x) => x === 'over').length, near: st.filter((x) => x === 'near').length, calls: calls.length, state: stopped || (st.includes('over') ? 'over' : st.includes('near') ? 'near' : 'normal') };
}

/* ── the step ── */
function step(S, dt = 1) {
  S.t += dt; S.rev++;
  const C = S.cfg;
  updateShift(S);
  S.planned = plannedStopAt(S);
  // 1. carrier arrivals, returns, feeds
  for (const c of Object.values(S.carriers)) {
    if (c.mode === 'TRANSIT' && S.t >= c.transit.t1) {
      const { to, from } = c.transit; c.mode = 'POS'; c.posId = to; c.transit = null;
      startOcc(S, to, c.id, c.vehicleId);
      if (c.vehicleId) logEvent(S, 'move', `${S.vehicles[c.vehicleId].vin.slice(-6)} arrived ${dispId(to)} from ${dispId(from)} on ${c.id} · presence confirmed`, { vehicleId: c.vehicleId, pos: to });
    } else if (c.mode === 'RETURN' && S.t >= c.transit.t1) { c.mode = 'BUFFER'; c.transit = null; S.loopBuf[c.loop].push(c.id); }
    else if (c.mode === 'FEED' && S.t >= c.transit.t1) { const first = LOOPS[c.loop].positions[0]; c.mode = 'POS'; c.posId = first; c.transit = null; startOcc(S, first, c.id, null); }
  }
  // 2. body transfers between loops
  for (let i = S.xfers.length - 1; i >= 0; i--) {
    const x = S.xfers[i]; if (S.t < x.t1) continue;
    S.xfers.splice(i, 1);
    const v = S.vehicles[x.vehicleId], U = S.pos[x.from], L = S.pos[x.to];
    const cu = S.carriers[U.carrierId], cl = S.carriers[L.carrierId];
    closeSegment(S, v, x.from, S.t);
    resolveAlarmsFor(S, (al) => al.type === 'BLOCKED' && al.pos === x.from && al.vehicleId === v.id, 'Transferred');
    cu.vehicleId = null; U.occ.vehicleId = null; U.occ.completeT = S.t; U.occ.completeBy = 'PASS';
    L.occ.pendingBody = null; cl.vehicleId = v.id; v.carrierId = cl.id;
    startOcc(S, x.to, cl.id, v.id);
    logEvent(S, 'move', `${v.vin.slice(-6)} transferred ${cu.kind.toLowerCase()} ${cu.id} → ${cl.kind.toLowerCase()} ${cl.id} · ${XFER_FROM[x.from].label}`, { vehicleId: v.id, pos: x.to });
  }
  // 3. animations (vehicles leaving or rejoining the line)
  for (let i = S.anims.length - 1; i >= 0; i--) {
    const a = S.anims[i]; if (S.t < a.t1) continue; S.anims.splice(i, 1);
    if (a.kind === 'entry') finishEntry(S, S.vehicles[a.vehicleId]);
    else if (a.kind === 'return') finishReturn(S, S.vehicles[a.vehicleId]);
  }
  // 4. timers
  for (const id of ROUTE) {
    const p = S.pos[id], occ = p.occ; if (!occ || !occ.vehicleId) continue;
    const v = S.vehicles[occ.vehicleId], P = POS[id];
    if (S.planned) occ.plannedT += dt;
    if (occ.completeT != null) {
      if (S.t > occ.completeT && !S.xfers.some((q) => q.from === id)) occ.waitT += dt;
      if (P.exit && C.autoExitScan && !S.holdExit[v.id] && S.t - occ.completeT >= 30 && !areaPaused(S, P.area)) exitScan(S, v.vin, 'PHOTO_EYE');
      continue;
    }
    if (areaPaused(S, P.area)) { if (!S.planned) occ.pausedT += dt; continue; }
    if (P.kind !== 'work' && (S.carriers[p.carrierId].fault || p.fault)) continue;
    occ.workT += dt;
    if (C.engineCheck) {
      if (id === 'CL2' && !v.engine && occ.workT >= Math.min(120, occ.required * 0.2)) engineScan(S, v);
      if (id === 'CL2' && v.engine && !v.engine.ok && C.autoComplete && S.t - v.engine.t >= (C.qualityFixSec || 300)) { logEvent(S, 'sim', 'SIMULATION · quality team swapped the engine/transmission and rescanned', { vehicleId: v.id, pos: id }); engineScan(S, v, true); }
    }
    // simulated station calls: a few units need a supervisor or maintenance
    if (S.recording && C.callRate > 0 && P.kind === 'work' && occ.workT === 200 && callAllowedAt(S, id)) {
      const u = hash01(v.vin + id + 'call');
      if (u < C.callRate) raiseCall(S, id, u < C.callRate * 0.55 ? 'SUP' : 'MNT', 'Station button', true);
    }
    const holdQ = C.engineCheck && id === 'CL2' && !(v.engine && v.engine.ok);
    if (occ.workT >= occ.required && !holdQ && (P.kind !== 'work' || C.autoComplete)) completeWork(S, id, P.kind === 'work' ? 'TEAM_SIM' : 'AUTO');
  }
  // 4b. simulated responders on the floor
  if (C.autoRespond) for (const c of S.calls) {
    if (c.clearedT != null || c.simRespondAt == null) continue;
    if (c.respondedT == null && S.t >= c.simRespondAt) respondCall(S, c.id, c.type === 'SUP' ? 'Line supervisor (sim)' : 'Maintenance tech (sim)');
    else if (c.respondedT != null && S.t >= c.simClearAt) clearCall(S, c.id, c.respondedBy || 'Responder (sim)');
  }
  if (S.returnQueue.length) processReturns(S);
  // 5. feed empty carriers to each loop's first position
  for (const L of Object.values(LOOPS)) {
    const first = S.pos[L.positions[0]];
    if (first.carrierId || first.reservedBy || !S.loopBuf[L.id].length) continue;
    const cid = S.loopBuf[L.id].shift(), c = S.carriers[cid];
    c.mode = 'FEED';
    c.transit = L.hidden ? { from: 'BUFFER', to: L.positions[0], t0: S.t, t1: S.t + L.feedSec } : { from: 'BUFFER', to: L.positions[0], t0: S.t, t1: S.t + Math.round(LOOP_GEOM[L.id].feed.len / 0.35), path: LOOP_GEOM[L.id].feed };
    first.reservedBy = cid;
  }
  // 6. paint-shop feed and automatic entry scan
  if (C.autoFeed && S.t >= S.nextFeedT && feedBuffer(S)) S.nextFeedT = S.t + Math.round(C.feedMin + S.rng() * (C.feedMax - C.feedMin));
  const E = S.pos['TL1'];
  if (C.autoEntryScan && !areaPaused(S, 'TRIM') && S.t - S.lastEntryT >= releasePitch(S) && E.carrierId && E.occ && !E.occ.vehicleId && !E.occ.pendingBody && !S.carriers[E.carrierId].fault && bufferHead(S) >= 0) {
    const b = S.bodyBuffer[bufferHead(S)]; entryScan(S, b.label, 'SIM_AUTO');
  }
  // 7. transfers between loops, then movement within loops
  for (const x of TRANSFERS) {
    const U = S.pos[x.from];
    if (!U.carrierId || !U.occ.vehicleId || S.xfers.some((q) => q.from === x.from)) continue;
    if (!canMove(S, x.from, ['sync'])) continue;
    const L = S.pos[x.to]; L.occ.pendingBody = U.occ.vehicleId;
    resolveAlarmsFor(S, (a) => a.type === 'BLOCKED' && a.pos === x.from, `${XFER_FROM[x.from].label} started`);
    S.xfers.push({ vehicleId: U.occ.vehicleId, from: x.from, to: x.to, t0: S.t, t1: S.t + x.sec });
  }
  doTransfers(S);
  // 8. analysis + alarms
  S._analysis = analyze(S);
  if (S.recording) for (const [root, list] of Object.entries(S._analysis.impacts)) S.stats.block[dispId(root)] = (S.stats.block[dispId(root)] || 0) + dt * list.length;
  updateAlarms(S);
  // 9. downtime (URD req 11): time a station's unit is over takt; planned stops excluded.
  //    Line downtime = time with at least one station over takt (not the sum).
  //    Cause = the root station from the bottleneck analysis.
  if (S.recording && !S.planned && S.shift) {
    const D = S.down[S.shift.key] || (S.down[S.shift.key] = { pos: {}, line: {}, cause: {} }), any = {};
    for (const id of WORK_POS) {
      const occ = S.pos[id].occ; if (!occ || !occ.vehicleId) continue;
      if (occCycle(S, occ) <= targetFor(id, S.vehicles[occ.vehicleId])) continue;
      D.pos[id] = (D.pos[id] || 0) + dt; any[POS[id].area] = true;
      const an = S._analysis.byPos[id], root = (an && an.root) || id;
      D.cause[root] = (D.cause[root] || 0) + dt;
    }
    for (const a of Object.keys(any)) D.line[a] = (D.line[a] || 0) + dt;
  }
  // 10. buzzers: start when a unit passes takt, stop when it leaves (or the station is switched off)
  for (const id of WORK_POS) {
    const on = buzzerOn(S, id);
    if (on && !S.buzzing[id]) { S.buzzing[id] = S.t; if (S.recording) logEvent(S, 'andon', `Buzzer on at ${id} · unit over takt`, { pos: id, vehicleId: S.pos[id].occ && S.pos[id].occ.vehicleId }); }
    else if (!on && S.buzzing[id] != null) delete S.buzzing[id];
  }
}
function doTransfers(S) {
  // loop ends: empty carriers return
  for (const L of Object.values(LOOPS)) {
    const lastId = L.positions[L.positions.length - 1], last = S.pos[lastId];
    if (!last.carrierId || last.occ.vehicleId || last.occ.pendingBody || S.carriers[last.carrierId].fault) continue;
    if (last.occ.unloadUntil && S.t < last.occ.unloadUntil) continue;
    if (last.occ.completeT == null || S.t < last.occ.completeT) continue;
    startReturn(S, lastId);
  }
  if (S.cfg.transferMode === 'indexed') {
    for (const k of ['FINAL', 'CHASSIS', 'TRIM']) {
      const L = LOOPS[k], ix = indexCheck(S, k); if (!ix.ok) continue;
      const ws = workPositionsOf(k), first = L.positions[0], afterWork = NEXT[ws[ws.length - 1]];
      const movers = [...ws].reverse().filter((id) => S.pos[id].carrierId);
      const feederReady = S.pos[first].carrierId && canMove(S, first, ['dest', 'sync']);
      const all = feederReady ? [...movers, first] : movers;
      if (!all.length || !all.every((id) => canMove(S, id, ['dest', 'sync']))) continue;
      if (S.pos[ws[ws.length - 1]].carrierId && (S.pos[afterWork].carrierId || S.pos[afterWork].reservedBy)) continue;
      for (const id of all) startTransit(S, id, NEXT[id]);
    }
    // positions outside work stretches (exit side) still move independently
    for (const L of Object.values(LOOPS)) for (let i = L.positions.length - 2; i >= 0; i--) {
      const id = L.positions[i]; if (POS[id].kind === 'work' || id === L.positions[0] || XFER_FROM[id]) continue;
      if (S.pos[id].carrierId && canMove(S, id)) startTransit(S, id, NEXT[id]);
    }
    return;
  }
  for (const L of Object.values(LOOPS)) for (let i = L.positions.length - 2; i >= 0; i--) {
    const id = L.positions[i]; if (XFER_FROM[id]) continue;
    if (S.pos[id].carrierId && canMove(S, id)) startTransit(S, id, NEXT[id]);
  }
}

/* ── bottleneck analysis ── */
function analyze(S) {
  const byPos = {}, impacts = {};
  for (const id of ROUTE) {
    const p = S.pos[id], occ = p.occ;
    if (!occ || !occ.vehicleId) continue;
    const pm = permissives(S, id);
    const complete = occ.completeT != null && occ.completeT <= S.t && !S.xfers.some((q) => q.from === id);
    const failed = pm.filter((c) => !c.ok && c.key !== 'work');
    const e = { complete, failed, blocker: null, root: null, cause: null };
    if (complete && failed.length && !POS[id].exit) {
      const own = failed.find((c) => ['carrier', 'area'].includes(c.key) || (c.key === 'sensors' && p.fault));
      if (own) { e.root = id; e.cause = own; }
      else {
        const d = failed.find((c) => c.key === 'dest'), sy = failed.find((c) => c.key === 'sync'), sf = failed.find((c) => c.key === 'sensors');
        if (S.cfg.transferMode === 'indexed' && sy && sy.blockers && sy.blockers.length) e.blocker = sy.blockers.slice().sort((a, b) => ratioOf(S, b) - ratioOf(S, a))[0];
        else if (d && d.blocker) e.blocker = d.blocker;
        else if (sf) { e.root = NEXT[id] || id; }
        e.cause = (S.cfg.transferMode === 'indexed' ? sy || d : d || sy) || sf || failed[0];
      }
    }
    byPos[id] = e;
  }
  const resolveRoot = (id, seen = new Set()) => {
    const e = byPos[id]; if (!e) return id; if (e.root) return e.root;
    if (!e.blocker || seen.has(id)) return id; seen.add(id);
    const b = byPos[e.blocker]; if (!b || !b.complete || (!b.blocker && !b.root)) return e.blocker;
    return resolveRoot(e.blocker, seen);
  };
  for (const id of ROUTE) { const e = byPos[id]; if (!e || !e.complete || !e.cause) continue; if (!e.root) e.root = resolveRoot(id); (impacts[e.root] = impacts[e.root] || []).push(id); }
  const significant = {};
  const exceptional = (id) => ['OVERDUE', 'ESCALATED', 'FAULT', 'PAUSED', 'HOLD'].includes(posStatusRaw(S, id, byPos).code);
  for (const [root, list] of Object.entries(impacts)) {
    if (byPos[root] && byPos[root].cause && byPos[root].cause.normal) continue; // root itself is in normal flow (hanger on its way)
    const l = list.filter((a) => !(byPos[a].cause && byPos[a].cause.normal)).filter((a) => { const w = S.t - S.pos[a].occ.completeT; return (w >= 20 && exceptional(root)) || w >= S.cfg.blockedAlarmAfter || a === root; });
    if (l.length) significant[root] = l;
  }
  return { byPos, impacts, significant };
}

/* ── derived views ── */
function posStatus(S, id) { return posStatusRaw(S, id, S._analysis && S._analysis.byPos); }
function posStatusRaw(S, id, byPos) {
  const p = S.pos[id], occ = p.occ, P = POS[id], an = byPos && byPos[id];
  if (!p.carrierId) {
    if (p.reservedBy) return { code: 'INBOUND', label: `${LOOPS[P.loop].carrier} inbound`, tone: 'transit' };
    if (p.fault) return { code: 'FAULT', label: 'Sensor fault', tone: 'crit' };
    return { code: 'EMPTY', label: 'Empty', tone: 'muted' };
  }
  const c = S.carriers[p.carrierId], v = occ.vehicleId && S.vehicles[occ.vehicleId];
  if (c.fault || p.fault) return { code: 'FAULT', label: c.fault ? `${c.kind} fault` : 'Sensor fault', tone: 'crit' };
  if (S.xfers.some((q) => q.from === id || q.to === id)) return { code: 'TRANSFER', label: 'Transferring', tone: 'transit' };
  if (!v) {
    if (occ.pendingBody) return { code: 'PLACING', label: 'Body arriving', tone: 'transit' };
    if (isLoopFirst(id)) return { code: 'AWAIT', label: `Empty ${c.kind.toLowerCase()} ready`, tone: 'muted' };
    return { code: 'EMPTY_CARRIER', label: `Empty ${c.kind.toLowerCase()}`, tone: 'muted' };
  }
  if (areaPaused(S, P.area) && occ.completeT == null) return { code: 'PAUSED', label: S.paused[P.area] ? 'Line stopped' : `Planned stop · ${S.planned.label}`, tone: 'paused' };
  if (occ.completeT == null) {
    if (P.kind !== 'work') return { code: 'HANDLING', label: 'Handling', tone: 'transit' };
    if (id === 'CL2' && v.engine && !v.engine.ok) return { code: 'HOLD', label: 'Quality hold', tone: 'crit' };
    const tgt = targetFor(id, v), over = occ.workT - tgt;
    if (over >= S.cfg.escalateAfter) return { code: 'ESCALATED', label: 'Escalated delay', tone: 'esc' };
    if (over >= 0) return { code: 'OVERDUE', label: 'Overdue', tone: 'crit' };
    if (occ.workT >= S.cfg.warnPct * tgt) return { code: 'NEAR', label: 'Near target', tone: 'warn' };
    return { code: 'WORKING', label: 'Working', tone: 'text' };
  }
  if (P.exit) return { code: 'SCAN', label: 'Driving off the line', tone: 'text' };
  if (P.kind === 'buffer' && !(an && an.cause && S.t - occ.completeT >= 3)) return { code: 'BUFFERED', label: 'In buffer', tone: 'muted' };
  if (an && an.cause && S.t - occ.completeT >= 3) return { code: 'WAITING', label: 'Waiting for transfer', tone: 'hold' };
  return { code: 'COMPLETE', label: P.kind === 'work' ? 'Work complete' : 'Ready', tone: 'ok' };
}
function stationStatus(S, sid) { return posStatus(S, sid); }
const RANK = { BUFFERED: 1, FAULT: 9, ESCALATED: 8, HOLD: 8, OVERDUE: 7, PAUSED: 6, WAITING: 5, NEAR: 4, TRANSFER: 4, SCAN: 3, WORKING: 3, HANDLING: 3, PLACING: 3, COMPLETE: 2, INBOUND: 1, AWAIT: 1, EMPTY_CARRIER: 1, EMPTY: 0 };
const rankStatus = (s) => RANK[s.code] || 0;
function stationVehicle(S, sid) {
  const o = S.pos[sid].occ; if (o && o.vehicleId) return { v: S.vehicles[o.vehicleId], posId: sid };
  const x = S.xfers.find((q) => q.to === sid); if (x) return { v: S.vehicles[x.vehicleId], posId: x.from };
  return null;
}

/* Build progress per component: 0 = absent, 1 = installed. Doors are on
   from paint, come off at TL1 and go back on at FL2. */
function buildState(S, v) {
  const out = {};
  const here = v.carrierId && S.carriers[v.carrierId] && S.carriers[v.carrierId].posId;
  const occ = here && S.pos[here].occ && S.pos[here].occ.vehicleId === v.id ? S.pos[here].occ : null;
  const prog = (st) => {
    if (v.done[st] || v.credited[st]) return 1;
    if (here === st && occ) { if (occ.completeT != null) return 1; return occ.required > 0 ? clamp(occ.workT / occ.required, 0, 1) : 0; }
    return 0;
  };
  const items = buildFor(v); const byStation = {};
  items.forEach((b) => (byStation[b.st] = byStation[b.st] || []).push(b));
  for (const [st, list] of Object.entries(byStation)) {
    const p = prog(st), n = list.length;
    list.forEach((b, i) => { const a = (i / n) * 0.85 + 0.05, z = ((i + 1) / n) * 0.85 + 0.05; out[b.key] = clamp((p - a) / (z - a), 0, 1); });
  }
  const off = out.doors; const refit = out.doorsRefit;
  out.doorsOn = refit > 0 ? refit : 1 - off;
  if (v.state === 'LINED_OFF') for (const k of Object.keys(out)) out[k] = 1, out.doorsOn = 1;
  return out;
}

// Headline pace = the Final line (vehicles completed off the end of the shop).
function pace(S) { return linePace(S, 'FINAL'); }
function lineStatus(S) {
  const a = S._analysis || { significant: {} };
  const faults = S.alarms.filter((x) => alarmActive(x) && (x.type === 'FAULT' || x.type === 'QUALITY'));
  const roots = Object.keys(a.significant || {});
  const paused = Object.keys(S.paused).filter((k) => S.paused[k]);
  const em = S.alarms.find((x) => alarmActive(x) && x.type === 'EMERGENCY');
  if (em) return { code: 'EMERGENCY', label: `Emergency · ${em.pos}`, tone: 'esc', root: em.pos };
  if (paused.length) return { code: 'STOPPED', label: `${paused.map((k) => AREAS[k].short).join(' + ')} stopped`, tone: 'crit' };
  if (S.planned) return { code: 'PLANNED', label: S.planned.kind === 'OFF' ? 'No shift' : S.planned.label, tone: 'paused' };
  if (faults.length) return { code: faults[0].type === 'QUALITY' ? 'HOLD' : 'INHIBITED', label: faults[0].type === 'QUALITY' ? `Quality hold · ${dispId(faults[0].pos)}` : `Inhibited · ${dispId(faults[0].pos)}`, tone: 'crit', root: faults[0].pos };
  if (roots.length) { const w = roots.sort((x, y) => a.significant[y].length - a.significant[x].length)[0]; return { code: 'CONSTRAINED', label: `Constrained · ${dispId(w)}`, tone: 'warn', root: w }; }
  return { code: 'RUNNING', label: 'Running', tone: 'ok' };
}
function runUntil(S, tEnd, max = 200000) { let n = 0; while (S.t < tEnd && n++ < max) step(S, 1); }
function runWhile(S, pred, maxSec) { const t0 = S.t; while (pred() && S.t - t0 < maxSec) step(S, 1); }

window.MGE = {
  RH, RETURN_Y, AREAS, POS, POSITIONS, ROUTE, NEXT, WORK_POS, STATIONS, LOOPS, TRANSFERS, XFER_FROM, XFER_TO, EDGES, Path,
  hangerReturnPath, HANGER_FEED_PATH, hangerSlotX, HB_Z, LOOP_GEOM, H_TL6, H_FL1, BODY_BUFFER, STORAGE_PATH, OFFLINE_SLOTS, H_TRIM, H_CHASSIS, H_FINAL, H_BUFFER,
  VARIANTS, PAINTS, OFFLINE_REASONS, isLoopFirst, BUILD, buildFor, buildState, DEFAULT_CFG, DEFAULT_SHIFTS, SEV, Integration, targetFor, STATION_TARGET,
  AREA_IDS, AREA_STATIONS, AREA_LAST, ANDON_AREAS, OFFLINE_POS, CALL_TYPES,
  createState, step, runUntil, runWhile, entryScan, exitScan, makeVin, validateVinFormat, vinCheckDigit, bufferHead, feedBuffer,
  permissives, posStatus, stationStatus, stationVehicle, analyze, pace, lineStatus, locationLabel, describeOcc, dispId,
  ackAlarm, alarmActive, alarmUnacked, injectCarrierFault, injectSensorFault, clearFault, callEmergency, clearEmergency, callActive, setPaused,
  manualComplete, rescanEngine, canTakeOffLine, takeOffLine, canReturn, returnToLine,
  // Andon
  raiseCall, respondCall, clearCall, callsAt, openCall, callAllowedAt, callResponse, callDuration,
  andonState, andonActive, buzzerOn, buzzerEnabled, stationCount, lineWip, linePace, lineAndon, occCycle,
  correctPosition, clearGhost, audit, setTakt, setDefaultTarget, setPlan, setShiftPattern, setBuzzer, summarizePlan,
  dateKeyOf, dateKeyAt, dayOf, dayOfDate, shiftsFor, targetsFor, shiftAt, shiftKey, netElapsed, nextBoundary, summarizeShift, areaPaused,
  findVehicleByVin, isActive, logEvent, curSeg, fmtClock, fmtDur, shortVin, clamp, hash01,
};
