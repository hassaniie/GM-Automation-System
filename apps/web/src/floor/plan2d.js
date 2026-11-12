/* ── 2D plan ── */
import { select } from './scenarios.js';
import { M, POS, RT, STATIONS, html } from '../lib/runtime.js';

export function Plan2D({ fallback }) {
  const S = RT.S, sel = RT.ui.selection;
  const X = (x) => (x + 66) * 6.4, Z = (z) => (z + 30) * 6.4;
  const toneHex = { muted: 'var(--muted)', text: 'var(--text)', ok: 'var(--ok)', warn: 'var(--warn)', crit: 'var(--crit)', esc: 'var(--esc)', hold: 'var(--hold)', transit: 'var(--transit)', paused: 'var(--paused)' };
  const carPos = (v) => {
    const c = v.carrierId && S.carriers[v.carrierId];
    const an = S.anims.find((a) => a.vehicleId === v.id); if (an) { const p = an.path.at(M.clamp((S.t + RT.acc - an.t0) / (an.t1 - an.t0), 0, 1)); return [p.x, p.z]; }
    if (c && c.mode === 'POS') return [POS[c.posId].x, POS[c.posId].z];
    if (c && c.mode === 'TRANSIT') { const tr = c.transit, p = M.EDGES[tr.edge].at(M.clamp((S.t + RT.acc - tr.t0) / (tr.t1 - tr.t0), 0, 1)); return [p.x, p.z]; }
    if (v.state === 'OFF_LINE') return S.offlineBay.slice(-4).includes(v.id) ? M.OFFLINE_SLOTS[(v.offlineSlot || 0) % 4] : null;
    return null;
  };
  const rails = Object.values(M.EDGES);
  return html`<div style=${{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'var(--bg)', zIndex: 4, padding: '120px 16px 120px' }}>
    ${fallback ? html`<div class="glass fallback-note ticks">3D view unavailable (WebGL not supported). This plan shows the same live state.</div>` : null}
    <svg class="plan" viewBox="0 0 960 360" style=${{ width: 'min(100%, 1600px)', height: 'auto', maxHeight: '100%' }} role="img" aria-label="Top-down plan of the General Assembly shop">
      ${[[-56, 4.2, 0.6, 18.6], [-5, -26, 19, 1.4], [13.6, 4.6, 64.5, 18.8]].map(([x0, z0, x1, z1], i) => html`<rect key=${'z' + i} x=${X(x0)} y=${Z(z0)} width=${X(x1) - X(x0)} height=${Z(z1) - Z(z0)} rx="0" fill="var(--fill)" stroke="var(--hair-2)" stroke-dasharray="6 4" />`)}
      ${rails.map((p, i) => html`<polyline key=${'r' + i} points=${p.pts.map(([x, z]) => `${X(x)},${Z(z)}`).join(' ')} fill="none" stroke="var(--hair-2)" stroke-width="3" />`)}
      ${STATIONS.map((id) => { const P = POS[id], st = M.stationStatus(S, id), rot = P.yaw !== 0, w = (rot ? 4.6 : 6.2) * 6.4, d = (rot ? 6.2 : 4.6) * 6.4, isSel = sel && sel.kind === 'pos' && sel.id === id; const sv = M.stationVehicle(S, id), occ = sv && S.pos[sv.posId].occ; const r = sv && P.kind === 'work' && occ ? Math.min(1, occ.workT / M.targetFor(id, sv.v)) : 0;
        return html`<g key=${id} style=${{ cursor: 'pointer' }} onClick=${() => select({ kind: 'pos', id }, false)}>
          <rect x=${X(P.x) - w / 2} y=${Z(P.z) - d / 2} width=${w} height=${d} rx="0" fill=${st.tone === 'muted' || st.tone === 'text' ? 'transparent' : `color-mix(in srgb, ${toneHex[st.tone]} 18%, transparent)`} stroke=${isSel ? 'var(--text)' : st.tone === 'muted' || st.tone === 'text' ? 'var(--hair-2)' : toneHex[st.tone]} stroke-width=${isSel ? 2 : 1} />
          ${P.kind === 'work' ? html`<rect x=${X(P.x) - w / 2 + 3} y=${Z(P.z) + d / 2 - 5} width=${(w - 6) * r} height="2.5" fill=${st.tone === 'muted' || st.tone === 'text' ? 'var(--text)' : toneHex[st.tone]} />` : null}
          <text x=${X(P.x) - w / 2} y=${Z(P.z) + d / 2 + 11} font-size="9" fill="var(--text-2)">${id}</text></g>`; })}
      ${S.vehOrder.map((vid) => { const v = S.vehicles[vid], p = carPos(v); if (!p || v.state === 'LINED_OFF') return null; return html`<rect key=${vid} x=${X(p[0]) - 13} y=${Z(p[1]) - 6} width="26" height="12" rx="0" fill=${sel && sel.kind === 'veh' && sel.id === vid ? v.paint.hex : `color-mix(in srgb, ${v.paint.hex} 15%, var(--ds-n-400))`} stroke=${sel && sel.kind === 'veh' && sel.id === vid ? 'var(--text)' : 'var(--bg)'} stroke-width="1.5" style=${{ cursor: 'pointer' }} onClick=${() => select({ kind: 'veh', id: vid }, false)}><title>${v.vin}</title></rect>`; })}
      ${S.bodyBuffer.map((b, i) => b ? html`<rect key=${'b' + i} x=${X(M.BODY_BUFFER[i][0]) - 13} y=${Z(M.BODY_BUFFER[i][1]) - 6} width="26" height="12" rx="0" fill=${`color-mix(in srgb, ${b.paint.hex} 15%, var(--ds-n-400))`} opacity=".6" />` : null)}
      <text x=${X(-56)} y=${Z(21.5)} font-size="11" fill="var(--muted)" letter-spacing="2">TRIM LINE</text><text x=${X(-5)} y=${Z(-27.2)} font-size="11" fill="var(--muted)" letter-spacing="2">CHASSIS LINE</text><text x=${X(13.6)} y=${Z(21.5)} font-size="11" fill="var(--muted)" letter-spacing="2">FINAL LINE</text>
    </svg></div>`;
}

