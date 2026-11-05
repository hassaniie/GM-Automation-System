/* ── alarm drawer ── */
import { can } from '../auth.js';
import { CallRow } from './inspector.js';
import { Act } from '../lib/act.js';
import { openAlarm, select } from './scenarios.js';
import { M, RT, dispId, fmtClock, fmtDur, html, setUI, shortVin } from '../lib/runtime.js';
import { Icon, LEVEL_TONE, LevelChip, tv } from '../lib/ui-kit.js';

export function AlarmDrawer() {
  const S = RT.S, tab = RT.ui.drawer;
  const active = S.alarms.filter((a) => M.alarmActive(a) && a.type !== 'CALL'), un = active.filter((a) => a.ackT == null), ak = active.filter((a) => a.ackT != null);
  const openCalls = S.calls.filter((c) => c.clearedT == null).sort((a, b) => a.raisedT - b.raisedT), doneCalls = S.calls.filter((c) => c.clearedT != null).slice(-25).reverse();
  const resolved = S.alarms.filter((a) => !M.alarmActive(a) && a.level !== 'WARNING' && a.type !== 'CALL').slice(-60).reverse();
  const sortA = (l) => l.slice().sort((a, b) => M.SEV[b.level] - M.SEV[a.level] || a.raisedT - b.raisedT);
  const list = tab === 'active' ? sortA(un) : tab === 'acked' ? sortA(ak) : tab === 'resolved' ? resolved : null;
  const off = S.vehOrder.map((id) => S.vehicles[id]).filter((v) => ['OFF_LINE', 'RETURN_QUEUED', 'RETURNING'].includes(v.state)).reverse();
  const filters = [['all', 'All'], ['call', 'Calls'], ['andon', 'Buzzers'], ['alarm', 'Alarms'], ['exception', 'Exceptions'], ['scan', 'Scans'], ['offline', 'Offline'], ['config', 'Changes'], ['shift', 'Shifts'], ['move', 'Movement'], ['sim', 'Simulation']];
  const evs = tab === 'log' ? S.events.filter((e) => RT.ui.logFilter === 'all' || e.cat === RT.ui.logFilter || (RT.ui.logFilter === 'move' && e.cat === 'work')).slice(-200).reverse() : [];
  return html`<aside class="glass drawer ticks in" aria-label="Alarms and events">
    <div class="head"><div style=${{ flex: 1 }}><div class="micro">Exceptions</div><div style=${{ fontWeight: 600, fontSize: 18 }}>Alarms & events</div></div>
      ${tab === 'active' && un.some((a) => a.level !== 'WARNING') ? html`<button class="btn sm warn" onClick=${() => un.filter((a) => a.level !== 'WARNING').forEach((a) => Act.ackAlarm(a.id))}><${Icon} n="check" />Acknowledge all</button>` : null}
      <button class="btn sm ghost icon" aria-label="Close" onClick=${() => setUI({ drawer: null })}><${Icon} n="x" /></button></div>
    <div class="tabs" role="tablist">${[['calls', 'Calls', openCalls.length], ['active', 'Alarms', un.length], ['acked', 'Acknowledged', ak.length], ['resolved', 'Resolved', resolved.length], ['offline', 'Offline', off.length], ['log', 'Log', null]].map(([k, l, n]) => html`<button key=${k} role="tab" aria-selected=${tab === k} onClick=${() => setUI({ drawer: k })}>${l}${n != null ? html`<span class="n">${n}</span>` : null}</button>`)}</div>
    ${tab === 'calls' ? html`<div class="alist" style=${{ padding: 12 }}>
        ${openCalls.length ? openCalls.map((c) => html`<${CallRow} key=${c.id} c=${c} compact />`) : html`<div class="empty">No open calls. Calls appear here the moment a station presses Supervisor or Maintenance.</div>`}
        ${doneCalls.length ? html`<div class="micro" style=${{ margin: '16px 0 6px' }}>Recently cleared</div><table class="data"><thead><tr><th>Station</th><th>Call</th><th>Raised</th><th>Response</th><th>Total</th><th>By</th></tr></thead><tbody>${doneCalls.map((c) => html`<tr key=${c.id}><td class="mono">${c.pos}</td><td><span class=${'c-' + c.type.toLowerCase()}>${M.CALL_TYPES[c.type].label}</span></td><td class="mono">${fmtClock(c.raisedT, false)}</td><td class="mono">${fmtDur(M.callResponse(c))}</td><td class="mono">${fmtDur(M.callDuration(c))}</td><td style=${{ textAlign: 'left' }}>${(c.clearedBy || '').split(' · ')[0]}</td></tr>`)}</tbody></table>` : null}</div>`
    : tab === 'offline' ? html`<div class="alist">${off.length ? off.map((v) => html`<div key=${v.id} class="arow" role="button" tabIndex="0" style=${{ '--tone': 'var(--warn)' }} onClick=${() => { setUI({ drawer: null }); select({ kind: 'veh', id: v.id }); }} onKeyDown=${(e) => e.key === 'Enter' && (setUI({ drawer: null }), select({ kind: 'veh', id: v.id }))}>
        <div class="top"><span class="chip c-warn"><${Icon} n=${v.state === 'OFF_LINE' ? 'exit' : 'ret'} />${v.state === 'OFF_LINE' ? 'Offline' : 'Returning'}</span><span class="mono" style=${{ fontWeight: 600 }}>${dispId(v.offline.pos)}</span><span class="mono c-muted">${shortVin(v.vin)}</span></div>
        <div>${v.offline.reason}${v.offline.notes ? ` — ${v.offline.notes}` : ''}</div>
        <div class="meta"><span class="mono">${fmtClock(v.offline.t, false)}</span><span>${v.variant.name}</span><span class="mono">built ${v.offline.built}</span>${v.offline.over ? html`<span class="mono" style=${{ color: 'var(--crit)' }}>+${fmtDur(v.offline.over)} over</span>` : null}<span>${v.offline.by || 'Supervisor'}</span></div>
        ${v.state === 'OFF_LINE' && can('offline') ? html`<div class="actions"><button class="btn sm" onClick=${(e) => { e.stopPropagation(); setUI({ dialog: { type: 'return', vehicleId: v.id } }); }}><${Icon} n="ret" />Return to ${v.offline.pos}…</button></div>` : null}
      </div>`) : html`<div class="empty">No units are offline.</div>`}</div>`
    : list ? html`<div class="alist">${list.length ? list.map((a) => html`<div key=${a.id} class="arow" role="button" tabIndex="0" style=${{ '--tone': tv(LEVEL_TONE[a.level]) }} onClick=${() => openAlarm(a)} onKeyDown=${(e) => e.key === 'Enter' && openAlarm(a)}>
        <div class="top"><${LevelChip} a=${a} /><span class="mono" style=${{ fontWeight: 600 }}>${dispId(a.pos)}</span>${a.vin ? html`<span class="mono c-muted">${shortVin(a.vin)}</span>` : null}</div>
        <div>${a.msg}</div>
        <div class="meta"><span class="mono">${fmtClock(a.raisedT, false)}</span>${a.resolvedT == null ? html`<span class="mono">open ${fmtDur(S.t - a.raisedT)}</span>` : html`<span>resolved ${fmtClock(a.resolvedT, false)} · ${a.resolution}</span>`}${a.ackT != null ? html`<span>ack ${fmtClock(a.ackT, false)} · ${a.ackBy}</span>` : null}</div>
        ${a.resolvedT == null ? html`<div class="actions">${a.ackT == null && a.level !== 'WARNING' ? html`<button class="btn sm warn" onClick=${(e) => { e.stopPropagation(); Act.ackAlarm(a.id); }}><${Icon} n="check" />Acknowledge</button>` : null}<button class="btn sm ghost" onClick=${(e) => { e.stopPropagation(); openAlarm(a); }}><${Icon} n="target" />Locate</button></div>` : null}
      </div>`) : html`<div class="empty">${tab === 'active' ? 'No unacknowledged alarms. The line is running without exceptions.' : tab === 'acked' ? 'No acknowledged alarms are still open.' : 'Nothing resolved yet this shift.'}</div>`}</div>`
    : html`<div style=${{ display: 'flex', gap: 4, padding: '10px 12px 0', flexWrap: 'wrap' }}>${filters.map(([k, l]) => html`<button key=${k} class=${'btn sm ' + (RT.ui.logFilter === k ? '' : 'ghost')} onClick=${() => setUI({ logFilter: k })}>${l}</button>`)}</div>
      <div class="alist"><ul class="elog">${evs.map((e) => html`<li key=${e.id}><span class="mono c-muted">${fmtClock(e.t)}</span><span class=${'cat ' + e.cat}>${e.cat}</span><span>${e.pos ? html`<button class="linkish" onClick=${() => { setUI({ drawer: null }); select({ kind: 'pos', id: dispId(e.pos) }); }}>${dispId(e.pos)}</button> ` : null}${e.text}</span></li>`)}</ul></div>`}
  </aside>`;
}

