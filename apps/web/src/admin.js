/* ════════════════════════════════════════════════════════════════════════
   Settings for authorised users: takt (req 10), targets and shift plans
   scheduled in advance (req 13–15), buzzers (req 18), position correction
   (req 7), users (req 30) and the audit log. Saved on this device.
   ════════════════════════════════════════════════════════════════════════ */
import { Act } from './lib/act.js';
import { api } from './lib/api.js';
import { REMOTE } from './lib/source.js';
import { Auth, ROLES, can, hashPw, initials, jget, jset, userName } from './auth.js';
import { go } from './lib/router.js';
import { AREAS, M, POS, RT, fmtClock, fmtDur, html, setUI, useEffect, useReducer, useState } from './lib/runtime.js';
import { Horn, Icon } from './lib/ui-kit.js';
import { DeviceAdmin } from './devices.js';

const CFG_KEYS = ['takt', 'targets', 'shifts', 'calendar', 'buzzer', 'warnPct', 'trimAndon'];
export function savedCfg() { const c = jget('mg-andon-config', {}); return Object.fromEntries(Object.entries(c).filter(([k]) => CFG_KEYS.includes(k))); }
export function persistConfig() {
  const S = RT.S; if (!S || REMOTE) return; // remote: settings and audit live on the edge server
  jset('mg-andon-config', Object.fromEntries(CFG_KEYS.map((k) => [k, S.cfg[k]])));
  const log = jget('mg-andon-audit', []), from = S._auditSaved || 0;
  for (const a of S.audit.slice(from)) log.push({ at: Date.now(), t: a.t, date: a.date, by: a.by, action: a.action, target: a.target, before: String(a.before), after: String(a.after), reason: a.reason });
  S._auditSaved = S.audit.length;
  jset('mg-andon-audit', log.slice(-800));
}
const toHM = (sec) => fmtClock(sec, false);
const fromHM = (s) => { const [h, m] = (s || '0:0').split(':').map(Number); return (h || 0) * 3600 + (m || 0) * 60; };
const ADMIN_TABS = [
  ['takt', 'Takt time', 'clock', 'takt'], ['plan', 'Targets & plan', 'calendar', 'plan'], ['shifts', 'Shifts & breaks', 'hour', 'plan'],
  ['buzzers', 'Buzzers', 'buzz', 'buzzer'], ['correct', 'Position correction', 'swap', 'correct'], ['users', 'Users', 'users', 'users'],
  ...(REMOTE ? [['displays', 'Displays', 'tv', 'users'], ['devices', 'Devices', 'link', 'users']] : []), ['audit', 'Audit log', 'shield', 'audit'],
];
export const adminAllowed = () => ADMIN_TABS.some((t) => can(t[3]));
const ADMIN_VIEWS = { takt: (p) => TaktAdmin(p), plan: (p) => PlanAdmin(p), shifts: (p) => ShiftAdmin(p), buzzers: (p) => BuzzerAdmin(p), correct: (p) => CorrectAdmin(p), users: (p) => UserAdmin(p), displays: (p) => DisplayAdmin(p), devices: () => html`<${DeviceAdmin} />`, audit: (p) => AuditAdmin(p) };

export function AdminPage() {
  const tabs = ADMIN_TABS.filter((t) => can(t[3]));
  if (!tabs.length) return html`<${NoAccess} what="Settings" />`;
  const cur = tabs.find((t) => t[0] === RT.route.sub) || tabs[0];
  return html`<div class="page-wrap admin">
    <aside class="adm-nav" aria-label="Settings sections"><div class="micro" style=${{ padding: '0 10px 8px' }}>Settings</div>
      ${tabs.map(([k, l, ic]) => html`<button key=${k} class="adm-tab" aria-current=${cur[0] === k ? 'page' : null} onClick=${() => go('admin', k)}><${Icon} n=${ic} />${l}</button>`)}
      <p class="note" style=${{ padding: '12px 10px' }}>${REMOTE ? 'Changes apply at once on every screen, are stored on the line server and are written to the audit log with your name.' : 'Changes apply at once, are saved on this device and are written to the audit log with your name.'}</p></aside>
    <section class="adm-body"><${ADMIN_VIEWS[cur[0]]} key=${cur[0]} /></section>
  </div>`;
}
export const PageHead = ({ k, title, sub, children }) => html`<div class="pg-head"><div><div class="micro">${k}</div><h2>${title}</h2>${sub ? html`<p class="pg-sub">${sub}</p>` : null}</div>${children ? html`<div class="actions">${children}</div>` : null}</div>`;
function Saved({ msg }) { return msg ? html`<div class=${'result ' + (msg.ok ? 'ok' : 'bad')} role="status" style=${{ marginTop: 10 }}>${msg.text}</div>` : null; }
const auditFor = (pred) => jget('mg-andon-audit', []).filter(pred).slice(-8).reverse();
const AuditMini = ({ rows }) => rows.length ? html`<table class="data" style=${{ marginTop: 10 }}><thead><tr><th>When</th><th>Change</th><th>Before → after</th><th>By</th><th>Reason</th></tr></thead><tbody>${rows.map((r, i) => html`<tr key=${i}><td class="mono">${r.date} ${fmtClock(r.t, false)}</td><td style=${{ textAlign: 'left' }}>${r.action} · ${r.target}</td><td class="mono" style=${{ textAlign: 'left', whiteSpace: 'normal' }}>${r.before} → ${r.after}</td><td style=${{ textAlign: 'left' }}>${(r.by || '').split(' · ')[0]}</td><td style=${{ textAlign: 'left', whiteSpace: 'normal' }}>${r.reason || '—'}</td></tr>`)}</tbody></table>` : html`<p class="note">No changes recorded yet.</p>`;

