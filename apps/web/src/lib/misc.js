/* ── chart tooltip (reports) ── */
import { M, RT, fmtDur, html, useState } from './runtime.js';
import { MgMark } from './ui-kit.js';

function useTip() { const [tip, setTip] = useState(null); return [tip ? html`<div class="charttip" style=${{ left: tip.x + 14, top: tip.y + 10 }}>${tip.body}</div>` : null, (e, body) => setTip({ x: e.clientX, y: e.clientY, body }), () => setTip(null)]; }
const pad = (n) => String(n).padStart(2, '0');
export const PaintChip = ({ p }) => html`<span class="paint"><i style=${{ background: p.hex }}></i>${p.name}</span>`;

/* Line-off moment: a short card when a unit passes the end-of-line photo-eye at FL7. */
export function LineOffCard() {
  const lo = RT.ui.lineoff; if (!lo || RT.ui.drawer || RT.ui.selection) return null; // never under an open side panel
  const c = lo.rec;
  return html`<div class="glass lineoff ticks" role="status" aria-live="polite">
    <div class="lo-mark"><${MgMark} /></div>
    <div><div class="micro lo-k">Completed · photo-eye · FL7${c.returned ? ' · returned unit' : ''}</div><div class="lo-name">${c.name}</div>
      <div class="lo-meta"><${PaintChip} p=${M.PAINTS.find((x) => x.name === c.paint) || { name: c.paint, hex: '#888' }} /><span class="mono">${c.vin}</span></div></div>
    <div class="lo-stat"><span class="micro">Build time</span><span class="num">${fmtDur(c.dur)}</span></div>
    <div class="lo-stat"><span class="micro">This shift</span><span class="num">${c.n}<small> / ${RT.S.shift && RT.S.shift.targets ? RT.S.shift.targets.FINAL : '—'}</small></span></div>
  </div>`;
}

