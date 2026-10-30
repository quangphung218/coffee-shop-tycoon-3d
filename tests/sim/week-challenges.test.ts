import { describe, expect, it } from 'vitest';
import { challengeProgress, describeChallenge, endOfDayChallenge, ensureWeekChallenge, rollWeekChallenge } from '../../src/sim/challenges';
import { CHALLENGE_FIRST_WEEK, WEEK_CHALLENGES, WEEK_CHALLENGE_IDS } from '../../src/sim/data/challenges';
import { WEEK_LENGTH, dayUnlockDay, weekGoal } from '../../src/sim/data/week';
import { dispatch } from '../../src/sim/index';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { DailyReport, GameEvent, GameState, WeekChallenge, WeekChallengeId } from '../../src/sim/types';
import { rollWeekPlan } from '../../src/sim/week';

/** A normal game on the morning of week `index`, day `weekDay`. */
function gameInWeek(index: number, weekDay = 1, seed = 4242): GameState {
  const state = createNewGame('Quán Thử Thách', 'normal', seed);
  const startedDay = (index - 1) * WEEK_LENGTH + 1;
  state.day = startedDay + weekDay - 1;
  state.today = createDayStats(state.day, state.rating);
  state.week = { length: WEEK_LENGTH, index, startedDay, plan: rollWeekPlan(state.seed, index), goal: weekGoal('normal', index) };
  return state;
}

function withChallenge(state: GameState, id: WeekChallengeId, target = WEEK_CHALLENGES[id].target): WeekChallenge {
  const c: WeekChallenge = { id, target, reward: { tickets: 6 }, progress: 0, settledDay: 0, status: 'active' };
  if (id === 'sell_item') c.itemId = 'latte';
  state.week!.challenge = c;
  return c;
}

const report = (missions: DailyReport['missions'] = []): DailyReport => ({ missions }) as DailyReport;

/** Closes `state.today` for the challenge and opens the next day's stats. */
function closeAndNext(state: GameState, r = report()): void {
  endOfDayChallenge(state, r);
  state.day += 1;
  state.today = createDayStats(state.day, state.rating);
}

describe('weekly challenge draw (E-16)', () => {
  it('has no challenge before week 5 and one every week from it', () => {
    for (let w = 1; w < CHALLENGE_FIRST_WEEK; w++) expect(rollWeekChallenge(1, w)).toBeNull();
    for (let w = CHALLENGE_FIRST_WEEK; w <= 40; w++) expect(rollWeekChallenge(1, w)).not.toBeNull();
  });

  it('gives the same sequence for the same seed and a different one for another seed', () => {
    const seq = (seed: number) => Array.from({ length: 30 }, (_, i) => rollWeekChallenge(seed, CHALLENGE_FIRST_WEEK + i));
    expect(seq(42)).toEqual(seq(42));
    expect(seq(1)).toEqual(seq(1));
    expect(seq(42).map((c) => `${c!.id}:${c!.itemId ?? ''}`)).not.toEqual(seq(1).map((c) => `${c!.id}:${c!.itemId ?? ''}`));
  });

  it('never draws the same template two weeks in a row and uses every template', () => {
    const seen = new Set<WeekChallengeId>();
    for (const seed of [1, 42, 777, 2024]) {
      let prev: WeekChallengeId | null = null;
      for (let w = CHALLENGE_FIRST_WEEK; w < CHALLENGE_FIRST_WEEK + 40; w++) {
        const c = rollWeekChallenge(seed, w)!;
        expect(c.id).not.toBe(prev);
        prev = c.id;
        seen.add(c.id);
      }
    }
    expect([...seen].sort()).toEqual([...WEEK_CHALLENGE_IDS].sort());
    expect(WEEK_CHALLENGE_IDS.length).toBe(6);
  });

  it('starts active at 0 with the template target and Tem reward, and sell_item names an item open by week 1', () => {
    for (let w = CHALLENGE_FIRST_WEEK; w < CHALLENGE_FIRST_WEEK + 60; w++) {
      const c = rollWeekChallenge(99, w)!;
      expect(c).toMatchObject({ target: WEEK_CHALLENGES[c.id].target, progress: 0, settledDay: 0, status: 'active' });
      expect(c.reward.tickets).toBe(WEEK_CHALLENGES[c.id].reward.tickets);
      expect(c.reward.unlock).toBeUndefined();
      if (c.id === 'sell_item') expect(dayUnlockDay('menu', c.itemId!)).toBeLessThanOrEqual(WEEK_LENGTH);
      else expect(c.itemId).toBeUndefined();
    }
  });

  it('opens week 5 with its draw on next_day, whatever rngState holds', () => {
    const state = gameInWeek(4, WEEK_LENGTH);
    state.phase = 'report';
    state.week!.result = { revenue: 0, revenueTarget: 1, stars: 4, starsTarget: 4, score: 0, cups: 0, days: [] };
    const twin = structuredClone(state);
    twin.rngState = (state.rngState ^ 0x1234567) >>> 0;
    expect(dispatch(state, { type: 'next_day' })).toBe(true);
    expect(dispatch(twin, { type: 'next_day' })).toBe(true);
    expect(state.week!.index).toBe(5);
    expect(state.week!.challenge).toEqual(rollWeekChallenge(state.seed, 5));
    expect(twin.week!.challenge).toEqual(state.week!.challenge);
  });

  it('draws without moving rngState', () => {
    const state = gameInWeek(6);
    const rng = state.rngState;
    ensureWeekChallenge(state);
    expect(state.week!.challenge).toEqual(rollWeekChallenge(state.seed, 6));
    expect(state.rngState).toBe(rng);
  });

  it('fills the description with the target, the item and the stars', () => {
    const state = gameInWeek(5);
    expect(describeChallenge(withChallenge(state, 'sell_item', 80)).description).toBe('Bán 80 ly Latte trong tuần.');
    expect(describeChallenge(withChallenge(state, 'stars_week')).description).toContain('4,6 sao');
  });
});