/* Takt per line (req 10) */
function TaktAdmin() {
  const S = RT.S, [draft, setDraft] = useState(() => ({ ...S.cfg.takt })), [warn, setWarn] = useState(Math.round(S.cfg.warnPct * 100)), [why, setWhy] = useState(''), [msg, setMsg] = useState(null);
  const save = () => {
    const w = M.clamp(warn, 50, 99) / 100;
    const jobs = [...M.AREA_IDS.filter((a) => draft[a] !== S.cfg.takt[a]).map((a) => Act.setTakt(a, draft[a], userName(), why)), ...(w !== S.cfg.warnPct ? [Act.setWarnPct(w, userName(), why)] : [])];
    Promise.all(jobs).then((r) => { const n = r.filter(Boolean).length; persistConfig(); setMsg(n ? { ok: true, text: `Saved ${n} change${n > 1 ? 's' : ''}. Stations use the new takt immediately.` } : { ok: false, text: 'Nothing changed.' }); setWhy(''); }, (e) => setMsg({ ok: false, text: e.message }));
  };
  const setPart = (a, m, s) => setDraft({ ...draft, [a]: M.clamp(m * 60 + s, 60, 3600) });
  return html`<div>
    <${PageHead} k="Takt time · URD req 10" title="Takt time per line" sub="The time a vehicle is allowed at each station. Cycle time above takt turns the station red, sounds its buzzer and counts as downtime." />
    <div class="adm-cards">${M.AREA_IDS.map((a) => { const m = Math.floor(draft[a] / 60), s = draft[a] % 60, ch = draft[a] !== S.cfg.takt[a];
      return html`<div key=${a} class=${'adm-card' + (ch ? ' changed' : '')}><div class="micro">${AREAS[a].station} · ${AREAS[a].name}${a === 'TRIM' ? ' · preview' : ''}</div>
        <div class="takt-in"><input type="number" min="1" max="60" value=${m} aria-label=${`${AREAS[a].name} takt minutes`} onInput=${(e) => setPart(a, +e.target.value || 0, s)} /><span>:</span><input type="number" min="0" max="59" value=${String(s).padStart(2, '0')} aria-label=${`${AREAS[a].name} takt seconds`} onInput=${(e) => setPart(a, m, M.clamp(+e.target.value || 0, 0, 59))} /><span class="c-muted">min : s</span></div>
        <div class="note">Now ${fmtDur(S.cfg.takt[a])} · close to limit at ${fmtDur(draft[a] * warn / 100)}</div>
        <div class="actions" style=${{ gap: 6 }}>${[-60, -30, 30, 60].map((d) => html`<button key=${d} class="btn sm ghost" onClick=${() => setDraft({ ...draft, [a]: M.clamp(draft[a] + d, 60, 3600) })}>${d > 0 ? '+' : '−'}${Math.abs(d) >= 60 ? '1:00' : '0:30'}</button>`)}</div></div>`; })}</div>
    <div class="adm-row"><div class="field" style=${{ maxWidth: 260 }}><label for="tk-warn">Close to limit at (% of takt)</label><input id="tk-warn" type="number" min="50" max="99" value=${warn} onInput=${(e) => setWarn(+e.target.value || 95)} /></div>
      <div class="field" style=${{ flex: 1 }}><label for="tk-why">Reason for the change (kept in the audit log)</label><input id="tk-why" value=${why} onInput=${(e) => setWhy(e.target.value)} placeholder="e.g. New line balance after adding CL3" /></div>
      <button class="btn primary" style=${{ alignSelf: 'end' }} onClick=${save}><${Icon} n="check" />Save takt</button></div>
    <${Saved} msg=${msg} />
    <p class="note" style=${{ marginTop: 10 }}>To change takt from a future date, schedule it under <button class="linkish" onClick=${() => go('admin', 'plan')}>Targets & plan</button>.</p>
    <div class="micro" style=${{ marginTop: 22 }}>Recent takt changes</div><${AuditMini} rows=${auditFor((r) => /takt|limit/i.test(r.action))} />
  </div>`;
}

