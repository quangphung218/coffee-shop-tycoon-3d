import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../../src/sim/data/difficulty';
import { RENT } from '../../src/sim/data/rent';
import { BANKRUPT_DAYS, DEBT_LIMIT, dailyRent, profit, settleDay } from '../../src/sim/economy';
import { dispatch } from '../../src/sim/index';
import { closeDay } from '../../src/sim/report';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { Difficulty, GameState } from '../../src/sim/types';
import { playDay } from '../integration/helpers';

const ALL: readonly Difficulty[] = ['easy', 'normal', 'hard'];

/** Plays `days` days with the morning restock, as a passive player would. */
function play(difficulty: Difficulty, seed: number, days: number): GameState {
  const s = createNewGame('Quán Thuê', difficulty, seed);
  for (let d = 1; d <= days; d++) {
    if (d > 1) expect(dispatch(s, { type: 'next_day' })).toBe(true);
    dispatch(s, { type: 'apply_restock' });
    playDay(s);
  }
  return s;
}

describe('daily rent', () => {
  it('reads the named table: base at level 1, a step per level above', () => {
    for (const d of ALL) {
      const s = createNewGame('A', d, 1);
      expect(s.shopLevel).toBe(1);
      expect(dailyRent(s)).toBe(RENT[d].base);
      s.shopLevel = 4;
      expect(dailyRent(s)).toBe(RENT[d].base + 3 * RENT[d].perLevel);
    }
  });

  it('costs more the harder the difficulty, at every shop level', () => {
    for (let level = 1; level <= 10; level++) {
      const rent = ALL.map((d) => {
        const s = createNewGame('A', d, 1);
        s.shopLevel = level;
        return dailyRent(s);
      });
      expect(rent[0]).toBeLessThan(rent[1]!);
      expect(rent[1]).toBeLessThan(rent[2]!);
    }
  });

  it('is taken from the money at the close and counted in the profit', () => {
    const s = createNewGame('A', 'normal', 1);
    s.today.revenue = 1_000_000;
    const money = s.money;
    settleDay(s);
    expect(s.today.rent).toBe(RENT.normal.base);
    expect(s.money).toBe(money - RENT.normal.base);
    expect(profit(s.today)).toBe(1_000_000 - s.today.ingredientCost - RENT.normal.base);
  });

  it('is due on a day without sales and may run into debt like wages', () => {
    const s = createNewGame('A', 'normal', 1);
    s.money = 0;
    settleDay(s);
    expect(s.money).toBe(-RENT.normal.base);
    expect(s.events.some((e) => e.type === 'notify' && e.level === 'warning')).toBe(true);
  });

  it('counts a day closed before rent existed as rent 0', () => {
    const d = createDayStats(1, 3);
    d.revenue = 500_000;
    expect(d.rent).toBeUndefined();
    expect(profit(d)).toBe(500_000);
  });

  it('shows tonight’s rent as an expense line and tomorrow’s ahead of time in the report', () => {
    const s = createNewGame('A', 'normal', 1);
    const r = closeDay(s);
    expect(r.rent).toBe(s.today.rent);
    expect(r.rent).toBe(RENT.normal.base);
    expect(r.rentNext).toBe(dailyRent(s));
    expect(r.profit).toBe(r.revenue - r.ingredientCost - r.wages - r.marketingCost - r.rent!);
  });

  it('charges the level reached tonight from tomorrow on', () => {
    const s = createNewGame('A', 'normal', 1);
    s.xp = 1e9;
    const r = closeDay(s);
    // Tonight is paid at the level the day was played at…
    expect(r.rent).toBe(RENT.normal.base);
    // …and the report shows the higher rent the new level brings.
    expect(s.shopLevel).toBeGreaterThan(1);
    expect(r.rentNext).toBe(RENT.normal.base + (s.shopLevel - 1) * RENT.normal.perLevel);
  });

  it('is the same for the same seed and play', () => {
    for (const d of ALL) {
      const a = play(d, 2024, 3);
      const b = play(d, 2024, 3);
      const rents = (s: GameState) => [...s.history, s.today].map((day) => day.rent);
      expect(rents(a)).toEqual(rents(b));
      expect(a.money).toBe(b.money);
      expect(rents(a).every((r) => typeof r === 'number' && r > 0)).toBe(true);
    }
  });

  it('leaves the bankruptcy rule, start money and debt limits as they were', () => {
    expect(BANKRUPT_DAYS).toBe(3);
    expect(DEBT_LIMIT).toEqual({ easy: 1000000, normal: 500000, hard: 200000 });
    expect(ALL.map((d) => DIFFICULTIES[d].startMoney)).toEqual([3000000, 2000000, 1200000]);
  });
});
