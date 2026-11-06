/* The example signal map: one signal per thing the GA line's PLC and scanner can report, named the way we
   expect to agree them with MG JW. The same signals are served by the emulator over OPC UA (node ids) and
   Modbus TCP (coil numbers). On site the addresses are replaced with the PLC's own. */
import type { SignalConfig, SignalMap } from '@mg/contracts';
import { POS, ROUTE, TRANSFERS, WORK_POS } from '@mg/core';

export interface PlantSignal { key: string; means: SignalConfig['means']; pos: string; callType?: 'SUP' | 'MNT'; label: string; node: string; coil: number }

export function plantSignals(): PlantSignal[] {
  const out: Omit<PlantSignal, 'coil'>[] = [];
  const add = (key: string, means: SignalConfig['means'], pos: string, label: string, callType?: 'SUP' | 'MNT') => out.push({ key, means, pos, label, node: `ns=1;s=GA.${key}`, ...(callType ? { callType } : {}) });
  for (const id of ROUTE as string[]) add(`${id}.Presence`, 'presence', id, `Carrier present at ${id}`);
  for (const x of TRANSFERS as { from: string; to: string }[]) add(`${x.from}.TransferDone`, 'transfer-done', x.from, `Body transfer done ${x.from} → ${x.to}`);
  add('FL7.PhotoEye', 'photo-eye', 'FL7', 'End-of-line photo-eye at FL7');
  for (const id of WORK_POS as string[]) {
    if (!POS[id].exit) add(`${id}.WorkDone`, 'work-done', id, `Work done button at ${id}`);
    add(`${id}.CallSUP`, 'call-button', id, `Supervisor call button at ${id}`, 'SUP');
    add(`${id}.CallMNT`, 'call-button', id, `Maintenance call button at ${id}`, 'MNT');
  }
  return out.map((s, i) => ({ ...s, coil: i }));
}

export interface MapOptions { protocol: 'opcua' | 'modbus'; plcHost: string; plcPort: number; scannerHost: string; scannerPort: number }

export function exampleMap(o: MapOptions): SignalMap {
  const plc = o.protocol === 'opcua'
    ? { id: 'plc', kind: 'opcua' as const, endpoint: `opc.tcp://${o.plcHost}:${o.plcPort}/UA/MGPlant`, securityMode: 'None' as const, securityPolicy: 'None' as const, samplingMs: 100 }
    : { id: 'plc', kind: 'modbus' as const, host: o.plcHost, port: o.plcPort, unitId: 1, pollMs: 100 };
  return {
    devices: [plc, { id: 'scanner-tl1', kind: 'scanner-tcp', host: o.scannerHost, port: o.scannerPort, pos: 'TL1' }],
    signals: plantSignals().map((s) => ({ device: 'plc', address: o.protocol === 'opcua' ? s.node : `coil:${s.coil}`, means: s.means, pos: s.pos, ...(s.callType ? { callType: s.callType } : {}), invert: false, debounceMs: 50, label: s.label })),
    silentAfterSec: 600,
  };
}