/* Targets and the production plan, scheduled by date (req 13–15) */
function PlanAdmin() {
  const S = RT.S, today = M.dateKeyAt(S, S.t), day0 = M.dayOf(S.t);
  const days = Array.from({ length: 14 }, (_, i) => M.dateKeyOf(S, day0 + i));
  const [sel, setSel] = useState(today), [msg, setMsg] = useState(null);
  const plan = S.cfg.calendar[sel] || {}, pattern = M.shiftsFor(S, sel), base = S.cfg.shifts;
  const [draft, setDraft] = useState(null);
  const d = draft && draft.date === sel ? draft : { date: sel, runs: Object.fromEntries(base.map((s) => [s.name, !!pattern.find((p) => p.name === s.name)])), times: Object.fromEntries(base.map((s) => { const p = pattern.find((x) => x.name === s.name) || s; return [s.name, [p.start, p.end]]; })), targets: Object.fromEntries(base.map((s) => [s.name, M.targetsFor(S, sel, s.name)])), takt: { ...(plan.takt || {}) }, note: plan.note || '' };
  const upd = (patch) => { setDraft({ ...d, ...patch }); setMsg(null); };
  const wd = (k) => new Date(k + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const save = (why) => {
    const shifts = base.filter((s) => d.runs[s.name]).map((s) => ({ ...s, start: d.times[s.name][0], end: d.times[s.name][1] }));
    const sameShifts = JSON.stringify(shifts) === JSON.stringify(base);
    const targets = Object.fromEntries(base.filter((s) => d.runs[s.name]).map((s) => [s.name, d.targets[s.name]]));
    const sameT = base.filter((s) => d.runs[s.name]).every((s) => M.AREA_IDS.every((a) => d.targets[s.name][a] === S.cfg.targets[a]));
    const takt = Object.fromEntries(Object.entries(d.takt).filter(([, v]) => v));
    Act.setPlan(sel, { shifts: sameShifts ? null : shifts, targets: sameT ? null : targets, takt: Object.keys(takt).length ? takt : null, note: d.note || null }, userName(), why)
      .then(() => { persistConfig(); setDraft(null); setMsg({ ok: true, text: `Plan for ${wd(sel)} saved.${sel === today ? ' Today’s targets update now.' : ''}` }); }, (e) => setMsg({ ok: false, text: e.message }));
  };
  const reset = () => Act.setPlan(sel, { shifts: null, targets: null, takt: null, note: null }, userName(), 'Back to default plan').then(() => { persistConfig(); setDraft(null); setMsg({ ok: true, text: `${wd(sel)} uses the default plan again.` }); }, (e) => setMsg({ ok: false, text: e.message }));
  const [defT, setDefT] = useState(() => ({ ...S.cfg.targets }));
  return html`<div>
    <${PageHead} k="Daily targets · URD req 13–15" title="Targets and production plan" sub="Set the default target per shift for each line, and schedule different targets, takt or shift times for any of the next 14 days. Counts reset automatically at each shift start." />
    <div class="adm-card" style=${{ marginBottom: 18 }}><div class="micro">Default target per shift</div>
      <div class="adm-row" style=${{ marginTop: 8 }}>${M.AREA_IDS.map((a) => html`<div key=${a} class="field" style=${{ maxWidth: 170 }}><label for=${'dt-' + a}>${AREAS[a].name}</label><input id=${'dt-' + a} type="number" min="0" max="999" value=${defT[a]} onInput=${(e) => setDefT({ ...defT, [a]: +e.target.value || 0 })} /></div>`)}
        <button class="btn" style=${{ alignSelf: 'end' }} onClick=${() => Promise.all(M.AREA_IDS.map((a) => Act.setDefaultTarget(a, defT[a], userName()))).then((r) => { const n = r.filter(Boolean).length; persistConfig(); setMsg({ ok: !!n, text: n ? 'Default targets saved.' : 'Nothing changed.' }); }, (e) => setMsg({ ok: false, text: e.message }))}><${Icon} n="check" />Save defaults</button></div></div>
    <div class="plan-grid">
      <div class="plan-days" role="listbox" aria-label="Dates">${days.map((k) => { const p = S.cfg.calendar[k], off = p && p.shifts && !p.shifts.length; return html`<button key=${k} role="option" aria-selected=${sel === k} class="plan-day" onClick=${() => { setSel(k); setDraft(null); setMsg(null); }}>
        <span>${wd(k)}${k === today ? html` <b class="c-ok">· today</b>` : ''}</span><span class=${'chip ' + (off ? 'c-muted' : p ? 'c-hold' : 'c-muted')}>${off ? 'No production' : p ? 'Scheduled' : 'Default'}</span></button>`; })}</div>
      <div class="adm-card">
        <div class="micro">${wd(sel)} · ${sel}</div>
        <table class="data plan-tbl" style=${{ marginTop: 10 }}><thead><tr><th>Shift</th><th>Runs</th><th>Start</th><th>End</th>${M.AREA_IDS.map((a) => html`<th key=${a}>${AREAS[a].short} target</th>`)}</tr></thead><tbody>
          ${base.map((s) => html`<tr key=${s.name}><td style=${{ textAlign: 'left' }}>${s.name}</td>
            <td><button class="toggle" role="switch" aria-checked=${!!d.runs[s.name]} aria-label=${`${s.name} runs`} onClick=${() => upd({ runs: { ...d.runs, [s.name]: !d.runs[s.name] } })}></button></td>
            <td><input type="time" value=${toHM(d.times[s.name][0])} disabled=${!d.runs[s.name]} onInput=${(e) => upd({ times: { ...d.times, [s.name]: [fromHM(e.target.value), d.times[s.name][1]] } })} /></td>
            <td><input type="time" value=${toHM(d.times[s.name][1])} disabled=${!d.runs[s.name]} onInput=${(e) => upd({ times: { ...d.times, [s.name]: [d.times[s.name][0], fromHM(e.target.value)] } })} /></td>
            ${M.AREA_IDS.map((a) => html`<td key=${a}><input type="number" min="0" max="999" style=${{ width: 70 }} value=${d.targets[s.name][a]} disabled=${!d.runs[s.name]} onInput=${(e) => upd({ targets: { ...d.targets, [s.name]: { ...d.targets[s.name], [a]: +e.target.value || 0 } } })} /></td>`)}</tr>`)}
        </tbody></table>
        <div class="adm-row" style=${{ marginTop: 12 }}>${M.AREA_IDS.map((a) => html`<div key=${a} class="field" style=${{ maxWidth: 170 }}><label>${AREAS[a].short} takt from this date</label><select value=${d.takt[a] || ''} onChange=${(e) => upd({ takt: { ...d.takt, [a]: +e.target.value || undefined } })}><option value="">Keep current (${fmtDur(S.cfg.takt[a])})</option>${[480, 510, 540, 570, 600, 630, 660, 720, 780, 840, 900].map((x) => html`<option key=${x} value=${x}>${fmtDur(x)}</option>`)}</select></div>`)}</div>
        <div class="field" style=${{ marginTop: 10 }}><label for="pl-note">Note</label><input id="pl-note" value=${d.note} onInput=${(e) => upd({ note: e.target.value })} placeholder="e.g. Reduced plan: parts shortage on ZS rear bumpers" /></div>
        <div class="actions" style=${{ marginTop: 12 }}><button class="btn primary" onClick=${() => save(d.note || 'Plan scheduled')}><${Icon} n="calendar" />Save plan for ${wd(sel)}</button>${S.cfg.calendar[sel] ? html`<button class="btn ghost" onClick=${reset}>Use default plan</button>` : null}</div>
        <${Saved} msg=${msg} />
        <p class="note" style=${{ marginTop: 10 }}>Breaks follow the shift pattern under <button class="linkish" onClick=${() => go('admin', 'shifts')}>Shifts & breaks</button>. A scheduled takt applies from that date's first shift.</p>
      </div>
    </div>
  </div>`;
}

/* Default shift pattern with breaks (req 11, 15) */
function ShiftAdmin() {
  const S = RT.S, [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(S.cfg.shifts))), [why, setWhy] = useState(''), [msg, setMsg] = useState(null);
  const set = (i, patch) => { const n = draft.slice(); n[i] = { ...n[i], ...patch }; setDraft(n); setMsg(null); };
  const setB = (i, j, patch) => { const b = draft[i].breaks.slice(); b[j] = { ...b[j], ...patch }; set(i, { breaks: b }); };
  const net = (s) => (s.end - s.start - s.breaks.reduce((a, b) => a + Math.max(0, b.end - b.start), 0)) / 3600;
  const valid = draft.every((s) => s.name.trim() && s.end > s.start && s.breaks.every((b) => b.start >= s.start && b.end <= s.end && b.end > b.start));
  return html`<div>
    <${PageHead} k="Shift timings · URD req 11, 15" title="Shifts and breaks" sub="The default pattern for every day. Breaks and the time between shifts are planned stops: the line stops, and they are excluded from cycle time and downtime." />
    ${draft.map((s, i) => html`<div key=${i} class="adm-card" style=${{ marginBottom: 12 }}>
      <div class="adm-row"><div class="field" style=${{ maxWidth: 200 }}><label>Shift name</label><input value=${s.name} onInput=${(e) => set(i, { name: e.target.value })} /></div>
        <div class="field" style=${{ maxWidth: 140 }}><label>Starts</label><input type="time" value=${toHM(s.start)} onInput=${(e) => set(i, { start: fromHM(e.target.value) })} /></div>
        <div class="field" style=${{ maxWidth: 140 }}><label>Ends</label><input type="time" value=${toHM(s.end)} onInput=${(e) => set(i, { end: fromHM(e.target.value) })} /></div>
        <div style=${{ alignSelf: 'end', paddingBottom: 8 }} class="note">${net(s).toFixed(2)} h productive</div>
        ${draft.length > 1 ? html`<button class="btn sm ghost" style=${{ alignSelf: 'end' }} onClick=${() => setDraft(draft.filter((_, k) => k !== i))}><${Icon} n="trash" />Remove shift</button>` : null}</div>
      <div class="micro" style=${{ margin: '10px 0 6px' }}>Breaks and planned stops</div>
      ${s.breaks.map((b, j) => html`<div key=${j} class="adm-row" style=${{ marginBottom: 6 }}><input style=${{ maxWidth: 220 }} aria-label="Break name" value=${b.label} onInput=${(e) => setB(i, j, { label: e.target.value })} /><input type="time" aria-label="Break start" value=${toHM(b.start)} onInput=${(e) => setB(i, j, { start: fromHM(e.target.value) })} /><span class="c-muted">to</span><input type="time" aria-label="Break end" value=${toHM(b.end)} onInput=${(e) => setB(i, j, { end: fromHM(e.target.value) })} /><span class="note">${fmtDur(b.end - b.start)}</span><button class="btn sm ghost icon" aria-label="Remove break" onClick=${() => set(i, { breaks: s.breaks.filter((_, k) => k !== j) })}><${Icon} n="x" /></button></div>`)}
      <button class="btn sm ghost" onClick=${() => set(i, { breaks: [...s.breaks, { label: 'Planned stop', start: s.start + 3600, end: s.start + 3600 + 600 }] })}><${Icon} n="plus" />Add break or planned stop</button></div>`)}
    <div class="actions"><button class="btn ghost" onClick=${() => { const l = draft[draft.length - 1]; setDraft([...draft, { name: `Shift ${String.fromCharCode(65 + draft.length)}`, start: l.end, end: Math.min(24 * 3600 - 60, l.end + 8 * 3600), breaks: [] }]); }}><${Icon} n="plus" />Add shift</button></div>
    <div class="adm-row" style=${{ marginTop: 16 }}><div class="field" style=${{ flex: 1 }}><label for="sh-why">Reason (kept in the audit log)</label><input id="sh-why" value=${why} onInput=${(e) => setWhy(e.target.value)} placeholder="e.g. Ramadan timings" /></div>
      <button class="btn primary" style=${{ alignSelf: 'end' }} disabled=${!valid} onClick=${() => Act.setShiftPattern(draft, userName(), why).then(() => { persistConfig(); setMsg({ ok: true, text: 'Shift pattern saved. It applies from the next shift boundary.' }); }, (e) => setMsg({ ok: false, text: e.message }))}><${Icon} n="check" />Save shift pattern</button></div>
    ${!valid ? html`<div class="result bad" style=${{ marginTop: 10 }}>Each shift needs a name and must end after it starts; breaks must sit inside their shift.</div>` : null}
    <${Saved} msg=${msg} />
    <p class="note" style=${{ marginTop: 10 }}>To change times for one day only, use <button class="linkish" onClick=${() => go('admin', 'plan')}>Targets & plan</button>.</p>
  </div>`;
}

