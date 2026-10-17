import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, loadGame, saveGame, saveKey } from '../../src/save/save';
import { createMemoryStorage } from '../../src/save/storage';
import { menuUnlockLevel, upgradeUnlockLevel } from '../../src/sim/data/levels';
import { MENU } from '../../src/sim/data/menu';
import { UPGRADES } from '../../src/sim/data/upgrades';
import { WEEK_GOALS, WEEK_LENGTH, weekGoal } from '../../src/sim/data/week';
import { dispatch } from '../../src/sim/index';
import { isUnlocked } from '../../src/sim/progression';
import { createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState } from '../../src/sim/types';
import { todayPlan } from '../../src/sim/week';
import { playDay } from '../integration/helpers';

/** Loads `text` from a fresh in-memory slot and expects it to load. */
function loadText(text: string): GameState {
  const storage = createMemoryStorage();
  storage.setItem(saveKey('1'), text);
  const r = loadGame('1', storage);
  expect(r.ok).toBe(true);
  return (r as { ok: true; value: GameState }).value;
}

/**
 * Plays from the current morning through the report of game day `lastDay`,
 * restocking as suggested; returns every event, the morning ones included.
 */
function playThrough(state: GameState, lastDay: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (;;) {
    events.push(...state.events);
    state.events = [];
    dispatch(state, { type: 'apply_restock' });
    events.push(...playDay(state));
    if (state.day >= lastDay) return events;
    expect(dispatch(state, { type: 'next_day' })).toBe(true);
  }
}

describe('saving a week mid-way', { timeout: 120_000 }, () => {
  it('keeps the plan, goal and policies through save and load, then ends the week on day 7', () => {
    const state = createNewGame('Quán Tuần', 'normal', 4242);
    playThrough(state, 2);
    expect(dispatch(state, { type: 'next_day' })).toBe(true);
    expect(state.day).toBe(3);
    expect(state.phase).toBe('preparation');
    expect(dispatch(state, { type: 'set_policy', policy: 'price', level: 'high' })).toBe(true);

    const storage = createMemoryStorage();
    expect(saveGame(state, '1', storage, 1000).ok).toBe(true);
    const loaded = loadGame('1', storage);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const g = loaded.value;

    expect(g.week!.plan).toEqual(state.week!.plan);
    expect(g.week!.goal).toEqual(state.week!.goal);
    expect(g.week!.startedDay).toBe(state.week!.startedDay);
    expect(g.policies).toEqual(state.policies);
    expect(g.policies?.price).toBe('high');
    expect(todayPlan(g)).toEqual(todayPlan(state));
    expect(todayPlan(g)?.day).toBe(3);
    expect(g.weather).toBe(todayPlan(g)!.weather);

    const events = playThrough(g, WEEK_LENGTH);
    expect(g.day).toBe(WEEK_LENGTH);
    expect(events.filter((e) => e.type === 'week_ended')).toHaveLength(1);
    expect(g.week!.result).toBeTruthy();
    expect(g.week!.result!.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('a v2 save without a week', { timeout: 120_000 }, () => {
  /** A real v2 save file of a new game, written before the week existed. */
  function v2SaveWithoutWeek(): string {
    const s = createNewGame('Quán Cũ', 'normal', 99);
    const legacy: Record<string, unknown> = JSON.parse(JSON.stringify(s));
    delete legacy.week;
    return JSON.stringify({ version: SAVE_VERSION, savedAt: 1, state: legacy });
  }

  /** Every menu item and upgrade is open exactly when the shop level reaches it. */
  function expectLevelUnlocks(g: GameState): void {
    for (const m of MENU) {
      expect(isUnlocked(g, 'menu', m.id), `day ${g.day} menu ${m.id}`).toBe(g.shopLevel >= menuUnlockLevel(m.id));
    }
    for (const u of UPGRADES) {
      expect(isUnlocked(g, 'upgrade', u.id), `day ${g.day} upgrade ${u.id}`).toBe(g.shopLevel >= upgradeUnlockLevel(u.id));
    }
  }

  it('loads, unlocks by level only and plays past day 7 without ending a week', () => {
    const g = loadText(v2SaveWithoutWeek());
    expect(g.week).toBeUndefined();
    expect(todayPlan(g)).toBeNull();
    expectLevelUnlocks(g);

    const events: GameEvent[] = [];
    for (;;) {
      events.push(...playThrough(g, g.day));
      expectLevelUnlocks(g);
      if (g.day > WEEK_LENGTH) break;
      expect(dispatch(g, { type: 'next_day' })).toBe(true);
    }
    expect(g.day).toBe(WEEK_LENGTH + 1);
    expect(events.some((e) => e.type === 'week_ended' || e.type === 'week_unlocks')).toBe(false);
    expect(g.week).toBeUndefined();
    expect(g.upgrades.expand_area ?? 0).toBe(0);
  });
});

describe('a week saved without a goal', { timeout: 120_000 }, () => {
  it('scores the week against the difficulty targets without throwing', () => {
    const s = createNewGame('Quán Khó', 'hard', 777);
    const raw: { state: { week: Record<string, unknown> } } & Record<string, unknown> = JSON.parse(
      JSON.stringify({ version: SAVE_VERSION, savedAt: 1, state: s }),
    );
    delete raw.state.week.goal;
    const g = loadText(JSON.stringify(raw));
    expect(g.week).toBeDefined();
    expect(g.week!.goal).toBeUndefined();

    let events: GameEvent[] = [];
    expect(() => {
      events = playThrough(g, WEEK_LENGTH);
    }).not.toThrow();
    const ended = events.filter((e) => e.type === 'week_ended');
    expect(ended).toHaveLength(1);
    const result = g.week!.result!;
    expect(result.revenueTarget).toBe(WEEK_GOALS.hard.revenue);
    expect(result.starsTarget).toBe(WEEK_GOALS.hard.stars);
    expect(Number.isFinite(result.score)).toBe(true);
    expect(dispatch(g, { type: 'next_day' })).toBe(true);
    expect(g.week!.index).toBe(2);
    expect(g.week!.goal).toEqual(weekGoal('hard', 2));
  });
});
