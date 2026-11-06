/* The plant's devices and what their signals mean: the commissioning file (config/devices.json).
   Filled in on site from MG JW's PLC address list and scanner set-up; no code changes needed. */
import { z } from 'zod';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, 'letters, digits, - and _ only');
const pos = z.string().min(2).max(8);

export const DeviceConfig = z.discriminatedUnion('kind', [
  /** A PLC (or gateway) speaking OPC UA: signals are node ids, read by subscription. */
  z.object({ id, kind: z.literal('opcua'), endpoint: z.string().regex(/^opc\.tcp:\/\//), securityMode: z.enum(['None', 'Sign', 'SignAndEncrypt']).default('None'), securityPolicy: z.enum(['None', 'Basic256Sha256', 'Aes128_Sha256_RsaOaep']).default('None'), user: z.string().optional(), samplingMs: z.number().int().min(10).max(5000).default(100) }),
  /** A PLC speaking Modbus TCP: signals are coil or discrete-input addresses, polled. */
  z.object({ id, kind: z.literal('modbus'), host: z.string().min(1), port: z.number().int().default(502), unitId: z.number().int().min(0).max(255).default(1), pollMs: z.number().int().min(20).max(5000).default(100) }),
  /** A network barcode scanner (TCP server on the scanner); one VIN per line. */
  z.object({ id, kind: z.literal('scanner-tcp'), host: z.string().min(1), port: z.number().int(), pos: z.literal('TL1').default('TL1') }),
]);
export type DeviceConfig = z.infer<typeof DeviceConfig>;

/** What a signal means. Presence: carrier sensor at a position (on = a carrier is there). */
export const SignalConfig = z.object({
  device: id,
  /** OPC UA node id (ns=2;s=Line.CL2.Presence) or Modbus address (coil:12, input:12). */
  address: z.string().min(1).max(200),
  means: z.enum(['presence', 'transfer-done', 'photo-eye', 'call-button', 'work-done']),
  pos,
  callType: z.enum(['SUP', 'MNT']).optional(),
  /** The input is active-low (e.g. a beam that is broken = off). */
  invert: z.boolean().default(false),
  /** Ignore changes shorter than this (contact bounce, a hand through the beam). */
  debounceMs: z.number().int().min(0).max(5000).default(50),
  label: z.string().max(80).optional(),
}).refine((s) => s.means !== 'call-button' || !!s.callType, { message: 'call-button signals need callType SUP or MNT' });
export type SignalConfig = z.infer<typeof SignalConfig>;

export const SignalMap = z.object({
  devices: z.array(DeviceConfig).min(1),
  signals: z.array(SignalConfig),
  /** A connected device with no signal for this long is reported silent (an alarm on the floor). */
  silentAfterSec: z.number().int().min(5).max(86400).default(600),
}).superRefine((m, ctx) => {
  const ids = new Set(m.devices.map((d) => d.id));
  if (ids.size !== m.devices.length) ctx.addIssue({ code: 'custom', message: 'device ids must be unique', path: ['devices'] });
  m.signals.forEach((s, i) => { if (!ids.has(s.device)) ctx.addIssue({ code: 'custom', message: `unknown device "${s.device}"`, path: ['signals', i, 'device'] }); });
  const seen = new Set<string>();
  m.signals.forEach((s, i) => { const k = `${s.device}|${s.address}`; if (seen.has(k)) ctx.addIssue({ code: 'custom', message: `address ${s.address} on ${s.device} is mapped twice`, path: ['signals', i, 'address'] }); seen.add(k); });
});
export type SignalMap = z.infer<typeof SignalMap>;

export type PlantMode = 'simulation' | 'live' | 'shadow';
export interface DeviceStatus { id: string; kind: DeviceConfig['kind']; target: string; state: 'connecting' | 'connected' | 'down' | 'silent'; since: number; lastSignalAt: number | null; error: string | null; signals: number }
export interface TagValue { device: string; address: string; means: SignalConfig['means']; pos: string; callType?: string; label?: string; value: boolean | null; changedAt: number | null }
export interface SignalLogEntry { at: number; device: string; address?: string; value?: boolean | string; event?: string; note?: string; problem?: boolean }
