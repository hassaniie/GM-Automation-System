import { POS, VARIANTS, targetFor } from './plant.js';
import { hash01 } from './util.js';

export function variantFromVin(vin) { return VARIANTS.find((v) => vin.slice(3, 8) === v.vds) || { code: 'UNK', name: `Unrecognised variant (VDS ${vin.slice(3, 8)})`, body: 'L', hybrid: false, model: '?', trim: '—', pt: 'PETROL', ptLabel: 'Unknown' }; }
export function findVehicleByVin(S, vin) { for (const id of S.vehOrder) if (S.vehicles[id].vin === vin) return S.vehicles[id]; return null; }
const ACTIVE_STATES = ['IN_PROCESS', 'AWAITING_LINE_OFF'];
export const isActive = (v) => v && ACTIVE_STATES.includes(v.state);
export function requiredFor(S, v, posId) {
  const p = POS[posId];
  if (p.kind !== 'work') return p.handling || 0;
  if (v.credited[posId]) return 90;
  const tgt = targetFor(posId, v);
  if (S.pendingDelay && S.pendingDelay.pos === posId) { const d = S.pendingDelay; S.pendingDelay = null; return tgt + d.extra; }
  const u2 = hash01(v.vin + posId + 'd');
  if (u2 < S.cfg.delayRate) return Math.round(tgt * 1.15);
  return Math.round(tgt * S.cfg.workPct); // fixed work content, no random spread
}
export const bufferHead = (S) => { let best = -1; S.bodyBuffer.forEach((b, i) => { if (b && (best < 0 || b.t < S.bodyBuffer[best].t)) best = i; }); return best; };
