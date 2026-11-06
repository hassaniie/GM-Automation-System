/* Andon DS · layout helpers. Replace inline layout styles (display, gap, columns) with three primitives.
   gap is a spacing step (1–10 → --ds-space-N). */
import { html } from '../lib/runtime.js';

const cx = (...c) => c.filter(Boolean).join(' ');

/** Vertical stack. @param {{ gap?: number, align?: string, as?: string, class?: string, children?: any }} p */
export function Stack({ gap = 3, align, class: cls, style, children, ...rest }) {
  return html`<div class=${cx('ds-stack', cls)} style=${{ '--gap': `var(--ds-space-${gap})`, alignItems: align, ...style }} ...${rest}>${children}</div>`;
}

/** Horizontal row that wraps. @param {{ gap?: number, justify?: string, align?: string, nowrap?: boolean }} p */
export function Cluster({ gap = 2, justify, align = 'center', nowrap, class: cls, style, children, ...rest }) {
  return html`<div class=${cx('ds-cluster', nowrap && 'ds-cluster--nowrap', cls)} style=${{ '--gap': `var(--ds-space-${gap})`, justifyContent: justify, alignItems: align, ...style }} ...${rest}>${children}</div>`;
}

/** Responsive grid: as many columns of at least `min` px as fit. @param {{ min?: number, gap?: number }} p */
export function Grid({ min = 220, gap = 3, class: cls, style, children, ...rest }) {
  return html`<div class=${cx('ds-grid', cls)} style=${{ '--gap': `var(--ds-space-${gap})`, '--min': `${min}px`, ...style }} ...${rest}>${children}</div>`;
}

export { cx };
