/* ════════════════════════════════════════════════════════════════════════
   HMI v2 — React (UMD) + htm. Reads engine state every render; every control
   calls an engine action. Scene and simulation share one rAF loop.
   ════════════════════════════════════════════════════════════════════════ */
const { useState, useEffect, useRef, useReducer } = React;
const html = htm.bind(React.createElement);
const M = window.MGE;
const { POS, STATIONS, WORK_POS, AREAS, fmtClock, fmtDur, shortVin, dispId } = M;

/* ── runtime ── */
const RT = {
  S: null, speed: 5, running: true, acc: 0, scenario: 1, rev: 0,
  ui: { selection: null, hover: null, drawer: null, dialog: null, report: false, simOpen: false, legend: false, view2D: false, panelWidth: 0, muted: false, logFilter: 'all', xray: false, xraySel: true, view: 'overview', theme: 'auto' },
  listeners: new Set(),
};
function setUI(patch) { Object.assign(RT.ui, patch); RT.rev++; RT.listeners.forEach((f) => f()); }
function bump() { RT.rev++; RT.listeners.forEach((f) => f()); }
const act = (fn) => (...a) => { fn(...a); bump(); };

/* ── theme: auto follows the host / OS; the toggle pins light or dark ── */
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } } };
const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
let hostTheme = document.documentElement.getAttribute('data-theme');
function effectiveTheme() {
  if (RT.ui.theme === 'dark' || RT.ui.theme === 'light') return RT.ui.theme;
  if (hostTheme === 'dark' || hostTheme === 'light') return hostTheme;
  return mq && mq.matches ? 'dark' : 'light';
}
function applyTheme() {
  const root = document.documentElement;
  if (RT.ui.theme === 'auto') { if (hostTheme) root.setAttribute('data-theme', hostTheme); else root.removeAttribute('data-theme'); }
  else root.setAttribute('data-theme', RT.ui.theme);
  if (Scene3D.ok) Scene3D.setTheme(effectiveTheme());
}
function cycleTheme() { const order = ['auto', 'light', 'dark']; const t = order[(order.indexOf(RT.ui.theme) + 1) % 3]; store.set('mg-theme', t); setUI({ theme: t }); applyTheme(); }
if (mq) mq.addEventListener('change', () => { if (RT.ui.theme === 'auto') applyTheme(); bump(); });
new MutationObserver(() => { const a = document.documentElement.getAttribute('data-theme'); if (RT.ui.theme === 'auto' && a !== hostTheme) { hostTheme = a; if (Scene3D.ok) Scene3D.setTheme(effectiveTheme()); bump(); } }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

/* ── icons (Lucide paths) ── */
const IC = {
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  buzz: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="M4 2C2.8 3.7 2 5.7 2 8"/><path d="M22 8c0-2.3-.8-4.3-2-6"/>',
  buzzoff: '<path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5"/><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="m2 2 20 20"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>',
  cog: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  grid: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  tv: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  ret: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
  max: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  building: '<rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>',
  swap: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  wifi: '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.86a10 10 0 0 1 14 0"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/>',
  wifioff: '<path d="M12 20h.01"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/><path d="M5 12.86a10 10 0 0 1 5.17-2.69"/><path d="M19 12.86a10 10 0 0 0-2.007-1.523"/><path d="M2 8.82a15 15 0 0 1 4.177-2.643"/><path d="M22 8.82a15 15 0 0 0-11.288-3.764"/><path d="m2 2 20 20"/>',
  power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  chev: '<path d="m9 18 6-6-6-6"/>',
  skip: '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  fault: '<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>', checkc: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', xc: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="0"/><rect x="14" y="4" width="4" height="16" rx="0"/>', play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M8 7v10"/><path d="M12 7v10"/><path d="M17 7v10"/>',
  scanin: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/><path d="m13 8 4 4-4 4"/>',
  scanout: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="m9 12 2 2 4-4"/>',
  vol: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  mute: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  target: '<circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  hour: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  layers: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  map: '<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" x2="9" y1="3" y2="18"/><line x1="15" x2="15" y1="6" y2="21"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
  flask: '<path d="M9 3h6"/><path d="M10 9V3"/><path d="M14 9V3"/><path d="M10 9 4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9"/>',
  up: '<path d="m18 15-6-6-6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
  dashed: '<path d="M10.1 2.18a9.93 9.93 0 0 1 3.8 0"/><path d="M17.6 3.71a9.95 9.95 0 0 1 2.69 2.7"/><path d="M21.82 10.1a9.93 9.93 0 0 1 0 3.8"/><path d="M20.29 17.6a9.95 9.95 0 0 1-2.7 2.69"/><path d="M13.9 21.82a9.94 9.94 0 0 1-3.8 0"/><path d="M6.4 20.29a9.95 9.95 0 0 1-2.69-2.7"/><path d="M2.18 13.9a9.93 9.93 0 0 1 0-3.8"/><path d="M3.71 6.4a9.95 9.95 0 0 1 2.7-2.69"/>',
  exit: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  hand: '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  hanger: '<path d="M12 3v3"/><path d="M5 10h14"/><path d="M5 10v9"/><path d="M19 10v9"/><path d="M8 6h8"/><path d="M3 19h4"/><path d="M17 19h4"/>',
  minus: '<path d="M5 12h14"/>', plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor"/>',
  xray: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="1"/><path d="M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-13.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 13.888 0"/>',
  siren: '<path d="M7 18v-6a5 5 0 1 1 10 0v6"/><path d="M5 21a1 1 0 0 1-1-1v-1a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1z"/><path d="M21 12h1"/><path d="M18.5 4.5 18 5"/><path d="M2 12h1"/><path d="M12 2v1"/><path d="m4.929 4.929.707.707"/><path d="M12 12v6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  box: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7"/>',
};
const Icon = ({ n, size }) => html`<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style=${size ? { width: size, height: size } : null} dangerouslySetInnerHTML=${{ __html: IC[n] }}></svg>`;
const STATUS_ICON = { BUFFERED: 'pause', EMPTY: 'dashed', INBOUND: 'arrow', AWAIT: 'dashed', EMPTY_CARRIER: 'dashed', WORKING: 'clock', NEAR: 'hour', OVERDUE: 'alert', ESCALATED: 'alert', FAULT: 'fault', HOLD: 'fault', COMPLETE: 'checkc', WAITING: 'pause', REMOVAL: 'wrench', PAUSED: 'pause', SCAN: 'scan', HANDLING: 'arrow', TRANSFER: 'arrow', PLACING: 'arrow' };
const LEVEL_TONE = { WARNING: 'warn', OVERDUE: 'crit', ESCALATED: 'esc', FAULT: 'crit', HOLD: 'crit', BLOCKED: 'hold', ASSIST: 'warn', CALL_SUP: 'sup', CALL_MNT: 'mnt', EMERGENCY: 'esc' };
const LEVEL_ICON = { WARNING: 'hour', OVERDUE: 'alert', ESCALATED: 'alert', FAULT: 'fault', HOLD: 'fault', BLOCKED: 'pause', ASSIST: 'hand', CALL_SUP: 'user', CALL_MNT: 'wrench', EMERGENCY: 'siren' };
const LEVEL_LABEL = { HOLD: 'Quality hold', ASSIST: 'Assistance', CALL_SUP: 'Supervisor call', CALL_MNT: 'Maintenance call', EMERGENCY: 'Emergency' };
/* Andon: three station states (URD req 12) */
const ANDON_TONE = { idle: 'muted', normal: 'ok', near: 'warn', over: 'crit' };
const ANDON_LABEL = { idle: 'No unit', normal: 'Normal', near: 'Close to limit', over: 'Over takt' };
const CALL_ICON = { SUP: 'user', MNT: 'wrench' };
const tv = (t) => `var(--${t})`;
const StatusChip = ({ st }) => html`<span class=${'chip c-' + st.tone}><${Icon} n=${STATUS_ICON[st.code] || 'info'} />${st.label}</span>`;
const LevelChip = ({ a }) => html`<span class=${'chip c-' + LEVEL_TONE[a.level]}><${Icon} n=${LEVEL_ICON[a.level]} />${LEVEL_LABEL[a.level] || a.level}</span>`;
const VinText = ({ vin, big }) => vin ? html`<span class="mono" style=${{ fontSize: big ? 19 : undefined, fontWeight: 500 }}><span style=${{ color: 'var(--muted)' }}>${vin.slice(0, 11)}</span>${vin.slice(11)}</span>` : '—';
// Official MG logo (supplied by the plant), embedded unchanged and used in both themes.
const MG_LOGO = 'data:image/png;base64,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';
// Bolt & Volt (designer/builder). Full logo has white type, so it is used on dark only;
// light theme uses the hexagon icon with the name set in text (plant's choice, option b).
const MgMark = () => html`<img class="mg-mark" src=${MG_LOGO} alt="MG" width="30" height="30" />`;

/* ── sound: station buzzers (URD req 16–18), call chimes, and the fault horn ──
   One speaker stands in for many: only buzzers on the line in view sound, which
   mirrors "audible at its own station without disturbing other stations". */
const Horn = {
  ctx: null, last: 0, lastBuzz: 0, seenCalls: 0,
  ensure() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; } } if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  tone(freq, at, dur, type = 'square', vol = 0.04) { const t = this.ctx.currentTime + at, osc = this.ctx.createOscillator(), g = this.ctx.createGain(); osc.type = type; osc.frequency.value = freq; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); osc.connect(g).connect(this.ctx.destination); osc.start(t); osc.stop(t + dur + 0.02); },
  chirp(hi) { if (!this.ctx) return; [0, 0.22].forEach((o, i) => this.tone(hi ? (i ? 1180 : 1480) : (i ? 660 : 880), o, 0.18)); },
  buzz(ids) { if (!this.ctx) return; ids.slice(0, 3).forEach((id, k) => { const f = 520 + (WORK_POS.indexOf(id) % 7) * 34; this.tone(f, k * 0.09, 0.32, 'sawtooth', 0.028); }); },
  chime(type) { if (!this.ctx) return; const f = type === 'MNT' ? [660, 880] : [784, 1046]; f.forEach((x, i) => this.tone(x, i * 0.16, 0.5, 'sine', 0.06)); },
  audibleLine(id) { const v = RT.ui.view; return !['TRIM', 'CHASSIS', 'FINAL'].includes(v) || POS[id].area === v; },
  tick(now) {
    const S = RT.S, n = S.calls.length;
    if (RT.ui.muted || !this.ctx) { this.seenCalls = n; return; }
    if (n > this.seenCalls) { const c = S.calls[n - 1]; if (c.clearedT == null) this.chime(c.type); }
    this.seenCalls = n;
    const ringing = Object.keys(S.buzzing).filter((id) => this.audibleLine(id));
    if (ringing.length && now - this.lastBuzz > 1400) { this.lastBuzz = now; this.buzz(ringing); }
    const un = S.alarms.filter((a) => M.alarmUnacked(a) && M.SEV[a.level] >= 3 && a.type !== 'DELAY'); if (!un.length) return;
    const esc = un.some((a) => a.level === 'EMERGENCY'); if (now - this.last > (esc ? 1300 : 2400)) { this.last = now; this.chirp(esc); }
  },
};
window.addEventListener('pointerdown', () => { if (!RT.ui.muted) Horn.ensure(); }, { capture: true });

