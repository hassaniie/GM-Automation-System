/* ═════════ islands ═════════ */
import { Scene3D } from '@mg/scene';
import { BV_FULL, BV_FULL_INK } from '@mg/scene/brand';
import { UserMenu } from '../auth.js';
import { openAlarm, select, topAlarm } from './scenarios.js';
import { AREAS, M, POS, RT, cycleTheme, dispId, fmtClock, fmtDur, html, setUI } from '../lib/runtime.js';
import { ANDON_LABEL, ANDON_TONE, Horn, Icon, MgMark, STATUS_ICON, tv } from '../lib/ui-kit.js';

export function IdIsland() {
  const S = RT.S, p = M.pace(S), sh = S.shift || {};
  return html`<div class="seg id-island">
    <div class="brand"><${MgMark} /><div><div class="brand-name">GA Operations</div><div class="brand-sub">MG JW Automobile</div></div></div>
    <div class="clock"><span class="num">${fmtClock(S.t)}</span><span class="micro" style=${{ color: S.planned ? 'var(--paused)' : null }}>${S.planned ? (S.planned.kind === 'OFF' ? 'No shift' : S.planned.label) : sh.name}</span></div>
    <span class="sim-tag" title="All data is simulated. No PLC, scanner or sensor is connected."><${Icon} n="flask" size=${10} />SIMULATION</span>
    <div class="shiftbar" title=${sh.name ? `${sh.name} ${fmtClock(sh.start, false)}–${fmtClock(sh.end, false)} · ${Math.round(p.frac * 100)}% of productive time elapsed` : 'No shift running'}><i style=${{ width: `${p.frac * 100}%` }}></i></div>
  </div>`;
}
export function StateIsland() {
  const S = RT.S, p = M.pace(S), ls = M.lineStatus(S);
  const wip = S.vehOrder.filter((id) => M.isActive(S.vehicles[id])).length;
  const hrs = S.shift && S.shift.name ? M.netElapsed(S.shift, S.shift.end) / 3600 : 0;
  return html`<section class="state-island" role="status" aria-live="polite">
    <div class="metric"><span class="micro">Line</span>
      <button class=${'linestate ' + (ls.tone === 'crit' ? 'crit' : '')} style=${{ color: tv(ls.tone) }} onClick=${() => ls.root ? select({ kind: 'pos', id: dispId(ls.root) }) : Scene3D.focusView('overview')}><span class="dot"></span>${ls.label}</button></div>
    <div class="metric" title="Final line: vehicles completed this shift against the shift target"><span class="micro">Completed / target</span><span class="v">${p.done}<small>/ ${p.target}</small><small style=${{ color: p.delta < 0 ? 'var(--warn)' : 'var(--ok)' }}>${p.delta === 0 ? 'on plan' : p.delta > 0 ? `+${p.delta}` : p.delta}</small></span></div>
    <div class="metric opt"><span class="micro">Remaining</span><span class="v">${p.remaining}<small>to target</small></span></div>
    <div class="metric opt" title="Final line downtime this shift: time with at least one station over takt, breaks excluded"><span class="micro">Downtime</span><span class="v">${fmtDur(p.down)}<small>Final</small></span></div>
    <div class="metric opt"><span class="micro">Last hour</span><span class="v">${p.lastHour}<small>JPH · plan ${hrs ? (p.target / hrs).toFixed(1) : '—'}</small></span></div>
    <div class="metric opt"><span class="micro">In process</span><span class="v">${wip}<small>vehicles</small></span></div>
  </section>`;
}
function CallsPill() {
  const S = RT.S, open = S.calls.filter((c) => c.clearedT == null), sup = open.filter((c) => c.type === 'SUP').length, mnt = open.length - sup;
  return html`<button class=${'calls-pill' + (open.length ? ' hot' : '')} onClick=${() => setUI({ drawer: RT.ui.drawer === 'calls' ? null : 'calls' })} aria-label=${`${sup} supervisor and ${mnt} maintenance calls open`} title="Assist calls">
    <span class="lamp sup" style=${{ opacity: sup ? 1 : 0.25 }}></span><span class="lamp mnt" style=${{ opacity: mnt ? 1 : 0.25 }}></span>CALLS<span class="n">${open.length}</span></button>`;
}
export function ActIsland() {
  const S = RT.S;
  const active = S.alarms.filter((a) => M.alarmActive(a) && M.SEV[a.level] >= 3), unacked = active.filter(M.alarmUnacked);
  const themeIcon = RT.ui.theme === 'light' ? 'sun' : RT.ui.theme === 'dark' ? 'moon' : 'auto';
  return html`<nav class="seg act-island" aria-label="Actions">
    <button class="ibtn" title="Find a vehicle by VIN (/)" aria-label="Find a vehicle by VIN" onClick=${() => setUI({ dialog: { type: 'vin' } })}><${Icon} n="search" /></button>
    <button class="ibtn" title="Scanner 1 · line-in scan at TL1" aria-label="Line-in scan" onClick=${() => setUI({ dialog: { type: 'scan', scanner: 'ENTRY' } })}><${Icon} n="scanin" /></button>
    <button class="ibtn" title="X-ray build view (X)" aria-label="X-ray build view" aria-pressed=${RT.ui.xray} onClick=${() => setUI({ xray: !RT.ui.xray })}><${Icon} n="xray" /></button>
    <button class="ibtn" title=${`Theme: ${RT.ui.theme}`} aria-label=${`Theme ${RT.ui.theme}. Switch theme`} onClick=${cycleTheme}><${Icon} n=${themeIcon} /></button>
    <button class="ibtn opt" title=${RT.ui.muted ? 'Alarm sound muted' : 'Alarm sound on'} aria-label=${RT.ui.muted ? 'Unmute alarm sound' : 'Mute alarm sound'} onClick=${() => { setUI({ muted: !RT.ui.muted }); if (!RT.ui.muted) Horn.ensure(); }}><${Icon} n=${RT.ui.muted ? 'mute' : 'vol'} /></button>
    <span class="sep"></span>
    <${CallsPill} />
    <button class=${'alarm-pill' + (active.length ? ' hot' : '') + (unacked.length ? ' ring' : '')} onClick=${() => setUI({ drawer: RT.ui.drawer ? null : 'active' })} aria-label=${`${active.length} critical alarms, ${unacked.length} unacknowledged`}><${Icon} n="bell" />ALARMS<span class="n">${active.length}</span></button>
    <span class="sep"></span>
    <${UserMenu} />
    <span class="sep"></span>
    <button class="bv-mark" onClick=${() => setUI({ dialog: { type: 'about' } })} title="Designed & built by Bolt & Volt"><img class="full" src=${BV_FULL} alt="Bolt & Volt" /><img class="ink" src=${BV_FULL_INK} alt="Bolt & Volt" /></button>
  </nav>`;
}

