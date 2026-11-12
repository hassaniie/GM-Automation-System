/* The MG badge in 3D: a slowly swaying, extruded badge centred behind the page screens (Dashboard, Reports,
   Settings, Guide), in its own MG red: the ring and letters in red satin metal standing proud of the plate.
   Light on the GPU: about 30 frames a second at most, pixel ratio capped at 1.5, and nothing is drawn while
   the tab is hidden, the canvas is off screen or the user prefers reduced motion (one still frame then). */
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MG_BADGE_PLATE, MG_BADGE_RED } from './brand.js';

const THEMES = {
  dark: { plate: 0x171a1f, chrome: 0xb3141f, env: 0.1, hemi: 0.35, key: 1.6, rim: 1.2, opacity: 0.5 },
  light: { plate: 0xeceef1, chrome: 0xc8102e, env: 0.14, hemi: 0.8, key: 1.2, rim: 0.5, opacity: 0.3 },
};
THREE.ColorManagement.enabled = false; // as the floor scene: colours are used as written, one look whichever loads first
const UNIT = 1200; // the traced badge is 1200 × 1200

function shapesOf(d) {
  const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="${d}"/></svg>`);
  return data.paths.flatMap((p) => SVGLoader.createShapes(p));
}

export function mountBadge(canvas, { theme = 'dark', onLost } = {}) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' }); }
  catch { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(26, 1, 10, 10000);
  camera.position.set(0, 0, 2950);
  const pmrem = new THREE.PMREMGenerator(renderer), envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x30343a, 1); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1); key.position.set(-900, 1200, 1600); scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe7ff, 1); rim.position.set(1400, -600, -400); scene.add(rim);

  const plateMat = new THREE.MeshStandardMaterial({ metalness: 0.2, roughness: 0.6 });
  const chromeMat = new THREE.MeshStandardMaterial({ metalness: 0.55, roughness: 0.35 });
  const bevel = { bevelEnabled: true, bevelSegments: 4, curveSegments: 18 };
  const plateGeo = new THREE.ExtrudeGeometry(shapesOf(MG_BADGE_PLATE), { ...bevel, depth: 60, bevelThickness: 14, bevelSize: 10 });
  const redGeo = new THREE.ExtrudeGeometry(shapesOf(MG_BADGE_RED), { ...bevel, depth: 46, bevelThickness: 12, bevelSize: 5 });
  const plate = new THREE.Mesh(plateGeo, plateMat), raised = new THREE.Mesh(redGeo, chromeMat);
  plate.position.z = -60; raised.position.z = 14; // the ring and letters stand proud of the plate
  const badge = new THREE.Group(); badge.add(plate, raised);
  badge.scale.set(1, -1, 1); badge.position.set(-UNIT / 2, UNIT / 2, 0); // SVG y runs down
  const pivot = new THREE.Group(); pivot.add(badge); scene.add(pivot);

  function setTheme(name) {
    const T = THEMES[name] || THEMES.dark;
    plateMat.color.setHex(T.plate); chromeMat.color.setHex(T.chrome);
    scene.environmentIntensity = T.env; hemi.intensity = T.hemi * Math.PI; key.intensity = T.key * Math.PI; rim.intensity = T.rim * Math.PI;
    canvas.style.setProperty('--badge-o', T.opacity);
    draw(performance.now());
  }

  const still = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function pose(t) {
    const s = still.matches ? 0 : t / 1000;
    pivot.rotation.y = -0.22 + Math.sin(s * 0.22) * 0.17;
    pivot.rotation.x = -0.1 + Math.sin(s * 0.16) * 0.05;
  }
  function size() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function draw(t) { pose(t); renderer.render(scene, camera); }

  let raf = 0, last = 0, onScreen = true, lost = false;
  const running = () => !lost && onScreen && document.visibilityState === 'visible' && !still.matches;
  function loop(t) {
    raf = 0; if (!running()) return;
    if (t - last >= 33) { last = t; draw(t); }
    raf = requestAnimationFrame(loop);
  }
  function wake() { if (!raf && running()) raf = requestAnimationFrame(loop); else if (!running() && !lost) draw(performance.now()); }

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { size(); draw(performance.now()); }) : null;
  if (ro) ro.observe(canvas);
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((es) => { onScreen = es.some((e) => e.isIntersecting); wake(); }) : null;
  if (io) io.observe(canvas);
  document.addEventListener('visibilitychange', wake);
  if (still.addEventListener) still.addEventListener('change', wake);
  const lostFn = (e) => { e.preventDefault(); lost = true; if (raf) cancelAnimationFrame(raf); raf = 0; if (onLost) onLost(); };
  canvas.addEventListener('webglcontextlost', lostFn);

  size(); setTheme(theme); wake();

  return {
    setTheme,
    dispose() {
      if (raf) cancelAnimationFrame(raf); raf = 0; lost = true;
      if (ro) ro.disconnect(); if (io) io.disconnect();
      document.removeEventListener('visibilitychange', wake);
      if (still.removeEventListener) still.removeEventListener('change', wake);
      canvas.removeEventListener('webglcontextlost', lostFn);
      plateGeo.dispose(); redGeo.dispose(); plateMat.dispose(); chromeMat.dispose();
      envRT.dispose(); pmrem.dispose(); renderer.dispose();
    },
  };
}
