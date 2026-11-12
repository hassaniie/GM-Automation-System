/* Unsaved settings (audit B12): a settings section reports that it holds edits; leaving it (another settings tab, a
   page in the rail, closing the tab) asks first instead of discarding them silently. */
let what = null;
/** Mark (label) or clear (null) unsaved edits in the open section. */
export function setUnsaved(label) { what = label || null; }
/** True when it is fine to leave: nothing unsaved, or the person confirms. Clears the mark when they do. */
export function confirmLeave() {
  if (!what) return true;
  const ok = window.confirm(`You have unsaved changes in ${what}. Leave without saving?`);
  if (ok) what = null;
  return ok;
}
if (typeof window !== 'undefined') window.addEventListener('beforeunload', (e) => { if (what) { e.preventDefault(); e.returnValue = ''; } });
