/* Property test: over simulated days, patch(prev, diff(prev, next)) reproduces next exactly. */
import { expect, test } from 'vitest';
import { diff, patch, rehydrate, toWire } from '@mg/sync';
import { createState, Path, POS } from '@mg/core';
import { runUntil } from '@mg/sim';
import { MGE } from '@mg/engine';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

test('diff/patch round-trips the engine state through a day, with operator actions', () => {
  let maxBytes = 0, totalBytes = 0, n = 0;
  for (const seed of [11, 3, 42]) {
    const S = createState(seed, { delayRate: 0.04, mismatchRate: 0.03 });
    runUntil(S, 6 * 3600);
    let prev = toWire(S), t = S.t, step = 5;
    while (t < 22.5 * 3600) {
      t += step; step = step >= 60 ? 5 : step * 2;
      runUntil(S, t);
      if (Math.abs(t - 7.2 * 3600) < 60 && !S.calls.some((c) => c.raisedBy === 'tester')) MGE.raiseCall(S, 'CL2', 'SUP', 'tester');
      if (Math.abs(t - 8.5 * 3600) < 60) { const o = S.pos.FL4.occ; if (o && o.vehicleId) MGE.takeOffLine(S, o.vehicleId, { reason: 'Part fitment issue', by: 't', scan: S.vehicles[o.vehicleId].vin }); }
      const next = toWire(S), ops = diff(prev, next);
      const got = patch(clone(prev) as object, ops);
      expect(got).toEqual(next);
      const bytes = JSON.stringify(ops).length; maxBytes = Math.max(maxBytes, bytes); totalBytes += bytes; n++;
      prev = next;
    }
  }
  console.log(`patches: ${n}, mean ${(totalBytes / n / 1024).toFixed(1)} KB, max ${(maxBytes / 1024).toFixed(1)} KB`);
}, 300_000);

test('rehydrated paths answer .at() like the originals', () => {
  const S = createState(11); runUntil(S, 7 * 3600);
  const wire = toWire(S) as unknown as Parameters<typeof rehydrate>[0];
  rehydrate(wire, Path);
  const live = Object.values(S.carriers).find((c) => c.transit && (c.transit as { path?: unknown }).path);
  if (live) {
    const w = wire.carriers![live.id].transit!.path as InstanceType<typeof Path>;
    expect(w).toBeInstanceOf(Path);
    expect(w.at(0.5)).toEqual((live.transit!.path as InstanceType<typeof Path>).at(0.5));
  }
  expect(POS.FL7).toBeTruthy();
});

test('array ops: capped logs shift, grow, shrink', () => {
  const a = { ev: [{ id: 1 }, { id: 2 }, { id: 3 }], n: [1, 2, 3] };
  const b = { ev: [{ id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }], n: [1, 9] };
  const ops = diff(a, b);
  expect(ops).toContainEqual([['ev'], 'shift', 1]);
  expect(patch(clone(a), ops)).toEqual(b);
});
