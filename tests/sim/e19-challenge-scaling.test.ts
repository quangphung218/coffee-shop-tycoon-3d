import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, loadGame, saveGame, saveKey } from '../../src/save/save';
import { createMemoryStorage } from '../../src/save/storage';
import { challengesToUnlock, describeChallenge, endOfDayChallenge, nextChallengeStyle, rollWeekChallenge } from '../../src/sim/challenges';
import {
  CHALLENGE_FIRST_WEEK,
  CHALLENGE_SCALE_FACTORS,
  CHALLENGE_SCALE_FIRST_WEEK,
  CHALLENGE_SCALE_WEEKS,
  CHALLENGE_STYLE_ORDER,
  WEEK_CHALLENGES,
  scaledChallengeTarget,
} from '../../src/sim/data/challenges';
import { WEEK_LENGTH, weekGoal } from '../../src/sim/data/week';
import { createDayStats, createNewGame } from '../../src/sim/state';
import { isStyleUnlocked } from '../../src/sim/styles';
import type { DailyReport, DayStats, GameState, WeekChallenge, WeekChallengeId } from '../../src/sim/types';
import { rollWeekPlan } from '../../src/sim/week';

/** `weeks` finished weeks of identical days before week `index`, every day serving `served` (a third regulars, a fifth of it latte). */
function pastDays(index: number, weeks: number, served: number): DayStats[] {
  const days: DayStats[] = [];
  const first = (index - 1 - weeks) * WEEK_LENGTH + 1;
  for (let d = first; d < first + weeks * WEEK_LENGTH; d++) {
    const s = createDayStats(d, 4);
    s.customersServed = served;
    s.regularsServed = Math.floor(served / 3);
    s.sold = { latte: Math.floor(served / 5), espresso: Math.floor(served / 5) };
    days.push(s);
  }
  return days;
}

/** First week from `from` whose challenge for `seed` uses template `id`. */
function weekOf(seed: number, id: WeekChallengeId, from = CHALLENGE_SCALE_FIRST_WEEK): number {
  for (let w = from; w < from + 200; w++) if (rollWeekChallenge(seed, w)!.id === id) return w;
  throw new Error(`no ${id}`);
}

const COUNTING: WeekChallengeId[] = ['served_week', 'sell_item', 'regular_visits', 'calm_day'];

