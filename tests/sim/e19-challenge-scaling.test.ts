import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, loadGame, saveGame, saveKey } from '../../src/save/save';
import { createMemoryStorage } from '../../src/save/storage';
import {
  challengeSize,
  challengesToUnlock,
  describeChallenge,
  endOfDayChallenge,
  ensureWeekChallenge,
  nextChallengeStyle,
  rollWeekChallenge,
  type ChallengeSize,
} from '../../src/sim/challenges';
import {
  CHALLENGE_ANCHOR_FACTORS,
  CHALLENGE_ANCHOR_FIRST_WEEK,
  CHALLENGE_FIRST_WEEK,
  CHALLENGE_SCALE_FACTORS,
  CHALLENGE_SCALE_FIRST_WEEK,
  CHALLENGE_SCALE_WEEKS,
  CHALLENGE_STANDARD,
  CHALLENGE_STYLE_ORDER,
  WEEK_CHALLENGES,
  anchoredChallengeTarget,
  challengeStandard,
  scaledChallengeTarget,
  type ScaledChallengeId,
} from '../../src/sim/data/challenges';
import { SCALED_GOAL_MIN_LEVEL, SIZE_GOAL_MAX_LEVELS, WEEK_LENGTH, levelCurve, sizeGoalRowIndex, weekGoal } from '../../src/sim/data/week';
import { createDayStats, createNewGame } from '../../src/sim/state';
import { isStyleUnlocked } from '../../src/sim/styles';
import type { DailyReport, DayStats, Difficulty, GameState, MenuItemId, WeekChallenge, WeekChallengeId } from '../../src/sim/types';
import { nextWeekGoal, rollWeekPlan } from '../../src/sim/week';

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

/** First week in [from, to) whose challenge for `seed` uses template `id`. */
function weekOf(seed: number, id: WeekChallengeId, from = CHALLENGE_ANCHOR_FIRST_WEEK, to = from + 200): number {
  for (let w = from; w < to; w++) if (rollWeekChallenge(seed, w)!.id === id) return w;
  throw new Error(`no ${id} for seed ${seed} in weeks ${from}-${to - 1}`);
}

/** A seed whose weeks CHALLENGE_SCALE_FIRST_WEEK..CHALLENGE_ANCHOR_FIRST_WEEK - 1 draw every template in `ids`. */
function e19Seed(ids: readonly WeekChallengeId[]): number {
  for (let seed = 1; seed < 500; seed++) {
    const drawn = new Set<WeekChallengeId>();
    for (let w = CHALLENGE_SCALE_FIRST_WEEK; w < CHALLENGE_ANCHOR_FIRST_WEEK; w++) drawn.add(rollWeekChallenge(seed, w)!.id);
    if (ids.every((id) => drawn.has(id))) return seed;
  }
  throw new Error('no seed');
}

const COUNTING: WeekChallengeId[] = ['served_week', 'sell_item', 'regular_visits', 'calm_day'];
const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];
const E19_SEED = e19Seed([...COUNTING, 'stars_week', 'perfect_days']);
/** Week CHALLENGE_SCALE_FIRST_WEEK..CHALLENGE_ANCHOR_FIRST_WEEK - 1 of E19_SEED drawing `id`. */
const e19Week = (id: WeekChallengeId) => weekOf(E19_SEED, id, CHALLENGE_SCALE_FIRST_WEEK, CHALLENGE_ANCHOR_FIRST_WEEK);

/** Number a counting challenge of template `id` (item `itemId` for sell_item) asks for at `size` from CHALLENGE_ANCHOR_FIRST_WEEK, from CHALLENGE_STANDARD. */
function expected(id: ScaledChallengeId, size: ChallengeSize, itemId?: MenuItemId): number {
  const std = challengeStandard(size.difficulty, size.row);
  if (id === 'calm_day') return anchoredChallengeTarget(id, std.served / WEEK_LENGTH);
  if (id === 'served_week') return anchoredChallengeTarget(id, std.served);
  if (id === 'regular_visits') return anchoredChallengeTarget(id, std.regulars);
  return anchoredChallengeTarget(id, std.sold[itemId!] ?? 0);
}

