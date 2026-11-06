/* Andon DS · navigation and overlays: Tabs, Menu, Dialog, Drawer.
   Keyboard: tabs and menus move with the arrow keys; dialogs and drawers keep focus inside, close with
   Escape and give focus back to whatever opened them. */
import React from 'react';
import { html } from '../lib/runtime.js';
import { Icon } from '../lib/ui-kit.js';
import { usePopover } from '../lib/fit.js';
import { IconButton } from './controls.js';
import { cx } from './layout.js';

/**
 * @param {{ value: string, onChange: (v: string) => void, items: { value: string, label: any, icon?: string, count?: any, title?: string }[], label: string, vertical?: boolean }} p
 */
export function Tabs({ value, onChange, items, label, vertical, class: cls }) {
  const key = (e, i) => {
    const fwd = vertical ? 'ArrowDown' : 'ArrowRight', back = vertical ? 'ArrowUp' : 'ArrowLeft';
    const d = e.key === fwd ? 1 : e.key === back ? -1 : e.key === 'Home' ? -i : e.key === 'End' ? items.length - 1 - i : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + items.length) % items.length;
    onChange(items[n].value);
    const next = e.currentTarget.parentElement.children[n]; if (next) next.focus();
  };
  return html`<div class=${cx('ds-tabs', vertical && 'ds-tabs--vertical', cls)} role="tablist" aria-label=${label} aria-orientation=${vertical ? 'vertical' : 'horizontal'}>${items.map((t, i) => html`<button key=${t.value} type="button" role="tab" aria-selected=${t.value === value} tabindex=${t.value === value ? 0 : -1} title=${t.title} onClick=${() => onChange(t.value)} onKeyDown=${(e) => key(e, i)}>${t.icon ? html`<${Icon} n=${t.icon} />` : null}<span>${t.label}</span>${t.count != null ? html`<span class="ds-tabs__n">${t.count}</span>` : null}</button>`)}</div>`;
}

/**
 * A button that opens a list of actions. items: { label, icon?, onSelect, hint?, danger? } or 'separator'.
 * @param {{ trigger: (p: any) => any, items: any[], label: string, align?: 'start'|'end', width?: number }} p
 */
export function Menu({ trigger, items, label, align = 'end', width = 260, class: cls }) {
  const [open, setOpen] = React.useState(false), btn = React.useRef(null), pop = React.useRef(null);
  usePopover(open, setOpen, btn, pop);
  const key = (e) => {
    if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const all = [...pop.current.querySelectorAll('[role="menuitem"]:not([disabled])')], i = all.indexOf(document.activeElement);
    const n = all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]; if (n) n.focus();
  };
  return html`<div class=${cx('ds-menu', cls)}>
    ${trigger({ ref: btn, 'aria-haspopup': 'menu', 'aria-expanded': open, onClick: () => setOpen(!open) })}
    ${open ? html`<div class=${cx('ds-menu__pop', `ds-menu__pop--${align}`)} role="menu" aria-label=${label} ref=${pop} style=${{ width }} onKeyDown=${key}>
      ${items.map((it, i) => (it === 'separator' ? html`<hr key=${i} class="ds-menu__sep" />` : html`<button key=${i} type="button" role="menuitem" class=${cx('ds-menu__item', it.danger && 'ds-menu__item--danger')} disabled=${it.disabled} onClick=${() => { setOpen(false); it.onSelect(); }}>${it.icon ? html`<${Icon} n=${it.icon} />` : null}<span>${it.label}</span>${it.hint ? html`<small>${it.hint}</small>` : null}</button>`))}
    </div>` : null}
  </div>`;
}

/** Keeps keyboard focus inside `ref` while open; restores it to the opener on close. */
function useFocusTrap(ref, onClose) {
  React.useEffect(() => {
    const opener = document.activeElement, box = ref.current; if (!box) return undefined;
    const focusables = () => [...box.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((e) => !e.disabled && e.offsetParent !== null);
    // start on the marked field, else the first form field, else the first control
    const first = box.querySelector('[data-autofocus]') || box.querySelector('.ds-dialog__body :is(input, select, textarea):not(:disabled), .ds-drawer__body :is(input, select, textarea):not(:disabled)') || focusables()[0] || box;
    first.focus();
    const key = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables(); if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    box.addEventListener('keydown', key);
    return () => { box.removeEventListener('keydown', key); if (opener && opener.focus) opener.focus(); };
  }, []);
}

/**
 * A modal dialog: label, title, optional tag, body, footer actions. Closes with Escape, the close button
 * or a click on the backdrop. size sm 420 · md 540 · lg 900.
 * @param {{ k?: any, title: any, tag?: any, onClose: () => void, footer?: any, size?: 'sm'|'md'|'lg', children: any }} p
 */
export function Dialog({ k, title, tag, onClose, footer, size = 'md', children, class: cls }) {
  const ref = React.useRef(null), auto = React.useId(), hid = `dlg${auto.replace(/:/g, '')}`;
  useFocusTrap(ref, onClose);
  return html`<div class="scrim ds-scrim" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <div ref=${ref} class=${cx('glass ds-dialog ticks', `ds-dialog--${size}`, cls)} role="dialog" aria-modal="true" aria-labelledby=${hid} tabindex="-1">
      <div class="ds-dialog__head"><div class="ds-dialog__titles">${k ? html`<div class="ds-label">${k}</div>` : null}<h3 id=${hid}>${title}</h3></div>${tag || null}<${IconButton} icon="x" label="Close" size="sm" onClick=${onClose} /></div>
      <div class="ds-dialog__body">${children}</div>
      ${footer ? html`<div class="ds-dialog__foot">${footer}</div>` : null}
    </div></div>`;
}

/**
 * A side sheet (alarms, calls). Not modal over the floor: Escape closes it; focus moves in when it opens.
 * @param {{ title: any, k?: any, onClose: () => void, actions?: any, width?: number, children: any }} p
 */
export function Drawer({ title, k, onClose, actions, width = 460, children, class: cls, label }) {
  const ref = React.useRef(null);
  useFocusTrap(ref, onClose);
  return html`<aside ref=${ref} class=${cx('glass ds-drawer ticks', cls)} style=${{ width: `min(${width}px, calc(100vw - 32px))` }} aria-label=${label || (typeof title === 'string' ? title : undefined)} tabindex="-1">
    <div class="ds-drawer__head"><div class="ds-dialog__titles">${k ? html`<div class="ds-label">${k}</div>` : null}<h3>${title}</h3></div>${actions || null}<${IconButton} icon="x" label="Close" size="sm" onClick=${onClose} /></div>
    <div class="ds-drawer__body">${children}</div></aside>`;
}