describe('counting challenges scale with previous weeks (E-19)', () => {
  it('keeps every week 5-8 challenge on the template numbers, whatever the past', () => {
    const big = pastDays(CHALLENGE_SCALE_FIRST_WEEK, 4, 2000);
    for (const seed of [1, 42, 777, 2024, 99]) {
      for (let w = CHALLENGE_FIRST_WEEK; w < CHALLENGE_SCALE_FIRST_WEEK; w++) {
        expect(rollWeekChallenge(seed, w, big)).toEqual(rollWeekChallenge(seed, w));
        const c = rollWeekChallenge(seed, w, big)!;
        expect(c.target).toBe(WEEK_CHALLENGES[c.id].target);
        expect(c.minServed).toBeUndefined();
      }
    }
    expect(CHALLENGE_SCALE_FIRST_WEEK).toBe(9);
  });

  it('never goes below the template numbers (floor)', () => {
    for (const id of COUNTING) {
      const floor = id === 'calm_day' ? WEEK_CHALLENGES.calm_day.minServed! : WEEK_CHALLENGES[id].target;
      expect(scaledChallengeTarget(id as 'calm_day', 0)).toBe(floor);
      const w = weekOf(7, id);
      const c = rollWeekChallenge(7, w, pastDays(w, 4, 10))!;
      expect(c.target).toBe(WEEK_CHALLENGES[id].target);
      expect(c.minServed).toBeUndefined();
      // No past days: as drawn.
      expect(rollWeekChallenge(7, w, [])).toEqual(rollWeekChallenge(7, w));
    }
  });

  it('scales each counting target to the previous weeks times its factor, rounded to its step', () => {
    const served = 600;
    const seed = 7;
    const w = (id: WeekChallengeId) => weekOf(seed, id);
    const roll = (id: WeekChallengeId) => rollWeekChallenge(seed, w(id), pastDays(w(id), 4, served))!;
    expect(roll('served_week').target).toBe(Math.round((served * 7 * CHALLENGE_SCALE_FACTORS.served_week) / 50) * 50);
    expect(roll('regular_visits').target).toBe(Math.round((200 * 7 * CHALLENGE_SCALE_FACTORS.regular_visits) / 5) * 5);
    const sell = roll('sell_item');
    const sold = sell.itemId === 'latte' || sell.itemId === 'espresso' ? 120 : 0;
    expect(sell.target).toBe(Math.max(WEEK_CHALLENGES.sell_item.target, Math.round((sold * 7 * CHALLENGE_SCALE_FACTORS.sell_item) / 10) * 10));
    const calm = roll('calm_day');
    expect(calm.target).toBe(1);
    expect(calm.minServed).toBe(Math.round((served * CHALLENGE_SCALE_FACTORS.calm_day) / 10) * 10);
    expect(describeChallenge(calm).description).toContain(String(calm.minServed));
    // Bigger past, bigger target.
    expect(rollWeekChallenge(seed, w('served_week'), pastDays(w('served_week'), 4, 900))!.target).toBeGreaterThan(roll('served_week').target);
    // Non-counting templates never scale.
    for (const id of ['stars_week', 'perfect_days'] as const) expect(rollWeekChallenge(seed, w(id), pastDays(w(id), 4, 2000))!.target).toBe(WEEK_CHALLENGES[id].target);
  });

  it(`averages only the last ${CHALLENGE_SCALE_WEEKS} weeks, per week over the days there are`, () => {
    const w = weekOf(7, 'served_week');
    const recent = pastDays(w, 4, 600);
    const old = pastDays(w - 4, 4, 5000);
    expect(rollWeekChallenge(7, w, [...old, ...recent])).toEqual(rollWeekChallenge(7, w, recent));
    // Two weeks of history average the same as four of the same days.
    expect(rollWeekChallenge(7, w, recent.slice(-14))).toEqual(rollWeekChallenge(7, w, recent));
  });

  it('is deterministic: same seed and past give the same sequence and goals', () => {
    const seq = (seed: number) =>
      Array.from({ length: 30 }, (_, i) => {
        const w = CHALLENGE_SCALE_FIRST_WEEK + i;
        return rollWeekChallenge(seed, w, pastDays(w, 4, 500 + i * 10));
      });
    expect(seq(42)).toEqual(seq(42));
    expect(seq(42).map((c) => c!.id)).toEqual(Array.from({ length: 30 }, (_, i) => rollWeekChallenge(42, CHALLENGE_SCALE_FIRST_WEEK + i)!.id));
  });

  it('a calm day counts only from the scaled minServed', () => {
    const state = gameIn(CHALLENGE_SCALE_FIRST_WEEK);
    const c: WeekChallenge = { id: 'calm_day', target: 1, minServed: 500, reward: { tickets: 5 }, progress: 0, settledDay: 0, status: 'active' };
    state.week!.challenge = c;
    state.today.customersServed = 450;
    endOfDayChallenge(state, { missions: [] } as unknown as DailyReport);
    expect(c.progress).toBe(0);
    state.day += 1;
    state.today = createDayStats(state.day, state.rating);
    state.today.customersServed = 500;
    endOfDayChallenge(state, { missions: [] } as unknown as DailyReport);
    expect(c.status).toBe('completed');
  });
});

function gameIn(index: number): GameState {
  const state = createNewGame('Quán E19', 'normal', 5);
  state.day = (index - 1) * WEEK_LENGTH + 1;
  state.today = createDayStats(state.day, state.rating);
  state.week = { length: WEEK_LENGTH, index, startedDay: state.day, plan: rollWeekPlan(state.seed, index), goal: weekGoal('normal', index) };
  return state;
}

