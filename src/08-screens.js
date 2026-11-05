/* ════════════════════════════════════════════════════════════════════════
   Main dashboard (URD req 25–27) and line displays (req 23–24), plus the
   resilience demos: head-office link loss (req 33) and power cut (req 32).
   ════════════════════════════════════════════════════════════════════════ */

/* ── shop-to-head-office link (simulated) ──
   Line displays and data collection run on the local line server, so they
   carry on when the link drops. Head office keeps the last data it received
   until the link returns, then the buffered events sync.              */
RT.link = { up: true, downAt: null, snap: null, evAt: 0, syncedAt: Date.now(), lastSync: null };
function setLink(up) {
  const S = RT.S, L = RT.link;
  if (!up && L.up) { L.up = false; L.downAt = S.t; L.snap = dashData(S); L.evAt = S.events.length ? S.events[S.events.length - 1].id : null; M.logEvent(S, 'sim', 'SIMULATION · head-office link down · line displays and data collection carry on locally'); }
  else if (up && !L.up) { const n = S.events.filter((e) => e.t > L.downAt).length; L.up = true; L.lastSync = { n, dur: S.t - L.downAt }; L.snap = null; M.logEvent(S, 'sim', `SIMULATION · head-office link restored · ${n} buffered events synced, nothing lost`); }
  bump();
}
/* power cut: everything stops; on restart positions come back from the
   controllers' retained memory and a re-read of the carrier tags.     */
function powerCut() {
  const S = RT.S, was = RT.running;
  RT.running = false; RT.power = { phase: 'off', t: S.t }; M.logEvent(S, 'sim', 'SIMULATION · power cut · line servers on UPS, events kept in local storage'); bump();
  setTimeout(() => { RT.power = { phase: 'boot', t: S.t }; bump(); }, 3500);
  setTimeout(() => { const n = Object.values(S.pos).filter((p) => p.occ && p.occ.vehicleId).length; RT.power = { phase: 'ok', n }; M.logEvent(S, 'sim', `SIMULATION · restart · ${n} vehicle positions restored from controller memory and confirmed by tag re-read`); RT.running = was; bump(); }, 7000);
  setTimeout(() => { RT.power = null; bump(); }, 10500);
}
function PowerOverlay() {
  const P = RT.power; if (!P) return null;
  const txt = P.phase === 'off' ? ['Power lost', 'Line controllers are on UPS. Every event up to the cut is already stored locally.'] : P.phase === 'boot' ? ['Restarting', 'Servers and displays come back by themselves. Reading carrier tags at each station…'] : ['Back online', `${P.n} vehicle positions restored and confirmed. No data lost; the line carries on where it stopped.`];
  return html`<div class=${'power-ov ' + P.phase} role="alert"><div class="glass dialog ticks" style=${{ width: 'min(520px, 100%)' }}><div class="dialog-body" style=${{ gap: 10 }}><div class="micro">Simulation · URD req 32</div><h3 style=${{ margin: 0, display: 'flex', gap: 10, alignItems: 'center' }}><${Icon} n=${P.phase === 'ok' ? 'checkc' : 'power'} />${txt[0]}</h3><p style=${{ margin: 0, color: 'var(--text-2)' }}>${txt[1]}</p>${P.phase !== 'ok' ? html`<div class="pw-bar"><i></i></div>` : null}</div></div></div>`;
}

