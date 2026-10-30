import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, loadGame, saveGame, saveKey } from '../../src/save/save';
import { createMemoryStorage } from '../../src/save/storage';
import { rollWeekChallenge } from '../../src/sim/challenges';
import { WEEK_LENGTH, weekGoal } from '../../src/sim/data/week';
import { dispatch } from '../../src/sim/index';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { GameState } from '../../src/sim/types';
import { rollWeekPlan } from '../../src/sim/week';

/**
 * E-16 adds `week.challenge` without a new save version. A save from before it
 * gets the challenge on the morning of a week's first day; a week already
 * under way keeps none, and the next week draws its own.
 */

/** A pre-E-16 normal game in week `index`, on week day `weekDay`, in `phase`. */
function oldSave(index: number, weekDay: number, phase: GameState['phase']): GameState {
  const state = createNewGame('Quán Cũ E16', 'normal', 1616);
  const startedDay = (index - 1) * WEEK_LENGTH + 1;
  state.day = startedDay + weekDay - 1;
  state.today = createDayStats(state.day, state.rating);
  state.phase = phase;
  state.week = { length: WEEK_LENGTH, index, startedDay, plan: rollWeekPlan(state.seed, index), goal: weekGoal('normal', index) };
  return state;
}

function store(file: unknown) {
  const storage = createMemoryStorage();
  storage.setItem(saveKey('auto'), JSON.stringify(file));
  return storage;
}

function load(state: GameState): GameState {
  const r = loadGame('auto', store({ version: SAVE_VERSION, savedAt: 1_700_000_000_000, state: { ...state, events: [] } }));
  expect(r.ok).toBe(true);
  return (r as { ok: true; value: GameState }).value;
}

describe('saves from before the E-16 week challenges', () => {
  it('keep the save version', () => {
    expect(SAVE_VERSION).toBe(6);
  });

  it('get no challenge mid-week, then the next week opens with its draw', () => {
    const s = load(oldSave(5, 3, 'opening'));
    expect(s.week!.challenge).toBeUndefined();
    s.day = s.week!.startedDay + WEEK_LENGTH - 1;
    s.today = createDayStats(s.day, s.rating);
    s.phase = 'report';
    s.week!.result = { revenue: 0, revenueTarget: 1, stars: 4, starsTarget: 4, score: 0, cups: 0, days: [] };
    expect(dispatch(s, { type: 'next_day' })).toBe(true);
    expect(s.week!.index).toBe(6);
    expect(s.week!.challenge).toEqual(rollWeekChallenge(s.seed, 6));
  });

  it('get the challenge of the week when loaded on the morning of its first day', () => {
    const s = load(oldSave(7, 1, 'preparation'));
    expect(s.week!.challenge).toEqual(rollWeekChallenge(s.seed, 7));
  });

  it('in week 4 or earlier get none, and week 5 draws one', () => {
    expect(load(oldSave(4, 1, 'preparation')).week!.challenge).toBeUndefined();
    const s = load(oldSave(4, WEEK_LENGTH, 'report'));
    s.week!.result = { revenue: 0, revenueTarget: 1, stars: 4, starsTarget: 4, score: 0, cups: 0, days: [] };
    expect(dispatch(s, { type: 'next_day' })).toBe(true);
    expect(s.week!.challenge).toEqual(rollWeekChallenge(s.seed, 5));
  });

  it('keep a stored challenge and its progress through save and load', () => {
    const state = oldSave(6, 4, 'opening');
    state.week!.challenge = { ...rollWeekChallenge(state.seed, 6)!, progress: 3, settledDay: state.day - 1 };
    const storage = createMemoryStorage();
    expect(saveGame(state, 'auto', storage).ok).toBe(true);
    const r = loadGame('auto', storage);
    expect(r.ok).toBe(true);
    expect((r as { ok: true; value: GameState }).value.week!.challenge).toEqual(state.week!.challenge);
  });

  it('drop a challenge the game cannot read and still load', () => {
    const state = oldSave(6, 4, 'opening');
    const raw = { ...state, events: [], week: { ...state.week, challenge: { id: 'paint_the_wall', target: 1, progress: 0, reward: { tickets: 1 } } } };
    const r = loadGame('auto', store({ version: SAVE_VERSION, savedAt: 0, state: raw }));
    expect(r.ok).toBe(true);
    expect((r as { ok: true; value: GameState }).value.week!.challenge).toBeUndefined();
  });
});