/* ── line strip: the whole process as one row of instruments ── */
export function Strip() {
  const S = RT.S, sel = RT.ui.selection;
  const lanes = [['TRIM', 'Trim', ['TL1', 'TL2', 'TL3', 'TL4', 'TL5', 'TL6']], ['CHASSIS', 'Chassis', ['CL1', 'CL2', 'CL3', 'BUF', 'CL4']], ['FINAL', 'Final', ['FL1', 'FL2', 'FL3', 'FL4', 'FL5', 'FL6', 'FL7']]];
  const go = (v) => { setUI({ view: v, selection: null, view2D: v === '2D' ? !RT.ui.view2D : false }); if (v !== '2D') Scene3D.focusView(v); };
  const top = topAlarm(S);
  return html`<section class="glass strip ticks in" aria-label="Line strip">
    <div class="views" role="toolbar" aria-label="Views">
      <button aria-pressed=${RT.ui.view === 'overview' && !RT.ui.view2D} onClick=${() => go('overview')}><${Icon} n="layers" size=${14} />Shop</button>
      <button aria-pressed=${RT.ui.view2D} onClick=${() => go('2D')}><${Icon} n="map" size=${14} />Plan</button>
      <button class=${top ? 'alert' : ''} disabled=${!top} onClick=${() => top && openAlarm(top)} title="Focus the most urgent alarm (A)"><${Icon} n="target" size=${14} />Alarm</button>
      <button aria-pressed=${RT.ui.legend} onClick=${() => setUI({ legend: !RT.ui.legend })}><${Icon} n="info" size=${14} />Key</button>
    </div>
    <div class="lanes">${lanes.map(([k, name, ids]) => html`<div class="lane" key=${k} style=${{ '--n': k === 'CHASSIS' ? 6.6 : ids.length }}>
      <button class="lane-h" onClick=${() => go(k)}><span class="micro" style=${{ color: RT.ui.view === k ? 'var(--text)' : undefined }}>${AREAS[k].station} · ${name}${k === 'TRIM' ? html`<span class="xp" title="The URD asks for scans and a display on Trim. Full Trim Andon is shown as an expansion preview (req 34).">PREVIEW</span>` : null}</span>${k === 'CHASSIS' ? html`<${HangerTracker} />` : null}<${LaneStat} area=${k} /></button>
      <div class="cells ticks">${ids.map((id) => html`<${Cell} key=${id} id=${id} sel=${!!(sel && sel.kind === 'pos' && sel.id === id)} />`)}</div>
    </div>`)}</div>
  </section>`;
}
/* lane header numbers: completed / shift target and downtime for that line */
function LaneStat({ area }) {
  const p = M.linePace(RT.S, area);
  return html`<span class="lstat" title=${`${AREAS[area].name}: ${p.done} completed of ${p.target} this shift · downtime ${fmtDur(p.down)}`}>${p.done}/${p.target}${area !== 'TRIM' || RT.S.cfg.trimAndon ? html` · <span style=${{ color: p.down > 0 ? 'var(--crit)' : null }}>↓${fmtDur(p.down)}</span>` : null}</span>`;
}
function Cell({ id, sel }) {
  const S = RT.S, st = M.stationStatus(S, id), P = POS[id], sv = M.stationVehicle(S, id), occ = sv && S.pos[sv.posId].occ;
  const SHORT = { BUFFERED: 'in buffer', EMPTY: '—', INBOUND: 'inbound', AWAIT: 'ready', EMPTY_CARRIER: 'empty', TRANSFER: 'transfer', PLACING: 'placing', HANDLING: 'handling', SCAN: 'drive-off', FAULT: 'fault', PAUSED: 'stopped', REMOVAL: 'removal' };
  const an = P.kind === 'work' ? M.andonState(S, id) : { state: 'idle' }, live = an.state !== 'idle' && sv && sv.posId === id;
  let r = 0, txt = SHORT[st.code] || st.label.toLowerCase();
  if (live) { r = Math.min(1, an.ratio); txt = an.cycle > an.takt ? `+${fmtDur(an.cycle - an.takt)}` : fmtDur(an.cycle); if (st.code === 'PAUSED') txt = 'stopped'; }
  else if (sv && !['FAULT', 'TRANSFER', 'SCAN', 'REMOVAL'].includes(st.code)) txt = sv.v.vin.slice(-6);
  const tone = live ? ANDON_TONE[an.state] : null, barC = tone === 'ok' ? 'var(--text)' : tone ? tv(tone) : 'var(--hair-2)';
  const calls = M.callsAt(S, id), buzz = S.buzzing[id] != null;
  const cls = 'cell' + (live && an.state === 'over' ? ' over' : live && an.state === 'near' ? ' near' : st.code === 'FAULT' ? ' x' : '') + (st.code === 'EMPTY' ? ' idle' : '');
  const title = `${id} · ${live ? `${ANDON_LABEL[an.state]} · cycle ${fmtDur(an.cycle)} of ${fmtDur(an.takt)} takt` : st.label}${sv ? ' · ' + sv.v.vin : ''}${calls.length ? ' · ' + calls.map((c) => M.CALL_TYPES[c.type].label + ' call').join(', ') : ''}${buzz ? ' · buzzer on' : ''}`;
  return html`<button class=${cls} aria-pressed=${!!sel} onClick=${() => select({ kind: 'pos', id })} title=${title}><span class="cin">
    <span class="cid"><span>${id}${S.pos[id].carrierId && S.carriers[S.pos[id].carrierId].kind === 'Hanger' ? html`<i class="hg">${S.pos[id].carrierId}</i>` : ''}</span><span class="lamps">${calls.map((c) => html`<i key=${c.id} class=${'lamp ' + c.type.toLowerCase() + (c.respondedT == null ? ' blink' : '')}></i>`)}${buzz ? html`<span class="bz"><${Icon} n="buzz" /></span>` : ['FAULT', 'HOLD'].includes(st.code) ? html`<span class=${'c-' + st.tone}><${Icon} n=${STATUS_ICON[st.code]} /></span>` : null}</span></span>
    <span class="bar"><i style=${{ width: `${(P.kind === 'work' ? r : sv ? 1 : 0) * 100}%`, background: P.kind === 'work' ? barC : 'var(--hair-2)' }}></i></span>
    <span class="ct">${txt}</span>
  </span></button>`;
}

/* where each of the 4 hangers is right now */
function hangerWhere(S, c) {
  if (c.mode === 'POS') return c.posId;
  if (c.mode === 'TRANSIT') return `→ ${c.transit.to}`;
  if (c.mode === 'FEED') return '→ TL6';
  return 'return';
}
export function HangerTracker() {
  const S = RT.S, hs = Object.values(S.carriers).filter((c) => c.kind === 'Hanger');
  return html`<span class="htrack" title="The 4 hangers: TL6 → CL1 → CL2 → CL3 → Buffer → CL4 → FL1, empty return to TL6">${hs.map((c) => html`<span key=${c.id} class=${'hchip' + (c.fault ? ' fault' : c.vehicleId ? ' loaded' : '')}><b>${c.id}</b>${hangerWhere(S, c)}</span>`)}</span>`;
}

