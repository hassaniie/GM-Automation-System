/* ════════════════════════════════════════════════════════════════════════
   Settings for authorised users: takt (req 10), targets and shift plans
   scheduled in advance (req 13–15), buzzers (req 18), position correction
   (req 7), users (req 30) and the audit log. Built from the design-system
   components (./ui).
   ════════════════════════════════════════════════════════════════════════ */
import { Act } from './lib/act.js';
import { api } from './lib/api.js';
import { REMOTE } from './lib/source.js';
import { Auth, ROLES, can, hashPw, initials, jget, jset, userName } from './auth.js';
import { go } from './lib/router.js';
import { AREAS, M, POS, RT, fmtClock, fmtDur, html, setUI, useEffect, useReducer, useState } from './lib/runtime.js';
import { Horn } from './lib/ui-kit.js';
import { DeviceAdmin } from './devices.js';
import { Button, Cluster, DataTable, Dialog, EmptyState, Field, Grid, Notice, NumberInput, PageHeader, Panel, SegmentedControl, Select, Stack, Switch, Tabs, Tag, TextInput, TimeInput } from './ui/index.js';

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
    <aside class="adm-nav" aria-label="Settings sections"><div class="ds-label" style=${{ padding: '0 var(--ds-space-2) var(--ds-space-2)' }}>Settings</div>
      <${Tabs} vertical=${true} label="Settings sections" value=${cur[0]} onChange=${(k) => go('admin', k)} items=${tabs.map(([k, l, ic]) => ({ value: k, label: l, icon: ic }))} />
      <p class="note" style=${{ padding: 'var(--ds-space-3) var(--ds-space-2)' }}>${REMOTE ? 'Changes apply at once on every screen, are stored on the line server and are written to the audit log with your name.' : 'Changes apply at once, are saved on this device and are written to the audit log with your name.'}</p></aside>
    <section class="adm-body" role="tabpanel"><${ADMIN_VIEWS[cur[0]]} key=${cur[0]} /></section>
  </div>`;
}
/** @deprecated use PageHeader from ./ui (kept so older imports keep working) */
export const PageHead = PageHeader;
function Saved({ msg }) { return msg ? html`<${Notice} kind=${msg.ok ? 'success' : 'error'}>${msg.text}<//>` : null; }
const auditFor = (pred) => jget('mg-andon-audit', []).filter(pred).slice(-8).reverse();
const AUDIT_COLS = [
  { key: 'when', label: 'When', type: 'time', render: (r) => `${r.date} ${fmtClock(r.t, false)}` },
  { key: 'what', label: 'Change', render: (r) => `${r.action} · ${r.target}` },
  { key: 'ba', label: 'Before → after', type: 'code', wrap: true, render: (r) => `${r.before} → ${r.after}` },
  { key: 'by', label: 'By', render: (r) => (r.by || '').split(' · ')[0] },
  { key: 'reason', label: 'Reason', wrap: true, render: (r) => r.reason || '—' },
];
const AuditMini = ({ title, rows }) => html`<${Panel} title=${title}><${DataTable} columns=${AUDIT_COLS} rows=${rows} empty="No changes recorded yet." /><//>`;

