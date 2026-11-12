/* ════════════════════════════════════════════════════════════════════════
   App shell: signed-in user and permissions, screen router, root and boot.
   ════════════════════════════════════════════════════════════════════════ */
import { Scene3D } from './lib/scene.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AdminPage, adminAllowed, persistConfig, savedCfg } from './admin.js';
import { Auth, ROLES, SignIn, can } from './auth.js';
import { AboutDialog, CorrectDialog, OffLineDialog, ReturnDialog, ScanDialog, VinSearchDialog } from './floor/dialogs.js';
import { AlarmDrawer } from './floor/drawer.js';
import { Anchors, HoverCard, Inspector, Legend } from './floor/inspector.js';
import { ActIsland, IdIsland, StateIsland, Strip } from './floor/islands.js';
import { Plan2D } from './floor/plan2d.js';
import { DEMO_AFTER, SCENARIOS, applyScenarioHints, freshState, injectDemoDelay, openAlarm, select, topAlarm } from './floor/scenarios.js';
import { REMOTE, remoteAcc, startRemote } from './lib/source.js';
import { SimConsole } from './floor/sim-console.js';
import { HowPage } from './how.js';
import { LineOffCard } from './lib/misc.js';
import { go, parseHash } from './lib/router.js';
import { Act } from './lib/act.js';
import { M, RT, bump, effectiveTheme, fmtClock, html, setUI, store, useEffect, useReducer, useRef, useState } from './lib/runtime.js';
import { Horn, Icon } from './lib/ui-kit.js';
import { ReportsPage } from './reports.js';
import { DashboardPage, LineDisplay, PowerOverlay } from './screens.js';
import { Rail } from './ui/nav.js';
import { goPage, navPages } from './lib/pages.js';


/* Page navigation: the rail under the top bar (tablet and desktop); on phones the pages are in the top bar's menu. */
function PageRail() {
  return html`<${Rail} value=${RT.route.page} items=${navPages().map((p) => ({ ...p, end: p.value === 'how' }))} onChange=${goPage} />`;
}
/* Non-floor screens share the header and scroll their own body. */
function PageShell({ children }) {
  return html`<div class="page-shell"><header class="glass hud ticks in"><${IdIsland} /><${ActIsland} /></header><div class="page-scroll">${children}</div></div>`;
}
function Placeholder({ title }) { return html`<div class="page-wrap"><div class="empty-page"><${Icon} n="info" size=${28} /><h2>${title}</h2><p class="note"><button class="linkish" onClick=${() => go(ROLES[Auth.user.role].home)}>Go to your home screen</button></p></div></div>`; }

