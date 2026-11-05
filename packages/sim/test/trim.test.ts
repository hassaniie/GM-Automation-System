/* trimHistory: after two days, history older than a cutoff leaves memory; the plant carries on unaffected. */
import { expect, test } from 'vitest';
import { createState, trimHistory, findVehicleByVin } from '@mg/core';
import { runUntil } from '@mg/sim';

test('trimming old history keeps the line running and only drops finished, old records', () => {
  const S = createState(11, { delayRate: 0.04 });
  runUntil(S, 2 * 86400 + 10 * 3600); // day 3, 10:00
  const cutoff = 86400; // start of day 2
  const active = S.vehOrder.filter((id) => S.vehicles[id].state !== 'LINED_OFF').length;
  const oldVin = S.vehicles[S.vehOrder.find((id) => S.vehicles[id].state === 'LINED_OFF' && S.vehicles[id].lineOffT! < cutoff)!].vin;
  const r = trimHistory(S, cutoff);
  expect(r.vehicles).toBeGreaterThan(40); // day 1 output
  expect(S.vehOrder.filter((id) => S.vehicles[id].state !== 'LINED_OFF').length).toBe(active);
  expect(findVehicleByVin(S, oldVin)).toBeNull();
  expect((S.prod as { t: number }[]).every((p) => p.t >= cutoff)).toBe(true);
  expect(S.calls.every((c) => c.clearedT == null || c.clearedT >= cutoff)).toBe(true);
  const done = S.prod.length;
  runUntil(S, 2 * 86400 + 14 * 3600);
  expect(S.prod.length).toBeGreaterThan(done); // still producing
});
