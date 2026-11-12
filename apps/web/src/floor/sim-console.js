/* ── simulation console ── */
import { SCENARIOS, loadScenario } from './scenarios.js';
import { can, userName } from '../auth.js';
import { Act } from '../lib/act.js';
import { AREAS, M, RT, fmtClock, html, setUI, useRef } from '../lib/runtime.js';
import { useCallback } from 'react';
import { usePopover } from '../lib/fit.js';
import { Icon } from '../lib/ui-kit.js';
import { Button, Field, NumberInput, SegmentedControl, Switch } from '../ui/index.js';
import { powerCut, setLink } from '../screens.js';

/* The simulator lives in the top bar: one "Scenario n" button that opens its menu (run or pause, speed,
   scenarios and the simulated plant settings). Only for roles allowed to drive it, and never on the real plant. */
export function SimMenu() {
  const open = RT.ui.simOpen, btn = useRef(null), pop = useRef(null);
  const setOpen = useCallback((v) => setUI({ simOpen: v }), []);
  usePopover(open, setOpen, btn, pop);
  if (RT.conn.mode === 'live' || !can('sim')) return null;
  return html`<div class="sim-menu"><button ref=${btn} class="ibtn sim-btn" aria-haspopup="dialog" aria-expanded=${open} title="Simulation: run or pause, speed and scenarios" onClick=${() => setOpen(!open)}>
      <span class=${'sim-dot' + (RT.running ? ' on' : '')} aria-hidden="true"></span><span class="hud-btn-l">Scenario ${RT.scenario}</span><span class="sim-x mono">${RT.speed}×</span><${Icon} n="down" size=${14} /></button>
    ${open ? html`<div class="glass umenu-pop sim-pop" role="dialog" aria-label="Simulation control" ref=${pop}>
      <div class="sim-pop-bar">
        <${Button} size="sm" variant="ghost" icon=${RT.running ? 'pause' : 'play'} onClick=${() => Act.setRunning(!RT.running)}>${RT.running ? 'Pause' : 'Run'}<//>
        <${SegmentedControl} size="sm" class="speeds-ds" label="Simulation speed" value=${RT.speed} onChange=${(v) => Act.setSpeed(v)} options=${[1, 5, 15, 60].map((x) => ({ value: x, label: `${x}×` }))} />
      </div>
      <${SimBody} /></div>` : null}</div>`;
}

function SimBody() {
  const S = RT.S, C = S.cfg;
  const setC = (k, v) => Act.simConfig(k, v);
  return html`<div class="simcon-body">
      <div><div class="micro" style=${{ marginBottom: 6 }}>Scenarios · each restarts the shift at 09:38</div>
        ${SCENARIOS.map((s) => html`<button key=${s.n} class="scn" title=${s.desc} aria-current=${RT.scenario === s.n} onClick=${() => loadScenario(s.n)}><span class="n">${s.n}</span><span class="t">${s.title}</span><span class="d">${s.desc}</span></button>`)}</div>
      <div class="cfg-ds">
        ${[['autoFeed', 'Paint-shop body feed'], ['autoEntryScan', 'Auto scan at Scanner 1 (line-in)'], ['autoExitScan', 'End-of-line photo-eye at FL7'], ['autoComplete', 'Teams finish (sensor detects)'], ['autoRespond', 'Simulated responders clear calls'], ['trimAndon', 'Trim Andon preview (req 34)'], ['useSchedule', 'Breaks and shift times stop the line'], ['engineCheck', 'CL2 engine pairing scan (option)']].map(([k, label]) => html`<${Switch} key=${k} checked=${!!C[k]} onChange=${(v) => setC(k, v)} label=${label} />`)}
        <${Field} inline=${true} label="Simulated calls (% of units)"><${NumberInput} size="sm" min="0" max="40" value=${Math.round(C.callRate * 100)} onChange=${(v) => setC('callRate', M.clamp(+v || 0, 0, 40) / 100)} /><//>
        <${Field} inline=${true} label="Close to limit at % of takt"><${NumberInput} size="sm" min="50" max="99" value=${Math.round(C.warnPct * 100)} onChange=${(v) => { const n = Math.round(+v); if (n >= 50 && n <= 99) Act.setWarnPct(n / 100, userName(), 'Changed in the simulation console'); }} /><//>
        <${Field} inline=${true} label="Escalate overdue after (min)"><${NumberInput} size="sm" min="0.5" max="30" step="0.5" value=${C.escalateAfter / 60} onChange=${(v) => setC('escalateAfter', Math.round(M.clamp(+v || 3, 0.5, 30) * 60))} /><//>
        <${Field} inline=${true} label="Blocked alarm after (min)"><${NumberInput} size="sm" min="0.5" max="30" step="0.5" value=${C.blockedAlarmAfter / 60} onChange=${(v) => setC('blockedAlarmAfter', Math.round(M.clamp(+v || 1.5, 0.5, 30) * 60))} /><//>
        <${Field} inline=${true} label="Random team delay rate (%)"><${NumberInput} size="sm" min="0" max="30" value=${Math.round(C.delayRate * 100)} onChange=${(v) => setC('delayRate', M.clamp(+v || 0, 0, 30) / 100)} /><//>
      </div>
      <div><div class="micro" style=${{ marginBottom: 8 }}>Simulated line stop</div><div class="actions">${['TRIM', 'CHASSIS', 'FINAL'].map((a) => html`<${Button} key=${a} size="sm" tone="sim" icon=${S.paused[a] ? 'play' : 'pause'} pressed=${S.paused[a]} onClick=${() => Act.pauseArea(a, !S.paused[a])}>${S.paused[a] ? 'Restart ' : 'Stop '}${AREAS[a].short}<//>`)}</div></div>
      <div><div class="micro" style=${{ marginBottom: 8 }}>Resilience (URD req 32–33)</div><div class="actions"><${Button} size="sm" tone="sim" icon=${RT.link.up ? 'wifioff' : 'wifi'} onClick=${() => setLink(!RT.link.up)}>${RT.link.up ? 'Drop head-office link' : 'Restore head-office link'}<//><${Button} size="sm" tone="sim" icon="power" disabled=${!!RT.power} onClick=${powerCut}>Power cut and restart<//></div></div>
      <div><div class="micro" style=${{ marginBottom: 8 }}>Time</div><div class="actions"><${Button} size="sm" tone="sim" title="Fast-forward the simulation to the next shift, break or restart" onClick=${() => skipAhead()}><${Icon} n="skip" />Skip to ${S.planned ? 'restart' : 'next break or shift change'} · ${fmtClock(M.nextBoundary(S, S.t), false)}<//></div></div>
      <p class="note">Adapter: <b>${M.Integration.mode}</b>. Nothing is sent to any PLC, conveyor, scanner or sensor. Permissives shown in the HMI are simulated interlocks.</p>
    </div>`;
}

/* fast-forward to the next shift boundary (runs the engine; can take a second or two) */
function skipAhead() {
  const S = RT.S, to = M.nextBoundary(S, S.t) + 1;
  Act.skipTo(to);
}

