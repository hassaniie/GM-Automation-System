/* ── audit trail (URD req 7, 10): every configuration change and correction ── */
import { dateKeyAt } from './calendar.js';
import { POS } from './plant.js';
import { logEvent, uid } from './state.js';

export function audit(S, by, action, target, before, after, reason = '') {
  const r = { id: uid(S, 'au'), t: S.t, date: dateKeyAt(S, S.t), by: by || 'System', action, target, before, after, reason };
  S.audit.push(r); if (S.audit.length > 2000) S.audit.shift();
  logEvent(S, 'config', `${action} · ${target}: ${before} → ${after} · by ${r.by}${reason ? ` · ${reason}` : ''}`, { pos: POS[target] ? target : undefined });
  return r;
}