describe('CHALLENGE_STANDARD (E-24)', () => {
  it('has a row for every SIZE_GOAL row, never shrinking with the row, and a number for every item sell_item draws', () => {
    for (const d of DIFFICULTIES) {
      const rows = CHALLENGE_STANDARD[d];
      expect(rows).toHaveLength(SIZE_GOAL_MAX_LEVELS + 1);
      rows.forEach((r, i) => {
        expect(r.served).toBeGreaterThan(0);
        expect(r.regulars).toBeGreaterThan(0);
        if (i > 0) expect(r.served).toBeGreaterThanOrEqual(rows[i - 1]!.served);
      });
      for (let w = CHALLENGE_SCALE_FIRST_WEEK; w < CHALLENGE_SCALE_FIRST_WEEK + 60; w++) {
        const c = rollWeekChallenge(1, w)!;
        if (c.id === 'sell_item') expect(rows[0]!.sold[c.itemId!]).toBeGreaterThan(0);
      }
    }
    // Out-of-range rows clamp to the table.
    expect(challengeStandard('normal', 999)).toBe(CHALLENGE_STANDARD.normal[SIZE_GOAL_MAX_LEVELS]);
    expect(challengeStandard('normal', -3)).toBe(CHALLENGE_STANDARD.normal[0]);
  });
});

describe('counting challenges scale with previous weeks before week 21 (E-19)', () => {
  const big: ChallengeSize = { difficulty: 'easy', row: SIZE_GOAL_MAX_LEVELS };

  it('keeps every week 5-8 challenge on the template numbers, whatever the past or size', () => {
    const past = pastDays(CHALLENGE_SCALE_FIRST_WEEK, 4, 2000);
    for (const seed of [1, 42, 777, 2024, 99]) {
      for (let w = CHALLENGE_FIRST_WEEK; w < CHALLENGE_SCALE_FIRST_WEEK; w++) {
        const c = rollWeekChallenge(seed, w, past, big)!;
        expect(c).toEqual(rollWeekChallenge(seed, w));
        expect(c.target).toBe(WEEK_CHALLENGES[c.id].target);
        expect(c.minServed).toBeUndefined();
      }
    }
    expect(CHALLENGE_SCALE_FIRST_WEEK).toBe(9);
    expect(CHALLENGE_ANCHOR_FIRST_WEEK).toBe(21);
  });

  it('never goes below the template numbers (floor)', () => {
    for (const id of COUNTING) {
      const floor = id === 'calm_day' ? WEEK_CHALLENGES.calm_day.minServed! : WEEK_CHALLENGES[id].target;
      expect(scaledChallengeTarget(id as ScaledChallengeId, 0)).toBe(floor);
      const w = e19Week(id);
      const c = rollWeekChallenge(E19_SEED, w, pastDays(w, 4, 10))!;
      expect(c.target).toBe(WEEK_CHALLENGES[id].target);
      expect(c.minServed).toBeUndefined();
      // No past days: as drawn.
      expect(rollWeekChallenge(E19_SEED, w, [])).toEqual(rollWeekChallenge(E19_SEED, w));
    }
  });

  it('scales each counting target to the previous weeks times its factor, rounded to its step; the size row does not matter', () => {
    const served = 600;
    const seed = E19_SEED;
    const roll = (id: WeekChallengeId, size?: ChallengeSize) => rollWeekChallenge(seed, e19Week(id), pastDays(e19Week(id), 4, served), size)!;
    expect(roll('served_week').target).toBe(Math.round((served * 7 * CHALLENGE_SCALE_FACTORS.served_week) / 50) * 50);
    expect(roll('regular_visits').target).toBe(Math.round((200 * 7 * CHALLENGE_SCALE_FACTORS.regular_visits) / 5) * 5);
    const sell = roll('sell_item');
    const sold = sell.itemId === 'latte' || sell.itemId === 'espresso' ? 120 : 0;
    expect(sell.target).toBe(Math.max(WEEK_CHALLENGES.sell_item.target, Math.round((sold * 7 * CHALLENGE_SCALE_FACTORS.sell_item) / 10) * 10));
    const calm = roll('calm_day');
    expect(calm.target).toBe(1);
    expect(calm.minServed).toBe(Math.round((served * CHALLENGE_SCALE_FACTORS.calm_day) / 10) * 10);
    expect(describeChallenge(calm).description).toContain(String(calm.minServed));
    for (const id of COUNTING) expect(roll(id, big)).toEqual(roll(id));
    // Bigger past, bigger target.
    const w = e19Week('served_week');
    expect(rollWeekChallenge(seed, w, pastDays(w, 4, 900))!.target).toBeGreaterThan(roll('served_week').target);
    // Non-counting templates never scale.
    for (const id of ['stars_week', 'perfect_days'] as const) expect(rollWeekChallenge(seed, e19Week(id), pastDays(e19Week(id), 4, 2000))!.target).toBe(WEEK_CHALLENGES[id].target);
  });

  it(`averages only the last ${CHALLENGE_SCALE_WEEKS} weeks, per week over the days there are`, () => {
    const w = e19Week('served_week');
    const recent = pastDays(w, 4, 600);
    const old = pastDays(w - 4, 4, 5000);
    expect(rollWeekChallenge(E19_SEED, w, [...old, ...recent])).toEqual(rollWeekChallenge(E19_SEED, w, recent));
    // Two weeks of history average the same as four of the same days.
    expect(rollWeekChallenge(E19_SEED, w, recent.slice(-14))).toEqual(rollWeekChallenge(E19_SEED, w, recent));
  });

  it('ensureWeekChallenge reads the day history before week 21', () => {
    const w = e19Week('served_week');
    const state = gameIn(w, 'normal');
    state.seed = E19_SEED;
    state.history = Array.from({ length: 28 }, (_, i) => ({ ...createDayStats(state.day - 28 + i, 4), customersServed: 600 }));
    state.phase = 'preparation';
    ensureWeekChallenge(state);
    expect(state.week!.challenge!.id).toBe('served_week');
    expect(state.week!.challenge!.target).toBe(scaledChallengeTarget('served_week', 600 * WEEK_LENGTH));
  });
});

