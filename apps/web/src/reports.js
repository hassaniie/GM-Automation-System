/* ════════════════════════════════════════════════════════════════════════
   Reports (URD req 28–29): by day or date range, shift and line; Excel and PDF.
   On the line server the tables, Excel and PDF come from the stored database
   (/api/reports). In the offline demo, shifts run in this session come from the
   live records; earlier days are generated deterministically from the seed and
   labelled as simulated history, so the date filter has something to show.
   The table definitions are shared (@mg/reports).
   ════════════════════════════════════════════════════════════════════════ */
import { MAX_RANGE_DAYS, buildReport, dateRange, datasetFromState, kpis, liveHas, reportFileName, reportSheets, selection } from '@mg/reports';
import { NoAccess, downloadText } from './admin.js';
import { can, userName } from './auth.js';
import { api } from './lib/api.js';
import { go } from './lib/router.js';
import { AREAS, M, POS, RT, fmtClock, fmtDur, html, useEffect, useReducer, useState } from './lib/runtime.js';
import { REMOTE } from './lib/source.js';
import { Button, Cluster, DataTable, DateInput, Field, Grid, Meter, Notice, PageHeader, Panel, Select, Stack, Stat } from './ui/index.js';

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

// ExcelJS (the library the line server uses) is loaded only when a report is exported, as its own chunk (audit S2).
function loadExcel() {
  return import('exceljs').then((m) => m.default || m);
}
/** A spreadsheet cell that cannot run as a formula when opened (audit B13). */
export const safeCell = (c) => (typeof c === 'string' && /^[=+\-@\t\r]/.test(c) ? `'${c}` : c);
async function exportExcel(d, meta) {
  const sheets = reportSheets(d, { ...meta, from: meta.date, to: meta.date, exportedAt: new Date().toLocaleString('en-GB'), by: userName() }), name = reportFileName({ ...meta, from: meta.date, to: meta.date });
  try {
    const ExcelJS = await loadExcel(), wb = new ExcelJS.Workbook();
    for (const [n, rows] of Object.entries(sheets)) {
      const ws = wb.addWorksheet(n.slice(0, 31));
      for (const r of rows) ws.addRow(r.map(safeCell));
      ws.columns.forEach((col, i) => { col.width = Math.min(48, Math.max(10, ...rows.map((r) => String(r[i] == null ? '' : r[i]).length + 2))); });
      if (rows.length) ws.getRow(1).font = { bold: true };
    }
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${name}.xlsx` });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    return 'xlsx';
  } catch (e) {
    // offline fallback: one CSV with every table (byte-order mark so Excel reads UTF-8)
    const csv = Object.entries(sheets).map(([n, rows]) => `${n}\n` + rows.map((r) => r.map((c) => `"${String(c == null ? '' : safeCell(c)).replace(/"/g, '""')}"`).join(',')).join('\n')).join('\n\n');
    downloadText(`${name}.csv`, 'text/csv', '\ufeff' + csv); return 'csv';
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
  return html`<${Stack} gap=${4} class="page-wrap reports" id="report-print">
    <${PageHeader} k="Reports · URD req 28–29" title=${`${wd(date)} · ${meta.shift} · ${meta.line}`} sub=${html`Production, cycle times, downtime, offlined vehicles and assist-call response times. ${d.sources.length ? html`Source: <b>${d.sources.join(' · ')}</b>.` : ''}${d.notStarted.length ? ` ${d.notStarted.join(', ')} not started yet.` : ''}`}>
      <${Button} icon="download" loading=${busy === 'xlsx'} onClick=${doXlsx}>Excel<//><${Button} icon="file" onClick=${() => window.print()} title="Opens the print dialog: choose Save as PDF">Print / PDF<//></${PageHeader}>
    ${busy === 'csv' ? html`<${Notice} kind="warning">The Excel library could not load (offline?), so a CSV with every table was downloaded instead.<//>` : null}
    <${Filters}>
      <${Field} label="Day"><${Select} value=${date} onChange=${setDate} options=${days.map((k, i) => [k, `${wd(k)}${i === 0 ? ' · today' : ''}`])} /><//>
      <${ShiftLineFilters} names=${names} shift=${shift} setShift=${setShift} line=${line} setLine=${setLine} />
      <${Jump} />
    </${Filters}>
    <${ReportBody} d=${d} line=${line} />
    <p class="note">Built in this browser from this session's records; earlier days are simulated history. On the line server, reports come from its database. See <button class="linkish" onClick=${() => go('how')}>How it works</button>. SIMULATION: no PLC, scanner or sensor is connected.</p>
  </${Stack}>`;
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
  return html`<${Stack} gap=${4} class="page-wrap reports" id="report-print">
    <${PageHeader} k="Reports · URD req 28–29" title=${`${rangeText} · ${shift === 'all' ? 'All shifts' : shift} · ${lineLabel(line)}`} sub=${html`Production, cycle times, downtime, offlined vehicles and assist-call response times. Source: <b>line server database</b>${d && live ? ' · updates every 10 s' : ''}.`}>
      <${Button} icon="download" href=${`/api/reports/file.xlsx?${q}`} disabled=${!days} download>Excel<//><${Button} icon="file" href=${`/api/reports/file.pdf?${q}`} disabled=${!days} download>PDF<//></${PageHeader}>
    <${Filters}>
      <${Field} label="From"><${DateInput} max=${today} value=${from} onChange=${(v) => v && setFromDate(v)} /><//>
      <${Field} label="To"><${DateInput} min=${from} max=${today} value=${to} onChange=${(v) => v && setTo(v)} /><//>
      <${ShiftLineFilters} names=${names} shift=${shift} setShift=${setShift} line=${line} setLine=${setLine} />
      <${Jump} byDay=${!!(d && d.byDay.length)} />
    </${Filters}>
    ${problem ? html`<${Notice} kind="error">${problem}<//>` : err ? html`<${Notice} kind="error">${err}<//>` : null}
    ${d && res.empty.length ? html`<${Notice} kind="info">No data stored for ${res.empty.length === 1 ? 'this day' : 'these days'}: ${res.empty.map(wd).join(', ')}.<//>` : null}
    ${!problem && !d && !err ? html`<div class="note" role="status">Loading the report from the line server…</div>` : null}
    ${d ? html`<${ReportBody} d=${d} line=${line} />` : null}
    <${SavedReports} saved=${saved} />
    <p class="note">Stored on the line server and kept for the retention period; see <button class="linkish" onClick=${() => go('how')}>How it works</button>. SIMULATION: no PLC, scanner or sensor is connected.</p>
  </${Stack}>`;
}

const Filters = ({ children }) => html`<${Panel} class="rep-filters noprint" role="group" aria-label="Report filters"><${Cluster} gap=${3} align="flex-end">${children}</${Cluster}><//>`;

