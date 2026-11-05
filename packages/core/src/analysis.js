/* ── bottleneck analysis ── */
import { alarmActive } from './alarms.js';
import { linePace } from './andon.js';
import { areaPaused, permissives, ratioOf } from './interlocks.js';
import { AREAS, LOOPS, NEXT, POS, ROUTE, buildFor, isLoopFirst, targetFor } from './plant.js';
import { dispId } from './scans.js';
import { clamp } from './util.js';

export function analyze(S) {
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
export function posStatus(S, id) { return posStatusRaw(S, id, S._analysis && S._analysis.byPos); }
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
export function stationStatus(S, sid) { return posStatus(S, sid); }
const RANK = { BUFFERED: 1, FAULT: 9, ESCALATED: 8, HOLD: 8, OVERDUE: 7, PAUSED: 6, WAITING: 5, NEAR: 4, TRANSFER: 4, SCAN: 3, WORKING: 3, HANDLING: 3, PLACING: 3, COMPLETE: 2, INBOUND: 1, AWAIT: 1, EMPTY_CARRIER: 1, EMPTY: 0 };
const rankStatus = (s) => RANK[s.code] || 0;
export function stationVehicle(S, sid) {
  const o = S.pos[sid].occ; if (o && o.vehicleId) return { v: S.vehicles[o.vehicleId], posId: sid };
  const x = S.xfers.find((q) => q.to === sid); if (x) return { v: S.vehicles[x.vehicleId], posId: x.from };
  return null;
}

/* Build progress per component: 0 = absent, 1 = installed. Doors are on
   from paint, come off at TL1 and go back on at FL2. */
export function buildState(S, v) {
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
export function pace(S) { return linePace(S, 'FINAL'); }
export function lineStatus(S) {
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