/* Takt per line (req 10) */
function TaktAdmin() {
  const S = RT.S, [draft, setDraft] = useState(() => ({ ...S.cfg.takt })), [warn, setWarn] = useState(Math.round(S.cfg.warnPct * 100)), [why, setWhy] = useState(''), [msg, setMsg] = useState(null);
  const save = () => {
    const w = M.clamp(warn, 50, 99) / 100;
    const jobs = [...M.AREA_IDS.filter((a) => draft[a] !== S.cfg.takt[a]).map((a) => Act.setTakt(a, draft[a], userName(), why)), ...(w !== S.cfg.warnPct ? [Act.setWarnPct(w, userName(), why)] : [])];
    Promise.all(jobs).then((r) => { const n = r.filter(Boolean).length; persistConfig(); setMsg(n ? { ok: true, text: `Saved ${n} change${n > 1 ? 's' : ''}. Stations use the new takt immediately.` } : { ok: false, text: 'Nothing changed.' }); setWhy(''); }, (e) => setMsg({ ok: false, text: e.message }));
  };
  const setPart = (a, m, s) => setDraft({ ...draft, [a]: M.clamp(m * 60 + s, 60, 3600) });
  return html`<${Stack} gap=${5}>
    <${PageHeader} k="Takt time · URD req 10" title="Takt time per line" sub="The time a vehicle is allowed at each station. Cycle time above takt turns the station red, sounds its buzzer and counts as downtime." />
    <${Grid} min=${240}>${M.AREA_IDS.map((a) => { const m = Math.floor(draft[a] / 60), s = draft[a] % 60, ch = draft[a] !== S.cfg.takt[a];
      return html`<${Panel} key=${a} edge=${ch ? 'var(--ds-text-primary)' : null} title=${`${AREAS[a].station} · ${AREAS[a].name}${a === 'TRIM' ? ' · preview' : ''}`} sub=${`Now ${fmtDur(S.cfg.takt[a])} · close to limit at ${fmtDur(draft[a] * warn / 100)}`}>
        <div class="takt-in"><${NumberInput} min="1" max="60" value=${m} aria-label=${`${AREAS[a].name} takt minutes`} onChange=${(v) => setPart(a, +v || 0, s)} /><span>:</span><${NumberInput} min="0" max="59" value=${String(s).padStart(2, '0')} aria-label=${`${AREAS[a].name} takt seconds`} onChange=${(v) => setPart(a, m, M.clamp(+v || 0, 0, 59))} /><span class="c-muted">min : s</span></div>
        <${Cluster} gap=${1}>${[-60, -30, 30, 60].map((d) => html`<${Button} key=${d} size="sm" variant="ghost" onClick=${() => setDraft({ ...draft, [a]: M.clamp(draft[a] + d, 60, 3600) })}>${d > 0 ? '+' : '−'}${Math.abs(d) >= 60 ? '1:00' : '0:30'}<//>`)}</${Cluster}><//>`; })}</${Grid}>
    <${Cluster} gap=${3} align="flex-end">
      <${Field} label="Close to limit at (% of takt)" style=${{ width: 260 }}><${NumberInput} min="50" max="99" value=${warn} onChange=${(v) => setWarn(+v || 95)} /><//>
      <${Field} label="Reason for the change (kept in the audit log)" style=${{ flex: 1, minWidth: 260 }}><${TextInput} value=${why} onChange=${setWhy} placeholder="e.g. New line balance after adding CL3" /><//>
      <${Button} variant="primary" icon="check" onClick=${save}>Save takt<//>
    </${Cluster}>
    <${Saved} msg=${msg} />
    <p class="note">To change takt from a future date, schedule it under <button class="linkish" onClick=${() => go('admin', 'plan')}>Targets & plan</button>.</p>
    <${AuditMini} title="Recent takt changes" rows=${auditFor((r) => /takt|limit/i.test(r.action))} />
  </${Stack}>`;
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
  const off = (s) => !d.runs[s.name];
  const shiftCols = [
    { key: 'name', label: 'Shift' },
    { key: 'runs', label: 'Runs', render: (s) => html`<${Switch} checked=${!!d.runs[s.name]} label=${html`<span class="ds-vh">${s.name} runs</span>`} onChange=${(v) => upd({ runs: { ...d.runs, [s.name]: v } })} />` },
    { key: 'start', label: 'Start', render: (s) => html`<${TimeInput} size="sm" aria-label=${`${s.name} start`} value=${toHM(d.times[s.name][0])} disabled=${off(s)} onChange=${(v) => upd({ times: { ...d.times, [s.name]: [fromHM(v), d.times[s.name][1]] } })} />` },
    { key: 'end', label: 'End', render: (s) => html`<${TimeInput} size="sm" aria-label=${`${s.name} end`} value=${toHM(d.times[s.name][1])} disabled=${off(s)} onChange=${(v) => upd({ times: { ...d.times, [s.name]: [d.times[s.name][0], fromHM(v)] } })} />` },
    ...M.AREA_IDS.map((a) => ({ key: a, label: `${AREAS[a].short} target`, type: 'number', render: (s) => html`<${NumberInput} size="sm" style=${{ width: 76 }} aria-label=${`${s.name} ${AREAS[a].short} target`} min="0" max="999" value=${d.targets[s.name][a]} disabled=${off(s)} onChange=${(v) => upd({ targets: { ...d.targets, [s.name]: { ...d.targets[s.name], [a]: +v || 0 } } })} />` })),
  ];
  return html`<${Stack} gap=${5}>
    <${PageHeader} k="Daily targets · URD req 13–15" title="Targets and production plan" sub="Set the default target per shift for each line, and schedule different targets, takt or shift times for any of the next 14 days. Counts reset automatically at each shift start." />
    <${Panel} title="Default target per shift">
      <${Cluster} gap=${3} align="flex-end">${M.AREA_IDS.map((a) => html`<${Field} key=${a} label=${AREAS[a].name} style=${{ width: 170 }}><${NumberInput} min="0" max="999" value=${defT[a]} onChange=${(v) => setDefT({ ...defT, [a]: +v || 0 })} /><//>`)}
        <${Button} icon="check" onClick=${() => Promise.all(M.AREA_IDS.map((a) => Act.setDefaultTarget(a, defT[a], userName()))).then((r) => { const n = r.filter(Boolean).length; persistConfig(); setMsg({ ok: !!n, text: n ? 'Default targets saved.' : 'Nothing changed.' }); }, (e) => setMsg({ ok: false, text: e.message }))}>Save defaults<//></${Cluster}><//>
    <div class="plan-grid">
      <div class="plan-days" role="listbox" aria-label="Dates">${days.map((k) => { const p = S.cfg.calendar[k], none = p && p.shifts && !p.shifts.length; return html`<button key=${k} role="option" aria-selected=${sel === k} class="plan-day" onClick=${() => { setSel(k); setDraft(null); setMsg(null); }}>
        <span>${wd(k)}${k === today ? html` <b class="c-ok">· today</b>` : ''}</span><${Tag} tone=${p && !none ? 'held' : null} icon=${null}>${none ? 'No production' : p ? 'Scheduled' : 'Default'}<//></button>`; })}</div>
      <${Panel} title=${`${wd(sel)} · ${sel}`}>
        <${DataTable} columns=${shiftCols} rows=${base} rowKey=${(s) => s.name} />
        <${Cluster} gap=${3}>${M.AREA_IDS.map((a) => html`<${Field} key=${a} label=${`${AREAS[a].short} takt from this date`} style=${{ width: 200 }}><${Select} value=${d.takt[a] || ''} onChange=${(v) => upd({ takt: { ...d.takt, [a]: +v || undefined } })} options=${[['', `Keep current (${fmtDur(S.cfg.takt[a])})`], ...[480, 510, 540, 570, 600, 630, 660, 720, 780, 840, 900].map((x) => [x, fmtDur(x)])]} /><//>`)}</${Cluster}>
        <${Field} label="Note"><${TextInput} value=${d.note} onChange=${(v) => upd({ note: v })} placeholder="e.g. Reduced plan: parts shortage on ZS rear bumpers" /><//>
        <${Cluster}><${Button} variant="primary" icon="calendar" onClick=${() => save(d.note || 'Plan scheduled')}>Save plan for ${wd(sel)}<//>${S.cfg.calendar[sel] ? html`<${Button} variant="ghost" onClick=${reset}>Use default plan<//>` : null}</${Cluster}>
        <${Saved} msg=${msg} />
        <p class="note">Breaks follow the shift pattern under <button class="linkish" onClick=${() => go('admin', 'shifts')}>Shifts & breaks</button>. A scheduled takt applies from that date's first shift.</p>
      <//>
    </div>
  </${Stack}>`;
}

/* Default shift pattern with breaks (req 11, 15) */
function ShiftAdmin() {
  const S = RT.S, [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(S.cfg.shifts))), [why, setWhy] = useState(''), [msg, setMsg] = useState(null);
  const set = (i, patch) => { const n = draft.slice(); n[i] = { ...n[i], ...patch }; setDraft(n); setMsg(null); };
  const setB = (i, j, patch) => { const b = draft[i].breaks.slice(); b[j] = { ...b[j], ...patch }; set(i, { breaks: b }); };
  const net = (s) => (s.end - s.start - s.breaks.reduce((a, b) => a + Math.max(0, b.end - b.start), 0)) / 3600;
  // the same rules the engine and the line server apply: same-day shifts, no overlaps, unique names (audit B4, B5)
  const problem = M.checkShifts(draft), valid = !problem;
  const last = draft[draft.length - 1], roomForShift = draft.length < 4 && last.end <= 23 * 3600;
  return html`<${Stack} gap=${4}>
    <${PageHeader} k="Shift timings · URD req 11, 15" title="Shifts and breaks" sub="The default pattern for every day. Breaks and the time between shifts are planned stops: the line stops, and they are excluded from cycle time and downtime." />
    ${draft.map((s, i) => html`<${Panel} key=${i}>
      <${Cluster} gap=${3} align="flex-end">
        <${Field} label="Shift name" style=${{ width: 200 }}><${TextInput} value=${s.name} onChange=${(v) => set(i, { name: v })} /><//>
        <${Field} label="Starts" style=${{ width: 140 }}><${TimeInput} value=${toHM(s.start)} onChange=${(v) => set(i, { start: fromHM(v) })} /><//>
        <${Field} label="Ends" style=${{ width: 140 }}><${TimeInput} value=${toHM(s.end)} onChange=${(v) => set(i, { end: fromHM(v) })} /><//>
        <span class="note" style=${{ paddingBottom: 'var(--ds-space-2)' }}>${net(s).toFixed(2)} h productive</span>
        ${draft.length > 1 ? html`<${Button} size="sm" variant="ghost" icon="trash" onClick=${() => setDraft(draft.filter((_, k) => k !== i))}>Remove shift<//>` : null}
      </${Cluster}>
      <div class="ds-label">Breaks and planned stops</div>
      ${s.breaks.map((b, j) => html`<${Cluster} key=${j} gap=${2}><${TextInput} size="sm" style=${{ maxWidth: 220 }} aria-label="Break name" value=${b.label} onChange=${(v) => setB(i, j, { label: v })} /><${TimeInput} size="sm" style=${{ width: 120 }} aria-label="Break start" value=${toHM(b.start)} onChange=${(v) => setB(i, j, { start: fromHM(v) })} /><span class="c-muted">to</span><${TimeInput} size="sm" style=${{ width: 120 }} aria-label="Break end" value=${toHM(b.end)} onChange=${(v) => setB(i, j, { end: fromHM(v) })} /><span class="note">${fmtDur(b.end - b.start)}</span><${Button} size="sm" variant="ghost" icon="x" aria-label="Remove break" onClick=${() => set(i, { breaks: s.breaks.filter((_, k) => k !== j) })} /></${Cluster}>`)}
      <div><${Button} size="sm" variant="ghost" icon="plus" onClick=${() => set(i, { breaks: [...s.breaks, { label: 'Planned stop', start: s.start + 3600, end: s.start + 3600 + 600 }] })}>Add break or planned stop<//></div><//>`)}
    <div><${Button} variant="ghost" icon="plus" disabled=${!roomForShift} title=${roomForShift ? null : 'No room for another shift: shifts end by midnight and the last one ends after 23:00'} onClick=${() => setDraft([...draft, { name: `Shift ${String.fromCharCode(65 + draft.length)}`, start: last.end, end: Math.min(24 * 3600 - 60, last.end + 8 * 3600), breaks: [] }])}>Add shift<//>${roomForShift ? null : html` <span class="note">Shifts cannot cross midnight, and the last shift ends after 23:00.</span>`}</div>
    ${problem ? html`<p class="ds-field__error" role="alert">${problem}</p>` : null}
    <${Cluster} gap=${3} align="flex-end">
      <${Field} label="Reason (kept in the audit log)" style=${{ flex: 1, minWidth: 260 }}><${TextInput} value=${why} onChange=${setWhy} placeholder="e.g. Ramadan timings" /><//>
      <${Button} variant="primary" icon="check" disabled=${!valid} onClick=${() => Act.setShiftPattern(draft, userName(), why).then(() => { persistConfig(); setMsg({ ok: true, text: 'Shift pattern saved. It applies from the next shift boundary.' }); }, (e) => setMsg({ ok: false, text: e.message }))}>Save shift pattern<//>
    </${Cluster}>
    ${!valid ? html`<${Notice} kind="error">Each shift needs a name and must end after it starts; breaks must sit inside their shift.<//>` : null}
    <${Saved} msg=${msg} />
    <p class="note">To change times for one day only, use <button class="linkish" onClick=${() => go('admin', 'plan')}>Targets & plan</button>.</p>
  </${Stack}>`;
}

/* Buzzers per station (req 16–18) */
function BuzzerAdmin() {
  const S = RT.S, ids = M.WORK_POS.filter((id) => M.ANDON_AREAS.includes(POS[id].area) || S.cfg.trimAndon);
  const cols = [
    { key: 'id', label: 'Station', type: 'code', render: (r) => r.id },
    { key: 'line', label: 'Line', render: (r) => `${AREAS[POS[r.id].area].name}${POS[r.id].area === 'TRIM' ? ' · preview' : ''}` },
    { key: 'state', label: 'State now', render: (r) => (!r.en ? 'Switched off' : r.on ? html`<${Tag} tone="critical" variant="plain">Ringing ${fmtDur(S.t - S.buzzing[r.id])}<//>` : html`<span class="c-muted">Quiet</span>`) },
    { key: 'cycle', label: 'Cycle / takt', type: 'time', render: (r) => (r.an.state === 'idle' ? '—' : html`<span style=${{ color: r.an.state === 'over' ? 'var(--ds-status-critical)' : null }}>${fmtDur(r.an.cycle)} / ${fmtDur(r.an.takt)}</span>`) },
    { key: 'sw', label: 'Switch', render: (r) => html`<${Switch} checked=${r.en} label=${html`<span class="ds-vh">Buzzer at ${r.id}</span>`} onChange=${() => Act.setBuzzer(r.id, !r.en, userName()).then(() => persistConfig())} />` },
    { key: 'test', label: 'Test', type: 'action', render: (r) => html`<${Button} size="sm" variant="ghost" icon="vol" onClick=${() => { Horn.ensure(); Horn.buzz([r.id]); }}>Test<//>` },
  ];
  return html`<${Stack} gap=${4}>
    <${PageHeader} k="Station buzzers · URD req 16–18" title="Buzzers" sub="Each Chassis and Final station has its own buzzer. It rings when the unit passes takt and stops when the unit leaves. Switch a station off here, for example during maintenance work." />
    <${DataTable} columns=${cols} rows=${ids.map((id) => ({ id, en: M.buzzerEnabled(S, id), on: S.buzzing[id] != null, an: M.andonState(S, id) }))} rowKey=${(r) => r.id} status=${(r) => (r.on ? 'critical' : null)} />
    <p class="note">In the shop each buzzer is a local sounder at its station, about 85 dB at 1 m, directed at the work area so the next station is not disturbed. In this browser one speaker stands in for them: only the line in view sounds.</p>
  </${Stack}>`;
}

/* Position correction (req 7) */
function CorrectAdmin() {
  const S = RT.S, rows = M.WORK_POS.map((id) => ({ id, occ: S.pos[id].occ })).filter((r) => r.occ && r.occ.vehicleId).map((r) => ({ ...r, v: S.vehicles[r.occ.vehicleId] }));
  const cols = [
    { key: 'id', label: 'Station', type: 'code', render: (r) => r.id },
    { key: 'vin', label: 'Recorded VIN', type: 'vin', render: (r) => r.v.vin },
    { key: 'model', label: 'Model', render: (r) => r.v.variant.name },
    { key: 'cycle', label: 'Cycle', type: 'duration', render: (r) => fmtDur(M.occCycle(S, r.occ)) },
    { key: 'act', label: '', type: 'action', render: (r) => html`<${Button} size="sm" icon="swap" onClick=${() => setUI({ dialog: { type: 'correct', pos: r.id, vin: r.v.vin } })}>Correct…<//>` },
  ];
  return html`<${Stack} gap=${4}>
    <${PageHeader} k="Tracking · URD req 7" title="Position correction" sub="If tracking gets out of step with the line, move a VIN to the station it is really at. If another unit is recorded there, the two are swapped. Every correction needs a reason and is audited." />
    <${DataTable} columns=${cols} rows=${rows} rowKey=${(r) => r.id} empty="No vehicles on the work stations." />
    <${AuditMini} title="Recent corrections" rows=${auditFor((r) => /corrected|removed from station/i.test(r.action))} />
  </${Stack}>`;
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
  const cols = [
    { key: 'name', label: 'Name', render: (u) => html`<span class=${'av sm r-' + u.role}>${initials(u.name)}</span> ${u.name}${u.id === Auth.user.id ? html` <span class="c-muted">(you)</span>` : null}` },
    { key: 'empId', label: 'Employee ID', type: 'code' },
    { key: 'role', label: 'Role', render: (u) => ROLES[u.role].label },
    { key: 'active', label: 'Status', render: (u) => (u.active ? 'Active' : html`<${Tag} tone="paused" icon=${null}>Disabled<//>`) },
    { key: 'lastIn', label: 'Last sign-in', type: 'time', render: (u) => (u.lastIn ? new Date(u.lastIn).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—') },
    { key: 'act', label: '', type: 'action', render: (u) => html`<${Cluster} gap=${1} justify="flex-end" nowrap=${true}><${Button} size="sm" variant="ghost" icon="edit" onClick=${() => { setEdit({ ...u, newPw: '' }); setMsg(null); }}>Edit<//><${Button} size="sm" variant="ghost" disabled=${u.id === Auth.user.id} onClick=${() => toggle(u)}>${u.active ? 'Disable' : 'Enable'}<//></${Cluster}>` },
  ];
  return html`<${Stack} gap=${4}>
    <${PageHeader} k="Users · URD req 30" title="Users and roles" sub="Everyone signs in individually. Roles decide what each person can do.">
      <${Button} variant="primary" icon="plus" onClick=${() => { setEdit({ name: '', empId: '', email: '', role: 'supervisor', newPw: '' }); setMsg(null); }}>Add user<//></${PageHeader}>
    <${Grid} min=${240}>${Object.entries(ROLES).map(([k, r]) => html`<${Panel} key=${k} title=${html`<span class=${'av sm r-' + k}>${r.short[0]}</span> ${r.label}`} sub=${r.desc} />`)}</${Grid}>
    <${DataTable} columns=${cols} rows=${Auth.users} rowKey=${(u) => u.id} rowClass=${(u) => (u.active ? null : 'ds-row-muted')} />
    <${Saved} msg=${msg} />
    ${edit ? html`<${Dialog} k="Users" title=${edit.id ? `Edit ${edit.name}` : 'Add a user'} onClose=${() => setEdit(null)} footer=${html`<${Button} onClick=${() => setEdit(null)}>Cancel<//><${Button} variant="primary" icon="check" onClick=${() => saveUser({ ...edit })}>${edit.id ? 'Save' : 'Add user'}<//>`}>
        <${Field} label="Full name"><${TextInput} value=${edit.name} onChange=${(v) => setEdit({ ...edit, name: v })} /><//>
        <${Grid} min=${200}><${Field} label="Employee ID"><${TextInput} value=${edit.empId} onChange=${(v) => setEdit({ ...edit, empId: v.toUpperCase() })} placeholder="MG-1234" /><//>
          <${Field} label="Work email"><${TextInput} type="email" value=${edit.email} onChange=${(v) => setEdit({ ...edit, email: v })} /><//></${Grid}>
        <${Field} label="Role" hint=${ROLES[edit.role].desc}><${Select} value=${edit.role} disabled=${edit.id === Auth.user.id} onChange=${(v) => setEdit({ ...edit, role: v })} options=${Object.entries(ROLES).map(([k, r]) => [k, r.label])} /><//>
        <${Field} label=${edit.id ? 'Reset password' : 'Temporary password'} hint=${edit.id ? 'Leave blank to keep the current one' : 'At least 8 characters'}><${TextInput} autoComplete="off" value=${edit.newPw} onChange=${(v) => setEdit({ ...edit, newPw: v })} /><//>
        <${Saved} msg=${msg && !msg.ok ? msg : null} />
      </${Dialog}>` : null}
  </${Stack}>`;
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
  const cols = [
    { key: 'when', label: 'When', type: 'time' }, { key: 'what', label: 'What' },
    { key: 'detail', label: 'Detail', type: 'code', wrap: true, render: (r) => r.detail || '—' },
    { key: 'by', label: 'By', render: (r) => (r.by || '').split(' · ')[0] }, { key: 'reason', label: 'Reason', wrap: true, render: (r) => r.reason || '—' },
  ];
  return html`<${Stack} gap=${4}>
    <${PageHeader} k="Traceability" title="Audit log" sub="Every change to takt, targets, shifts and buzzers, every position correction and every sign-in, with who and when.">
      <${Button} icon="download" onClick=${csv}>Export CSV<//></${PageHeader}>
    <${SegmentedControl} label="Show" value=${f} onChange=${setF} options=${[{ value: 'all', label: 'All' }, { value: 'change', label: 'Changes & corrections' }, { value: 'access', label: 'Sign-ins' }]} />
    <${DataTable} columns=${cols} rows=${REMOTE && !remote ? null : rows} error=${remote && remote.error} empty="Nothing recorded yet." />
  </${Stack}>`;
}
export function NoAccess({ what }) { return html`<div class="page-wrap"><${EmptyState} icon="lock" title=${`${what} needs a different role`}>You are signed in as ${userName()}. Ask an administrator if you need access.<//></div>`; }
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
  const cols = [
    { key: 'name', label: 'Display' }, { key: 'line', label: 'Line' },
    { key: 'created', label: 'Created', type: 'time', render: (d) => `${when(d.created_at)} · ${d.created_by}` },
    { key: 'seen', label: 'Last seen', type: 'time', render: (d) => when(d.last_seen) },
    { key: 'status', label: 'Status', render: (d) => (d.revoked_at ? html`<${Tag} tone="paused" icon=${null}>Revoked<//>` : 'Active') },
    { key: 'act', label: '', type: 'action', render: (d) => (d.revoked_at ? null : html`<${Button} size="sm" variant="ghost" onClick=${() => revoke(d)}>Revoke<//>`) },
  ];
  return html`<${Stack} gap=${4}>
    <${PageHeader} k="Line displays · URD req 23" title="Display links" sub="Create one link per TV. Open it once on the TV: it then shows its line, read-only, with no sign-in. Revoke a link to disconnect that TV." />
    <${Cluster} gap=${3} align="flex-end">
      <${Field} label="Display name" style=${{ flex: 1, minWidth: 240 }}><${TextInput} value=${name} onChange=${setName} placeholder="e.g. Chassis line TV" /><//>
      <${Field} label="Line" style=${{ width: 160 }}><${Select} value=${line} onChange=${setLine} options=${[['trim', 'Trim'], ['chassis', 'Chassis'], ['final', 'Final']]} /><//>
      <${Button} variant="primary" icon="plus" disabled=${name.trim().length < 2} onClick=${create}>Create link<//>
    </${Cluster}>
    ${made ? html`<${Notice} kind="success" title=${`Link for ${made.name}`} actions=${html`<${Button} size="sm" icon="copy" onClick=${copy}>Copy link<//>`}>Shown once; open it on the TV.<div class="mono" style=${{ wordBreak: 'break-all', marginTop: 'var(--ds-space-1)' }}>${made.url}</div><//>` : null}
    <${Saved} msg=${msg} />
    <${DataTable} columns=${cols} rows=${list} rowKey=${(d) => d.id} rowClass=${(d) => (d.revoked_at ? 'ds-row-muted' : null)} empty="No display links yet." />
  </${Stack}>`;
}
