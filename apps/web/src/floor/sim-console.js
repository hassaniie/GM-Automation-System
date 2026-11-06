/* ── simulation console ── */
import { SCENARIOS, loadScenario } from './scenarios.js';
import { Act } from '../lib/act.js';
import { AREAS, M, RT, bump, fmtClock, html, setUI } from '../lib/runtime.js';
import { Icon } from '../lib/ui-kit.js';
import { powerCut, setLink } from '../screens.js';

export function SimConsole() {
  if (RT.conn.mode === 'live') return null; // the real plant: no simulator controls
  const S = RT.S, C = S.cfg, open = RT.ui.simOpen;
  const setC = (k, v) => Act.simConfig(k, v);
  // called as a function, not as <${Tog}>: a component defined in render would remount on every update
  const Tog = ({ k, label }) => html`<label for=${'tg-' + k}>${label}</label><button id=${'tg-' + k} class="toggle" role="switch" aria-checked=${!!C[k]} onClick=${() => setC(k, !C[k])}></button>`;
  return html`<section class="glass simcon ticks in" aria-label="Simulation control">
    <div class="simcon-bar">
      <span class="sim-tag"><${Icon} n="flask" size=${11} />SIM</span>
      <button class="btn sm icon ghost" aria-label=${RT.running ? 'Pause simulation' : 'Run simulation'} onClick=${() => Act.setRunning(!RT.running)}><${Icon} n=${RT.running ? 'pause' : 'play'} /></button>
      <span class="micro" style=${{ whiteSpace: 'nowrap' }}>Scenario ${RT.scenario}</span>
      <div class="speeds" role="group" aria-label="Simulation speed">${[1, 5, 15, 60].map((s) => html`<button key=${s} aria-pressed=${RT.speed === s} onClick=${() => Act.setSpeed(s)}>${s}×</button>`)}</div>
      <button class="btn sm icon ghost" aria-label=${open ? 'Collapse simulation control' : 'Expand simulation control'} aria-expanded=${open} onClick=${() => setUI({ simOpen: !open })}><${Icon} n=${open ? 'down' : 'up'} /></button>
    </div>
    ${open ? html`<div class="simcon-body">
      <div><div class="micro" style=${{ marginBottom: 6 }}>Scenarios · each restarts the shift at 09:38</div>
        ${SCENARIOS.map((s) => html`<button key=${s.n} class="scn" aria-current=${RT.scenario === s.n} onClick=${() => loadScenario(s.n)}><span class="n">${s.n}</span><span class="t">${s.title}</span><span class="d">${s.desc}</span></button>`)}</div>
      <div class="cfg">
        ${Tog({ k: 'autoFeed', label: 'Paint-shop body feed' })}${Tog({ k: 'autoEntryScan', label: 'Auto scan at Scanner 1 (line-in)' })}${Tog({ k: 'autoExitScan', label: 'End-of-line photo-eye at FL7' })}${Tog({ k: 'autoComplete', label: 'Teams finish (sensor detects)' })}
        ${Tog({ k: 'autoRespond', label: 'Simulated responders clear calls' })}${Tog({ k: 'trimAndon', label: 'Trim Andon preview (req 34)' })}${Tog({ k: 'useSchedule', label: 'Breaks and shift times stop the line' })}${Tog({ k: 'engineCheck', label: 'CL2 engine pairing scan (option)' })}
        <label for="cfg-calls">Simulated calls (% of units)</label><input id="cfg-calls" type="number" min="0" max="40" value=${Math.round(C.callRate * 100)} onChange=${(e) => setC('callRate', M.clamp(+e.target.value || 0, 0, 40) / 100)} />
        <label for="cfg-warn">Close to limit at % of takt</label><input id="cfg-warn" type="number" min="50" max="99" value=${Math.round(C.warnPct * 100)} onChange=${(e) => setC('warnPct', M.clamp(+e.target.value || 85, 50, 99) / 100)} />
        <label for="cfg-esc">Escalate overdue after (min)</label><input id="cfg-esc" type="number" min="0.5" max="30" step="0.5" value=${C.escalateAfter / 60} onChange=${(e) => setC('escalateAfter', Math.round(M.clamp(+e.target.value || 3, 0.5, 30) * 60))} />
        <label for="cfg-blk">Blocked alarm after (min)</label><input id="cfg-blk" type="number" min="0.5" max="30" step="0.5" value=${C.blockedAlarmAfter / 60} onChange=${(e) => setC('blockedAlarmAfter', Math.round(M.clamp(+e.target.value || 1.5, 0.5, 30) * 60))} />
        <label for="cfg-rate">Random team delay rate (%)</label><input id="cfg-rate" type="number" min="0" max="30" value=${Math.round(C.delayRate * 100)} onChange=${(e) => setC('delayRate', M.clamp(+e.target.value || 0, 0, 30) / 100)} />
      </div>
      <div><div class="micro" style=${{ marginBottom: 8 }}>Simulated line stop</div><div class="actions">${['TRIM', 'CHASSIS', 'FINAL'].map((a) => html`<button key=${a} class="btn sm sim" onClick=${() => Act.pauseArea(a, !S.paused[a])}><${Icon} n=${S.paused[a] ? 'play' : 'pause'} />${S.paused[a] ? 'Restart ' : 'Stop '}${AREAS[a].short}</button>`)}</div></div>
      <div><div class="micro" style=${{ marginBottom: 8 }}>Resilience (URD req 32–33)</div><div class="actions"><button class="btn sm sim" onClick=${() => setLink(!RT.link.up)}><${Icon} n=${RT.link.up ? 'wifioff' : 'wifi'} />${RT.link.up ? 'Drop head-office link' : 'Restore head-office link'}</button><button class="btn sm sim" disabled=${!!RT.power} onClick=${powerCut}><${Icon} n="power" />Power cut and restart</button></div></div>
      <div><div class="micro" style=${{ marginBottom: 8 }}>Time</div><div class="actions"><button class="btn sm sim" title="Fast-forward the simulation to the next shift, break or restart" onClick=${() => skipAhead()}><${Icon} n="skip" />Skip to ${S.planned ? 'restart' : 'next break or shift change'} · ${fmtClock(M.nextBoundary(S, S.t), false)}</button></div></div>
      <p class="note">Adapter: <b>${M.Integration.mode}</b>. Nothing is sent to any PLC, conveyor, scanner or sensor. Permissives shown in the HMI are simulated interlocks.</p>
    </div>` : null}
  </section>`;
}

/* fast-forward to the next shift boundary (runs the engine; can take a second or two) */
function skipAhead() {
  const S = RT.S, to = M.nextBoundary(S, S.t) + 1;
  Act.skipTo(to);
}

