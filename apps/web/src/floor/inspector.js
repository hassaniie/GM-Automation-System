/* ── inspector pieces ── */
import React from 'react';
import { can, userName } from '../auth.js';
import { HangerTracker } from './islands.js';
import { select } from './scenarios.js';
import { Act } from '../lib/act.js';
import { PaintChip } from '../lib/misc.js';
import { go } from '../lib/router.js';
import { AREAS, M, POS, RT, dispId, fmtClock, fmtDur, html, setUI, shortVin, useEffect, useRef } from '../lib/runtime.js';
import { ANDON_LABEL, ANDON_TONE, CALL_ICON, Icon, LEVEL_ICON, LevelChip, StatusChip, VinText, tv } from '../lib/ui-kit.js';
import { Button, DataTable, Meter, Switch } from '../ui/index.js';

/* a vehicle's time at each station: cycle against takt (marker), colour only when near or over */
const stationCols = (S) => [
  { key: 'pos', label: 'Station', type: 'code', render: (r) => `${r.pos}${r.corrected ? ' ·c' : ''}` },
  { key: 'arr', label: 'Arrived', type: 'time', render: (r) => fmtClock(r.arriveT, false) },
  { key: 'cyc', label: 'Cycle', type: 'duration', render: (r) => html`<span style=${{ color: r.cyc > r.target ? 'var(--ds-status-critical)' : null }}>${fmtDur(r.cyc)}${r.live ? ' ●' : ''}</span>` },
  { key: 'bar', label: '', width: 90, render: (r) => html`<${Meter} size="sm" value=${r.cyc / (r.target * 1.5)} marker=${1 / 1.5} tone=${r.cyc > r.target ? 'critical' : r.cyc >= r.target * S.cfg.warnPct ? 'warning' : null} label=${`${r.pos} cycle against takt`} valueText=${`${fmtDur(r.cyc)} of ${fmtDur(r.target)}`} />` },
  { key: 'left', label: 'Left', type: 'time', render: (r) => (r.end === 'departed' ? fmtClock(r.departT, false) : r.end === 'taken off line' ? 'offline' : r.end === 'corrected' ? 'corrected' : r.live ? 'here now' : '—') },
];

