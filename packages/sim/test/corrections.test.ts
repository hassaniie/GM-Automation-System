/* Position corrections (URD req 7) must not jam the line. */
import { expect, test } from 'vitest';
import { correctPosition, createState, findVehicleByVin, POS, WORK_POS } from '@mg/core';
import { runUntil } from '@mg/sim';

test('a unit corrected forward is credited for the stations it passed, and still lines off', () => {
  const S = createState(11, { delayRate: 0.04, mismatchRate: 0.03 });
  runUntil(S, 30000); // 08:20, Shift A
  const occ = S.pos.FL2.occ!;
  const vin = S.vehicles[occ.vehicleId!].vin;
  const res = correctPosition(S, vin, 'FL3', 'Planner', 'Tracking showed FL2; unit is at FL3');
  expect(res.ok).toBe(true);
  const v = findVehicleByVin(S, vin)!;
  // every work station before FL3 is either done or credited
  const before = WORK_POS.filter((p: string) => POS[p].idx < POS.FL3.idx);
  expect(before.filter((p: string) => !v.done[p] && !v.credited[p])).toEqual([]);
  runUntil(S, 14.5 * 3600 + 60); // end of Shift A
  expect(v.state).toBe('LINED_OFF');
  const shiftA = (S.history as { name?: string; lines: Record<string, { done: number }> }[]).find((h) => h.name === 'Shift A')!;
  expect(shiftA.lines.FINAL.done).toBeGreaterThanOrEqual(20);
});