/* everything the dashboard shows, as plain data (so head office can hold a frozen copy) */
function dashData(S) {
  const lines = M.AREA_IDS.map((a) => {
    const p = M.linePace(S, a), la = M.lineAndon(S, a);
    const st = M.AREA_STATIONS[a].map((id) => { const an = M.andonState(S, id), o = S.pos[id].occ, v = o && o.vehicleId && S.vehicles[o.vehicleId]; return { id, state: an.state, cycle: an.cycle, takt: an.takt, vin: v ? v.vin : null, buzz: S.buzzing[id] != null, calls: M.callsAt(S, id).map((c) => c.type) }; });
    const hours = []; const sh = S.shift; if (sh && sh.name) for (let h = sh.start; h < Math.min(sh.end, S.t + 3600); h += 3600) hours.push(S.prod.filter((r) => r.area === a && r.shiftKey === sh.key && r.t >= h && r.t < h + 3600).length);
    return { a, ...p, state: la.state, over: la.over, near: la.near, calls: la.calls, takt: S.cfg.takt[a], st, hours };
  });
  const D = (S.shift && S.down[S.shift.key]) || { cause: {} };
  const causes = Object.entries(D.cause || {}).sort((x, y) => y[1] - x[1]).slice(0, 6);
  const calls = S.calls.filter((c) => c.clearedT == null).map((c) => ({ ...c })).sort((x, y) => x.raisedT - y.raisedT);
  const sk = S.shift ? S.shift.key : '', shiftCalls = S.calls.filter((c) => c.shiftKey === sk && c.clearedT != null);
  const avgResp = shiftCalls.length ? shiftCalls.reduce((s, c) => s + M.callResponse(c), 0) / shiftCalls.length : null;
  const offline = S.stats.offline.filter((o) => o.shiftKey === sk);
  return { t: S.t, shift: S.shift, planned: S.planned, lines, causes, calls, avgResp, nCalls: S.calls.filter((c) => c.shiftKey === sk).length, offline, status: M.lineStatus(S) };
}
const STATE_LABEL = { normal: 'Running', near: 'Close to limit', over: 'Over takt', STOP: 'Stopped', PLANNED: 'Planned stop', idle: 'No unit' };
const STATE_TONE = { normal: 'ok', near: 'warn', over: 'crit', STOP: 'crit', PLANNED: 'paused', idle: 'muted' };

