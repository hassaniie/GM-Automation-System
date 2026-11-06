/* Andon DS · navigation: Rail, the app's page navigation. A slim column on the left with an icon and a
   visible label per page; the current page is marked. Page status and alerts stay in the top bar. */
import { html } from '../lib/runtime.js';
import { Icon } from '../lib/ui-kit.js';
import { cx } from './layout.js';

/**
 * @param {{ items: { value: string, label: string, icon: string, end?: boolean }[], value: string,
 *   onChange: (v: string) => void, label?: string }} p
 * end: the item sits at the bottom of the rail (help, guide).
 */
export function Rail({ items, value, onChange, label = 'Pages' }) {
  const onKey = (e) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const btns = [...e.currentTarget.querySelectorAll('.ds-rail__item')], i = btns.indexOf(document.activeElement);
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length;
    btns[n]?.focus(); e.preventDefault();
  };
  const item = (it) => html`<button key=${it.value} type="button" class=${cx('ds-rail__item', it.end && 'ds-rail__item--end')}
    aria-current=${value === it.value ? 'page' : null} onClick=${() => onChange(it.value)}><${Icon} n=${it.icon} size=${20} /><span>${it.label}</span></button>`;
  return html`<nav class="ds-rail" aria-label=${label} onKeyDown=${onKey}>${items.map(item)}</nav>`;
}
