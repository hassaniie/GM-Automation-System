/* Andon DS · components as they exist today (release 1). These are the baseline the next steps rebuild
   into proper components (Button, Stat, StationCell, LineLane …). The floor stories use a simulated plant
   frozen at 09:50 on a normal shift. */
import { M, RT, html } from '../lib/runtime.js';
import { Icon, LevelChip, StatusChip, VinText } from '../lib/ui-kit.js';
import { ActIsland, StateIsland, Strip } from '../floor/islands.js';

function plant() {
  if (!RT.S) { RT.S = M.createState(11, { delayRate: 0.04 }); M.runUntil(RT.S, 9 * 3600 + 50 * 60); RT.running = false; }
  RT.route = RT.route || { page: 'floor', sub: null };
  return RT.S;
}
const Page = ({ title, intro, children }) => html`<div class="cat"><div><h1>${title}</h1>${intro ? html`<p>${intro}</p>` : null}</div>${children}</div>`;

export default { title: 'Components' };

const ICONS = ['search', 'scanin', 'scanout', 'xray', 'bell', 'alert', 'fault', 'hour', 'pause', 'check', 'clock', 'user', 'wrench', 'siren', 'flask', 'link', 'wifi', 'wifioff', 'chart', 'cog', 'tv', 'layers', 'map', 'download', 'file', 'more'];
export const Icons = {
  render: () => html`<${Page} title="Icons" intro="One stroke icon set (16–24 px). Every status icon pairs with a colour, never replaces the label.">
    <div class="cat-grid">${ICONS.map((n) => html`<div key=${n} class="cat-sw" style=${{ display: 'flex', alignItems: 'center', gap: 10 }}><${Icon} n=${n} />${n}</div>`)}</div>
  </${Page}>`,
};

export const Buttons = {
  render: () => html`<${Page} title="Buttons" intro="Today's button classes. Step C replaces them with one Button component (primary / secondary / ghost / danger; sm, md, lg, xl).">
    <div class="cat-row"><button class="btn primary">Primary</button><button class="btn">Secondary</button><button class="btn ghost">Ghost</button><button class="btn danger">Danger</button><button class="btn" disabled>Disabled</button></div>
    <div class="cat-row"><button class="btn sm primary">Small primary</button><button class="btn sm">Small</button><button class="btn sm ghost icon"><${Icon} n="search" /></button></div>
  </${Page}>`,
};

export const Chips = {
  render: () => {
    const st = (code, label, tone) => ({ code, label, tone });
    return html`<${Page} title="Status chips and levels" intro="Status chips name a station's state; level chips name an alarm's priority.">
      <div class="cat-row">
        <${StatusChip} st=${st('WORKING', 'Working', 'ok')} /><${StatusChip} st=${st('NEAR', 'Close to takt', 'warn')} /><${StatusChip} st=${st('OVERDUE', 'Over takt', 'crit')} />
        <${StatusChip} st=${st('WAITING', 'Waiting · held', 'hold')} /><${StatusChip} st=${st('PAUSED', 'Planned stop', 'paused')} />
      </div>
      <div class="cat-row">${['WARNING', 'OVERDUE', 'ESCALATED', 'FAULT', 'BLOCKED', 'CALL_SUP', 'CALL_MNT', 'EMERGENCY'].map((l) => html`<${LevelChip} key=${l} a=${{ level: l }} />`)}</div>
      <div class="cat-row"><span class="sim-tag"><${Icon} n="flask" size=${10} />SIMULATION</span><span class="sim-tag edge"><${Icon} n="flask" size=${10} />SIM · EDGE</span><span class="sim-tag live"><${Icon} n="link" size=${10} />LIVE</span><span class="sim-tag down"><${Icon} n="wifioff" size=${10} />DEVICE DOWN</span></div>
      <div class="cat-row"><${VinText} vin="LSJA2YH49TP248214" /><${VinText} vin="LSJA2YH49TP248214" big /></div>
    </${Page}>`;
  },
};

/* ── floor chrome, in a stage that behaves like the floor page ── */
const Stage = ({ width, children }) => html`<div class="cat-stage" style=${{ width, height: 220 }}>${children}</div>`;

export const TopBarStatus = {
  name: 'Top bar · status and actions',
  render: () => { plant(); return html`<${Page} title="Top bar" intro="The floor top bar's status and actions with three amounts of room (identity and navigation left out). The status row keeps line state and completed / target, folds the rest into More by priority, and the tools fold into one menu.">
    ${[640, 900, 1300].map((w) => html`<div key=${w}><h2>${w} px of room</h2><div style=${{ width: w, maxWidth: '100%', overflow: 'hidden' }}><header class="glass hud ticks" style=${{ position: 'relative', inset: 'auto' }}><div></div><div></div><${StateIsland} /><${ActIsland} /></header></div></div>`)}
  </${Page}>`; },
};

export const StationStrip = {
  name: 'Station strip',
  render: () => { plant(); return html`<${Page} title="Station strip" intro="Fixed height, never scrolls. Lanes share the width by station count; cells show ID, progress and timer when wide, ID and status mark when narrow. Status is a coloured top edge plus an icon.">
    ${[1024, 1440, 1920].map((w) => html`<div key=${w}><h2>${w} px</h2><${Stage} width=${w}><${Strip} /></${Stage}></div>`)}
  </${Page}>`; },
};