/** Completes a challenge of template `id` on the current day and moves to the next day. */
function complete(state: GameState, id: WeekChallengeId): WeekChallenge {
  const c: WeekChallenge = { id, target: 1, reward: { tickets: 5 }, progress: 0, settledDay: 0, status: 'active' };
  if (id === 'sell_item') c.itemId = 'latte';
  state.week!.challenge = c;
  state.today.customersServed = 1000;
  state.today.regularsServed = 1;
  state.today.sold = { latte: 1 };
  state.rating = 5;
  endOfDayChallenge(state, { missions: [{ status: 'completed' }] } as unknown as DailyReport);
  expect(c.status).toBe('completed');
  state.day += 1;
  state.today = createDayStats(state.day, state.rating);
  return c;
}

describe('challenge styles unlock by any challenge in a fixed order (E-19)', () => {
  it('each completed challenge, whatever its template, opens the next locked style', () => {
    const state = gameIn(CHALLENGE_SCALE_FIRST_WEEK);
    const ids: WeekChallengeId[] = ['served_week', 'perfect_days', 'stars_week', 'served_week', 'calm_day', 'sell_item'];
    const opened = ids.map((id) => complete(state, id).reward.unlock?.id ?? null);
    expect(opened).toEqual([...CHALLENGE_STYLE_ORDER, null]);
    for (const s of CHALLENGE_STYLE_ORDER) expect(isStyleUnlocked(state, s)).toBe(true);
    expect(nextChallengeStyle(state)).toBeNull();
  });

  it('skips styles a save already unlocked and counts how many challenges each locked one needs', () => {
    const state = gameIn(CHALLENGE_SCALE_FIRST_WEEK);
    state.styles = { chosen: {}, owned: [], unlocked: ['awning_gold'] };
    expect(challengesToUnlock(state, 'sign_neon')).toBe(1);
    expect(challengesToUnlock(state, 'floor_checker')).toBe(3);
    expect(challengesToUnlock(state, 'awning_gold')).toBe(0);
    // An old saved challenge still naming its template's style opens the next in order instead.
    const c: WeekChallenge = { id: 'calm_day', target: 1, reward: { tickets: 5, unlock: { kind: 'decor', id: 'awning_gold' } }, progress: 0, settledDay: 0, status: 'active' };
    state.week!.challenge = c;
    state.today.customersServed = 1000;
    endOfDayChallenge(state, { missions: [] } as unknown as DailyReport);
    expect(c.reward.unlock).toEqual({ kind: 'decor', id: 'sign_neon' });
    expect(state.styles.unlocked).toEqual(['awning_gold', 'sign_neon']);
  });
});

describe('save compat (E-19 challenges)', () => {
  it('loads a save whose challenge has no minServed and an old template unlock, and keeps a scaled minServed', () => {
    const storage = createMemoryStorage();
    const state = gameIn(CHALLENGE_SCALE_FIRST_WEEK);
    state.week!.challenge = { id: 'calm_day', target: 1, reward: { tickets: 5, unlock: { kind: 'decor', id: 'awning_gold' } }, progress: 0, settledDay: 0, status: 'active' };
    saveGame(state, '1', storage);
    const old = loadGame('1', storage);
    expect(old.ok && old.value.week?.challenge?.reward.unlock?.id).toBe('awning_gold');
    expect(old.ok && describeChallenge(old.value.week!.challenge!).description).toContain(String(WEEK_CHALLENGES.calm_day.minServed));
    state.week!.challenge!.minServed = 480;
    saveGame(state, '1', storage);
    const r = loadGame('1', storage);
    expect(r.ok && r.value.week?.challenge?.minServed).toBe(480);
    expect(storage.getItem(saveKey('1'))).toContain(`"version":${SAVE_VERSION}`);
  });
});
