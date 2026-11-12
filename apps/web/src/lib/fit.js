/* Popover helper shared by the top bar's menus. */
import React from 'react';

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