describe('weekly challenge progress (E-16)', () => {
  it('counts today live in the selector and folds each closed day once', () => {
    const state = gameInWeek(5);
    withChallenge(state, 'served_week', 100);
    state.today.customersServed = 30;
    expect(challengeProgress(state)).toEqual({ value: 30, target: 100, done: false, failed: false });
    endOfDayChallenge(state, report());
    endOfDayChallenge(state, report());
    expect(state.week!.challenge!.progress).toBe(30);
    // The report phase shows the settled value, not today twice.
    expect(challengeProgress(state)!.value).toBe(30);
  });

  it('completes once: one challenge_completed, Tem paid once, the selector caps at the target', () => {
    const state = gameInWeek(5);
    withChallenge(state, 'served_week', 50);
    state.today.customersServed = 30;
    closeAndNext(state);
    state.today.customersServed = 40;
    const before = state.retention?.tickets ?? 0;
    closeAndNext(state);
    const types = state.events.map((e) => e.type);
    expect(types.filter((t) => t === 'challenge_completed')).toHaveLength(1);
    expect(types.indexOf('challenge_completed')).toBeLessThan(types.indexOf('tickets_earned'));
    const earned = state.events.find((e): e is Extract<GameEvent, { type: 'tickets_earned' }> => e.type === 'tickets_earned')!;
    expect(earned).toMatchObject({ amount: 6, reason: 'challenge' });
    expect(state.retention!.tickets).toBe(before + 6);
    expect(challengeProgress(state)).toEqual({ value: 50, target: 50, done: true, failed: false });
    state.today.customersServed = 40;
    closeAndNext(state);
    expect(state.retention!.tickets).toBe(before + 6);
    expect(state.events.filter((e) => e.type === 'challenge_completed')).toHaveLength(1);
  });

  it('counts regulars served and cups of the drawn item', () => {
    const state = gameInWeek(5);
    withChallenge(state, 'regular_visits', 5);
    state.today.regularsServed = 3;
    closeAndNext(state);
    expect(challengeProgress(state)!.value).toBe(3);
    const sell = gameInWeek(5);
    withChallenge(sell, 'sell_item', 10);
    sell.today.sold = { latte: 7, espresso: 20 };
    expect(challengeProgress(sell)!.value).toBe(7);
  });

  it('fails stars_week on the first day closed below the stars and pays nothing', () => {
    const state = gameInWeek(5);
    withChallenge(state, 'stars_week');
    state.rating = 4.64;
    closeAndNext(state);
    expect(state.week!.challenge!.progress).toBe(1);
    state.rating = 4.54;
    closeAndNext(state);
    expect(challengeProgress(state)).toEqual({ value: 1, target: 7, done: false, failed: true });
    state.rating = 5;
    for (let i = 0; i < 6; i++) closeAndNext(state);
    expect(state.week!.challenge!.status).toBe('failed');
    expect(state.retention?.tickets ?? 0).toBe(0);
  });

  it('completes stars_week after 7 days at the stars', () => {
    const state = gameInWeek(5);
    withChallenge(state, 'stars_week');
    state.rating = 4.6;
    for (let i = 0; i < 7; i++) closeAndNext(state);
    expect(challengeProgress(state)!.done).toBe(true);
  });

  it('counts a calm day only without walkouts and with enough customers served', () => {
    const state = gameInWeek(5);
    withChallenge(state, 'calm_day');
    state.today.customersServed = 100;
    state.today.customersLost = 1;
    closeAndNext(state);
    state.today.customersServed = WEEK_CHALLENGES.calm_day.minServed! - 1;
    closeAndNext(state);
    expect(challengeProgress(state)!.done).toBe(false);
    state.today.customersServed = WEEK_CHALLENGES.calm_day.minServed!;
    closeAndNext(state);
    expect(challengeProgress(state)!.done).toBe(true);
  });

  it('counts the days with every daily mission completed', () => {
    const state = gameInWeek(5);
    withChallenge(state, 'perfect_days', 2);
    const m = (status: 'active' | 'completed') => ({ status }) as NonNullable<DailyReport['missions']>[number];
    closeAndNext(state, report([m('completed'), m('active'), m('completed')]));
    closeAndNext(state, report([m('completed'), m('completed'), m('completed')]));
    closeAndNext(state, report([]));
    expect(challengeProgress(state)!.value).toBe(1);
    closeAndNext(state, report([m('completed'), m('completed'), m('completed')]));
    expect(challengeProgress(state)!.done).toBe(true);
  });

  it('leaves the week score and goal alone', () => {
    const state = gameInWeek(5);
    const goal = { ...state.week!.goal };
    withChallenge(state, 'served_week', 1);
    state.today.customersServed = 5;
    closeAndNext(state);
    expect(state.week!.goal).toEqual(goal);
    expect(state.week!.result).toBeUndefined();
  });
});
