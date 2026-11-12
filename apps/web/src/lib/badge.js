/* The 3D MG badge behind the page screens (Dashboard, Reports, Settings, Guide). three.js and the badge are a
   separate chunk, loaded when a page screen first opens. Without WebGL the backdrop simply stays flat. */
import { effectiveTheme, html, useEffect, useRef } from './runtime.js';

export function PageBadge() {
  const ref = useRef(null), handle = useRef(null), theme = effectiveTheme();
  useEffect(() => {
    let dead = false;
    import('@mg/scene/badge').then(({ mountBadge }) => {
      if (dead || !ref.current) return;
      handle.current = mountBadge(ref.current, { theme: effectiveTheme(), onLost: () => ref.current && ref.current.classList.remove('on') });
      if (handle.current) ref.current.classList.add('on');
    }, () => {});
    return () => { dead = true; if (handle.current) handle.current.dispose(); handle.current = null; };
  }, []);
  useEffect(() => { if (handle.current) handle.current.setTheme(theme); }, [theme]);
  return html`<canvas class="page-badge" ref=${ref} aria-hidden="true"></canvas>`;
}
