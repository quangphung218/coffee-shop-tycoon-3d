import { describe, expect, it } from 'vitest';
import { arrivalRate } from '../../src/sim/customers';
import { getIngredient } from '../../src/sim/data/ingredients';
import { DAY_EVENTS, WEEK_LENGTH } from '../../src/sim/data/week';
import { dispatch } from '../../src/sim/index';
import { buyIngredient, ingredientPrice, servingCost } from '../../src/sim/inventory';
import { createNewGame } from '../../src/sim/state';
import type { DayEventId, DayPlan, GameState, Weather } from '../../src/sim/types';
import { dayArrivalMult, dayIngredientPriceMult, isValidWeekPlan, rollWeekPlan, todayPlan } from '../../src/sim/week';
import { playDay } from '../integration/helpers';

/** A fresh game whose day 1 has the given weather and event. */
function gameWith(weather: Weather, event: DayEventId): GameState {
  const state = createNewGame('Test', 'normal', 42);
  state.weather = weather;
  state.week!.plan = [{ day: 1, weather, event }, ...state.week!.plan.slice(1)];
  return state;
}

const SEEDS = Array.from({ length: 50 }, (_, i) => i * 7919 + 1);

describe('week plan', () => {
  it('gives the same plan for the same seed', () => {
    expect(rollWeekPlan(1234)).toEqual(rollWeekPlan(1234));
    expect(createNewGame('A', 'normal', 99).week!.plan).toEqual(createNewGame('B', 'hard', 99).week!.plan);
  });

  it('keeps the rules on 50 seeds', () => {
    for (const seed of SEEDS) {
      const plan = rollWeekPlan(seed);
      expect(plan.map((p) => p.day), `seed ${seed}`).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(plan[0], `seed ${seed}`).toEqual({ day: 1, weather: 'sunny', event: 'grand_opening' });
      plan.forEach((p, i) => {
        expect(p.weather !== 'sunny' || p.event !== 'none', `seed ${seed} day ${p.day} has a variable`).toBe(true);
        const prev = plan[i - 1];
        if (prev) expect(prev.weather === p.weather && prev.event === p.event, `seed ${seed} day ${p.day} repeats`).toBe(false);
      });
      expect(plan.some((p) => p.weather === 'rainy'), `seed ${seed} rainy`).toBe(true);
      expect(plan.some((p) => p.event === 'fair'), `seed ${seed} fair`).toBe(true);
      expect(plan.some((p) => p.event === 'supplier_hike'), `seed ${seed} supplier_hike`).toBe(true);
      expect(isValidWeekPlan(plan)).toBe(true);
    }
  });

  it('varies between seeds', () => {
    const plans = new Set(SEEDS.map((s) => JSON.stringify(rollWeekPlan(s))));
    expect(plans.size).toBeGreaterThan(10);
  });

  it('does not touch the game RNG', () => {
    const state = createNewGame('Test', 'normal', 7);
    const before = state.rngState;
    rollWeekPlan(state.seed);
    expect(state.rngState).toBe(before);
  });

  it('keeps the week-1 plan of a seed from before weeks rolled on', () => {
    expect(rollWeekPlan(12345)).toEqual([
      { day: 1, weather: 'sunny', event: 'grand_opening' },
      { day: 2, weather: 'rainy', event: 'supplier_hike' },
      { day: 3, weather: 'rainy', event: 'none' },
      { day: 4, weather: 'rainy', event: 'fair' },
      { day: 5, weather: 'hot', event: 'fair' },
      { day: 6, weather: 'rainy', event: 'supplier_hike' },
      { day: 7, weather: 'hot', event: 'supplier_hike' },
    ]);
    expect(rollWeekPlan(12345, 1)).toEqual(rollWeekPlan(12345));
  });

  it('rolls later weeks from the seed and the index, without a grand opening', () => {
    for (const seed of SEEDS) {
      expect(rollWeekPlan(seed, 2), `seed ${seed}`).toEqual(rollWeekPlan(seed, 2));
      for (const index of [2, 3, 10]) {
        const plan = rollWeekPlan(seed, index);
        expect(plan.map((p) => p.day), `seed ${seed} week ${index}`).toEqual([1, 2, 3, 4, 5, 6, 7]);
        expect(plan.some((p) => p.event === 'grand_opening'), `seed ${seed} week ${index}`).toBe(false);
        expect(isValidWeekPlan(plan, index), `seed ${seed} week ${index}`).toBe(true);
      }
    }
    const differ = SEEDS.filter((s) => JSON.stringify(rollWeekPlan(s, 2)) !== JSON.stringify(rollWeekPlan(s, 1)));
    expect(differ).toHaveLength(SEEDS.length);
    const week2 = new Set(SEEDS.map((s) => JSON.stringify(rollWeekPlan(s, 2))));
    expect(week2.size).toBeGreaterThan(10);
    expect(rollWeekPlan(1234, 2)).not.toEqual(rollWeekPlan(1234, 3));
  });

  it('only allows the grand opening in week 1', () => {
    expect(isValidWeekPlan(rollWeekPlan(5), 2)).toBe(false);
    expect(isValidWeekPlan(rollWeekPlan(5, 2), 1)).toBe(false);
  });

  it('rejects plans that break a rule', () => {
    const good: DayPlan[] = rollWeekPlan(5);
    expect(isValidWeekPlan(good)).toBe(true);
    const plain = good.map((p, i) => (i === 3 ? { ...p, weather: 'sunny' as const, event: 'none' as const } : p));
    expect(isValidWeekPlan(plain)).toBe(false);
    const repeat = good.map((p, i) => (i === 2 ? { ...good[1]!, day: 3 } : p));
    expect(isValidWeekPlan(repeat)).toBe(false);
  });
});

