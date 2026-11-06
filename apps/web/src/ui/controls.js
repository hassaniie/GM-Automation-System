/* Andon DS · controls: Button, IconButton, SegmentedControl, Switch, Checkbox.
   Sizes follow the device: 36 px with a mouse, 44 px on touch screens, 56 px with "Large touch targets". */
import React from 'react';
import { html } from '../lib/runtime.js';
import { Icon } from '../lib/ui-kit.js';
import { cx } from './layout.js';

/**
 * @param {{ variant?: 'primary'|'secondary'|'ghost'|'danger', tone?: 'normal'|'warning'|'critical'|'sim'|'sup'|'mnt',
 *   size?: 'sm'|'md'|'lg', icon?: string, iconRight?: string, loading?: boolean, pressed?: boolean, full?: boolean,
 *   href?: string, children?: any }} p
 * variant: primary = the one main action; secondary = default; ghost = low emphasis; danger = destructive.
 * tone: colours a secondary button for a domain action (a call type, simulator control); pressed fills it.
 */
export function Button({ variant = 'secondary', tone, size = 'md', icon, iconRight, loading, pressed, full, href, class: cls, children, type = 'button', disabled, ...rest }) {
  const c = cx('ds-btn', `ds-btn--${variant}`, `ds-btn--${size}`, tone && `ds-tone-${tone}`, full && 'ds-btn--full', !children && 'ds-btn--icon', cls);
  const body = html`${icon ? html`<${Icon} n=${icon} />` : null}${children}${iconRight ? html`<${Icon} n=${iconRight} />` : null}`;
  if (href) return html`<a class=${c} href=${disabled ? undefined : href} aria-disabled=${disabled ? 'true' : undefined} ...${rest}>${body}</a>`;
  return html`<button type=${type} class=${c} disabled=${disabled} aria-busy=${loading ? 'true' : undefined} aria-pressed=${pressed === undefined ? undefined : !!pressed} ...${rest}>${body}</button>`;
}

/** A button with only an icon. `label` is required: it is the accessible name and the tooltip. */
export function IconButton({ icon, label, size = 'md', variant = 'ghost', title, ...rest }) {
  return html`<${Button} variant=${variant} size=${size} icon=${icon} aria-label=${label} title=${title || label} ...${rest} />`;
}

/**
 * One choice from a few options (speed 1×/5×/15×, view, line). Arrow keys move the choice.
 * @param {{ value: any, options: { value: any, label: any, icon?: string, title?: string }[], onChange: (v: any) => void, label: string, size?: 'sm'|'md' }} p
 */
export function SegmentedControl({ value, options, onChange, label, size = 'md', class: cls }) {
  const key = (e, i) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + options.length) % options.length;
    onChange(options[n].value);
    const next = e.currentTarget.parentElement.children[n]; if (next) next.focus();
  };
  return html`<div class=${cx('ds-seg', `ds-seg--${size}`, cls)} role="radiogroup" aria-label=${label}>${options.map((o, i) => html`<button key=${String(o.value)} type="button" role="radio" aria-checked=${o.value === value} tabindex=${o.value === value ? 0 : -1} title=${o.title} onClick=${() => onChange(o.value)} onKeyDown=${(e) => key(e, i)}>${o.icon ? html`<${Icon} n=${o.icon} />` : null}${o.label}</button>`)}</div>`;
}

/** On/off setting. The label is required (visible, or given as `label` for an icon row). */
export function Switch({ checked, onChange, label, id, disabled, hint }) {
  const auto = React.useId(), sid = id || auto;
  return html`<span class="ds-switch-row"><button id=${sid} type="button" class="ds-switch" role="switch" aria-checked=${!!checked} disabled=${disabled} onClick=${() => onChange(!checked)}></button><span class="ds-switch__state" aria-hidden="true">${checked ? 'On' : 'Off'}</span>${label ? html`<label for=${sid}>${label}${hint ? html`<small>${hint}</small>` : null}</label>` : null}</span>`;
}

/**
 * A checkbox with its label. Use it to confirm a consequence ("The unit leaves the line now…") or for a
 * yes/no option that takes effect on submit; use Switch for a setting that applies at once.
 * @param {{ checked: boolean, onChange: (v: boolean) => void, children?: any, id?: string, disabled?: boolean,
 *   boxed?: boolean, tone?: 'normal'|'critical', class?: string }} p
 * boxed: a bordered row that fills when checked, for confirmations in dialogs.
 */
export function Checkbox({ checked, onChange, children, id, disabled, boxed, tone = 'normal', class: k }) {
  const auto = React.useId(), cid = id || auto;
  return html`<label class=${cx('ds-check', boxed && 'ds-check--boxed', tone === 'critical' && 'ds-check--critical', k)} for=${cid}>
    <input id=${cid} type="checkbox" class="ds-check__box" checked=${!!checked} disabled=${disabled} onChange=${(e) => onChange(e.target.checked)} /><span>${children}</span></label>`;
}