/* ── scenarios ── */
function freshState(seed) {
  const S = M.createState(seed, { delayRate: 0.04, mismatchRate: 0.03 });
  S.recording = false; M.runUntil(S, S.cfg.shiftStart); S.recording = true;
  S.events = S.events.filter((e) => e.t >= S.cfg.shiftStart - 900);
  S.alarms = S.alarms.filter(M.alarmActive); S.alarmByKey = {}; S.alarms.forEach((a) => (S.alarmByKey[a.key] = a));
  M.logEvent(S, 'sim', 'SIMULATION · Shift A started with work in progress carried over');
  M.runUntil(S, 9 * 3600 + 38 * 60);
  S.cfg.delayRate = 0; S.cfg.mismatchRate = 0;
  for (let i = 0; i < 3; i++) M.feedBuffer(S);
  return S;
}
function calmDown(S) {
  for (const id of WORK_POS) { const o = S.pos[id].occ; if (o && o.vehicleId && o.completeT == null) o.required = Math.min(o.required, Math.round(M.targetFor(id, S.vehicles[o.vehicleId]) * 0.92)); }
  S.alarms.filter((a) => M.alarmActive(a) && a.type === 'QUALITY').forEach((a) => M.rescanEngine(S, a.pos));
}
const occOf = (S, id) => S.pos[id].occ;
const waitFresh = (S, ids, maxWork = 150) => M.runWhile(S, () => !ids.every((id) => { const o = occOf(S, id); return o && o.vehicleId && o.completeT == null && o.workT < maxWork; }), 4 * 3600);
/* Scenario 1 demo: after DEMO_AFTER seconds of real running time (paused time does not count),
   CL2 hits an engine-mount problem and reworks in station. It runs past target, escalates, and
   holds up the hangers behind it, so the bottleneck appears without anyone touching the controls. */
const DEMO_AFTER = 150, DEMO_EXTRA = 8 * 60;
function injectDemoDelay(S) {
  const o = occOf(S, 'CL2'), msg = 'engine mount bolt cross-threaded, rework in station';
  if (o && o.vehicleId && o.completeT == null) {
    o.required = M.targetFor('CL2', S.vehicles[o.vehicleId]) + DEMO_EXTRA;
    M.logEvent(S, 'sim', `SIMULATION · CL2: ${msg}`, { pos: 'CL2' });
  } else {
    S.pendingDelay = { pos: 'CL2', extra: DEMO_EXTRA };
    M.logEvent(S, 'sim', `SIMULATION · CL2: ${msg} on the next unit`, { pos: 'CL2' });
  }
}
const SCENARIOS = [
  { n: 1, title: 'Normal production', desc: 'Every station runs inside its 10:00 takt. After about 2½ minutes of watching, a problem arises on its own at CL2: it passes takt, the buzzer sounds and the hold-up spreads.', setup(S) { calmDown(S); return { view: 'overview', speed: 15, demo: true }; } },
  { n: 2, title: 'Over takt · buzzer', desc: 'CL3 runs past its takt. The station turns red, its buzzer rings, and it stops by itself when the unit leaves.',
    setup(S) { calmDown(S); waitFresh(S, ['CL3'], 240); const o = occOf(S, 'CL3'); const v = S.vehicles[o.vehicleId], t = M.targetFor('CL3', v); o.arriveT = S.t - (t - 70) - o.plannedT; o.workT = t - 70; o.required = t + 4 * 60; M.logEvent(S, 'sim', 'SIMULATION · scenario 2: CL3 work content increased', { pos: 'CL3' }); return { select: { kind: 'pos', id: 'CL3' }, speed: 5, view: 'CHASSIS' }; } },
  { n: 3, title: 'Completed but blocked', desc: 'CL1 finishes its work, but CL2 still holds its hanger. Finished is not the same as free to move, and the downtime is put down to CL2.',
    setup(S) { calmDown(S); waitFresh(S, ['CL1', 'CL2'], 400); const a = occOf(S, 'CL1'), b = occOf(S, 'CL2'); a.workT = Math.max(a.workT, 7 * 60); a.required = a.workT + 6; b.workT = 4 * 60; b.required = Math.round(M.targetFor('CL2', S.vehicles[b.vehicleId]) * 1.2); return { select: { kind: 'pos', id: 'CL1' }, speed: 5 }; } },
  { n: 4, title: 'Waiting for a hanger', desc: 'FL1 is slow to finish, so all 4 hangers fill up. TL5 is done but has no empty hanger to load onto at TL6.',
    setup(S) { calmDown(S); waitFresh(S, ['FL1'], 120); const o = occOf(S, 'FL1'); o.required = o.workT + 30 * 60; M.logEvent(S, 'sim', 'SIMULATION · scenario 4: wheel fitment at FL1 slowed down', { pos: 'FL1' }); M.runWhile(S, () => { const o = occOf(S, 'TL5'), p = M.permissives(S, 'TL5'); return !(o && o.vehicleId && o.completeT != null && S.t - o.completeT > 30 && p && p.find((c) => c.key === 'dest' && /All 4 hangers/.test(c.detail))); }, 4 * 3600); return { select: { kind: 'pos', id: 'TL5' }, speed: 5, view: 'overview' }; } },
  { n: 5, title: 'Take a unit offline', desc: 'The unit at FL3 has a fitment issue. Scan its VIN at the station to take it offline; it leaves the counts and the target.',
    setup(S) { calmDown(S); waitFresh(S, ['FL3'], 300); const o = occOf(S, 'FL3'), v = S.vehicles[o.vehicleId]; M.logEvent(S, 'sim', 'SIMULATION · scenario 5: seat fitment issue at FL3', { pos: 'FL3' }); return { select: { kind: 'pos', id: 'FL3' }, speed: 1, dialog: { type: 'offline', vehicleId: v.id, reason: M.OFFLINE_REASONS[1] } }; } },
  { n: 6, title: 'Hanger fault', desc: 'Hanger at CL4 reports a lift-encoder fault. Travel is inhibited even though the team has finished.',
    setup(S) { calmDown(S); waitFresh(S, ['CL4'], 300); const o = occOf(S, 'CL4'); o.required = o.workT + 45; M.injectCarrierFault(S, S.pos['CL4'].carrierId); M.logEvent(S, 'sim', `SIMULATION · fault injected on hanger ${S.pos['CL4'].carrierId}`, { pos: 'CL4' }); return { select: { kind: 'pos', id: 'CL4' }, speed: 5 }; } },
  { n: 7, title: 'Supervisor and maintenance calls', desc: 'CL2 calls its supervisor and FL4 calls maintenance. Respond, then clear each call; response and clear times are recorded.',
    setup(S) { calmDown(S); S.cfg.callRate = 0; M.raiseCall(S, 'CL2', 'SUP', 'Station button'); M.runUntil(S, S.t + 40); M.raiseCall(S, 'FL4', 'MNT', 'Station button'); M.runUntil(S, S.t + 25); return { speed: 1, drawer: 'calls' }; } },
  { n: 8, title: 'Emergency stop (test)', desc: 'A simulated emergency at CL2 stops the Chassis line until it is cleared. Not an Andon button; it tests the line-stop path.',
    setup(S) { calmDown(S); waitFresh(S, ['CL2'], 300); M.callEmergency(S, 'CL2'); return { select: { kind: 'pos', id: 'CL2' }, speed: 5 }; } },
  { n: 9, title: 'Offline and return', desc: 'A unit was taken off at FL4. Send it back: it rejoins at FL4 when the station is free and counts only when it completes.',
    setup(S) { calmDown(S); waitFresh(S, ['FL4'], 200); const v = S.vehicles[occOf(S, 'FL4').vehicleId]; M.takeOffLine(S, v.id, { reason: M.OFFLINE_REASONS[2], notes: 'Wrong-spec grille fitted; correct part on its way', by: 'Line supervisor', scan: v.vin }); M.runUntil(S, S.t + 60); return { select: { kind: 'veh', id: v.id }, speed: 5 }; } },
  { n: 10, title: 'Invalid scan', desc: 'Scanner 1 reads a VIN that is already on the line. The scan is rejected and nothing changes.',
    setup(S) { calmDown(S); const id = ['TL2', 'TL3', 'CL1', 'FL3'].find((p) => occOf(S, p) && occOf(S, p).vehicleId); return { view: 'TRIM', speed: 1, dialog: { type: 'scan', scanner: 'ENTRY', vin: S.vehicles[occOf(S, id).vehicleId].vin } }; } },
];
function loadScenario(n) {
  const sc = SCENARIOS.find((s) => s.n === n);
  const keep = {};
  const S = freshState(11); Object.assign(S.cfg, keep);
  const r = sc.setup(S) || {}; S.holdExit = {};
  M.step(S, 1);
  RT.S = S; RT.acc = 0; RT.scenario = n; RT.speed = r.speed || 5; RT.running = true; RT.demo = r.demo ? { elapsed: 0, fired: false } : null;
  setUI({ selection: r.select || null, dialog: r.dialog || null, drawer: r.drawer || null, report: false, hover: null, view: r.view || RT.ui.view });
  M.logEvent(S, 'sim', `SIMULATION · scenario ${n}: ${sc.title}`);
  setTimeout(() => { if (r.select) focusSel(r.select); else if (Scene3D.ok) Scene3D.focusView(r.view || 'overview'); }, 30);
}
const focusSel = (sel) => { if (Scene3D.ok) Scene3D.focusAny(sel); };
function select(sel, focus = true) {
  if (sel && sel.kind === 'scanner') { if (sel.id === 'ENTRY') { setUI({ dialog: { type: 'scan', scanner: 'ENTRY' } }); return; } const at = sel.id === 'OFFLINE' ? 'TL6' : sel.id === 'EOL' ? 'FL7' : sel.id === 'HH1' ? 'FL2' : 'FL5'; return select({ kind: 'pos', id: at }, focus); }
  setUI({ selection: sel, hover: null }); if (sel && focus) focusSel(sel);
}
function topAlarm(S) { const a = S.alarms.filter((x) => M.alarmActive(x) && x.level !== 'WARNING'); a.sort((x, y) => (M.alarmUnacked(y) - M.alarmUnacked(x)) || (M.SEV[y.level] - M.SEV[x.level]) || (x.raisedT - y.raisedT)); return a[0]; }
function openAlarm(a) { setUI({ drawer: null }); select({ kind: 'pos', id: POS[a.pos] ? dispId(a.pos) : 'TL1' }); }