function DashboardPage() {
  const S = RT.S, L = RT.link, d = L.up ? dashData(S) : L.snap, live = L.up;
  const sh = d.shift || {};
  return html`<div class="page-wrap dash">
    <div class="pg-head"><div><div class="micro">Main dashboard · all lines</div><h2>General Assembly · ${sh.name || 'No shift'}${d.planned ? html` <span class="chip c-paused" style=${{ verticalAlign: 'middle' }}>${d.planned.label}</span>` : null}</h2>
      <p class="pg-sub">${sh.name ? `${sh.date} · ${fmtClock(sh.start, false)}–${fmtClock(sh.end, false)}` : 'Between shifts'} · counts reset at each shift start.</p></div>
      <div class="dash-live">${live ? html`<span class="livedot"></span><span>Live · updated ${fmtClock(d.t)}</span>` : html`<span class="c-crit"><${Icon} n="wifioff" /></span><span><b>Link to the shop is down</b> since ${fmtClock(L.downAt, false)}. Showing the last data received (${fmtClock(d.t, false)}). Line displays on the floor are unaffected.</span>`}</div></div>
    ${L.lastSync && live ? html`<div class="result ok" style=${{ marginBottom: 14 }}><${Icon} n="wifi" /> Link restored after ${fmtDur(L.lastSync.dur)}. ${L.lastSync.n} events recorded during the outage have synced; nothing was lost. <button class="linkish" onClick=${() => { L.lastSync = null; bump(); }}>Dismiss</button></div>` : null}
    <div class=${'dash-grid' + (live ? '' : ' stale')}>
      <div class="dash-lines">${d.lines.map((l) => html`<${LineCard} key=${l.a} l=${l} />`)}</div>
      <aside class="dash-side">
        <section class="panel ticks"><div class="pg-row"><h3>Active calls</h3><span class="mono">${d.calls.length}</span></div>
          ${d.calls.length ? d.calls.map((c) => live ? html`<${CallRow} key=${c.id} c=${S.calls.find((x) => x.id === c.id) || c} compact />` : html`<div key=${c.id} class="callrow"><span class=${'lamp ' + c.type.toLowerCase()}></span><div>${M.CALL_TYPES[c.type].label} · ${c.pos}</div><span class="wait">${fmtDur(d.t - c.raisedT)}</span></div>`) : html`<p class="note">No open calls. Each one appears here with its station and waiting time the moment it is pressed.</p>`}
          <div class="dash-kv"><span>Calls this shift</span><b class="mono">${d.nCalls}</b><span>Average response</span><b class="mono">${d.avgResp != null ? fmtDur(d.avgResp) : '—'}</b></div></section>
        <section class="panel ticks"><h3>Downtime by cause</h3><div class="q">Time stations spent over takt this shift, put down to the station that caused it.</div>
          ${d.causes.length ? html`<ul class="mix" style=${{ marginTop: 8 }}>${d.causes.map(([id, sec]) => html`<li key=${id}><button class="linkish mono" onClick=${() => drillStation(id)}>${id}</button><span class="mbar"><i style=${{ width: `${(sec / d.causes[0][1]) * 100}%`, background: 'var(--crit)' }}></i></span><span class="mono">${fmtDur(sec)}</span></li>`)}</ul>` : html`<p class="note">No downtime yet this shift.</p>`}</section>
        <section class="panel ticks"><h3>Offlined this shift</h3>${d.offline.length ? html`<table class="data"><tbody>${d.offline.slice(-6).reverse().map((o) => html`<tr key=${o.vin + o.t}><td class="mono">${shortVin(o.vin)}</td><td class="mono">${o.pos}</td><td style=${{ textAlign: 'left', whiteSpace: 'normal' }}>${o.reason}</td><td>${o.returnedT ? html`<span class="c-ok">returned</span>` : 'offline'}</td></tr>`)}</tbody></table>` : html`<p class="note">None. Offlined units are removed from counts and the target.</p>`}</section>
      </aside>
    </div>
  </div>`;
}
function drillStation(id) { go('floor'); setTimeout(() => select({ kind: 'pos', id }), 60); }
function LineCard({ l }) {
  const pct = l.target ? Math.min(1, l.done / l.target) : 0, planPct = l.target ? Math.min(1, l.plan / l.target) : 0, mx = Math.max(1, ...l.hours);
  const preview = l.a === 'TRIM';
  return html`<section class=${'panel ticks lcard s-' + l.state}>
    <div class="lc-head"><button class="lc-title" onClick=${() => go('display', l.a.toLowerCase())} title="Open the line display"><span class="micro">${AREAS[l.a].station}</span><span>${AREAS[l.a].name}</span><${Icon} n="tv" /></button>
      <span class=${'andon-state c-' + STATE_TONE[l.state]}>${STATE_LABEL[l.state]}</span></div>
    <div class="lc-kpis">
      <div><span class="micro">Completed</span><b class="num">${l.done}<small>/ ${l.target}</small></b><span class=${l.delta < 0 ? 'c-warn' : 'c-ok'}>${l.delta === 0 ? 'on plan' : l.delta > 0 ? `+${l.delta} ahead` : `${-l.delta} behind`}</span></div>
      <div><span class="micro">Remaining</span><b class="num">${l.remaining}</b></div>
      <div><span class="micro">Downtime</span><b class="num" style=${{ color: l.down ? 'var(--crit)' : null }}>${fmtDur(l.down)}</b></div>
      <div><span class="micro">Takt</span><b class="num">${fmtDur(l.takt)}</b></div>
      <div><span class="micro">In line</span><b class="num">${l.wip}</b></div>
      <div><span class="micro">Calls</span><b class="num" style=${{ color: l.calls ? 'var(--call-sup)' : null }}>${l.calls}</b></div>
    </div>
    <div class="lc-prog" title=${`Plan now ${l.plan.toFixed(1)}`}><i style=${{ width: `${pct * 100}%` }}></i><b style=${{ left: `${planPct * 100}%` }}></b></div>
    <div class="lc-st" style=${{ gridTemplateColumns: `repeat(${l.st.length}, 1fr)` }}>${l.st.map((s) => html`<button key=${s.id} class=${'lc-cell s-' + s.state} onClick=${() => drillStation(s.id)} title=${`${s.id} · ${STATE_LABEL[s.state]}${s.vin ? ` · ${s.vin}` : ''}${s.state !== 'idle' ? ` · ${fmtDur(s.cycle)} / ${fmtDur(s.takt)}` : ''}`}>
      <span class="id">${s.id}${s.calls.map((t, i) => html`<i key=${i} class=${'lamp ' + t.toLowerCase()}></i>`)}${s.buzz ? html`<span class="bz"><${Icon} n="buzz" /></span>` : null}</span><span class="cy">${s.state === 'idle' ? '—' : fmtDur(s.cycle)}</span></button>`)}</div>
    <div class="lc-foot"><span class="micro">Completed per hour</span><span class="spark">${l.hours.map((n, i) => html`<i key=${i} style=${{ height: `${(n / mx) * 100}%` }} title=${`Hour ${i + 1}: ${n}`}></i>`)}</span><span class="mono c-muted">${l.lastHour} last hour</span>${preview ? html`<span class="xp">Trim Andon preview</span>` : null}</div>
  </section>`;
}

