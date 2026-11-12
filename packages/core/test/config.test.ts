/* Shift and plan validation (audit B3–B5): bad input is refused before anything is stored. */
import { describe, expect, test } from 'vitest';
import { checkPlanPatch, checkShifts, setPlan, setShiftPattern } from '../src/config.js';
import { createState } from '../src/index.js';

const H = 3600;
const A = { name: 'Shift A', start: 6 * H, end: 14.5 * H, breaks: [{ label: 'Tea', start: 8.5 * H, end: 8.5 * H + 600 }] };
const B = { name: 'Shift B', start: 14.5 * H, end: 23 * H, breaks: [] };

describe('checkShifts', () => {
  test('the default pattern is valid', () => expect(checkShifts([A, B])).toBeNull());
  test('overlapping shifts', () => expect(checkShifts([A, { ...B, start: 10 * H }])).toMatch(/overlap/));
  test('duplicate names', () => expect(checkShifts([A, { ...B, name: 'shift a' }])).toMatch(/Two shifts/));
  test('across midnight', () => expect(checkShifts([{ ...B, start: 22 * H, end: 6 * H }])).toMatch(/cross midnight/));
  test('overlapping breaks', () => expect(checkShifts([{ ...A, breaks: [A.breaks[0], { label: 'Lunch', start: 8.5 * H + 300, end: 9 * H }] }])).toMatch(/overlap/));
  test('a break outside its shift', () => expect(checkShifts([{ ...A, breaks: [{ label: 'Late', start: 15 * H, end: 15.5 * H }] }])).toMatch(/outside/));
});

describe('checkPlanPatch', () => {
  test('a valid plan', () => expect(checkPlanPatch({ targets: { 'Shift A': { FINAL: 20 } }, takt: { FINAL: 600 }, note: 'x', shifts: null })).toBeNull());
  test('garbage shifts', () => expect(checkPlanPatch({ shifts: 'garbage' })).toBeTruthy());
  test('unknown keys', () => expect(checkPlanPatch({ foo: 1 })).toMatch(/Unknown/));
  test('takt out of range', () => expect(checkPlanPatch({ takt: { FINAL: 5 } })).toMatch(/Takt/));
});

test('a refused plan or pattern leaves the configuration unchanged', () => {
  const S = createState(11);
  const before = JSON.stringify(S.cfg);
  expect(() => setPlan(S, '2026-11-20', { shifts: 'garbage' }, 'test')).toThrow();
  expect(() => setShiftPattern(S, [A, { ...B, start: 10 * H }], 'test')).toThrow(/overlap/);
  expect(JSON.stringify(S.cfg)).toBe(before);
});
