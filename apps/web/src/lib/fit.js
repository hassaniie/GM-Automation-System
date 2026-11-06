/* Priority+ fitting (design system): a row shows as many of its items as fit, dropping the lowest-priority
   ones first; the dropped ones are listed in a "More" menu. Items are children marked
   data-fit="<key>" data-priority="<n>" (1 = most important, never dropped).
   Widths are remembered while an item is visible, so a dropped item comes back as soon as there is room. */
import React from 'react';

export function useFit(ref, reserve = 56) {
  const [hidden, setHidden] = React.useState(() => new Set());
  const widths = React.useRef(new Map());
  const decide = React.useCallback(() => {
    const box = ref.current; if (!box) return;
    const items = [...box.querySelectorAll(':scope > [data-fit]')];
    for (const el of items) if (el.offsetWidth) widths.current.set(el.dataset.fit, el.offsetWidth);
    const order = items.map((el) => ({ key: el.dataset.fit, p: Number(el.dataset.priority) || 9, w: widths.current.get(el.dataset.fit) || el.offsetWidth })).sort((a, b) => a.p - b.p);
    const total = order.reduce((s, x) => s + x.w, 0), room = box.clientWidth;
    const next = new Set();
    if (total > room) {
      let used = reserve; // the More button
      for (const x of order) { if (x.p <= 1 || used + x.w <= room) used += x.w; else next.add(x.key); }
    }
    setHidden((prev) => (prev.size === next.size && [...next].every((k) => prev.has(k)) ? prev : next));
  }, [ref, reserve]);
  React.useLayoutEffect(decide);
  React.useEffect(() => {
    const box = ref.current; if (!box || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => decide()); ro.observe(box);
    return () => ro.disconnect();
  }, [ref, decide]);
  return hidden;
}

/** Closes a popover on Escape (returning focus to its button) and on a click outside it. */
export function usePopover(open, setOpen, buttonRef, popRef) {
  React.useEffect(() => {
    if (!open) return undefined;
    const key = (e) => { if (e.key === 'Escape') { setOpen(false); buttonRef.current && buttonRef.current.focus(); } };
    const click = (e) => { if (popRef.current && !popRef.current.contains(e.target) && buttonRef.current && !buttonRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown', key); document.addEventListener('pointerdown', click);
    if (popRef.current) { const first = popRef.current.querySelector('button, [href]'); if (first) first.focus(); }
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', click); };
  }, [open, setOpen, buttonRef, popRef]);
}
