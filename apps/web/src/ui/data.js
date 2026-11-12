/* Andon DS · containers and data display: Panel, Stat, Meter, DataTable, Tag, Notice, PageHeader,
   EmptyState, Skeleton. Status always pairs colour with an icon or text (never colour alone). */
import { fmtDur, html } from '../lib/runtime.js';
import { Icon } from '../lib/ui-kit.js';
import { cx } from './layout.js';

/** Tone names → CSS colours (semantic status tokens). null = neutral (ISA-101: normal is quiet). */
export const TONE = {
  normal: 'var(--ds-status-normal)', warning: 'var(--ds-status-warning)', critical: 'var(--ds-status-critical)',
  escalated: 'var(--ds-status-escalated)', held: 'var(--ds-status-held)', moving: 'var(--ds-status-moving)',
  paused: 'var(--ds-status-paused)', sim: 'var(--ds-status-sim)', sup: 'var(--ds-call-sup)', mnt: 'var(--ds-call-mnt)',
};
const TONE_ICON = { normal: 'check', warning: 'hour', critical: 'alert', escalated: 'siren', held: 'pause', moving: 'arrow', paused: 'pause', sim: 'flask', info: 'info' };

/**
 * A container. variant: plain (on a page) · glass (floating over the 3D floor only) · flush (no frame).
 * ticks: corner ticks, for primary objects only. Header: title, sub, actions.
 * @param {{ variant?: 'plain'|'glass'|'flush', ticks?: boolean, title?: any, sub?: any, actions?: any, edge?: string, pad?: number, as?: string }} p
 */
export function Panel({ variant = 'plain', ticks, title, sub, actions, edge, pad = 4, class: cls, style, children, id, ...rest }) {
  return html`<section id=${id} class=${cx('ds-panel', `ds-panel--${variant}`, ticks && 'ticks', cls)} style=${{ '--pad': `var(--ds-space-${pad})`, '--edge': edge && (TONE[edge] || edge), ...style }} ...${rest}>
    ${title || actions ? html`<header class="ds-panel__head"><div class="ds-panel__titles">${title ? html`<h3 class="ds-panel__title">${title}</h3>` : null}${sub ? html`<p class="ds-panel__sub">${sub}</p>` : null}</div>${actions ? html`<div class="ds-panel__actions">${actions}</div>` : null}</header>` : null}
    ${children}
  </section>`;
}

/**
 * A figure with its label. tone colours the value only when it is a problem.
 * @param {{ label: any, value: any, unit?: any, target?: any, delta?: any, tone?: string|null, size?: 'sm'|'md'|'lg'|'display', title?: string }} p
 */
export function Stat({ label, value, unit, target, delta, deltaTone, tone, size = 'md', title, class: cls }) {
  return html`<div class=${cx('ds-stat', `ds-stat--${size}`, cls)} title=${title}>
    <span class="ds-stat__label">${label}</span>
    <span class="ds-stat__value" style=${{ color: tone ? TONE[tone] || tone : null }}>${value}${target != null ? html`<small> / ${target}</small>` : null}${unit ? html`<small>${unit}</small>` : null}</span>
    ${delta != null ? html`<span class="ds-stat__delta" style=${{ color: deltaTone ? TONE[deltaTone] || deltaTone : null }}>${delta}</span>` : null}
  </div>`;
}

/**
 * Progress against a whole, with an optional marker (plan / takt). value and marker are 0..1 of the track.
 * @param {{ value: number, marker?: number, tone?: string|null, label: string, size?: 'sm'|'md', valueText?: string }} p
 */
export function Meter({ value, marker, tone, label, size = 'md', valueText, class: cls, style }) {
  const v = Math.max(0, Math.min(1, value || 0));
  return html`<span class=${cx('ds-meter', `ds-meter--${size}`, cls)} style=${style} role="meter" aria-label=${label} aria-valuemin="0" aria-valuemax="100" aria-valuenow=${Math.round(v * 100)} aria-valuetext=${valueText}>
    <i style=${{ width: `${v * 100}%`, background: tone ? TONE[tone] || tone : null }}></i>${marker != null ? html`<b style=${{ left: `${Math.max(0, Math.min(1, marker)) * 100}%` }}></b>` : null}</span>`;
}

const ALIGN = { text: 'start', number: 'end', time: 'end', duration: 'end', vin: 'start', code: 'start', status: 'start', action: 'end' };
/**
 * A table. columns: { key, label, type?: text|number|time|duration|vin|code|status|action, render?: (row) => any, width? }.
 * rows: data objects (key: rowKey). status(row) → tone name for a row edge. Shows empty, loading and error rows.
 * @param {{ columns: any[], rows: any[]|null, rowKey?: (r: any, i: number) => any, empty?: any, error?: any, density?: 'compact'|'comfortable', status?: (r: any) => string|null, caption?: string, onRow?: (r: any) => void }} p
 */
