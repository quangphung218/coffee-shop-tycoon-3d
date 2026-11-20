import { describe, expect, it } from 'vitest';
import { dispatch } from '../../src/sim/index';
import { HIGH_PRICE_DAYS, HIGH_WAGE_DAYS, highWageDaysLeft, highWageJustEnded, policyLevel, staffSpeedMult, wageMult } from '../../src/sim/policies';
import { createNewGame } from '../../src/sim/state';
import type { GameState, PolicyLevel } from '../../src/sim/types';
import { playDay } from '../integration/helpers';

/** Plays the day and moves on to the next one's preparation. */
function nextDay(s: GameState): void {
  playDay(s);
  expect(s.phase).toBe('report');
  expect(dispatch(s, { type: 'next_day' })).toBe(true);
}

function set(s: GameState, policy: 'price' | 'wage', level: PolicyLevel): void {
  expect(dispatch(s, { type: 'set_policy', policy, level })).toBe(true);
}

describe('E-29: High wage expires after HIGH_WAGE_DAYS days', { timeout: 60_000 }, () => {
  it('is 7 days, like the High price', () => {
    expect(HIGH_WAGE_DAYS).toBe(7);
    expect(HIGH_WAGE_DAYS).toBe(HIGH_PRICE_DAYS);
  });

  it('holds High on days D..D+6, counts the days left and reverts to Standard on day D+7', () => {
    const s = createNewGame('A', 'normal', 1);
    expect(highWageDaysLeft(s)).toBeNull();
    set(s, 'wage', 'high');
    expect(s.highWageSinceDay).toBe(1);
    expect(highWageDaysLeft(s)).toBe(7);
    for (let d = 2; d <= 7; d++) {
      nextDay(s);
      expect(s.day).toBe(d);
      expect(policyLevel(s, 'wage')).toBe('high');
      expect(highWageDaysLeft(s)).toBe(8 - d);
      expect(highWageJustEnded(s)).toBe(false);
    }
    nextDay(s);
    expect(s.day).toBe(8);
    expect(policyLevel(s, 'wage')).toBe('standard');
    expect(wageMult(s)).toBe(1);
    expect(staffSpeedMult(s)).toBe(1);
    expect(s.highWageSinceDay).toBeUndefined();
    expect(highWageDaysLeft(s)).toBeNull();
    expect(highWageJustEnded(s)).toBe(true);
    expect(s.events.some((e) => e.type === 'notify' && /Lương cao đã hết/.test(e.text))).toBe(true);

    // Re-set action: setting High again restarts the count and clears the "just ended" flag.
    set(s, 'wage', 'high');
    expect(highWageJustEnded(s)).toBe(false);
    expect(s.highWageSinceDay).toBe(8);
    expect(highWageDaysLeft(s)).toBe(7);
  });

  it('restarts the count when High is set again mid-run', () => {
    const s = createNewGame('A', 'normal', 1);
    set(s, 'wage', 'high');
    for (let i = 0; i < 4; i++) nextDay(s);
    set(s, 'wage', 'high');
    expect(s.highWageSinceDay).toBe(5);
    while (s.day < 11) {
      nextDay(s);
      expect(policyLevel(s, 'wage')).toBe('high');
    }
    nextDay(s);
    expect(s.day).toBe(12);
    expect(policyLevel(s, 'wage')).toBe('standard');
  });

  it('never expires Low or Standard, and leaving High clears the count', () => {
    for (const level of ['low', 'standard'] as const) {
      const s = createNewGame('A', 'normal', 1);
      set(s, 'wage', 'high');
      set(s, 'wage', level);
      expect(s.highWageSinceDay).toBeUndefined();
      for (let i = 0; i < 10; i++) nextDay(s);
      expect(policyLevel(s, 'wage')).toBe(level);
      expect(highWageJustEnded(s)).toBe(false);
    }
  });

  it('counts price and wage independently', () => {
    const s = createNewGame('A', 'normal', 1);
    set(s, 'price', 'high');
    for (let i = 0; i < 3; i++) nextDay(s);
    set(s, 'wage', 'high');
    for (let i = 0; i < 4; i++) nextDay(s);
    expect(s.day).toBe(8);
    expect(policyLevel(s, 'price')).toBe('standard');
    expect(policyLevel(s, 'wage')).toBe('high');
    for (let i = 0; i < 3; i++) nextDay(s);
    expect(s.day).toBe(11);
    expect(policyLevel(s, 'wage')).toBe('standard');
  });
});
