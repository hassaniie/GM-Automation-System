/* Andon DS · foundations: the tokens every screen is built from (styles/tokens). */
import React from 'react';
import { html } from '../lib/runtime.js';
import { Icon } from '../lib/ui-kit.js';
import { Button, Panel } from '../ui/index.js';

export default { title: 'Foundations' };

/* WCAG contrast of two computed colours */
function lum(rgb) { const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
function contrast(a, b) { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }
function rgbOf(el, prop) { const m = getComputedStyle(el)[prop].match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : [0, 0, 0]; }

/** A swatch that shows its token, and its contrast against the page background. */
function Swatch({ token, note, min = 4.5 }) {
  const ref = React.useRef(null), [ratio, setRatio] = React.useState(null);
  React.useEffect(() => { const el = ref.current; if (!el) return; setRatio(contrast(rgbOf(el, 'backgroundColor'), rgbOf(document.querySelector('.cat'), 'backgroundColor'))); });
  return html`<div class="cat-sw"><i ref=${ref} style=${{ background: `var(${token})` }}></i>${token}${note ? html`<small>${note}</small>` : null}
    ${ratio != null ? html`<small style=${{ color: ratio >= min ? null : 'var(--ds-status-critical)' }}>${ratio.toFixed(2)} : 1 on background ${ratio >= min ? '' : `(below ${min})`}</small>` : null}</div>`;
}

const Page = ({ title, intro, children }) => html`<div class="cat"><div><h1>${title}</h1>${intro ? html`<p>${intro}</p>` : null}</div>${children}</div>`;

export const Colour = {
  render: () => html`<${Page} title="Colour" intro="Semantic colour tokens (styles/tokens/semantic.css). Components use these, never raw values. Text needs 4.5 : 1 against the background; status marks need 3 : 1.">
    <section><h2>Text</h2><div class="cat-grid">${['--ds-text-primary', '--ds-text-secondary', '--ds-text-muted'].map((t) => html`<${Swatch} key=${t} token=${t} />`)}</div></section>
    <section><h2>Surfaces and borders</h2><div class="cat-grid">${[['--ds-bg', 'page'], ['--ds-layer-1', 'panel'], ['--ds-layer-2', 'hover / nested'], ['--ds-layer-solid', 'opaque panel over 3D'], ['--ds-border-subtle', 'hairline'], ['--ds-border-strong', 'emphasis']].map(([t, n]) => html`<${Swatch} key=${t} token=${t} note=${n} min=${0} />`)}</div></section>
    <section><h2>Brand (identity only, never a status)</h2><div class="cat-grid"><${Swatch} token="--ds-brand" note="MG red" min=${0} /></div></section>
  </${Page}>`,
};

const STATUS = [
  ['--ds-status-normal', 'Normal / running', 'check', 'Used sparingly: a running line is mostly neutral (ISA-101).'],
  ['--ds-status-warning', 'Warning / close to limit', 'hour', 'Close to takt, behind plan.'],
  ['--ds-status-critical', 'Critical / over limit', 'alert', 'Over takt, fault, line stopped. Only for problems.'],
  ['--ds-status-escalated', 'Escalated', 'siren', 'Unresolved past the escalation time.'],
  ['--ds-status-held', 'Held / waiting', 'pause', 'Work done, held by a downstream station.'],
  ['--ds-status-moving', 'Moving', 'arrow', 'Carrier in transit.'],
  ['--ds-status-paused', 'Paused / planned stop', 'pause', 'Breaks and planned stops.'],
  ['--ds-status-sim', 'Simulation', 'flask', 'Data is simulated.'],
  ['--ds-call-sup', 'Supervisor call', 'user', ''],
  ['--ds-call-mnt', 'Maintenance call', 'wrench', ''],
];
export const Status = {
  name: 'Status',
  render: () => html`<${Page} title="Status vocabulary" intro="One colour, icon and word per state, the same on the floor, the strip, the dashboard, the TV, reports and in 3D. Status is never shown by colour alone.">
    <div class="cat-grid">${STATUS.map(([t, label, icon, note]) => html`<div key=${t} class="cat-sw"><span style=${{ color: `var(${t})`, display: 'flex', gap: 8, alignItems: 'center', fontFamily: 'var(--ds-font-ui)', fontSize: 14, fontWeight: 600 }}><${Icon} n=${icon} />${label}</span><small>${t}</small>${note ? html`<small>${note}</small>` : null}<${Swatch} token=${t} min=${3} /></div>`)}</div>
  </${Page}>`,
};

const TYPE = [['Display (TV)', '--ds-size-72', 300, 'mono'], ['KPI large', '--ds-size-48', 300, 'mono'], ['KPI', '--ds-size-32', 300, 'mono'], ['Heading 1', '--ds-size-24', 600, 'ui'], ['Heading 2', '--ds-size-20', 600, 'ui'], ['Heading 3', '--ds-size-16', 600, 'ui'], ['Body', '--ds-size-14', 400, 'ui'], ['Body small', '--ds-size-13', 400, 'ui'], ['Label', '--ds-size-12', 500, 'ui'], ['Micro label', '--ds-size-11', 600, 'ui']];
export const Type = {
  render: () => html`<${Page} title="Type" intro="Barlow for interface text, JetBrains Mono for numbers, codes and VINs (tabular figures).">
    <div>${TYPE.map(([n, t, w, f]) => html`<div key=${n} class="cat-type"><code>${n} · ${t}</code><span style=${{ fontSize: `var(${t})`, fontWeight: w, fontFamily: f === 'mono' ? 'var(--ds-font-mono)' : 'var(--ds-font-ui)', letterSpacing: n === 'Micro label' ? 'var(--ds-tracking-label)' : null, textTransform: n === 'Micro label' ? 'uppercase' : null }}>${f === 'mono' ? '09:50 · 15/30' : 'General Assembly · Shift A'}</span></div>`)}</div>
  </${Page}>`,
};

export const Spacing = {
  render: () => html`<${Page} title="Spacing" intro="A 4-px scale. Every padding and gap uses one of these.">
    <div style=${{ display: 'grid', gap: 10 }}>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => html`<div key=${n} class="cat-space"><span style=${{ width: 110 }}>--ds-space-${n}</span><i style=${{ width: `var(--ds-space-${n})` }}></i></div>`)}</div>
  </${Page}>`,
};

export const CornersAndTicks = {
  name: 'Corners and ticks',
  render: () => html`<${Page} title="Corners and corner ticks" intro="4 px for boxes and controls, 3 px for small items, round only for dots and avatars. Corner ticks follow the same curve; they mark primary objects only.">
    <div class="cat-row">
      <div class="cat-box" style=${{ borderRadius: 'var(--ds-radius-md)' }}>--ds-radius-md · 4 px</div>
      <div class="cat-box" style=${{ borderRadius: 'var(--ds-radius-sm)', width: 120, height: 60 }}>--ds-radius-sm · 3 px</div>
      <${Panel} ticks=${true} style=${{ width: 220 }}>panel with ticks<//>
      <span class="sim-tag"><${Icon} n="flask" size=${10} />Chip · 3 px</span>
      <${Button}>Button<//><${Button} variant="primary">Primary<//>
    </div>
  </${Page}>`,
};

export const Elevation = {
  render: () => html`<${Page} title="Elevation" intro="Layer 0 is the page; layer 1 panels have a border and no shadow; layer 2 is glass, only for panels floating over the 3D floor; layer 3 is overlays (dialog, drawer, menu).">
    <div class="cat-row">
      <div class="cat-box">Layer 0 · page</div>
      <${Panel} style=${{ width: 160, height: 96, placeItems: 'center' }}>Layer 1 · panel<//>
      <div class="cat-box glass" style=${{ position: 'relative' }}>Layer 2 · glass</div>
      <div class="cat-box glass umenu-pop" style=${{ position: 'relative', top: 0, width: 160 }}>Layer 3 · overlay</div>
    </div>
  </${Page}>`,
};

export const Motion = {
  render: () => html`<${Page} title="Motion" intro="fast 120 ms (hover, press), base 200 ms (open, close), slow 320 ms (camera, large panels). Turned off for people who ask for reduced motion, except alarm flashing, which becomes a static mark.">
    ${['--ds-dur-fast', '--ds-dur-base', '--ds-dur-slow'].map((t) => html`<div key=${t} class="cat-space cat-motion"><span style=${{ width: 120 }}>${t}</span><i style=${{ animationDuration: `calc(var(${t}) * 8)` }}></i></div>`)}
  </${Page}>`,
};

export const Layers = {
  render: () => html`<${Page} title="Stacking layers" intro="Named layers replace raw z-index numbers, so panels, menus and alarms never cover each other by accident.">
    <div class="cat-grid">${[['scene', '3D floor'], ['scene-tags', 'labels in the 3D floor'], ['chrome', 'top bar, strip'], ['panel', 'inspector, console'], ['drawer', 'alarm and call drawer'], ['overlay', 'dialogs, menus'], ['toast', 'notices'], ['critical', 'emergency banner']].map(([k, n]) => html`<div key=${k} class="cat-sw">--ds-z-${k}<small>${n}</small></div>`)}</div>
  </${Page}>`,
};
