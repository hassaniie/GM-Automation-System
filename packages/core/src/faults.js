/* ── faults, station calls, line stop ── */
import { raiseOrUpdate, resolveAlarmsFor } from './alarms.js';
import { dispId } from './scans.js';
import { logEvent } from './state.js';

export function injectCarrierFault(S, cid, code, text) {
  const c = S.carriers[cid]; if (!c || c.fault) return;
  const dflt = c.kind === 'Hanger' ? ['HGR-ENC-214', 'Lift encoder deviation > 8 mm; hanger travel inhibited'] : c.kind === 'Skid' ? ['SKD-LCK-031', 'Skid lock pin not confirmed; conveyor index inhibited'] : ['FIX-POS-118', 'Fixture height out of tolerance; conveyor inhibited'];
  c.fault = { code: code || dflt[0], text: text || dflt[1], t: S.t };
  const pos = c.posId || (c.transit && c.transit.from) || '—', v = c.vehicleId && S.vehicles[c.vehicleId];
  raiseOrUpdate(S, `FAULT:C:${cid}`, { type: 'FAULT', level: 'FAULT', pos, vehicleId: v ? v.id : null, vin: v ? v.vin : null, carrierId: cid, msg: `${c.kind} ${cid} fault · ${c.fault.code}` });
}
export function injectSensorFault(S, posId, code = 'PX-2 NO-CONFIRM', text = 'Presence sensor not confirming carrier position') {
  const p = S.pos[posId]; if (!p || p.fault) return;
  p.fault = { code, text, t: S.t };
  const v = p.occ && p.occ.vehicleId && S.vehicles[p.occ.vehicleId];
  raiseOrUpdate(S, `FAULT:P:${posId}`, { type: 'FAULT', level: 'FAULT', pos: posId, vehicleId: v ? v.id : null, vin: v ? v.vin : null, msg: `Sensor fault at ${dispId(posId)} · ${code}` });
}
export function clearFault(S, kind, id) {
  if (kind === 'C') { const c = S.carriers[id]; if (!c || !c.fault) return; c.fault = null; resolveAlarmsFor(S, (a) => a.key === `FAULT:C:${id}`, 'Fault cleared (simulation recovery)'); }
  else { const p = S.pos[id]; if (!p || !p.fault) return; p.fault = null; resolveAlarmsFor(S, (a) => a.key === `FAULT:P:${id}`, 'Fault cleared (simulation recovery)'); }
  logEvent(S, 'sim', `SIMULATION · fault recovery on ${id}`, { pos: kind === 'P' ? id : undefined });
}