describe('today plan', () => {
  it('follows the week day and is null outside the week or without a week', () => {
    const state = createNewGame('Test', 'normal', 3);
    expect(todayPlan(state)).toEqual(state.week!.plan[0]);
    state.day = WEEK_LENGTH + 1;
    expect(todayPlan(state)).toBeNull();
    expect(dayArrivalMult(state)).toBe(1);
    expect(dayIngredientPriceMult(state)).toBe(1);
    delete state.week;
    state.day = 1;
    expect(todayPlan(state)).toBeNull();
    expect(dayArrivalMult(state)).toBe(1);
    expect(dayIngredientPriceMult(state)).toBe(1);
  });

  it('sets the weather from the plan each morning and keeps the RNG sequence', () => {
    const planned = createNewGame('Test', 'normal', 11);
    playDay(planned, { play: false });
    const plain = structuredClone(planned);
    plain.week!.plan = [];
    expect(dispatch(planned, { type: 'next_day' })).toBe(true);
    expect(dispatch(plain, { type: 'next_day' })).toBe(true);
    expect(planned.rngState).toBe(plain.rngState);
    expect(planned.weather).toBe(planned.week!.plan[1]!.weather);
  });
});

describe('day events', () => {
  it('has a multiplier pair for every event', () => {
    expect(DAY_EVENTS.none).toMatchObject({ arrivalMult: 1, ingredientPriceMult: 1 });
    expect(DAY_EVENTS.grand_opening.arrivalMult).toBe(1.15);
    expect(DAY_EVENTS.fair.arrivalMult).toBe(1.4);
    expect(DAY_EVENTS.supplier_hike.ingredientPriceMult).toBe(1.25);
  });

  it('brings more customers on a fair than on a plain day', () => {
    const fair = arrivalRate(gameWith('sunny', 'fair'));
    const none = arrivalRate(gameWith('sunny', 'none'));
    expect(fair).toBeGreaterThan(none);
    expect(fair / none).toBeCloseTo(1.4);
  });

  it('brings fewer customers on a rainy day than on a sunny one', () => {
    expect(arrivalRate(gameWith('rainy', 'none'))).toBeLessThan(arrivalRate(gameWith('sunny', 'none')));
  });

  it('makes a pack dearer and servings cost more on a supplier hike day', () => {
    const hike = gameWith('sunny', 'supplier_hike');
    const normal = gameWith('sunny', 'none');
    const pack = getIngredient('milk').packSize;
    const hikePrice = ingredientPrice(hike, 'milk', pack);
    const normalPrice = ingredientPrice(normal, 'milk', pack);
    expect(hikePrice).toBeGreaterThan(normalPrice);
    expect(hikePrice / normalPrice).toBeCloseTo(1.25, 2);
    expect(buyIngredient(hike, 'milk', pack)).toEqual({ ok: true, cost: hikePrice });
    expect(servingCost(hike, 'latte')).toBeGreaterThan(servingCost(normal, 'latte'));
  });

  it('leaves prices alone on days without a price event', () => {
    const fair = gameWith('rainy', 'fair');
    const none = gameWith('rainy', 'none');
    expect(ingredientPrice(fair, 'coffee_beans', 100)).toBe(ingredientPrice(none, 'coffee_beans', 100));
  });
});
