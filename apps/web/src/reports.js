/* ════════════════════════════════════════════════════════════════════════
   Reports (URD req 28–29): by day or date range, shift and line; Excel and PDF.
   On the line server the tables, Excel and PDF come from the stored database
   (/api/reports). In the offline demo, shifts run in this session come from the
   live records; earlier days are generated deterministically from the seed and
   labelled as simulated history, so the date filter has something to show.
   The table definitions are shared (@mg/reports).
   ════════════════════════════════════════════════════════════════════════ */
import { MAX_RANGE_DAYS, buildReport, dateRange, datasetFromState, kpis, liveHas, reportFileName, reportSheets, selection } from '@mg/reports';
import { NoAccess, PageHead, downloadText } from './admin.js';
import { can, userName } from './auth.js';
import { api } from './lib/api.js';
import { go } from './lib/router.js';
import { AREAS, M, POS, RT, fmtClock, fmtDur, html, useEffect, useReducer, useState } from './lib/runtime.js';
import { REMOTE } from './lib/source.js';
import { Icon } from './lib/ui-kit.js';

const REPORT_SECTIONS = [['prod', 'Production summary'], ['cycle', 'Station cycle times'], ['down', 'Downtime'], ['off', 'Offlined vehicles'], ['calls', 'Assist calls']];
function shiftStarted(S, date, name) { const sh = M.shiftsFor(S, date).find((x) => x.name === name); return sh && M.dayOfDate(S, date) * 86400 + sh.start <= S.t; }

/* local mode (offline demo): this browser's records, plus generated history for earlier days */
function reportData(S, date, shiftSel, lineSel) {
  const names = M.shiftsFor(S, date).map((s) => s.name), shifts = shiftSel === 'all' ? names : names.filter((n) => n === shiftSel);
  const { lines, stations } = selection(lineSel);
  const out = { prod: [], cycle: [], down: [], off: [], calls: [], byDay: [], sources: [], notStarted: [] };
  for (const sh of shifts) {
    const key = M.shiftKey(date, sh);
    if (!shiftStarted(S, date, sh)) { out.notStarted.push(sh); continue; }
    if (liveHas(S, key)) {
      out.sources.push(`${sh}: live records`);
      const r = buildReport(datasetFromState(S, [key]), lineSel);
      for (const k of ['prod', 'cycle', 'down', 'off', 'calls']) out[k].push(...r[k]);
    } else { out.sources.push(`${sh}: simulated history`); synthRows(S, date, sh, lines, stations, out); }
  }
  return out;
}
function synthRows(S, date, sh, lines, stations, out) {
  const r = (k) => M.hash01(`${date}|${sh}|${k}`), base = M.dayOfDate(S, date) * 86400, def = M.shiftsFor(S, date).find((x) => x.name === sh), tg = M.targetsFor(S, date, sh);
  const lineDown = {};
  for (const a of lines) {
    const target = tg[a], off = r(a + 'off') < 0.35 ? 1 : 0, done = Math.max(0, target - Math.round(r(a + 'd') * 3) - off + (r(a + 'p') < 0.25 ? 1 : 0));
    lineDown[a] = Math.round(240 + r(a + 'dn') * (a === 'TRIM' ? 4200 : 1400));
    out.prod.push({ shift: sh, line: AREAS[a].name, target, done, remaining: Math.max(0, target - done), offline: off, down: lineDown[a] });
    if (off) { const n = 248000 + Math.floor(r(a + 'v') * 900), body = `LSJA34660TP${String(n).padStart(6, '0')}`, vin = body.slice(0, 8) + M.vinCheckDigit(body) + body.slice(9); const st = a === 'TRIM' ? 'TL6' : a === 'FINAL' ? `FL${1 + Math.floor(r(a + 's') * 7)}` : 'TL6';
      if (a !== 'CHASSIS') out.off.push({ shift: sh, t: base + def.start + 3600 + Math.floor(r(a + 'ot') * 20000), vin, station: st, reason: M.OFFLINE_REASONS[Math.floor(r(a + 'rs') * 4) + 1], by: 'Usman Tariq', returned: r(a + 'rt') < 0.5 ? 'yes' : '' }); }
  }
  for (const id of stations) {
    const takt = S.cfg.takt[POS[id].area], n = 27 + Math.floor(r(id + 'n') * 5), avg = takt * (0.86 + r(id + 'a') * 0.12), over = r(id + 'o') < 0.5 ? Math.floor(r(id + 'oc') * 4) : 0;
    out.cycle.push({ shift: sh, station: id, line: AREAS[POS[id].area].short, n, avg, max: over ? takt + 30 + r(id + 'm') * 400 : avg + r(id + 'm') * (takt - avg), takt, over });
    const dn = over ? Math.round(over * (40 + r(id + 'dd') * 180)) : 0;
    out.down.push({ shift: sh, station: id, line: AREAS[POS[id].area].short, down: dn, caused: dn });
  }
  const nc = 6 + Math.floor(r('nc') * 10);
  for (let i = 0; i < nc; i++) { const id = stations[Math.floor(r('cs' + i) * stations.length)]; if (!id || (POS[id].area === 'TRIM' && !S.cfg.trimAndon)) continue; const resp = Math.round(35 + r('cr' + i) * 190); out.calls.push({ shift: sh, t: base + def.start + Math.floor(r('ct' + i) * (def.end - def.start)), station: id, type: r('ty' + i) < 0.55 ? 'Supervisor' : 'Maintenance', response: resp, total: resp + Math.round(60 + r('cl' + i) * 280), by: r('ty' + i) < 0.55 ? 'Usman Tariq' : 'Bilal Ahmed' }); }
  out.calls.sort((x, y) => x.t - y.t);
}

