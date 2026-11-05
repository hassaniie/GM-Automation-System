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
/* Scheduled plan for a date: targets per shift and line, takt per line, shift pattern. */
export function setPlan(S, date, patch, by, reason = '') {
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