/* Buzzers per station (req 16–18) */
function BuzzerAdmin() {
  const S = RT.S, ids = M.WORK_POS.filter((id) => M.ANDON_AREAS.includes(POS[id].area) || S.cfg.trimAndon);
  return html`<div>
    <${PageHead} k="Station buzzers · URD req 16–18" title="Buzzers" sub="Each Chassis and Final station has its own buzzer. It rings when the unit passes takt and stops when the unit leaves. Switch a station off here, for example during maintenance work." />
    <table class="data"><thead><tr><th>Station</th><th>Line</th><th>State now</th><th>Cycle / takt</th><th>Switch</th><th>Test</th></tr></thead><tbody>
      ${ids.map((id) => { const en = M.buzzerEnabled(S, id), on = S.buzzing[id] != null, an = M.andonState(S, id);
        return html`<tr key=${id}><td class="mono">${id}</td><td style=${{ textAlign: 'left' }}>${AREAS[POS[id].area].name}${POS[id].area === 'TRIM' ? ' · preview' : ''}</td>
          <td><span class=${on ? 'c-crit' : 'c-muted'}>${!en ? 'Switched off' : on ? `Ringing ${fmtDur(S.t - S.buzzing[id])}` : 'Quiet'}</span></td>
          <td class="mono" style=${{ color: an.state === 'over' ? 'var(--crit)' : null }}>${an.state === 'idle' ? '—' : `${fmtDur(an.cycle)} / ${fmtDur(an.takt)}`}</td>
          <td><button class="toggle" role="switch" aria-checked=${en} aria-label=${`Buzzer at ${id}`} onClick=${() => Act.setBuzzer(id, !en, userName()).then(() => persistConfig())}></button></td>
          <td><button class="btn sm ghost" onClick=${() => { Horn.ensure(); Horn.buzz([id]); }}><${Icon} n="vol" />Test</button></td></tr>`; })}
    </tbody></table>
    <p class="note" style=${{ marginTop: 10 }}>In the shop each buzzer is a local sounder at its station, about 85 dB at 1 m, directed at the work area so the next station is not disturbed. In this browser one speaker stands in for them: only the line in view sounds.</p>
  </div>`;
}

