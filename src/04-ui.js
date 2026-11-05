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
const LEVEL_TONE = { WARNING: 'warn', OVERDUE: 'crit', ESCALATED: 'esc', FAULT: 'crit', HOLD: 'crit', BLOCKED: 'hold', ASSIST: 'warn', EMERGENCY: 'esc' };
const LEVEL_ICON = { WARNING: 'hour', OVERDUE: 'alert', ESCALATED: 'alert', FAULT: 'fault', HOLD: 'fault', BLOCKED: 'pause', ASSIST: 'hand', EMERGENCY: 'siren' };
const LEVEL_LABEL = { HOLD: 'Quality hold', ASSIST: 'Assistance', EMERGENCY: 'Emergency' };
const tv = (t) => `var(--${t})`;
const StatusChip = ({ st }) => html`<span class=${'chip c-' + st.tone}><${Icon} n=${STATUS_ICON[st.code] || 'info'} />${st.label}</span>`;
const LevelChip = ({ a }) => html`<span class=${'chip c-' + LEVEL_TONE[a.level]}><${Icon} n=${LEVEL_ICON[a.level]} />${LEVEL_LABEL[a.level] || a.level}</span>`;
const VinText = ({ vin, big }) => vin ? html`<span class="mono" style=${{ fontSize: big ? 19 : undefined, fontWeight: 500 }}><span style=${{ color: 'var(--muted)' }}>${vin.slice(0, 11)}</span>${vin.slice(11)}</span>` : '—';
// Official MG logo (supplied by the plant), embedded unchanged and used in both themes.
const MG_LOGO = 'data:image/png;base64,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';
// Bolt & Volt (designer/builder). Full logo has white type, so it is used on dark only;
// light theme uses the hexagon icon with the name set in text (plant's choice, option b).
const MgMark = () => html`<img class="mg-mark" src=${MG_LOGO} alt="MG" width="30" height="30" />`;

/* ── simulated alarm horn ── */
const Horn = {
  ctx: null, last: 0,
  ensure() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; } } if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  chirp(hi) { if (!this.ctx) return; const t = this.ctx.currentTime; [0, 0.22].forEach((o, i) => { const osc = this.ctx.createOscillator(), g = this.ctx.createGain(); osc.type = 'square'; osc.frequency.value = hi ? (i ? 1180 : 1480) : (i ? 660 : 880); g.gain.setValueAtTime(0.0001, t + o); g.gain.exponentialRampToValueAtTime(0.045, t + o + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + o + 0.18); osc.connect(g).connect(this.ctx.destination); osc.start(t + o); osc.stop(t + o + 0.2); }); },
  tick(now) { if (RT.ui.muted || !this.ctx) return; const un = RT.S.alarms.filter((a) => M.alarmUnacked(a) && M.SEV[a.level] >= 3); if (!un.length) return; const esc = un.some((a) => a.level === 'ESCALATED'); if (now - this.last > (esc ? 1300 : 2400)) { this.last = now; this.chirp(esc); } },
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
  { n: 1, title: 'Normal production', desc: 'Every station runs to its 10:00 target. After about 2½ minutes of watching, a problem arises on its own at CL2 and you can follow it spread.', setup(S) { calmDown(S); return { view: 'overview', speed: 15, demo: true }; } },
  { n: 2, title: 'Trim bottleneck at TL4', desc: 'Headliner and glazing at TL4 run past target. Finished bodies at TL3 and TL2 wait behind it.',
    setup(S) { calmDown(S); waitFresh(S, ['TL4'], 240); const o = occOf(S, 'TL4'); const v = S.vehicles[o.vehicleId]; o.workT = M.targetFor('TL4', v) - 100; o.required = M.targetFor('TL4', v) + 7 * 60; ['TL3', 'TL2'].forEach((id, i) => { const p = occOf(S, id); if (p && p.vehicleId && p.completeT == null) p.required = Math.min(p.required, p.workT + 60 + i * 150); }); M.logEvent(S, 'sim', 'SIMULATION · scenario 2: TL4 work content increased', { pos: 'TL4' }); return { select: { kind: 'pos', id: 'TL4' }, speed: 5 }; } },
  { n: 3, title: 'Completed but blocked', desc: 'CL1 presses Work done, but CL2 still holds its hanger. Work done is not the same as movement permitted.',
    setup(S) { calmDown(S); waitFresh(S, ['CL1', 'CL2'], 400); const a = occOf(S, 'CL1'), b = occOf(S, 'CL2'); a.workT = Math.max(a.workT, 7 * 60); a.required = a.workT + 6; b.workT = 4 * 60; b.required = Math.round(M.targetFor('CL2', S.vehicles[b.vehicleId]) * 0.95); return { select: { kind: 'pos', id: 'CL1' }, speed: 5 }; } },
  { n: 4, title: 'Waiting for a hanger', desc: 'FL1 is slow to finish, so all 4 hangers fill up. TL5 is done but has no empty hanger to load onto at TL6.',
    setup(S) { calmDown(S); waitFresh(S, ['FL1'], 120); const o = occOf(S, 'FL1'); o.required = o.workT + 30 * 60; M.logEvent(S, 'sim', 'SIMULATION · scenario 4: wheel fitment at FL1 slowed down', { pos: 'FL1' }); M.runWhile(S, () => { const o = occOf(S, 'TL5'), p = M.permissives(S, 'TL5'); return !(o && o.vehicleId && o.completeT != null && S.t - o.completeT > 30 && p && p.find((c) => c.key === 'dest' && /All 4 hangers/.test(c.detail))); }, 4 * 3600); return { select: { kind: 'pos', id: 'TL5' }, speed: 5, view: 'overview' }; } },
  { n: 5, title: 'Unit taken off line', desc: 'The unit at CL3 has a fitment issue and is far past its time. In fast mode it is taken off at once and recorded.',
    setup(S) { calmDown(S); waitFresh(S, ['CL3'], 300); const o = occOf(S, 'CL3'), v = S.vehicles[o.vehicleId], tgt = M.targetFor('CL3', v); o.workT = tgt + S.cfg.escalateAfter + 40; o.required = tgt * 3; M.step(S, 1); M.logEvent(S, 'sim', 'SIMULATION · scenario 5: exhaust fitment issue at CL3', { pos: 'CL3' }); return { select: { kind: 'pos', id: 'CL3' }, speed: 1, dialog: { type: 'offline', vehicleId: v.id, reason: M.OFFLINE_REASONS[1] } }; } },
  { n: 6, title: 'Hanger fault', desc: 'Hanger at CL4 reports a lift-encoder fault. Travel is inhibited even after the team presses Work done.',
    setup(S) { calmDown(S); waitFresh(S, ['CL4'], 300); const o = occOf(S, 'CL4'); o.required = o.workT + 45; M.injectCarrierFault(S, S.pos['CL4'].carrierId); M.logEvent(S, 'sim', `SIMULATION · fault injected on hanger ${S.pos['CL4'].carrierId}`, { pos: 'CL4' }); return { select: { kind: 'pos', id: 'CL4' }, speed: 5 }; } },
  { n: 7, title: 'Engine / transmission mismatch', desc: 'The E/T scan at CL2 reads the wrong engine for the VIN. CL2 goes on quality hold until it is rescanned.',
    setup(S) { calmDown(S); M.runWhile(S, () => !(occOf(S, 'CL2') && occOf(S, 'CL2').vehicleId && !S.vehicles[occOf(S, 'CL2').vehicleId].engine && occOf(S, 'CL2').workT < 60), 4 * 3600); const v = S.vehicles[occOf(S, 'CL2').vehicleId]; S.forceMismatch[v.id] = true; S.cfg.qualityFixSec = 6 * 3600; M.runWhile(S, () => !v.engine, 600); return { select: { kind: 'pos', id: 'CL2' }, speed: 5 }; } },
  { n: 8, title: 'Emergency call', desc: 'The team at CL2 presses Emergency. The Chassis line stops until the call is cleared.',
    setup(S) { calmDown(S); waitFresh(S, ['CL2'], 300); M.callEmergency(S, 'CL2'); return { select: { kind: 'pos', id: 'CL2' }, speed: 5 }; } },
  { n: 9, title: 'Line-off scan', desc: 'A finished vehicle is done at FL7. Scan it at Scanner 3 to stop the assembly timer.',
    setup(S) { calmDown(S); M.runWhile(S, () => !(occOf(S, 'FL6') && occOf(S, 'FL6').vehicleId), 3 * 3600); const vid = occOf(S, 'FL6').vehicleId; S.holdExit[vid] = true; M.runWhile(S, () => !(occOf(S, 'FL7') && occOf(S, 'FL7').vehicleId === vid && occOf(S, 'FL7').completeT != null), 3 * 3600); return { select: { kind: 'pos', id: 'FL7' }, speed: 1, dialog: { type: 'scan', scanner: 'EXIT', vin: S.vehicles[vid].vin } }; } },
  { n: 10, title: 'Invalid scan', desc: 'Scanner 1 reads a VIN that is already on the line. The scan is rejected and nothing changes.',
    setup(S) { calmDown(S); const id = ['TL2', 'TL3', 'CL1', 'FL3'].find((p) => occOf(S, p) && occOf(S, p).vehicleId); return { view: 'TRIM', speed: 1, dialog: { type: 'scan', scanner: 'ENTRY', vin: S.vehicles[occOf(S, id).vehicleId].vin } }; } },
];
function loadScenario(n) {
  const sc = SCENARIOS.find((s) => s.n === n);
  const keep = {};
  const S = freshState(11); Object.assign(S.cfg, keep);
  const r = sc.setup(S) || {}; if (n !== 9) S.holdExit = {};
  M.step(S, 1);
  RT.S = S; RT.acc = 0; RT.scenario = n; RT.speed = r.speed || 5; RT.running = true; RT.demo = r.demo ? { elapsed: 0, fired: false } : null;
  setUI({ selection: r.select || null, dialog: r.dialog || null, drawer: null, report: false, hover: null, view: r.view || RT.ui.view });
  M.logEvent(S, 'sim', `SIMULATION · scenario ${n}: ${sc.title}`);
  setTimeout(() => { if (r.select) focusSel(r.select); else if (Scene3D.ok) Scene3D.focusView(r.view || 'overview'); }, 30);
}
const focusSel = (sel) => { if (Scene3D.ok) Scene3D.focusAny(sel); };
function select(sel, focus = true) {
  if (sel && sel.kind === 'scanner') { if (sel.id === 'ENGINE') return select({ kind: 'pos', id: 'CL2' }, focus); if (sel.id === 'LOAD') return select({ kind: 'pos', id: 'TL6' }, focus); setUI({ dialog: { type: 'scan', scanner: sel.id } }); return; }
  setUI({ selection: sel, hover: null }); if (sel && focus) focusSel(sel);
}
function topAlarm(S) { const a = S.alarms.filter((x) => M.alarmActive(x) && x.level !== 'WARNING'); a.sort((x, y) => (M.alarmUnacked(y) - M.alarmUnacked(x)) || (M.SEV[y.level] - M.SEV[x.level]) || (x.raisedT - y.raisedT)); return a[0]; }
function openAlarm(a) { setUI({ drawer: null }); select({ kind: 'pos', id: POS[a.pos] ? dispId(a.pos) : 'TL1' }); }

