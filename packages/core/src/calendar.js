/* ── production calendar: shifts, breaks, targets (URD req 13–15) ──────────
   Sim time is seconds from midnight of day 0 (cfg.baseDate). Each date uses
   its scheduled plan when one exists, otherwise the defaults.            */
import { audit } from './audit.js';
import { AREAS, AREA_IDS, applyTakt } from './plant.js';
import { logEvent } from './state.js';
import { clamp, fmtClock, fmtDur } from './util.js';

const DAY = 86400;
export const dayOf = (t) => Math.floor(t / DAY);
export function dateKeyOf(S, day) { const [y, m, d] = S.cfg.baseDate.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d) + day * DAY * 1000).toISOString().slice(0, 10); }
export const dateKeyAt = (S, t) => dateKeyOf(S, dayOf(t));
export function dayOfDate(S, date) { const [y, m, d] = S.cfg.baseDate.split('-').map(Number), [y2, m2, d2] = date.split('-').map(Number); return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y, m - 1, d)) / (DAY * 1000)); }
export const shiftsFor = (S, date) => (S.cfg.calendar[date] && S.cfg.calendar[date].shifts) || S.cfg.shifts;
export function targetsFor(S, date, shiftName) {
  const p = S.cfg.calendar[date], t = p && p.targets && p.targets[shiftName];
  return Object.fromEntries(AREA_IDS.map((a) => [a, t && t[a] != null ? t[a] : S.cfg.targets[a]]));
}
export const shiftKey = (date, name) => `${date} · ${name}`;
export function shiftAt(S, t) {
  const day = dayOf(t), date = dateKeyOf(S, day), base = day * DAY;
  for (const sh of shiftsFor(S, date)) {
    const start = base + sh.start, end = base + sh.end;
    if (t >= start && t < end) return { key: shiftKey(date, sh.name), date, day, name: sh.name, start, end, breaks: (sh.breaks || []).map((b) => ({ ...b, start: base + b.start, end: base + b.end })) };
  }
  return null;
}
// net productive seconds of a shift between its start and t (breaks excluded)
export function netElapsed(sh, t) {
  const e = clamp(t, sh.start, sh.end); let s = e - sh.start;
  for (const b of sh.breaks) s -= Math.max(0, Math.min(e, b.end) - Math.max(sh.start, b.start));
  return Math.max(0, s);
}
export function nextBoundary(S, t) {
  let best = Infinity;
  for (const dd of [0, 1]) {
    const day = dayOf(t) + dd, date = dateKeyOf(S, day), base = day * DAY;
    for (const sh of shiftsFor(S, date)) for (const x of [sh.start, sh.end, ...(sh.breaks || []).flatMap((b) => [b.start, b.end])]) if (base + x > t && base + x < best) best = base + x;
  }
  return best === Infinity ? t + DAY : best;
}
export function updateShift(S) {
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
export function plannedStopAt(S) {
  if (!S.recording || !S.cfg.useSchedule) return null;
  const sh = S.shift; if (!sh || !sh.name) return { kind: 'OFF', label: 'No shift scheduled', until: sh ? sh.end : null };
  const b = sh.breaks.find((x) => S.t >= x.start && S.t < x.end);
  return b ? { kind: 'BREAK', label: b.label || 'Break', until: b.end } : null;
}
export function summarizeShift(S, sh) {
  const lines = {};
  for (const a of AREA_IDS) {
    const D = S.down[sh.key] || { pos: {}, line: {} };
    lines[a] = { target: sh.targets[a], done: S.prod.filter((r) => r.shiftKey === sh.key && r.area === a).length, down: D.line[a] || 0 };
  }
  return { key: sh.key, date: sh.date, name: sh.name, start: sh.start, end: sh.end, lines, offline: S.stats.offline.filter((o) => o.shiftKey === sh.key).length, calls: S.calls.filter((c) => c.shiftKey === sh.key).length };
}

/* Bodies are released into Trim at the planned pitch (net shift time ÷ Trim target),
   so the line is paced by the plan rather than flooded from the paint-shop buffer. */
export function releasePitch(S) {
  if (S.cfg.releasePitch != null) return S.cfg.releasePitch;
  const sh = S.shift && S.shift.name ? S.shift : shiftAt(S, dayOf(S.t) * DAY + S.cfg.shifts[0].start + 1);
  if (!sh) return 0;
  const tgt = (sh.targets || targetsFor(S, sh.date, sh.name)).TRIM;
  return tgt > 0 ? Math.floor(netElapsed(sh, sh.end) / tgt) : Infinity;
}