/* Position correction (req 7) */
function CorrectAdmin() {
  const S = RT.S, rows = M.WORK_POS.map((id) => ({ id, occ: S.pos[id].occ })).filter((r) => r.occ && r.occ.vehicleId);
  return html`<div>
    <${PageHead} k="Tracking · URD req 7" title="Position correction" sub="If tracking gets out of step with the line, move a VIN to the station it is really at. If another unit is recorded there, the two are swapped. Every correction needs a reason and is audited." />
    <table class="data"><thead><tr><th>Station</th><th>Recorded VIN</th><th>Model</th><th>Cycle</th><th></th></tr></thead><tbody>
      ${rows.map(({ id, occ }) => { const v = S.vehicles[occ.vehicleId]; return html`<tr key=${id}><td class="mono">${id}</td><td class="mono">${v.vin}</td><td style=${{ textAlign: 'left' }}>${v.variant.name}</td><td class="mono">${fmtDur(M.occCycle(S, occ))}</td>
        <td><button class="btn sm" onClick=${() => setUI({ dialog: { type: 'correct', pos: id, vin: v.vin } })}><${Icon} n="swap" />Correct…</button></td></tr>`; })}
    </tbody></table>
    <div class="micro" style=${{ marginTop: 22 }}>Recent corrections</div><${AuditMini} rows=${auditFor((r) => /corrected|removed from station/i.test(r.action))} />
  </div>`;
}