/* ── line display (LCD at each line, req 23–24): read from 10 m ── */
function LineDisplay() {
  const S = RT.S, a = (RT.route.sub || 'chassis').toUpperCase(), area = AREAS[a] ? a : 'CHASSIS';
  const [, tick] = useReducer((x) => x + 1, 0);
  useEffect(() => { const i = setInterval(tick, 1000); return () => clearInterval(i); }, []);
  const p = M.linePace(S, area), la = M.lineAndon(S, area), calls = S.calls.filter((c) => c.area === area && c.clearedT == null).sort((x, y) => x.raisedT - y.raisedT);
  const st = M.AREA_STATIONS[area], fs = () => { const el = document.documentElement; if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen().catch(() => {}); };
  const trim = area === 'TRIM', sk = S.shift ? S.shift.key : '';
  const entered = S.vehOrder.filter((id) => S.vehicles[id].entryT >= (S.shift ? S.shift.start : 0)).length, offT = S.stats.offline.filter((o) => o.shiftKey === sk && o.pos === 'TL6').length;
  const scans = S.scans.filter((x) => x.scanner === 'ENTRY' || (x.scanner === 'OFFLINE' && x.pos === 'TL6')).slice(-6).reverse();
  const showStations = !trim || S.cfg.trimAndon;
  return html`<div class=${'lcd s-' + la.state} style=${{ gridTemplateRows: `auto${RT.link.up ? '' : ' auto'} auto 1fr 17vh auto` }}>
    <header class="lcd-top"><div class="lcd-brand"><${MgMark} /><div><div class="lcd-k">${AREAS[area].station}</div><div class="lcd-line">${AREAS[area].name}</div></div></div>
      <div class="lcd-status"><span class=${'lcd-pill s-' + la.state}>${S.planned ? S.planned.label : STATE_LABEL[la.state]}</span></div>
      <div class="lcd-clock"><b>${fmtClock(S.t, false)}</b><span>${S.shift && S.shift.name ? S.shift.name : 'No shift'}</span></div></header>
    ${!RT.link.up ? html`<div class="lcd-banner"><${Icon} n="wifioff" />Head-office link down · this display and data collection carry on locally</div>` : null}
    <section class="lcd-kpis">
      ${trim ? html`<div><span>Entered</span><b>${entered}</b></div><div><span>Offlined (TL6)</span><b>${offT}</b></div><div><span>In Trim now</span><b>${p.wip}</b></div><div><span>To Chassis</span><b>${p.done}</b></div>`
      : html`<div><span>Target</span><b>${p.target}</b></div><div><span>Completed</span><b class=${p.delta < 0 ? 'bad' : 'good'}>${p.done}</b></div><div><span>Remaining</span><b>${p.remaining}</b></div><div><span>Downtime</span><b class=${p.down ? 'bad' : ''}>${fmtDur(p.down)}</b></div><div><span>Takt</span><b>${fmtDur(S.cfg.takt[area])}</b></div>`}
    </section>
    ${showStations ? html`<section class="lcd-st" style=${{ gridTemplateColumns: `repeat(${st.length}, 1fr)` }}>${st.map((id) => { const an = M.andonState(S, id), o = S.pos[id].occ, v = o && o.vehicleId && S.vehicles[o.vehicleId], cs = M.callsAt(S, id), bz = S.buzzing[id] != null;
      return html`<div key=${id} class=${'lcd-cell s-' + an.state + (bz ? ' buzz' : '')}>
        <div class="lc-id"><span>${id}</span><span class="lc-ic">${cs.map((c) => html`<i key=${c.id} class=${'lamp ' + c.type.toLowerCase() + (c.respondedT == null ? ' blink' : '')}></i>`)}${bz ? html`<${Icon} n="buzz" />` : null}</span></div>
        <div class="lc-cy">${an.state === 'idle' ? '—' : an.cycle > an.takt ? `+${fmtDur(an.cycle - an.takt)}` : fmtDur(an.cycle)}</div>
        <div class="lc-bar"><i style=${{ width: `${Math.min(1, an.ratio) * 100}%` }}></i></div>
        <div class="lc-vin">${v ? v.vin.slice(-6) : 'no unit'} · ${M.stationCount(S, id)}</div></div>`; })}</section>`
    : html`<section class="lcd-scans"><div class="lcd-k">Recent scans</div>${scans.length ? scans.map((x) => html`<div key=${x.id} class="lcd-scan"><b>${fmtClock(x.t, false)}</b><span>${x.scanner === 'ENTRY' ? 'Line-in · TL1' : 'Offline · TL6'}</span><span class="mono">${x.vin || '—'}</span><span class=${x.ok ? 'good' : 'bad'}>${x.ok ? 'OK' : 'rejected'}</span></div>`) : html`<div class="lcd-scan">No scans yet this shift.</div>`}</section>`}
    <section class=${'lcd-calls' + (calls.length ? ' on' : '')}>${calls.length ? calls.slice(0, 4).map((c) => { const w = S.t - c.raisedT; return html`<div key=${c.id} class=${'lcd-call t-' + c.type.toLowerCase() + (c.respondedT == null && w > 180 ? ' late' : '')}><${Icon} n=${CALL_ICON[c.type]} /><b>${c.pos}</b><span>${M.CALL_TYPES[c.type].label}</span><span class="w">${c.respondedT == null ? `waiting ${fmtDur(w)}` : `${(c.respondedBy || '').split(' · ')[0]} at station · ${fmtDur(w)}`}</span></div>`; }) : html`<div class="lcd-none">No active calls</div>`}</section>
    <footer class="lcd-foot"><span class="sim-tag"><${Icon} n="flask" size=${10} />SIMULATION</span>
      <nav>${M.AREA_IDS.map((k) => html`<button key=${k} aria-current=${k === area ? 'page' : null} onClick=${() => go('display', k.toLowerCase())}>${AREAS[k].short}</button>`)}</nav>
      <span class="lcd-act"><button onClick=${fs} title="Full screen"><${Icon} n="max" /></button>${Auth.user ? html`<button onClick=${() => go(ROLES[Auth.user.role].home)} title="Back to the app"><${Icon} n="x" /></button>` : html`<button onClick=${() => go('dash')} title="Sign in"><${Icon} n="user" /></button>`}</span></footer>
  </div>`;
}
