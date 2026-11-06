/* ── dialogs ── */
import { BV_FULL, BV_ICON } from '@mg/scene/brand';
import { userName } from '../auth.js';
import { VSTATE } from './inspector.js';
import { select } from './scenarios.js';
import { Act } from '../lib/act.js';
import { api } from '../lib/api.js';
import { REMOTE } from '../lib/source.js';
import { go } from '../lib/router.js';
import { M, POS, RT, WORK_POS, fmtClock, fmtDur, html, setUI, useState } from '../lib/runtime.js';
import { Button, Checkbox, Cluster, Dialog, Field, Notice, Select, Tabs, Tag, TextInput, Textarea } from '../ui/index.js';
import { VinText } from '../lib/ui-kit.js';

/* Scanner 1 at TL1: line-in (URD req 1). The only routine scan on the line. */
export function ScanDialog({ d }) {
  const S = RT.S;
  const [vin, setVin] = useState(d.vin || ''), [res, setRes] = useState(null), [scanning, setScanning] = useState(false);
  const head = M.bufferHead(S), headBody = head >= 0 ? S.bodyBuffer[head] : null;
  const doScan = () => { setScanning(true); setRes(null); setTimeout(() => { Act.entryScan(vin.trim().toUpperCase(), 'MANUAL').then((r) => { setRes(r); setScanning(false); }, (e) => { setRes({ ok: false, reason: e.message }); setScanning(false); }); }, 650); };
  const E0 = S.pos['TL1'];
  const activeV = S.vehOrder.map((id) => S.vehicles[id]).find((v) => v.state === 'IN_PROCESS' && v.carrierId && S.carriers[v.carrierId].posId && POS[S.carriers[v.carrierId].posId].kind === 'work');
  const entryState = !E0.carrierId ? (E0.reservedBy ? `skid ${E0.reservedBy} arriving` : 'no skid present') : E0.occ.vehicleId ? `occupied by ${S.vehicles[E0.occ.vehicleId].vin.slice(-6)}` : E0.occ.pendingBody ? 'body being placed' : `empty skid ${E0.carrierId} ready`;
  const garble = () => { const g = headBody ? headBody.label : 'LSJA34661TP248999'; return g.slice(0, 8) + (g[8] === '7' ? '3' : '7') + g.slice(9); };
  return html`<${Dialog} k="Scanner 1 · TL1 · line-in" title="Register a body entering the line" tag=${html`<${Tag} tone="sim">Simulated<//>`} onClose=${() => setUI({ dialog: null })}
    footer=${html`${res && res.ok && res.vehicleId ? html`<${Button} onClick=${() => { setUI({ dialog: null }); select({ kind: 'veh', id: res.vehicleId }); }}>Show vehicle<//>` : null}<${Button} onClick=${() => setUI({ dialog: null })}>Done<//><${Button} variant="primary" icon="scan" loading=${scanning} disabled=${!vin && !scanning} onClick=${() => !scanning && doScan()}>${scanning ? 'Scanning…' : 'Scan'}<//>`}>
      <div class=${'scanwin' + (scanning ? ' scanning' : '')}><div class="barcode"></div><div class="laser"></div></div>
      <${Field} label="VIN · 17 characters" error=${res && !res.ok ? 'Rejected · see below' : null}><${TextInput} data-autofocus="true" class="vin-input" data-state=${res ? (res.ok ? 'ok' : 'bad') : ''} maxLength="17" spellCheck="false" autoComplete="off" value=${vin} onChange=${(v) => { setVin(v.toUpperCase()); setRes(null); }} onKeyDown=${(e) => e.key === 'Enter' && vin && !scanning && doScan()} /><//>
      <${Cluster} gap=${2}>
        ${headBody ? html`<${Button} size="sm" tone="sim" onClick=${() => { setVin(headBody.label); setRes(null); }}>Label on next body<//>` : null}
        ${activeV ? html`<${Button} size="sm" tone="sim" onClick=${() => { setVin(activeV.vin); setRes(null); }}>VIN already on line<//>` : null}
        <${Button} size="sm" tone="sim" onClick=${() => { setVin(garble()); setRes(null); }}>Misread label<//></${Cluster}>
      <p class="note">TL1: <b>${entryState}</b>. Paint-shop buffer: <b>${S.bodyBuffer.filter(Boolean).length} of 6</b> bodies.${S.cfg.autoEntryScan ? ' Auto scan is on, so the simulator also scans bodies at the planned pace.' : ''} After this scan the VIN is tracked from station to station without further scans.</p>
      ${res ? html`<${Notice} kind=${res.ok ? 'success' : 'error'} title=${res.ok ? 'Accepted' : 'Rejected'}><div>${res.reason}</div>
        <ul class="ds-list">${res.ok ? [html`<li key="a">Body taken from the buffer and placed on the Trim conveyor at TL1</li>`, html`<li key="b">Line-in recorded ${fmtClock(res.t)}</li>`] : [html`<li key="c">No production record was created or changed</li>`, html`<li key="d">Logged as an exception</li>`]}</ul><//>` : null}
  </${Dialog}>`;
}
/* Taking a unit offline (URD req 2–3, 6): scan the VIN at the station; the station is recorded. */
export function OffLineDialog({ d }) {
  const S = RT.S, v = S.vehicles[d.vehicleId];
  const chk = v ? M.canTakeOffLine(S, v.id) : { ok: false }, at = chk.ok ? chk.posId : null;
  const occ = at && S.pos[at].occ, an = at ? M.andonState(S, at) : null;
  const [reason, setReason] = useState(d.reason || (an && an.state === 'over' ? M.OFFLINE_REASONS[0] : M.OFFLINE_REASONS[1])), [notes, setNotes] = useState(''), [scan, setScan] = useState(''), [scanning, setScanning] = useState(false), [ok, setOk] = useState(false), [err, setErr] = useState(null);
  if (!v) return null;
  const scanner = at === 'TL6' ? 'Offline scanner at TL6 (end of Trim)' : at && ['FL1', 'FL2', 'FL3'].includes(at) ? 'Handheld scanner 1 (FL1–FL3)' : 'Handheld scanner 2 (FL4–FL7)';
  const doScan = () => { setScanning(true); setTimeout(() => { setScan(v.vin); setScanning(false); }, 550); };
  const submit = () => Act.takeOffLine(v.id, { reason, notes, by: userName(), scan }).then((r) => { if (!r.ok) { setErr(r.reason); return; } setUI({ dialog: null, selection: { kind: 'veh', id: v.id } }); }, (e) => setErr(e.message));
  const scanOk = scan && scan.trim().toUpperCase() === v.vin;
  return html`<${Dialog} k=${`${at || '—'} · ${scanner}`} title="Take unit offline" onClose=${() => setUI({ dialog: null })}
    footer=${html`<${Button} onClick=${() => setUI({ dialog: null })}>Cancel<//><${Button} variant="danger" icon="exit" disabled=${!ok || !at || !scan} onClick=${submit}>Take offline<//>`}>
      <dl class="kv"><dt>Tracking shows</dt><dd><${VinText} vin=${v.vin} /></dd><dt>Variant</dt><dd>${v.variant.name}</dd><dt>Station</dt><dd class="mono">${at || M.locationLabel(S, v)}</dd>
        ${an && an.state !== 'idle' ? html`<dt>Cycle at station</dt><dd class="mono" style=${{ color: an.state === 'over' ? 'var(--ds-status-critical)' : null }}>${fmtDur(an.cycle)} / ${fmtDur(an.takt)}</dd>` : null}</dl>
      ${!at ? html`<${Notice} kind="error">${chk.reason}<//>` : null}
      <${Field} label="1 · Scan the VIN on the unit" error=${scan && !scanOk && scan.length === 17 ? `This VIN does not match the unit tracked at ${at}. Check the unit, or correct its position first.` : null}>
        <${Cluster} gap=${2} nowrap=${true}><${TextInput} data-autofocus="true" class="vin-input" style=${{ flex: 1 }} data-state=${scan ? (scanOk ? 'ok' : 'bad') : ''} maxLength="17" spellCheck="false" autoComplete="off" value=${scan} placeholder="Scan or type" onChange=${(x) => { setScan(x.toUpperCase()); setErr(null); }} /><${Button} icon="scan" loading=${scanning} onClick=${doScan}>${scanning ? 'Scanning…' : 'Scan label'}<//></${Cluster}><//>
      <${Field} label="2 · Reason"><${Select} value=${reason} onChange=${setReason} options=${M.OFFLINE_REASONS.map((r) => [r, r])} /><//>
      <${Field} label="Notes for the record"><${Textarea} rows=${2} value=${notes} onChange=${setNotes} placeholder="e.g. Grille clip broken, would not seat" /><//>
      <${Checkbox} boxed tone="critical" id="off-ok" checked=${ok} onChange=${setOk}>The unit leaves the line now. It is removed from station counts and will <b>not</b> count towards the target unless it returns and completes. Recorded by <b>${userName()}</b>.<//>
      ${err ? html`<${Notice} kind="error">${err}<//>` : null}
  </${Dialog}>`;
}
/* Return to line (URD §6): rejoin at the station it left. */
export function ReturnDialog({ d }) {
  const S = RT.S, v = S.vehicles[d.vehicleId], [note, setNote] = useState(''), [err, setErr] = useState(null);
  if (!v || !v.offline) return null;
  const pos = v.offline.pos, slot = M.stationCount(S, pos);
  const submit = () => Act.returnToLine(v.id, userName(), note).then((r) => { if (!r.ok) { setErr(r.reason); return; } setUI({ dialog: null, selection: { kind: 'veh', id: v.id } }); }, (e) => setErr(e.message));
  return html`<${Dialog} k=${`Offline since ${fmtClock(v.offline.t, false)} · ${fmtDur(S.t - v.offline.t)}`} title=${`Return ${v.vin.slice(-6)} to the line`} onClose=${() => setUI({ dialog: null })}
    footer=${html`<${Button} onClick=${() => setUI({ dialog: null })}>Cancel<//><${Button} variant="primary" icon="ret" onClick=${submit}>Return to ${pos}<//>`}>
      <dl class="kv"><dt>VIN</dt><dd><${VinText} vin=${v.vin} /></dd><dt>Taken off at</dt><dd class="mono">${pos}</dd><dt>Reason</dt><dd>${v.offline.reason}</dd><dt>${pos} now</dt><dd>${slot ? 'occupied · it waits for the station to be free' : 'free · it can rejoin straight away'}</dd></dl>
      <${Field} label="What was done"><${Textarea} rows=${2} value=${note} onChange=${setNote} placeholder="e.g. Correct grille fitted offline; recheck at FL4" /><//>
      <p class="note">It rejoins at <b>${pos}</b>, where work restarts. It counts towards the target only when it completes the line. Both visits stay in its history.</p>
      ${err ? html`<${Notice} kind="error">${err}<//>` : null}
  </${Dialog}>`;
}
/* Manual position correction (URD req 7): authorised users only; every change is audited. */
export function CorrectDialog({ d }) {
  const S = RT.S, here = S.pos[d.pos] && S.pos[d.pos].occ, cur = here && here.vehicleId && S.vehicles[here.vehicleId];
  const [mode, setMode] = useState('move'), [vin, setVin] = useState(d.vin || (cur ? cur.vin : '')), [to, setTo] = useState(''), [reason, setReason] = useState(''), [res, setRes] = useState(null);
  const active = S.vehOrder.map((id) => S.vehicles[id]).filter((v) => M.isActive(v) && v.carrierId && S.carriers[v.carrierId].mode === 'POS');
  const targets = WORK_POS.filter((id) => S.pos[id].carrierId && id !== (cur && cur.posId));
  const submit = () => (mode === 'move' ? Act.correctPosition(vin, to, userName(), reason) : Act.clearGhost(d.pos, userName(), reason)).then((r) => { setRes(r); if (r.ok) setTimeout(() => setUI({ dialog: null }), 900); }, (e) => setRes({ ok: false, reason: e.message }));
  return html`<${Dialog} k="Authorised · audited" title="Correct vehicle position" onClose=${() => setUI({ dialog: null })}
    footer=${html`<${Button} onClick=${() => setUI({ dialog: null })}>Cancel<//><${Button} variant="primary" icon="swap" disabled=${!reason.trim() || (mode === 'move' && !to)} onClick=${submit}>Apply correction<//>`}>
      <${Tabs} label="Correction" value=${mode} onChange=${(k) => { setMode(k); setRes(null); }} items=${[{ value: 'move', label: 'Move or swap a VIN' }, { value: 'ghost', label: `Unit not at ${d.pos}` }]} />
      ${mode === 'move' ? html`
        <${Field} label="VIN that is out of step"><${Select} value=${vin} onChange=${setVin} options=${active.map((v) => [v.vin, `${v.vin.slice(-6)} · recorded at ${S.carriers[v.carrierId].posId}`])} /><//>
        <${Field} label="Where it really is" hint="If another unit is recorded at that station, the two are swapped. Only stations with a carrier standing at them can be chosen."><${Select} value=${to} onChange=${setTo} options=${[['', 'Choose a station…'], ...targets.map((id) => { const o = S.pos[id].occ, ov = o && o.vehicleId && S.vehicles[o.vehicleId]; return [id, `${id}${ov ? ` · holds ${ov.vin.slice(-6)} (will swap)` : ' · empty carrier'}`]; })]} /><//>`
      : html`<p class="note">${cur ? html`Tracking shows <b class="mono">${cur.vin.slice(-6)}</b> at ${d.pos}. If it is not physically there, it is recorded offline as “not found at station” so the counts are right. It can be returned later.` : `No unit is recorded at ${d.pos}.`}</p>`}
      <${Field} label="Reason (required, kept in the audit log)" required=${true}><${TextInput} value=${reason} onChange=${setReason} placeholder="e.g. Units swapped by hand at FL3/FL4" /><//>
      ${res ? html`<${Notice} kind=${res.ok ? 'success' : 'error'}>${res.ok ? (mode === 'move' ? `Corrected${res.swapped ? ` · swapped with ${res.swapped.slice(-6)}` : ''}. Logged in the audit trail.` : 'Recorded offline. Logged in the audit trail.') : res.reason}<//>` : null}
  </${Dialog}>`;
}
/* VIN lookup (URD req 5): type part of a VIN and open its record. */
export function VinSearchDialog() {
  const S = RT.S, [q, setQ] = useState(''), [i, setI] = useState(0), [hist, setHist] = useState(null);
  // live screens: units from earlier days are in the server's stored history, not in memory
  const lookUp = async () => {
    setHist('…');
    const r = await api(`/api/vehicles/${encodeURIComponent(Q)}`);
    if (!r.ok) return setHist(r.error || 'Not found.');
    const v = { history: [], ...r.vehicle }; // the event history of old units stays in the events table
    RT.archive = RT.archive || {}; RT.archive[v.id] = v; setHist(null); open(v);
  };
  const Q = q.trim().toUpperCase();
  const all = S.vehOrder.map((id) => S.vehicles[id]);
  const hits = (Q ? all.filter((v) => v.vin.includes(Q)) : all.slice().reverse()).slice(0, 30);
  const open = (v) => { setUI({ dialog: null }); if (RT.route.page !== 'floor') go('floor'); select({ kind: 'veh', id: v.id }, M.isActive(v)); };
  return html`<${Dialog} k="Vehicle lookup" title="Find a vehicle by VIN" onClose=${() => setUI({ dialog: null })}>
      <${Field} label="VIN"><${TextInput} data-autofocus="true" role="combobox" aria-expanded="true" aria-controls="vin-results" value=${q} placeholder="Full VIN or the last digits, e.g. 248271" spellCheck="false" autoComplete="off"
        onChange=${(x) => { setQ(x); setI(0); }} onKeyDown=${(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setI(Math.min(hits.length - 1, i + 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setI(Math.max(0, i - 1)); } else if (e.key === 'Enter' && hits[i]) open(hits[i]); }} /><//>
      <div class="vresults" id="vin-results" role="listbox" aria-label="Matching vehicles">${hits.length ? hits.map((v, k) => { const [lbl, tone] = VSTATE[v.state]; return html`<button key=${v.id} class="vresult" role="option" aria-selected=${k === i} onClick=${() => open(v)}>
        <span><${VinText} vin=${v.vin} /></span><span class=${'chip c-' + tone}>${lbl}</span>
        <span class="sub">${v.variant.name} · ${M.locationLabel(S, v)}</span><span class="sub mono">in ${fmtClock(v.entryT, false)}${v.lineOffT ? ` · done ${fmtClock(v.lineOffT, false)}` : ''}</span></button>`; }) : html`<div class="empty">No vehicle with “${Q}” in its VIN in this session.</div>`}</div>
      ${REMOTE && !hits.length && Q.length === 17 ? html`<${Cluster} gap=${2}><${Button} size="sm" icon="search" onClick=${lookUp}>Search stored history<//>${hist ? html`<span class="note">${hist}</span>` : null}</${Cluster}>` : null}
      <p class="note">${REMOTE ? 'Searches vehicles from today and yesterday here; for older ones, type the full 17-character VIN and search the stored history.' : 'Searches every vehicle registered at Scanner 1 in this session: on the line, offlined and completed.'}</p>
  </${Dialog}>`;
}
export function AboutDialog() {
  const li = (t, i) => html`<li key=${i}>${t}</li>`;
  return html`<${Dialog} size="lg" k="Prototype notes" title="Layout source, assumptions and PLC integration" onClose=${() => setUI({ dialog: null })} footer=${html`<${Button} onClick=${() => setUI({ dialog: null })}>Close<//>`}>
    <div class="bv-about"><img class="bv-full" src=${BV_FULL} alt="Bolt & Volt Pvt Ltd" /><span class="bv-light"><img src=${BV_ICON} alt="" width="40" height="44" /><span><b>Bolt & Volt</b><small>Pvt Ltd · Since 2004</small></span></span><p class="note">Designed and built by Bolt & Volt for MG JW Automobile, General Assembly.</p></div>
    <div class="ds-grid" style=${{ '--min': '260px', '--gap': 'var(--ds-space-6)', fontSize: 'var(--ds-size-13)', lineHeight: 1.55 }}>
      <div><div class="micro">Line flow (confirmed by the plant)</div><ul style=${{ paddingLeft: 18, color: 'var(--text-2)' }}>${[
        'Trim TL1–TL5 on a floor conveyor (moved by hand today). Scanner 1 receives the VIN at TL1.',
        'TL6 is a Trim work point, the hanger load point and the end of Trim, where a unit can be taken offline with a scan.',
        'Exactly 4 hangers: TL6 → CL1 → CL2 → CL3 → Buffer → CL4 → FL1. The buffer is normally empty and holds a loaded hanger when CL4 is busy.',
        'FL1 is a Final work point on the hanger; the body is then lowered onto the Final conveyor FL2–FL7. Empty hangers return FL1 → TL6 on a separate rail.',
        'FL7 is the final inspection point. An end-of-line photo-eye detects completion; there is no scan.',
        'Units move on their own when the station finishes and the next point is free. Position is tracked without extra scans.',
        'Every Chassis and Final station has two call buttons, Supervisor and Maintenance, and a buzzer that rings over takt.',
      ].map(li)}</ul></div>
      <div><div class="micro">Assumptions (labelled, configurable)</div><ul style=${{ paddingLeft: 18, color: 'var(--text-2)' }}>${[
        'Which part goes on at which point, and the target times, follow the plant split but are assumed.',
        'The CL2 engine/transmission scan from the GA drawing is an option, off by default (outside the URD).',
        'Conveyor speeds, hanger travel times, return-rail route, shift times, breaks and the 30-vehicle shift target are assumed.',
        'Units with problems are taken off the line and recorded; the off-line hold area location is assumed.',
      ].map(li)}</ul></div>
      <div><div class="micro">Needed for real PLC integration</div><ul style=${{ paddingLeft: 18, color: 'var(--text-2)' }}>${[
        'PLC tag list or event interface: carrier arrival/position confirmation, presence sensors, station call buttons, buzzer outputs, fault codes.',
        'Scanner models and protocols for Scanner 1 and the offline scanners; MES source for VIN and variant data.',
        'Team work-complete signal per position and approved targets per variant.',
        'Controls safety review: this HMI shows permissives and records requests only. Motion authorization stays in the PLC and safety system.',
      ].map(li)}</ul></div>
    </div>
  </${Dialog}>`;
}