function Ring({ r, tone }) {
  const R = 36, C = 2 * Math.PI * R, f = Math.min(1, r), over = Math.max(0, Math.min(1, r - 1));
  return html`<svg viewBox="0 0 88 88" width="88" height="88" aria-hidden="true">
    <circle cx="44" cy="44" r=${R} fill="none" stroke="var(--hair)" stroke-width="4" />
    <circle cx="44" cy="44" r=${R} fill="none" stroke=${tv(tone)} stroke-width="4" stroke-dasharray=${`${C * f} ${C}`} transform="rotate(-90 44 44)" />
    ${over > 0 ? html`<circle cx="44" cy="44" r=${R - 8} fill="none" stroke=${tv(tone)} stroke-width="2.5" stroke-dasharray=${`${2 * Math.PI * (R - 8) * over} 999`} transform="rotate(-90 44 44)" opacity=".75" />` : null}
    <line x1="44" y1="4" x2="44" y2="11" stroke="var(--muted)" stroke-width="1.5" transform=${`rotate(${RT.S.cfg.warnPct * 360} 44 44)`} />
  </svg>`;
}
const Checklist = ({ pm }) => html`<ul class="checks">${pm.map((c) => html`<li key=${c.key} style=${{ color: c.ok ? 'var(--text-2)' : 'var(--text)' }}><span style=${{ color: c.ok ? 'var(--ok)' : 'var(--crit)' }}><${Icon} n=${c.ok ? 'checkc' : 'xc'} /></span><span>${c.label}${c.detail ? html`<span class="why">${c.detail}</span>` : null}</span></li>`)}</ul>`;
const PosLink = ({ id }) => html`<button class="linkish" onClick=${() => select({ kind: 'pos', id: dispId(id) })}>${dispId(id)}</button>`;
function RootCallout({ posId }) {
  const S = RT.S, an = S._analysis; if (!an) return null;
  const e = an.byPos[posId], impacts = (an.significant || {})[posId], out = [];
  if (impacts && impacts.length && !(impacts.length === 1 && impacts[0] === posId)) {
    const others = impacts.filter((x) => x !== posId);
    out.push(html`<div key="r" class="callout crit"><div class="ttl" style=${{ color: 'var(--crit)' }}><${Icon} n="alert" />Holding up ${others.length} position${others.length > 1 ? 's' : ''}</div>
      <div>${others.map((x, i) => html`<span key=${x}>${i ? ', ' : ''}<${PosLink} id=${x} /> <span class="c-muted">${fmtDur(S.t - S.pos[x].occ.completeT)} waiting</span></span>`)}</div>
      <div class="note">Those bodies are finished but cannot transfer until ${dispId(posId)} clears. Other positions are unaffected.</div></div>`);
  }
  if (e && e.complete && e.cause && e.root !== posId) {
    const rs = M.posStatus(S, e.root);
    out.push(html`<div key="w" class="callout hold"><div class="ttl" style=${{ color: 'var(--hold)' }}><${Icon} n="pause" />Work complete · waiting for transfer</div><div>${e.cause.detail || e.cause.label}</div>
      <div>Root cause <${PosLink} id=${e.root} /> · <span style=${{ color: tv(rs.tone) }}>${rs.label}</span>${POS[e.root].team ? html` <span class="c-muted">· ${POS[e.root].team}</span>` : null}</div></div>`);
  } else if (e && e.complete && e.cause && e.root === posId) out.push(html`<div key="o" class="callout crit"><div class="ttl" style=${{ color: 'var(--crit)' }}><${Icon} n="fault" />Movement inhibited here</div><div>${e.cause.detail || e.cause.label}</div></div>`);
  return out.length ? html`<div style=${{ display: 'grid', gap: 8 }}>${out}</div>` : null;
}
function AlarmMini({ a }) {
  return html`<div class=${'callout ' + (a.level === 'BLOCKED' ? 'hold' : a.level === 'WARNING' || a.level === 'ASSIST' ? 'warn' : 'crit')}>
    <div style=${{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><${LevelChip} a=${a} /><span class="mono c-muted" style=${{ fontSize: 12 }}>since ${fmtClock(a.raisedT, false)}</span>${a.ackT != null ? html`<span class="chip c-muted"><${Icon} n="check" />Acknowledged</span>` : null}</div>
    <div>${a.msg}</div>
    ${a.ackT != null ? html`<div class="note">Acknowledged ${fmtClock(a.ackT, false)} by ${a.ackBy}. The condition is still open.</div>` : null}
    <div class="actions">
      ${a.ackT == null && a.level !== 'WARNING' ? html`<${Button} size="sm" tone="warning" onClick=${() => Act.ackAlarm(a.id)}><${Icon} n="check" />Acknowledge<//>` : null}
    </div></div>`;
}
function BuildList({ v, only }) {
  const S = RT.S, bs = M.buildState(S, v);
  const items = M.buildFor(v).filter((b) => !only || b.st === only || false);
  return html`<ul class="build">${items.map((b) => {
    const f = b.key === 'doors' ? bs.doors : bs[b.key];
    const cls = f >= 1 ? 'done' : f > 0 ? 'now' : 'todo';
    return html`<li key=${b.key} class=${cls}><span class="st">${dispId(b.st)}</span><span>${b.label}</span><span class="pg" title=${`${Math.round(f * 100)}%`}><i style=${{ width: `${f * 100}%` }}></i></span></li>`;
  })}</ul>`;
}

/* One open call: who called, how long it has waited, and Respond / Clear for the right responder. */
export function CallRow({ c, compact }) {
  const S = RT.S, T = M.CALL_TYPES[c.type], waiting = S.t - c.raisedT, canAct = can('respond.' + c.type);
  return html`<div class="callrow" style=${{ borderColor: `color-mix(in srgb, var(--call-${c.type.toLowerCase()}) 50%, transparent)` }}>
    <span class=${'lamp ' + c.type.toLowerCase() + (c.respondedT == null ? ' blink' : '')}></span>
    <div style=${{ minWidth: 0 }}><div style=${{ fontWeight: 600 }}>${T.label}${compact ? html` · <button class="linkish mono" onClick=${() => { setUI({ drawer: null }); select({ kind: 'pos', id: c.pos }); }}>${c.pos}</button>` : null}</div>
      <div class="who">${c.respondedT == null ? `Called ${fmtClock(c.raisedT, false)} · waiting for ${T.label.toLowerCase()}` : `${c.respondedBy} responded after ${fmtDur(c.respondedT - c.raisedT)} · helping ${fmtDur(S.t - c.respondedT)}`}</div></div>
    <div style=${{ display: 'grid', justifyItems: 'end', gap: 6 }}><span class="wait" style=${{ color: c.respondedT == null && waiting > 180 ? 'var(--crit)' : null }} title="Time since the call">${fmtDur(waiting)}</span>
      <span class="actions" style=${{ gap: 6 }}>${c.respondedT == null ? html`<${Button} size="sm" tone=${c.type.toLowerCase()} disabled=${!canAct} title=${canAct ? 'Help has arrived at the station' : `Only ${T.label.toLowerCase()} users respond to this call`} onClick=${() => Act.respondCall(c.id, userName())}>Respond<//>` : null}
        <${Button} size="sm" disabled=${!canAct} title=${canAct ? 'Help given · clear the call' : `Only ${T.label.toLowerCase()} users clear this call`} onClick=${() => Act.clearCall(c.id, userName())}><${Icon} n="check" />Clear<//></span></div>
  </div>`;
}
function StationInspector({ id }) {
  const S = RT.S, P = POS[id], st = M.stationStatus(S, id), sv = M.stationVehicle(S, id);
  const posId = id;
  const p = S.pos[posId], occ = p.occ, v = sv && sv.v, c = p.carrierId && S.carriers[p.carrierId];
  const pm = M.permissives(S, posId);
  const alarms = S.alarms.filter((a) => M.alarmActive(a) && a.pos === id && a.type !== 'CALL');
  const events = S.events.filter((e) => e.pos === id).slice(-8).reverse();
  const isWork = P.kind === 'work', an = isWork ? M.andonState(S, id) : null, live = an && an.state !== 'idle' && sv && sv.posId === id;
  const tone = live ? ANDON_TONE[an.state] : 'text';
  const xf = S.xfers.find((q) => q.from === id || q.to === id);
  const emerg = M.callActive(S, 'EMERG', id), calls = M.callsAt(S, id), callsOk = M.callAllowedAt(S, id);
  const buzzOn = S.buzzing[id] != null, buzzEn = M.buzzerEnabled(S, id), inScope = M.ANDON_AREAS.includes(P.area);
  const offOk = v && M.isActive(v) && !xf && M.OFFLINE_POS.includes(id);
  const press = (type) => { if (M.openCall(S, id, type)) return; Act.raiseCall(id, type, `${userName()} · station button`); };
  return html`<${React.Fragment}>
    <div class="insp-head"><div style=${{ flex: 1, minWidth: 0 }}>
      <div class="micro">${AREAS[P.area].station} · ${AREAS[P.area].name}${!inScope && isWork ? ' · expansion preview' : ''}</div>
      <div class="id">${id}</div><div class="sub">${P.op}</div>
      <div style=${{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>${an && !(an.state === 'normal' && ['crit', 'warn', 'esc', 'paused'].includes(st.tone)) ? html`<span class=${'andon-state c-' + ANDON_TONE[an.state]}>${ANDON_LABEL[an.state]}</span>` : null}<${StatusChip} st=${st} /></div></div>
      <${Button} size="sm" variant="ghost" iconRight="x" aria-label="Close inspector" onClick=${() => setUI({ selection: null })}><//></div>
    <div class="insp-body">
      ${isWork && callsOk ? html`<div class="callpad" role="group" aria-label="Station call buttons">${['SUP', 'MNT'].map((t) => { const oc = M.openCall(S, id, t), T = M.CALL_TYPES[t];
        return html`<${Button} key=${t} size="lg" class="callbtn" tone=${t.toLowerCase()} pressed=${!!oc} disabled=${!can('call')} title=${oc ? `${T.label} call open since ${fmtClock(oc.raisedT, false)} · cleared by the responder` : `Call ${T.label.toLowerCase()} to ${id}`} onClick=${() => press(t)}>
          <span class="cb-top"><${Icon} n=${CALL_ICON[t]} />${T.label}</span><span class="cb-sub">${oc ? (oc.respondedT == null ? `calling · ${fmtDur(S.t - oc.raisedT)}` : `${oc.respondedBy.split(' · ')[0]} here`) : 'Call'}</span><//>`; })}</div>` : isWork ? html`<p class="note">Trim Andon preview is off, so this station has no call buttons.</p>` : html`<p class="note">The buffer has no team. A loaded hanger waits here when CL4 is busy, and moves on by itself.</p>`}
      ${calls.length ? html`<div>${calls.map((cl) => html`<${CallRow} key=${cl.id} c=${cl} />`)}</div>` : null}
      ${live ? html`<div class="timer"><${Ring} r=${an.ratio} tone=${tone === 'ok' ? 'text' : tone} /><div>
        <div class="num" style=${{ color: an.state === 'over' ? 'var(--crit)' : 'var(--text)' }}>${fmtDur(an.cycle)}</div>
        <div class="of">cycle time · takt ${fmtDur(an.takt)}</div>
        <div class="delta" style=${{ color: an.state === 'over' ? 'var(--crit)' : an.state === 'near' ? 'var(--warn)' : 'var(--text-2)' }}>${an.cycle > an.takt ? `+${fmtDur(an.cycle - an.takt)} over takt` : `${fmtDur(an.takt - an.cycle)} to takt`}${occ && occ.completeT != null && occ.vehicleId ? ' · work finished' : ''}</div>
        <div class="note" style=${{ marginTop: 4 }}>Work ${fmtDur(occ.workT)}${occ.waitT ? ` · waiting ${fmtDur(occ.waitT)}` : ''}${occ.plannedT ? ` · breaks ${fmtDur(occ.plannedT)} (excluded)` : ''}</div></div></div>` : null}
      ${isWork ? html`<div class="andon-row" style=${{ padding: '10px 12px', border: '1px solid var(--hair)' }}>
        <span style=${{ display: 'flex', alignItems: 'center', gap: 8 }}><span class=${buzzOn ? 'c-crit' : 'c-muted'}><${Icon} n=${buzzEn ? 'buzz' : 'buzzoff'} /></span><span><b>Buzzer</b> <span class="c-muted">· ${!buzzEn ? 'switched off' : buzzOn ? `ringing ${fmtDur(S.t - S.buzzing[id])}` : 'quiet · rings over takt'}</span></span></span>
        <span style=${{ display: 'flex', alignItems: 'center', gap: 8 }}><span class="note">${M.stationCount(S, id)} vehicle${M.stationCount(S, id) === 1 ? '' : 's'} here</span><span title=${can('buzzer') ? 'Switch this station’s buzzer on or off (logged)' : 'Only authorised users switch buzzers'}><${Switch} checked=${buzzEn} disabled=${!can('buzzer')} label=${html`<span class="ds-vh">Buzzer at ${id}</span>`} onChange=${() => Act.setBuzzer(id, !buzzEn, userName())} /></span></span></div>` : null}
      ${xf ? html`<div class="callout"><div class="ttl" style=${{ color: 'var(--transit)' }}><${Icon} n="arrow" />${M.XFER_FROM[xf.from].label}</div><div>${S.vehicles[xf.vehicleId].vin.slice(-6)} moving from ${S.carriers[S.pos[xf.from].carrierId].id} to ${S.carriers[S.pos[xf.to].carrierId].id} · ${fmtDur(Math.max(0, xf.t1 - S.t))} left</div></div>` : null}
      ${v ? html`<dl class="kv">
        <dt>VIN</dt><dd><button class="linkish" onClick=${() => select({ kind: 'veh', id: v.id })}>${v.vin}</button></dd>
        <dt>Model</dt><dd>${v.variant.name}</dd><dt>Paint</dt><dd><${PaintChip} p=${v.paint} /></dd>
        <dt>Carrier</dt><dd class="mono">${c ? `${c.kind} ${c.id}` : '—'}</dd>
        ${occ ? html`<dt>Arrived</dt><dd class="mono">${fmtClock(occ.arriveT)}</dd>` : null}
        ${occ && occ.pausedT ? html`<dt>Line-stop time</dt><dd class="mono">${fmtDur(occ.pausedT)}</dd>` : null}
        <dt>In the line for</dt><dd class="mono">${fmtDur(S.t - v.entryT)}</dd>
      </dl>` : html`<p class="note">${p.reservedBy ? `${S.carriers[p.reservedBy].kind} ${p.reservedBy} is on its way. The position becomes occupied when arrival is confirmed.` : c ? `${c.kind} ${c.id} is here and empty, ready for the next body.` : 'No carrier present. The position is ready to receive the next one.'}</p>`}
      ${v && id === 'CL2' && v.engine ? html`<div class=${'callout ' + (v.engine.ok ? '' : 'crit')}><div class="ttl" style=${{ color: v.engine.ok ? 'var(--ok)' : 'var(--crit)' }}><${Icon} n="link" />Engine / transmission ${v.engine.ok ? 'paired' : 'mismatch'} · option</div>
        <div class="mono" style=${{ fontSize: 12 }}>${v.engine.engineNo} · ${v.engine.transNo}</div>
        ${v.engine.ok || !can('sim') ? null : html`<div><${Button} size="sm" tone="normal" onClick=${() => Act.rescanEngine('CL2')}><${Icon} n="scan" />Rescan correct unit<//></div>`}</div>` : null}
      ${live && an.state === 'over' && offOk && occ.completeT == null && occ.workT - an.takt >= S.cfg.escalateAfter ? html`<div class="callout crit"><div class="ttl" style=${{ color: 'var(--esc)' }}><${Icon} n="exit" />Consider taking this unit offline</div><div>${fmtDur(an.cycle - an.takt)} over takt. Taking it offline keeps the line moving; it is recorded, not repaired here.</div><div><${Button} size="sm" variant="danger" disabled=${!can('offline')} onClick=${() => setUI({ dialog: { type: 'offline', vehicleId: v.id, reason: M.OFFLINE_REASONS[0] } })}><${Icon} n="exit" />Take offline…<//></div></div>` : null}
      ${P.hangerPoint ? html`<div class="callout"><div class="ttl" style=${{ color: 'var(--text-2)' }}><${Icon} n="hanger" />Hanger point</div><div>${c ? html`Hanger <b class="mono">${c.id}</b> is here${c.vehicleId ? ' carrying this unit' : ' and empty'}.` : p.reservedBy ? html`Hanger <b class="mono">${p.reservedBy}</b> is on its way.` : 'No hanger here right now.'}</div><div class="note">${id === 'TL6' ? 'Bodies are loaded from the Trim conveyor onto a hanger here. TL6 is the end of Trim, where a unit can be taken offline with a scan.' : id === 'FL1' ? 'Bodies are lowered from the hanger onto the Final conveyor here. The empty hanger returns to TL6 on its own rail.' : 'One of the 4 hangers carries the body through this point. Tracking follows the hanger, so no scan is needed here.'}</div><div style=${{ marginTop: 4 }}><${HangerTracker} /></div></div>` : null}
      <${RootCallout} posId=${posId} />
      ${alarms.length ? html`<div class="sec"><div class="micro">Alarms</div>${alarms.map((a) => html`<${AlarmMini} key=${a.id} a=${a} />`)}</div>` : null}
      ${v && isWork ? html`<div class="sec"><div class="micro"><span>Installed here</span><span>${v.variant.name}</span></div><${BuildList} v=${v} only=${id} /></div>` : null}
      ${pm ? html`<div class="sec"><div class="micro">Transfer readiness → ${M.XFER_FROM[posId] ? dispId(M.XFER_FROM[posId].to) + ' carrier' : M.NEXT[posId] ? dispId(M.NEXT[posId]) : 'carrier return'}</div><${Checklist} pm=${pm} /><p class="note">Simulated permissives. In production, motion authority stays with the PLC and safety system.</p></div>` : null}
      <div class="sec"><div class="micro">Unit</div><div class="actions">
        ${offOk ? html`<${Button} variant="danger" disabled=${!can('offline')} title=${can('offline') ? 'Scan the VIN here to take the unit offline' : 'Your role cannot take units offline'} onClick=${() => setUI({ dialog: { type: 'offline', vehicleId: v.id } })}><${Icon} n="exit" />Take offline…<//>` : v && M.isActive(v) && !M.OFFLINE_POS.includes(id) ? html`<span class="note">Units are taken offline only at TL6 (end of Trim) and on the Final line.</span>` : null}
        ${id === 'TL1' ? html`<${Button} onClick=${() => setUI({ dialog: { type: 'scan', scanner: 'ENTRY' } })}><${Icon} n="scanin" />Scanner 1 · line-in<//>` : null}
        ${v && can('correct') ? html`<${Button} variant="ghost" onClick=${() => setUI({ dialog: { type: 'correct', pos: id } })}><${Icon} n="swap" />Correct position…<//>` : null}
      </div>
      ${can('sim') ? html`<div class="micro" style=${{ marginTop: 6, color: 'var(--sim)' }}>Simulation only</div><div class="actions">
        ${c && c.fault ? html`<${Button} size="sm" tone="sim" onClick=${() => Act.clearFault('C', c.id)}>Clear ${c.kind.toLowerCase()} fault<//>` : c ? html`<${Button} size="sm" tone="sim" onClick=${() => Act.faultCarrier(c.id, posId)}>Inject ${c.kind.toLowerCase()} fault<//>` : null}
        ${p.fault ? html`<${Button} size="sm" tone="sim" onClick=${() => Act.clearFault('P', posId)}>Clear sensor fault<//>` : html`<${Button} size="sm" tone="sim" onClick=${() => Act.faultSensor(posId, dispId(posId))}>Inject sensor fault<//>`}
        ${isWork ? html`<${Button} size="sm" tone="sim" icon="siren" pressed=${emerg} onClick=${() => Act.emergency(id, !emerg)}>${emerg ? 'Clear emergency stop' : 'Test emergency stop'}<//>` : null}
        ${isWork && v && occ && occ.completeT == null ? html`<${Button} size="sm" tone="sim" title="Simulate the team finishing now" onClick=${() => Act.manualComplete(id)}><${Icon} n="check" />Finish work now<//>` : null}
      </div>` : null}</div>
      ${isWork ? html`<div class="sec"><div class="micro">Takt</div><div class="andon-row"><span>${AREAS[P.area].name} takt <b class="mono">${fmtDur(S.cfg.takt[P.area])}</b> · close to limit at <span class="mono">${fmtDur(S.cfg.takt[P.area] * S.cfg.warnPct)}</span></span>${can('takt') ? html`<${Button} size="sm" variant="ghost" onClick=${() => go('admin', 'takt')}><${Icon} n="cog" />Change takt<//>` : null}</div></div>` : null}
      <div class="sec"><div class="micro">Recent activity</div>${events.length ? html`<ul class="timeline">${events.map((e) => html`<li key=${e.id}><span class="tm">${fmtClock(e.t, false)}</span><span>${e.text}</span></li>`)}</ul>` : html`<p class="note">No events here yet this shift.</p>`}</div>
    </div></${React.Fragment}>`;
}

export const VSTATE = { IN_PROCESS: ['On line', 'text', 'clock'], AWAITING_LINE_OFF: ['On line · driving off', 'text', 'arrow'], LINED_OFF: ['Completed', 'ok', 'checkc'], OFF_LINE: ['Offlined', 'warn', 'exit'], RETURN_QUEUED: ['Offlined · return queued', 'warn', 'ret'], RETURNING: ['Returning to line', 'transit', 'ret'] };
/* Vehicle record (URD req 5): where it is, its status, and its full history. */
function VehicleInspector({ id }) {
  const S = RT.S, v = S.vehicles[id] || (RT.archive && RT.archive[id]); if (!v) return null; // archive: from stored history
  const [lbl, tone, ic] = VSTATE[v.state], c = v.carrierId && S.carriers[v.carrierId], at = c && c.mode === 'POS' ? c.posId : null;
  let tl, tval;
  if (v.state === 'LINED_OFF') { tl = 'Total time in the line · line-in to completion'; tval = v.totalDur; }
  else if (v.state === 'OFF_LINE' || v.state === 'RETURN_QUEUED') { tl = `Offline for · since ${fmtClock(v.offline.t, false)}`; tval = S.t - v.offline.t; }
  else { tl = `In the line · line-in at ${fmtClock(v.entryT, false)}`; tval = S.t - v.entryT; }
  const route = M.STATIONS.map((sid) => { const cur = at === sid; const done = !!v.done[sid] || v.segments.some((s) => s.pos === sid && s.end === 'departed'); return { sid, cls: cur ? 'cur' : done ? 'done' : '' }; });
  const segs = v.segments.filter((s) => POS[s.pos].kind === 'work');
  const bs = M.buildState(S, v), items = M.buildFor(v), installed = items.filter((b) => (b.key === 'doors' ? bs.doors : bs[b.key]) >= 1).length;
  const ret = M.canReturn(S, v.id);
  const rows = segs.map((sg) => { const occ = !sg.end && S.pos[sg.pos].occ && S.pos[sg.pos].occ.vehicleId === v.id ? S.pos[sg.pos].occ : null; const cyc = occ ? M.occCycle(S, occ) : sg.cycle != null ? sg.cycle : (sg.departT || S.t) - sg.arriveT; return { ...sg, cyc, live: !!occ }; });
  return html`<${React.Fragment}>
    <div class="insp-head"><div style=${{ flex: 1, minWidth: 0 }}>
      <div class="micro">Vehicle record</div><div style=${{ marginTop: 6 }}><${VinText} vin=${v.vin} big /></div>
      <div class="sub">${[v.variant.name, v.variant.name.includes(v.variant.ptLabel) ? null : v.variant.ptLabel].filter(Boolean).join(' · ')} <span style=${{ whiteSpace: 'nowrap' }}>· <${PaintChip} p=${v.paint} /></span></div>
      <div style=${{ marginTop: 10 }}><span class=${'chip c-' + tone}><${Icon} n=${ic} />${lbl}</span></div></div>
      <${Button} size="sm" variant="ghost" iconRight="x" aria-label="Close inspector" onClick=${() => setUI({ selection: null })}><//></div>
    <div class="insp-body">
      <div class="sec"><div class="micro">${tl}</div><div class="num" style=${{ fontSize: 44 }}>${fmtDur(tval)}</div></div>
      <dl class="kv"><dt>Where</dt><dd>${at ? html`<${PosLink} id=${at} /> <span class="c-muted">· ${AREAS[POS[at].area].name}</span>` : M.locationLabel(S, v)}</dd>
        <dt>Line-in</dt><dd class="mono">${fmtClock(v.entryT)} · Scanner 1 at TL1${v.source === 'SIM_AUTO' ? ' (sim)' : ''}</dd>
        ${v.lineOffT ? html`<dt>Completed</dt><dd class="mono">${fmtClock(v.lineOffT)} · photo-eye at FL7</dd>` : null}
        ${v.offlines.length ? html`<dt>Offline</dt><dd>${v.offlines.length}× · last at <span class="mono">${v.offline.pos}</span>, ${fmtClock(v.offline.t, false)}</dd>` : null}
        <dt>Carrier</dt><dd class="mono">${c ? `${c.kind} ${c.id}` : '—'}</dd></dl>
      <div class="sec"><div class="micro">Route</div><div class="route" aria-label="Route progress">${route.map((x, i) => html`<${React.Fragment} key=${x.sid}>${i === 6 || i === 11 ? html`<span class="g"></span>` : null}<span class=${'s ' + x.cls} title=${x.sid}></span></${React.Fragment}>`)}</div></div>
      ${v.offlines.map((o, i) => { const r = v.returns.find((x) => x.offlineT === o.t); return html`<div key=${i} class="callout warn"><div class="ttl" style=${{ color: 'var(--warn)' }}><${Icon} n="exit" />Taken offline at ${o.pos} · ${fmtClock(o.t, false)}</div><div>${o.reason}${o.notes ? ` — ${o.notes}` : ''}</div>
        <dl class="kv" style=${{ marginTop: 4 }}><dt>Station</dt><dd class="mono">${o.pos} · ${AREAS[o.area].name}</dd><dt>Cycle at station</dt><dd class="mono">${fmtDur(o.cycle || 0)}</dd><dt>Build</dt><dd class="mono">${o.built} components</dd><dt>By</dt><dd>${o.by || '—'}${o.scanned ? ' · VIN scanned' : ' · correction'}</dd>
        ${r ? html`<dt>Returned</dt><dd class="mono">${fmtClock(r.t, false)} at ${r.pos} · ${fmtDur(r.t - o.t)} offline · ${r.by}</dd>` : null}</dl>
        ${!r ? html`<div class="note">Removed from station counts; not counted towards the target unless it returns and completes.</div>` : null}</div>`; })}
      <div class="sec"><div class="micro">Actions</div><div class="actions">
        ${M.isActive(v) && at && M.OFFLINE_POS.includes(at) ? html`<${Button} variant="danger" disabled=${!can('offline')} onClick=${() => setUI({ dialog: { type: 'offline', vehicleId: v.id } })}><${Icon} n="exit" />Take offline…<//>` : null}
        ${M.isActive(v) && at && !M.OFFLINE_POS.includes(at) ? html`<span class="note">Offline points: TL6 and FL1–FL7.</span>` : null}
        ${v.state === 'OFF_LINE' ? html`<${Button} variant="primary" disabled=${!can('offline') || !ret.ok} title=${ret.ok ? `Rejoin at ${ret.pos} when it is free` : ret.reason} onClick=${() => setUI({ dialog: { type: 'return', vehicleId: v.id } })}><${Icon} n="ret" />Return to line at ${v.offline.pos}…<//>` : null}
        ${v.state === 'RETURN_QUEUED' ? html`<span class="note">Waiting for ${v.returnReq.pos} to be free. It rejoins automatically.</span>` : null}
        ${M.isActive(v) && at && can('correct') ? html`<${Button} variant="ghost" onClick=${() => setUI({ dialog: { type: 'correct', pos: at, vin: v.vin } })}><${Icon} n="swap" />Correct position…<//>` : null}
        ${v.state === 'LINED_OFF' ? html`<span class="note">Completed. This record is closed.</span>` : null}
      </div></div>
      ${rows.length ? html`<div class="sec"><div class="micro"><span>Time at each station</span><span>cycle vs takt</span></div><${DataTable} columns=${stationCols(S)} rows=${rows} /></div>` : null}
      <div class="sec"><div class="micro"><span>Build</span><span>${installed} / ${items.length} components</span></div><${BuildList} v=${v} /></div>
      <div class="sec"><div class="micro">History</div><ul class="timeline">${v.history.slice(-14).reverse().map((e, i) => html`<li key=${i} title=${e.full || e.text}><span class="tm">${fmtClock(e.t, false)}</span><span class="tx">${e.text}</span></li>`)}</ul></div>
    </div></${React.Fragment}>`;
}
export function Inspector() {
  const sel = RT.ui.selection, ref = useRef(null);
  useEffect(() => { const upd = () => { RT.ui.panelWidth = ref.current && window.innerWidth > 760 ? ref.current.offsetWidth + 16 : 0; }; upd(); window.addEventListener('resize', upd); return () => { window.removeEventListener('resize', upd); RT.ui.panelWidth = 0; }; }, []);
  // move focus into the panel when it opens, so keyboard and screen-reader users land in it (audit D5)
  useEffect(() => { if (ref.current) ref.current.focus({ preventScroll: true }); }, []);
  if (!sel) return null;
  const name = sel.kind === 'pos' ? `Station ${sel.id}` : `Vehicle ${(RT.S.vehicles[sel.id] || {}).vin || ''}`;
  return html`<aside class="glass inspector ticks in" ref=${ref} tabIndex="-1" role="region" aria-label=${`${name} details`}>${sel.kind === 'pos' ? html`<${StationInspector} id=${sel.id} />` : html`<${VehicleInspector} id=${sel.id} />`}</aside>`;
}

/* ── anchored tags ── */
export function Anchors() {
  const S = RT.S, sel = RT.ui.selection, tags = [], byPos = {};
  S.alarms.forEach((a) => { if (!M.alarmActive(a) || a.level === 'WARNING' || !POS[a.pos]) return; const sid = a.type === 'CALL' ? `${a.pos}#${a.callType}` : dispId(a.pos); if (!byPos[sid] || M.SEV[a.level] > M.SEV[byPos[sid].level]) byPos[sid] = a; });
  Object.entries(byPos).forEach(([key, a]) => {
    const sid = dispId(a.pos);
    const occ = S.pos[a.pos].occ, v = occ && occ.vehicleId && S.vehicles[occ.vehicleId];
    let txt;
    if (a.type === 'DELAY') txt = html`<span class="mono k">${sid}</span><span>${a.level === 'ESCALATED' ? 'ESCALATED' : 'OVERDUE'}</span><span class="mono">+${fmtDur(occ && v ? occ.workT - M.targetFor(a.pos, v) : 0)}</span>`;
    else if (a.type === 'FAULT') txt = html`<span class="mono k">${sid}</span><span>${a.msg.split(' · ')[0]}</span>`;
    else if (a.type === 'QUALITY') txt = html`<span class="mono k">${sid}</span><span>QUALITY HOLD · E/T mismatch</span>`;
    else if (a.type === 'CALL') { const c = S.calls.find((x) => x.id === a.callId); txt = html`<span class="mono k">${sid}</span><span>${a.callType === 'SUP' ? 'SUPERVISOR' : 'MAINTENANCE'}</span><span class="mono">${c ? fmtDur(S.t - c.raisedT) : ''}</span>`; }
    else if (a.type === 'EMERGENCY') txt = html`<span class="mono k">${sid}</span><span>EMERGENCY · LINE STOPPED</span>`;
    else txt = html`<span class="mono k">${sid}</span><span>waiting${a.root ? html` · held by <span class="mono k">${dispId(a.root)}</span>` : ''}</span>`;
    const cls = a.level === 'ESCALATED' || a.level === 'EMERGENCY' ? 't-esc' : a.level === 'BLOCKED' ? 't-hold' : a.level === 'CALL_SUP' ? 't-sup' : a.level === 'CALL_MNT' ? 't-mnt' : 't-crit';
    tags.push(html`<div key=${'a' + key} class="anchor" data-anchor=${'pos:' + sid} style=${a.type === 'CALL' ? { marginTop: a.callType === 'SUP' ? -30 : -60 } : null}><div class=${'tag ' + cls} role="button" tabIndex="0" onClick=${() => select({ kind: 'pos', id: sid })} onKeyDown=${(e) => e.key === 'Enter' && select({ kind: 'pos', id: sid })}><${Icon} n=${LEVEL_ICON[a.level]} />${txt}</div></div>`);
  });
  if (sel && sel.kind === 'pos' && !byPos[sel.id]) tags.push(html`<div key="sel" class="anchor" data-anchor=${'pos:' + sel.id}><div class="tag"><span class="mono k">${sel.id}</span></div></div>`);
  if (sel && sel.kind === 'veh' && S.vehicles[sel.id]) tags.push(html`<div key="selv" class="anchor" data-anchor=${'veh:' + sel.id}><div class="tag"><span class="mono k">${S.vehicles[sel.id].vin.slice(-6)}</span></div></div>`);
  return html`<div class="anchors">${tags}</div>`;
}
export function HoverCard() {
  const hv = RT.ui.hover; if (!hv) return null;
  const S = RT.S; let body = null;
  if (hv.kind === 'pos') {
    const P = POS[hv.id], st = M.stationStatus(S, hv.id), sv = M.stationVehicle(S, hv.id), occ = sv && S.pos[sv.posId].occ;
    body = html`<div style=${{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}><span class="mono" style=${{ fontSize: 16, fontWeight: 600 }}>${hv.id}</span><${StatusChip} st=${st} /></div>
      <dl>${sv ? html`<dt>VIN</dt><dd class="mono">${shortVin(sv.v.vin)}</dd>` : html`<dt>Vehicle</dt><dd>none</dd>`}
      ${sv && P.kind === 'work' && occ && sv.posId === hv.id ? html`<dt>Cycle / takt</dt><dd class="mono">${fmtDur(M.occCycle(S, occ))} / ${fmtDur(M.targetFor(hv.id, sv.v))}</dd>` : null}
      ${M.callsAt(S, hv.id).map((c) => html`<dt key=${c.id}>${M.CALL_TYPES[c.type].label}</dt><dd class="mono">${fmtDur(S.t - c.raisedT)}${c.respondedT != null ? ' · responded' : ''}</dd>`)}
      ${occ && occ.completeT != null && occ.waitT > 0 ? html`<dt>Waiting</dt><dd class="mono">${fmtDur(occ.waitT)}</dd>` : null}<dt>Team</dt><dd>${P.team}</dd></dl>`;
  } else if (hv.kind === 'veh') {
    const v = S.vehicles[hv.id]; if (!v) return null;
    body = html`<div style=${{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><span class="mono" style=${{ fontSize: 16, fontWeight: 600 }}>${v.vin.slice(-6)}</span><span class="c-muted" style=${{ fontSize: 12 }}>${v.variant.name}</span></div>
      <dl><dt>Location</dt><dd>${M.locationLabel(S, v)}</dd><dt>Assembly</dt><dd class="mono">${fmtDur((v.lineOffT || S.t) - v.entryT)}</dd><dt>Carrier</dt><dd class="mono">${v.carrierId || '—'}</dd></dl>`;
  } else if (hv.kind === 'scanner') { const SC = { ENTRY: ['Scanner 1 · line-in at TL1', 'Every body is scanned here. Click to scan.'], OFFLINE: ['Offline scanner · TL6, end of Trim', 'Scans a unit taken offline at the end of Trim.'], HH1: ['Handheld offline scanner · Final (FL1–FL3)', 'Wireless; docked at FL2. Scans a unit taken offline on the Final line.'], HH2: ['Handheld offline scanner · Final (FL4–FL7)', 'Wireless; docked at FL5. Scans a unit taken offline on the Final line.'], EOL: ['End-of-line photo-eye · FL7', 'Detects the car driving off the line. No scan: the VIN comes from tracking.'] }[hv.id] || [hv.id, ''];
    body = html`<div class="mono" style=${{ fontWeight: 600 }}>${SC[0]}</div><p class="note" style=${{ marginTop: 6 }}>${SC[1]}</p>`; }
  return html`<div class="glass hovercard ticks" id="hovercard" style=${{ transform: `translate(${Math.min(hv.x + 16, window.innerWidth - 310)}px, ${hv.y + 16}px)` }}>${body}</div>`;
}
export function Legend() {
  const row = (sw, txt) => html`<div class="row"><span class="sw" style=${{ background: sw }}></span><span>${txt}</span></div>`;
  return html`<div class="glass legend-pop ticks" role="dialog" aria-label="Key">
    <div class="micro">Reading the floor</div>
    ${row('var(--andon-ok)', 'Normal · cycle time inside takt (stack light green)')}
    ${row('var(--warn)', 'Close to limit · past ' + Math.round(RT.S.cfg.warnPct * 100) + '% of takt')}${row('var(--crit)', 'Over takt · buzzer rings until the unit leaves')}
    ${row('var(--call-sup)', 'Supervisor call · violet lamp, blinks until someone responds')}${row('var(--call-mnt)', 'Maintenance call · blue lamp, blinks until someone responds')}
    ${row('var(--hold)', 'Work complete, waiting for transfer')}
    ${row('repeating-linear-gradient(90deg, var(--warn) 0 6px, transparent 6px 10px)', 'Chevrons point from waiting bodies to the position holding them')}
    ${row('var(--transit)', 'Bright parts on a car are being installed right now')}
    <p class="note">X-ray (X) makes the body glass so interior and underbody parts are visible. Every state also shows as text with an icon.</p>
    <p class="note">Keys: <b>0</b> whole shop · <b>1/2/3</b> lines · <b>/</b> find VIN · <b>A</b> alarm · <b>X</b> x-ray · <b>Space</b> pause · <b>Esc</b> close.</p>
    <${Button} size="sm" onClick=${() => { setUI({ legend: false }); go('how'); }}><${Icon} n="book" />Guide<//>
  </div>`;
}

