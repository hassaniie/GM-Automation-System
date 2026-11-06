/* Colour discipline (ISA-101, design system release 1): normal values are neutral; colour only means a
   problem. These helpers decide the tone of a figure so every screen colours it the same way. */
import { M, RT } from './runtime.js';

/** Line downtime turns amber above this share of the productive shift time elapsed so far, red at twice it.
    5 % is a starting point to agree with MG JW (URD req 11). */
export const DOWNTIME_WARN_PCT = 0.05;

const elapsed = (S) => (S.shift && S.shift.name ? M.netElapsed(S.shift, S.t) : 0);
const overNow = (S, area) => M.WORK_POS.some((id) => (!area || M.POS[id].area === area) && ['OVERDUE', 'ESCALATED'].includes(M.stationStatus(S, id).code));

/** CSS colour for a downtime figure (seconds) of a line ('FINAL'…) or the plant, or null when normal. */
export function downtimeTone(down, area, S = RT.S) {
  const e = elapsed(S), share = e > 0 ? down / e : 0;
  if (share >= DOWNTIME_WARN_PCT * 2) return 'var(--ds-status-critical)';
  if (share >= DOWNTIME_WARN_PCT || (down > 0 && overNow(S, area))) return 'var(--ds-status-warning)';
  return null;
}

/** CSS colour for completed-against-plan: neutral on or ahead of plan, amber behind, red more than 2 behind. */
export function planTone(delta) {
  if (delta < -2) return 'var(--ds-status-critical)';
  if (delta < 0) return 'var(--ds-status-warning)';
  return null;
}
