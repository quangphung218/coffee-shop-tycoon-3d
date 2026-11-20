import { describe, expect, it } from 'vitest';
import { dispatch } from '../../src/sim/index';
import { HIGH_PRICE_DAYS, policyLevel } from '../../src/sim/policies';
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

describe('E-28: High price expires after HIGH_PRICE_DAYS days', { timeout: 60_000 }, () => {
  it('is 7 days', () => expect(HIGH_PRICE_DAYS).toBe(7));

  it('holds High on days D..D+6 and reverts to Standard on day D+7', () => {
    const s = createNewGame('A', 'normal', 1);
    set(s, 'price', 'high');
    expect(s.highPriceSinceDay).toBe(1);
    for (let d = 2; d <= 7; d++) {
      nextDay(s);
      expect(s.day).toBe(d);
      expect(policyLevel(s, 'price')).toBe('high');
    }
    nextDay(s);
    expect(s.day).toBe(8);
    expect(policyLevel(s, 'price')).toBe('standard');
    expect(s.highPriceSinceDay).toBeUndefined();
  });

  it('restarts the count when High is set again', () => {
    const s = createNewGame('A', 'normal', 1);
    set(s, 'price', 'high');
    for (let i = 0; i < 4; i++) nextDay(s);
    expect(s.day).toBe(5);
    set(s, 'price', 'high');
    expect(s.highPriceSinceDay).toBe(5);
    while (s.day < 11) {
      nextDay(s);
      expect(policyLevel(s, 'price')).toBe('high');
    }
    nextDay(s);
    expect(s.day).toBe(12);
    expect(policyLevel(s, 'price')).toBe('standard');
  });

  it('never expires Low or Standard, and leaving High clears the count', () => {
    for (const level of ['low', 'standard'] as const) {
      const s = createNewGame('A', 'normal', 1);
      set(s, 'price', 'high');
      set(s, 'price', level);
      expect(s.highPriceSinceDay).toBeUndefined();
      for (let i = 0; i < 10; i++) nextDay(s);
      expect(policyLevel(s, 'price')).toBe(level);
    }
  });

  it('leaves a Low wage untouched (High wage has its own count since E-29)', () => {
    const s = createNewGame('A', 'normal', 1);
    set(s, 'wage', 'low');
    set(s, 'price', 'high');
    for (let i = 0; i < 10; i++) nextDay(s);
    expect(policyLevel(s, 'wage')).toBe('low');
    expect(policyLevel(s, 'price')).toBe('standard');
  });
});
