/* ── configuration that authorised users change (URD req 10, 13, 15, 18) ── */
import { audit } from './audit.js';
import { targetsFor } from './calendar.js';
import { AREAS, AREA_IDS, applyTakt } from './plant.js';
import { clamp, fmtClock, fmtDur } from './util.js';

export function setTakt(S, area, sec, by, reason = '') {
  sec = Math.round(clamp(+sec || 0, 60, 3600)); const before = S.cfg.takt[area];
  if (!AREAS[area] || before === sec) return false;
  S.cfg.takt = { ...S.cfg.takt, [area]: sec }; applyTakt(S);
  audit(S, by, 'Takt time changed', AREAS[area].name, fmtDur(before), fmtDur(sec), reason);
  return true;
}
export function setDefaultTarget(S, area, n, by, reason = '') {
  n = Math.round(clamp(+n || 0, 0, 999)); const before = S.cfg.targets[area];
  if (!AREAS[area] || before === n) return false;
  S.cfg.targets = { ...S.cfg.targets, [area]: n };
  if (S.shift && !(S.cfg.calendar[S.shift.date] && S.cfg.calendar[S.shift.date].targets)) S.shift.targets = targetsFor(S, S.shift.date, S.shift.name);
  audit(S, by, 'Default target per shift changed', AREAS[area].name, before, n, reason);
  return true;
}
/* ── validation (audit B3–B5): reject bad input before anything is stored ── */
const isSec = (x) => Number.isFinite(x) && x >= 0 && x <= 86400;
/** Why a shift pattern is not valid, or null. Shifts are same-day (start < end, no crossing midnight). */
export function checkShifts(shifts) {
  if (!Array.isArray(shifts)) return 'Shifts must be a list';
  if (shifts.length > 4) return 'At most four shifts a day';
  const names = new Set();
  for (const s of shifts) {
    if (!s || typeof s.name !== 'string' || !s.name.trim()) return 'Each shift needs a name';
    const n = s.name.trim().toLowerCase();
    if (names.has(n)) return `Two shifts are called “${s.name}”`;
    names.add(n);
    if (!isSec(s.start) || !isSec(s.end)) return `${s.name}: start and end must be times of day`;
    if (s.end <= s.start) return `${s.name} must end after it starts (shifts cannot cross midnight)`;
    if (!Array.isArray(s.breaks || [])) return `${s.name}: breaks must be a list`;
    const br = (s.breaks || []).slice().sort((a, b) => a.start - b.start);
    for (let i = 0; i < br.length; i++) {
      const b = br[i];
      if (!b || !isSec(b.start) || !isSec(b.end) || b.end <= b.start) return `${s.name}: each break must end after it starts`;
      if (b.start < s.start || b.end > s.end) return `${s.name}: “${b.label || 'break'}” is outside the shift`;
      if (i && b.start < br[i - 1].end) return `${s.name}: “${br[i - 1].label || 'break'}” and “${b.label || 'break'}” overlap`;
    }
  }
  const sorted = shifts.slice().sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) if (sorted[i].start < sorted[i - 1].end) return `${sorted[i - 1].name} and ${sorted[i].name} overlap`;
  return null;
}
/** Why a day-plan patch is not valid, or null. Keys: shifts, targets, takt, note; null removes one. */
export function checkPlanPatch(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return 'The plan must be an object';
  for (const k of Object.keys(p)) if (!['shifts', 'targets', 'takt', 'note'].includes(k)) return `Unknown plan field “${k}”`;
  if (p.shifts != null) { const e = checkShifts(p.shifts); if (e) return e; }
  if (p.targets != null) {
    if (typeof p.targets !== 'object' || Array.isArray(p.targets)) return 'Targets must be per shift';
    for (const [sh, t] of Object.entries(p.targets)) {
      if (!t || typeof t !== 'object') return `Targets for ${sh} must be per line`;
      for (const [a, n] of Object.entries(t)) if (!AREAS[a] || !Number.isInteger(n) || n < 0 || n > 999) return `Target for ${sh} · ${a} must be a whole number from 0 to 999`;
    }
  }
  if (p.takt != null) {
    if (typeof p.takt !== 'object' || Array.isArray(p.takt)) return 'Takt must be per line';
    for (const [a, sec] of Object.entries(p.takt)) if (!AREAS[a] || !Number.isFinite(sec) || sec < 60 || sec > 3600) return `Takt for ${a} must be 1 to 60 minutes`;
  }
  if (p.note != null && (typeof p.note !== 'string' || p.note.length > 500)) return 'The note must be text, up to 500 characters';
  return null;
}