// SheetJS is loaded only when a report is exported (separate chunk).
function loadXLSX() {
  return import('xlsx').then((m) => m.default || m);
}
async function exportExcel(d, meta) {
  const sheets = reportSheets(d, { ...meta, from: meta.date, to: meta.date, exportedAt: new Date().toLocaleString('en-GB'), by: userName() }), name = reportFileName({ ...meta, from: meta.date, to: meta.date });
  try {
    const X = await loadXLSX(), wb = X.utils.book_new();
    for (const [n, rows] of Object.entries(sheets)) { const ws = X.utils.aoa_to_sheet(rows); ws['!cols'] = rows[0].map((_, i) => ({ wch: Math.min(48, Math.max(10, ...rows.map((r) => String(r[i] == null ? '' : r[i]).length + 2))) })); X.utils.book_append_sheet(wb, ws, n.slice(0, 31)); }
    X.writeFile(wb, `${name}.xlsx`);
    return 'xlsx';
  } catch (e) {
    // offline fallback: one CSV with every table
    const csv = Object.entries(sheets).map(([n, rows]) => `${n}\n` + rows.map((r) => r.map((c) => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(',')).join('\n')).join('\n\n');
    downloadText(`${name}.csv`, 'text/csv', csv); return 'csv';
  }
}


const wd = (k) => new Date(k + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const lineLabel = (line) => (line === 'all' ? 'All lines' : AREAS[line].name);

export function ReportsPage() {
  if (!can('reports')) return html`<${NoAccess} what="Reports" />`;
  return REMOTE ? html`<${ServerReports} />` : html`<${LocalReports} />`;
}

/* offline demo: built in this browser */
function LocalReports() {
  const S = RT.S, days = Array.from({ length: 7 }, (_, i) => M.dateKeyOf(S, M.dayOf(S.t) - i));
  const [date, setDate] = useState(days[0]), [shift, setShift] = useState(S.shift && S.shift.name ? S.shift.name : 'all'), [line, setLine] = useState('all'), [busy, setBusy] = useState(null), [, tick] = useReducer((x) => x + 1, 0);
  useEffect(() => { const i = setInterval(tick, 2000); return () => clearInterval(i); }, []);
  const d = reportData(S, date, shift, line), names = M.shiftsFor(S, date).map((s) => s.name);
  const meta = { date, shift: shift === 'all' ? 'All shifts' : shift, line: lineLabel(line), sources: d.sources.join('; ') || 'no data' };
  const doXlsx = async () => { setBusy('xlsx'); const k = await exportExcel(d, meta); setBusy(k === 'csv' ? 'csv' : null); };
  return html`<div class="page-wrap reports" id="report-print">
    <${PageHead} k="Reports · URD req 28–29" title=${`${wd(date)} · ${meta.shift} · ${meta.line}`} sub=${html`Production, cycle times, downtime, offlined vehicles and assist-call response times. ${d.sources.length ? html`Source: <b>${d.sources.join(' · ')}</b>.` : ''}${d.notStarted.length ? ` ${d.notStarted.join(', ')} not started yet.` : ''}`}>
      <button class="btn" aria-busy=${busy === 'xlsx' ? 'true' : 'false'} onClick=${doXlsx}><${Icon} n="download" />Excel</button><button class="btn" onClick=${() => window.print()}><${Icon} n="file" />PDF</button></${PageHead}>
    ${busy === 'csv' ? html`<div class="result bad" style=${{ marginBottom: 12 }}>The Excel library could not load (offline?), so a CSV with every table was downloaded instead.</div>` : null}
    <div class="rep-filters noprint" role="group" aria-label="Report filters">
      <div class="field"><label for="rp-d">Day</label><select id="rp-d" value=${date} onChange=${(e) => setDate(e.target.value)}>${days.map((k, i) => html`<option key=${k} value=${k}>${wd(k)}${i === 0 ? ' · today' : ''}</option>`)}</select></div>
      <${ShiftLineFilters} names=${names} shift=${shift} setShift=${setShift} line=${line} setLine=${setLine} />
      <${Jump} />
    </div>
    <${ReportBody} d=${d} line=${line} />
    <p class="note">Built in this browser from this session's records; earlier days are simulated history. On the line server, reports come from its database. See <button class="linkish" onClick=${() => go('how')}>How it works</button>. SIMULATION: no PLC, scanner or sensor is connected.</p>
  </div>`;
}

/* line server: from the database */
function ServerReports() {
  const S = RT.S, today = M.dateKeyOf(S, M.dayOf(S.t));
  const [from, setFrom] = useState(today), [to, setTo] = useState(today), [shift, setShift] = useState(S.shift && S.shift.name ? S.shift.name : 'all'), [line, setLine] = useState('all');
  const [res, setRes] = useState(null), [err, setErr] = useState(null), [saved, setSaved] = useState(null);
  const days = dateRange(from, to), q = new URLSearchParams({ from, to, shift, line }).toString(), live = days && to >= today;
  useEffect(() => {
    if (!days) return undefined;
    let on = true;
    const load = () => api(`/api/reports?${q}`).then((r) => { if (!on) return; if (r.ok) { setRes({ ...r, q }); setErr(null); } else setErr(r.error || 'The report could not be made.'); });
    load();
    const i = live ? setInterval(load, 10000) : null;
    return () => { on = false; if (i) clearInterval(i); };
  }, [q]);
  useEffect(() => { let on = true; const load = () => api('/api/reports/saved?limit=30').then((r) => { if (on && r.ok) setSaved(r.saved); }); load(); const i = setInterval(load, 60000); return () => { on = false; clearInterval(i); }; }, []);
  const names = M.shiftsFor(S, from).map((s) => s.name);
  const setFromDate = (v) => { setFrom(v); if (!to || v > to) setTo(v); };
  const rangeText = from === to ? wd(from) : `${wd(from)} – ${wd(to)}`;
  const problem = !days ? (from > to ? 'The start date is after the end date.' : `Choose at most ${MAX_RANGE_DAYS} days.`) : null;
  const d = res && res.q === q ? res.report : null;
  return html`<div class="page-wrap reports" id="report-print">
    <${PageHead} k="Reports · URD req 28–29" title=${`${rangeText} · ${shift === 'all' ? 'All shifts' : shift} · ${lineLabel(line)}`} sub=${html`Production, cycle times, downtime, offlined vehicles and assist-call response times. Source: <b>line server database</b>${d && live ? ' · updates every 10 s' : ''}.`}>
      <a class=${'btn' + (days ? '' : ' disabled')} aria-disabled=${days ? 'false' : 'true'} href=${days ? `/api/reports/file.xlsx?${q}` : undefined} download><${Icon} n="download" />Excel</a><a class=${'btn' + (days ? '' : ' disabled')} aria-disabled=${days ? 'false' : 'true'} href=${days ? `/api/reports/file.pdf?${q}` : undefined} download><${Icon} n="file" />PDF</a></${PageHead}>
    <div class="rep-filters noprint" role="group" aria-label="Report filters">
      <div class="field"><label for="rp-f">From</label><input id="rp-f" type="date" max=${today} value=${from} onChange=${(e) => e.target.value && setFromDate(e.target.value)} /></div>
      <div class="field"><label for="rp-t">To</label><input id="rp-t" type="date" min=${from} max=${today} value=${to} onChange=${(e) => e.target.value && setTo(e.target.value)} /></div>
      <${ShiftLineFilters} names=${names} shift=${shift} setShift=${setShift} line=${line} setLine=${setLine} />
      <${Jump} byDay=${!!(d && d.byDay.length)} />
    </div>
    ${problem ? html`<div class="result bad">${problem}</div>` : err ? html`<div class="result bad">${err}</div>` : null}
    ${d && res.empty.length ? html`<div class="result" style=${{ marginBottom: 4 }}>No data stored for ${res.empty.length === 1 ? 'this day' : 'these days'}: ${res.empty.map(wd).join(', ')}.</div>` : null}
    ${!problem && !d && !err ? html`<div class="note" role="status">Loading the report from the line server…</div>` : null}
    ${d ? html`<${ReportBody} d=${d} line=${line} />` : null}
    <${SavedReports} saved=${saved} />
    <p class="note">Stored on the line server and kept for the retention period; see <button class="linkish" onClick=${() => go('how')}>How it works</button>. SIMULATION: no PLC, scanner or sensor is connected.</p>
  </div>`;
}

function SavedReports({ saved }) {
  return html`<section class="panel ticks rsec noprint" id="rs-saved"><h3>Saved shift reports</h3><div class="q">Made by the line server at the end of every shift, for all lines.</div>
    <table class="data"><thead><tr><th>Date</th><th>Shift</th><th>Made at</th><th>Files</th></tr></thead><tbody>
      ${!saved ? html`<tr><td colspan="4" class="c-muted">Loading…</td></tr>` : saved.length ? saved.map((r) => html`<tr key=${r.shiftKey}><td class="mono" style=${{ textAlign: 'left' }}>${r.date}</td><td style=${{ textAlign: 'left' }}>${r.shift}</td><td class="mono">${new Date(r.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</td>
        <td>${r.xlsx ? html`<a class="linkish" href=${`/api/reports/saved/${r.xlsx}`} download>Excel</a>` : null}${r.xlsx && r.pdf ? ' · ' : ''}${r.pdf ? html`<a class="linkish" href=${`/api/reports/saved/${r.pdf}`} download>PDF</a>` : null}</td></tr>`) : html`<tr><td colspan="4" class="c-muted">No shift has ended on the line server yet.</td></tr>`}
    </tbody></table></section>`;
}

function ShiftLineFilters({ names, shift, setShift, line, setLine }) {
  return html`<div class="field"><label for="rp-s">Shift</label><select id="rp-s" value=${shift} onChange=${(e) => setShift(e.target.value)}><option value="all">All shifts</option>${names.map((n) => html`<option key=${n} value=${n}>${n}</option>`)}</select></div>
    <div class="field"><label for="rp-l">Line</label><select id="rp-l" value=${line} onChange=${(e) => setLine(e.target.value)}><option value="all">All lines</option>${M.AREA_IDS.map((a) => html`<option key=${a} value=${a}>${AREAS[a].name}</option>`)}</select></div>`;
}

function Jump({ byDay }) {
  const sections = byDay ? [['day', 'By day'], ...REPORT_SECTIONS] : REPORT_SECTIONS;
  return html`<nav class="rep-jump">${sections.map(([k, l]) => html`<a key=${k} href=${'#/reports'} onClick=${(e) => { e.preventDefault(); const el = document.getElementById('rs-' + k); el && el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>${l}</a>`)}</nav>`;
}

/* the KPI row and the tables; the same for both sources */
function ReportBody({ d, line }) {
  const k = kpis(d, line), sum = (l, f) => l.reduce((x, r) => x + (r[f] || 0), 0);
  const maxDown = Math.max(1, ...d.down.map((r) => Math.max(r.down, r.caused)));
  const pct = (r) => (r.target ? Math.round((r.done / r.target) * 100) : 0);
  return html`<div class="rep-kpis"><div><span class="micro">${line === 'all' ? 'Vehicles completed (Final)' : 'Completed'}</span><b class="num">${k.done}<small>/ ${k.target}</small></b></div>
      <div><span class="micro">Offlined</span><b class="num">${k.offline}</b></div><div><span class="micro">Downtime (line total)</span><b class="num">${fmtDur(k.down)}</b></div>
      <div><span class="micro">Assist calls</span><b class="num">${k.calls}</b></div><div><span class="micro">Avg response</span><b class="num">${k.avgResponse != null ? fmtDur(k.avgResponse) : '—'}</b></div><div><span class="micro">Avg time to clear</span><b class="num">${k.avgClear != null ? fmtDur(k.avgClear) : '—'}</b></div></div>

    ${d.byDay.length ? html`<section class="panel ticks rsec" id="rs-day"><h3>By day</h3><div class="q">Totals of every shift on each day.</div>
      <table class="data"><thead><tr><th>Date</th><th>Line</th><th>Target</th><th>Completed</th><th>Downtime</th><th>Attainment</th></tr></thead><tbody>
        ${d.byDay.map((r, i) => html`<tr key=${i}><td class="mono" style=${{ textAlign: 'left' }}>${wd(r.date)}</td><td style=${{ textAlign: 'left' }}>${r.line}</td><td class="mono">${r.target}</td><td class="mono">${r.done}</td><td class="mono">${fmtDur(r.down)}</td><td><span class="attn"><i style=${{ width: `${Math.min(100, pct(r))}%` }}></i></span><span class="mono">${pct(r)}%</span></td></tr>`)}
      </tbody></table></section>` : null}

    <section class="panel ticks rsec" id="rs-prod"><h3>Production summary</h3><div class="q">Completed is counted when a unit leaves the last station of each line (TL6, CL4, FL7). Offlined units never count.</div>
      <table class="data"><thead><tr><th>Shift</th><th>Line</th><th>Target</th><th>Completed</th><th>Remaining</th><th>Offlined</th><th>Downtime</th><th>Attainment</th></tr></thead><tbody>
        ${d.prod.length ? d.prod.map((r, i) => html`<tr key=${i}><td style=${{ textAlign: 'left' }}>${r.shift}</td><td style=${{ textAlign: 'left' }}>${r.line}</td><td class="mono">${r.target}</td><td class="mono">${r.done}</td><td class="mono">${r.remaining}</td><td class="mono">${r.offline}</td><td class="mono">${fmtDur(r.down)}</td><td><span class="attn"><i style=${{ width: `${Math.min(100, pct(r))}%` }}></i></span><span class="mono">${pct(r)}%</span></td></tr>`) : html`<tr><td colspan="8" class="c-muted">No shift has run yet for this selection.</td></tr>`}
      </tbody></table></section>

    <section class="panel ticks rsec" id="rs-cycle"><h3>Station cycle times</h3><div class="q">Cycle time = time a vehicle spent at the station, breaks excluded. The marker is takt.</div>
      <table class="data"><thead><tr><th>Shift</th><th>Station</th><th>Cycles</th><th>Average</th><th style=${{ minWidth: 160 }}></th><th>Longest</th><th>Takt</th><th>Over takt</th></tr></thead><tbody>
        ${d.cycle.map((r, i) => html`<tr key=${i}><td style=${{ textAlign: 'left' }}>${r.shift}</td><td class="mono">${r.station}</td><td class="mono">${r.n}</td><td class="mono" style=${{ color: r.avg > r.takt ? 'var(--crit)' : null }}>${fmtDur(r.avg)}</td>
          <td><span class="cbar2"><i style=${{ width: `${Math.min(100, (r.avg / (r.takt * 1.4)) * 100)}%`, background: r.avg > r.takt ? 'var(--crit)' : r.avg > r.takt * RT.S.cfg.warnPct ? 'var(--warn)' : 'var(--ok)' }}></i><b style=${{ left: `${(1 / 1.4) * 100}%` }}></b></span></td>
          <td class="mono" style=${{ color: r.max > r.takt ? 'var(--crit)' : null }}>${fmtDur(r.max)}</td><td class="mono c-muted">${fmtDur(r.takt)}</td><td class="mono">${r.over}</td></tr>`)}
      </tbody></table></section>

    <section class="panel ticks rsec" id="rs-down"><h3>Downtime</h3><div class="q">At the station: time its unit was over takt. Caused: the same time, put down to the station that held the others up. Planned stops are excluded.</div>
      <table class="data"><thead><tr><th>Shift</th><th>Station</th><th>At the station</th><th>Caused</th><th style=${{ minWidth: 200 }}></th></tr></thead><tbody>
        ${d.down.filter((r) => r.down || r.caused).length ? d.down.filter((r) => r.down || r.caused).sort((a, b) => b.caused - a.caused).map((r, i) => html`<tr key=${i}><td style=${{ textAlign: 'left' }}>${r.shift}</td><td class="mono">${r.station}</td><td class="mono">${fmtDur(r.down)}</td><td class="mono">${fmtDur(r.caused)}</td><td><span class="cbar2"><i style=${{ width: `${(r.caused / maxDown) * 100}%`, background: 'var(--crit)' }}></i></span></td></tr>`) : html`<tr><td colspan="5" class="c-muted">No downtime in this selection.</td></tr>`}
      </tbody></table></section>

    <section class="panel ticks rsec" id="rs-off"><h3>Offlined vehicles</h3>
      <table class="data"><thead><tr><th>Shift</th><th>Time</th><th>VIN</th><th>Station</th><th>Reason</th><th>By</th><th>Returned</th></tr></thead><tbody>
        ${d.off.length ? d.off.map((r, i) => html`<tr key=${i}><td style=${{ textAlign: 'left' }}>${r.shift}</td><td class="mono">${fmtClock(r.t, false)}</td><td class="mono">${r.vin}</td><td class="mono">${r.station}</td><td style=${{ textAlign: 'left', whiteSpace: 'normal' }}>${r.reason}</td><td style=${{ textAlign: 'left' }}>${r.by}</td><td class="mono">${r.returned || '—'}</td></tr>`) : html`<tr><td colspan="7" class="c-muted">No vehicles offlined in this selection.</td></tr>`}
      </tbody></table></section>

    <section class="panel ticks rsec" id="rs-calls"><h3>Assist calls</h3><div class="q">Response = call to help arriving. Time to clear = call to the responder clearing it.</div>
      <div class="rep-kpis small">${['Supervisor', 'Maintenance'].map((t) => { const l = d.calls.filter((c) => c.type === t && c.response != null); return html`<div key=${t}><span class=${'micro c-' + (t === 'Supervisor' ? 'sup' : 'mnt')}>${t}</span><b class="num">${d.calls.filter((c) => c.type === t).length}</b><span class="note">avg response ${l.length ? fmtDur(sum(l, 'response') / l.length) : '—'} · longest ${l.length ? fmtDur(Math.max(...l.map((c) => c.response))) : '—'}</span></div>`; })}</div>
      <table class="data"><thead><tr><th>Shift</th><th>Time</th><th>Station</th><th>Call</th><th>Response</th><th>To clear</th><th>Cleared by</th></tr></thead><tbody>
        ${d.calls.length ? d.calls.map((r, i) => html`<tr key=${i}><td style=${{ textAlign: 'left' }}>${r.shift}</td><td class="mono">${fmtClock(r.t, false)}</td><td class="mono">${r.station}</td><td style=${{ textAlign: 'left' }} class=${r.type === 'Supervisor' ? 'c-sup' : 'c-mnt'}>${r.type}</td><td class="mono" style=${{ color: r.response > 180 ? 'var(--crit)' : null }}>${r.response != null ? fmtDur(r.response) : 'open'}</td><td class="mono">${r.total != null ? fmtDur(r.total) : 'open'}</td><td style=${{ textAlign: 'left' }}>${r.by || '—'}</td></tr>`) : html`<tr><td colspan="7" class="c-muted">No calls in this selection.</td></tr>`}
      </tbody></table></section>`;
}