/* Users (req 30): admin only */
function UserAdmin() {
  const [edit, setEdit] = useState(null), [msg, setMsg] = useState(null), [, tick] = useReducer((x) => x + 1, 0);
  useEffect(() => { if (REMOTE) Auth.loadUsers().then(tick); }, []);
  const saveUser = async (u) => {
    if (REMOTE) { // the server checks, hashes the password, ends sessions on role change, and logs it
      const body = u.id ? { name: u.name, email: u.email, role: u.role, ...(u.newPw ? { password: u.newPw } : {}) } : { name: u.name, empId: u.empId, email: u.email, role: u.role, password: u.newPw };
      const r = await api(u.id ? `/api/users/${u.id}` : '/api/users', { method: u.id ? 'PATCH' : 'POST', body });
      if (!r.ok) return setMsg({ ok: false, text: r.error || 'Could not save.' });
      await Auth.loadUsers(); setEdit(null); setMsg({ ok: true, text: `${u.name} ${u.id ? 'updated' : 'added'}.` }); tick(); return;
    }
    if (!u.name.trim() || !u.empId.trim()) return setMsg({ ok: false, text: 'Name and employee ID are required.' });
    const clash = Auth.users.find((x) => x.id !== u.id && (x.empId.toLowerCase() === u.empId.toLowerCase() || (u.email && x.email.toLowerCase() === u.email.toLowerCase())));
    if (clash) return setMsg({ ok: false, text: 'That employee ID or email is already used.' });
    const isNew = !u.id; if (isNew) u.id = 'u' + Date.now().toString(36);
    if (u.newPw) { if (u.newPw.length < 8) return setMsg({ ok: false, text: 'Passwords need at least 8 characters.' }); u.hash = await hashPw(u.id, u.newPw); }
    if (isNew && !u.hash) return setMsg({ ok: false, text: 'Set a temporary password for the new user.' });
    const { newPw, ...clean } = u;
    if (isNew) Auth.users.push({ ...clean, active: true, created: Date.now(), lastIn: null }); else Object.assign(Auth.users.find((x) => x.id === u.id), clean);
    Auth.saveUsers(); Auth.record(isNew ? 'User added' : 'User updated', Auth.user.name, `${u.name} · ${ROLES[u.role].label}${newPw ? ' · password set' : ''}`);
    setEdit(null); setMsg({ ok: true, text: `${u.name} ${isNew ? 'added' : 'updated'}.` }); tick();
  };
  const toggle = async (u) => {
    if (u.id === Auth.user.id) return;
    if (REMOTE) { const r = await api(`/api/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } }); if (!r.ok) setMsg({ ok: false, text: r.error }); await Auth.loadUsers(); tick(); return; }
    u.active = !u.active; Auth.saveUsers(); Auth.record(u.active ? 'User enabled' : 'User disabled', Auth.user.name, u.name); tick(); };
  return html`<div>
    <${PageHead} k="Users · URD req 30" title="Users and roles" sub="Everyone signs in individually. Roles decide what each person can do.">
      <button class="btn primary" onClick=${() => { setEdit({ name: '', empId: '', email: '', role: 'supervisor', newPw: '' }); setMsg(null); }}><${Icon} n="plus" />Add user</button></${PageHead}>
    <div class="adm-cards" style=${{ marginBottom: 16 }}>${Object.entries(ROLES).map(([k, r]) => html`<div key=${k} class="adm-card"><span class=${'av sm r-' + k}>${r.short[0]}</span> <b>${r.label}</b><p class="note">${r.desc}</p></div>`)}</div>
    <table class="data"><thead><tr><th>Name</th><th>Employee ID</th><th>Role</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead><tbody>
      ${Auth.users.map((u) => html`<tr key=${u.id} style=${{ opacity: u.active ? 1 : 0.55 }}><td style=${{ textAlign: 'left' }}><span class=${'av sm r-' + u.role}>${initials(u.name)}</span> ${u.name}${u.id === Auth.user.id ? html` <span class="c-muted">(you)</span>` : null}</td><td class="mono">${u.empId}</td><td style=${{ textAlign: 'left' }}>${ROLES[u.role].label}</td><td>${u.active ? 'Active' : 'Disabled'}</td><td class="mono">${u.lastIn ? new Date(u.lastIn).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
        <td><span class="actions" style=${{ gap: 6, justifyContent: 'flex-end' }}><button class="btn sm ghost" onClick=${() => { setEdit({ ...u, newPw: '' }); setMsg(null); }}><${Icon} n="edit" />Edit</button><button class="btn sm ghost" disabled=${u.id === Auth.user.id} onClick=${() => toggle(u)}>${u.active ? 'Disable' : 'Enable'}</button></span></td></tr>`)}
    </tbody></table>
    <${Saved} msg=${msg} />
    ${edit ? html`<div class="scrim" onClick=${(e) => e.target === e.currentTarget && setEdit(null)}><div class="glass dialog ticks" role="dialog" aria-modal="true" aria-labelledby="ue-h">
      <div class="dialog-head"><div style=${{ flex: 1 }}><div class="micro">Users</div><h3 id="ue-h">${edit.id ? `Edit ${edit.name}` : 'Add a user'}</h3></div><button class="btn sm ghost icon" aria-label="Close" onClick=${() => setEdit(null)}><${Icon} n="x" /></button></div>
      <div class="dialog-body">
        <div class="field"><label for="ue-n">Full name</label><input id="ue-n" value=${edit.name} onInput=${(e) => setEdit({ ...edit, name: e.target.value })} /></div>
        <div class="adm-row"><div class="field" style=${{ flex: 1 }}><label for="ue-i">Employee ID</label><input id="ue-i" value=${edit.empId} onInput=${(e) => setEdit({ ...edit, empId: e.target.value.toUpperCase() })} placeholder="MG-1234" /></div>
          <div class="field" style=${{ flex: 1.4 }}><label for="ue-e">Work email</label><input id="ue-e" value=${edit.email} onInput=${(e) => setEdit({ ...edit, email: e.target.value })} /></div></div>
        <div class="field"><label for="ue-r">Role</label><select id="ue-r" value=${edit.role} disabled=${edit.id === Auth.user.id} onChange=${(e) => setEdit({ ...edit, role: e.target.value })}>${Object.entries(ROLES).map(([k, r]) => html`<option key=${k} value=${k}>${r.label}</option>`)}</select><div class="note">${ROLES[edit.role].desc}</div></div>
        <div class="field"><label for="ue-p">${edit.id ? 'Reset password (leave blank to keep)' : 'Temporary password'}</label><input id="ue-p" type="text" autoComplete="off" value=${edit.newPw} onInput=${(e) => setEdit({ ...edit, newPw: e.target.value })} placeholder="At least 8 characters" /></div>
        <${Saved} msg=${msg && !msg.ok ? msg : null} />
      </div>
      <div class="dialog-foot"><button class="btn" onClick=${() => setEdit(null)}>Cancel</button><button class="btn primary" onClick=${() => saveUser({ ...edit })}><${Icon} n="check" />${edit.id ? 'Save' : 'Add user'}</button></div>
    </div></div>` : null}
  </div>`;
}

/* Audit log: configuration changes, corrections, sign-ins */
function AuditAdmin() {
  const [f, setF] = useState('all'), [remote, setRemote] = useState(null);
  useEffect(() => { if (REMOTE) api('/api/audit?limit=500').then((r) => setRemote(r.ok ? r : { changes: [], access: [], error: r.error })); }, []);
  persistConfig();
  const whenOf = (at) => new Date(at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' });
  // live screens: the server's stored log (configuration changes, corrections, sign-ins, account changes)
  const cfg = (REMOTE ? (remote ? remote.changes.map((a) => ({ ...a, at: Date.parse(a.at) })) : []) : jget('mg-andon-audit', [])).map((r) => ({ when: `${r.date} ${fmtClock(r.t, false)}`, sort: r.at, kind: 'change', what: `${r.action} · ${r.target}`, detail: `${r.before} → ${r.after}`, by: r.by, reason: r.reason }));
  const auth = (REMOTE ? (remote ? remote.access.map((a) => ({ at: Date.parse(a.at), action: a.action, detail: a.detail, who: a.who })) : []) : Auth.log).map((r) => ({ when: whenOf(r.at), sort: r.at, kind: 'access', what: r.action, detail: r.detail, by: r.who, reason: '' }));
  const rows = [...cfg, ...auth].filter((r) => f === 'all' || r.kind === f).sort((a, b) => b.sort - a.sort).slice(0, 300);
  const csv = () => downloadText('andon-audit-log.csv', 'text/csv', [['When', 'Type', 'What', 'Before → after / detail', 'By', 'Reason'], ...rows.map((r) => [r.when, r.kind, r.what, r.detail, r.by, r.reason])].map((r) => r.map((c) => `"${String(c || '').replace(/"/g, '""')}"`).join(',')).join('\n'));
  return html`<div>
    <${PageHead} k="Traceability" title="Audit log" sub="Every change to takt, targets, shifts and buzzers, every position correction and every sign-in, with who and when.">
      <button class="btn" onClick=${csv}><${Icon} n="download" />Export CSV</button></${PageHead}>
    <div class="actions" style=${{ marginBottom: 10 }}>${[['all', 'All'], ['change', 'Changes & corrections'], ['access', 'Sign-ins']].map(([k, l]) => html`<button key=${k} class=${'btn sm ' + (f === k ? '' : 'ghost')} onClick=${() => setF(k)}>${l}</button>`)}</div>
    <table class="data"><thead><tr><th>When</th><th>What</th><th>Detail</th><th>By</th><th>Reason</th></tr></thead><tbody>
      ${rows.length ? rows.map((r, i) => html`<tr key=${i}><td class="mono">${r.when}</td><td style=${{ textAlign: 'left' }}>${r.what}</td><td class="mono" style=${{ textAlign: 'left', whiteSpace: 'normal' }}>${r.detail || '—'}</td><td style=${{ textAlign: 'left' }}>${(r.by || '').split(' · ')[0]}</td><td style=${{ textAlign: 'left', whiteSpace: 'normal' }}>${r.reason || '—'}</td></tr>`) : html`<tr><td colspan="5" class="c-muted">Nothing recorded yet.</td></tr>`}
    </tbody></table>
  </div>`;
}
export function NoAccess({ what }) { return html`<div class="page-wrap"><div class="empty-page"><${Icon} n="lock" size=${28} /><h2>${what} needs a different role</h2><p class="note">You are signed in as ${userName()}. Ask an administrator if you need access.</p></div></div>`; }
export function downloadText(name, type, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }

/* Line display links (live screens): each TV opens its link once and stays connected, read-only, until revoked. */
function DisplayAdmin() {
  const [list, setList] = useState(null), [name, setName] = useState(''), [line, setLine] = useState('chassis'), [made, setMade] = useState(null), [msg, setMsg] = useState(null);
  const load = () => api('/api/displays').then((r) => setList(r.ok ? r.displays : []));
  useEffect(() => { load(); }, []);
  const create = async () => {
    const r = await api('/api/displays', { body: { name: name.trim(), line } });
    if (!r.ok) return setMsg({ ok: false, text: r.error || 'Could not create the link.' });
    setMade({ name: name.trim(), url: `${location.origin}${location.pathname}${r.path}` }); setName(''); setMsg(null); load();
  };
  const revoke = async (d) => { const r = await api(`/api/displays/${d.id}`, { method: 'DELETE' }); setMsg(r.ok ? { ok: true, text: `${d.name} disconnected. Its link no longer works.` } : { ok: false, text: r.error }); load(); };
  const copy = () => { try { navigator.clipboard.writeText(made.url); setMsg({ ok: true, text: 'Link copied.' }); } catch (e) { setMsg({ ok: false, text: 'Copy the link by hand.' }); } };
  const when = (t) => (t ? new Date(t).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  return html`<div>
    <${PageHead} k="Line displays · URD req 23" title="Display links" sub="Create one link per TV. Open it once on the TV: it then shows its line, read-only, with no sign-in. Revoke a link to disconnect that TV." />
    <div class="adm-row" style=${{ alignItems: 'end' }}>
      <div class="field" style=${{ flex: 1 }}><label for="dp-n">Display name</label><input id="dp-n" value=${name} onInput=${(e) => setName(e.target.value)} placeholder="e.g. Chassis line TV" /></div>
      <div class="field"><label for="dp-l">Line</label><select id="dp-l" value=${line} onChange=${(e) => setLine(e.target.value)}><option value="trim">Trim</option><option value="chassis">Chassis</option><option value="final">Final</option></select></div>
      <button class="btn primary" disabled=${name.trim().length < 2} onClick=${create}><${Icon} n="plus" />Create link</button>
    </div>
    ${made ? html`<div class="result good" style=${{ marginTop: 12 }}><b>Link for ${made.name}</b> · shown once; open it on the TV.<div class="mono" style=${{ wordBreak: 'break-all', margin: '6px 0' }}>${made.url}</div><button class="btn sm" onClick=${copy}><${Icon} n="copy" />Copy link</button></div>` : null}
    <${Saved} msg=${msg} />
    <table class="data" style=${{ marginTop: 16 }}><thead><tr><th>Display</th><th>Line</th><th>Created</th><th>Last seen</th><th>Status</th><th></th></tr></thead><tbody>
      ${list == null ? html`<tr><td colspan="6">Loading…</td></tr>` : !list.length ? html`<tr><td colspan="6" class="c-muted">No display links yet.</td></tr>` : list.map((d) => html`<tr key=${d.id} style=${{ opacity: d.revoked_at ? 0.55 : 1 }}>
        <td style=${{ textAlign: 'left' }}>${d.name}</td><td>${d.line}</td><td class="mono">${when(d.created_at)} · ${d.created_by}</td><td class="mono">${when(d.last_seen)}</td>
        <td>${d.revoked_at ? 'Revoked' : 'Active'}</td><td>${d.revoked_at ? null : html`<button class="btn sm ghost" onClick=${() => revoke(d)}>Revoke</button>`}</td></tr>`)}
    </tbody></table>
  </div>`;
}