/* Scheduled plan for a date: targets per shift and line, takt per line, shift pattern. */
export function setPlan(S, date, patch, by, reason = '') {
  const bad = checkPlanPatch(patch);
  if (bad) throw new Error(bad);
  const before = JSON.stringify(S.cfg.calendar[date] || {});
  const next = { ...(S.cfg.calendar[date] || {}), ...patch };
  Object.keys(next).forEach((k) => next[k] == null && delete next[k]);
  S.cfg.calendar = { ...S.cfg.calendar, [date]: next };
  if (!Object.keys(next).length) { const c = { ...S.cfg.calendar }; delete c[date]; S.cfg.calendar = c; }
  if (S.shift && S.shift.date === date) { S.shift.targets = targetsFor(S, date, S.shift.name); S.shiftCheckT = -Infinity; }
  audit(S, by, 'Production plan scheduled', date, summarizePlan(JSON.parse(before)), summarizePlan(next), reason);
  return true;
}
export function summarizePlan(p) {
  const out = [];
  if (p.targets) out.push('targets ' + Object.entries(p.targets).map(([sh, t]) => `${sh}: ${AREA_IDS.map((a) => t[a] != null ? `${AREAS[a].short} ${t[a]}` : '').filter(Boolean).join('/')}`).join('; '));
  if (p.takt) out.push('takt ' + Object.entries(p.takt).map(([a, s]) => `${AREAS[a].short} ${fmtDur(s)}`).join('/'));
  if (p.shifts) out.push(p.shifts.length ? 'shifts ' + p.shifts.map((s) => `${s.name} ${fmtClock(s.start, false)}–${fmtClock(s.end, false)}`).join(', ') : 'no production');
  if (p.note) out.push(`“${p.note}”`);
  return out.join(' · ') || 'default plan';
}
export function setShiftPattern(S, shifts, by, reason = '') {
  const bad = checkShifts(shifts) || (shifts.length ? null : 'At least one shift is needed');
  if (bad) throw new Error(bad);
  const fmt = (L) => L.map((s) => `${s.name} ${fmtClock(s.start, false)}–${fmtClock(s.end, false)} (${(s.breaks || []).length} breaks)`).join(', ');
  const before = fmt(S.cfg.shifts);
  S.cfg.shifts = shifts.map((s) => ({ ...s, breaks: (s.breaks || []).slice().sort((a, b) => a.start - b.start) })).sort((a, b) => a.start - b.start);
  S.shiftCheckT = -Infinity;
  audit(S, by, 'Default shift timings changed', 'Shift pattern', before, fmt(S.cfg.shifts), reason);
  return true;
}
export function setBuzzer(S, posId, on, by, reason = '') {
  const before = S.cfg.buzzer[posId] !== false;
  if (before === !!on) return false;
  S.cfg.buzzer = { ...S.cfg.buzzer, [posId]: !!on };
  audit(S, by, on ? 'Buzzer switched on' : 'Buzzer switched off', posId, before ? 'on' : 'off', on ? 'on' : 'off', reason);
  return true;
}
/** Close-to-limit threshold for all lines, as a fraction of takt (URD req 12). Audited. */
export function setWarnPct(S, pct, by, reason = '') {
  const w = clamp(Math.round(+pct * 100) || 0, 50, 99) / 100;
  if (w === S.cfg.warnPct) return false;
  audit(S, by, 'Close-to-limit threshold changed', 'All lines', `${Math.round(S.cfg.warnPct * 100)}%`, `${Math.round(w * 100)}%`, reason);
  S.cfg.warnPct = w;
  return true;
}