/* ═════════ islands ═════════ */
function IdIsland() {
  const S = RT.S, p = M.pace(S);
  return html`<div class="seg id-island">
    <div class="brand"><${MgMark} /><div><div class="brand-name">GA Operations</div><div class="brand-sub">MG JW Automobile</div></div></div>
    <div class="clock"><span class="num">${fmtClock(S.t)}</span><span class="micro">${S.cfg.shiftName}</span></div>
    <span class="sim-tag" title="All data is simulated. No PLC, scanner or sensor is connected."><${Icon} n="flask" size=${10} />SIMULATION</span>
    <div class="shiftbar" title=${`Shift 06:00–14:30 · ${Math.round(p.frac * 100)}% elapsed`}><i style=${{ width: `${p.frac * 100}%` }}></i></div>
  </div>`;
}
function StateIsland() {
  const S = RT.S, p = M.pace(S), ls = M.lineStatus(S);
  const wip = S.vehOrder.filter((id) => M.isActive(S.vehicles[id])).length;
  return html`<section class="state-island" role="status" aria-live="polite">
    <div class="metric"><span class="micro">Line</span>
      <button class=${'linestate ' + (ls.tone === 'crit' ? 'crit' : '')} style=${{ color: tv(ls.tone) }} onClick=${() => ls.root ? select({ kind: 'pos', id: dispId(ls.root) }) : Scene3D.focusView('overview')}><span class="dot"></span>${ls.label}</button></div>
    <div class="metric"><span class="micro">Completed / plan</span><span class="v">${p.done}<small>/ ${S.cfg.shiftTarget}</small><small style=${{ color: p.delta < 0 ? 'var(--warn)' : 'var(--ok)' }}>${p.delta === 0 ? 'on plan' : p.delta > 0 ? `+${p.delta}` : p.delta}</small></span></div>
    <div class="metric opt"><span class="micro">Last hour</span><span class="v">${p.lastHour}<small>JPH · plan ${(S.cfg.shiftTarget / 8.5).toFixed(1)}</small></span></div>
    <div class="metric opt"><span class="micro">In process</span><span class="v">${wip}<small>vehicles</small></span></div>
  </section>`;
}
function ActIsland() {
  const S = RT.S;
  const active = S.alarms.filter((a) => M.alarmActive(a) && M.SEV[a.level] >= 3), unacked = active.filter(M.alarmUnacked);
  const themeIcon = RT.ui.theme === 'light' ? 'sun' : RT.ui.theme === 'dark' ? 'moon' : 'auto';
  return html`<nav class="seg act-island" aria-label="Actions">
    <button class="ibtn" title="Scanner 1 · entry scan" aria-label="Entry scan" onClick=${() => setUI({ dialog: { type: 'scan', scanner: 'ENTRY' } })}><${Icon} n="scanin" /></button>
    <button class="ibtn" title="Scanner 3 · line-off scan" aria-label="Line-off scan" onClick=${() => setUI({ dialog: { type: 'scan', scanner: 'EXIT' } })}><${Icon} n="scanout" /></button>
    <button class="ibtn opt" title="Shift report" aria-label="Shift report" onClick=${() => setUI({ report: true })}><${Icon} n="chart" /></button>
    <button class="ibtn" title="X-ray build view (X)" aria-label="X-ray build view" aria-pressed=${RT.ui.xray} onClick=${() => setUI({ xray: !RT.ui.xray })}><${Icon} n="xray" /></button>
    <button class="ibtn" title=${`Theme: ${RT.ui.theme}`} aria-label=${`Theme ${RT.ui.theme}. Switch theme`} onClick=${cycleTheme}><${Icon} n=${themeIcon} /></button>
    <button class="ibtn opt" title=${RT.ui.muted ? 'Alarm sound muted' : 'Alarm sound on'} aria-label=${RT.ui.muted ? 'Unmute alarm sound' : 'Mute alarm sound'} onClick=${() => { setUI({ muted: !RT.ui.muted }); if (!RT.ui.muted) Horn.ensure(); }}><${Icon} n=${RT.ui.muted ? 'mute' : 'vol'} /></button>
    <span class="sep"></span>
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
      <button class="lane-h" onClick=${() => go(k)}><span class="micro" style=${{ color: RT.ui.view === k ? 'var(--text)' : undefined }}>${AREAS[k].station} · ${name}</span>${k === 'CHASSIS' ? html`<${HangerTracker} />` : html`<span class="micro">${k === 'TRIM' ? 'Conveyor · hanger at TL6' : 'Hanger at FL1 · conveyor'}</span>`}</button>
      <div class="cells ticks">${ids.map((id) => html`<${Cell} key=${id} id=${id} sel=${!!(sel && sel.kind === 'pos' && sel.id === id)} />`)}</div>
    </div>`)}</div>
  </section>`;
}
function Cell({ id, sel }) {
  const S = RT.S, st = M.stationStatus(S, id), P = POS[id], sv = M.stationVehicle(S, id), occ = sv && S.pos[sv.posId].occ;
  const SHORT = { BUFFERED: 'in buffer', EMPTY: '—', INBOUND: 'inbound', AWAIT: 'ready', EMPTY_CARRIER: 'empty', TRANSFER: 'transfer', PLACING: 'placing', HANDLING: 'handling', SCAN: 'scan', FAULT: 'fault', PAUSED: 'stopped', REMOVAL: 'removal' };
  let r = 0, txt = SHORT[st.code] || st.label.toLowerCase();
  if (sv && P.kind === 'work' && occ) { const tgt = M.targetFor(id, sv.v); r = Math.min(1, occ.workT / tgt); txt = occ.completeT != null ? (st.code === 'WAITING' ? `wait ${fmtDur(occ.waitT)}` : 'done') : occ.workT > tgt ? `+${fmtDur(occ.workT - tgt)}` : fmtDur(occ.workT); }
  else if (sv && !['FAULT', 'TRANSFER', 'SCAN', 'REMOVAL'].includes(st.code)) txt = sv.v.vin.slice(-6);
  const barC = ['OVERDUE', 'ESCALATED', 'FAULT', 'HOLD'].includes(st.code) ? 'var(--crit)' : st.code === 'NEAR' ? 'var(--warn)' : st.code === 'WAITING' ? 'var(--hold)' : st.code === 'COMPLETE' ? 'var(--ok)' : 'var(--text)';
  const cls = 'cell' + (['OVERDUE', 'ESCALATED', 'FAULT', 'HOLD'].includes(st.code) ? ' x' : st.code === 'WAITING' ? ' w' : '') + (st.code === 'EMPTY' ? ' idle' : '');
  return html`<button class=${cls} aria-pressed=${!!sel} onClick=${() => select({ kind: 'pos', id })} title=${`${id} · ${st.label}${sv ? ' · ' + sv.v.vin : ''}`}><span class="cin">
    <span class="cid"><span>${id}${S.pos[id].carrierId && S.carriers[S.pos[id].carrierId].kind === 'Hanger' ? html`<i class="hg">${S.pos[id].carrierId}</i>` : ''}</span>${['OVERDUE', 'ESCALATED', 'FAULT', 'HOLD', 'WAITING', 'REMOVAL'].includes(st.code) ? html`<span class=${'c-' + st.tone}><${Icon} n=${STATUS_ICON[st.code]} /></span>` : null}</span>
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
        <${Tog} k="autoFeed" label="Paint-shop body feed" /><${Tog} k="autoEntryScan" label="Auto scan at Scanner 1" /><${Tog} k="autoExitScan" label="Auto scan at Scanner 3" /><${Tog} k="autoComplete" label="Simulated teams press Work done" />
        <label for="cfg-warn">Warning at % of target</label><input id="cfg-warn" type="number" min="50" max="99" value=${Math.round(C.warnPct * 100)} onChange=${(e) => setC('warnPct', M.clamp(+e.target.value || 85, 50, 99) / 100)} />
        <label for="cfg-esc">Escalate overdue after (min)</label><input id="cfg-esc" type="number" min="0.5" max="30" step="0.5" value=${C.escalateAfter / 60} onChange=${(e) => setC('escalateAfter', Math.round(M.clamp(+e.target.value || 3, 0.5, 30) * 60))} />
        <label for="cfg-blk">Blocked alarm after (min)</label><input id="cfg-blk" type="number" min="0.5" max="30" step="0.5" value=${C.blockedAlarmAfter / 60} onChange=${(e) => setC('blockedAlarmAfter', Math.round(M.clamp(+e.target.value || 1.5, 0.5, 30) * 60))} />
        <label for="cfg-rate">Random team delay rate (%)</label><input id="cfg-rate" type="number" min="0" max="30" value=${Math.round(C.delayRate * 100)} onChange=${(e) => setC('delayRate', M.clamp(+e.target.value || 0, 0, 30) / 100)} />
      </div>
      <div><div class="micro" style=${{ marginBottom: 8 }}>Simulated line stop</div><div class="actions">${['TRIM', 'CHASSIS', 'FINAL'].map((a) => html`<button key=${a} class="btn sm sim" onClick=${act(() => M.setPaused(S, a, !S.paused[a]))}><${Icon} n=${S.paused[a] ? 'play' : 'pause'} />${S.paused[a] ? 'Restart ' : 'Stop '}${AREAS[a].short}</button>`)}</div></div>
      <p class="note">Adapter: <b>${M.Integration.mode}</b>. Nothing is sent to any PLC, conveyor, scanner or sensor. Permissives shown in the HMI are simulated interlocks.</p>
    </div>` : null}
  </section>`;
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

