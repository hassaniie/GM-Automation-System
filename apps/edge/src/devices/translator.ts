/* Turns device signals into plant events, using the signal map:
     presence on / off      → carrier arrived / departed (tracking works out which carrier)
     transfer-done on       → body transferred from that position
     photo-eye on           → the unit at FL7 lined off
     call-button on         → station call (supervisor or maintenance)
     work-done on           → work complete at that station
     scanner line           → entry scan at TL1
   Changes shorter than the signal's debounce are ignored. The first value after a (re)connection is not an
   edge: the manager compares it with tracking instead. */
import type { PlantEvent, SignalConfig, SignalMap } from '@mg/contracts';
import { XFER_FROM } from '@mg/core';

export interface TranslatorOut {
  event: (e: PlantEvent, meta: { device: string; address?: string }) => void;
  /** First value of a signal after connecting. */
  initial: (s: SignalConfig, value: boolean) => void;
  changed: (s: SignalConfig, value: boolean) => void;
}

export class Translator {
  private byAddr = new Map<string, SignalConfig>();
  private value = new Map<string, boolean>();
  private pending = new Map<string, { value: boolean; timer: NodeJS.Timeout }>();
  constructor(readonly map: SignalMap, private out: TranslatorOut) {
    for (const s of map.signals) this.byAddr.set(key(s.device, s.address), s);
  }
  signalFor(device: string, address: string) { return this.byAddr.get(key(device, address)); }
  valueOf(device: string, address: string) { return this.value.get(key(device, address)); }

  /** A device lost its connection: its next values are initial again. */
  reset(device: string) {
    for (const k of [...this.value.keys()]) if (k.startsWith(`${device}\u0000`)) this.value.delete(k);
    for (const [k, p] of this.pending) if (k.startsWith(`${device}\u0000`)) { clearTimeout(p.timer); this.pending.delete(k); }
  }

  /** A raw value from a device (true/false as the wire reports it). */
  input(device: string, address: string, raw: boolean) {
    const s = this.byAddr.get(key(device, address)); if (!s) return;
    const k = key(device, address), v = s.invert ? !raw : raw;
    if (!this.value.has(k)) { this.value.set(k, v); this.out.initial(s, v); return; }
    const p = this.pending.get(k);
    if (p) { clearTimeout(p.timer); this.pending.delete(k); if (v === this.value.get(k)) return; } // bounced back: ignore
    if (v === this.value.get(k)) return;
    if (!s.debounceMs) return this.accept(s, k, v);
    this.pending.set(k, { value: v, timer: setTimeout(() => { this.pending.delete(k); this.accept(s, k, v); }, s.debounceMs) });
  }

  /** Text from a scanner. */
  scan(device: string, text: string) {
    const raw = text.trim(); if (!raw) return;
    this.out.event({ type: 'ENTRY_SCAN', raw, source: 'SCANNER' }, { device });
  }

  stop() { for (const p of this.pending.values()) clearTimeout(p.timer); this.pending.clear(); }

  private accept(s: SignalConfig, k: string, v: boolean) {
    this.value.set(k, v);
    this.out.changed(s, v);
    const e = eventFor(s, v);
    if (e) this.out.event(e, { device: s.device, address: s.address });
  }
}

const key = (device: string, address: string) => `${device}\u0000${address}`;

export function eventFor(s: SignalConfig, on: boolean): PlantEvent | null {
  switch (s.means) {
    case 'presence': return on ? { type: 'CARRIER_ARRIVED', pos: s.pos, carrierId: null } : { type: 'CARRIER_DEPARTED', pos: s.pos };
    case 'transfer-done': return on ? { type: 'BODY_TRANSFERRED', vehicleId: null, from: s.pos, to: (XFER_FROM as Record<string, { to: string }>)[s.pos]?.to ?? s.pos } : null;
    case 'photo-eye': return on ? { type: 'LINE_OFF', vin: null, source: 'PHOTO_EYE' } : null;
    case 'call-button': return on ? { type: 'CALL_RAISED', pos: s.pos, callType: s.callType!, by: 'Station button' } : null;
    case 'work-done': return on ? { type: 'WORK_COMPLETE', pos: s.pos, by: 'BUTTON' } : null;
  }
}
