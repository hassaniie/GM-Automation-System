/* ════════════════════════════════════════════════════════════════════════
   3D DIGITAL TWIN v2 — rendering layer. Reads engine state; never writes it.
   Layout traced from the GA drawing. Vehicles are assembled from ~20
   components whose visibility follows the engine's build state.
   ════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MGE } from '@mg/engine';
import { BV_FULL } from './brand.js';

export const Scene3D = (function () {
  const E = MGE;
  const { RH, POS, EDGES, NEXT, STATIONS } = E;
  const THEMES = {
    dark: {
      // lifted epoxy-grey floor with a cool bias; production zones read as lighter bays
      bg: 0x0b0e12, floor: 0x12171c, zone: 0x171d24, zoneEdge: 0x3f4a56, grid1: 0x151a20, grid2: 0x1a2027, pad: 0x1c232b, padEdge: 0x4a5562, padEdgeHi: 0xc9d2da,
      steel: 0x8f99a4, steelDark: 0x3a424b, rail: 0x7a8591, column: 0x2a323b, conveyor: 0x2a323b, slat: 0x333c46, equip: 0x3c454f, equipAccent: 0x4f97e0,
      text: '#e4e8ec', textDim: '#a2acb7', note: '#aab4bf', warnText: '#d6b062', hemi: [0xd8e2ee, 0x1a2027, 0.95], amb: 0.26, key: 1.4, rim: 0.7, fill: 0.5, pools: 1, badge: 0.42, fogNear: 170, fogFar: 330,
      tone: { muted: 0x5c6670, text: 0xd9dee3, ok: 0x3fc28a, warn: 0xf0a92a, crit: 0xff4d4a, esc: 0xff3d7f, hold: 0x8ea2ff, transit: 0x50c4d8, paused: 0x9aa6b2, sup: 0xb394ff, mnt: 0x4fb4ff },
      xray: 0x9fb4c8, install: 0x6fe3ff, aperture: 0x050607,
    },
    light: {
      bg: 0xdfe3e7, floor: 0xcdd3d9, zone: 0xe2e6ea, zoneEdge: 0x8f99a3, grid1: 0xd0d5da, grid2: 0xc6ccd2, pad: 0xf6f7f8, padEdge: 0x7f8992, padEdgeHi: 0x2b3137,
      steel: 0x8f99a3, steelDark: 0xb4bcc4, rail: 0x7f8992, column: 0xaeb6be, conveyor: 0x9ea7b0, slat: 0x8d969f, equip: 0xaab2ba, equipAccent: 0x1f6fd1,
      text: '#1f252b', textDim: '#5b6670', note: '#4d5862', warnText: '#9a6f12', hemi: [0xffffff, 0xb4bcc4, 0.42], amb: 0.1, key: 0.5, fogNear: 170, fogFar: 330,
      tone: { muted: 0x9aa3ab, text: 0x2b3239, ok: 0x1f9a66, warn: 0xd08a0b, crit: 0xe23b3b, esc: 0xd01f5e, hold: 0x4a62e0, transit: 0x0f8ea6, paused: 0x7a8794, sup: 0x7a4fe0, mnt: 0x0a7fd6 },
      xray: 0x3d5875, install: 0x0b84d8, aperture: 0x1a1d21, rim: 0, fill: 0.14, pools: 0, badge: 0.32,
    },
  };
  let T = THEMES.dark, themeName = 'dark';
  let renderer, scene, camera, controls, el, raycaster, pointer = new THREE.Vector2();
  let hemi, amb, key, fill, rim, pools, floorBadge;
  const MG_FLOOR_LOGO = 'data:image/png;base64,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';
  let getState, getUI, cb = {};
  const pads = {}, carrierObjs = {}, carObjs = {}, bufferObjs = [], scanners = {}, beacons = {};
  const pickables = [];
  const themed = []; // { mat, key, prop }
  const texts = []; // { mesh, text, opts }
  let chevrons, chevronData = [], chevronSig = '';
  let camAnim = null, viewShift = 0, viewShiftY = 0, lastScanId = null, down = null, hoverKey = null, ok = false;
  /** Pixels of the window covered by the UI (top bar, strip, side panels); the camera frames the line inside the rest. */
  let safe = { top: 0, right: 0, bottom: 0, left: 0 };
  function setSafeArea(a) { safe = { ...safe, ...a }; }

  /* ── helpers ── */
  const tcol = (k) => (k.startsWith('tone_') ? T.tone[k.slice(5)] : T[k]);
  const tm = (keyName, extra = {}, Kind = THREE.MeshStandardMaterial) => { const m = new Kind({ color: tcol(keyName), ...extra }); themed.push({ mat: m, key: keyName }); return m; };
  function textCanvas(text, o) {
    const c = document.createElement('canvas'); c.width = o.w; c.height = o.h; const g = c.getContext('2d');
    g.font = `${o.weight} ${o.size}px ${o.mono ? '"JetBrains Mono", ui-monospace, monospace' : '"Barlow", "Segoe UI", system-ui, sans-serif'}`;
    g.fillStyle = T[o.colorKey] || o.colorKey; g.textBaseline = 'middle'; g.textAlign = o.align;
    if (o.letter && 'letterSpacing' in g) g.letterSpacing = o.letter + 'px';
    g.fillText(text, o.align === 'left' ? 4 : o.align === 'center' ? o.w / 2 : o.w - 4, o.h / 2);
    return c;
  }
  function floorText(text, x, z, width, opts = {}) {
    const o = { size: 60, weight: 600, colorKey: 'text', mono: false, w: 512, h: 96, align: 'left', letter: 0, rot: 0, ...opts };
    const tex = new THREE.CanvasTexture(textCanvas(text, o)); tex.anisotropy = 8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width * o.h / o.w), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = o.rot;
    const off = o.align === 'center' ? 0 : width / 2;
    m.position.set(x + Math.cos(o.rot) * off, 0.03, z - Math.sin(o.rot) * off); m.renderOrder = 2; scene.add(m);
    texts.push({ mesh: m, text, o }); return m;
  }
  function refreshTexts() { texts.forEach((t) => { t.mesh.material.map.dispose(); t.mesh.material.map = new THREE.CanvasTexture(textCanvas(t.text, t.o)); t.mesh.material.map.anisotropy = 8; t.mesh.material.needsUpdate = true; }); }
  function lineLoop(pts, mat, y = 0.02) { const g = new THREE.BufferGeometry().setFromPoints(pts.map(([x, z]) => new THREE.Vector3(x, y, z))); const l = new THREE.Line(g, mat); scene.add(l); return l; }
  function roundedRect(x0, z0, x1, z1, r) {
    const s = new THREE.Shape(); s.moveTo(x0 + r, z0); s.lineTo(x1 - r, z0); s.quadraticCurveTo(x1, z0, x1, z0 + r); s.lineTo(x1, z1 - r); s.quadraticCurveTo(x1, z1, x1 - r, z1); s.lineTo(x0 + r, z1); s.quadraticCurveTo(x0, z1, x0, z1 - r); s.lineTo(x0, z0 + r); s.quadraticCurveTo(x0, z0, x0 + r, z0); return s;
  }
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  function box(w, h, d, mat, x = 0, y = 0, z = 0, parent) { const m = new THREE.Mesh(unitBox, mat); m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; (parent || scene).add(m); return m; }
  function cyl(r, h, mat, x, y, z, parent, seg = 16) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat); m.position.set(x, y, z); m.castShadow = true; (parent || scene).add(m); return m; }
  const ease = (u) => u * u * (3 - 2 * u);
  const easeOut = (u) => 1 - Math.pow(1 - u, 3);
  const padSize = (id) => (id === 'BUF' ? [5.6, 4.2] : [6.2, 4.6]);

  /* ── environment ── */
  function buildEnvironment() {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), tm('floor', { roughness: 0.94 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(10, 0, -2); floor.receiveShadow = true; scene.add(floor);
    const minor = [], major = [];
    // grid runs out to the fog so the floor reads edge to edge at every camera angle
    for (let x = -240; x <= 260; x += 2) (x % 10 === 0 ? major : minor).push(x, 0.004, -240, x, 0.004, 240);
    for (let z = -240; z <= 240; z += 2) (z % 10 === 0 ? major : minor).push(-240, 0.004, z, 260, 0.004, z);
    const mk = (arr, k) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); scene.add(new THREE.LineSegments(g, tm(k, {}, THREE.LineBasicMaterial))); };
    mk(minor, 'grid1'); mk(major, 'grid2');
    // production areas (dashed boundaries as on the GA drawing)
    const zoneMat = tm('zone', { roughness: 0.95 });
    const edgeMat = tm('zoneEdge', { dashSize: 0.9, gapSize: 0.6 }, THREE.LineDashedMaterial);
    const zone = (x0, z0, x1, z1, r = 0.01) => {
      const sh = roundedRect(x0, z0, x1, z1, r);
      const m = new THREE.Mesh(new THREE.ShapeGeometry(sh, 8), zoneMat); m.rotation.x = Math.PI / 2; m.position.y = 0.008; m.receiveShadow = true; scene.add(m);
      const pts = sh.getPoints(10); const g = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, 0.014, p.y)));
      const l = new THREE.Line(g, edgeMat); l.computeLineDistances(); scene.add(l);
    };
    zone(-56, 4.2, 0.6, 18.6); zone(-5, -26, 19, 1.4); zone(13.6, 4.6, 64.5, 18.8);
    floorText('TRIM LINE', -56, 20.6, 10, { size: 70, weight: 700, colorKey: 'text', letter: 16, w: 640 });
    floorText('STATION 1 · TL1 – TL6', -44.6, 20.6, 9, { size: 40, weight: 500, colorKey: 'textDim', letter: 3 });
    floorText('CHASSIS LINE', -5, -27.6, 11, { size: 70, weight: 700, colorKey: 'text', letter: 16, w: 640 });
    floorText('STATION 2 · CL1 – CL4 · BUFFER', 7.2, -27.6, 9.6, { size: 40, weight: 500, colorKey: 'textDim', letter: 3 });
    floorText('FINAL LINE', 13.6, 20.8, 10, { size: 70, weight: 700, colorKey: 'text', letter: 16, w: 640 });
    floorText('STATION 3 · FL1 – FL7', 25, 20.8, 9.4, { size: 40, weight: 500, colorKey: 'textDim', letter: 3 });
    // conveyors: trim floor conveyor TL1–TL5 and final slat conveyor FL2–FL7
    box(30, 0.18, 2.3, tm('conveyor', { roughness: 0.7, metalness: 0.2 }), -27, 0.09, 11);
    const conv = tm('conveyor', { roughness: 0.7, metalness: 0.2 });
    const slatTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 8; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 8); g.fillStyle = '#000'; g.globalAlpha = 0.22; g.fillRect(56, 0, 8, 8); const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(48, 1); return t; })();
    const slat = tm('slat', { roughness: 0.6, metalness: 0.3, map: slatTex });
    box(36, 0.3, 2.9, slat, 39, 0.15, 11.5);
    // walkway platforms beside the conveyors (red dashed edges on the drawing)
    const plat = tm('pad', { roughness: 0.9 });
    [[-20.5, 8.6, 42.5], [-20.5, 13.4, 42.5]].forEach(([x, z, w]) => box(w, 0.06, 2.2, plat, x, 0.03, z));
    // flow arrows on conveyors
    const arrowGeo = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.3, -0.28), new THREE.Vector2(0.3, 0), new THREE.Vector2(-0.3, 0.28), new THREE.Vector2(-0.15, 0)]));
    const arrowMat = tm('zoneEdge', {}, THREE.MeshBasicMaterial);
    Object.entries(EDGES).forEach(([k, p]) => { const q = p.at(0.5); const m = new THREE.Mesh(arrowGeo, arrowMat); m.rotation.x = -Math.PI / 2; m.rotation.z = Math.atan2(-q.dz, q.dx); m.position.set(q.x, k.startsWith('FL') ? 0.32 : 0.02, q.z); scene.add(m); });
    // building column grid
    const colMat = tm('column', { roughness: 0.8 });
    // north row only: the south row stood between the default camera and the floor labels ("FINA · LINE", audit T1)
    for (let x = -54; x <= 72; x += 18) box(0.7, 9, 0.7, colMat, x, 4.5, -31);
    // paint-shop feed and storage exit
    floorText('FROM PAINT SHOP  →', -63, 11, 7, { size: 40, weight: 500, colorKey: 'textDim', letter: 3 });
    floorText('PAINTED BODY BUFFER', -53.8, 3.2, 6.5, { size: 36, weight: 600, colorKey: 'textDim', letter: 3 });
    floorText('TO STORAGE YARD  →', 66, 14.6, 7.5, { size: 40, weight: 500, colorKey: 'textDim', letter: 3 });
    lineLoop([[65, 9], [82, 9], [82, 14], [65, 14], [65, 9]], tm('zoneEdge', {}, THREE.LineBasicMaterial));
    // off-line hold area for units taken off the line (location assumed)
    const rb = roundedRect(-29.5, -12.2, -15.5, -1.8, 0.01); const pts = rb.getPoints(8);
    const rbl = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, 0.015, p.y))), tm('tone_warn', { dashSize: 0.6, gapSize: 0.4 }, THREE.LineDashedMaterial)); rbl.computeLineDistances(); scene.add(rbl);
    floorText('OFF-LINE UNITS · TAKEN OUT (LOCATION ASSUMED)', -29.5, -13.4, 10, { size: 32, weight: 600, colorKey: 'note', letter: 2, w: 1024 });
    E.OFFLINE_SLOTS.forEach(([x, z]) => lineLoop([[x - 2.6, z - 1.3], [x + 2.6, z - 1.3], [x + 2.6, z + 1.3], [x - 2.6, z + 1.3], [x - 2.6, z - 1.3]], tm('zoneEdge', {}, THREE.LineBasicMaterial), 0.016));
    // body buffer stands
    const stand = tm('steelDark', { roughness: 0.6 });
    E.BODY_BUFFER.forEach(([x, z]) => { [-1.4, 1.4].forEach((dx) => [-0.55, 0.55].forEach((dz) => box(0.16, 0.5, 0.16, stand, x + dx, 0.25, z + dz))); lineLoop([[x - 2.7, z - 1.6], [x + 2.7, z - 1.6], [x + 2.7, z + 1.6], [x - 2.7, z + 1.6], [x - 2.7, z - 1.6]], tm('zoneEdge', {}, THREE.LineBasicMaterial), 0.016); });
  }

  /* Overhead high-bay lighting pooled on the working areas (dark theme only). One additive
     floor texture; the lines glow softly while the aisles fall off, like a real hall at night. */
  function buildLightPools() {
    const W = 1024, H = 512, X0 = -66, Z0 = -36, SX = 150, SZ = 72;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const u = (x) => ((x - X0) / SX) * W, v = (z) => ((z - Z0) / SZ) * H;
    const pool = (x, z, rx, rz, a) => { g.save(); g.translate(u(x), v(z)); g.scale(rx / rz, 1); const r = (rz / SZ) * H; const gr = g.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, `rgba(205,215,228,${a})`); gr.addColorStop(0.5, `rgba(150,165,185,${a * 0.5})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); g.restore(); };
    for (let x = -40; x <= -8; x += 8) pool(x, 11, 7, 6, 0.2);          // trim bays
    [[1, -9], [7, -18], [13, -9], [7, -10]].forEach(([x, z]) => pool(x, z, 8, 8, 0.17)); // chassis U
    for (let x = 18; x <= 56; x += 8) pool(x, 11.5, 7, 6, 0.2);         // final bays
    pool(-48, 11, 8, 8, 0.1); pool(-22, -7, 10, 7, 0.06);
    const tex = new THREE.CanvasTexture(c);
    pools = new THREE.Mesh(new THREE.PlaneGeometry(SX, SZ), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: T.pools, blending: THREE.AdditiveBlending, depthWrite: false }));
    pools.rotation.x = -Math.PI / 2; pools.position.set(X0 + SX / 2, 0.011, Z0 + SZ / 2); pools.renderOrder = 1; pools.visible = T.pools > 0; scene.add(pools);
  }

  /* MG branding painted on the open floor north of the Final line (x 33–53, z −22…−2):
     the official badge as a neutral watermark, faded like real floor paint. Fades further on zoom-in. */
  function buildFloorBadge() {
    // painted as a neutral watermark (design system: red on the floor means an alarm, never decoration)
    const tex = new THREE.TextureLoader().load(MG_FLOOR_LOGO, (t) => {
      const img = t.image, cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      const cx = cv.getContext('2d'); cx.filter = 'grayscale(1) brightness(1.15)'; cx.drawImage(img, 0, 0);
      t.image = cv; t.needsUpdate = true;
    });
    tex.anisotropy = 8;
    floorBadge = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), /* smaller than the lines beside it (audit T5) */ new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: T.badge, depthWrite: false }));
    floorBadge.rotation.x = -Math.PI / 2; floorBadge.position.set(43, 0.013, -12); floorBadge.renderOrder = 1; scene.add(floorBadge);
    floorText('MG MOTORS · GENERAL ASSEMBLY', 33, -0.6, 20, { size: 46, weight: 600, colorKey: 'textDim', letter: 14, w: 1280 });
  }

  /* Bolt & Volt mark on the floor, top-left corner of the grid. The official logo is used as is;
     in the light theme only its white lettering is re-inked dark so it stays legible. */
  function buildBvBadge() {
    const W = 1280, H = 244, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true });
    const img = new Image(); const tex = new THREE.CanvasTexture(c); tex.anisotropy = 8;
    const draw = () => {
      g.clearRect(0, 0, W, H); if (!img.complete || !img.naturalWidth) return;
      g.drawImage(img, 0, 0, W, H);
      if (themeName !== 'dark') {
        const d = g.getImageData(0, 0, W, H), p = d.data;
        for (let i = 0; i < p.length; i += 4) { const mn = Math.min(p[i], p[i + 1], p[i + 2]); if (mn > 150 && Math.max(p[i], p[i + 1], p[i + 2]) - mn < 40) { p[i] = 0x1a; p[i + 1] = 0x1f; p[i + 2] = 0x25; } }
        g.putImageData(d, 0, 0);
      }
      tex.needsUpdate = true;
    };
    img.onload = draw; img.src = BV_FULL;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(14, 14 * H / W), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(-55.5, 0.014, -29); m.renderOrder = 1; scene.add(m);
    bvRedraw = draw;
  }
  let bvRedraw = null;

  /* Back-wall signage: a slim lit sign board hung on the north column line. */
  function buildSignage() {
    const W = 1024, Hc = 128, BW = 24, c = document.createElement('canvas'); c.width = W; c.height = Hc; const g = c.getContext('2d');
    const draw = () => {
      g.clearRect(0, 0, W, Hc); g.fillStyle = themeName === 'dark' ? '#10151b' : '#f4f5f6'; g.fillRect(0, 0, W, Hc);
      g.fillStyle = '#cc1f26'; g.fillRect(0, 118, W, 10);
      g.font = '700 58px "Barlow", sans-serif'; g.textBaseline = 'middle'; g.fillStyle = themeName === 'dark' ? '#e9edf1' : '#14181c';
      if ('letterSpacing' in g) g.letterSpacing = '12px';
      const label = 'GENERAL ASSEMBLY', logo = 92, gap = 36, tw = g.measureText(label).width - 12;
      const x0 = Math.round((W - (logo + gap + tw)) / 2);
      if (signLogo.complete) g.drawImage(signLogo, x0, 13, logo, logo);
      g.fillText(label, x0 + logo + gap, 62);
      signTex.needsUpdate = true;
    };
    const signLogo = new Image(); const signTex = new THREE.CanvasTexture(c); signTex.anisotropy = 8;
    signLogo.onload = draw; signLogo.src = MG_FLOOR_LOGO;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(BW, 3), new THREE.MeshBasicMaterial({ map: signTex }));
    board.position.set(9, 8.2, -30.6); scene.add(board); // centred between the x=0 and x=18 columns, over the chassis loop
    box(BW + 0.6, 3.4, 0.2, tm('column'), 9, 8.2, -30.8);
    signRedraw = draw; draw();
    if (document.fonts) document.fonts.ready.then(draw);
  }
  let signRedraw = null;

  function buildEquipment() {
    const eq = tm('equip', { metalness: 0.4, roughness: 0.5 }), acc = tm('equipAccent', { metalness: 0.2, roughness: 0.4, emissive: 0x000000 });
    // Cockpit manipulator at TL3 (function assumed)
    box(0.3, 4.4, 0.3, eq, -24, 2.2, 6.4); box(0.24, 0.24, 5.2, eq, -24, 4.3, 8.8); box(4.2, 0.2, 0.2, eq, -26, 4.3, 11); box(0.08, 1.6, 0.08, eq, -27.5, 3.4, 11); box(0.7, 0.2, 0.5, acc, -27.5, 2.55, 11);
    floorText('COCKPIT MANIPULATOR', -26.6, 5.2, 4.6, { size: 34, weight: 600, colorKey: 'textDim', letter: 2 });
    // Battery manipulator at TL5 (from drawing: "added for use in ZS32 HEV")
    box(0.36, 4.6, 0.36, acc, -15, 2.3, 6.2); box(0.26, 0.26, 4.9, acc, -15, 4.5, 8.6); box(0.1, 1.5, 0.1, eq, -15, 3.7, 10.8); box(1.1, 0.16, 0.8, acc, -15, 2.9, 10.8);
    floorText('BATTERY MANIPULATOR · ZS32 HEV', -18.2, 5.2, 6.4, { size: 34, weight: 600, colorKey: 'textDim', letter: 2, w: 768 });
    // Glazing aid at TL4 (south side; function assumed)
    cyl(0.5, 0.9, eq, -21, 0.45, 15.6); box(0.18, 0.18, 2.6, eq, -21, 1.2, 14.4);
    // Engine/transmission scanner at CL2 (from drawing)
    // Powertrain sub-assembly area between chassis columns (hatched on drawing; use assumed)
    const hatch = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.strokeStyle = 'rgba(128,140,152,.45)'; g.lineWidth = 3; for (let i = -64; i < 128; i += 14) { g.beginPath(); g.moveTo(i, 64); g.lineTo(i + 64, 0); g.stroke(); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 5); return t; })();
    const sub = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 9.6), new THREE.MeshBasicMaterial({ map: hatch, transparent: true, opacity: 0.45, depthWrite: false })); sub.rotation.x = -Math.PI / 2; sub.position.set(7, 0.02, -10.6); scene.add(sub);
    floorText('SUB-ASSEMBLY · PARTS STAGING', 4.3, -4.4, 5.4, { size: 34, weight: 600, colorKey: 'textDim', letter: 2, w: 768 });
    const eng = tm('steelDark', { metalness: 0.5, roughness: 0.5 });
    buildSubAssembly(eq, acc, eng);
    // Axle sub-assembly carts on the right column (drawing: boxed X marks)
    [[16.2, -12.2], [16.2, -8.6]].forEach(([x, z]) => { box(1.4, 0.4, 2.2, eq, x, 0.35, z); box(0.14, 0.14, 1.9, eng, x, 0.62, z); [-0.6, 0.6].forEach((d) => cyl(0.17, 0.06, eng, x, 0.62, z + d * 1.4)); });
    // Lift assist jib over FL4 (cyan circle on drawing; use assumed)
    box(0.34, 5.2, 0.34, eq, 36, 2.6, 6.6); box(0.22, 0.22, 5.4, eq, 36, 5.1, 9.2); box(0.1, 1.8, 0.1, eq, 36.5, 4.2, 11.4); box(0.9, 0.14, 0.5, acc, 36.5, 3.2, 11.4);
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.6, 4.66, 4, 1, Math.PI / 4), tm('equipAccent', { transparent: true, opacity: 0.35, depthWrite: false }, THREE.MeshBasicMaterial)); ring.rotation.x = -Math.PI / 2; ring.position.set(36, 0.02, 9.5); scene.add(ring);
    floorText('LIFT ASSIST', 33, 4.2, 3.6, { size: 34, weight: 600, colorKey: 'textDim', letter: 2 });
    // Fluid fill rig over FL5 (assumed): boom with fill guns
    box(0.3, 5, 0.3, eq, 42, 2.5, 6.4); box(0.2, 0.2, 4.6, eq, 42, 4.9, 8.6);
    [[0xd9a21b, -0.5], [0xe0679a, 0], [0x3d8fe0, 0.5]].forEach(([c, dx]) => { box(0.06, 2.6, 0.06, new THREE.MeshStandardMaterial({ color: c }), 42 + dx, 3.6, 10.9); box(0.2, 0.3, 0.2, acc, 42 + dx, 2.25, 10.9); });
    floorText('FLUID FILL', 39.6, 4.2, 3.4, { size: 34, weight: 600, colorKey: 'textDim', letter: 2 });
    // drawing annotations, written on the floor like line markings
    floorText('BUFFER · NO TEAM', 15.6, -14.6, 3.6, { size: 30, weight: 600, colorKey: 'textDim', letter: 2 });
    floorText('EMPTY HANGER RETURN · FL1 → TL6', -1, 15.4, 7.6, { size: 30, weight: 600, colorKey: 'textDim', letter: 2, w: 1024 });
    floorText('NEW STATION · HIGHER JPH', 3.2, -24.2, 6.2, { size: 30, weight: 600, colorKey: 'warnText', letter: 2, w: 768 });
  }

  /* Chassis sub-assembly area inside the U (x 4.2–9.8, z −15.4…−5.8): parts staged
     for CL1–CL4 — engines + transmissions on stands, suspension corners, axles,
     exhaust, fuel tanks, bins and a tugger cart. Decorative; reads as real depth. */
  function buildSubAssembly(eq, acc, eng) {
    const dark = new THREE.MeshStandardMaterial({ color: 0x2e3338, metalness: 0.6, roughness: 0.45 });
    const alloy = new THREE.MeshStandardMaterial({ color: 0x8d959c, metalness: 0.85, roughness: 0.3 });
    const red = new THREE.MeshStandardMaterial({ color: 0xa8222b, roughness: 0.5 });
    const orange = new THREE.MeshStandardMaterial({ color: 0xd8701c, roughness: 0.6 });
    const spring = new THREE.MeshStandardMaterial({ color: 0x3f6fb0, metalness: 0.4, roughness: 0.4 });
    const tote = tm('equipAccent', { roughness: 0.6 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x151719, roughness: 0.9 });
    const g = new THREE.Group(); scene.add(g);
    const B = (w, h, d, m, x, y, z, ry = 0) => { const b = box(w, h, d, m, x, y, z, g); b.rotation.y = ry; return b; };
    const C = (r, h, m, x, y, z, rx = 0, rz = 0, seg = 16) => { const c = cyl(r, h, m, x, y, z, g, seg); c.rotation.x = rx; c.rotation.z = rz; return c; };
    // engine + transmission on a rolling stand
    const engineStand = (x, z, ry = 0) => {
      const s = new THREE.Group(); s.position.set(x, 0, z); s.rotation.y = ry; g.add(s);
      const b = (w, h, d, m, px, py, pz) => box(w, h, d, m, px, py, pz, s);
      b(1.5, 0.08, 1.0, eq, 0, 0.42, 0); [-0.65, 0.65].forEach((px) => [-0.4, 0.4].forEach((pz) => { b(0.06, 0.38, 0.06, eq, px, 0.21, pz); const w = cyl(0.06, 0.05, rubber, px, 0.06, pz, s, 10); w.rotation.x = Math.PI / 2; }));
      b(0.62, 0.46, 0.52, eng, -0.2, 0.7, 0);                     // block
      b(0.66, 0.1, 0.56, alloy, -0.2, 0.98, 0);                   // cam cover
      b(0.5, 0.08, 0.12, red, -0.2, 1.06, 0.12);                  // coil pack
      [-0.36, -0.2, -0.04].forEach((px) => cyl(0.03, 0.18, dark, px, 0.86, 0.3, s, 8).rotation.x = Math.PI / 2); // intake runners
      const tr = cyl(0.22, 0.5, dark, 0.32, 0.68, 0, s, 18); tr.rotation.z = Math.PI / 2; // transmission bell
      b(0.24, 0.26, 0.3, dark, 0.62, 0.66, 0);                    // gearbox tail
      const pul = cyl(0.1, 0.04, alloy, -0.53, 0.62, 0.1, s, 16); pul.rotation.z = Math.PI / 2;
    };
    engineStand(5.4, -13.6); engineStand(5.4, -11.2); engineStand(5.4, -8.8, 0);
    // suspension corners: strut + spring + knuckle + brake disc
    const corner = (x, z) => {
      C(0.05, 0.9, alloy, x, 0.95, z); C(0.14, 0.42, spring, x, 0.95, z, 0, 0, 12);
      B(0.18, 0.22, 0.12, dark, x, 0.42, z); C(0.18, 0.04, alloy, x, 0.42, z + 0.1, Math.PI / 2, 0, 20); B(0.08, 0.1, 0.06, red, x + 0.12, 0.48, z + 0.12);
    };
    B(1.4, 0.08, 0.6, eq, 8.4, 0.2, -14.2); [7.9, 8.4, 8.9].forEach((x) => corner(x, -14.2));
    // axle rack: two rear axles / subframes
    B(1.6, 0.06, 1.1, eq, 8.4, 0.5, -12.0); [-0.6, 0.6].forEach((dx) => [-0.45, 0.45].forEach((dz) => B(0.06, 0.5, 0.06, eq, 8.4 + dx, 0.25, -12 + dz)));
    [-12.25, -11.75].forEach((z) => { const a = C(0.06, 1.5, dark, 8.4, 0.62, z, 0, Math.PI / 2, 10); C(0.15, 0.03, alloy, 7.65, 0.62, z, 0, Math.PI / 2, 18); C(0.15, 0.03, alloy, 9.15, 0.62, z, 0, Math.PI / 2, 18); });
    B(1.1, 0.12, 0.5, dark, 8.4, 0.74, -12);                      // subframe cross-member
    // exhaust rack
    B(1.6, 0.05, 0.5, eq, 8.4, 1.0, -9.9); [-0.75, 0.75].forEach((dx) => B(0.05, 1.0, 0.05, eq, 8.4 + dx, 0.5, -9.9));
    [-10.05, -9.75].forEach((z) => { C(0.04, 1.5, alloy, 8.4, 1.07, z, 0, Math.PI / 2, 10); B(0.42, 0.14, 0.22, alloy, 9.0, 1.1, z); });
    // fuel tank cart
    B(1.3, 0.06, 0.9, eq, 8.4, 0.34, -7.4); [-0.55, 0.55].forEach((dx) => [-0.35, 0.35].forEach((dz) => { const w = C(0.07, 0.05, rubber, 8.4 + dx, 0.07, -7.4 + dz, Math.PI / 2, 0, 10); B(0.04, 0.26, 0.04, eq, 8.4 + dx, 0.2, -7.4 + dz); }));
    B(1.0, 0.22, 0.7, dark, 8.4, 0.5, -7.4); B(0.9, 0.18, 0.6, dark, 8.4, 0.72, -7.4);
    // parts bins (blue totes) and a tugger train along the inner aisle
    [[4.9, -6.4], [5.5, -6.4], [6.1, -6.4]].forEach(([x, z], i) => { B(0.5, 0.28, 0.4, tote, x, 0.14 + 0.0 * i, z); B(0.5, 0.28, 0.4, tote, x, 0.43, z); });
    B(0.7, 0.5, 0.5, orange, 7.0, 0.3, -5.3); B(0.4, 0.2, 0.36, dark, 7.0, 0.65, -5.3);              // tugger
    [7.9, 8.8].forEach((x) => { B(0.8, 0.06, 0.55, eq, x, 0.26, -5.3); B(0.6, 0.3, 0.4, tote, x, 0.44, -5.3); });
  }
  function buildRails() {
    const railMat = tm('rail', { metalness: 0.6, roughness: 0.45 });
    const supMat = tm('steelDark', { metalness: 0.4, roughness: 0.6 });
    const addPath = (path, y, mat, w = 0.22, supEvery = 7) => {
      let acc = 0;
      for (let i = 1; i < path.pts.length; i++) {
        const [x0, z0] = path.pts[i - 1], [x1, z1] = path.pts[i], len = Math.hypot(x1 - x0, z1 - z0);
        const m = box(len + 0.05, 0.24, w, mat, (x0 + x1) / 2, y + 0.3, (z0 + z1) / 2); m.rotation.y = Math.atan2(-(z1 - z0), x1 - x0); m.castShadow = true;
        acc += len; if (acc >= supEvery) { acc = 0; box(0.09, 9 - y - 0.4, 0.09, supMat, x1, y + 0.4 + (9 - y - 0.4) / 2, z1); }
      }
    };
    ['TL6>CL1', 'CL1>CL2', 'CL2>CL3', 'CL3>BUF', 'BUF>CL4', 'CL4>FL1'].forEach((k) => addPath(EDGES[k], RH, railMat));
    Object.values(E.LOOP_GEOM).forEach((g) => { addPath(g.ret(0), E.RETURN_Y, supMat, 0.16, 9); addPath(g.feed, E.RETURN_Y, supMat, 0.16, 9); });
    // vertical lift/drop sections between levels
    [[-9, 11], [18, 11.5]].forEach(([x, z]) => { box(0.12, E.RETURN_Y - RH + 0.5, 0.12, supMat, x + 1.2, RH + (E.RETURN_Y - RH) / 2 + 0.3, z - 0.9); box(0.12, E.RETURN_Y - RH + 0.5, 0.12, supMat, x - 1.2, RH + (E.RETURN_Y - RH) / 2 + 0.3, z - 0.9); });
  }

  function buildPads() {
    STATIONS.forEach((id) => {
      const P = POS[id]; const [W, D] = padSize(id);
      const g = new THREE.Group(); g.position.set(P.x, P.loop === 'FINAL' ? 0.31 : P.loop === 'TRIM' ? 0.19 : 0, P.z); g.rotation.y = P.yaw; scene.add(g);
      const fill = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      fill.rotation.x = -Math.PI / 2; fill.position.y = 0.012; fill.userData = { kind: 'pos', id }; g.add(fill); pickables.push(fill);
      const tint = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.1, D - 0.1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      tint.rotation.x = -Math.PI / 2; tint.position.y = 0.016; g.add(tint);
      // corner marks only (quiet structure); full outline on hover/selection
      const c = [], L = 0.7;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) => { const x = sx * W / 2, z = sz * D / 2; c.push(x, 0.03, z, x - sx * L, 0.03, z, x, 0.03, z, x, 0.03, z - sz * L); });
      const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(c, 3));
      const corners = new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: T.padEdge })); g.add(corners);
      const og = new THREE.BufferGeometry().setFromPoints([[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2], [-W / 2, -D / 2]].map(([x, z]) => new THREE.Vector3(x, 0.032, z)));
      const outline = new THREE.Line(og, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })); g.add(outline);
      // timing bar along the pad's long side
      const barW = W - 0.8, barZ = D / 2 - 0.35;
      const barBg = new THREE.Mesh(new THREE.PlaneGeometry(barW, 0.16), new THREE.MeshBasicMaterial({ color: T.padEdge, transparent: true, opacity: 0.45 })); barBg.rotation.x = -Math.PI / 2; barBg.position.set(0, 0.035, barZ); g.add(barBg);
      const fg = new THREE.PlaneGeometry(1, 0.16); fg.translate(0.5, 0, 0);
      const barFill = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: T.tone.text })); barFill.rotation.x = -Math.PI / 2; barFill.position.set(-barW / 2, 0.04, barZ); g.add(barFill);
      if (P.kind !== 'work') { barBg.visible = false; }
      const fw = W / 2 + 0.9, fd = D / 2 + 0.9, th = 0.12, fr = new THREE.Shape([new THREE.Vector2(-fw, -fd), new THREE.Vector2(fw, -fd), new THREE.Vector2(fw, fd), new THREE.Vector2(-fw, fd)]);
      fr.holes.push(new THREE.Path([new THREE.Vector2(-fw + th, -fd + th), new THREE.Vector2(-fw + th, fd - th), new THREE.Vector2(fw - th, fd - th), new THREE.Vector2(fw - th, -fd + th)]));
      const ring = new THREE.Mesh(new THREE.ShapeGeometry(fr), new THREE.MeshBasicMaterial({ color: T.tone.crit, transparent: true, opacity: 0, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.userData.base = [1, 1]; g.add(ring);
      // ID painted on the floor, kept upright for the default camera
      const lx = P.yaw === 0 ? P.x - W / 2 : P.x + D / 2 + 0.5, lz = P.yaw === 0 ? P.z + D / 2 + 0.75 : P.z + W / 2 - 0.3;
      const lbl = floorText(id, lx, lz, id.length > 4 ? 3.2 : 2.6, { size: 64, weight: 600, mono: true, colorKey: 'text', w: 320, h: 80 });
      pads[id] = { g, fill, tint, corners, outline, barBg, barFill, barW, ring, lbl };
    });
  }

  function buildScanners() {
    const mk = (id, x, z, tx, tz, label, lx, lz) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
      const mat = tm('equip', { metalness: 0.4, roughness: 0.5 });
      const post = box(0.14, 2.1, 0.14, mat, 0, 1.05, 0, g); const head = box(0.42, 0.3, 0.3, tm('steelDark'), 0, 2.15, 0, g);
      const len = Math.hypot(tx - x, tz - z);
      const beam = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.04), new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
      beam.position.set((x + tx) / 2, 1.3, (z + tz) / 2); beam.rotation.y = Math.atan2(-(tz - z), tx - x); scene.add(beam);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.8, 1.4), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(0, 1.4, 0); hit.userData = { kind: 'scanner', id }; g.add(hit); pickables.push(hit);
      [post, head].forEach((m) => { m.userData = { kind: 'scanner', id }; pickables.push(m); });
      floorText(label, lx, lz, 4.8, { size: 36, weight: 600, colorKey: 'note', letter: 2, w: 640 });
      scanners[id] = { beam, flashT: 0, flashColor: 0xff3b3b };
    };
    mk('ENTRY', -36, 7.6, -39, 10.4, 'SCANNER 1 · LINE-IN', -38.6, 6.6);
    mk('OFFLINE', -6.2, 7.6, -9, 10.4, 'OFFLINE SCANNER · END OF TRIM', -11.2, 6.6);
    mk('EOL', 56.8, 7.8, 54, 10.6, 'PHOTO-EYE · LINE-OFF', 52.6, 6.6);
    // Final line offline scans: two wireless handhelds in charging docks (proposal: FL1–FL3 and FL4–FL7)
    const dock = (id, x, z, label) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
      const body = box(0.5, 1.05, 0.34, tm('equip', { metalness: 0.4, roughness: 0.5 }), 0, 0.52, 0, g); const gun = box(0.16, 0.34, 0.12, tm('steelDark'), 0, 1.22, 0, g);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.02), new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.4 })); lamp.position.set(0, 0.9, 0.18); g.add(lamp);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 1.2), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(0, 1, 0); hit.userData = { kind: 'scanner', id }; g.add(hit); pickables.push(hit);
      [body, gun].forEach((m) => { m.userData = { kind: 'scanner', id }; pickables.push(m); });
      floorText(label, x - 2.6, z - 1.0, 4.4, { size: 34, weight: 600, colorKey: 'note', letter: 2, w: 640 });
      scanners[id] = { beam: lamp, flashT: 0, flashColor: 0xff3b3b, base: 0.4 };
    };
    dock('HH1', 26.8, 7.4, 'HANDHELD 1 · FL1–FL3');
    dock('HH2', 44.8, 7.4, 'HANDHELD 2 · FL4–FL7');
  }

  /* Andon stack light per work station: green / amber / red tiers plus a call
     lamp on top (violet = supervisor, blue = maintenance). Sound rings on the
     floor pulse while the station's buzzer is on. */
  const ringGeo = new THREE.RingGeometry(0.92, 1, 48);
  function buildBeacons() {
    STATIONS.forEach((id) => {
      const P = POS[id]; if (P.kind !== 'work') return;
      const [W, D] = padSize(id), g = pads[id].g;
      const pole = new THREE.Group(); pole.position.set(W / 2 + 0.55, 0, -D / 2 + 0.4); g.add(pole);
      box(0.07, 2.2, 0.07, tm('steelDark'), 0, 1.1, 0, pole);
      const tier = (y, c) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.2, 14), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.18 })); m.position.y = y; pole.add(m); return m; };
      const green = tier(2.3, 0x2ecc71), amber = tier(2.52, 0xffb020), red = tier(2.74, 0xff3b30), call = tier(2.98, 0xffffff);
      call.scale.set(1.15, 1, 1.15);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
      beacons[id] = { green, amber, red, call, ring, W, D };
    });
  }
  function updateBeacons(S, now) {
    const blink = Math.floor(now / 420) % 2 === 0;
    for (const id of Object.keys(beacons)) {
      const b = beacons[id], an = E.andonState(S, id), live = an.state !== 'idle', active = E.andonActive(S, id);
      b.green.material.opacity = live && an.state === 'normal' ? 0.95 : 0.14;
      b.amber.material.opacity = live && an.state === 'near' ? 0.95 : 0.14;
      b.red.material.opacity = live && an.state === 'over' ? (S.buzzing[id] != null && !blink ? 0.55 : 0.98) : 0.14;
      const calls = active ? E.callsAt(S, id) : [];
      if (calls.length) { const c = calls.length > 1 && blink ? calls[1] : calls[0]; b.call.material.color.setHex(T.tone[c.type === 'SUP' ? 'sup' : 'mnt']); b.call.material.opacity = c.respondedT == null && !blink ? 0.35 : 1; }
      else { b.call.material.color.setHex(0xffffff); b.call.material.opacity = 0.12; }
      b.green.parent.visible = active;
      if (S.buzzing[id] != null) {
        const u = ((now - (b.t0 || (b.t0 = now))) % 1100) / 1100, sc = Math.max(b.W, b.D) * (0.45 + 0.55 * u);
        b.ring.scale.set(sc, sc, 1); b.ring.material.opacity = 0.55 * (1 - u); b.ring.material.color.setHex(T.tone.crit);
      } else { b.ring.material.opacity = 0; b.t0 = 0; }
    }
  }

  /* ── carriers ── */
  const carrierMats = () => ({ steel: tm('steel', { metalness: 0.65, roughness: 0.38 }), dark: tm('steelDark', { metalness: 0.5, roughness: 0.5 }), fault: new THREE.MeshStandardMaterial({ color: 0xa02a2a, emissive: 0x5a0f0f, metalness: 0.4, roughness: 0.5 }) });
  let CM;
  function makeCarrier(c) {
    const g = new THREE.Group(); scene.add(g);
    const parts = [];
    const p = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(unitBox, mat); m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = true; g.add(m); parts.push(m); return m; };
    const o = { g, kind: c.kind, parts, vis: null };
    if (c.kind === 'Hanger') {
      p(1.1, 0.3, 0.46, CM.dark, 0, RH + 0.05, 0); p(0.1, 0.5, 0.1, CM.steel, 0, RH - 0.3, 0); p(4.2, 0.14, 0.2, CM.steel, 0, RH - 0.6, 0);
      [-1.65, 1.65].forEach((x) => p(0.14, 0.12, 2.3, CM.steel, x, RH - 0.6, 0));
      o.arms = []; [-1.65, 1.65].forEach((x) => [-1.1, 1.1].forEach((z) => o.arms.push(p(0.09, 1, 0.09, CM.steel, x, 0, z))));
      o.sills = [-0.86, 0.86].map((z) => p(3.7, 0.08, 0.12, CM.steel, 0, 0, z));
      o.brackets = []; [-1.65, 1.65].forEach((x) => [-1, 1].forEach((s) => o.brackets.push(p(0.08, 0.08, 0.3, CM.steel, x, 0, s * 0.97))));
    } else if (c.kind === 'Skid') {
      [-0.55, 0.55].forEach((z) => p(4.2, 0.12, 0.14, CM.dark, 0, 0.24, z));
      [-1.6, 0, 1.6].forEach((x) => p(0.14, 0.1, 1.24, CM.dark, x, 0.24, 0));
      [-1.45, 1.45].forEach((x) => [-0.55, 0.55].forEach((z) => p(0.12, 0.34, 0.12, CM.steel, x, 0.45, z)));
    } else {
      [-1.45, 1.45].forEach((x) => [-0.6, 0.6].forEach((z) => p(0.12, 0.36, 0.12, CM.steel, x, 0.48, z)));
    }
    carrierObjs[c.id] = o; return o;
  }
  function setHangerDrop(o, bodyY) {
    const top = RH - 0.6, cy = bodyY - 0.04, len = Math.max(0.2, top - cy);
    o.arms.forEach((a) => { a.scale.y = len; a.position.y = cy + len / 2; });
    o.sills.forEach((s) => (s.position.y = cy)); o.brackets.forEach((b) => (b.position.y = cy));
  }

  /* ── vehicle model: shell + ~20 installable components ── */
  const carGeo = {};
  function deform(geo, sx, sy, sz) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const th = E.clamp((y - 0.72) / 0.58, 0, 1); z *= 1 - 0.13 * th;          // tumblehome
      const ax = Math.abs(x); if (ax > 1.65) z *= 1 - 0.12 * Math.pow((ax - 1.65) / 0.7, 2); // rounded nose and tail
      p.setXYZ(i, x * sx, y * sy, z * sz);
    }
    geo.computeVertexNormals(); return geo;
  }
  const V2 = (a) => a.map(([x, y]) => new THREE.Vector2(x, y));
  const FRONT_AP = [[0.86, 0.14], [0.86, 0.68], [0.5, 1.12], [-0.08, 1.19], [-0.08, 0.14]];
  const REAR_AP = [[-0.25, 0.14], [-0.25, 1.19], [-1.15, 1.17], [-1.32, 1.02], [-1.32, 0.58], [-0.86, 0.5], [-0.86, 0.14]];
  function buildCarGeometry(kind) {
    // HS: longer, lower stance · ZS: shorter, taller compact SUV
    const sx = kind === 'S' ? 0.92 : 1.03, sy = kind === 'S' ? 1.04 : 0.95, sz = kind === 'S' ? 0.96 : 1.0;
    const s = new THREE.Shape();
    s.moveTo(2.02, 0); s.lineTo(2.08, 0.32); s.lineTo(2.12, 0.55); s.lineTo(1.25, 0.7); s.lineTo(0.62, 1.2); s.lineTo(-1.3, 1.3); s.lineTo(-1.98, 1.2);
    s.lineTo(-2.08, 0.72); s.lineTo(-2.04, 0.32); s.lineTo(-1.95, 0); s.lineTo(-1.79, 0); s.absarc(-1.35, 0, 0.44, Math.PI, 0, true); s.lineTo(0.91, 0); s.absarc(1.35, 0, 0.44, Math.PI, 0, true); s.lineTo(2.02, 0);
    s.holes.push(new THREE.Path(V2(FRONT_AP)), new THREE.Path(V2(REAR_AP)));
    const shell = new THREE.ExtrudeGeometry(s, { depth: 1.84, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.05, bevelSegments: 2, curveSegments: 12 }); shell.translate(0, 0, -0.92);
    deform(shell, sx, sy, sz);
    const quad = (pts) => { const g = new THREE.BufferGeometry(); const v = new Float32Array([...pts[0], ...pts[1], ...pts[2], ...pts[0], ...pts[2], ...pts[3]]); g.setAttribute('position', new THREE.BufferAttribute(v, 3)); g.computeVertexNormals(); return g; };
    const W = (y) => (0.94 * (1 - 0.13 * E.clamp((y - 0.72) / 0.58, 0, 1))) * sz;
    const wsGeo = quad([[1.25 * sx + 0.012, 0.7 * sy + 0.012, -W(0.7) + 0.06], [1.25 * sx + 0.012, 0.7 * sy + 0.012, W(0.7) - 0.06], [0.62 * sx + 0.012, 1.2 * sy + 0.012, W(1.2) - 0.06], [0.62 * sx + 0.012, 1.2 * sy + 0.012, -W(1.2) + 0.06]]);
    const rgGeo = quad([[-2.06 * sx - 0.012, 0.84 * sy, W(0.84) - 0.1], [-2.06 * sx - 0.012, 0.84 * sy, -W(0.84) + 0.1], [-1.98 * sx - 0.012, 1.19 * sy, -W(1.19) + 0.1], [-1.98 * sx - 0.012, 1.19 * sy, W(1.19) - 0.1]]);
    const door = (pts, d) => { const sh = new THREE.Shape(V2(pts)); const gg = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.015, bevelSegments: 1 }); gg.translate(0, 0, -d / 2); gg.scale(sx, sy, 1); return gg; };
    const frontLow = door([[0.88, 0.12], [0.88, 0.72], [-0.07, 0.72], [-0.07, 0.12]], 0.06), frontWin = door([[0.86, 0.72], [0.5, 1.13], [-0.07, 1.2], [-0.07, 0.72]], 0.02);
    const rearLow = door([[-0.26, 0.12], [-0.26, 0.72], [-1.34, 0.72], [-1.34, 0.58], [-0.85, 0.5], [-0.85, 0.12]], 0.06), rearWin = door([[-0.26, 0.72], [-0.26, 1.2], [-1.15, 1.18], [-1.33, 1.02], [-1.33, 0.72]], 0.02);
    const bumpF = (() => { const sh = new THREE.Shape(V2([[2.0, 0.02], [2.3, 0.06], [2.36, 0.3], [2.3, 0.56], [2.12, 0.6], [2.0, 0.56]])); const gg = new THREE.ExtrudeGeometry(sh, { depth: 1.8, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.05, bevelSegments: 2 }); gg.translate(0, 0, -0.9); return deform(gg, sx, sy, sz); })();
    const bumpR = (() => { const sh = new THREE.Shape(V2([[-1.94, 0.02], [-1.94, 0.6], [-2.04, 0.66], [-2.24, 0.62], [-2.3, 0.3], [-2.26, 0.06]])); const gg = new THREE.ExtrudeGeometry(sh, { depth: 1.8, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.05, bevelSegments: 2 }); gg.translate(0, 0, -0.9); return deform(gg, sx, sy, sz); })();
    const tireProfile = []; for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + Math.PI * (i / 12); tireProfile.push(new THREE.Vector2(0.27 + 0.09 * Math.cos(a), 0.11 * Math.sin(a))); }
    const tire = new THREE.LatheGeometry(tireProfile, 28); tire.rotateX(Math.PI / 2);
    carGeo[kind] = { shell, wsGeo, rgGeo, frontLow, frontWin, rearLow, rearWin, bumpF, bumpR, tire, sx, sy, sz, edges: new THREE.EdgesGeometry(shell, 28) };
  }
  let PM; // shared part materials
  function scriptMat(txt) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 40; const g = c.getContext('2d');
    g.font = '700 30px "Barlow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#d7dce1'; g.fillText(txt, 64, 21);
    return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
  }
  function partMats() {
    return {
      glass: new THREE.MeshStandardMaterial({ color: 0x0f1820, metalness: 0.6, roughness: 0.08, transparent: true, opacity: 0.88 }),
      aperture: tm('aperture', { roughness: 1 }),
      under: new THREE.MeshStandardMaterial({ color: 0x2a2e33, metalness: 0.5, roughness: 0.6 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x8c949b, metalness: 0.8, roughness: 0.35 }),
      engine: new THREE.MeshStandardMaterial({ color: 0x3b4148, metalness: 0.7, roughness: 0.45 }),
      harness: new THREE.MeshStandardMaterial({ color: 0xe07a1f, roughness: 0.6 }),
      deadener: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 1 }),
      trim: new THREE.MeshStandardMaterial({ color: 0x2b2f34, roughness: 0.85 }),
      headliner: new THREE.MeshStandardMaterial({ color: 0x7d7a74, roughness: 0.95 }),
      seat: new THREE.MeshStandardMaterial({ color: 0x232629, roughness: 0.8 }),
      screen: new THREE.MeshStandardMaterial({ color: 0x0a1018, emissive: 0x1d4f8a, emissiveIntensity: 0.6 }),
      battery: new THREE.MeshStandardMaterial({ color: 0x3a3f46, metalness: 0.5, roughness: 0.5 }),
      hv: new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0x3a1500 }),
      tire: new THREE.MeshStandardMaterial({ color: 0x16181a, roughness: 0.9 }),
      rim: new THREE.MeshStandardMaterial({ color: 0xb4bbc1, metalness: 0.85, roughness: 0.28 }),
      disc: new THREE.MeshStandardMaterial({ color: 0x8b9298, metalness: 0.75, roughness: 0.38 }),
      caliper: new THREE.MeshStandardMaterial({ color: 0xb2232b, roughness: 0.5 }),
      lampF: new THREE.MeshStandardMaterial({ color: 0xe8eef3, emissive: 0x6d7a86, emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.2 }),
      lampR: new THREE.MeshStandardMaterial({ color: 0x8a121b, emissive: 0x5a0710, emissiveIntensity: 0.9 }),
      grille: new THREE.MeshStandardMaterial({ color: 0x111316, metalness: 0.5, roughness: 0.4 }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 1, roughness: 0.15 }),
      install: new THREE.MeshStandardMaterial({ color: T.install, emissive: T.install, emissiveIntensity: 0.55, roughness: 0.4 }),
      xray: new THREE.MeshBasicMaterial({ color: T.xray, transparent: true, opacity: 0.1, depthWrite: false }),
      edge: new THREE.LineBasicMaterial({ color: T.xray, transparent: true, opacity: 0.55 }),
      sweep: new THREE.MeshBasicMaterial({ color: T.install, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
      mgBadge: new THREE.MeshBasicMaterial({ map: new THREE.TextureLoader().load(MG_FLOOR_LOGO), transparent: true, depthWrite: false }),
      scriptHS: scriptMat('HS'), scriptZS: scriptMat('ZS'),
    };
  }
  function tube(points, r, mat, parent) { const c = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z))); const m = new THREE.Mesh(new THREE.TubeGeometry(c, 24, r, 6), mat); parent.add(m); return m; }
  function makeCar(v, isBuffer = false) {
    const kind = v.variant.body === 'S' ? 'S' : 'L'; if (!carGeo[kind]) buildCarGeometry(kind);
    const G = carGeo[kind], sx = G.sx, sy = G.sy;
    const root = new THREE.Group(); scene.add(root);
    const paint = new THREE.MeshStandardMaterial({ color: new THREE.Color(v.paint.hex), metalness: 0.3, roughness: 0.42 });
    // ISA-101: in the overview a car's paint is muted towards grey so colour still means a problem; the real colour
    // shows on the selected or hovered car (audit D2)
    paint.userData.full = paint.color.clone();
    { const hsl = {}; paint.color.getHSL(hsl); paint.userData.muted = new THREE.Color().setHSL(hsl.h, hsl.s * 0.12, 0.3 + hsl.l * 0.45); }
    paint.color.copy(paint.userData.muted);
    const id = isBuffer ? null : v.id;
    const pick = (m) => { if (id) { m.userData = { kind: 'veh', id }; pickables.push(m); } return m; };
    const shell = pick(new THREE.Mesh(G.shell, paint)); shell.castShadow = true; shell.receiveShadow = true; root.add(shell);
    const edges = new THREE.LineSegments(G.edges, PM.edge); edges.visible = false; root.add(edges);
    // fixed body details: crash beams, windscreen aperture
    const beams = new THREE.Group(); root.add(beams); box(0.08, 0.12, 1.5, PM.under, 2.04 * sx, 0.35, 0, beams); box(0.08, 0.12, 1.5, PM.under, -1.97 * sx, 0.35, 0, beams);
    const apW = new THREE.Mesh(G.wsGeo, PM.aperture); root.add(apW); const apR = new THREE.Mesh(G.rgGeo, PM.aperture); root.add(apR);
    const parts = {}; const P = (k, obj, dir, mat) => { root.add(obj); parts[k] = parts[k] || []; obj.userData.dir = dir; obj.userData.home = obj.position.clone(); obj.traverse((n) => { if (n.isMesh) { n.userData.mat = n.material; n.castShadow = true; } }); parts[k].push(obj); return obj; };
    const grp = () => new THREE.Group();
    // TL1: doors removed / FL2 doors refit
    ['L', 'R'].forEach((side) => {
      const s = side === 'L' ? 1 : -1, d = grp();
      const fl = new THREE.Mesh(G.frontLow, paint), rl = new THREE.Mesh(G.rearLow, paint); fl.position.z = rl.position.z = s * 0.93; d.add(fl, rl);
      [[G.frontWin], [G.rearWin]].forEach(([wg]) => { const pv = grp(); pv.position.set(0, 0.72 * G.sy, s * 0.93); pv.rotation.x = s * 0.2; const w = new THREE.Mesh(wg, PM.glass); w.position.y = -0.72 * G.sy; pv.add(w); d.add(pv); });
      box(0.16, 0.035, 0.03, PM.chrome, 0.3 * sx, 0.62, s * 0.975, d); box(0.16, 0.035, 0.03, PM.chrome, -0.7 * sx, 0.62, s * 0.975, d);
      P('doors', d, [0, 0, s * 1.6]);
    });
    // TL1–TL2: sound deadening + harness
    const dd = grp(); box(2.1 * sx, 0.02, 1.62, PM.deadener, -0.25, 0.145, 0, dd); P('deadener', dd, [0, 0, 1.8]);
    const hn = grp(); [-0.62, 0.62].forEach((z) => tube([[0.82, 0.62, z * 0.9], [0.78, 0.2, z], [-0.3, 0.17, z], [-1.25, 0.18, z]], 0.025, PM.harness, hn)); tube([[0.8, 0.62, -0.6], [0.8, 0.68, 0], [0.8, 0.62, 0.6]], 0.03, PM.harness, hn); P('harness', hn, [0, 0, 1.8]);
    // TL3: cockpit
    const ck = grp(); box(0.34, 0.26, 1.62, PM.trim, 0.7 * sx, 0.74, 0, ck); box(0.06, 0.18, 0.5, PM.screen, 0.55 * sx, 0.86, 0, ck);
    const sw = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 8, 24), PM.trim); sw.position.set(0.42 * sx, 0.84, 0.38); sw.rotation.y = Math.PI / 2; sw.rotation.x = -0.35; ck.add(sw); P('cockpit', ck, [0, 0.2, 1.8]);
    // TL4: headliner + glass
    const hl = grp(); box(1.75 * sx, 0.025, 1.46, PM.headliner, -0.35, 1.16, 0, hl); P('headliner', hl, [0, -0.5, 1.8]);
    const gl = grp(); gl.add(new THREE.Mesh(G.wsGeo, PM.glass), new THREE.Mesh(G.rgGeo, PM.glass));
    [-1, 1].forEach((s) => { const q = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(V2([[-1.4, 0.76], [-1.92, 0.8], [-1.88, 1.1], [-1.42, 1.13]]))), PM.glass); q.position.z = s * 0.84; q.scale.x = sx; q.rotation.x = s * -0.18; gl.add(q); });
    P('glass', gl, [0.8, 0.8, 0]);
    // TL5: HV battery (hybrids) or parcel shelf
    const bt = grp(); box(0.82, 0.18, 1.16, PM.battery, -0.95, 0.24, 0, bt); box(0.84, 0.03, 0.12, PM.hv, -0.95, 0.34, 0.45, bt); P('battery', bt, [0, 0.4, 1.9]);
    const pc = grp(); box(0.5, 0.03, 1.4, PM.trim, -1.6 * sx, 0.78, 0, pc); P('parcel', pc, [0, 0.3, 1.8]);
    // TL6: brake & fuel lines (underbody)
    const ln = grp(); [-0.32, 0.36].forEach((z) => tube([[1.7, -0.02, z * 0.7], [0.6, -0.03, z], [-1.2, -0.03, z], [-1.75, -0.02, z * 0.6]], 0.016, PM.metal, ln)); P('lines', ln, [0, -1.2, 0]);
    // CL1: fuel tank
    const tk = grp(); box(0.72, 0.2, 0.92, PM.under, -1.0, -0.1, -0.1, tk); box(0.7, 0.02, 0.9, PM.metal, -1.0, 0.0, -0.1, tk); P('tank', tk, [0, -1.6, 0]);
    // CL2: engine & transmission
    const pt = grp(); box(0.56, 0.48, 0.62, PM.engine, 1.58 * sx, 0.22, -0.12, pt); box(0.4, 0.36, 0.44, PM.engine, 1.55 * sx, 0.2, 0.42, pt); box(0.5, 0.1, 0.5, PM.metal, 1.58 * sx, 0.5, -0.12, pt); box(1.1, 0.1, 1.3, PM.under, 1.45 * sx, -0.06, 0, pt); P('powertrain', pt, [0, -1.8, 0]);
    // CL3: exhaust
    const ex = grp(); tube([[1.3, -0.04, 0.2], [0.6, -0.08, 0.3], [-1.3, -0.08, 0.32], [-1.85, -0.06, 0.32]], 0.04, PM.metal, ex); box(0.5, 0.16, 0.26, PM.metal, -1.6 * sx, -0.08, 0.32, ex); P('exhaust', ex, [0, -1.5, 0]);
    // CL4: suspension, axles, brakes
    const sp = grp(); [1.35, -1.35].forEach((x) => { box(0.1, 0.1, 1.5, PM.under, x * sx, 0.0, 0, sp); [-1, 1].forEach((s) => { const d = cyl(0.17, 0.035, PM.disc, x * sx, 0, s * 0.74, sp, 20); d.rotation.x = Math.PI / 2; box(0.09, 0.12, 0.06, PM.caliper, x * sx + 0.12, 0.08, s * 0.72, sp); const st = cyl(0.05, 0.5, PM.metal, x * sx, 0.3, s * 0.62, sp, 8); st.rotation.x = s * 0.15; }); }); P('suspension', sp, [0, -1.6, 0]);
    // FL3: seats & carpets
    const st = grp(); box(2.0 * sx, 0.02, 1.6, PM.trim, -0.28, 0.16, 0, st);
    [-0.38, 0.38].forEach((z) => { box(0.48, 0.12, 0.48, PM.seat, 0.12 * sx, 0.3, z, st); const bk = box(0.11, 0.6, 0.46, PM.seat, -0.14 * sx, 0.64, z, st); bk.rotation.z = 0.18; box(0.1, 0.16, 0.26, PM.seat, -0.22 * sx, 1.0, z, st); });
    box(0.5, 0.12, 1.36, PM.seat, -0.88 * sx, 0.3, 0, st); const rb = box(0.11, 0.55, 1.36, PM.seat, -1.15 * sx, 0.62, 0, st); rb.rotation.z = 0.15; P('seats', st, [0, 0.2, 1.9]);
    // FL1: wheels
    [[1.35, 1], [1.35, -1], [-1.35, 1], [-1.35, -1]].forEach(([x, s]) => { const w = grp(); w.position.set(x * sx, 0, s * 0.83); const t = new THREE.Mesh(G.tire, PM.tire); w.add(t); const r = cyl(0.22, 0.2, PM.rim, 0, 0, 0, w, 20); r.rotation.x = Math.PI / 2; for (let i = 0; i < 5; i++) { const sk = box(0.05, 0.36, 0.04, PM.rim, 0, 0, s * 0.1, w); sk.rotation.z = (i / 5) * Math.PI * 2; } P('wheels', w, [0, 0, s * 1.2]); });
    // FL4: bumpers, grille, lamps
    const bf = new THREE.Mesh(G.bumpF, paint), br = new THREE.Mesh(G.bumpR, paint);
    const bfg = grp(); bfg.add(bf); box(0.04, 0.16, 1.0, PM.grille, 2.33 * sx, 0.22, 0, bfg); P('bumpers', bfg, [1.4, 0, 0]);
    const brg = grp(); brg.add(br); box(0.04, 0.06, 1.3, PM.grille, -2.29 * sx, 0.18, 0, brg); P('bumpers', brg, [-1.4, 0, 0]);
    const isHS = v.variant.model !== 'ZS';
    const lf = grp(), lr = grp();
    if (isHS) {
      // HS: slim swept LED headlamps, wide grille, full-width light bar at the rear
      [-1, 1].forEach((s) => { const h = box(0.06, 0.06, 0.5, PM.lampF, 2.1 * sx, 0.6 * sy, s * 0.58, lf); h.rotation.z = -0.25; h.rotation.y = s * 0.12; });
      box(0.05, 0.2, 1.05, PM.grille, 2.15 * sx, 0.4 * sy, 0, lf);
      box(0.05, 0.04, 1.6, PM.lampR, -2.07 * sx, 0.86 * sy, 0, lr); [-1, 1].forEach((s) => box(0.06, 0.09, 0.34, PM.lampR, -2.04 * sx, 0.84 * sy, s * 0.66, lr));
    } else {
      // ZS: taller headlamp clusters, compact grille, separate tail clusters
      [-1, 1].forEach((s) => { const h = box(0.08, 0.14, 0.38, PM.lampF, 2.1 * sx, 0.58 * sy, s * 0.6, lf); h.rotation.z = -0.3; });
      box(0.05, 0.16, 0.8, PM.grille, 2.15 * sx, 0.42 * sy, 0, lf);
      [-1, 1].forEach((s) => box(0.07, 0.16, 0.36, PM.lampR, -2.05 * sx, 0.84 * sy, s * 0.62, lr));
    }
    P('lamps', lf, [1.0, 0, 0]); P('lamps', lr, [-1.0, 0, 0]);
    // fixed body identity: ZS roof rails; HS roof spoiler
    if (isHS) box(0.32, 0.04, 1.4, paint, -1.86 * sx, 1.27 * sy, 0, root);
    else [-0.6, 0.6].forEach((z) => { box(1.7 * sx, 0.04, 0.05, PM.grille, -0.45, 1.36 * sy, z, root); [0.35, -1.25].forEach((x) => box(0.08, 0.06, 0.06, PM.grille, x * sx, 1.33 * sy, z, root)); });
    // FL5: fluid fill (brake fluid, coolant, washer fluid reservoirs)
    const fl = grp(); [[1.75, -0.45, 0xd9a21b], [1.62, 0.1, 0xe0679a], [1.8, 0.5, 0x3d8fe0]].forEach(([x, z, c]) => { const r = cyl(0.09, 0.18, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.25, transparent: true, opacity: 0.9 }), x * sx, 0.6, z, fl, 12); }); P('fluids', fl, [0, 0.9, 0]);
    // FL6: wipers & mirrors
    const wp = grp(); [-0.35, 0.3].forEach((z) => { const b = box(0.02, 0.02, 0.62, PM.grille, 1.16 * sx, 0.74, z, wp); b.rotation.y = 0.2; }); [-1, 1].forEach((s) => box(0.22, 0.14, 0.12, paint, 0.82 * sx, 0.8, s * 1.02, wp)); P('wipers', wp, [0, 0.6, 0]);
    // FL7: badges + inspection sweep
    const bd = grp();
    const fb = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), PM.mgBadge); fb.rotation.y = Math.PI / 2; fb.position.set(2.39 * sx, 0.4 * sy, 0); bd.add(fb);
    const rb2 = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), PM.mgBadge); rb2.rotation.y = -Math.PI / 2; rb2.position.set(-2.32 * sx, 0.62 * sy, 0); bd.add(rb2);
    const ms = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.09), isHS ? PM.scriptHS : PM.scriptZS); ms.rotation.y = -Math.PI / 2; ms.position.set(-2.32 * sx, 0.48 * sy, -0.5); bd.add(ms);
    P('badges', bd, [0.5, 0, 0]);
    const sweep = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.8), PM.sweep); sweep.rotation.y = Math.PI / 2; sweep.position.y = 0.6; sweep.visible = false; root.add(sweep);
    const sq = new THREE.Shape([new THREE.Vector2(-2.9, -1.7), new THREE.Vector2(2.9, -1.7), new THREE.Vector2(2.9, 1.7), new THREE.Vector2(-2.9, 1.7)]); sq.holes.push(new THREE.Path([new THREE.Vector2(-2.8, -1.6), new THREE.Vector2(-2.8, 1.6), new THREE.Vector2(2.8, 1.6), new THREE.Vector2(2.8, -1.6)]));
    const ring = new THREE.Mesh(new THREE.ShapeGeometry(sq), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })); ring.rotation.x = -Math.PI / 2; scene.add(ring);
    const solids = [shell, apW, apR, ...parts.doors.flatMap((d) => d.children.filter((n) => n.isMesh)), bf, br];
    const o = { root, paint, shell, edges, parts, sweep, ring, solids, vis: null, xray: false };
    if (!isBuffer) carObjs[v.id] = o;
    return o;
  }
  function disposeCar(id) {
    const o = carObjs[id]; if (!o) return;
    scene.remove(o.root); scene.remove(o.ring); o.paint.dispose(); o.ring.material.dispose();
    // free this car's own geometries (tubes, badges, ring); the shared body shapes and unit box stay (audit T5)
    const shared = new Set([unitBox, ...Object.values(carGeo).flatMap((g) => Object.values(g).filter((x) => x && x.isBufferGeometry))]);
    const free = (n) => { if (n.geometry && !shared.has(n.geometry)) n.geometry.dispose(); };
    o.root.traverse(free); free(o.ring);
    o.root.traverse((n) => { const i = pickables.indexOf(n); if (i >= 0) pickables.splice(i, 1); });
    delete carObjs[id];
  }
  function setXray(o, on) {
    if (o.xray === on) return; o.xray = on; o.edges.visible = on;
    o.solids.forEach((m) => { if (!m.userData.mat) m.userData.mat = m.material; m.userData.solid = true; m.material = on ? PM.xray : m.userData.mat; m.castShadow = !on; });
  }
  // Apply build state: each part slides in from its direction while its station works on it.
  function applyBuild(o, bs, focus) {
    for (const [k, objs] of Object.entries(o.parts)) {
      let f = k === 'doors' ? bs.doorsOn : bs[k];
      if (f == null) f = 0;
      objs.forEach((obj) => {
        const on = f > 0.001; obj.visible = on; if (!on) return;
        const e = easeOut(f), d = obj.userData.dir, h = obj.userData.home;
        obj.position.set(h.x + d[0] * (1 - e), h.y + d[1] * (1 - e), h.z + d[2] * (1 - e));
        const installing = focus && f < 0.999;
        obj.traverse((n) => { if (n.isMesh && n.userData.mat) n.material = installing ? PM.install : o.xray && n.userData.solid ? PM.xray : n.userData.mat; });
      });
    }
    const sw = bs.badges; o.sweep.visible = sw > 0.02 && sw < 0.98; if (o.sweep.visible) o.sweep.position.x = 2.2 - 4.4 * sw;
  }

  /* ── chevrons ── */
  function buildChevrons() {
    const sh = new THREE.Shape(V2([[-0.34, -0.48], [0.2, 0], [-0.34, 0.48], [-0.1, 0], [-0.34, -0.48]]));
    const geo = new THREE.ShapeGeometry(sh); geo.rotateX(-Math.PI / 2);
    chevrons = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: T.tone.warn, transparent: true, opacity: 0.9, depthWrite: false }), 300);
    chevrons.count = 0; chevrons.renderOrder = 3; scene.add(chevrons);
  }
  function updateChevrons(S, now) {
    const an = S._analysis; if (!an) { chevrons.count = 0; return; }
    const edges = new Set();
    Object.entries(an.significant || {}).forEach(([root, list]) => list.forEach((a) => { let cur = a, n = 0; while (cur && cur !== root && n++ < 8) { const nx = E.XFER_FROM[cur] ? E.XFER_FROM[cur].to : NEXT[cur]; if (!nx) break; if (EDGES[`${cur}>${nx}`]) edges.add(`${cur}>${nx}`); cur = nx; } }));
    const sig = [...edges].sort().join('|'); if (sig !== chevronSig) { chevronSig = sig; chevronData = [...edges].map((k) => [k, EDGES[k]]); }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    let i = 0; const drift = (now / 1000 * 0.35) % 1;
    for (const [k, path] of chevronData) {
      const y = k.startsWith('FL') ? 0.34 : 0.05;
      const n = Math.max(2, Math.floor(path.len / 1.1));
      for (let j = 0; j < n && i < 300; j++) { const u = (j + drift) / n; if (u < 0.12 || u > 0.88) continue; const p = path.at(u); q.setFromAxisAngle(up, Math.atan2(-p.dz, p.dx)); m.compose(new THREE.Vector3(p.x, y, p.z), q, sc); chevrons.setMatrixAt(i++, m); }
    }
    chevrons.count = i; chevrons.instanceMatrix.needsUpdate = true;
  }

  /* ── camera ── */
  const VIEWS = {
    overview: { target: [4, 0, -2], dist: 162, az: 0.26, pol: 0.8 },
    TRIM: { target: [-24, 0.5, 11], dist: 62, az: 0.32, pol: 0.88 },
    CHASSIS: { target: [7, 1.5, -10], dist: 56, az: 0.34, pol: 0.86 },
    FINAL: { target: [38, 0.5, 11.5], dist: 62, az: 0.32, pol: 0.88 },
  };
  function camFromSpherical(target, dist, az, pol) {
    const aspect = el.clientWidth / Math.max(1, el.clientHeight), k = aspect < 1.5 ? Math.min(3.4, 1.5 / aspect) : 1, d = dist * k; // portrait screens back off further so the whole shop fits (audit T5)
    controls.maxDistance = Math.max(200, d * 1.15);
    return new THREE.Vector3(target[0] + d * Math.sin(pol) * Math.sin(az), target[1] + d * Math.cos(pol), target[2] + d * Math.sin(pol) * Math.cos(az));
  }
  function flyTo(target, dist, az, pol, ms = 1150) { camAnim = { t0: performance.now(), ms, fromPos: camera.position.clone(), fromTgt: controls.target.clone(), toPos: camFromSpherical(target, dist, az, pol), toTgt: new THREE.Vector3(...target) }; }
  function focusView(name) { const v = VIEWS[name] || VIEWS.overview; flyTo(v.target, v.dist, v.az, v.pol); }
  function currentAzPol() { const off = camera.position.clone().sub(controls.target); const r = off.length(); return { az: Math.atan2(off.x, off.z), pol: Math.acos(off.y / r) }; }
  function focusPoint(x, y, z, dist) { const { az, pol } = currentAzPol(); flyTo([x, y, z], dist, Math.max(-0.9, Math.min(1.1, az)), Math.min(Math.max(pol, 0.72), 0.98)); }
  function focusPos(id) { const P = POS[id]; focusPoint(P.x, P.hang > 1.5 ? 2.4 : 1.2, P.z, 46); }
  function focusVehicle(vid) { const o = carObjs[vid]; if (o && o.vis) focusPoint(o.vis.x, o.vis.y + 0.8, o.vis.z, 32); }
  function focusAny(sel) {
    if (!sel) return;
    if (sel.kind === 'pos') focusPos(sel.id); else if (sel.kind === 'veh') focusVehicle(sel.id);
    else if (sel.kind === 'scanner') { const p = { ENTRY: [-37, 1, 9], OFFLINE: [-8, 1, 9], EOL: [58, 1, 9.5], HH1: [27, 1, 9], HH2: [45, 1, 9] }[sel.id] || [0, 1, 0]; focusPoint(p[0], p[1], p[2], 26); }
  }

  /* ── theme ── */
  function setTheme(name) {
    if (!THEMES[name]) return; themeName = name; T = THEMES[name];
    if (!ok) return;
    themed.forEach(({ mat, key: k }) => { const c = k.startsWith('tone_') ? T.tone[k.slice(5)] : T[k]; if (c != null) mat.color.setHex(c); });
    renderer.setClearColor(T.bg); scene.fog.color.setHex(T.bg); scene.fog.near = T.fogNear; scene.fog.far = T.fogFar;
    hemi.color.setHex(T.hemi[0]); hemi.groundColor.setHex(T.hemi[1]); hemi.intensity = T.hemi[2]; amb.intensity = T.amb; key.intensity = T.key; fill.intensity = T.fill; rim.intensity = T.rim; pools.material.opacity = T.pools; pools.visible = T.pools > 0;
    Object.values(pads).forEach((p) => { p.corners.material.color.setHex(T.padEdge); p.barBg.material.color.setHex(T.padEdge); });
    PM.install.color.setHex(T.install); PM.install.emissive.setHex(T.install); PM.xray.color.setHex(T.xray); PM.edge.color.setHex(T.xray); PM.sweep.color.setHex(T.install);
    chevrons.material.color.setHex(T.tone.warn);
    refreshTexts(); if (signRedraw) signRedraw(); if (bvRedraw) bvRedraw();
  }

  /* ── init ── */
  function init(container, opts) {
    el = container; getState = opts.getState; getUI = opts.getUI; cb = opts; if (opts.theme) T = THEMES[opts.theme] || T, themeName = opts.theme || themeName;
    try { const pr = document.createElement('canvas'); if (!(pr.getContext('webgl2') || pr.getContext('webgl'))) throw new Error('no webgl'); renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); } catch (e) { return false; }
    // low quality on weak devices (or when asked): pixel ratio 1 and smaller shadows (audit T4)
    const weak = opts.quality === 'low' || (opts.quality !== 'high' && ((navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4));
    renderer.setPixelRatio(weak ? 1 : Math.min(window.devicePixelRatio || 1, 2)); renderer.shadowMap.enabled = true;
    // a lost graphics context (driver reset, GPU memory pressure) hands over to the 2D plan instead of a blank floor
    renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); ok = false; if (opts.onLost) opts.onLost(); }); renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.setClearColor(T.bg);
    el.appendChild(renderer.domElement); renderer.domElement.setAttribute('aria-label', 'Interactive 3D model of the General Assembly shop'); renderer.domElement.tabIndex = 0;
    scene = new THREE.Scene(); scene.fog = new THREE.Fog(T.bg, T.fogNear, T.fogFar);
    camera = new THREE.PerspectiveCamera(28, 1, 0.5, 700);
    hemi = new THREE.HemisphereLight(T.hemi[0], T.hemi[1], T.hemi[2]); scene.add(hemi);
    amb = new THREE.AmbientLight(0xffffff, T.amb); scene.add(amb);
    key = new THREE.DirectionalLight(0xfff6ea, T.key); key.position.set(40, 70, 40); key.castShadow = true; key.shadow.mapSize.set(weak ? 1024 : 2048, weak ? 1024 : 2048);
    Object.assign(key.shadow.camera, { left: -75, right: 75, top: 45, bottom: -45, near: 10, far: 200 }); key.shadow.bias = -0.0006; key.shadow.normalBias = 0.03; key.target.position.set(10, 0, -3); scene.add(key, key.target);
    fill = new THREE.DirectionalLight(0x9ab8d8, T.fill); fill.position.set(-50, 30, -40); scene.add(fill);
    // cool rim from behind the shop: separates bodies, hangers and rails from the floor in dark mode
    rim = new THREE.DirectionalLight(0xa8c8ff, T.rim); rim.position.set(-20, 26, -70); scene.add(rim);
    CM = carrierMats(); PM = partMats();
    buildEnvironment(); buildLightPools(); buildFloorBadge(); buildBvBadge(); buildSignage(); buildEquipment(); buildRails(); buildPads(); buildScanners(); buildBeacons(); buildChevrons();
    Object.values(getState().carriers).forEach(makeCarrier);
    controls = new OrbitControls(camera, renderer.domElement);
    Object.assign(controls, { enableDamping: true, dampingFactor: 0.09, minDistance: 14, maxDistance: 200, maxPolarAngle: 1.22, minPolarAngle: 0.2, rotateSpeed: 0.55, zoomSpeed: 0.8, panSpeed: 0.8, screenSpacePanning: false, minAzimuthAngle: -1.2, maxAzimuthAngle: 1.3 });
    const v = VIEWS.overview; controls.target.set(...v.target); resize(); camera.position.copy(camFromSpherical(v.target, v.dist, v.az, v.pol)); controls.update();
    raycaster = new THREE.Raycaster();
    const cvs = renderer.domElement;
    cvs.addEventListener('pointermove', onMove); cvs.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
    cvs.addEventListener('pointerup', onUp); cvs.addEventListener('pointerleave', () => { hoverKey = null; cb.onHover(null); });
    controls.addEventListener('start', () => (camAnim = null));
    new ResizeObserver(resize).observe(el);
    ok = true; return true;
  }
  function resize() { if (!renderer) return; const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); }
  function pick(e) {
    const r = renderer.domElement.getBoundingClientRect(); pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    for (const h of raycaster.intersectObjects(pickables, false)) { let n = h.object, vis = true; while (n) { if (n.visible === false) { vis = false; break; } n = n.parent; } if (vis) return h.object.userData; }
    return null;
  }
  function onMove(e) {
    if (e.buttons) return; const hit = pick(e), k = hit ? hit.kind + ':' + hit.id : null;
    renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
    const r = el.getBoundingClientRect(); cb.onHover(hit ? { ...hit, x: e.clientX - r.left, y: e.clientY - r.top } : null, k !== hoverKey); hoverKey = k;
  }
  function onUp(e) { if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down = null; return; } down = null; cb.onSelect(pick(e)); }

  /* ── per-frame sync ── */
  const tmpV = new THREE.Vector3();
  const lerpAngle = (a, b, f) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * f; };
  function carrierPose(S, c, tf) {
    if (c.mode === 'POS') { const P = POS[c.posId]; return { x: P.x, z: P.z, yaw: P.yaw, y: P.hang, show: true }; }
    if (c.mode === 'TRANSIT') { const tr = c.transit, u = ease(E.clamp((tf - tr.t0) / (tr.t1 - tr.t0), 0, 1)), p = EDGES[tr.edge].at(u); return { x: p.x, z: p.z, yaw: Math.atan2(-p.dz, p.dx), y: POS[tr.from].hang + (POS[tr.to].hang - POS[tr.from].hang) * u, show: true }; }
    const L = E.LOOPS[c.loop];
    if (L.hidden) {
      if (c.mode === 'FEED') { const u = E.clamp((tf - c.transit.t0) / (c.transit.t1 - c.transit.t0), 0, 1), P = POS[L.positions[0]]; return { x: P.x, z: P.z, yaw: P.yaw, y: P.hang, rise: -0.9 * (1 - ease(u)), show: true }; }
      return { show: false };
    }
    if (c.mode === 'RETURN' || c.mode === 'FEED') {
      const tr = c.transit, u = E.clamp((tf - tr.t0) / (tr.t1 - tr.t0), 0, 1), p = tr.path.at(u);
      const lift = c.mode === 'RETURN' ? E.clamp(u / 0.15, 0, 1) : 1 - E.clamp((u - 0.75) / 0.25, 0, 1);
      return { x: p.x, z: p.z, yaw: Math.atan2(-p.dz, p.dx), y: 1.6, rail: (E.RETURN_Y - RH) * ease(lift), show: true };
    }
    const k = S.loopBuf[c.loop].indexOf(c.id), G = E.LOOP_GEOM[c.loop]; return { x: G.slotX(Math.max(0, k)), z: G.z, yaw: Math.PI, y: 1.6, rail: E.RETURN_Y - RH, show: true, buffer: true };
  }
  function render(tf, now) {
    if (!ok) return;
    const S = getState(), ui = getUI();
    if (camAnim) { const u = Math.min(1, (now - camAnim.t0) / camAnim.ms), e = 1 - Math.pow(1 - u, 3); camera.position.lerpVectors(camAnim.fromPos, camAnim.toPos, e); controls.target.lerpVectors(camAnim.fromTgt, camAnim.toTgt, e); if (u >= 1) camAnim = null; }
    controls.target.x = E.clamp(controls.target.x, -60, 75); controls.target.z = E.clamp(controls.target.z, -30, 25); controls.target.y = E.clamp(controls.target.y, 0, 5); controls.update();
    // frame the line inside the UI safe area: the inspector on the right, the top bar and the strip
    viewShift += ((ui.panelWidth || 0) + safe.right - safe.left - viewShift) * 0.12;
    viewShiftY += (safe.bottom - safe.top - viewShiftY) * 0.12;
    const camDist = camera.position.distanceTo(controls.target);
    if (floorBadge) floorBadge.material.opacity = T.badge * E.clamp((camDist - 30) / 70, 0.35, 1);
    // fog follows the camera, so zooming out never sinks the shop into fog; small floor labels show only when the camera
    // is close enough to read them (audit T2, T5)
    scene.fog.near = camDist + 70; scene.fog.far = camDist + 280;
    const smallA = E.clamp((125 - camDist) / 35, 0, 1);
    for (const t of texts) if (t.o.size < 60) { t.mesh.material.opacity = smallA; t.mesh.visible = smallA > 0.02; }
    const w = el.clientWidth, h = el.clientHeight;
    if (Math.abs(viewShift) > 0.5 || Math.abs(viewShiftY) > 0.5) camera.setViewOffset(w, h, viewShift / 2, viewShiftY / 2, w, h); else camera.clearViewOffset();
    const pulse = 0.5 + 0.5 * Math.sin(now / 320), sel = ui.selection, hov = ui.hover;
    const roots = S._analysis ? S._analysis.significant || {} : {};
    const selVeh = sel && sel.kind === 'veh' ? sel.id : sel && sel.kind === 'pos' ? (E.stationVehicle(S, sel.id) || {}).v?.id : null;
    // pads
    for (const id of STATIONS) {
      const pd = pads[id], st = E.stationStatus(S, id), P = POS[id];
      const toneC = T.tone[st.tone] || T.tone.muted;
      let op = 0;
      if (st.code === 'OVERDUE') op = 0.14 + 0.1 * pulse; else if (st.code === 'ESCALATED' || st.code === 'HOLD') op = 0.18 + 0.14 * pulse; else if (st.code === 'FAULT') op = 0.16 + 0.12 * pulse;
      else if (st.code === 'WAITING' || st.code === 'REMOVAL') op = 0.12; else if (st.code === 'NEAR') op = 0.08; else if (st.code === 'COMPLETE') op = 0.08; else if (st.code === 'PAUSED') op = 0.08;
      pd.tint.material.color.setHex(toneC); pd.tint.material.opacity = op;
      const isSel = !!(sel && sel.kind === 'pos' && sel.id === id), isHov = !!(hov && hov.kind === 'pos' && hov.id === id);
      pd.outline.material.opacity = isSel ? 1 : isHov ? 0.6 : 0; pd.outline.material.color.setHex(isSel ? T.padEdgeHi : T.padEdgeHi);
      const sv = E.stationVehicle(S, id), occ = sv && S.pos[sv.posId].occ;
      if (P.kind === 'work') {
        const tgt = sv ? E.targetFor(id, sv.v) : P.target, r = occ && occ.vehicleId ? Math.min(1, occ.workT / tgt) : 0;
        pd.barFill.visible = r > 0; pd.barFill.scale.x = Math.max(0.001, r * pd.barW);
        const c = st.code === 'WAITING' ? T.tone.hold : st.code === 'COMPLETE' ? T.tone.ok : ['ESCALATED', 'OVERDUE', 'NEAR', 'PAUSED', 'HOLD'].includes(st.code) ? toneC : T.tone.text;
        pd.barFill.material.color.setHex(c);
      } else pd.barFill.visible = false;
      const isRoot = !!(roots[id] && roots[id].length);
      pd.ring.material.opacity = isRoot ? 0.35 + 0.45 * pulse : 0; pd.ring.material.color.setHex(st.tone === 'crit' || st.tone === 'esc' ? toneC : T.tone.warn);
      const rs = isRoot ? 1 + 0.015 * pulse : 1; pd.ring.scale.set(rs, rs, 1);
    }
    // carriers
    for (const c of Object.values(S.carriers)) {
      const o = carrierObjs[c.id], pose = carrierPose(S, c, tf);
      o.g.visible = pose.show; if (!pose.show) { o.vis = null; continue; }
      if (!o.vis || !pose.buffer) o.vis = { x: pose.x, z: pose.z, yaw: pose.yaw }; else { o.vis.x += (pose.x - o.vis.x) * 0.06; o.vis.z += (pose.z - o.vis.z) * 0.06; o.vis.yaw = lerpAngle(o.vis.yaw, pose.yaw, 0.08); }
      const xf = S.xfers.find((q) => S.pos[q.to].carrierId === c.id || S.pos[q.from].carrierId === c.id);
      if (c.kind === 'Hanger') {
        o.g.position.set(o.vis.x, pose.rail || 0, o.vis.z); o.g.rotation.y = o.vis.yaw;
        setHangerDrop(o, c.vehicleId || (xf && S.pos[xf.to].carrierId === c.id) ? pose.y : Math.max(pose.y, 2.6));
      } else {
        o.g.position.set(o.vis.x, (c.kind === 'Skid' ? 0.18 : 0.3) - 0.18 + (pose.rise || 0), o.vis.z); o.g.rotation.y = o.vis.yaw;
        if (c.kind === 'Fixture') o.g.visible = false; // the car rides on its own wheels on the slat conveyor
      }
      const fm = c.fault ? CM.fault : null; o.parts.forEach((m) => { if (!m.userData.base) m.userData.base = m.material; m.material = fm || m.userData.base; });
      o.pose = pose;
    }
    // buffer bodies (painted, doors on, not yet registered)
    S.bodyBuffer.forEach((b, i) => {
      let bo = bufferObjs[i];
      if (!b) { if (bo) bo.root.visible = false; return; }
      if (!bo || bo.bodyId !== b.id) { if (bo) { scene.remove(bo.root); scene.remove(bo.ring); } bo = makeCar({ variant: b.variant, paint: b.paint }, true); bo.bodyId = b.id; bufferObjs[i] = bo; const full = {}; Object.keys(bo.parts).forEach((k) => (full[k] = 0)); full.doorsOn = 1; applyBuild(bo, full); }
      bo.root.visible = true; const [x, z] = E.BODY_BUFFER[i]; bo.root.position.set(x, E.H_BUFFER, z); bo.root.rotation.y = 0;
    });
    // vehicles
    const seen = new Set();
    for (const vid of S.vehOrder) {
      const v = S.vehicles[vid]; let pose = null;
      const an = S.anims.find((a) => a.vehicleId === vid), xf = S.xfers.find((q) => q.vehicleId === vid);
      if (an) {
        const u = E.clamp((tf - an.t0) / (an.t1 - an.t0), 0, 1), p = an.path.at(ease(E.clamp((u - 0.12) / 0.88, 0, 1)));
        const yy = an.kind === 'entry' ? an.y0 + (an.y1 - an.y0) * ease(E.clamp((u - 0.8) / 0.2, 0, 1)) : an.y0 + (an.y1 - an.y0) * Math.min(1, u * 6);
        pose = { x: p.x, z: p.z, yaw: an.kind === 'storage' || an.kind === 'entry' ? 0 : Math.atan2(-p.dz, p.dx), y: yy };
        if (an.kind === 'storage' && u > 0.82) pose.fade = (1 - u) / 0.18;
      } else if (xf) {
        const u = E.clamp((tf - xf.t0) / (xf.t1 - xf.t0), 0, 1), A = POS[xf.from], B = POS[xf.to];
        // lift, carry across, set down: horizontal travel happens in the middle of the move
        const h = ease(E.clamp((u - 0.2) / 0.6, 0, 1));
        pose = { x: A.x + (B.x - A.x) * h, z: A.z + (B.z - A.z) * h, yaw: lerpAngle(A.yaw, B.yaw, h), y: A.hang + (B.hang - A.hang) * ease(u) + 0.6 * Math.sin(Math.PI * u) };
      } else if (v.carrierId && carrierObjs[v.carrierId] && carrierObjs[v.carrierId].pose && carrierObjs[v.carrierId].vis) {
        const co = carrierObjs[v.carrierId]; pose = { x: co.vis.x, z: co.vis.z, yaw: co.vis.yaw, y: co.pose.y + (co.pose.rise || 0) };
      } else if ((v.state === 'OFF_LINE' || v.state === 'RETURN_QUEUED') && S.offlineBay.slice(-E.OFFLINE_SLOTS.length).includes(vid)) { const [x, z] = E.OFFLINE_SLOTS[(v.offlineSlot || 0) % E.OFFLINE_SLOTS.length]; pose = { x, z, yaw: 0, y: 0.36 }; }
      if (!pose) continue;
      seen.add(vid);
      const o = carObjs[vid] || makeCar(v);
      o.root.position.set(pose.x, pose.y, pose.z); o.root.rotation.y = pose.yaw; o.vis = pose; o.root.visible = pose.fade == null || pose.fade > 0.03;
      const isSel = selVeh === vid, isHov = hov && hov.kind === 'veh' && hov.id === vid;
      applyBuild(o, E.buildState(S, v), isSel || isHov);
      setXray(o, !!(ui.xray || (isSel && ui.xraySel)));
      o.paint.emissive.setHex(isSel ? 0x202020 : isHov ? 0x121212 : 0x000000);
      o.paint.color.copy(isSel || isHov ? o.paint.userData.full : o.paint.userData.muted);
      o.ring.position.set(pose.x, 0.04, pose.z); o.ring.rotation.z = pose.yaw; o.ring.material.opacity = sel && sel.kind === 'veh' && sel.id === vid ? 0.9 : 0; o.ring.material.color.setHex(T.padEdgeHi);
    }
    for (const id of Object.keys(carObjs)) if (!seen.has(id)) disposeCar(id);
    // scanners
    const last = S.scans[S.scans.length - 1];
    if (last && last.id !== lastScanId) { lastScanId = last.id; const key = last.scanner === 'OFFLINE' ? (last.pos === 'TL6' ? 'OFFLINE' : ['FL1', 'FL2', 'FL3'].includes(last.pos) ? 'HH1' : 'HH2') : last.scanner; const sc = scanners[key]; if (sc) { sc.flashT = now; sc.flashColor = last.ok ? T.tone.ok : T.tone.crit; } }
    for (const sc of Object.values(scanners)) { const k = Math.max(0, 1 - (now - sc.flashT) / 900); sc.beam.material.color.setHex(k > 0 ? sc.flashColor : 0xff3b3b); sc.beam.material.opacity = (sc.base != null ? sc.base * 0.5 : 0.16) + 0.75 * k; }
    updateBeacons(S, now);
    updateChevrons(S, now);
    renderer.render(scene, camera);
    projectAnchors();
  }
  function anchorWorld(k) {
    const [kind, id] = k.split(':');
    if (kind === 'pos') { const P = POS[id]; return tmpV.set(P.x, P.hang > 1.5 ? RH + 1.4 : 3.6, P.z); }
    if (kind === 'veh') { const o = carObjs[id]; if (!o || !o.vis) return null; return tmpV.set(o.vis.x, o.vis.y + 2.0, o.vis.z); }
    if (kind === 'scanner') { const p = { ENTRY: [-36, 2.8, 7.6], OFFLINE: [-6.2, 2.8, 7.6], EOL: [56.8, 2.8, 7.8], HH1: [26.8, 2.2, 7.4], HH2: [44.8, 2.2, 7.4] }[id]; return p ? tmpV.set(p[0], p[1], p[2]) : null; }
    return null;
  }
  function projectAnchors() {
    const nodes = el.parentElement.querySelectorAll('[data-anchor]'), w = el.clientWidth, h = el.clientHeight;
    nodes.forEach((n) => { const p = anchorWorld(n.getAttribute('data-anchor')); if (!p) { n.style.visibility = 'hidden'; return; } p.project(camera); const vis = p.z < 1 && p.x > -1.1 && p.x < 1.1 && p.y > -1.1 && p.y < 1.1; n.style.visibility = vis ? 'visible' : 'hidden'; n.style.transform = `translate(${((p.x + 1) / 2) * w}px, ${((1 - p.y) / 2) * h}px)`; });
  }
  return { init, render, setTheme, setSafeArea, focusView, focusPos, focusVehicle, focusAny, get ok() { return ok; }, get theme() { return themeName; }, _debug: () => ({ scene, camera, controls, carObjs, flyTo }) };
})();
