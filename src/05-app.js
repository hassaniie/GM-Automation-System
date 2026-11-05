/* ════════════════════════════════════════════════════════════════════════
   App shell: signed-in user and permissions, screen router, root and boot.
   ════════════════════════════════════════════════════════════════════════ */

/* ── who is using the app (replaced by the sign-in module) ── */
const Auth = { user: { name: 'Line supervisor', role: 'admin' } };
function can() { return true; }
function userName() { return Auth.user ? Auth.user.name : 'System'; }

/* ── screens: #/floor, #/dash, #/display/<line>, #/reports, #/admin/<tab>, #/how ── */
RT.route = { page: 'floor', sub: null };
function parseHash() { const [page, sub] = (location.hash.replace(/^#\/?/, '') || 'floor').split('/'); return { page: page || 'floor', sub: sub || null }; }
function go(page, sub) { const h = `#/${page}${sub ? '/' + sub : ''}`; if (location.hash !== h) location.hash = h; else { RT.route = parseHash(); bump(); } }
window.addEventListener('hashchange', () => { RT.route = parseHash(); setUI({ dialog: null, drawer: null }); });

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
      const floor = RT.route.page === 'floor';
      if (floor && !RT.ui.view2D) Scene3D.render(RT.S.t + (RT.running ? RT.acc : 0), now);
      Horn.tick(now);
      const done = RT.S.stats.completed, lastC = done[done.length - 1];
      if (lastC && lastC !== RT._seenLineOff) { if (RT._seenLineOff !== undefined && floor) setUI({ lineoff: { rec: lastC, at: now } }); RT._seenLineOff = lastC; }
      if (RT.ui.lineoff && now - RT.ui.lineoff.at > 6500) setUI({ lineoff: null });
      if (now - lastPaint > (RT.ui.view2D || !floor ? 120 : 250) || RT.rev !== lastRev) { lastPaint = now; lastRev = RT.rev; force(); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    const l = () => force(); RT.listeners.add(l);
    const key = (e) => {
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setUI({ dialog: { type: 'vin' } }); return; }
      if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === 'Escape') { if (RT.ui.dialog) setUI({ dialog: null }); else if (RT.ui.report) setUI({ report: false }); else if (RT.ui.drawer) setUI({ drawer: null }); else setUI({ selection: null, legend: false }); return; }
      if (e.key === '/') { e.preventDefault(); setUI({ dialog: { type: 'vin' } }); return; }
      if (RT.route.page !== 'floor') return;
      if (e.key === '0') { setUI({ selection: null, view: 'overview' }); Scene3D.focusView('overview'); }
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
    ${d && d.type === 'return' ? html`<${ReturnDialog} key=${d.vehicleId} d=${d} />` : null}
    ${d && d.type === 'correct' ? html`<${CorrectDialog} key=${d.pos} d=${d} />` : null}
    ${d && d.type === 'vin' ? html`<${VinSearchDialog} />` : null}
    ${d && d.type === 'about' ? html`<${AboutDialog} />` : null}
  </main>`;
}
(function boot() {
  const saved = store.get('mg-theme'); if (saved === 'light' || saved === 'dark' || saved === 'auto') RT.ui.theme = saved;
  if (RT.ui.theme !== 'auto') document.documentElement.setAttribute('data-theme', RT.ui.theme);
  RT.route = parseHash();
  RT.S = freshState(11); SCENARIOS[0].setup(RT.S); RT.speed = 15; RT.demo = { elapsed: 0, fired: false };
  M.logEvent(RT.S, 'sim', 'SIMULATION · scenario 1: Normal production');
  const start = () => ReactDOM.createRoot(document.getElementById('app')).render(html`<${App} />`);
  const fonts = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]) : Promise.resolve();
  fonts.then(start, start);
})();