describe('counting challenges follow the size-goal row from week 21 (E-24)', () => {
  it('uses its own factors, apart from the E-19 ones', () => {
    expect(CHALLENGE_ANCHOR_FACTORS).toEqual({ served_week: 1, sell_item: 2, regular_visits: 1, calm_day: 1 });
    expect(CHALLENGE_SCALE_FACTORS).toEqual({ served_week: 0.95, sell_item: 0.95, regular_visits: 1, calm_day: 0.9 });
  });

  it('never goes below the template numbers (floor)', () => {
    for (const id of COUNTING) {
      const floor = id === 'calm_day' ? WEEK_CHALLENGES.calm_day.minServed! : WEEK_CHALLENGES[id].target;
      expect(anchoredChallengeTarget(id as ScaledChallengeId, 0)).toBe(floor);
      for (const d of DIFFICULTIES) {
        for (let row = 0; row <= SIZE_GOAL_MAX_LEVELS; row++) {
          const c = rollWeekChallenge(7, weekOf(7, id), [], { difficulty: d, row })!;
          if (id === 'calm_day') expect(c.minServed ?? floor).toBeGreaterThanOrEqual(floor);
          else expect(c.target).toBeGreaterThanOrEqual(floor);
        }
      }
      // Without a size: as drawn.
      expect(rollWeekChallenge(7, weekOf(7, id))!.target).toBe(WEEK_CHALLENGES[id].target);
    }
  });

  it('scales each counting target to the standard row times its factor, rounded to its step; the past does not matter', () => {
    const seed = 7;
    for (const d of DIFFICULTIES) {
      for (const row of [0, 30, 50, SIZE_GOAL_MAX_LEVELS]) {
        const size: ChallengeSize = { difficulty: d, row };
        const std = challengeStandard(d, row);
        for (const id of ['served_week', 'regular_visits', 'sell_item'] as const) {
          const w = weekOf(seed, id);
          const c = rollWeekChallenge(seed, w, [], size)!;
          expect(c.target).toBe(expected(id, size, c.itemId));
          expect(rollWeekChallenge(seed, w, pastDays(w, 4, 5000), size)).toEqual(c);
        }
        expect(rollWeekChallenge(seed, weekOf(seed, 'served_week'), [], size)!.target).toBe(
          Math.max(WEEK_CHALLENGES.served_week.target, Math.round((std.served * CHALLENGE_ANCHOR_FACTORS.served_week) / 50) * 50),
        );
        const calm = rollWeekChallenge(seed, weekOf(seed, 'calm_day'), [], size)!;
        expect(calm.target).toBe(1);
        expect(calm.minServed ?? WEEK_CHALLENGES.calm_day.minServed).toBe(expected('calm_day', size));
        expect(describeChallenge(calm).description).toContain(String(calm.minServed ?? WEEK_CHALLENGES.calm_day.minServed));
      }
    }
    // Non-counting templates never scale.
    for (const id of ['stars_week', 'perfect_days'] as const) {
      expect(rollWeekChallenge(seed, weekOf(seed, id), [], { difficulty: 'easy', row: SIZE_GOAL_MAX_LEVELS })!.target).toBe(WEEK_CHALLENGES[id].target);
    }
  });

  it('reads the same row as the week goal (sizeGoalRowIndex): an unupgraded shop gets the row of a shop its age, its own sales do not matter', () => {
    for (const d of DIFFICULTIES) {
      for (let w = CHALLENGE_ANCHOR_FIRST_WEEK; w <= 40; w++) {
        const state = gameIn(w, d);
        expect(challengeSize(state, w)).toEqual({ difficulty: d, row: sizeGoalRowIndex(d, w, 0) });
        state.upgrades = { tables: 30, better_machine: 30 } as GameState['upgrades'];
        expect(challengeSize(state, w).row).toBe(sizeGoalRowIndex(d, w, 60));
      }
    }
    // Weeks 21-40 of a shop with no upgrades read at least floor(0.85 x LEVEL_CURVE).
    expect(challengeSize(gameIn(30, 'normal'), 30).row).toBe(Math.floor(0.85 * levelCurve('normal', 30)));
    // The day history (own past sales) does not move the number from week 21.
    const w = weekOf(5, 'served_week');
    const quiet = gameIn(w, 'normal');
    const busy = gameIn(w, 'normal');
    quiet.seed = busy.seed = 5;
    busy.history = Array.from({ length: 28 }, (_, i) => ({ ...createDayStats(busy.day - 28 + i, 4), customersServed: 5000 }));
    quiet.phase = busy.phase = 'preparation';
    ensureWeekChallenge(quiet);
    ensureWeekChallenge(busy);
    expect(busy.week!.challenge).toEqual(quiet.week!.challenge);
    expect(quiet.week!.challenge!.target).toBe(expected('served_week', challengeSize(quiet, quiet.week!.index)));
  });

  it('a new week from week 21 draws its challenge at the row of its week goal', () => {
    const state = createNewGame('Quán E24', 'normal', 5);
    state.shopLevel = SCALED_GOAL_MIN_LEVEL;
    state.upgrades = { tables: 20 } as GameState['upgrades'];
    const index = CHALLENGE_ANCHOR_FIRST_WEEK + 3;
    state.day = index * WEEK_LENGTH;
    state.week = { length: WEEK_LENGTH, index: index - 1, startedDay: state.day - WEEK_LENGTH + 1, plan: rollWeekPlan(state.seed, index - 1), goal: weekGoal('normal', index - 1) };
    const goal = nextWeekGoal(state).goal;
    expect(goal.row).toBe(challengeSize(state, index).row);
    expect(rollWeekChallenge(state.seed, index, [], challengeSize(state, index))).toEqual(
      rollWeekChallenge(state.seed, index, [], { difficulty: 'normal', row: goal.row! }),
    );
  });

  it('is deterministic: same seed, past and size give the same sequence and goals', () => {
    const seq = (seed: number) =>
      Array.from({ length: 30 }, (_, i) => {
        const w = CHALLENGE_SCALE_FIRST_WEEK + i;
        return rollWeekChallenge(seed, w, pastDays(w, 4, 500 + i * 10), { difficulty: 'normal', row: sizeGoalRowIndex('normal', w, i) });
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

function gameIn(index: number, difficulty: Difficulty = 'normal'): GameState {
  const state = createNewGame('Quán E19', difficulty, 5);
  state.day = (index - 1) * WEEK_LENGTH + 1;
  state.today = createDayStats(state.day, state.rating);
  state.week = { length: WEEK_LENGTH, index, startedDay: state.day, plan: rollWeekPlan(state.seed, index), goal: weekGoal(difficulty, index) };
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
