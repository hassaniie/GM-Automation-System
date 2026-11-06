/* ── what the devices would report ──
   Runs the simulator and records only what the plant's devices could see, as device events:
   presence on and off at each position (PLC), body transfers done (PLC), work-done buttons at stations,
   station call buttons, the TL1 scanner's VINs and the FL7 photo-eye. No carrier ids, no vehicle ids:
   the live engine has to work those out by tracking, as it will on site. Used by the plant emulator and
   by the replay test. */
import { POS, ROUTE } from '@mg/core';
import { step } from './tick.js';

// which carrier is at each position (devices only see on/off, but a carrier passing through a position within
// one second still turns its sensor on and off)
const presence = (S) => Object.fromEntries(ROUTE.map((id) => [id, S.pos[id].carrierId || null]));

/** Device events of everything the plant journal recorded this second, plus presence changes. */
export function deviceEventsOf(journal, before, after) {
  const out = [], arrived = {};
  for (const j of journal) if (j.type === 'CARRIER_ARRIVED') { arrived[j.pos] = j.carrierId; out.push({ type: 'CARRIER_ARRIVED', pos: j.pos, carrierId: null }); }
  for (const j of journal) {
    if (j.type === 'BODY_TRANSFERRED') out.push({ type: 'BODY_TRANSFERRED', vehicleId: null, from: j.from, to: j.to });
    else if (j.type === 'ENTRY_SCAN') out.push({ type: 'ENTRY_SCAN', raw: j.raw, source: 'SCANNER' });
    else if (j.type === 'WORK_COMPLETE' && POS[j.pos].kind === 'work' && !POS[j.pos].exit) out.push({ type: 'WORK_COMPLETE', pos: j.pos, by: 'BUTTON' });
    else if (j.type === 'LINE_OFF') out.push({ type: 'LINE_OFF', vin: null, source: 'PHOTO_EYE' });
    else if (j.type === 'CALL_RAISED') out.push({ type: 'CALL_RAISED', pos: j.pos, callType: j.callType, by: 'Station button' });
  }
  for (const id of ROUTE) {
    const was = arrived[id] || before[id];
    if (was && after[id] !== was) out.push({ type: 'CARRIER_DEPARTED', pos: id });
  }
  return out;
}

/** Runs the simulator to `tEnd`, calling `onSecond(t, events)` with the device events of each second. */
export function runEmitting(S, tEnd, onSecond) {
  const own = !Array.isArray(S.journal);
  if (own) S.journal = [];
  let before = presence(S);
  while (S.t < tEnd) {
    S.journal.length = 0;
    step(S, 1);
    const after = presence(S), events = deviceEventsOf(S.journal, before, after);
    before = after;
    if (events.length) onSecond(S.t, events);
  }
  if (own) delete S.journal;
}