export function DataTable({ columns, rows, rowKey = (_r, i) => i, empty = 'Nothing to show.', error, density = 'compact', status, caption, onRow, class: cls, rowClass }) {
  const cell = (c, r) => (c.render ? c.render(r) : c.type === 'duration' ? (r[c.key] == null ? '—' : fmtDur(r[c.key])) : r[c.key] ?? '—');
  const n = columns.length;
  return html`<div class=${cx('ds-table-wrap', cls)}><table class=${cx('ds-table', `ds-table--${density}`)}>
    ${caption ? html`<caption class="ds-vh">${caption}</caption>` : null}
    <thead><tr>${columns.map((c) => html`<th key=${c.key} scope="col" class=${`ds-a-${ALIGN[c.type] || 'start'}`} style=${{ width: c.width }}>${c.label || html`<span class="ds-vh">${c.srLabel || (c.type === 'action' ? 'Actions' : 'Chart')}</span>`}</th>`)}</tr></thead>
    <tbody>${error ? html`<tr><td colspan=${n} class="ds-table__msg ds-table__msg--error">${error}</td></tr>`
      : rows == null ? [0, 1, 2].map((i) => html`<tr key=${i}><td colspan=${n}><${Skeleton} /></td></tr>`)
      : !rows.length ? html`<tr><td colspan=${n} class="ds-table__msg">${empty}</td></tr>`
      : rows.map((r, i) => { const t = status && status(r); return html`<tr key=${rowKey(r, i)} class=${cx(t && 'ds-row-status', onRow && 'ds-row-link', rowClass && rowClass(r))} style=${{ '--edge': t ? TONE[t] : null }} onClick=${onRow ? () => onRow(r) : undefined}>${columns.map((c) => html`<td key=${c.key} class=${cx(`ds-a-${ALIGN[c.type] || 'start'}`, ['number', 'time', 'duration', 'vin', 'code'].includes(c.type) && 'ds-num', c.wrap && 'ds-wrap')}>${cell(c, r)}</td>`)}</tr>`; })}
    </tbody></table></div>`;
}

/** A short label with a tone and icon (status, mode, type). */
export function Tag({ tone, icon, children, title, class: cls, variant = 'outline' }) {
  const ic = icon === undefined ? TONE_ICON[tone] : icon;
  return html`<span class=${cx('ds-tag', `ds-tag--${variant}`, cls)} style=${{ '--tone': tone ? TONE[tone] || tone : null }} title=${title}>${ic ? html`<${Icon} n=${ic} size=${11} />` : null}${children}</span>`;
}

/**
 * A message. kind: info · success · warning · error · critical. Errors and critical are announced at once.
 * @param {{ kind?: 'info'|'success'|'warning'|'error'|'critical', title?: any, children?: any, actions?: any }} p
 */
export function Notice({ kind = 'info', title, children, actions, class: cls, style }) {
  const tone = { info: null, success: 'normal', warning: 'warning', error: 'critical', critical: 'critical' }[kind];
  const icon = { info: 'info', success: 'check', warning: 'hour', error: 'alert', critical: 'siren' }[kind];
  return html`<div class=${cx('ds-notice', `ds-notice--${kind}`, cls)} style=${{ '--tone': tone ? TONE[tone] : null, ...style }} role=${kind === 'error' || kind === 'critical' ? 'alert' : 'status'}>
    <${Icon} n=${icon} /><div class="ds-notice__body">${title ? html`<b class="ds-notice__title">${title}</b>` : null}${children ? html`<div>${children}</div>` : null}</div>${actions ? html`<div class="ds-notice__actions">${actions}</div>` : null}</div>`;
}

/** The top of every page: section label, title, sub-line, actions. */
export function PageHeader({ k, title, sub, children }) {
  return html`<div class="ds-page-head"><div class="ds-page-head__titles">${k ? html`<div class="ds-label">${k}</div>` : null}<h2>${title}</h2>${sub ? html`<p class="ds-page-head__sub">${sub}</p>` : null}</div>${children ? html`<div class="ds-page-head__actions">${children}</div>` : null}</div>`;
}

/** Nothing here yet: an icon, a sentence and an optional action. */
export function EmptyState({ icon = 'info', title, children, action }) {
  return html`<div class="ds-empty"><${Icon} n=${icon} size=${28} />${title ? html`<h3>${title}</h3>` : null}${children ? html`<p>${children}</p>` : null}${action || null}</div>`;
}

/** Loading placeholder. */
export function Skeleton({ width = '100%', height = 12 }) {
  return html`<span class="ds-skeleton" aria-hidden="true" style=${{ width, height }}></span>`;
}