function StationInspector({ id }) {
  const S = RT.S, P = POS[id], st = M.stationStatus(S, id), sv = M.stationVehicle(S, id);
  const posId = id;
  const p = S.pos[posId], occ = p.occ, v = sv && sv.v, c = p.carrierId && S.carriers[p.carrierId];
  const pm = M.permissives(S, posId);
  const twins = [id];
  const alarms = S.alarms.filter((a) => M.alarmActive(a) && twins.includes(a.pos));
  const events = S.events.filter((e) => twins.includes(e.pos)).slice(-8).reverse();
  const isWork = P.kind === 'work', tgt = v ? M.targetFor(id, v) : P.target;
  const r = occ && v && isWork ? occ.workT / tgt : 0, over = occ && v && isWork ? occ.workT - tgt : 0;
  const tone = st.code === 'COMPLETE' ? 'ok' : st.code === 'WAITING' ? 'hold' : st.tone === 'muted' ? 'text' : st.tone;
  const setTarget = (d) => { POS[id].target = M.clamp(P.target + d * 60, 5 * 60, 30 * 60); M.logEvent(S, 'sim', `Configuration · ${id} base target set to ${fmtDur(POS[id].target)}`, { pos: id }); bump(); };
  const xf = S.xfers.find((q) => q.from === id || q.to === id);
  const assist = M.callActive(S, 'SUP', id), emerg = M.callActive(S, 'EMERG', id);
  const stopped = S.paused[P.area];
  const canDone = !!(v && isWork && occ && occ.vehicleId === v.id && occ.completeT == null && !stopped && !(id === 'CL2' && !(v.engine && v.engine.ok)));
  const doneWhy = !v || !occ || occ.vehicleId !== v.id ? 'No unit at this station' : occ.completeT != null ? 'Already done' : stopped ? `${AREAS[P.area].short} line is stopped` : id === 'CL2' && !(v.engine && v.engine.ok) ? 'Engine/transmission not paired yet' : '';
  return html`<${React.Fragment}>
    <div class="insp-head"><div style=${{ flex: 1, minWidth: 0 }}>
      <div class="micro">${AREAS[P.area].station} · ${AREAS[P.area].name}${P.renumbered ? ' · renumbered' : ''}${P.idAssumed ? ' · ID assumed' : ''}</div>
      <div class="id">${id}</div><div class="sub">${P.op}</div>
      <div style=${{ marginTop: 10 }}><${StatusChip} st=${st} /></div></div>
      <button class="btn sm ghost icon" aria-label="Close inspector" onClick=${() => setUI({ selection: null })}><${Icon} n="x" /></button></div>
    <div class="insp-body">
      ${P.kind === 'work' ? html`<div class="btn-row" role="group" aria-label="Station controls">
        <button class="btn lg primary" disabled=${!canDone} title=${canDone ? `Work done · unit moves to ${M.XFER_FROM[id] ? M.XFER_FROM[id].to : M.NEXT[id] || 'line-off scan'} when free` : doneWhy} onClick=${act(() => M.manualComplete(S, id))}><${Icon} n="check" />Work done</button>
        <button class=${'btn lg warn' + (assist ? ' on' : '')} aria-pressed=${assist} title=${assist ? 'Assistance call open · press again when help has arrived' : 'Call a team leader to this station'} onClick=${act(() => { const c = M.openCall(S, id, 'SUP'); c ? M.clearCall(S, c.id, 'Line supervisor') : M.raiseCall(S, id, 'SUP', 'Station button'); })}><${Icon} n="hand" />Assistance</button>
        <button class=${'btn lg danger' + (emerg ? ' on' : '')} aria-pressed=${emerg} title=${emerg ? `Emergency active · ${AREAS[P.area].short} line stopped · press again to clear` : `Emergency · stops the ${AREAS[P.area].short} line`} onClick=${act(() => (emerg ? M.clearEmergency(S, id) : M.callEmergency(S, id)))}><${Icon} n="siren" />Emergency</button>
      </div>` : html`<p class="note">The buffer has no team. A loaded hanger waits here when CL4 is busy, and moves on by itself.</p>`}
      ${v && isWork ? html`<div class="timer"><${Ring} r=${r} tone=${tone} /><div>
        <div class="num" style=${{ color: ['OVERDUE', 'ESCALATED'].includes(st.code) ? tv(st.tone) : 'var(--text)' }}>${fmtDur(occ.workT)}</div>
        <div class="of">work time · target ${fmtDur(tgt)}${tgt !== P.target ? ` (${v.variant.name} change-point)` : ''}</div>
        <div class="delta" style=${{ color: over > 0 ? tv(st.tone === 'esc' ? 'esc' : 'crit') : 'var(--text-2)' }}>${occ.completeT != null ? `Finished ${over > 0 ? `+${fmtDur(over)} over` : `${fmtDur(-over)} under`}` : over > 0 ? `+${fmtDur(over)} overdue` : `${fmtDur(-over)} remaining`}</div></div></div>` : null}
      ${xf ? html`<div class="callout"><div class="ttl" style=${{ color: 'var(--transit)' }}><${Icon} n="arrow" />${M.XFER_FROM[xf.from].label}</div><div>${S.vehicles[xf.vehicleId].vin.slice(-6)} moving from ${S.carriers[S.pos[xf.from].carrierId].id} to ${S.carriers[S.pos[xf.to].carrierId].id} · ${fmtDur(Math.max(0, xf.t1 - S.t))} left</div></div>` : null}
      ${v ? html`<dl class="kv">
        <dt>VIN</dt><dd><button class="linkish" onClick=${() => select({ kind: 'veh', id: v.id })}>${v.vin}</button></dd>
        <dt>Model</dt><dd>${v.variant.name}</dd><dt>Powertrain</dt><dd>${v.variant.ptLabel}</dd><dt>Paint</dt><dd><${PaintChip} p=${v.paint} /></dd>
        <dt>Carrier</dt><dd class="mono">${c ? `${c.kind} ${c.id}` : '—'}</dd>
        ${occ ? html`<dt>Arrived</dt><dd class="mono">${fmtClock(occ.arriveT)}</dd>` : null}
        ${occ && occ.completeT != null && occ.completeT <= S.t && occ.waitT > 0 ? html`<dt>Waiting for transfer</dt><dd class="mono" style=${{ color: 'var(--hold)' }}>${fmtDur(occ.waitT)}</dd>` : null}
        ${occ && occ.pausedT ? html`<dt>Line-stop time</dt><dd class="mono">${fmtDur(occ.pausedT)}</dd>` : null}
        <dt>Assembly timer</dt><dd class="mono">${fmtDur(S.t - v.entryT)}</dd>
      </dl>` : html`<p class="note">${p.reservedBy ? `${S.carriers[p.reservedBy].kind} ${p.reservedBy} is on its way. The position becomes occupied when arrival is confirmed.` : c ? `${c.kind} ${c.id} is here and empty, ready for the next body.` : 'No carrier present. The position is ready to receive the next one.'}</p>`}
      ${v && id === 'CL2' && v.engine ? html`<div class=${'callout ' + (v.engine.ok ? '' : 'crit')}><div class="ttl" style=${{ color: v.engine.ok ? 'var(--ok)' : 'var(--crit)' }}><${Icon} n="link" />Engine / transmission ${v.engine.ok ? 'paired' : 'mismatch'}</div>
        <div class="mono" style=${{ fontSize: 12 }}>${v.engine.engineNo} · ${v.engine.transNo}</div>
        ${v.engine.ok ? html`<div class="note">Scanned ${fmtClock(v.engine.t, false)} and tied to this VIN.</div>` : html`<div class="note">Expected ${v.engine.expect}… for ${v.variant.name}. CL2 cannot press Work done until the correct unit is scanned.</div><div><button class="btn sm ok" onClick=${act(() => M.rescanEngine(S, 'CL2'))}><${Icon} n="scan" />Rescan correct unit</button></div>`}</div>` : null}
      ${v && st.code === 'ESCALATED' ? html`<div class="callout crit"><div class="ttl" style=${{ color: 'var(--esc)' }}><${Icon} n="exit" />Fast mode · consider taking this unit off</div><div>${fmtDur(occ.workT - tgt)} over target and past the escalation rule. Taking it off keeps the line moving; the unit is recorded, not repaired here.</div><div><button class="btn sm danger" onClick=${() => setUI({ dialog: { type: 'offline', vehicleId: v.id, reason: M.OFFLINE_REASONS[0] } })}><${Icon} n="exit" />Take off line…</button></div></div>` : null}
      ${P.hangerPoint ? html`<div class="callout"><div class="ttl" style=${{ color: 'var(--text-2)' }}><${Icon} n="hanger" />Hanger point</div><div>${c ? html`Hanger <b class="mono">${c.id}</b> is here${c.vehicleId ? ' carrying this unit' : ' and empty'}.` : p.reservedBy ? html`Hanger <b class="mono">${p.reservedBy}</b> is on its way.` : 'No hanger here right now.'}</div><div class="note">${id === 'TL6' ? 'Bodies are loaded from the Trim conveyor onto a hanger here, and Scanner 2 pairs the VIN to the hanger.' : id === 'FL1' ? 'Bodies are lowered from the hanger onto the Final conveyor here. The empty hanger returns to TL6 on its own rail.' : 'One of the 4 hangers carries the body through this point.'}</div><div style=${{ marginTop: 4 }}><${HangerTracker} /></div></div>` : null}
      <${RootCallout} posId=${posId} />
      ${alarms.length ? html`<div class="sec"><div class="micro">Alarms</div>${alarms.map((a) => html`<${AlarmMini} key=${a.id} a=${a} />`)}</div>` : null}
      ${v && (isWork || P.kind === 'entry') ? html`<div class="sec"><div class="micro"><span>Installed here</span><span>${v.variant.name}</span></div><${BuildList} v=${v} only=${id} /></div>` : null}
      ${pm ? html`<div class="sec"><div class="micro">Transfer readiness → ${M.XFER_FROM[posId] ? dispId(M.XFER_FROM[posId].to) + ' carrier' : M.NEXT[posId] ? dispId(M.NEXT[posId]) : 'carrier return'}</div><${Checklist} pm=${pm} /><p class="note">Simulated permissives. In production, motion authority stays with the PLC and safety system.</p></div>` : null}
      <div class="sec"><div class="micro">Supervisor</div><div class="actions">
        ${v && M.isActive(v) && !xf ? html`<button class="btn danger" onClick=${() => setUI({ dialog: { type: 'offline', vehicleId: v.id } })}><${Icon} n="exit" />Take off line…</button>` : null}
        ${id === 'TL1' ? html`<button class="btn" onClick=${() => setUI({ dialog: { type: 'scan', scanner: 'ENTRY' } })}><${Icon} n="scanin" />Scanner 1</button>` : null}
        ${id === 'FL7' && v ? html`<button class=${'btn ' + (occ && occ.completeT != null ? 'primary' : '')} disabled=${!(occ && occ.completeT != null)} onClick=${() => setUI({ dialog: { type: 'scan', scanner: 'EXIT', vin: v.vin } })}><${Icon} n="scanout" />Scanner 3 · line-off</button>` : null}
      </div>
      <div class="micro" style=${{ marginTop: 6, color: 'var(--sim)' }}>Simulation only</div><div class="actions">
        ${c && c.fault ? html`<button class="btn sm sim" onClick=${act(() => M.clearFault(S, 'C', c.id))}>Clear ${c.kind.toLowerCase()} fault</button>` : c ? html`<button class="btn sm sim" onClick=${act(() => { M.injectCarrierFault(S, c.id); M.logEvent(S, 'sim', `SIMULATION · fault injected on ${c.id}`, { pos: posId }); })}>Inject ${c.kind.toLowerCase()} fault</button>` : null}
        ${p.fault ? html`<button class="btn sm sim" onClick=${act(() => M.clearFault(S, 'P', posId))}>Clear sensor fault</button>` : html`<button class="btn sm sim" onClick=${act(() => { M.injectSensorFault(S, posId); M.logEvent(S, 'sim', `SIMULATION · sensor fault injected at ${dispId(posId)}`, { pos: posId }); })}>Inject sensor fault</button>`}
      </div></div>
      ${isWork ? html`<div class="sec"><div class="micro">Configuration</div><div style=${{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><span>Base target</span>
        <button class="btn sm icon" aria-label="Decrease target by one minute" onClick=${() => setTarget(-1)}><${Icon} n="minus" /></button><span class="mono" style=${{ minWidth: 50, textAlign: 'center' }}>${fmtDur(P.target)}</span><button class="btn sm icon" aria-label="Increase target by one minute" onClick=${() => setTarget(1)}><${Icon} n="plus" /></button>
        <span class="note">warning at ${fmtDur(P.target * S.cfg.warnPct)}</span></div></div>` : null}
      <div class="sec"><div class="micro">Recent activity</div>${events.length ? html`<ul class="timeline">${events.map((e) => html`<li key=${e.id}><span class="tm">${fmtClock(e.t, false)}</span><span>${e.text}</span></li>`)}</ul>` : html`<p class="note">No events here yet this shift.</p>`}</div>
    </div></${React.Fragment}>`;
}

const VSTATE = { IN_PROCESS: ['In process', 'text', 'clock'], AWAITING_LINE_OFF: ['At line-off', 'text', 'scan'], LINED_OFF: ['Lined off', 'ok', 'checkc'], OFF_LINE: ['Taken off line', 'warn', 'exit'] };
function VehicleInspector({ id }) {
  const S = RT.S, v = S.vehicles[id]; if (!v) return null;
  const [lbl, tone, ic] = VSTATE[v.state], c = v.carrierId && S.carriers[v.carrierId], at = c && c.mode === 'POS' ? c.posId : null;
  let tl, tval;
  if (v.state === 'LINED_OFF') { tl = 'Total assembly time · stopped at Scanner 3'; tval = v.totalDur; }
  else if (v.state === 'OFF_LINE') { tl = 'In line before take-out · timer stopped'; tval = v.offline.inLine; }
  else { tl = `Assembly timer · Scanner 1 at ${fmtClock(v.entryT, false)}`; tval = S.t - v.entryT; }
  const route = M.STATIONS.map((sid) => { const ids = [sid]; const cur = at && ids.includes(at); const done = ids.some((x) => v.done[x]) || v.segments.some((s) => ids.includes(s.pos) && s.end === 'departed'); const cr = ids.some((x) => v.credited[x]); return { sid, cls: cur ? 'cur' : cr && !done ? 'credit' : done ? 'done' : '' }; });
  const segs = v.segments.filter((s) => POS[s.pos].kind === 'work').slice(-14);
  const bs = M.buildState(S, v), items = M.buildFor(v), installed = items.filter((b) => (b.key === 'doors' ? bs.doors : bs[b.key]) >= 1).length;
  return html`<${React.Fragment}>
    <div class="insp-head"><div style=${{ flex: 1, minWidth: 0 }}>
      <div class="micro">Vehicle</div><div style=${{ marginTop: 6 }}><${VinText} vin=${v.vin} big /></div>
      <div class="sub">${v.variant.name} · ${v.variant.ptLabel}</div>
      <div style=${{ marginTop: 10 }}><span class=${'chip c-' + tone}><${Icon} n=${ic} />${lbl}</span></div></div>
      <button class="btn sm ghost icon" aria-label="Close inspector" onClick=${() => setUI({ selection: null })}><${Icon} n="x" /></button></div>
    <div class="insp-body">
      <div class="sec"><div class="micro">${tl}</div><div class="num" style=${{ fontSize: 44 }}>${fmtDur(tval)}</div></div>
      <dl class="kv"><dt>Location</dt><dd>${at ? html`<${PosLink} id=${at} />` : M.locationLabel(S, v)}</dd>${at ? html`<dt>Operation</dt><dd>${POS[at].op}</dd>` : null}
        <dt>Model</dt><dd>MG ${v.variant.model}</dd><dt>Variant</dt><dd>${v.variant.trim}</dd><dt>Powertrain</dt><dd>${v.variant.ptLabel}</dd><dt>Paint</dt><dd><${PaintChip} p=${v.paint} /></dd>
        <dt>Carrier</dt><dd class="mono">${c ? `${c.kind} ${c.id}` : '—'}</dd>${v.engine ? html`<dt>Engine</dt><dd class="mono" style=${{ color: v.engine.ok ? null : 'var(--crit)' }}>${v.engine.engineNo}</dd><dt>Transmission</dt><dd class="mono">${v.engine.transNo}</dd>` : null}
        <dt>Scanner 1</dt><dd class="mono">${fmtClock(v.entryT)}${v.source === 'SIM_AUTO' ? ' · sim' : ''}</dd>${v.lineOffT ? html`<dt>Scanner 3</dt><dd class="mono">${fmtClock(v.lineOffT)}</dd>` : null}</dl>
      <div class="sec"><div class="micro">Route</div><div class="route" aria-label="Route progress">${route.map((x, i) => html`<${React.Fragment} key=${x.sid}>${i === 6 || i === 11 ? html`<span class="g"></span>` : null}<span class=${'s ' + x.cls} title=${x.sid}></span></${React.Fragment}>`)}</div></div>
      ${v.offline ? html`<div class="callout warn"><div class="ttl" style=${{ color: 'var(--warn)' }}><${Icon} n="exit" />Taken off line · recorded</div><div>${v.offline.reason}${v.offline.notes ? ` — ${v.offline.notes}` : ''}</div>
        <dl class="kv" style=${{ marginTop: 4 }}><dt>Taken from</dt><dd class="mono">${dispId(v.offline.pos)}</dd><dt>Time</dt><dd class="mono">${fmtClock(v.offline.t)}</dd>${v.offline.over ? html`<dt>Over target at station</dt><dd class="mono" style=${{ color: 'var(--crit)' }}>+${fmtDur(v.offline.over)}</dd>` : null}<dt>Build at take-out</dt><dd class="mono">${v.offline.built} components</dd><dt>Responsible</dt><dd class="mono">${dispId(v.offline.responsible)}</dd><dt>Authorized by</dt><dd>${v.offline.by || 'Supervisor'}</dd></dl>
        <div class="note">Not counted as a completed vehicle and not re-entered.</div></div>` : null}
      <div class="sec"><div class="micro">Actions</div><div class="actions">
        ${M.isActive(v) && at ? html`<button class="btn danger" onClick=${() => setUI({ dialog: { type: 'offline', vehicleId: v.id } })}><${Icon} n="exit" />Take off line…</button>` : null}
        ${M.isActive(v) && !at ? html`<span class="note">A unit can be taken off once it arrives at a position.</span>` : null}
        ${v.state === 'AWAITING_LINE_OFF' ? html`<button class="btn primary" onClick=${() => setUI({ dialog: { type: 'scan', scanner: 'EXIT', vin: v.vin } })}><${Icon} n="scanout" />Exit scan</button>` : null}
        ${v.state === 'OFF_LINE' || v.state === 'LINED_OFF' ? html`<span class="note">No actions: this record is closed.</span>` : null}
      </div></div>
      <div class="sec"><div class="micro"><span>Build</span><span>${installed} / ${items.length} components</span></div><${BuildList} v=${v} /></div>
      ${segs.length ? html`<div class="sec"><div class="micro">Position timing</div><div style=${{ overflowX: 'auto' }}><table class="data"><thead><tr><th>Pos</th><th>Work</th><th>Target</th><th>Waiting</th></tr></thead><tbody>
        ${segs.map((s, i) => { const live = !s.end && S.pos[s.pos].occ && S.pos[s.pos].occ.vehicleId === v.id ? S.pos[s.pos].occ : null; const w = live ? live.workT : s.work; return html`<tr key=${i}><td class="mono">${s.pos}${s.credited ? ' ·cr' : ''}</td><td class="mono" style=${{ color: w > s.target ? 'var(--crit)' : null }}>${fmtDur(w)}${s.interrupted ? ' ✕' : ''}</td><td class="mono c-muted">${fmtDur(s.target)}</td><td class="mono">${fmtDur(live ? live.waitT : s.wait)}</td></tr>`; })}</tbody></table></div></div>` : null}
      <div class="sec"><div class="micro">History</div><ul class="timeline">${v.history.slice(-12).reverse().map((e, i) => html`<li key=${i}><span class="tm">${fmtClock(e.t, false)}</span><span>${e.text}</span></li>`)}</ul></div>
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
  S.alarms.forEach((a) => { if (!M.alarmActive(a) || a.level === 'WARNING' || !POS[a.pos]) return; const sid = dispId(a.pos); if (!byPos[sid] || M.SEV[a.level] > M.SEV[byPos[sid].level]) byPos[sid] = a; });
  Object.entries(byPos).forEach(([sid, a]) => {
    const occ = S.pos[a.pos].occ, v = occ && occ.vehicleId && S.vehicles[occ.vehicleId];
    let txt;
    if (a.type === 'DELAY') txt = html`<span class="mono k">${sid}</span><span>${a.level === 'ESCALATED' ? 'ESCALATED' : 'OVERDUE'}</span><span class="mono">+${fmtDur(occ && v ? occ.workT - M.targetFor(a.pos, v) : 0)}</span>`;
    else if (a.type === 'FAULT') txt = html`<span class="mono k">${sid}</span><span>${a.msg.split(' · ')[0]}</span>`;
    else if (a.type === 'QUALITY') txt = html`<span class="mono k">${sid}</span><span>QUALITY HOLD · E/T mismatch</span>`;
    else if (a.type === 'ASSIST') txt = html`<span class="mono k">${sid}</span><span>ASSISTANCE</span>`;
    else if (a.type === 'EMERGENCY') txt = html`<span class="mono k">${sid}</span><span>EMERGENCY · LINE STOPPED</span>`;
    else txt = html`<span class="mono k">${sid}</span><span>waiting${a.root ? html` · held by <span class="mono k">${dispId(a.root)}</span>` : ''}</span>`;
    const cls = a.level === 'ESCALATED' || a.level === 'EMERGENCY' ? 't-esc' : a.level === 'BLOCKED' ? 't-hold' : a.level === 'ASSIST' ? 't-warn' : 't-crit';
    tags.push(html`<div key=${'a' + sid} class="anchor" data-anchor=${'pos:' + sid}><div class=${'tag ' + cls} role="button" tabIndex="0" onClick=${() => select({ kind: 'pos', id: sid })} onKeyDown=${(e) => e.key === 'Enter' && select({ kind: 'pos', id: sid })}><${Icon} n=${LEVEL_ICON[a.level]} />${txt}</div></div>`);
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
      ${sv && P.kind === 'work' && occ ? html`<dt>Elapsed</dt><dd class="mono">${fmtDur(occ.workT)} / ${fmtDur(M.targetFor(hv.id, sv.v))}</dd>` : null}
      ${occ && occ.completeT != null && occ.waitT > 0 ? html`<dt>Waiting</dt><dd class="mono">${fmtDur(occ.waitT)}</dd>` : null}<dt>Team</dt><dd>${P.team}</dd></dl>`;
  } else if (hv.kind === 'veh') {
    const v = S.vehicles[hv.id]; if (!v) return null;
    body = html`<div style=${{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><span class="mono" style=${{ fontSize: 16, fontWeight: 600 }}>${v.vin.slice(-6)}</span><span class="c-muted" style=${{ fontSize: 12 }}>${v.variant.name}</span></div>
      <dl><dt>Location</dt><dd>${M.locationLabel(S, v)}</dd><dt>Assembly</dt><dd class="mono">${fmtDur((v.lineOffT || S.t) - v.entryT)}</dd><dt>Carrier</dt><dd class="mono">${v.carrierId || '—'}</dd></dl>`;
  } else if (hv.kind === 'scanner') body = html`<div class="mono" style=${{ fontWeight: 600 }}>${hv.id === 'ENTRY' ? 'Scanner 1 · VIN receive' : hv.id === 'LOAD' ? 'Scanner 2 · hanger load' : hv.id === 'EXIT' ? 'Scanner 3 · line-off' : 'E/T scanner · CH-02'}</div><p class="note" style=${{ marginTop: 6 }}>${hv.id === 'ENGINE' ? 'Pairs engine and transmission serials to the VIN.' : hv.id === 'LOAD' ? 'Pairs the VIN to its hanger automatically at TL6.' : 'Click to scan.'}</p>`;
  return html`<div class="glass hovercard ticks" id="hovercard" style=${{ transform: `translate(${Math.min(hv.x + 16, window.innerWidth - 310)}px, ${hv.y + 16}px)` }}>${body}</div>`;
}
function Legend() {
  const row = (sw, txt) => html`<div class="row"><span class="sw" style=${{ background: sw }}></span><span>${txt}</span></div>`;
  return html`<div class="glass legend-pop ticks" role="dialog" aria-label="Key">
    <div class="micro">Reading the floor</div>
    ${row('var(--text)', 'Timer bar along each position: work time against target')}
    ${row('var(--warn)', 'Near target')}${row('var(--crit)', 'Overdue, fault or quality hold · pulsing tint and tag')}${row('var(--esc)', 'Escalated delay')}
    ${row('var(--ok)', 'Work complete, transfer permitted')}${row('var(--hold)', 'Work complete, waiting for transfer')}
    ${row('repeating-linear-gradient(90deg, var(--warn) 0 6px, transparent 6px 10px)', 'Chevrons point from waiting bodies to the position holding them')}
    ${row('var(--transit)', 'Bright parts on a car are being installed right now')}
    <p class="note">X-ray (X) makes the body glass so interior and underbody parts are visible. Every state also shows as text with an icon.</p>
    <p class="note">Keys: <b>0</b> shop · <b>1/2/3</b> lines · <b>A</b> alarm · <b>X</b> x-ray · <b>Space</b> pause · <b>Esc</b> close.</p>
    <button class="btn sm" onClick=${() => setUI({ dialog: { type: 'about' }, legend: false })}><${Icon} n="info" />Layout, assumptions & PLC integration</button>
  </div>`;
}

/* ── dialogs ── */
function ScanDialog({ d }) {
  const S = RT.S, entry = d.scanner === 'ENTRY';
  const [vin, setVin] = useState(d.vin || ''), [res, setRes] = useState(null), [scanning, setScanning] = useState(false), inp = useRef(null);
  useEffect(() => { inp.current && inp.current.focus(); }, []);
  const head = M.bufferHead(S), headBody = head >= 0 ? S.bodyBuffer[head] : null;
  const doScan = () => { setScanning(true); setRes(null); setTimeout(() => { const v = vin.trim().toUpperCase(); const r = entry ? M.entryScan(S, v, 'MANUAL') : M.exitScan(S, v, 'MANUAL'); if (r.ok && !entry && r.vehicleId) delete S.holdExit[r.vehicleId]; setRes(r); setScanning(false); bump(); }, 650); };
  const E0 = S.pos['TL1'], lo = S.pos.FL7, loV = lo.occ && lo.occ.vehicleId && lo.occ.completeT != null && S.vehicles[lo.occ.vehicleId];
  const activeV = S.vehOrder.map((id) => S.vehicles[id]).find((v) => v.state === 'IN_PROCESS' && v.carrierId && S.carriers[v.carrierId].posId && POS[S.carriers[v.carrierId].posId].kind === 'work');
  const entryState = !E0.carrierId ? (E0.reservedBy ? `skid ${E0.reservedBy} arriving` : 'no skid present') : E0.occ.vehicleId ? `occupied by ${S.vehicles[E0.occ.vehicleId].vin.slice(-6)}` : E0.occ.pendingBody ? 'body being placed' : `empty skid ${E0.carrierId} ready`;
  const garble = () => { const g = headBody ? headBody.label : 'LSJA34661TP248999'; return g.slice(0, 8) + (g[8] === '7' ? '3' : '7') + g.slice(9); };
  return html`<div class="scrim" onClick=${(e) => e.target === e.currentTarget && setUI({ dialog: null })}><div class="glass dialog ticks" role="dialog" aria-modal="true" aria-labelledby="scan-h">
    <div class="dialog-head"><div style=${{ flex: 1 }}><div class="micro">${entry ? 'Scanner 1 · TL1 VIN receive' : 'Scanner 3 · FL7 line-off'}</div><h3 id="scan-h">${entry ? 'Register a body entering assembly' : 'Register normal line-off'}</h3></div><span class="sim-tag">SIMULATED</span><button class="btn sm ghost icon" aria-label="Close" onClick=${() => setUI({ dialog: null })}><${Icon} n="x" /></button></div>
    <div class="dialog-body">
      <div class=${'scanwin' + (scanning ? ' scanning' : '')}><div class="barcode"></div><div class="laser"></div></div>
      <div class="field"><label for="vin-in">VIN · 17 characters</label><input id="vin-in" ref=${inp} class="vin-input" aria-invalid=${res && !res.ok ? "true" : "false"} data-state=${res ? (res.ok ? "ok" : "bad") : ""} maxLength="17" spellCheck="false" autoComplete="off" value=${vin} onInput=${(e) => { setVin(e.target.value.toUpperCase()); setRes(null); }} onKeyDown=${(e) => e.key === 'Enter' && vin && !scanning && doScan()} /></div>
      <div class="actions">${entry ? html`
        ${headBody ? html`<button class="btn sm sim" onClick=${() => { setVin(headBody.label); setRes(null); }}>Label on next body</button>` : null}
        ${activeV ? html`<button class="btn sm sim" onClick=${() => { setVin(activeV.vin); setRes(null); }}>VIN already on line</button>` : null}
        <button class="btn sm sim" onClick=${() => { setVin(garble()); setRes(null); }}>Misread label</button>` : html`
        ${loV ? html`<button class="btn sm sim" onClick=${() => { setVin(loV.vin); setRes(null); }}>Vehicle at line-off</button>` : null}
        <button class="btn sm sim" onClick=${() => { const b = 'LSJA34660TP999999'; setVin(b.slice(0, 8) + M.vinCheckDigit(b) + b.slice(9)); setRes(null); }}>Unknown VIN</button>
        ${activeV ? html`<button class="btn sm sim" onClick=${() => { setVin(activeV.vin); setRes(null); }}>VIN still mid-line</button>` : null}`}</div>
      <p class="note">${entry ? html`TL1: <b>${entryState}</b>. Paint-shop buffer: <b>${S.bodyBuffer.filter(Boolean).length} of 6</b> bodies.${S.cfg.autoEntryScan ? ' Auto scan is on, so the simulator also scans bodies when TL1 is free.' : ''}` : html`FL7: <b>${loV ? `${loV.vin} done, waiting ${fmtDur(lo.occ.waitT)}` : 'no finished vehicle waiting'}</b>.`}</p>
      ${res ? html`<div class=${'result ' + (res.ok ? 'ok' : 'bad')} role="alert"><div class="ttl" style=${{ color: res.ok ? 'var(--ok)' : 'var(--crit)' }}><${Icon} n=${res.ok ? 'checkc' : 'xc'} />${res.ok ? 'Accepted' : 'Rejected'}</div><div>${res.reason}</div>
        <ul>${res.ok ? (entry ? [html`<li key="a">Body taken from the buffer and placed on the Trim conveyor at TL1</li>`, html`<li key="b">Assembly timer started ${fmtClock(res.t)}</li>`] : [html`<li key="a">Assembly timer stopped · ${fmtDur(res.dur)}</li>`, html`<li key="b">Completed count updated · vehicle released to storage</li>`]) : [html`<li key="c">No production record was created or changed</li>`, html`<li key="d">Logged as an exception</li>`]}</ul></div>` : null}
    </div>
    <div class="dialog-foot">${res && res.ok && res.vehicleId ? html`<button class="btn" onClick=${() => { setUI({ dialog: null }); select({ kind: 'veh', id: res.vehicleId }); }}>Show vehicle</button>` : null}<button class="btn" onClick=${() => setUI({ dialog: null })}>Done</button><button class="btn primary" aria-busy=${scanning ? 'true' : 'false'} disabled=${!vin && !scanning} onClick=${() => !scanning && doScan()}><${Icon} n="scan" />${scanning ? 'Scanning…' : 'Scan'}</button></div>
  </div></div>`;
}
function OffLineDialog({ d }) {
  const S = RT.S, v = S.vehicles[d.vehicleId];
  const chk = v ? M.canTakeOffLine(S, v.id) : { ok: false }, at = chk.ok ? chk.posId : null, c = v && v.carrierId && S.carriers[v.carrierId];
  const occ = at && S.pos[at].occ, tgt = at && v ? M.targetFor(at, v) : 0, over = at && POS[at].kind === 'work' && occ && occ.completeT == null ? occ.workT - tgt : 0;
  const [reason, setReason] = useState(d.reason || (over > 0 ? M.OFFLINE_REASONS[0] : M.OFFLINE_REASONS[1])), [resp, setResp] = useState(at ? dispId(at) : 'TL1'), [notes, setNotes] = useState(''), [by, setBy] = useState('Line supervisor · Shift A'), [ok, setOk] = useState(false), [err, setErr] = useState(null);
  if (!v) return null;
  const submit = () => { const r = M.takeOffLine(S, v.id, { reason, notes, responsible: resp, by }); if (!r.ok) { setErr(r.reason); return; } setUI({ dialog: null, selection: { kind: 'veh', id: v.id } }); };
  return html`<div class="scrim" onClick=${(e) => e.target === e.currentTarget && setUI({ dialog: null })}><div class="glass dialog ticks" role="dialog" aria-modal="true" aria-labelledby="off-h">
    <div class="dialog-head"><div style=${{ flex: 1 }}><div class="micro">Authorized process event · fast mode</div><h3 id="off-h">Take unit off the line</h3></div><button class="btn sm ghost icon" aria-label="Close" onClick=${() => setUI({ dialog: null })}><${Icon} n="x" /></button></div>
    <div class="dialog-body">
      <dl class="kv"><dt>VIN</dt><dd><${VinText} vin=${v.vin} /></dd><dt>Variant</dt><dd>${v.variant.name}</dd><dt>Position</dt><dd class="mono">${at ? dispId(at) : M.locationLabel(S, v)}</dd><dt>Carrier</dt><dd class="mono">${c ? `${c.kind} ${c.id}` : '—'}</dd>
        ${at && POS[at].kind === 'work' && occ ? html`<dt>Time at station</dt><dd class="mono" style=${{ color: over > 0 ? 'var(--crit)' : null }}>${fmtDur(occ.workT)} / ${fmtDur(tgt)}${over > 0 ? ` (+${fmtDur(over)})` : ''}</dd>` : null}</dl>
      ${!at ? html`<div class="result bad">${chk.reason}</div>` : null}
      <div class="field"><label for="off-reason">Reason</label><select id="off-reason" value=${reason} onChange=${(e) => setReason(e.target.value)}>${M.OFFLINE_REASONS.map((r) => html`<option key=${r}>${r}</option>`)}</select></div>
      <div class="field"><label for="off-resp">Station where the issue occurred</label><select id="off-resp" value=${resp} onChange=${(e) => setResp(e.target.value)}>${STATIONS.map((r) => html`<option key=${r} value=${r}>${r} · ${POS[r].team}</option>`)}</select></div>
      <div class="field"><label for="off-notes">Notes for the record</label><textarea id="off-notes" rows="2" value=${notes} onInput=${(e) => setNotes(e.target.value)} placeholder="e.g. Exhaust hanger bracket misaligned, would not seat"></textarea></div>
      <div class="field"><label for="off-by">Authorized by</label><input id="off-by" value=${by} onInput=${(e) => setBy(e.target.value)} /></div>
      <label class="confirm-row" for="off-ok"><input id="off-ok" type="checkbox" checked=${ok} onChange=${(e) => setOk(e.target.checked)} /><span>The unit leaves the line now. Its timing stops, it is recorded as off-line with its build state, and it will <b>not</b> count as a completed line-off. Its carrier continues empty.</span></label>
      ${err ? html`<div class="result bad">${err}</div>` : null}
    </div>
    <div class="dialog-foot"><button class="btn" onClick=${() => setUI({ dialog: null })}>Cancel</button><button class="btn danger" disabled=${!ok || !at} onClick=${submit}><${Icon} n="exit" />Take off line</button></div>
  </div></div>`;
}
function AboutDialog() {
  const li = (t, i) => html`<li key=${i}>${t}</li>`;
  return html`<div class="scrim" onClick=${(e) => e.target === e.currentTarget && setUI({ dialog: null })}><div class="glass dialog ticks" style=${{ width: 'min(900px, 100%)' }} role="dialog" aria-modal="true" aria-labelledby="ab-h">
    <div class="bv-about"><img class="bv-full" src=${BV_FULL} alt="Bolt & Volt Pvt Ltd" /><span class="bv-light"><img src=${BV_ICON} alt="" width="40" height="44" /><span><b>Bolt & Volt</b><small>Pvt Ltd · Since 2004</small></span></span><p class="note">Designed and built by Bolt & Volt for MG JW Automobile, General Assembly.</p></div>
    <div class="dialog-head"><div style=${{ flex: 1 }}><div class="micro">Prototype notes</div><h3 id="ab-h">Layout source, assumptions and PLC integration</h3></div><button class="btn sm ghost icon" aria-label="Close" onClick=${() => setUI({ dialog: null })}><${Icon} n="x" /></button></div>
    <div class="dialog-body" style=${{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 22, fontSize: 13, lineHeight: 1.55 }}>
      <div><div class="micro">Line flow (confirmed by the plant)</div><ul style=${{ paddingLeft: 18, color: 'var(--text-2)' }}>${[
        'Trim TL1–TL5 on a floor conveyor (moved by hand today). Scanner 1 receives the VIN at TL1.',
        'TL6 is a Trim work point and the hanger load point. Scanner 2 pairs the VIN to the hanger.',
        'Exactly 4 hangers: TL6 → CL1 → CL2 → CL3 → Buffer → CL4 → FL1. The buffer is normally empty and holds a loaded hanger when CL4 is busy.',
        'FL1 is a Final work point on the hanger; the body is then lowered onto the Final conveyor FL2–FL7. Empty hangers return FL1 → TL6 on a separate rail.',
        'FL7 is the final inspection and line-off point with Scanner 3.',
        'Each unit moves on its own as soon as its team presses Work done and the next point is free.',
        'Every station has three buttons: Work done, Assistance call and Emergency call. Emergency stops that line until cleared.',
      ].map(li)}</ul></div>
      <div><div class="micro">Assumptions (labelled, configurable)</div><ul style=${{ paddingLeft: 18, color: 'var(--text-2)' }}>${[
        'Which part goes on at which point, and the target times, follow the plant split but are assumed.',
        'Engine/transmission scan at CL2 comes from the GA drawing.',
        'Conveyor speeds, hanger travel times, return-rail route and the 32-vehicle plan are assumed.',
        'Units with problems are taken off the line and recorded; the off-line hold area location is assumed.',
      ].map(li)}</ul></div>
      <div><div class="micro">Needed for real PLC integration</div><ul style=${{ paddingLeft: 18, color: 'var(--text-2)' }}>${[
        'PLC tag list or event interface: carrier arrival/position confirmation, presence sensors, permissive and interlock states, fault codes, station Work done / Assistance / Emergency signals.',
        'Scanner models and protocols for Scanners 1–3 and the CL2 E/T scanner; MES source for VIN, variant and engine data.',
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
  const active = S.alarms.filter(M.alarmActive), un = active.filter((a) => a.ackT == null), ak = active.filter((a) => a.ackT != null);
  const resolved = S.alarms.filter((a) => !M.alarmActive(a) && a.level !== 'WARNING').slice(-60).reverse();
  const sortA = (l) => l.slice().sort((a, b) => M.SEV[b.level] - M.SEV[a.level] || a.raisedT - b.raisedT);
  const list = tab === 'active' ? sortA(un) : tab === 'acked' ? sortA(ak) : tab === 'resolved' ? resolved : null;
  const off = S.vehOrder.map((id) => S.vehicles[id]).filter((v) => v.state === 'OFF_LINE').reverse();
  const filters = [['all', 'All'], ['exception', 'Exceptions'], ['alarm', 'Alarms'], ['scan', 'Scans'], ['offline', 'Off-line'], ['move', 'Movement'], ['sim', 'Simulation']];
  const evs = tab === 'log' ? S.events.filter((e) => RT.ui.logFilter === 'all' || e.cat === RT.ui.logFilter || (RT.ui.logFilter === 'move' && e.cat === 'work')).slice(-200).reverse() : [];
  return html`<aside class="glass drawer ticks in" aria-label="Alarms and events">
    <div class="head"><div style=${{ flex: 1 }}><div class="micro">Exceptions</div><div style=${{ fontWeight: 600, fontSize: 18 }}>Alarms & events</div></div>
      ${tab === 'active' && un.some((a) => a.level !== 'WARNING') ? html`<button class="btn sm warn" onClick=${act(() => un.filter((a) => a.level !== 'WARNING').forEach((a) => M.ackAlarm(S, a.id)))}><${Icon} n="check" />Acknowledge all</button>` : null}
      <button class="btn sm ghost icon" aria-label="Close" onClick=${() => setUI({ drawer: null })}><${Icon} n="x" /></button></div>
    <div class="tabs" role="tablist">${[['active', 'Active', un.length], ['acked', 'Acknowledged', ak.length], ['resolved', 'Resolved', resolved.length], ['offline', 'Off-line units', off.length], ['log', 'Event log', null]].map(([k, l, n]) => html`<button key=${k} role="tab" aria-selected=${tab === k} onClick=${() => setUI({ drawer: k })}>${l}${n != null ? html`<span class="n">${n}</span>` : null}</button>`)}</div>
    ${tab === 'offline' ? html`<div class="alist">${off.length ? off.map((v) => html`<div key=${v.id} class="arow" role="button" tabIndex="0" style=${{ '--tone': 'var(--warn)' }} onClick=${() => { setUI({ drawer: null }); select({ kind: 'veh', id: v.id }); }} onKeyDown=${(e) => e.key === 'Enter' && (setUI({ drawer: null }), select({ kind: 'veh', id: v.id }))}>
        <div class="top"><span class="chip c-warn"><${Icon} n="exit" />Off-line</span><span class="mono" style=${{ fontWeight: 600 }}>${dispId(v.offline.pos)}</span><span class="mono c-muted">${shortVin(v.vin)}</span></div>
        <div>${v.offline.reason}${v.offline.notes ? ` — ${v.offline.notes}` : ''}</div>
        <div class="meta"><span class="mono">${fmtClock(v.offline.t, false)}</span><span>${v.variant.name}</span><span class="mono">built ${v.offline.built}</span>${v.offline.over ? html`<span class="mono" style=${{ color: 'var(--crit)' }}>+${fmtDur(v.offline.over)} over</span>` : null}<span>${v.offline.by || 'Supervisor'}</span></div>
      </div>`) : html`<div class="empty">No units taken off the line this shift.</div>`}</div>`
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

/* Line-off moment: a short card when a unit passes Scanner 3 at FL7. */
function LineOffCard() {
  const lo = RT.ui.lineoff; if (!lo) return null;
  const c = lo.rec;
  return html`<div class="glass lineoff ticks" role="status" aria-live="polite">
    <div class="lo-mark"><${MgMark} /></div>
    <div><div class="micro lo-k">Line-off · Scanner 3 · FL7</div><div class="lo-name">${c.name}</div>
      <div class="lo-meta"><${PaintChip} p=${M.PAINTS.find((x) => x.name === c.paint) || { name: c.paint, hex: '#888' }} /><span class="mono">${c.vin}</span></div></div>
    <div class="lo-stat"><span class="micro">Build time</span><span class="num">${fmtDur(c.dur)}</span></div>
    <div class="lo-stat"><span class="micro">Today</span><span class="num">${c.n}<small> / ${RT.S.cfg.shiftTarget}</small></span></div>
  </div>`;
}

/* ── root ── */
function App() {
  const [, force] = useReducer((x) => x + 1, 0), sceneRef = useRef(null), [webgl, setWebgl] = useState(true);
  useEffect(() => {
    const ok3d = Scene3D.init(sceneRef.current, {
      getState: () => RT.S, getUI: () => RT.ui, theme: effectiveTheme(),
      onHover: (hit, changed) => { if (changed || !hit) setUI({ hover: hit }); else { RT.ui.hover = hit; const n = document.getElementById('hovercard'); if (n) n.style.transform = `translate(${Math.min(hit.x + 16, window.innerWidth - 310)}px, ${hit.y + 16}px)`; } },
      onSelect: (hit) => select(hit),
    });
    if (!ok3d) { setWebgl(false); RT.ui.view2D = true; }
    let last = performance.now(), lastRev = -1, lastPaint = 0;
    const loop = (now) => {
      const dt = Math.min(0.25, (now - last) / 1000); last = now;
      if (RT.running && RT.demo && !RT.demo.fired && (RT.demo.elapsed += dt) >= DEMO_AFTER) { RT.demo.fired = true; injectDemoDelay(RT.S); }
      if (RT.running) { RT.acc += dt * RT.speed; let n = 0; while (RT.acc >= 1 && n < 400) { M.step(RT.S, 1); RT.acc -= 1; n++; } }
      if (!RT.ui.view2D) Scene3D.render(RT.S.t + (RT.running ? RT.acc : 0), now);
      Horn.tick(now);
      const done = RT.S.stats.completed, lastC = done[done.length - 1];
      if (lastC && lastC !== RT._seenLineOff) { if (RT._seenLineOff !== undefined) setUI({ lineoff: { rec: lastC, at: now } }); RT._seenLineOff = lastC; }
      if (RT.ui.lineoff && now - RT.ui.lineoff.at > 6500) setUI({ lineoff: null });
      if (now - lastPaint > (RT.ui.view2D ? 120 : 250) || RT.rev !== lastRev) { lastPaint = now; lastRev = RT.rev; force(); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    const l = () => force(); RT.listeners.add(l);
    const key = (e) => {
      if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === 'Escape') { if (RT.ui.dialog) setUI({ dialog: null }); else if (RT.ui.report) setUI({ report: false }); else if (RT.ui.drawer) setUI({ drawer: null }); else setUI({ selection: null, legend: false }); }
      else if (e.key === '0') { setUI({ selection: null, view: 'overview' }); Scene3D.focusView('overview'); }
      else if (e.key === '1' || e.key === '2' || e.key === '3') { const v = ['TRIM', 'CHASSIS', 'FINAL'][+e.key - 1]; setUI({ view: v, selection: null }); Scene3D.focusView(v); }
      else if (e.key === 'a' || e.key === 'A') { const t = topAlarm(RT.S); if (t) openAlarm(t); }
      else if (e.key === 'x' || e.key === 'X') setUI({ xray: !RT.ui.xray });
      else if (e.key === ' ' && e.target === document.body) { e.preventDefault(); RT.running = !RT.running; bump(); }
    };
    window.addEventListener('keydown', key);
    return () => { RT.listeners.delete(l); window.removeEventListener('keydown', key); };
  }, []);
  const d = RT.ui.dialog;
  return html`<main class="stage">
    <div id="scene" ref=${sceneRef} style=${{ visibility: RT.ui.view2D ? 'hidden' : 'visible' }}></div>
    ${RT.ui.view2D ? html`<${Plan2D} fallback=${!webgl} />` : html`<${Anchors} />`}
    ${!RT.ui.view2D ? html`<${HoverCard} />` : null}
    <header class="glass hud ticks in"><${IdIsland} /><${StateIsland} /><${ActIsland} /></header>
    <${Strip} /><${SimConsole} /><${LineOffCard} />
    ${RT.ui.legend ? html`<${Legend} />` : null}
    ${RT.ui.selection ? html`<${Inspector} key=${RT.ui.selection.kind + RT.ui.selection.id} />` : null}
    ${RT.ui.drawer ? html`<${AlarmDrawer} />` : null}
    ${RT.ui.report ? html`<${Report} />` : null}
    ${d && d.type === 'scan' ? html`<${ScanDialog} key=${d.scanner + (d.vin || '')} d=${d} />` : null}
    ${d && d.type === 'offline' ? html`<${OffLineDialog} key=${d.vehicleId} d=${d} />` : null}
    ${d && d.type === 'about' ? html`<${AboutDialog} />` : null}
  </main>`;
}
(function boot() {
  const saved = store.get('mg-theme'); if (saved === 'light' || saved === 'dark' || saved === 'auto') RT.ui.theme = saved;
  if (RT.ui.theme !== 'auto') document.documentElement.setAttribute('data-theme', RT.ui.theme);
  RT.S = freshState(11); SCENARIOS[0].setup(RT.S); RT.speed = 15; RT.demo = { elapsed: 0, fired: false };
  M.logEvent(RT.S, 'sim', 'SIMULATION · scenario 1: Normal production');
  const start = () => ReactDOM.createRoot(document.getElementById('app')).render(html`<${App} />`);
  const fonts = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]) : Promise.resolve();
  fonts.then(start, start);
})();
