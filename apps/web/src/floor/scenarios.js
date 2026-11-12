/* ── scenarios ── */
import { Scene3D } from '../lib/scene.js';
import { savedCfg } from '../admin.js';
import { buildScenario } from '@mg/sim';
import { REMOTE, send } from '../lib/source.js';
import { M, POS, RT, dispId, setUI } from '../lib/runtime.js';

export { DEMO_AFTER, SCENARIOS, freshState, injectDemoDelay } from '@mg/sim';

/** Screen side of a scenario: selection, dialog, drawer, speed and camera. */
export function applyScenarioHints(r) {
  RT.acc = 0; RT.scenario = r.n; RT.speed = r.speed || 5; RT.running = true; RT.demo = r.demo ? { elapsed: 0, fired: false } : null;
  setUI({ selection: r.select || null, dialog: r.dialog || null, drawer: r.drawer || null, hover: null, view: r.view || RT.ui.view });
  setTimeout(() => { if (r.select) focusSel(r.select); else Scene3D.focusView(r.view || 'overview'); }, 30);
}
export function loadScenario(n) {
  // live screens: the edge server rebuilds the plant and every screen gets the new state
  if (REMOTE) { send({ type: 'SIM_SCENARIO', n }).then((hints) => applyScenarioHints({ ...hints, speed: hints.speed || RT.speed })); return; }
  const { S, hints } = buildScenario(n, savedCfg());
  RT.S = S;
  applyScenarioHints(hints);
}
const focusSel = (sel) => Scene3D.focusAny(sel);
export function select(sel, focus = true) {
  if (sel && sel.kind === 'scanner') { if (sel.id === 'ENTRY') { setUI({ dialog: { type: 'scan', scanner: 'ENTRY' } }); return; } const at = sel.id === 'OFFLINE' ? 'TL6' : sel.id === 'EOL' ? 'FL7' : sel.id === 'HH1' ? 'FL2' : 'FL5'; return select({ kind: 'pos', id: at }, focus); }
  setUI({ selection: sel, hover: null }); if (sel && focus) focusSel(sel);
}
export function topAlarm(S) { const a = S.alarms.filter((x) => M.alarmActive(x) && x.level !== 'WARNING'); a.sort((x, y) => (M.alarmUnacked(y) - M.alarmUnacked(x)) || (M.SEV[y.level] - M.SEV[x.level]) || (x.raisedT - y.raisedT)); return a[0]; }
export function openAlarm(a) { setUI({ drawer: null }); select({ kind: 'pos', id: POS[a.pos] ? dispId(a.pos) : 'TL1' }); }