/* ── root ── */
function App() {
  const [, force] = useReducer((x) => x + 1, 0), sceneRef = useRef(null), [webgl, setWebgl] = useState(true);
  useEffect(() => {
    let last = performance.now(), lastRev = -1, lastPaint = 0, last3d = 0, lastRev3d = -1;
    const input = () => { RT._inputAt = performance.now(); };
    for (const ev of ['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart']) window.addEventListener(ev, input, { passive: true });
    const loop = (now) => {
      const dt = Math.min(0.25, (now - last) / 1000); last = now;
      if (REMOTE) RT.acc = remoteAcc(now); // the edge server runs the engine; draw between its updates
      else {
        if (RT.running && RT.demo && !RT.demo.fired && (RT.demo.elapsed += dt) >= DEMO_AFTER) { RT.demo.fired = true; injectDemoDelay(RT.S); }
        if (RT.running) { RT.acc += dt * RT.speed; let n = 0; while (RT.acc >= 1 && n < 400) { M.step(RT.S, 1); RT.acc -= 1; n++; } }
      }
      const floor = RT.route.page === 'floor';
      if (floor && !RT.ui.view2D) {
        // the camera frames the line inside the space the top bar and strip leave free (checked twice a second)
        if (now - (RT._safeAt || 0) > 500) {
          RT._safeAt = now;
          const hud = document.querySelector('.stage header.hud'), strip = document.querySelector('.strip'), rail = document.querySelector('.ds-rail');
          // the alarm panel frames the camera like the station panel does (audit U5); the station panel reports its own width
          const drawer = !RT.ui.selection && window.innerWidth > 760 && document.querySelector('.drawer');
          Scene3D.setSafeArea({ top: hud ? hud.getBoundingClientRect().bottom : 0, bottom: strip ? window.innerHeight - strip.getBoundingClientRect().top : 0, left: rail ? rail.getBoundingClientRect().right : 0, right: drawer ? window.innerWidth - drawer.getBoundingClientRect().left : 0 });
        }
        // render on demand when idle: paused, nothing changed and no input for 3 s → 2 frames a second (audit T4)
        const idle = !RT.running && RT.rev === lastRev3d && now - (RT._inputAt || 0) > 3000;
        if (!idle || now - last3d > 500) { last3d = now; lastRev3d = RT.rev; Scene3D.render(RT.S.t + (RT.running ? RT.acc : 0), now); }
      }
      Horn.tick(now);
      const done = RT.S.stats.completed, lastC = done[done.length - 1];
      // a new state (scenario load, power cut, server snapshot) is not a car finishing: remember its last one quietly (audit B10)
      const lastKey = lastC ? `${lastC.vin}|${lastC.t}` : null;
      if (RT._seenS !== RT.S) { RT._seenS = RT.S; RT._seenLineOff = lastKey; if (RT.ui.lineoff) setUI({ lineoff: null }); }
      else if (lastKey && lastKey !== RT._seenLineOff) { if (floor) setUI({ lineoff: { rec: lastC, at: now } }); RT._seenLineOff = lastKey; }
      if (RT.ui.lineoff && now - RT.ui.lineoff.at > 6500) setUI({ lineoff: null });
      if (now - (RT._persistAt || 0) > 10000) { RT._persistAt = now; if (Auth.user) persistConfig(); }
      if (now - lastPaint > (RT.ui.view2D || !floor ? 120 : 250) || RT.rev !== lastRev) { lastPaint = now; lastRev = RT.rev; force(); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    const l = () => force(); RT.listeners.add(l);
    const key = (e) => {
      // no shortcuts while signed out or locked, or on a line display (audit B7)
      if (!Auth.user || Auth.locked || RT.route.page === 'display') return;
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setUI({ dialog: { type: 'vin' } }); return; }
      if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === 'Escape') { if (RT.ui.dialog) setUI({ dialog: null }); else if (RT.ui.drawer) setUI({ drawer: null }); else setUI({ selection: null, legend: false }); return; }
      if (e.key === '/') { e.preventDefault(); setUI({ dialog: { type: 'vin' } }); return; }
      if (RT.route.page !== 'floor') return;
      if (e.key === '0') { setUI({ selection: null, view: 'overview' }); Scene3D.focusView('overview'); }
      else if (e.key === '1' || e.key === '2' || e.key === '3') { const v = ['TRIM', 'CHASSIS', 'FINAL'][+e.key - 1]; setUI({ view: v, selection: null }); Scene3D.focusView(v); }
      else if (e.key === 'a' || e.key === 'A') { const t = topAlarm(RT.S); if (t) openAlarm(t); }
      else if (e.key === 'x' || e.key === 'X') setUI({ xray: !RT.ui.xray });
      else if (e.key === ' ' && e.target === document.body && can('sim')) { e.preventDefault(); Act.setRunning(!RT.running); }
    };
    window.addEventListener('keydown', key);
    return () => { RT.listeners.delete(l); window.removeEventListener('keydown', key); };
  }, []);
  const d = RT.ui.dialog, page = RT.route.page, floor = page === 'floor';
  const gate = page !== 'display' && (!Auth.user || Auth.locked);
  const rail = !gate && page !== 'display';
  // the 3D floor loads the first time the Floor opens (audit T3)
  useEffect(() => {
    if (!floor || gate || Scene3D.loaded) return;
    Scene3D.load(sceneRef.current, {
      getState: () => RT.S, getUI: () => RT.ui, theme: effectiveTheme(),
      onHover: (hit, changed) => { if (changed || !hit) setUI({ hover: hit }); else { RT.ui.hover = hit; const n = document.getElementById('hovercard'); if (n) n.style.transform = `translate(${Math.min(hit.x + 16, window.innerWidth - 310)}px, ${hit.y + 16}px)`; } },
      onSelect: (hit) => select(hit),
      onLost: () => { setWebgl(false); setUI({ view2D: true }); }, // graphics context lost: the 2D plan takes over (audit T4)
    }).then((ok) => { if (!ok) { setWebgl(false); setUI({ view2D: true }); } });
  }, [floor, gate]);
  // locking the screen drops any open dialog, so it does not reappear after unlock (audit B7)
  useEffect(() => { if (gate && RT.ui.dialog) setUI({ dialog: null }); }, [gate]);
  return html`<main class=${'stage' + (rail ? ' has-rail' : '')}>
    ${rail ? html`<${PageRail} />` : null}
    ${RT.conn.state === 'down' ? html`<div class="conn-banner" role="alert"><${Icon} n="wifioff" size=${14} /><b>Line server not reachable</b><span>Showing the last data received at ${fmtClock(RT.S.t)} · reconnecting…</span></div>` : null}
    <div id="scene" ref=${sceneRef} style=${{ visibility: floor && !RT.ui.view2D && !gate ? 'visible' : 'hidden' }}></div>
    ${gate ? html`<${SignIn} key=${Auth.locked ? 'lock' : 'in'} lock=${!!(Auth.user && Auth.locked)} />` : floor ? html`<${React.Fragment}>
    ${RT.ui.view2D ? html`<${Plan2D} fallback=${!webgl} />` : html`<${Anchors} />`}
    ${!RT.ui.view2D ? html`<${HoverCard} />` : null}
    <header class="glass hud ticks in"><${IdIsland} /><${StateIsland} /><${ActIsland} /></header>
    <${Strip} /><${SimConsole} /><${LineOffCard} />
    ${RT.ui.legend ? html`<${Legend} />` : null}
    ${RT.ui.selection ? html`<${Inspector} key=${RT.ui.selection.kind + RT.ui.selection.id} />` : null}</${React.Fragment}>`
    : page === 'display' ? html`<${LineDisplay} />`
    : html`<${PageShell}>${page === 'admin' ? html`<${AdminPage} />` : page === 'dash' ? html`<${DashboardPage} />` : page === 'reports' ? html`<${ReportsPage} />` : page === 'how' ? html`<${HowPage} />` : html`<${Placeholder} title="Page not found" />`}</${PageShell}>`}
    <${PowerOverlay} />
    ${!gate && page !== 'display' && RT.ui.drawer ? html`<${AlarmDrawer} />` : null}
    ${gate || page === 'display' ? null : html`<${React.Fragment}>
    ${d && d.type === 'scan' ? html`<${ScanDialog} key=${d.scanner + (d.vin || '')} d=${d} />` : null}
    ${d && d.type === 'offline' ? html`<${OffLineDialog} key=${d.vehicleId} d=${d} />` : null}
    ${d && d.type === 'return' ? html`<${ReturnDialog} key=${d.vehicleId} d=${d} />` : null}
    ${d && d.type === 'correct' ? html`<${CorrectDialog} key=${d.pos} d=${d} />` : null}
    ${d && d.type === 'vin' ? html`<${VinSearchDialog} />` : null}
    ${d && d.type === 'about' ? html`<${AboutDialog} />` : null}</${React.Fragment}>`}
  </main>`;
}
/* A TV opened without a valid display link (live screens only). */
function DisplayNotAuthorised() {
  return html`<div class="lcd" style=${{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}><div style=${{ textAlign: 'center', maxWidth: 560, padding: 24 }}>
    <${Icon} n="tv" size=${40} /><h2 style=${{ margin: '16px 0 8px' }}>This display is not authorised</h2>
    <p class="note">${Auth.displayError || 'Line displays connect with a display link. Ask an administrator to create one in Settings → Displays, then open it on this screen once.'}</p>
  </div></div>`;
}
/* Called from main.js once every module is loaded. */
export function boot() {
  const saved = store.get('mg-theme'); if (saved === 'light' || saved === 'dark' || saved === 'auto') RT.ui.theme = saved;
  if (RT.ui.theme !== 'auto') document.documentElement.setAttribute('data-theme', RT.ui.theme);
  RT.route = parseHash();
  if (!location.hash || location.hash === '#/') RT.route = { page: '', sub: null };
  const fonts = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]) : Promise.resolve();
  const el = document.getElementById('app');
  if (!REMOTE) {
    RT.S = freshState(11, savedCfg()); SCENARIOS[0].setup(RT.S); RT.speed = 15; RT.demo = { elapsed: 0, fired: false };
    M.logEvent(RT.S, 'sim', 'SIMULATION · scenario 1: Normal production');
    const start = () => { if (!RT.route.page && Auth.user) go(ROLES[Auth.user.role].home); createRoot(el).render(html`<${App} />`); };
    Promise.all([fonts, Auth.init()]).then(start, start);
    return;
  }
  // live screens: sign-in is checked by the edge server first; only then does the live connection open
  el.innerHTML = '<div class="boot-wait">Connecting to the line server…</div>';
  const root = createRoot(el);
  const goLive = async () => {
    const hints = await startRemote();
    RT.demo = null; applyScenarioHints({ ...hints, speed: RT.speed }); RT.ui.selection = null; RT.ui.dialog = null; RT.ui.drawer = null;
    if (Auth.display) go('display', Auth.display.line); // a line display shows its own line
    else if (!RT.route.page && Auth.user) go(ROLES[Auth.user.role].home);
    root.render(html`<${App} />`);
  };
  Promise.all([fonts, Auth.init()]).then(() => {
    RT.route = parseHash();
    if (!location.hash || location.hash === '#/') RT.route = { page: '', sub: null };
    if (Auth.user || Auth.display) return goLive();
    if (RT.route.page === 'display') { root.render(html`<${DisplayNotAuthorised} />`); return; }
    Auth.onSignedIn = goLive;
    root.render(html`<${SignIn} />`);
  }, (e) => { el.innerHTML = `<div class="boot-wait">Line server not reachable · ${String(e && e.message || e)}</div>`; });
}
