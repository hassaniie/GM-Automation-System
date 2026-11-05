/* ── dialogs ── */
import { BV_FULL, BV_ICON } from '@mg/scene/brand';
import { userName } from '../auth.js';
import { VSTATE } from './inspector.js';
import { select } from './scenarios.js';
import { Act } from '../lib/act.js';
import { go } from '../lib/router.js';
import { M, POS, RT, WORK_POS, fmtClock, fmtDur, html, setUI, useEffect, useRef, useState } from '../lib/runtime.js';
import { Icon, VinText } from '../lib/ui-kit.js';

/* Scanner 1 at TL1: line-in (URD req 1). The only routine scan on the line. */
export function ScanDialog({ d }) {
  const S = RT.S;
  const [vin, setVin] = useState(d.vin || ''), [res, setRes] = useState(null), [scanning, setScanning] = useState(false), inp = useRef(null);
  useEffect(() => { inp.current && inp.current.focus(); }, []);
  const head = M.bufferHead(S), headBody = head >= 0 ? S.bodyBuffer[head] : null;
  const doScan = () => { setScanning(true); setRes(null); setTimeout(() => { Act.entryScan(vin.trim().toUpperCase(), 'MANUAL').then((r) => { setRes(r); setScanning(false); }, (e) => { setRes({ ok: false, reason: e.message }); setScanning(false); }); }, 650); };
  const E0 = S.pos['TL1'];
  const activeV = S.vehOrder.map((id) => S.vehicles[id]).find((v) => v.state === 'IN_PROCESS' && v.carrierId && S.carriers[v.carrierId].posId && POS[S.carriers[v.carrierId].posId].kind === 'work');
  const entryState = !E0.carrierId ? (E0.reservedBy ? `skid ${E0.reservedBy} arriving` : 'no skid present') : E0.occ.vehicleId ? `occupied by ${S.vehicles[E0.occ.vehicleId].vin.slice(-6)}` : E0.occ.pendingBody ? 'body being placed' : `empty skid ${E0.carrierId} ready`;
  const garble = () => { const g = headBody ? headBody.label : 'LSJA34661TP248999'; return g.slice(0, 8) + (g[8] === '7' ? '3' : '7') + g.slice(9); };
  return html`<div class="scrim" onClick=${(e) => e.target === e.currentTarget && setUI({ dialog: null })}><div class="glass dialog ticks" role="dialog" aria-modal="true" aria-labelledby="scan-h">
    <div class="dialog-head"><div style=${{ flex: 1 }}><div class="micro">Scanner 1 · TL1 · line-in</div><h3 id="scan-h">Register a body entering the line</h3></div><span class="sim-tag">SIMULATED</span><button class="btn sm ghost icon" aria-label="Close" onClick=${() => setUI({ dialog: null })}><${Icon} n="x" /></button></div>
    <div class="dialog-body">
      <div class=${'scanwin' + (scanning ? ' scanning' : '')}><div class="barcode"></div><div class="laser"></div></div>
      <div class="field"><label for="vin-in">VIN · 17 characters</label><input id="vin-in" ref=${inp} class="vin-input" aria-invalid=${res && !res.ok ? 'true' : 'false'} data-state=${res ? (res.ok ? 'ok' : 'bad') : ''} maxLength="17" spellCheck="false" autoComplete="off" value=${vin} onInput=${(e) => { setVin(e.target.value.toUpperCase()); setRes(null); }} onKeyDown=${(e) => e.key === 'Enter' && vin && !scanning && doScan()} /></div>
      <div class="actions">
        ${headBody ? html`<button class="btn sm sim" onClick=${() => { setVin(headBody.label); setRes(null); }}>Label on next body</button>` : null}
        ${activeV ? html`<button class="btn sm sim" onClick=${() => { setVin(activeV.vin); setRes(null); }}>VIN already on line</button>` : null}
        <button class="btn sm sim" onClick=${() => { setVin(garble()); setRes(null); }}>Misread label</button></div>
      <p class="note">TL1: <b>${entryState}</b>. Paint-shop buffer: <b>${S.bodyBuffer.filter(Boolean).length} of 6</b> bodies.${S.cfg.autoEntryScan ? ' Auto scan is on, so the simulator also scans bodies at the planned pace.' : ''} After this scan the VIN is tracked from station to station without further scans.</p>
      ${res ? html`<div class=${'result ' + (res.ok ? 'ok' : 'bad')} role="alert"><div class="ttl" style=${{ color: res.ok ? 'var(--ok)' : 'var(--crit)' }}><${Icon} n=${res.ok ? 'checkc' : 'xc'} />${res.ok ? 'Accepted' : 'Rejected'}</div><div>${res.reason}</div>
        <ul>${res.ok ? [html`<li key="a">Body taken from the buffer and placed on the Trim conveyor at TL1</li>`, html`<li key="b">Line-in recorded ${fmtClock(res.t)}</li>`] : [html`<li key="c">No production record was created or changed</li>`, html`<li key="d">Logged as an exception</li>`]}</ul></div>` : null}
    </div>
    <div class="dialog-foot">${res && res.ok && res.vehicleId ? html`<button class="btn" onClick=${() => { setUI({ dialog: null }); select({ kind: 'veh', id: res.vehicleId }); }}>Show vehicle</button>` : null}<button class="btn" onClick=${() => setUI({ dialog: null })}>Done</button><button class="btn primary" aria-busy=${scanning ? 'true' : 'false'} disabled=${!vin && !scanning} onClick=${() => !scanning && doScan()}><${Icon} n="scan" />${scanning ? 'Scanning…' : 'Scan'}</button></div>
  </div></div>`;
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
  return html`<div class="scrim" onClick=${(e) => e.target === e.currentTarget && setUI({ dialog: null })}><div class="glass dialog ticks" role="dialog" aria-modal="true" aria-labelledby="off-h">
    <div class="dialog-head"><div style=${{ flex: 1 }}><div class="micro">${at || '—'} · ${scanner}</div><h3 id="off-h">Take unit offline</h3></div><button class="btn sm ghost icon" aria-label="Close" onClick=${() => setUI({ dialog: null })}><${Icon} n="x" /></button></div>
    <div class="dialog-body">
      <dl class="kv"><dt>Tracking shows</dt><dd><${VinText} vin=${v.vin} /></dd><dt>Variant</dt><dd>${v.variant.name}</dd><dt>Station</dt><dd class="mono">${at || M.locationLabel(S, v)}</dd>
        ${an && an.state !== 'idle' ? html`<dt>Cycle at station</dt><dd class="mono" style=${{ color: an.state === 'over' ? 'var(--crit)' : null }}>${fmtDur(an.cycle)} / ${fmtDur(an.takt)}</dd>` : null}</dl>
      ${!at ? html`<div class="result bad">${chk.reason}</div>` : null}
      <div class="field"><label for="off-scan">1 · Scan the VIN on the unit</label><div style=${{ display: 'flex', gap: 8 }}><input id="off-scan" class="vin-input" style=${{ flex: 1 }} data-state=${scan ? (scanOk ? 'ok' : 'bad') : ''} maxLength="17" spellCheck="false" autoComplete="off" value=${scan} placeholder="Scan or type" onInput=${(e) => { setScan(e.target.value.toUpperCase()); setErr(null); }} /><button class="btn" aria-busy=${scanning ? 'true' : 'false'} onClick=${doScan}><${Icon} n="scan" />${scanning ? 'Scanning…' : 'Scan label'}</button></div>
        ${scan && !scanOk && scan.length === 17 ? html`<div class="note" style=${{ color: 'var(--crit)' }}>This VIN does not match the unit tracked at ${at}. Check the unit, or correct its position first.</div>` : null}</div>
      <div class="field"><label for="off-reason">2 · Reason</label><select id="off-reason" value=${reason} onChange=${(e) => setReason(e.target.value)}>${M.OFFLINE_REASONS.map((r) => html`<option key=${r}>${r}</option>`)}</select></div>
      <div class="field"><label for="off-notes">Notes for the record</label><textarea id="off-notes" rows="2" value=${notes} onInput=${(e) => setNotes(e.target.value)} placeholder="e.g. Grille clip broken, would not seat"></textarea></div>
      <label class="confirm-row" for="off-ok"><input id="off-ok" type="checkbox" checked=${ok} onChange=${(e) => setOk(e.target.checked)} /><span>The unit leaves the line now. It is removed from station counts and will <b>not</b> count towards the target unless it returns and completes. Recorded by <b>${userName()}</b>.</span></label>
      ${err ? html`<div class="result bad">${err}</div>` : null}
    </div>
    <div class="dialog-foot"><button class="btn" onClick=${() => setUI({ dialog: null })}>Cancel</button><button class="btn danger" disabled=${!ok || !at || !scan} onClick=${submit}><${Icon} n="exit" />Take offline</button></div>
  </div></div>`;
}
/* Return to line (URD §6): rejoin at the station it left. */
export function ReturnDialog({ d }) {
  const S = RT.S, v = S.vehicles[d.vehicleId], [note, setNote] = useState(''), [err, setErr] = useState(null);
  if (!v || !v.offline) return null;
  const pos = v.offline.pos, slot = M.stationCount(S, pos);
  const submit = () => Act.returnToLine(v.id, userName(), note).then((r) => { if (!r.ok) { setErr(r.reason); return; } setUI({ dialog: null, selection: { kind: 'veh', id: v.id } }); }, (e) => setErr(e.message));
  return html`<div class="scrim" onClick=${(e) => e.target === e.currentTarget && setUI({ dialog: null })}><div class="glass dialog ticks" role="dialog" aria-modal="true" aria-labelledby="ret-h">
    <div class="dialog-head"><div style=${{ flex: 1 }}><div class="micro">Offline since ${fmtClock(v.offline.t, false)} · ${fmtDur(S.t - v.offline.t)}</div><h3 id="ret-h">Return ${v.vin.slice(-6)} to the line</h3></div><button class="btn sm ghost icon" aria-label="Close" onClick=${() => setUI({ dialog: null })}><${Icon} n="x" /></button></div>
    <div class="dialog-body">
      <dl class="kv"><dt>VIN</dt><dd><${VinText} vin=${v.vin} /></dd><dt>Taken off at</dt><dd class="mono">${pos}</dd><dt>Reason</dt><dd>${v.offline.reason}</dd><dt>${pos} now</dt><dd>${slot ? 'occupied · it waits for the station to be free' : 'free · it can rejoin straight away'}</dd></dl>
      <div class="field"><label for="ret-note">What was done</label><textarea id="ret-note" rows="2" value=${note} onInput=${(e) => setNote(e.target.value)} placeholder="e.g. Correct grille fitted offline; recheck at FL4"></textarea></div>
      <p class="note">It rejoins at <b>${pos}</b>, where work restarts. It counts towards the target only when it completes the line. Both visits stay in its history.</p>
      ${err ? html`<div class="result bad">${err}</div>` : null}
    </div>
    <div class="dialog-foot"><button class="btn" onClick=${() => setUI({ dialog: null })}>Cancel</button><button class="btn primary" onClick=${submit}><${Icon} n="ret" />Return to ${pos}</button></div>
  </div></div>`;
}
/* Manual position correction (URD req 7): authorised users only; every change is audited. */
export function CorrectDialog({ d }) {
  const S = RT.S, here = S.pos[d.pos] && S.pos[d.pos].occ, cur = here && here.vehicleId && S.vehicles[here.vehicleId];
  const [mode, setMode] = useState('move'), [vin, setVin] = useState(d.vin || (cur ? cur.vin : '')), [to, setTo] = useState(''), [reason, setReason] = useState(''), [res, setRes] = useState(null);
  const active = S.vehOrder.map((id) => S.vehicles[id]).filter((v) => M.isActive(v) && v.carrierId && S.carriers[v.carrierId].mode === 'POS');
  const targets = WORK_POS.filter((id) => S.pos[id].carrierId && id !== (cur && cur.posId));
  const submit = () => (mode === 'move' ? Act.correctPosition(vin, to, userName(), reason) : Act.clearGhost(d.pos, userName(), reason)).then((r) => { setRes(r); if (r.ok) setTimeout(() => setUI({ dialog: null }), 900); }, (e) => setRes({ ok: false, reason: e.message }));
  return html`<div class="scrim" onClick=${(e) => e.target === e.currentTarget && setUI({ dialog: null })}><div class="glass dialog ticks" role="dialog" aria-modal="true" aria-labelledby="cor-h">
    <div class="dialog-head"><div style=${{ flex: 1 }}><div class="micro">Authorised · audited</div><h3 id="cor-h">Correct vehicle position</h3></div><button class="btn sm ghost icon" aria-label="Close" onClick=${() => setUI({ dialog: null })}><${Icon} n="x" /></button></div>
    <div class="dialog-body">
      <div class="tabs" role="tablist" style=${{ margin: 0 }}>${[['move', 'Move or swap a VIN'], ['ghost', `Unit not at ${d.pos}`]].map(([k, l]) => html`<button key=${k} role="tab" aria-selected=${mode === k} onClick=${() => { setMode(k); setRes(null); }}>${l}</button>`)}</div>
      ${mode === 'move' ? html`
        <div class="field"><label for="cor-vin">VIN that is out of step</label><select id="cor-vin" value=${vin} onChange=${(e) => setVin(e.target.value)}>${active.map((v) => html`<option key=${v.id} value=${v.vin}>${v.vin.slice(-6)} · recorded at ${S.carriers[v.carrierId].posId}</option>`)}</select></div>
        <div class="field"><label for="cor-to">Where it really is</label><select id="cor-to" value=${to} onChange=${(e) => setTo(e.target.value)}><option value="">Choose a station…</option>${targets.map((id) => { const o = S.pos[id].occ, ov = o && o.vehicleId && S.vehicles[o.vehicleId]; return html`<option key=${id} value=${id}>${id}${ov ? ` · holds ${ov.vin.slice(-6)} (will swap)` : ' · empty carrier'}</option>`; })}</select></div>
        <p class="note">If another unit is recorded at that station, the two are swapped. Only stations with a carrier standing at them can be chosen.</p>`
      : html`<p class="note">${cur ? html`Tracking shows <b class="mono">${cur.vin.slice(-6)}</b> at ${d.pos}. If it is not physically there, it is recorded offline as “not found at station” so the counts are right. It can be returned later.` : `No unit is recorded at ${d.pos}.`}</p>`}
      <div class="field"><label for="cor-why">Reason (required, kept in the audit log)</label><input id="cor-why" value=${reason} onInput=${(e) => setReason(e.target.value)} placeholder="e.g. Units swapped by hand at FL3/FL4" /></div>
      ${res ? html`<div class=${'result ' + (res.ok ? 'ok' : 'bad')}>${res.ok ? (mode === 'move' ? `Corrected${res.swapped ? ` · swapped with ${res.swapped.slice(-6)}` : ''}. Logged in the audit trail.` : 'Recorded offline. Logged in the audit trail.') : res.reason}</div>` : null}
    </div>
    <div class="dialog-foot"><button class="btn" onClick=${() => setUI({ dialog: null })}>Cancel</button><button class="btn primary" disabled=${!reason.trim() || (mode === 'move' && !to)} onClick=${submit}><${Icon} n="swap" />Apply correction</button></div>
  </div></div>`;
}
/* VIN lookup (URD req 5): type part of a VIN and open its record. */
export function VinSearchDialog() {
  const S = RT.S, [q, setQ] = useState(''), [i, setI] = useState(0), inp = useRef(null);
  useEffect(() => { inp.current && inp.current.focus(); }, []);
  const Q = q.trim().toUpperCase();
  const all = S.vehOrder.map((id) => S.vehicles[id]);
  const hits = (Q ? all.filter((v) => v.vin.includes(Q)) : all.slice().reverse()).slice(0, 30);
  const open = (v) => { setUI({ dialog: null }); if (RT.route.page !== 'floor') go('floor'); select({ kind: 'veh', id: v.id }, M.isActive(v)); };
  return html`<div class="scrim" onClick=${(e) => e.target === e.currentTarget && setUI({ dialog: null })}><div class="glass dialog ticks" role="dialog" aria-modal="true" aria-labelledby="vs-h">
    <div class="dialog-head"><div style=${{ flex: 1 }}><div class="micro">Vehicle lookup</div><h3 id="vs-h">Find a vehicle by VIN</h3></div><button class="btn sm ghost icon" aria-label="Close" onClick=${() => setUI({ dialog: null })}><${Icon} n="x" /></button></div>
    <div class="dialog-body">
      <div class="vsearch"><input ref=${inp} value=${q} placeholder="Full VIN or the last digits, e.g. 248271" aria-label="VIN" spellCheck="false" autoComplete="off"
        onInput=${(e) => { setQ(e.target.value); setI(0); }} onKeyDown=${(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setI(Math.min(hits.length - 1, i + 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setI(Math.max(0, i - 1)); } else if (e.key === 'Enter' && hits[i]) open(hits[i]); }} /></div>
      <div class="vresults" role="listbox">${hits.length ? hits.map((v, k) => { const [lbl, tone] = VSTATE[v.state]; return html`<button key=${v.id} class="vresult" role="option" aria-selected=${k === i} onClick=${() => open(v)}>
        <span><${VinText} vin=${v.vin} /></span><span class=${'chip c-' + tone}>${lbl}</span>
        <span class="sub">${v.variant.name} · ${M.locationLabel(S, v)}</span><span class="sub mono">in ${fmtClock(v.entryT, false)}${v.lineOffT ? ` · done ${fmtClock(v.lineOffT, false)}` : ''}</span></button>`; }) : html`<div class="empty">No vehicle with “${Q}” in its VIN in this session.</div>`}</div>
      <p class="note">Searches every vehicle registered at Scanner 1 in this session: on the line, offlined and completed.</p>
    </div></div></div>`;
}
export function AboutDialog() {
  const li = (t, i) => html`<li key=${i}>${t}</li>`;
  return html`<div class="scrim" onClick=${(e) => e.target === e.currentTarget && setUI({ dialog: null })}><div class="glass dialog ticks" style=${{ width: 'min(900px, 100%)' }} role="dialog" aria-modal="true" aria-labelledby="ab-h">
    <div class="bv-about"><img class="bv-full" src=${BV_FULL} alt="Bolt & Volt Pvt Ltd" /><span class="bv-light"><img src=${BV_ICON} alt="" width="40" height="44" /><span><b>Bolt & Volt</b><small>Pvt Ltd · Since 2004</small></span></span><p class="note">Designed and built by Bolt & Volt for MG JW Automobile, General Assembly.</p></div>
    <div class="dialog-head"><div style=${{ flex: 1 }}><div class="micro">Prototype notes</div><h3 id="ab-h">Layout source, assumptions and PLC integration</h3></div><button class="btn sm ghost icon" aria-label="Close" onClick=${() => setUI({ dialog: null })}><${Icon} n="x" /></button></div>
    <div class="dialog-body" style=${{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 22, fontSize: 13, lineHeight: 1.55 }}>
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
    <div class="dialog-foot"><button class="btn" onClick=${() => setUI({ dialog: null })}>Close</button></div>
  </div></div>`;
}