function SavedReports({ saved }) {
  const cols = [
    { key: 'date', label: 'Date', type: 'code' }, { key: 'shift', label: 'Shift' },
    { key: 'at', label: 'Made at', type: 'time', render: (r) => new Date(r.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) },
    { key: 'files', label: 'Files', type: 'action', render: (r) => html`<${Cluster} gap=${1} justify="flex-end" nowrap=${true}>${r.xlsx ? html`<${Button} size="sm" variant="ghost" icon="download" href=${`/api/reports/saved/${r.xlsx}`} download>Excel<//>` : null}${r.pdf ? html`<${Button} size="sm" variant="ghost" icon="file" href=${`/api/reports/saved/${r.pdf}`} download>PDF<//>` : null}</${Cluster}>` },
  ];
  return html`<${Panel} ticks=${true} class="rsec noprint" id="rs-saved" title="Saved shift reports" sub="Made by the line server at the end of every shift, for all lines.">
    <${DataTable} columns=${cols} rows=${saved} rowKey=${(r) => r.shiftKey} empty="No shift has ended on the line server yet." /><//>`;
}

function ShiftLineFilters({ names, shift, setShift, line, setLine }) {
  return html`<${Field} label="Shift"><${Select} value=${shift} onChange=${setShift} options=${[['all', 'All shifts'], ...names.map((n) => [n, n])]} /><//>
    <${Field} label="Line"><${Select} value=${line} onChange=${setLine} options=${[['all', 'All lines'], ...M.AREA_IDS.map((a) => [a, AREAS[a].name])]} /><//>`;
}

function Jump({ byDay }) {
  const sections = byDay ? [['day', 'By day'], ...REPORT_SECTIONS] : REPORT_SECTIONS;
  return html`<nav class="rep-jump" aria-label="Report sections">${sections.map(([k, l]) => html`<a key=${k} href=${'#/reports'} onClick=${(e) => { e.preventDefault(); const el = document.getElementById('rs-' + k); el && el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>${l}</a>`)}</nav>`;
}

/* the KPI row and the tables; the same for both sources */
function ReportBody({ d, line }) {
  const k = kpis(d, line), sum = (l, f) => l.reduce((x, r) => x + (r[f] || 0), 0);
  const maxDown = Math.max(1, ...d.down.map((r) => Math.max(r.down, r.caused)));
  const pct = (r) => (r.target ? Math.round((r.done / r.target) * 100) : 0);
  const attain = (r) => html`<${Cluster} gap=${2} justify="flex-end" nowrap=${true}><${Meter} size="sm" value=${pct(r) / 100} label="Attainment" valueText=${`${pct(r)}%`} style=${{ width: 80 }} class="ds-meter--inline" /><span>${pct(r)}%</span></${Cluster}>`;
  const over = (v, t) => (v > t ? 'var(--ds-status-critical)' : null);
  const byDay = [
    { key: 'date', label: 'Date', type: 'code', render: (r) => wd(r.date) }, { key: 'line', label: 'Line' },
    { key: 'target', label: 'Target', type: 'number' }, { key: 'done', label: 'Completed', type: 'number' },
    { key: 'down', label: 'Downtime', type: 'duration' }, { key: 'att', label: 'Attainment', type: 'number', render: attain },
  ];
  const prod = [
    { key: 'shift', label: 'Shift' }, { key: 'line', label: 'Line' }, { key: 'target', label: 'Target', type: 'number' }, { key: 'done', label: 'Completed', type: 'number' },
    { key: 'remaining', label: 'Remaining', type: 'number' }, { key: 'offline', label: 'Offlined', type: 'number' }, { key: 'down', label: 'Downtime', type: 'duration' },
    { key: 'att', label: 'Attainment', type: 'number', render: attain },
  ];
  const cycle = [
    { key: 'shift', label: 'Shift' }, { key: 'station', label: 'Station', type: 'code' }, { key: 'n', label: 'Cycles', type: 'number' },
    { key: 'avg', label: 'Average', type: 'duration', render: (r) => html`<span style=${{ color: over(r.avg, r.takt) }}>${fmtDur(r.avg)}</span>` },
    { key: 'bar', label: '', width: 160, render: (r) => html`<${Meter} size="sm" value=${r.avg / (r.takt * 1.4)} marker=${1 / 1.4} tone=${r.avg > r.takt ? 'critical' : r.avg > r.takt * RT.S.cfg.warnPct ? 'warning' : null} label=${`${r.station} average against takt`} valueText=${`${fmtDur(r.avg)} of ${fmtDur(r.takt)}`} />` },
    { key: 'max', label: 'Longest', type: 'duration', render: (r) => html`<span style=${{ color: over(r.max, r.takt) }}>${fmtDur(r.max)}</span>` },
    { key: 'takt', label: 'Takt', type: 'duration' }, { key: 'over', label: 'Over takt', type: 'number' },
  ];
  const down = [
    { key: 'shift', label: 'Shift' }, { key: 'station', label: 'Station', type: 'code' }, { key: 'down', label: 'At the station', type: 'duration' }, { key: 'caused', label: 'Caused', type: 'duration' },
    { key: 'bar', label: '', width: 200, render: (r) => html`<${Meter} size="sm" value=${r.caused / maxDown} label=${`${r.station} downtime caused`} />` },
  ];
  const off = [
    { key: 'shift', label: 'Shift' }, { key: 't', label: 'Time', type: 'time', render: (r) => fmtClock(r.t, false) }, { key: 'vin', label: 'VIN', type: 'vin' },
    { key: 'station', label: 'Station', type: 'code' }, { key: 'reason', label: 'Reason', wrap: true }, { key: 'by', label: 'By' }, { key: 'returned', label: 'Returned', type: 'time', render: (r) => r.returned || '—' },
  ];
  const calls = [
    { key: 'shift', label: 'Shift' }, { key: 't', label: 'Time', type: 'time', render: (r) => fmtClock(r.t, false) }, { key: 'station', label: 'Station', type: 'code' },
    { key: 'type', label: 'Call', render: (r) => html`<span class=${r.type === 'Supervisor' ? 'c-sup' : 'c-mnt'}>${r.type}</span>` },
    { key: 'response', label: 'Response', type: 'duration', render: (r) => (r.response != null ? html`<span style=${{ color: r.response > 180 ? 'var(--ds-status-critical)' : null }}>${fmtDur(r.response)}</span>` : 'open') },
    { key: 'total', label: 'To clear', type: 'duration', render: (r) => (r.total != null ? fmtDur(r.total) : 'open') }, { key: 'by', label: 'Cleared by', render: (r) => r.by || '—' },
  ];
  const downRows = d.down.filter((r) => r.down || r.caused).sort((a, b) => b.caused - a.caused);
  return html`<${Grid} min=${170} class="rep-kpis">
      <${Panel}><${Stat} label=${line === 'all' ? 'Vehicles completed (Final)' : 'Completed'} value=${k.done} target=${k.target} size="lg" /><//>
      <${Panel}><${Stat} label="Offlined" value=${k.offline} size="lg" /><//><${Panel}><${Stat} label="Downtime (line total)" value=${fmtDur(k.down)} size="lg" /><//>
      <${Panel}><${Stat} label="Assist calls" value=${k.calls} size="lg" /><//><${Panel}><${Stat} label="Avg response" value=${k.avgResponse != null ? fmtDur(k.avgResponse) : '—'} size="lg" /><//>
      <${Panel}><${Stat} label="Avg time to clear" value=${k.avgClear != null ? fmtDur(k.avgClear) : '—'} size="lg" /><//></${Grid}>
    ${d.byDay.length ? html`<${Panel} ticks=${true} class="rsec" id="rs-day" title="By day" sub="Totals of every shift on each day."><${DataTable} columns=${byDay} rows=${d.byDay} /><//>` : null}
    <${Panel} ticks=${true} class="rsec" id="rs-prod" title="Production summary" sub="Completed is counted when a unit leaves the last station of each line (TL6, CL4, FL7). Offlined units never count."><${DataTable} columns=${prod} rows=${d.prod} empty="No shift has run yet for this selection." /><//>
    <${Panel} ticks=${true} class="rsec" id="rs-cycle" title="Station cycle times" sub="Cycle time = time a vehicle spent at the station, breaks excluded. The marker is takt."><${DataTable} columns=${cycle} rows=${d.cycle} /><//>
    <${Panel} ticks=${true} class="rsec" id="rs-down" title="Downtime" sub="At the station: time its unit was over takt. Caused: the same time, put down to the station that held the others up. Planned stops are excluded."><${DataTable} columns=${down} rows=${downRows} empty="No downtime in this selection." /><//>
    <${Panel} ticks=${true} class="rsec" id="rs-off" title="Offlined vehicles"><${DataTable} columns=${off} rows=${d.off} empty="No vehicles offlined in this selection." /><//>
    <${Panel} ticks=${true} class="rsec" id="rs-calls" title="Assist calls" sub="Response = call to help arriving. Time to clear = call to the responder clearing it.">
      <${Cluster} gap=${7}>${['Supervisor', 'Maintenance'].map((t) => { const l = d.calls.filter((c) => c.type === t && c.response != null); return html`<${Stat} key=${t} label=${html`<span class=${'c-' + (t === 'Supervisor' ? 'sup' : 'mnt')}>${t}</span>`} value=${d.calls.filter((c) => c.type === t).length} delta=${`avg response ${l.length ? fmtDur(sum(l, 'response') / l.length) : '—'} · longest ${l.length ? fmtDur(Math.max(...l.map((c) => c.response))) : '—'}`} />`; })}</${Cluster}>
      <${DataTable} columns=${calls} rows=${d.calls} empty="No calls in this selection." /><//>`;
}
