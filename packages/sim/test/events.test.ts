/* The simulator reaches the rules only through apply(), with events that match @mg/contracts.
   Device adapters will produce the same events in deployment. */
import { describe, expect, test } from 'vitest';
import { isPlantEvent, type PlantEvent } from '@mg/contracts';
import { createState } from '@mg/core';
import { runUntil } from '@mg/sim';

describe('simulator → rules', () => {
  test('a simulated shift reaches the rules only through valid plant events', () => {
    const S = createState(11, { delayRate: 0.04 });
    const journal: (PlantEvent & { t: number })[] = [];
    S.journal = journal;
    runUntil(S, 14.5 * 3600);
    expect(journal.length).toBeGreaterThan(500);
    for (const e of journal) expect(isPlantEvent(e), JSON.stringify(e)).toBe(true);
    const seen = new Set(journal.map((e) => e.type));
    // every event the simulator produces in a normal shift (ENGINE_SCAN is off by default)
    for (const type of ['CARRIER_ARRIVED', 'BODY_TRANSFERRED', 'ENTRY_SCAN', 'UNIT_ENTERED', 'WORK_COMPLETE', 'LINE_OFF', 'CALL_RAISED', 'CALL_RESPONDED', 'CALL_CLEARED'])
      expect(seen.has(type as PlantEvent['type']), type).toBe(true);
    // the journal is in time order
    expect(journal.every((e, i) => i === 0 || e.t >= journal[i - 1].t)).toBe(true);
  });

});
