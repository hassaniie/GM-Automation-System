/* Command schemas: what the line server accepts from the screens. */
import { describe, expect, test } from 'vitest';
import { OperatorCommand, SimCommand } from '../src/index.ts';

const ok = (c: unknown) => SimCommand.safeParse(c).success;

describe('SIM_CONFIG', () => {
  test('on/off settings take a boolean only', () => {
    expect(ok({ type: 'SIM_CONFIG', key: 'autoRespond', value: false })).toBe(true);
    expect(ok({ type: 'SIM_CONFIG', key: 'autoRespond', value: 1 })).toBe(false);
  });
  test('numeric settings stay inside their range', () => {
    expect(ok({ type: 'SIM_CONFIG', key: 'callRate', value: 0.05 })).toBe(true);
    expect(ok({ type: 'SIM_CONFIG', key: 'callRate', value: 36000 })).toBe(false);
    expect(ok({ type: 'SIM_CONFIG', key: 'warnPct', value: 0 })).toBe(false);
    expect(ok({ type: 'SIM_CONFIG', key: 'escalateAfter', value: 180 })).toBe(true);
    expect(ok({ type: 'SIM_CONFIG', key: 'delayRate', value: true })).toBe(false);
  });
  test('unknown settings are refused', () => expect(ok({ type: 'SIM_CONFIG', key: 'shiftStart', value: 0 })).toBe(false));
});

describe('SET_SHIFTS', () => {
  test('breaks carry a label, as the screens and the rules send them', () => {
    const H = 3600;
    const shifts = [{ name: 'Shift A', start: 6 * H, end: 14.5 * H, breaks: [{ label: 'Tea break', start: 8.5 * H, end: 8.5 * H + 600 }] }];
    expect(OperatorCommand.safeParse({ type: 'SET_SHIFTS', shifts, reason: 'test' }).success).toBe(true);
  });
});
