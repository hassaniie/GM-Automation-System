/* The plant-event boundary of the rules: every contract event is handled, bad events are rejected,
   and the rules stay free of simulator and browser code. */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { PLANT_EVENT_TYPES, type PlantEvent } from '@mg/contracts';
import { apply, createState } from '@mg/core';

describe('plant events', () => {
  test('every contract event type is handled by apply()', () => {
    const src = readFileSync(join(__dirname, '../src/events.js'), 'utf8');
    for (const type of PLANT_EVENT_TYPES) expect(src.includes(`case '${type}':`), type).toBe(true);
  });

  test('a malformed event is rejected, not half-applied', () => {
    const S = createState(11);
    const before = JSON.stringify(S.pos);
    expect(() => apply(S, { type: 'BODY_TRANSFERRED', vehicleId: 'nope', from: 'TL6', to: 'CL1' })).toThrow(/no carrier/);
    expect(() => apply(S, { type: 'NOT_AN_EVENT' } as unknown as PlantEvent)).toThrow(/Unknown plant event/);
    expect(JSON.stringify(S.pos)).toBe(before);
  });
});

describe('package boundaries', () => {
  test('the rules never import the simulator or the browser', () => {
    const dir = join(__dirname, '../src');
    for (const f of readdirSync(dir)) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src, f).not.toMatch(/from '@mg\/(sim|engine|scene|web)'/);
      expect(src, f).not.toMatch(/\b(window|document|localStorage)\b/);
    }
  });
});
