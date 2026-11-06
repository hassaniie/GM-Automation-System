/* ════════════════════════════════════════════════════════════════════════
   How it works: the proposal view for the URD. Architecture, answers to
   the five points the supplier must propose (§6), and a coverage matrix of
   all 36 requirements with a "Show me" link into the running system.
   ════════════════════════════════════════════════════════════════════════ */
import { Scene3D } from '@mg/scene';
import { Button, DataTable, PageHeader, Panel, Tag } from './ui/index.js';
import { Act } from './lib/act.js';
import { loadScenario, select } from './floor/scenarios.js';
import { go } from './lib/router.js';
import { html, setUI } from './lib/runtime.js';
import { powerCut, setLink } from './screens.js';

const showFloor = (n, after) => () => { go('floor'); setTimeout(() => { if (n) loadScenario(n); if (after) after(); }, 80); };
const COVERAGE = [
  ['Scanning & tracking', [
    [1, 'VIN scan at the first Trim station registers line-in', 'Fixed Scanner 1 at TL1 validates the VIN (format and check digit, duplicates refused) and records line-in.', 'demo', showFloor(0, () => setUI({ dialog: { type: 'scan', scanner: 'ENTRY' } }))],
    [2, 'Scan when a vehicle is taken offline at the end of Trim', 'Offline scanner at TL6. The offline needs a matching VIN scan.', 'demo', showFloor(0, () => select({ kind: 'pos', id: 'TL6' }))],
    [3, 'Scan when offlined anywhere on Final, recording the station', 'Two wireless handhelds (FL1–FL3, FL4–FL7). The station is stored with the offline record.', 'demo', showFloor(5)],
    [4, 'No other scanning; VIN known at every station', 'VIN is bound to its carrier at line-in and follows the skid, hanger and fixture handovers. Hanger-load and end-of-line scans are removed.', 'demo', showFloor(0, () => select({ kind: 'pos', id: 'CL2' }))],
    [5, 'Enter a VIN: location, status and history', 'VIN search (/ or Ctrl+K) opens the vehicle record: where it is, on line / offlined / completed, line-in, time at each station, offline time and place.', 'demo', () => setUI({ dialog: { type: 'vin' } })],
    [6, 'Offlined vehicles leave station counts and the target', 'Removed from counts at once; counted only if it returns and completes.', 'demo', showFloor(9)],
    [7, 'Authorised manual correction of positions, logged', 'Move or swap a VIN, or remove a unit not physically there. Reason required; audited.', 'demo', () => go('admin', 'correct')],
  ]],
  ['Station monitoring', [
    [8, 'Number of vehicles at each station', 'Shown on each station panel, line display tile and the dashboard; work in line per line.', 'demo', () => go('display', 'final')],
    [9, 'Cycle time per station, live and for completed vehicles', 'Live timer per station; every completed cycle stored (reports, vehicle record).', 'demo', showFloor(0, () => select({ kind: 'pos', id: 'FL3' }))],
    [10, 'Authorised person enters and changes takt; logged', 'Takt per line in Settings, immediately or scheduled from a date; every change audited.', 'demo', () => go('admin', 'takt')],
    [11, 'Downtime calculated automatically per station and line; breaks excludable', 'Time over takt per station; line downtime = time with any station over takt. Breaks and off-shift excluded. Root cause attributed.', 'demo', () => go('dash')],
    [12, 'Normal, close to limit and over time shown clearly', 'Green / amber / red on stack lights, the strip, displays and dashboard. Close-to-limit threshold is configurable.', 'demo', showFloor(2)],
  ]],
  ['Daily target', [
    [13, 'Authorised person enters daily target per line', 'Default target per shift and line in Settings.', 'demo', () => go('admin', 'plan')],
    [14, 'Target, completed and remaining per line; targets scheduled in advance', 'On every line display and dashboard card; 14-day plan for targets, takt and shift times.', 'demo', () => go('admin', 'plan')],
    [15, 'Counts reset at each shift start; shift timings scheduled in advance', 'Shift pattern with breaks; per-date overrides; automatic reset and shift history.', 'demo', () => go('admin', 'shifts')],
  ]],
  ['Station buzzer', [
    [16, 'Every Chassis and Final station has a buzzer', '11 sounders, one per station, driven by the line controller.', 'proposal', () => go('admin', 'buzzers')],
    [17, 'Rings over takt, stops when the vehicle leaves', 'Exactly this rule; shown live with sound rings in 3D and a buzzer icon on displays.', 'demo', showFloor(2)],
    [18, 'Audible at its own station only; switch off per station', 'Directional sounder ~85 dB at 1 m with adjustable volume; per-station switch, audited.', 'demo', () => go('admin', 'buzzers')],
  ]],
  ['Assist calls', [
    [19, 'Two buttons per station: supervisor and maintenance, distinct colour and label', 'Violet SUPERVISOR and blue MAINTENANCE, illuminated, 40 mm, IP65.', 'demo', showFloor(7)],
    [20, 'Button lit while its call is active', 'Lit and blinking until someone responds; steady while help is at the station.', 'demo', showFloor(7)],
    [21, 'Active calls on line display and dashboard with station, type, waiting time', 'Call bands on the line displays; active-call list on the dashboard and the floor.', 'demo', () => { go('display', 'chassis'); Act.raiseCall('CL2', 'SUP', 'Demo'); }],
    [22, 'Cleared by the responder; response and clear times recorded', 'Respond on arrival, Clear when done; both durations kept and reported.', 'demo', showFloor(7)],
  ]],
  ['Displays and dashboard', [
    [23, 'LCD at each of the three lines', '3 industrial 55" LCDs, each driven by a small kiosk PC showing its line page.', 'proposal', () => go('display', 'trim')],
    [24, 'Line display content (stations, cycle, takt, downtime, target, calls); Trim shows its scans', 'As shown. Trim shows entered, offlined, in Trim, to Chassis and recent scans.', 'demo', () => go('display', 'chassis')],
    [25, 'Main dashboard of all lines with drill-down', 'Line cards, station strip, calls, downtime causes; click a station to open it on the floor.', 'demo', () => go('dash')],
    [26, 'Viewable at head office in a normal browser, no install', 'This web app: any current browser on the company network; sign-in by user.', 'demo', () => go('dash')],
    [27, 'Updates within a few seconds', 'Events push to screens in under 2 s; the dashboard shows the time of the last update.', 'demo', () => go('dash')],
  ]],
  ['Data, reports, users', [
    [28, 'Stores production, cycle, downtime, scans and calls; state retention', 'PostgreSQL on the line server: production, cycle times, downtime, offline records, calls, scans, audit and every plant event, saved every 2 s. Retention to be agreed (2 years set; 3 years proposed).', 'demo', () => go('reports')],
    [29, 'Reports by day, shift and line; Excel and PDF', 'From the line server database: a day or a range up to 31 days, by shift and line. Production, cycle times, downtime, offlined vehicles and call response; Excel and PDF files, and a saved report at the end of every shift.', 'demo', () => go('reports')],
    [30, 'User levels and individual sign-in', 'Administrator, authorised person, supervisor, maintenance, view-only; personal accounts; directory sign-in at deployment.', 'demo', () => go('admin', 'users')],
  ]],
  ['General', [
    [31, 'Equipment suits the shop (dust, oil mist, vibration, noise); continuous use', 'IP65 call stations and sounders, industrial PLC/edge I/O, fanless PCs, shielded cabling.', 'proposal', null],
    [32, 'No data loss on power or network cut; restarts with correct positions; one station fault does not stop others', 'UPS on line servers; local store-and-forward; positions from controller memory and tag re-read. Stations are independent I/O points.', 'demo', () => { go('dash'); setTimeout(powerCut, 300); }],
    [33, 'Displays and data collection keep working if head office link fails', 'Line server is on the shop floor; head office is a viewer. Buffered events sync when the link returns.', 'demo', () => { go('dash'); setTimeout(() => setLink(false), 200); }],
    [34, 'Expandable (stations, lines, displays, full Trim tracking)', 'Stations and lines are configuration. Full Trim Andon is already shown as a preview.', 'demo', showFloor(0, () => { setUI({ view: 'TRIM' }); Scene3D.focusView('TRIM'); })],
    [35, 'Share data with production / IT systems', 'REST API and webhooks for events; OPC UA from the PLC layer; scheduled exports.', 'proposal', null],
    [36, 'Electrical safety standards and IT security rules', 'IEC 60204-1 panels, CE/UL parts; role-based access, audit trail, TLS, directory sign-in.', 'proposal', null],
  ]],
];
const SIX = [
  ['How completion at the end of Final is detected', 'A retro-reflective photo-eye across the exit of FL7. When the car drives through it, the system records completion against the VIN tracked at FL7. No scan, no operator action.', 'Shown: watch FL7, the “Completed · photo-eye” card appears.', showFloor(0, () => select({ kind: 'pos', id: 'FL7' }))],
  ['How the VIN is tracked between scans', 'At line-in the VIN is bound to its Trim skid. Each carrier (skid, 4 hangers, Final fixtures) carries an RFID tag read at every station, and the two handovers (TL5→TL6 onto a hanger, FL1→FL2 onto a fixture) move the VIN to the next carrier. Station presence comes from the tag read plus a presence sensor.', 'Shown: open any station; the panel names the carrier and VIN with no scan.', showFloor(0, () => select({ kind: 'pos', id: 'CL3' }))],
  ['How an offlined vehicle that returns is handled', 'An authorised user selects “Return to line”. The unit rejoins at the station it left, when that station is free, and its work there restarts. It counts towards the target only when it completes. Both visits stay on its record.', 'Shown: scenario “Offline and return”.', showFloor(9)],
  ['Number and placement of Final line scanners', 'Two wireless handheld scanners with charging docks at FL2 (covers FL1–FL3) and FL5 (covers FL4–FL7), plus fixed scanners at TL1 (line-in) and TL6 (end of Trim). Four in total. The scan is checked against the VIN tracked at that station.', 'Shown: the docks are marked on the 3D floor.', showFloor(0, () => { setUI({ view: 'FINAL' }); Scene3D.focusView('FINAL'); })],
  ['The downtime calculation (req 11)', 'Station downtime = Σ max(0, cycle time − takt), where cycle time is arrival to departure less planned stops. Line downtime = time during which at least one station on that line is over takt, so overlaps are not double-counted. Breaks and time between shifts are excluded. Each second is also put down to the station that caused it, using the blockage chain.', 'Example: takt 10:00, unit leaves CL2 at 12:30 → CL2 has 2:30 downtime; if CL1 waited behind it, those seconds are attributed to CL2.', () => go('dash')],
];
const COV_COLS = [
  { key: 'n', label: 'Req', type: 'code', render: (r) => r[0] },
  { key: 'req', label: 'What the URD asks', wrap: true, render: (r) => r[1] },
  { key: 'how', label: 'How it is met', wrap: true, render: (r) => html`<span class="c-muted">${r[2]}</span>` },
  { key: 'st', label: 'Status', render: (r) => html`<${Tag} tone=${r[3] === 'demo' ? 'normal' : 'held'} icon=${null}>${r[3] === 'demo' ? 'Working in demo' : 'Proposal'}<//>` },
  { key: 'go', label: '', type: 'action', render: (r) => (r[4] ? html`<${Button} size="sm" variant="ghost" onClick=${r[4]}>Show me<//>` : null) },
];
export function HowPage() {
  const all = COVERAGE.flatMap(([, rows]) => rows), demo = all.filter((r) => r[3] === 'demo').length;
  return html`<div class="page-wrap how">
    <${PageHeader} k="Proposal view · URD “Andon System – General Assembly Shop” (draft 2)" title="How the Andon system meets the requirements" sub=${`All 36 requirements are covered: ${demo} are working in this simulation, and ${all.length - demo} are equipment or deployment items described below. Every “Show me” opens the place in the system where you can see it.`} />
    <${Panel} ticks=${true} title="Architecture" sub="The line server sits on the shop floor, so displays and data collection never depend on the head-office link."><${ArchDiagram} /><//>
    <h3 class="how-h">Points the URD asks the supplier to propose (§6)</h3>
    <div class="six">${SIX.map(([t, a, s, fn], i) => html`<${Panel} key=${i} ticks=${true} title=${html`<span class="ds-label">§6 · ${i + 1}</span><br />${t}`}><p>${a}</p><div class="six-foot"><span class="note">${s}</span>${fn ? html`<${Button} size="sm" icon="target" onClick=${fn}>Show me<//>` : null}</div><//>`)}</div>
    <h3 class="how-h">Requirement coverage</h3>
    ${COVERAGE.map(([g, rows]) => html`<${Panel} key=${g} ticks=${true} class="cov" title=${g}><${DataTable} columns=${COV_COLS} rows=${rows} rowKey=${(r) => r[0]} /><//>`)}
    <div class="six two">
      <${Panel} ticks=${true} title="Beyond the URD (included, can be switched off)"><ul class="how-ul">
        <li>3D digital twin of the shop, with stack lights and the 4-hanger loop.</li><li>Root-cause attribution: downtime is put down to the station that held the line up.</li>
        <li>Trim Andon preview (req 34) and the optional CL2 engine/gearbox pairing scan, both off by default in the plant build.</li><li>Lock screen for shared shop PCs and a full audit log with CSV export.</li></ul><//>
      <${Panel} ticks=${true} title="Assumptions to confirm with MG JW"><ul class="how-ul">
        <li>Downtime is based on cycle time (it includes waiting when blocked downstream), with the cause attributed to the root station.</li>
        <li>Shift times, breaks, default targets (30 a shift) and takt (10:00) are placeholders until the plant enters its own.</li>
        <li>Carrier RFID tags and an FL7 photo-eye are acceptable; scanner placement as above.</li>
        <li>Data retention of 3 years online; integration through REST/webhooks and OPC UA.</li></ul><//>
    </div>
  </div>`;
}
function ArchDiagram() {
  const box = (x, y, w, h, t, s, cls = '') => html`<g class=${'ar-box ' + cls}><rect x=${x} y=${y} width=${w} height=${h} /><text x=${x + 12} y=${y + 22} class="ar-t">${t}</text>${s.map((l, i) => html`<text key=${i} x=${x + 12} y=${y + 42 + i * 16} class="ar-s">${l}</text>`)}</g>`;
  const arrow = (x1, y1, x2, y2, label) => html`<g class="ar-ln"><line x1=${x1} y1=${y1} x2=${x2} y2=${y2} marker-end="url(#ar-h)" />${label ? html`<text x=${(x1 + x2) / 2} y=${(y1 + y2) / 2 - 6} text-anchor="middle" class="ar-l">${label}</text>` : null}</g>`;
  return html`<svg class="arch" viewBox="0 0 1120 330" role="img" aria-label="System architecture: stations to line controllers to the line server, then line displays and head office">
    <defs><marker id="ar-h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ar-hd" /></marker></defs>
    ${box(10, 20, 220, 132, 'Each station (×17)', ['Supervisor + Maintenance buttons', 'Buzzer · stack light', 'Carrier RFID reader', 'Presence sensor'])}
    ${box(10, 172, 220, 132, 'Scan & detect points', ['Scanner 1 at TL1 (line-in)', 'Offline scanner at TL6', '2 handhelds on Final', 'Photo-eye at FL7'])}
    ${box(310, 60, 210, 200, 'Line controllers (×3)', ['PLC / edge I/O per line', 'Reads buttons, tags, sensors', 'Drives buzzers and lights', 'Keeps positions over a', 'power cut (retained memory)', 'UPS'])}
    ${box(610, 60, 220, 200, 'Line server (shop floor)', ['Andon engine: tracking,', 'cycle time, downtime, calls', 'Historian database', 'Store-and-forward', 'Web app and API', 'UPS · runs without head office'], 'core')}
    ${box(900, 10, 210, 92, 'Line LCDs (×3)', ['55" industrial screen', 'Kiosk PC · browser page'])}
    ${box(900, 118, 210, 92, 'Head office & mgmt', ['Any browser on the', 'company network'])}
    ${box(900, 226, 210, 92, 'Plant systems', ['MES / ERP · REST, webhooks', 'OPC UA from controllers'])}
    ${arrow(230, 86, 310, 130, 'I/O')}${arrow(230, 238, 310, 190, 'scans')}${arrow(520, 160, 610, 160, 'events')}
    ${arrow(830, 110, 900, 56, '')}${arrow(830, 160, 900, 164, 'LAN')}${arrow(830, 210, 900, 272, '')}
  </svg>`;
}