/* ═════════ islands ═════════ */
function IdIsland() {
  const S = RT.S, p = M.pace(S), sh = S.shift || {};
  return html`<div class="seg id-island">
    <div class="brand"><${MgMark} /><div><div class="brand-name">GA Operations</div><div class="brand-sub">MG JW Automobile</div></div></div>
    <div class="clock"><span class="num">${fmtClock(S.t)}</span><span class="micro" style=${{ color: S.planned ? 'var(--paused)' : null }}>${S.planned ? (S.planned.kind === 'OFF' ? 'No shift' : S.planned.label) : sh.name}</span></div>
    <span class="sim-tag" title="All data is simulated. No PLC, scanner or sensor is connected."><${Icon} n="flask" size=${10} />SIMULATION</span>
    <div class="shiftbar" title=${sh.name ? `${sh.name} ${fmtClock(sh.start, false)}–${fmtClock(sh.end, false)} · ${Math.round(p.frac * 100)}% of productive time elapsed` : 'No shift running'}><i style=${{ width: `${p.frac * 100}%` }}></i></div>
  </div>`;
}
function StateIsland() {
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
    <span class=${'lamp sup' + (sup ? ' blink' : '')} style=${{ opacity: sup ? 1 : 0.25 }}></span><span class=${'lamp mnt' + (mnt ? ' blink' : '')} style=${{ opacity: mnt ? 1 : 0.25 }}></span>CALLS<span class="n">${open.length}</span></button>`;
}
function ActIsland() {
  const S = RT.S;
  const active = S.alarms.filter((a) => M.alarmActive(a) && M.SEV[a.level] >= 3), unacked = active.filter(M.alarmUnacked);
  const themeIcon = RT.ui.theme === 'light' ? 'sun' : RT.ui.theme === 'dark' ? 'moon' : 'auto';
  return html`<nav class="seg act-island" aria-label="Actions">
    <button class="ibtn" title="Find a vehicle by VIN (/)" aria-label="Find a vehicle by VIN" onClick=${() => setUI({ dialog: { type: 'vin' } })}><${Icon} n="search" /></button>
    <button class="ibtn" title="Scanner 1 · line-in scan at TL1" aria-label="Line-in scan" onClick=${() => setUI({ dialog: { type: 'scan', scanner: 'ENTRY' } })}><${Icon} n="scanin" /></button>
    <button class="ibtn opt" title="Shift report" aria-label="Shift report" onClick=${() => setUI({ report: true })}><${Icon} n="chart" /></button>
    <button class="ibtn" title="X-ray build view (X)" aria-label="X-ray build view" aria-pressed=${RT.ui.xray} onClick=${() => setUI({ xray: !RT.ui.xray })}><${Icon} n="xray" /></button>
    <button class="ibtn" title=${`Theme: ${RT.ui.theme}`} aria-label=${`Theme ${RT.ui.theme}. Switch theme`} onClick=${cycleTheme}><${Icon} n=${themeIcon} /></button>
    <button class="ibtn opt" title=${RT.ui.muted ? 'Alarm sound muted' : 'Alarm sound on'} aria-label=${RT.ui.muted ? 'Unmute alarm sound' : 'Mute alarm sound'} onClick=${() => { setUI({ muted: !RT.ui.muted }); if (!RT.ui.muted) Horn.ensure(); }}><${Icon} n=${RT.ui.muted ? 'mute' : 'vol'} /></button>
    <span class="sep"></span>
    <${CallsPill} />
    <button class=${'alarm-pill' + (active.length ? ' hot' : '') + (unacked.length ? ' ring' : '')} onClick=${() => setUI({ drawer: RT.ui.drawer ? null : 'active' })} aria-label=${`${active.length} critical alarms, ${unacked.length} unacknowledged`}><${Icon} n="bell" />ALARMS<span class="n">${active.length}</span></button>
    <span class="sep"></span>
    <button class="bv-mark" onClick=${() => setUI({ dialog: { type: 'about' } })} title="Designed & built by Bolt & Volt"><img class="full" src=${BV_FULL} alt="Bolt & Volt" /><img class="ink" src=${BV_FULL_INK} alt="Bolt & Volt" /></button>
  </nav>`;
}

/* ── line strip: the whole process as one row of instruments ── */
function Strip() {
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
function HangerTracker() {
  const S = RT.S, hs = Object.values(S.carriers).filter((c) => c.kind === 'Hanger');
  return html`<span class="htrack" title="The 4 hangers: TL6 → CL1 → CL2 → CL3 → Buffer → CL4 → FL1, empty return to TL6">${hs.map((c) => html`<span key=${c.id} class=${'hchip' + (c.fault ? ' fault' : c.vehicleId ? ' loaded' : '')}><b>${c.id}</b>${hangerWhere(S, c)}</span>`)}</span>`;
}

/* ── simulation console ── */
function SimConsole() {
  const S = RT.S, C = S.cfg, open = RT.ui.simOpen;
  const setC = (k, v) => { C[k] = v; bump(); };
  const Tog = ({ k, label }) => html`<label for=${'tg-' + k}>${label}</label><button id=${'tg-' + k} class="toggle" role="switch" aria-checked=${!!C[k]} onClick=${() => setC(k, !C[k])}></button>`;
  return html`<section class="glass simcon ticks in" aria-label="Simulation control">
    <div class="simcon-bar">
      <span class="sim-tag"><${Icon} n="flask" size=${11} />SIM</span>
      <button class="btn sm icon ghost" aria-label=${RT.running ? 'Pause simulation' : 'Run simulation'} onClick=${() => { RT.running = !RT.running; bump(); }}><${Icon} n=${RT.running ? 'pause' : 'play'} /></button>
      <span class="micro" style=${{ whiteSpace: 'nowrap' }}>Scenario ${RT.scenario}</span>
      <div class="speeds" role="group" aria-label="Simulation speed">${[1, 5, 15, 60].map((s) => html`<button key=${s} aria-pressed=${RT.speed === s} onClick=${() => { RT.speed = s; bump(); }}>${s}×</button>`)}</div>
      <button class="btn sm icon ghost" aria-label=${open ? 'Collapse simulation control' : 'Expand simulation control'} aria-expanded=${open} onClick=${() => setUI({ simOpen: !open })}><${Icon} n=${open ? 'down' : 'up'} /></button>
    </div>
    ${open ? html`<div class="simcon-body">
      <div><div class="micro" style=${{ marginBottom: 6 }}>Scenarios · each restarts the shift at 09:38</div>
        ${SCENARIOS.map((s) => html`<button key=${s.n} class="scn" aria-current=${RT.scenario === s.n} onClick=${() => loadScenario(s.n)}><span class="n">${s.n}</span><span class="t">${s.title}</span><span class="d">${s.desc}</span></button>`)}</div>
      <div class="cfg">
        <${Tog} k="autoFeed" label="Paint-shop body feed" /><${Tog} k="autoEntryScan" label="Auto scan at Scanner 1 (line-in)" /><${Tog} k="autoExitScan" label="End-of-line photo-eye at FL7" /><${Tog} k="autoComplete" label="Teams finish (sensor detects)" />
        <${Tog} k="autoRespond" label="Simulated responders clear calls" /><${Tog} k="trimAndon" label="Trim Andon preview (req 34)" /><${Tog} k="useSchedule" label="Breaks and shift times stop the line" /><${Tog} k="engineCheck" label="CL2 engine pairing scan (option)" />
        <label for="cfg-calls">Simulated calls (% of units)</label><input id="cfg-calls" type="number" min="0" max="40" value=${Math.round(C.callRate * 100)} onChange=${(e) => setC('callRate', M.clamp(+e.target.value || 0, 0, 40) / 100)} />
        <label for="cfg-warn">Close to limit at % of takt</label><input id="cfg-warn" type="number" min="50" max="99" value=${Math.round(C.warnPct * 100)} onChange=${(e) => setC('warnPct', M.clamp(+e.target.value || 85, 50, 99) / 100)} />
        <label for="cfg-esc">Escalate overdue after (min)</label><input id="cfg-esc" type="number" min="0.5" max="30" step="0.5" value=${C.escalateAfter / 60} onChange=${(e) => setC('escalateAfter', Math.round(M.clamp(+e.target.value || 3, 0.5, 30) * 60))} />
        <label for="cfg-blk">Blocked alarm after (min)</label><input id="cfg-blk" type="number" min="0.5" max="30" step="0.5" value=${C.blockedAlarmAfter / 60} onChange=${(e) => setC('blockedAlarmAfter', Math.round(M.clamp(+e.target.value || 1.5, 0.5, 30) * 60))} />
        <label for="cfg-rate">Random team delay rate (%)</label><input id="cfg-rate" type="number" min="0" max="30" value=${Math.round(C.delayRate * 100)} onChange=${(e) => setC('delayRate', M.clamp(+e.target.value || 0, 0, 30) / 100)} />
      </div>
      <div><div class="micro" style=${{ marginBottom: 8 }}>Simulated line stop</div><div class="actions">${['TRIM', 'CHASSIS', 'FINAL'].map((a) => html`<button key=${a} class="btn sm sim" onClick=${act(() => M.setPaused(S, a, !S.paused[a]))}><${Icon} n=${S.paused[a] ? 'play' : 'pause'} />${S.paused[a] ? 'Restart ' : 'Stop '}${AREAS[a].short}</button>`)}</div></div>
      <div><div class="micro" style=${{ marginBottom: 8 }}>Time</div><div class="actions"><button class="btn sm sim" title="Fast-forward the simulation to the next shift, break or restart" onClick=${() => skipAhead()}><${Icon} n="skip" />Skip to ${S.planned ? 'restart' : 'next break or shift change'} · ${fmtClock(M.nextBoundary(S, S.t), false)}</button></div></div>
      <p class="note">Adapter: <b>${M.Integration.mode}</b>. Nothing is sent to any PLC, conveyor, scanner or sensor. Permissives shown in the HMI are simulated interlocks.</p>
    </div>` : null}
  </section>`;
}

/* fast-forward to the next shift boundary (runs the engine; can take a second or two) */
function skipAhead() {
  const S = RT.S, to = M.nextBoundary(S, S.t) + 1;
  M.runUntil(S, to, 40000); RT.acc = 0; bump();
}

/* ── inspector pieces ── */
function Ring({ r, tone }) {
  const R = 36, C = 2 * Math.PI * R, f = Math.min(1, r), over = Math.max(0, Math.min(1, r - 1));
  return html`<svg viewBox="0 0 88 88" width="88" height="88" aria-hidden="true">
    <circle cx="44" cy="44" r=${R} fill="none" stroke="var(--hair)" stroke-width="4" />
    <circle cx="44" cy="44" r=${R} fill="none" stroke=${tv(tone)} stroke-width="4" stroke-dasharray=${`${C * f} ${C}`} transform="rotate(-90 44 44)" />
    ${over > 0 ? html`<circle cx="44" cy="44" r=${R - 8} fill="none" stroke=${tv(tone)} stroke-width="2.5" stroke-dasharray=${`${2 * Math.PI * (R - 8) * over} 999`} transform="rotate(-90 44 44)" opacity=".75" />` : null}
    <line x1="44" y1="4" x2="44" y2="11" stroke="var(--muted)" stroke-width="1.5" transform=${`rotate(${RT.S.cfg.warnPct * 360} 44 44)`} />
  </svg>`;
}
const Checklist = ({ pm }) => html`<ul class="checks">${pm.map((c) => html`<li key=${c.key} style=${{ color: c.ok ? 'var(--text-2)' : 'var(--text)' }}><span style=${{ color: c.ok ? 'var(--ok)' : 'var(--crit)' }}><${Icon} n=${c.ok ? 'checkc' : 'xc'} /></span><span>${c.label}${c.detail ? html`<span class="why">${c.detail}</span>` : null}</span></li>`)}</ul>`;
const PosLink = ({ id }) => html`<button class="linkish" onClick=${() => select({ kind: 'pos', id: dispId(id) })}>${dispId(id)}</button>`;
function RootCallout({ posId }) {
  const S = RT.S, an = S._analysis; if (!an) return null;
  const e = an.byPos[posId], impacts = (an.significant || {})[posId], out = [];
  if (impacts && impacts.length && !(impacts.length === 1 && impacts[0] === posId)) {
    const others = impacts.filter((x) => x !== posId);
    out.push(html`<div key="r" class="callout crit"><div class="ttl" style=${{ color: 'var(--crit)' }}><${Icon} n="alert" />Holding up ${others.length} position${others.length > 1 ? 's' : ''}</div>
      <div>${others.map((x, i) => html`<span key=${x}>${i ? ', ' : ''}<${PosLink} id=${x} /> <span class="c-muted">${fmtDur(S.t - S.pos[x].occ.completeT)} waiting</span></span>`)}</div>
      <div class="note">Those bodies are finished but cannot transfer until ${dispId(posId)} clears. Other positions are unaffected.</div></div>`);
  }
  if (e && e.complete && e.cause && e.root !== posId) {
    const rs = M.posStatus(S, e.root);
    out.push(html`<div key="w" class="callout hold"><div class="ttl" style=${{ color: 'var(--hold)' }}><${Icon} n="pause" />Work complete · waiting for transfer</div><div>${e.cause.detail || e.cause.label}</div>
      <div>Root cause <${PosLink} id=${e.root} /> · <span style=${{ color: tv(rs.tone) }}>${rs.label}</span>${POS[e.root].team ? html` <span class="c-muted">· ${POS[e.root].team}</span>` : null}</div></div>`);
  } else if (e && e.complete && e.cause && e.root === posId) out.push(html`<div key="o" class="callout crit"><div class="ttl" style=${{ color: 'var(--crit)' }}><${Icon} n="fault" />Movement inhibited here</div><div>${e.cause.detail || e.cause.label}</div></div>`);
  return out.length ? html`<div style=${{ display: 'grid', gap: 8 }}>${out}</div>` : null;
}
function AlarmMini({ a }) {
  return html`<div class=${'callout ' + (a.level === 'BLOCKED' ? 'hold' : a.level === 'WARNING' || a.level === 'ASSIST' ? 'warn' : 'crit')}>
    <div style=${{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><${LevelChip} a=${a} /><span class="mono c-muted" style=${{ fontSize: 12 }}>since ${fmtClock(a.raisedT, false)}</span>${a.ackT != null ? html`<span class="chip c-muted"><${Icon} n="check" />Acknowledged</span>` : null}</div>
    <div>${a.msg}</div>
    ${a.ackT != null ? html`<div class="note">Acknowledged ${fmtClock(a.ackT, false)} by ${a.ackBy}. The condition is still open.</div>` : null}
    <div class="actions">
      ${a.ackT == null && a.level !== 'WARNING' ? html`<button class="btn sm warn" onClick=${act(() => M.ackAlarm(RT.S, a.id))}><${Icon} n="check" />Acknowledge</button>` : null}
    </div></div>`;
}
function BuildList({ v, only }) {
  const S = RT.S, bs = M.buildState(S, v);
  const items = M.buildFor(v).filter((b) => !only || b.st === only || false);
  return html`<ul class="build">${items.map((b) => {
    const f = b.key === 'doors' ? bs.doors : bs[b.key];
    const cls = f >= 1 ? 'done' : f > 0 ? 'now' : 'todo';
    return html`<li key=${b.key} class=${cls}><span class="st">${dispId(b.st)}</span><span>${b.label}</span><span class="pg" title=${`${Math.round(f * 100)}%`}><i style=${{ width: `${f * 100}%` }}></i></span></li>`;
  })}</ul>`;
}

/* One open call: who called, how long it has waited, and Respond / Clear for the right responder. */
function CallRow({ c, compact }) {
  const S = RT.S, T = M.CALL_TYPES[c.type], waiting = S.t - c.raisedT, canAct = can('respond.' + c.type);
  return html`<div class="callrow" style=${{ borderColor: `color-mix(in srgb, var(--call-${c.type.toLowerCase()}) 50%, transparent)` }}>
    <span class=${'lamp ' + c.type.toLowerCase() + (c.respondedT == null ? ' blink' : '')}></span>
    <div style=${{ minWidth: 0 }}><div style=${{ fontWeight: 600 }}>${T.label}${compact ? html` · <button class="linkish mono" onClick=${() => { setUI({ drawer: null }); select({ kind: 'pos', id: c.pos }); }}>${c.pos}</button>` : null}</div>
      <div class="who">${c.respondedT == null ? `Called ${fmtClock(c.raisedT, false)} · waiting for ${T.label.toLowerCase()}` : `${c.respondedBy} responded after ${fmtDur(c.respondedT - c.raisedT)} · helping ${fmtDur(S.t - c.respondedT)}`}</div></div>
    <div style=${{ display: 'grid', justifyItems: 'end', gap: 6 }}><span class="wait" style=${{ color: c.respondedT == null && waiting > 180 ? 'var(--crit)' : null }} title="Time since the call">${fmtDur(waiting)}</span>
      <span class="actions" style=${{ gap: 6 }}>${c.respondedT == null ? html`<button class=${'btn sm ' + c.type.toLowerCase()} disabled=${!canAct} title=${canAct ? 'Help has arrived at the station' : `Only ${T.label.toLowerCase()} users respond to this call`} onClick=${act(() => M.respondCall(S, c.id, userName()))}>Respond</button>` : null}
        <button class="btn sm" disabled=${!canAct} title=${canAct ? 'Help given · clear the call' : `Only ${T.label.toLowerCase()} users clear this call`} onClick=${act(() => M.clearCall(S, c.id, userName()))}><${Icon} n="check" />Clear</button></span></div>
  </div>`;
}
function StationInspector({ id }) {
  const S = RT.S, P = POS[id], st = M.stationStatus(S, id), sv = M.stationVehicle(S, id);
  const posId = id;
  const p = S.pos[posId], occ = p.occ, v = sv && sv.v, c = p.carrierId && S.carriers[p.carrierId];
  const pm = M.permissives(S, posId);
  const alarms = S.alarms.filter((a) => M.alarmActive(a) && a.pos === id && a.type !== 'CALL');
  const events = S.events.filter((e) => e.pos === id).slice(-8).reverse();
  const isWork = P.kind === 'work', an = isWork ? M.andonState(S, id) : null, live = an && an.state !== 'idle' && sv && sv.posId === id;
  const tone = live ? ANDON_TONE[an.state] : 'text';
  const xf = S.xfers.find((q) => q.from === id || q.to === id);
  const emerg = M.callActive(S, 'EMERG', id), calls = M.callsAt(S, id), callsOk = M.callAllowedAt(S, id);
  const buzzOn = S.buzzing[id] != null, buzzEn = M.buzzerEnabled(S, id), inScope = M.ANDON_AREAS.includes(P.area);
  const offOk = v && M.isActive(v) && !xf && M.OFFLINE_POS.includes(id);
  const press = (type) => { if (M.openCall(S, id, type)) return; M.raiseCall(S, id, type, `${userName()} · station button`); bump(); };
  return html`<${React.Fragment}>
    <div class="insp-head"><div style=${{ flex: 1, minWidth: 0 }}>
      <div class="micro">${AREAS[P.area].station} · ${AREAS[P.area].name}${!inScope && isWork ? ' · expansion preview' : ''}</div>
      <div class="id">${id}</div><div class="sub">${P.op}</div>
      <div style=${{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>${an ? html`<span class=${'andon-state c-' + ANDON_TONE[an.state]}>${ANDON_LABEL[an.state]}</span>` : null}<${StatusChip} st=${st} /></div></div>
      <button class="btn sm ghost icon" aria-label="Close inspector" onClick=${() => setUI({ selection: null })}><${Icon} n="x" /></button></div>
    <div class="insp-body">
      ${isWork && callsOk ? html`<div class="callpad" role="group" aria-label="Station call buttons">${['SUP', 'MNT'].map((t) => { const oc = M.openCall(S, id, t), T = M.CALL_TYPES[t];
        return html`<button key=${t} class=${'btn lg callbtn ' + t.toLowerCase() + (oc ? ' on' : '')} aria-pressed=${!!oc} disabled=${!can('call')} title=${oc ? `${T.label} call open since ${fmtClock(oc.raisedT, false)} · cleared by the responder` : `Call ${T.label.toLowerCase()} to ${id}`} onClick=${() => press(t)}>
          <span class="cb-top"><${Icon} n=${CALL_ICON[t]} />${T.label}</span><span class="cb-sub">${oc ? (oc.respondedT == null ? `calling · ${fmtDur(S.t - oc.raisedT)}` : `${oc.respondedBy.split(' · ')[0]} here`) : 'Call'}</span></button>`; })}</div>` : isWork ? html`<p class="note">Trim Andon preview is off, so this station has no call buttons.</p>` : html`<p class="note">The buffer has no team. A loaded hanger waits here when CL4 is busy, and moves on by itself.</p>`}
      ${calls.length ? html`<div>${calls.map((cl) => html`<${CallRow} key=${cl.id} c=${cl} />`)}</div>` : null}
      ${live ? html`<div class="timer"><${Ring} r=${an.ratio} tone=${tone === 'ok' ? 'text' : tone} /><div>
        <div class="num" style=${{ color: an.state === 'over' ? 'var(--crit)' : 'var(--text)' }}>${fmtDur(an.cycle)}</div>
        <div class="of">cycle time · takt ${fmtDur(an.takt)}</div>
        <div class="delta" style=${{ color: an.state === 'over' ? 'var(--crit)' : an.state === 'near' ? 'var(--warn)' : 'var(--text-2)' }}>${an.cycle > an.takt ? `+${fmtDur(an.cycle - an.takt)} over takt` : `${fmtDur(an.takt - an.cycle)} to takt`}${occ && occ.completeT != null && occ.vehicleId ? ' · work finished' : ''}</div>
        <div class="note" style=${{ marginTop: 4 }}>Work ${fmtDur(occ.workT)}${occ.waitT ? ` · waiting ${fmtDur(occ.waitT)}` : ''}${occ.plannedT ? ` · breaks ${fmtDur(occ.plannedT)} (excluded)` : ''}</div></div></div>` : null}
      ${isWork ? html`<div class="andon-row" style=${{ padding: '10px 12px', border: '1px solid var(--hair)' }}>
        <span style=${{ display: 'flex', alignItems: 'center', gap: 8 }}><span class=${buzzOn ? 'c-crit' : 'c-muted'}><${Icon} n=${buzzEn ? 'buzz' : 'buzzoff'} /></span><span><b>Buzzer</b> <span class="c-muted">· ${!buzzEn ? 'switched off' : buzzOn ? `ringing ${fmtDur(S.t - S.buzzing[id])}` : 'quiet · rings over takt'}</span></span></span>
        <span style=${{ display: 'flex', alignItems: 'center', gap: 8 }}><span class="note">${M.stationCount(S, id)} vehicle${M.stationCount(S, id) === 1 ? '' : 's'} here</span><button class="toggle" role="switch" aria-checked=${buzzEn} aria-label=${`Buzzer at ${id}`} disabled=${!can('buzzer')} title=${can('buzzer') ? 'Switch this station’s buzzer on or off (logged)' : 'Only authorised users switch buzzers'} onClick=${act(() => M.setBuzzer(S, id, !buzzEn, userName()))}></button></span></div>` : null}
      ${xf ? html`<div class="callout"><div class="ttl" style=${{ color: 'var(--transit)' }}><${Icon} n="arrow" />${M.XFER_FROM[xf.from].label}</div><div>${S.vehicles[xf.vehicleId].vin.slice(-6)} moving from ${S.carriers[S.pos[xf.from].carrierId].id} to ${S.carriers[S.pos[xf.to].carrierId].id} · ${fmtDur(Math.max(0, xf.t1 - S.t))} left</div></div>` : null}
      ${v ? html`<dl class="kv">
        <dt>VIN</dt><dd><button class="linkish" onClick=${() => select({ kind: 'veh', id: v.id })}>${v.vin}</button></dd>
        <dt>Model</dt><dd>${v.variant.name}</dd><dt>Paint</dt><dd><${PaintChip} p=${v.paint} /></dd>
        <dt>Carrier</dt><dd class="mono">${c ? `${c.kind} ${c.id}` : '—'}</dd>
        ${occ ? html`<dt>Arrived</dt><dd class="mono">${fmtClock(occ.arriveT)}</dd>` : null}
        ${occ && occ.pausedT ? html`<dt>Line-stop time</dt><dd class="mono">${fmtDur(occ.pausedT)}</dd>` : null}
        <dt>In the line for</dt><dd class="mono">${fmtDur(S.t - v.entryT)}</dd>
      </dl>` : html`<p class="note">${p.reservedBy ? `${S.carriers[p.reservedBy].kind} ${p.reservedBy} is on its way. The position becomes occupied when arrival is confirmed.` : c ? `${c.kind} ${c.id} is here and empty, ready for the next body.` : 'No carrier present. The position is ready to receive the next one.'}</p>`}
      ${v && id === 'CL2' && v.engine ? html`<div class=${'callout ' + (v.engine.ok ? '' : 'crit')}><div class="ttl" style=${{ color: v.engine.ok ? 'var(--ok)' : 'var(--crit)' }}><${Icon} n="link" />Engine / transmission ${v.engine.ok ? 'paired' : 'mismatch'} · option</div>
        <div class="mono" style=${{ fontSize: 12 }}>${v.engine.engineNo} · ${v.engine.transNo}</div>
        ${v.engine.ok ? null : html`<div><button class="btn sm ok" onClick=${act(() => M.rescanEngine(S, 'CL2'))}><${Icon} n="scan" />Rescan correct unit</button></div>`}</div>` : null}
      ${live && an.state === 'over' && offOk && occ.completeT == null && occ.workT - an.takt >= S.cfg.escalateAfter ? html`<div class="callout crit"><div class="ttl" style=${{ color: 'var(--esc)' }}><${Icon} n="exit" />Consider taking this unit offline</div><div>${fmtDur(an.cycle - an.takt)} over takt. Taking it offline keeps the line moving; it is recorded, not repaired here.</div><div><button class="btn sm danger" disabled=${!can('offline')} onClick=${() => setUI({ dialog: { type: 'offline', vehicleId: v.id, reason: M.OFFLINE_REASONS[0] } })}><${Icon} n="exit" />Take offline…</button></div></div>` : null}
      ${P.hangerPoint ? html`<div class="callout"><div class="ttl" style=${{ color: 'var(--text-2)' }}><${Icon} n="hanger" />Hanger point</div><div>${c ? html`Hanger <b class="mono">${c.id}</b> is here${c.vehicleId ? ' carrying this unit' : ' and empty'}.` : p.reservedBy ? html`Hanger <b class="mono">${p.reservedBy}</b> is on its way.` : 'No hanger here right now.'}</div><div class="note">${id === 'TL6' ? 'Bodies are loaded from the Trim conveyor onto a hanger here. TL6 is the end of Trim, where a unit can be taken offline with a scan.' : id === 'FL1' ? 'Bodies are lowered from the hanger onto the Final conveyor here. The empty hanger returns to TL6 on its own rail.' : 'One of the 4 hangers carries the body through this point. Tracking follows the hanger, so no scan is needed here.'}</div><div style=${{ marginTop: 4 }}><${HangerTracker} /></div></div>` : null}
      <${RootCallout} posId=${posId} />
      ${alarms.length ? html`<div class="sec"><div class="micro">Alarms</div>${alarms.map((a) => html`<${AlarmMini} key=${a.id} a=${a} />`)}</div>` : null}
      ${v && isWork ? html`<div class="sec"><div class="micro"><span>Installed here</span><span>${v.variant.name}</span></div><${BuildList} v=${v} only=${id} /></div>` : null}
      ${pm ? html`<div class="sec"><div class="micro">Transfer readiness → ${M.XFER_FROM[posId] ? dispId(M.XFER_FROM[posId].to) + ' carrier' : M.NEXT[posId] ? dispId(M.NEXT[posId]) : 'carrier return'}</div><${Checklist} pm=${pm} /><p class="note">Simulated permissives. In production, motion authority stays with the PLC and safety system.</p></div>` : null}
      <div class="sec"><div class="micro">Unit</div><div class="actions">
        ${offOk ? html`<button class="btn danger" disabled=${!can('offline')} title=${can('offline') ? 'Scan the VIN here to take the unit offline' : 'Your role cannot take units offline'} onClick=${() => setUI({ dialog: { type: 'offline', vehicleId: v.id } })}><${Icon} n="exit" />Take offline…</button>` : v && M.isActive(v) && !M.OFFLINE_POS.includes(id) ? html`<span class="note">Units are taken offline only at TL6 (end of Trim) and on the Final line.</span>` : null}
        ${id === 'TL1' ? html`<button class="btn" onClick=${() => setUI({ dialog: { type: 'scan', scanner: 'ENTRY' } })}><${Icon} n="scanin" />Scanner 1 · line-in</button>` : null}
        ${v && can('correct') ? html`<button class="btn ghost" onClick=${() => setUI({ dialog: { type: 'correct', pos: id } })}><${Icon} n="swap" />Correct position…</button>` : null}
      </div>
      <div class="micro" style=${{ marginTop: 6, color: 'var(--sim)' }}>Simulation only</div><div class="actions">
        ${c && c.fault ? html`<button class="btn sm sim" onClick=${act(() => M.clearFault(S, 'C', c.id))}>Clear ${c.kind.toLowerCase()} fault</button>` : c ? html`<button class="btn sm sim" onClick=${act(() => { M.injectCarrierFault(S, c.id); M.logEvent(S, 'sim', `SIMULATION · fault injected on ${c.id}`, { pos: posId }); })}>Inject ${c.kind.toLowerCase()} fault</button>` : null}
        ${p.fault ? html`<button class="btn sm sim" onClick=${act(() => M.clearFault(S, 'P', posId))}>Clear sensor fault</button>` : html`<button class="btn sm sim" onClick=${act(() => { M.injectSensorFault(S, posId); M.logEvent(S, 'sim', `SIMULATION · sensor fault injected at ${dispId(posId)}`, { pos: posId }); })}>Inject sensor fault</button>`}
        ${isWork ? html`<button class=${'btn sm sim' + (emerg ? ' on' : '')} onClick=${act(() => (emerg ? M.clearEmergency(S, id) : M.callEmergency(S, id)))}><${Icon} n="siren" />${emerg ? 'Clear emergency stop' : 'Test emergency stop'}</button>` : null}
        ${isWork && v && occ && occ.completeT == null ? html`<button class="btn sm sim" title="Simulate the team finishing now" onClick=${act(() => M.manualComplete(S, id))}><${Icon} n="check" />Finish work now</button>` : null}
      </div></div>
      ${isWork ? html`<div class="sec"><div class="micro">Takt</div><div class="andon-row"><span>${AREAS[P.area].name} takt <b class="mono">${fmtDur(S.cfg.takt[P.area])}</b> · close to limit at <span class="mono">${fmtDur(S.cfg.takt[P.area] * S.cfg.warnPct)}</span></span>${can('takt') ? html`<button class="btn sm ghost" onClick=${() => go('admin', 'takt')}><${Icon} n="cog" />Change takt</button>` : null}</div></div>` : null}
      <div class="sec"><div class="micro">Recent activity</div>${events.length ? html`<ul class="timeline">${events.map((e) => html`<li key=${e.id}><span class="tm">${fmtClock(e.t, false)}</span><span>${e.text}</span></li>`)}</ul>` : html`<p class="note">No events here yet this shift.</p>`}</div>
    </div></${React.Fragment}>`;
}

const VSTATE = { IN_PROCESS: ['On line', 'text', 'clock'], AWAITING_LINE_OFF: ['On line · driving off', 'text', 'arrow'], LINED_OFF: ['Completed', 'ok', 'checkc'], OFF_LINE: ['Offlined', 'warn', 'exit'], RETURN_QUEUED: ['Offlined · return queued', 'warn', 'ret'], RETURNING: ['Returning to line', 'transit', 'ret'] };
/* Vehicle record (URD req 5): where it is, its status, and its full history. */
function VehicleInspector({ id }) {
  const S = RT.S, v = S.vehicles[id]; if (!v) return null;
  const [lbl, tone, ic] = VSTATE[v.state], c = v.carrierId && S.carriers[v.carrierId], at = c && c.mode === 'POS' ? c.posId : null;
  let tl, tval;
  if (v.state === 'LINED_OFF') { tl = 'Total time in the line · line-in to completion'; tval = v.totalDur; }
  else if (v.state === 'OFF_LINE' || v.state === 'RETURN_QUEUED') { tl = `Offline for · since ${fmtClock(v.offline.t, false)}`; tval = S.t - v.offline.t; }
  else { tl = `In the line · line-in at ${fmtClock(v.entryT, false)}`; tval = S.t - v.entryT; }
  const route = M.STATIONS.map((sid) => { const cur = at === sid; const done = !!v.done[sid] || v.segments.some((s) => s.pos === sid && s.end === 'departed'); return { sid, cls: cur ? 'cur' : done ? 'done' : '' }; });
  const segs = v.segments.filter((s) => POS[s.pos].kind === 'work');
  const bs = M.buildState(S, v), items = M.buildFor(v), installed = items.filter((b) => (b.key === 'doors' ? bs.doors : bs[b.key]) >= 1).length;
  const ret = M.canReturn(S, v.id);
  const rows = segs.map((sg) => { const occ = !sg.end && S.pos[sg.pos].occ && S.pos[sg.pos].occ.vehicleId === v.id ? S.pos[sg.pos].occ : null; const cyc = occ ? M.occCycle(S, occ) : sg.cycle != null ? sg.cycle : (sg.departT || S.t) - sg.arriveT; return { ...sg, cyc, live: !!occ }; });
  return html`<${React.Fragment}>
    <div class="insp-head"><div style=${{ flex: 1, minWidth: 0 }}>
      <div class="micro">Vehicle record</div><div style=${{ marginTop: 6 }}><${VinText} vin=${v.vin} big /></div>
      <div class="sub">${v.variant.name} · ${v.variant.ptLabel} · <${PaintChip} p=${v.paint} /></div>
      <div style=${{ marginTop: 10 }}><span class=${'chip c-' + tone}><${Icon} n=${ic} />${lbl}</span></div></div>
      <button class="btn sm ghost icon" aria-label="Close inspector" onClick=${() => setUI({ selection: null })}><${Icon} n="x" /></button></div>
    <div class="insp-body">
      <div class="sec"><div class="micro">${tl}</div><div class="num" style=${{ fontSize: 44 }}>${fmtDur(tval)}</div></div>
      <dl class="kv"><dt>Where</dt><dd>${at ? html`<${PosLink} id=${at} /> <span class="c-muted">· ${AREAS[POS[at].area].name}</span>` : M.locationLabel(S, v)}</dd>
        <dt>Line-in</dt><dd class="mono">${fmtClock(v.entryT)} · Scanner 1 at TL1${v.source === 'SIM_AUTO' ? ' (sim)' : ''}</dd>
        ${v.lineOffT ? html`<dt>Completed</dt><dd class="mono">${fmtClock(v.lineOffT)} · photo-eye at FL7</dd>` : null}
        ${v.offlines.length ? html`<dt>Offline</dt><dd>${v.offlines.length}× · last at <span class="mono">${v.offline.pos}</span>, ${fmtClock(v.offline.t, false)}</dd>` : null}
        <dt>Carrier</dt><dd class="mono">${c ? `${c.kind} ${c.id}` : '—'}</dd></dl>
      <div class="sec"><div class="micro">Route</div><div class="route" aria-label="Route progress">${route.map((x, i) => html`<${React.Fragment} key=${x.sid}>${i === 6 || i === 11 ? html`<span class="g"></span>` : null}<span class=${'s ' + x.cls} title=${x.sid}></span></${React.Fragment}>`)}</div></div>
      ${v.offlines.map((o, i) => { const r = v.returns.find((x) => x.offlineT === o.t); return html`<div key=${i} class="callout warn"><div class="ttl" style=${{ color: 'var(--warn)' }}><${Icon} n="exit" />Taken offline at ${o.pos} · ${fmtClock(o.t, false)}</div><div>${o.reason}${o.notes ? ` — ${o.notes}` : ''}</div>
        <dl class="kv" style=${{ marginTop: 4 }}><dt>Station</dt><dd class="mono">${o.pos} · ${AREAS[o.area].name}</dd><dt>Cycle at station</dt><dd class="mono">${fmtDur(o.cycle || 0)}</dd><dt>Build</dt><dd class="mono">${o.built} components</dd><dt>By</dt><dd>${o.by || '—'}${o.scanned ? ' · VIN scanned' : ' · correction'}</dd>
        ${r ? html`<dt>Returned</dt><dd class="mono">${fmtClock(r.t, false)} at ${r.pos} · ${fmtDur(r.t - o.t)} offline · ${r.by}</dd>` : null}</dl>
        ${!r ? html`<div class="note">Removed from station counts; not counted towards the target unless it returns and completes.</div>` : null}</div>`; })}
      <div class="sec"><div class="micro">Actions</div><div class="actions">
        ${M.isActive(v) && at && M.OFFLINE_POS.includes(at) ? html`<button class="btn danger" disabled=${!can('offline')} onClick=${() => setUI({ dialog: { type: 'offline', vehicleId: v.id } })}><${Icon} n="exit" />Take offline…</button>` : null}
        ${M.isActive(v) && at && !M.OFFLINE_POS.includes(at) ? html`<span class="note">Offline points: TL6 and FL1–FL7.</span>` : null}
        ${v.state === 'OFF_LINE' ? html`<button class="btn primary" disabled=${!can('offline') || !ret.ok} title=${ret.ok ? `Rejoin at ${ret.pos} when it is free` : ret.reason} onClick=${() => setUI({ dialog: { type: 'return', vehicleId: v.id } })}><${Icon} n="ret" />Return to line at ${v.offline.pos}…</button>` : null}
        ${v.state === 'RETURN_QUEUED' ? html`<span class="note">Waiting for ${v.returnReq.pos} to be free. It rejoins automatically.</span>` : null}
        ${M.isActive(v) && at && can('correct') ? html`<button class="btn ghost" onClick=${() => setUI({ dialog: { type: 'correct', pos: at, vin: v.vin } })}><${Icon} n="swap" />Correct position…</button>` : null}
        ${v.state === 'LINED_OFF' ? html`<span class="note">Completed. This record is closed.</span>` : null}
      </div></div>
      ${rows.length ? html`<div class="sec"><div class="micro"><span>Time at each station</span><span>cycle vs takt</span></div><div style=${{ overflowX: 'auto' }}><table class="stimeline"><thead><tr><th>Station</th><th>Arrived</th><th>Cycle</th><th></th><th>Left</th></tr></thead><tbody>
        ${rows.map((r, i) => { const over = r.cyc > r.target, w = Math.min(1, r.cyc / (r.target * 1.5)); return html`<tr key=${i}><td>${r.pos}${r.corrected ? ' ·c' : ''}</td><td class="c-muted">${fmtClock(r.arriveT, false)}</td><td style=${{ color: over ? 'var(--crit)' : null }}>${fmtDur(r.cyc)}${r.live ? ' ●' : ''}</td><td><span class="cbar" title=${`takt ${fmtDur(r.target)}`}><i style=${{ width: `${w * 100}%`, background: over ? 'var(--crit)' : r.cyc >= r.target * S.cfg.warnPct ? 'var(--warn)' : 'var(--ok)' }}></i><b style=${{ left: `${(1 / 1.5) * 100}%` }}></b></span></td><td class="l c-muted">${r.end === 'departed' ? fmtClock(r.departT, false) : r.end === 'taken off line' ? 'offline' : r.end === 'corrected' ? 'corrected' : r.live ? 'here now' : '—'}</td></tr>`; })}</tbody></table></div></div>` : null}
      <div class="sec"><div class="micro"><span>Build</span><span>${installed} / ${items.length} components</span></div><${BuildList} v=${v} /></div>
      <div class="sec"><div class="micro">History</div><ul class="timeline">${v.history.slice(-14).reverse().map((e, i) => html`<li key=${i}><span class="tm">${fmtClock(e.t, false)}</span><span>${e.text}</span></li>`)}</ul></div>
    </div></${React.Fragment}>`;
}
function Inspector() {
  const sel = RT.ui.selection, ref = useRef(null);
  useEffect(() => { const upd = () => { RT.ui.panelWidth = ref.current && window.innerWidth > 760 ? ref.current.offsetWidth + 16 : 0; }; upd(); window.addEventListener('resize', upd); return () => { window.removeEventListener('resize', upd); RT.ui.panelWidth = 0; }; }, []);
  if (!sel) return null;
  return html`<aside class="glass inspector ticks in" ref=${ref} aria-label="Inspector">${sel.kind === 'pos' ? html`<${StationInspector} id=${sel.id} />` : html`<${VehicleInspector} id=${sel.id} />`}</aside>`;
}

/* ── anchored tags ── */
function Anchors() {
  const S = RT.S, sel = RT.ui.selection, tags = [], byPos = {};
  S.alarms.forEach((a) => { if (!M.alarmActive(a) || a.level === 'WARNING' || !POS[a.pos]) return; const sid = a.type === 'CALL' ? `${a.pos}#${a.callType}` : dispId(a.pos); if (!byPos[sid] || M.SEV[a.level] > M.SEV[byPos[sid].level]) byPos[sid] = a; });
  Object.entries(byPos).forEach(([key, a]) => {
    const sid = dispId(a.pos);
    const occ = S.pos[a.pos].occ, v = occ && occ.vehicleId && S.vehicles[occ.vehicleId];
    let txt;
    if (a.type === 'DELAY') txt = html`<span class="mono k">${sid}</span><span>${a.level === 'ESCALATED' ? 'ESCALATED' : 'OVERDUE'}</span><span class="mono">+${fmtDur(occ && v ? occ.workT - M.targetFor(a.pos, v) : 0)}</span>`;
    else if (a.type === 'FAULT') txt = html`<span class="mono k">${sid}</span><span>${a.msg.split(' · ')[0]}</span>`;
    else if (a.type === 'QUALITY') txt = html`<span class="mono k">${sid}</span><span>QUALITY HOLD · E/T mismatch</span>`;
    else if (a.type === 'CALL') { const c = S.calls.find((x) => x.id === a.callId); txt = html`<span class="mono k">${sid}</span><span>${a.callType === 'SUP' ? 'SUPERVISOR' : 'MAINTENANCE'}</span><span class="mono">${c ? fmtDur(S.t - c.raisedT) : ''}</span>`; }
    else if (a.type === 'EMERGENCY') txt = html`<span class="mono k">${sid}</span><span>EMERGENCY · LINE STOPPED</span>`;
    else txt = html`<span class="mono k">${sid}</span><span>waiting${a.root ? html` · held by <span class="mono k">${dispId(a.root)}</span>` : ''}</span>`;
    const cls = a.level === 'ESCALATED' || a.level === 'EMERGENCY' ? 't-esc' : a.level === 'BLOCKED' ? 't-hold' : a.level === 'CALL_SUP' ? 't-sup' : a.level === 'CALL_MNT' ? 't-mnt' : 't-crit';
    tags.push(html`<div key=${'a' + key} class="anchor" data-anchor=${'pos:' + sid} style=${a.type === 'CALL' ? { marginTop: a.callType === 'SUP' ? -30 : -60 } : null}><div class=${'tag ' + cls} role="button" tabIndex="0" onClick=${() => select({ kind: 'pos', id: sid })} onKeyDown=${(e) => e.key === 'Enter' && select({ kind: 'pos', id: sid })}><${Icon} n=${LEVEL_ICON[a.level]} />${txt}</div></div>`);
  });
  if (sel && sel.kind === 'pos' && !byPos[sel.id]) tags.push(html`<div key="sel" class="anchor" data-anchor=${'pos:' + sel.id}><div class="tag"><span class="mono k">${sel.id}</span></div></div>`);
  if (sel && sel.kind === 'veh' && S.vehicles[sel.id]) tags.push(html`<div key="selv" class="anchor" data-anchor=${'veh:' + sel.id}><div class="tag"><span class="mono k">${S.vehicles[sel.id].vin.slice(-6)}</span></div></div>`);
  return html`<div class="anchors">${tags}</div>`;
}
function HoverCard() {
  const hv = RT.ui.hover; if (!hv) return null;
  const S = RT.S; let body = null;
  if (hv.kind === 'pos') {
    const P = POS[hv.id], st = M.stationStatus(S, hv.id), sv = M.stationVehicle(S, hv.id), occ = sv && S.pos[sv.posId].occ;
    body = html`<div style=${{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}><span class="mono" style=${{ fontSize: 16, fontWeight: 600 }}>${hv.id}</span><${StatusChip} st=${st} /></div>
      <dl>${sv ? html`<dt>VIN</dt><dd class="mono">${shortVin(sv.v.vin)}</dd>` : html`<dt>Vehicle</dt><dd>none</dd>`}
      ${sv && P.kind === 'work' && occ && sv.posId === hv.id ? html`<dt>Cycle / takt</dt><dd class="mono">${fmtDur(M.occCycle(S, occ))} / ${fmtDur(M.targetFor(hv.id, sv.v))}</dd>` : null}
      ${M.callsAt(S, hv.id).map((c) => html`<dt key=${c.id}>${M.CALL_TYPES[c.type].label}</dt><dd class="mono">${fmtDur(S.t - c.raisedT)}${c.respondedT != null ? ' · responded' : ''}</dd>`)}
      ${occ && occ.completeT != null && occ.waitT > 0 ? html`<dt>Waiting</dt><dd class="mono">${fmtDur(occ.waitT)}</dd>` : null}<dt>Team</dt><dd>${P.team}</dd></dl>`;
  } else if (hv.kind === 'veh') {
    const v = S.vehicles[hv.id]; if (!v) return null;
    body = html`<div style=${{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><span class="mono" style=${{ fontSize: 16, fontWeight: 600 }}>${v.vin.slice(-6)}</span><span class="c-muted" style=${{ fontSize: 12 }}>${v.variant.name}</span></div>
      <dl><dt>Location</dt><dd>${M.locationLabel(S, v)}</dd><dt>Assembly</dt><dd class="mono">${fmtDur((v.lineOffT || S.t) - v.entryT)}</dd><dt>Carrier</dt><dd class="mono">${v.carrierId || '—'}</dd></dl>`;
  } else if (hv.kind === 'scanner') { const SC = { ENTRY: ['Scanner 1 · line-in at TL1', 'Every body is scanned here. Click to scan.'], OFFLINE: ['Offline scanner · TL6, end of Trim', 'Scans a unit taken offline at the end of Trim.'], HH1: ['Handheld offline scanner · Final (FL1–FL3)', 'Wireless; docked at FL2. Scans a unit taken offline on the Final line.'], HH2: ['Handheld offline scanner · Final (FL4–FL7)', 'Wireless; docked at FL5. Scans a unit taken offline on the Final line.'], EOL: ['End-of-line photo-eye · FL7', 'Detects the car driving off the line. No scan: the VIN comes from tracking.'] }[hv.id] || [hv.id, ''];
    body = html`<div class="mono" style=${{ fontWeight: 600 }}>${SC[0]}</div><p class="note" style=${{ marginTop: 6 }}>${SC[1]}</p>`; }
  return html`<div class="glass hovercard ticks" id="hovercard" style=${{ transform: `translate(${Math.min(hv.x + 16, window.innerWidth - 310)}px, ${hv.y + 16}px)` }}>${body}</div>`;
}
function Legend() {
  const row = (sw, txt) => html`<div class="row"><span class="sw" style=${{ background: sw }}></span><span>${txt}</span></div>`;
  return html`<div class="glass legend-pop ticks" role="dialog" aria-label="Key">
    <div class="micro">Reading the floor</div>
    ${row('var(--andon-ok)', 'Normal · cycle time inside takt (stack light green)')}
    ${row('var(--warn)', 'Close to limit · past ' + Math.round(RT.S.cfg.warnPct * 100) + '% of takt')}${row('var(--crit)', 'Over takt · buzzer rings until the unit leaves')}
    ${row('var(--call-sup)', 'Supervisor call · violet lamp, blinks until someone responds')}${row('var(--call-mnt)', 'Maintenance call · blue lamp, blinks until someone responds')}
    ${row('var(--hold)', 'Work complete, waiting for transfer')}
    ${row('repeating-linear-gradient(90deg, var(--warn) 0 6px, transparent 6px 10px)', 'Chevrons point from waiting bodies to the position holding them')}
    ${row('var(--transit)', 'Bright parts on a car are being installed right now')}
    <p class="note">X-ray (X) makes the body glass so interior and underbody parts are visible. Every state also shows as text with an icon.</p>
    <p class="note">Keys: <b>0</b> shop · <b>1/2/3</b> lines · <b>/</b> find VIN · <b>A</b> alarm · <b>X</b> x-ray · <b>Space</b> pause · <b>Esc</b> close.</p>
    <button class="btn sm" onClick=${() => { setUI({ legend: false }); go('how'); }}><${Icon} n="book" />How it works · URD coverage</button>
  </div>`;
}

/* ── dialogs ── */
/* Scanner 1 at TL1: line-in (URD req 1). The only routine scan on the line. */
function ScanDialog({ d }) {
  const S = RT.S;
  const [vin, setVin] = useState(d.vin || ''), [res, setRes] = useState(null), [scanning, setScanning] = useState(false), inp = useRef(null);
  useEffect(() => { inp.current && inp.current.focus(); }, []);
  const head = M.bufferHead(S), headBody = head >= 0 ? S.bodyBuffer[head] : null;
  const doScan = () => { setScanning(true); setRes(null); setTimeout(() => { const r = M.entryScan(S, vin.trim().toUpperCase(), 'MANUAL'); setRes(r); setScanning(false); bump(); }, 650); };
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
function OffLineDialog({ d }) {
  const S = RT.S, v = S.vehicles[d.vehicleId];
  const chk = v ? M.canTakeOffLine(S, v.id) : { ok: false }, at = chk.ok ? chk.posId : null;
  const occ = at && S.pos[at].occ, an = at ? M.andonState(S, at) : null;
  const [reason, setReason] = useState(d.reason || (an && an.state === 'over' ? M.OFFLINE_REASONS[0] : M.OFFLINE_REASONS[1])), [notes, setNotes] = useState(''), [scan, setScan] = useState(''), [scanning, setScanning] = useState(false), [ok, setOk] = useState(false), [err, setErr] = useState(null);
  if (!v) return null;
  const scanner = at === 'TL6' ? 'Offline scanner at TL6 (end of Trim)' : at && ['FL1', 'FL2', 'FL3'].includes(at) ? 'Handheld scanner 1 (FL1–FL3)' : 'Handheld scanner 2 (FL4–FL7)';
  const doScan = () => { setScanning(true); setTimeout(() => { setScan(v.vin); setScanning(false); }, 550); };
  const submit = () => { const r = M.takeOffLine(S, v.id, { reason, notes, by: userName(), scan }); if (!r.ok) { setErr(r.reason); bump(); return; } setUI({ dialog: null, selection: { kind: 'veh', id: v.id } }); };
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
function ReturnDialog({ d }) {
  const S = RT.S, v = S.vehicles[d.vehicleId], [note, setNote] = useState(''), [err, setErr] = useState(null);
  if (!v || !v.offline) return null;
  const pos = v.offline.pos, slot = M.stationCount(S, pos);
  const submit = () => { const r = M.returnToLine(S, v.id, userName(), note); if (!r.ok) { setErr(r.reason); return; } bump(); setUI({ dialog: null, selection: { kind: 'veh', id: v.id } }); };
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
function CorrectDialog({ d }) {
  const S = RT.S, here = S.pos[d.pos] && S.pos[d.pos].occ, cur = here && here.vehicleId && S.vehicles[here.vehicleId];
  const [mode, setMode] = useState('move'), [vin, setVin] = useState(d.vin || (cur ? cur.vin : '')), [to, setTo] = useState(''), [reason, setReason] = useState(''), [res, setRes] = useState(null);
  const active = S.vehOrder.map((id) => S.vehicles[id]).filter((v) => M.isActive(v) && v.carrierId && S.carriers[v.carrierId].mode === 'POS');
  const targets = WORK_POS.filter((id) => S.pos[id].carrierId && id !== (cur && cur.posId));
  const submit = () => { const r = mode === 'move' ? M.correctPosition(S, vin, to, userName(), reason) : M.clearGhost(S, d.pos, userName(), reason); setRes(r); bump(); if (r.ok) setTimeout(() => setUI({ dialog: null }), 900); };
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
function VinSearchDialog() {
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
function AboutDialog() {
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

/* ── alarm drawer ── */
function AlarmDrawer() {
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
      ${tab === 'active' && un.some((a) => a.level !== 'WARNING') ? html`<button class="btn sm warn" onClick=${act(() => un.filter((a) => a.level !== 'WARNING').forEach((a) => M.ackAlarm(S, a.id)))}><${Icon} n="check" />Acknowledge all</button>` : null}
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
        ${a.resolvedT == null ? html`<div class="actions">${a.ackT == null && a.level !== 'WARNING' ? html`<button class="btn sm warn" onClick=${(e) => { e.stopPropagation(); M.ackAlarm(S, a.id); bump(); }}><${Icon} n="check" />Acknowledge</button>` : null}<button class="btn sm ghost" onClick=${(e) => { e.stopPropagation(); openAlarm(a); }}><${Icon} n="target" />Locate</button></div>` : null}
      </div>`) : html`<div class="empty">${tab === 'active' ? 'No unacknowledged alarms. The line is running without exceptions.' : tab === 'acked' ? 'No acknowledged alarms are still open.' : 'Nothing resolved yet this shift.'}</div>`}</div>`
    : html`<div style=${{ display: 'flex', gap: 4, padding: '10px 12px 0', flexWrap: 'wrap' }}>${filters.map(([k, l]) => html`<button key=${k} class=${'btn sm ' + (RT.ui.logFilter === k ? '' : 'ghost')} onClick=${() => setUI({ logFilter: k })}>${l}</button>`)}</div>
      <div class="alist"><ul class="elog">${evs.map((e) => html`<li key=${e.id}><span class="mono c-muted">${fmtClock(e.t)}</span><span class=${'cat ' + e.cat}>${e.cat}</span><span>${e.pos ? html`<button class="linkish" onClick=${() => { setUI({ drawer: null }); select({ kind: 'pos', id: dispId(e.pos) }); }}>${dispId(e.pos)}</button> ` : null}${e.text}</span></li>`)}</ul></div>`}
  </aside>`;
}

/* ── 2D plan ── */
function Plan2D({ fallback }) {
  const S = RT.S, sel = RT.ui.selection;
  const X = (x) => (x + 66) * 6.4, Z = (z) => (z + 30) * 6.4;
  const toneHex = { muted: 'var(--muted)', text: 'var(--text)', ok: 'var(--ok)', warn: 'var(--warn)', crit: 'var(--crit)', esc: 'var(--esc)', hold: 'var(--hold)', transit: 'var(--transit)', paused: 'var(--paused)' };
  const carPos = (v) => {
    const c = v.carrierId && S.carriers[v.carrierId];
    const an = S.anims.find((a) => a.vehicleId === v.id); if (an) { const p = an.path.at(M.clamp((S.t + RT.acc - an.t0) / (an.t1 - an.t0), 0, 1)); return [p.x, p.z]; }
    if (c && c.mode === 'POS') return [POS[c.posId].x, POS[c.posId].z];
    if (c && c.mode === 'TRANSIT') { const tr = c.transit, p = M.EDGES[tr.edge].at(M.clamp((S.t + RT.acc - tr.t0) / (tr.t1 - tr.t0), 0, 1)); return [p.x, p.z]; }
    if (v.state === 'OFF_LINE') return S.offlineBay.slice(-4).includes(v.id) ? M.OFFLINE_SLOTS[(v.offlineSlot || 0) % 4] : null;
    return null;
  };
  const rails = Object.values(M.EDGES);
  return html`<div style=${{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'var(--bg)', zIndex: 4, padding: '120px 16px 120px' }}>
    ${fallback ? html`<div class="glass fallback-note ticks">3D view unavailable (WebGL not supported). This plan shows the same live state.</div>` : null}
    <svg class="plan" viewBox="0 0 960 360" style=${{ width: 'min(100%, 1600px)', height: 'auto', maxHeight: '100%' }} role="img" aria-label="Top-down plan of the General Assembly shop">
      ${[[-56, 4.2, 0.6, 18.6], [-5, -26, 19, 1.4], [13.6, 4.6, 64.5, 18.8]].map(([x0, z0, x1, z1], i) => html`<rect key=${'z' + i} x=${X(x0)} y=${Z(z0)} width=${X(x1) - X(x0)} height=${Z(z1) - Z(z0)} rx="0" fill="var(--fill)" stroke="var(--hair-2)" stroke-dasharray="6 4" />`)}
      ${rails.map((p, i) => html`<polyline key=${'r' + i} points=${p.pts.map(([x, z]) => `${X(x)},${Z(z)}`).join(' ')} fill="none" stroke="var(--hair-2)" stroke-width="3" />`)}
      ${STATIONS.map((id) => { const P = POS[id], st = M.stationStatus(S, id), rot = P.yaw !== 0, w = (rot ? 4.6 : 6.2) * 6.4, d = (rot ? 6.2 : 4.6) * 6.4, isSel = sel && sel.kind === 'pos' && sel.id === id; const sv = M.stationVehicle(S, id), occ = sv && S.pos[sv.posId].occ; const r = sv && P.kind === 'work' && occ ? Math.min(1, occ.workT / M.targetFor(id, sv.v)) : 0;
        return html`<g key=${id} style=${{ cursor: 'pointer' }} onClick=${() => select({ kind: 'pos', id }, false)}>
          <rect x=${X(P.x) - w / 2} y=${Z(P.z) - d / 2} width=${w} height=${d} rx="0" fill=${st.tone === 'muted' || st.tone === 'text' ? 'transparent' : `color-mix(in srgb, ${toneHex[st.tone]} 18%, transparent)`} stroke=${isSel ? 'var(--text)' : st.tone === 'muted' || st.tone === 'text' ? 'var(--hair-2)' : toneHex[st.tone]} stroke-width=${isSel ? 2 : 1} />
          ${P.kind === 'work' ? html`<rect x=${X(P.x) - w / 2 + 3} y=${Z(P.z) + d / 2 - 5} width=${(w - 6) * r} height="2.5" fill=${st.tone === 'muted' || st.tone === 'text' ? 'var(--text)' : toneHex[st.tone]} />` : null}
          <text x=${X(P.x) - w / 2} y=${Z(P.z) + d / 2 + 11} font-size="9" fill="var(--text-2)">${id}</text></g>`; })}
      ${S.vehOrder.map((vid) => { const v = S.vehicles[vid], p = carPos(v); if (!p || v.state === 'LINED_OFF') return null; return html`<rect key=${vid} x=${X(p[0]) - 13} y=${Z(p[1]) - 6} width="26" height="12" rx="0" fill=${v.paint.hex} stroke=${sel && sel.kind === 'veh' && sel.id === vid ? 'var(--text)' : 'var(--bg)'} stroke-width="1.5" style=${{ cursor: 'pointer' }} onClick=${() => select({ kind: 'veh', id: vid }, false)}><title>${v.vin}</title></rect>`; })}
      ${S.bodyBuffer.map((b, i) => b ? html`<rect key=${'b' + i} x=${X(M.BODY_BUFFER[i][0]) - 13} y=${Z(M.BODY_BUFFER[i][1]) - 6} width="26" height="12" rx="0" fill=${b.paint.hex} opacity=".6" />` : null)}
      <text x=${X(-56)} y=${Z(21.5)} font-size="11" fill="var(--muted)" letter-spacing="2">TRIM LINE</text><text x=${X(-5)} y=${Z(-27.2)} font-size="11" fill="var(--muted)" letter-spacing="2">CHASSIS LINE</text><text x=${X(13.6)} y=${Z(21.5)} font-size="11" fill="var(--muted)" letter-spacing="2">FINAL LINE</text>
    </svg></div>`;
}

/* ── shift report ── */
function useTip() { const [tip, setTip] = useState(null); return [tip ? html`<div class="charttip" style=${{ left: tip.x + 14, top: tip.y + 10 }}>${tip.body}</div>` : null, (e, body) => setTip({ x: e.clientX, y: e.clientY, body }), () => setTip(null)]; }
function Report() {
  const S = RT.S, C = S.cfg, [tipNode, showTip, hideTip] = useTip(), [table, setTable] = useState(false);
  const done = S.stats.completed.filter((c) => c.t >= C.shiftStart), removed = S.stats.offline.filter((c) => c.t >= C.shiftStart), segs = S.stats.segments.filter((s) => s.t >= C.shiftStart && !s.credited);
  const W = 640, H = 220, pl = 34, pr = 16, pt = 14, pb = 26, t0 = C.shiftStart, t1 = C.shiftEnd, yMax = Math.max(C.shiftTarget, done.length) + 2;
  const sx = (t) => pl + ((t - t0) / (t1 - t0)) * (W - pl - pr), sy = (n) => H - pb - (n / yMax) * (H - pt - pb);
  let path = `M${sx(t0)},${sy(0)}`; done.forEach((c, i) => { path += ` H${sx(c.t)} V${sy(i + 1)}`; }); path += ` H${sx(Math.min(S.t, t1))}`;
  const onPace = (e) => { const r = e.currentTarget.getBoundingClientRect(), t = t0 + ((e.clientX - r.left) / r.width * W - pl) / (W - pl - pr) * (t1 - t0); if (t < t0 || t > Math.min(S.t, t1)) return hideTip(); showTip(e, html`<div class="mono">${fmtClock(t, false)}</div><div>Completed <b>${done.filter((c) => c.t <= t).length}</b> · plan ${(C.shiftTarget * (t - t0) / (t1 - t0)).toFixed(1)}</div>`); };
  const st = WORK_POS.map((id) => { const l = segs.filter((s) => s.pos === id), n = l.length || 1; return { id, n: l.length, work: l.reduce((a, s) => a + s.work, 0) / n, wait: l.reduce((a, s) => a + s.wait, 0) / n, target: POS[id].target, overdue: S.stats.overdue[id] || 0, block: (S.stats.block[id] || 0) / 60 }; });
  const maxT = Math.max(...st.map((s) => Math.max(s.work + s.wait, s.target))) * 1.05 || 1, rowH = 20, bl = 50, br = 56, BW = 640, bx = (v) => bl + (v / maxT) * (BW - bl - br);
  const maxBlock = Math.max(1, ...st.map((s) => s.block)), maxOd = Math.max(1, ...st.map((s) => s.overdue));
  const avgTotal = done.length ? done.reduce((a, c) => a + c.dur, 0) / done.length : 0, p = M.pace(S);
  const hbars = (k, max, fmt, label) => html`<svg viewBox=${`0 0 640 ${st.length * rowH + 6}`} role="img" aria-label=${label}>${st.map((s, i) => { const w = (s[k] / max) * (640 - bl - br), y = 3 + i * rowH; return html`<g key=${s.id} onMouseMove=${(e) => showTip(e, html`<b class="mono">${s.id}</b> · ${fmt(s[k])}`)} onMouseLeave=${hideTip}><rect x="0" y=${y} width="640" height=${rowH} fill="transparent" /><text x=${bl - 8} y=${y + 14} font-size="11" text-anchor="end" fill="var(--text-2)" class="mono">${s.id}</text>${s[k] > 0 ? html`<rect x=${bl} y=${y + 5} width=${Math.max(2, w)} height="10" rx="0" fill="var(--chart-a)" /><text x=${bl + Math.max(2, w) + 6} y=${y + 14} font-size="11" fill="var(--text-2)" class="mono">${fmt(s[k])}</text>` : html`<line x1=${bl} x2=${bl} y1=${y + 5} y2=${y + 15} stroke="var(--hair-2)" />`}</g>`; })}</svg>`;
  return html`<div class="glass report ticks in" role="dialog" aria-label="Shift report"><div class="rep-scroll">
    <div class="rep-head"><div style=${{ flex: 1 }}><div class="micro">Shift report · ${C.shiftName} · 06:00 → ${fmtClock(S.t, false)}</div><h2>${p.done} vehicles off the line, ${p.delta >= 0 ? `${p.delta} ahead of` : `${-p.delta} behind`} plan</h2></div><span class="sim-tag">SIMULATED DATA</span><button class="btn" onClick=${() => setUI({ report: false })}><${Icon} n="x" />Back to the floor</button></div>
    <div class="rep-grid">
      <section class="panel ticks span-6"><h3>Completed vs plan</h3><div class="q">Cumulative line-offs at Scanner 3 against a linear plan of ${C.shiftTarget}.</div>
        <svg viewBox=${`0 0 ${W} ${H}`} role="img" aria-label="Cumulative completed vs plan" onMouseMove=${onPace} onMouseLeave=${hideTip}>
          ${[0, 8, 16, 24, 32].filter((n) => n <= yMax).map((n) => html`<g key=${n}><line x1=${pl} x2=${W - pr} y1=${sy(n)} y2=${sy(n)} stroke="var(--hair)" /><text x=${pl - 6} y=${sy(n) + 4} font-size="10" text-anchor="end" fill="var(--muted)" class="mono">${n}</text></g>`)}
          ${[6, 8, 10, 12, 14].map((hh) => html`<text key=${hh} x=${sx(hh * 3600)} y=${H - 6} font-size="10" text-anchor="middle" fill="var(--muted)" class="mono">${pad(hh)}:00</text>`)}
          <line x1=${sx(t0)} y1=${sy(0)} x2=${sx(t1)} y2=${sy(C.shiftTarget)} stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="5 4" /><text x=${sx(t1) - 4} y=${sy(C.shiftTarget) - 6} font-size="11" text-anchor="end" fill="var(--muted)">Plan ${C.shiftTarget}</text>
          <path d=${path} fill="none" stroke="var(--chart-a)" stroke-width="2" /><circle cx=${sx(Math.min(S.t, t1))} cy=${sy(done.length)} r="4" fill="var(--chart-a)" stroke="var(--bg)" stroke-width="2" /><text x=${sx(Math.min(S.t, t1)) + 8} y=${sy(done.length) + 4} font-size="11" fill="var(--text)">Actual ${done.length}</text>
        </svg></section>
      <section class="panel ticks span-3" style=${{ display: 'grid', gap: 16, alignContent: 'start' }}><div><h3>Line-off vs taken off line</h3><div class="q">Units taken off the line are recorded, never counted as completed.</div></div>
        <div style=${{ display: 'flex', gap: 28, flexWrap: 'wrap' }}><div><div class="micro">Lined off</div><div class="big">${done.length}</div><div class="note">avg ${fmtDur(avgTotal)}</div></div><div><div class="micro">Taken off</div><div class="big" style=${{ color: 'var(--warn)' }}>${removed.length}</div></div><div><div class="micro">Assistance calls</div><div class="big">${S.stats.assist}</div></div><div><div class="micro">Emergencies</div><div class="big" style=${{ color: S.stats.emergency ? 'var(--esc)' : null }}>${S.stats.emergency}</div></div><div><div class="micro">E/T holds</div><div class="big">${S.stats.quality}</div></div></div>
        ${removed.length ? html`<table class="data"><thead><tr><th>VIN</th><th>From</th><th>Reason</th><th>Built</th><th>Time</th></tr></thead><tbody>${removed.map((r) => html`<tr key=${r.vin}><td class="mono">${shortVin(r.vin)}</td><td class="mono">${r.pos}</td><td style=${{ whiteSpace: 'normal', textAlign: 'left' }}>${r.reason}</td><td class="mono">${r.built}</td><td class="mono">${fmtClock(r.t, false)}</td></tr>`)}</tbody></table>` : html`<p class="note">No units taken off the line this shift.</p>`}</section>
      <section class="panel ticks span-3"><h3>Model mix</h3><div class="q">Units lined off this shift, by model and variant.</div>
        ${(() => { const m = {}; done.forEach((c) => { const k = c.name || c.variant; m[k] = (m[k] || 0) + 1; }); const rows = M.VARIANTS.map((v) => [v.name, v.model, m[v.name] || 0]); const mx = Math.max(1, ...rows.map((r) => r[2]));
          const hs = rows.filter((r) => r[1] === 'HS').reduce((a, r) => a + r[2], 0), zs = rows.filter((r) => r[1] === 'ZS').reduce((a, r) => a + r[2], 0);
          return html`<div class="mix-tot"><div><span class="micro">MG HS</span><span class="big">${hs}</span></div><div><span class="micro">MG ZS</span><span class="big">${zs}</span></div></div>
          <ul class="mix">${rows.map(([n, , k]) => html`<li key=${n}><span>${n.replace('MG ', '')}</span><span class="mbar"><i style=${{ width: `${(k / mx) * 100}%` }}></i></span><span class="mono">${k}</span></li>`)}</ul>`; })()}
        <p class="note">Mix shares in the simulation are assumed.</p></section>
      <section class="panel ticks span-7"><div style=${{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><div><h3>Average work time vs target</h3><div class="q">Team processing time only; waiting and transfer excluded.</div></div><button class="btn sm ghost" onClick=${() => setTable(!table)}>${table ? 'Chart' : 'Table'}</button></div>
        ${table ? html`<div style=${{ overflowX: 'auto', marginTop: 10 }}><table class="data"><thead><tr><th>Position</th><th>Cycles</th><th>Avg work</th><th>Target</th><th>Avg waiting</th><th>Overdue</th></tr></thead><tbody>${st.map((s) => html`<tr key=${s.id}><td class="mono">${s.id}</td><td>${s.n}</td><td class="mono">${fmtDur(s.work)}</td><td class="mono">${fmtDur(s.target)}</td><td class="mono">${fmtDur(s.wait)}</td><td>${s.overdue}</td></tr>`)}</tbody></table></div>`
        : html`<svg viewBox=${`0 0 ${BW} ${st.length * rowH + 26}`} role="img" aria-label="Average work time per position with target">${st.map((s, i) => { const y = 3 + i * rowH, over = s.work > s.target; return html`<g key=${s.id} onMouseMove=${(e) => showTip(e, html`<b class="mono">${s.id}</b> · avg ${fmtDur(s.work)} vs ${fmtDur(s.target)} · ${s.n} cycles`)} onMouseLeave=${hideTip}><rect x="0" y=${y} width=${BW} height=${rowH} fill="transparent" /><text x=${bl - 8} y=${y + 14} font-size="11" text-anchor="end" fill="var(--text-2)" class="mono">${s.id}</text><rect x=${bl} y=${y + 5} width=${Math.max(2, bx(s.work) - bl)} height="10" rx="0" fill="var(--chart-a)" /><line x1=${bx(s.target)} x2=${bx(s.target)} y1=${y + 2} y2=${y + 18} stroke="var(--text)" stroke-width="2" /><text x=${Math.max(bx(s.work), bx(s.target)) + 6} y=${y + 14} font-size="11" fill=${over ? 'var(--crit)' : 'var(--text-2)'} class="mono">${fmtDur(s.work)}</text></g>`; })}
          <g transform=${`translate(${bl}, ${st.length * rowH + 18})`}><rect width="10" height="10" rx="0" fill="var(--chart-a)" y="-9" /><text x="16" font-size="11" fill="var(--text-2)">Avg work time</text><line x1="120" x2="120" y1="-10" y2="2" stroke="var(--text)" stroke-width="2" /><text x="128" font-size="11" fill="var(--text-2)">Target</text></g></svg>`}</section>
      <section class="panel ticks span-5"><h3>Work vs waiting</h3><div class="q">Average per cycle. Waiting is time complete but not yet transferred.</div>
        <svg viewBox=${`0 0 640 ${st.length * rowH + 6}`} role="img" aria-label="Average work and waiting time per position">${st.map((s, i) => { const y = 3 + i * rowH, ww = bx(s.work) - bl, wt = (s.wait / maxT) * (BW - bl - br); return html`<g key=${s.id} onMouseMove=${(e) => showTip(e, html`<b class="mono">${s.id}</b> · work ${fmtDur(s.work)} · waiting ${fmtDur(s.wait)}`)} onMouseLeave=${hideTip}><rect x="0" y=${y} width="640" height=${rowH} fill="transparent" /><text x=${bl - 8} y=${y + 14} font-size="11" text-anchor="end" fill="var(--text-2)" class="mono">${s.id}</text><rect x=${bl} y=${y + 5} width=${Math.max(2, ww)} height="10" rx="0" fill="var(--chart-a)" />${wt > 1 ? html`<rect x=${bl + ww + 2} y=${y + 5} width=${wt} height="10" rx="0" fill="var(--chart-b)" />` : null}<text x=${bl + ww + wt + 8} y=${y + 14} font-size="11" fill="var(--text-2)" class="mono">${fmtDur(s.wait)}</text></g>`; })}</svg>
        <div class="legend"><span><i style=${{ background: 'var(--chart-a)' }}></i>Work</span><span><i style=${{ background: 'var(--chart-b)' }}></i>Waiting (value shown)</span></div></section>
      <section class="panel ticks span-6"><h3>Bottleneck impact</h3><div class="q">Minutes other finished bodies spent blocked because of this position.</div>${hbars('block', maxBlock, (v) => `${v.toFixed(1)} min`, 'Blocking minutes caused per position')}</section>
      <section class="panel ticks span-6"><h3>Delay frequency</h3><div class="q">Times the team exceeded its target this shift.</div>${hbars('overdue', maxOd, (v) => `${v}×`, 'Overdue count per position')}</section>
    </div>
    <p class="note" style=${{ marginTop: 14 }}>All figures come from this session's simulation records. Plan assumes a linear rate over 06:00–14:30.</p>${tipNode}</div>
  </div>`;
}
const pad = (n) => String(n).padStart(2, '0');
const PaintChip = ({ p }) => html`<span class="paint"><i style=${{ background: p.hex }}></i>${p.name}</span>`;

/* Line-off moment: a short card when a unit passes the end-of-line photo-eye at FL7. */
function LineOffCard() {
  const lo = RT.ui.lineoff; if (!lo) return null;
  const c = lo.rec;
  return html`<div class="glass lineoff ticks" role="status" aria-live="polite">
    <div class="lo-mark"><${MgMark} /></div>
    <div><div class="micro lo-k">Completed · photo-eye · FL7${c.returned ? ' · returned unit' : ''}</div><div class="lo-name">${c.name}</div>
      <div class="lo-meta"><${PaintChip} p=${M.PAINTS.find((x) => x.name === c.paint) || { name: c.paint, hex: '#888' }} /><span class="mono">${c.vin}</span></div></div>
    <div class="lo-stat"><span class="micro">Build time</span><span class="num">${fmtDur(c.dur)}</span></div>
    <div class="lo-stat"><span class="micro">This shift</span><span class="num">${c.n}<small> / ${RT.S.shift && RT.S.shift.targets ? RT.S.shift.targets.FINAL : '—'}</small></span></div>
  </div>`;
}

