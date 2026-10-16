import { describe, expect, it } from 'vitest';
import { LEVELS } from '../../src/sim/data/levels';
import { WEEK_LENGTH, WEEK_UNLOCKS, dayUnlockDay } from '../../src/sim/data/week';
import { dispatch } from '../../src/sim/index';
import { validateLayout } from '../../src/sim/nav';
import { isUnlocked } from '../../src/sim/progression';
import { createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState } from '../../src/sim/types';
import { getShopLayout, tableZone } from '../../src/sim/upgrades';
import { playDay } from '../integration/helpers';

/** Plays today to the report and starts the next day; returns the events of the next-day morning. */
function nextDay(state: GameState): GameEvent[] {
  playDay(state, { play: false });
  state.events = [];
  expect(dispatch(state, { type: 'next_day' })).toBe(true);
  const events = state.events;
  state.events = [];
  return events;
}

describe('week unlock calendar', () => {
  it('lists the seven days in order', () => {
    expect(WEEK_UNLOCKS.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(WEEK_UNLOCKS).toHaveLength(WEEK_LENGTH);
  });

  it('never goes more than 2 days in a row without unlocking something (days 2..7)', () => {
    let gap = 0;
    for (const { day, unlocks, expandShop } of WEEK_UNLOCKS) {
      if (day < 2) continue;
      const opens = unlocks.menu.length + unlocks.upgrades.length + unlocks.tools.length > 0 || expandShop === true;
      gap = opens ? 0 : gap + 1;
      expect(gap, `day ${day}`).toBeLessThanOrEqual(2);
    }
  });

  it('expands the shop on day 7 only', () => {
    expect(WEEK_UNLOCKS.filter((d) => d.expandShop).map((d) => d.day)).toEqual([7]);
  });

  it('opens the level-1 starters on day 1 and every later level unlock by day 7', () => {
    for (const id of LEVELS[0]!.unlocks.menu) expect(dayUnlockDay('menu', id), id).toBe(1);
    expect(dayUnlockDay('menu', 'cappuccino')).toBe(2);
    expect(dayUnlockDay('upgrade', 'grinder')).toBe(2);
    expect(dayUnlockDay('upgrade', 'outdoor_seating')).toBe(5);
    expect(dayUnlockDay('upgrade', 'expand_area')).toBe(7);
    expect(dayUnlockDay('upgrade', 'fast_machine')).toBe(Infinity);
  });
});

describe('isUnlocked with a week', () => {
  it('a new game plays a 7-day week from day 1', () => {
    expect(createNewGame('Test', 'normal', 1).week).toEqual({ length: 7, startedDay: 1 });
  });

  it('opens items by the calendar day at shop level 1', () => {
    const s = createNewGame('Test', 'normal', 1);
    expect(isUnlocked(s, 'menu', 'cappuccino')).toBe(false);
    expect(isUnlocked(s, 'upgrade', 'grinder')).toBe(false);
    s.day = 2;
    expect(isUnlocked(s, 'menu', 'cappuccino')).toBe(true);
    expect(isUnlocked(s, 'upgrade', 'grinder')).toBe(true);
    expect(isUnlocked(s, 'menu', 'mocha')).toBe(false);
    s.day = 4;
    expect(isUnlocked(s, 'menu', 'mocha')).toBe(true);
    expect(isUnlocked(s, 'upgrade', 'paintings')).toBe(true);
    // Not on the calendar: still gated by the shop level.
    expect(isUnlocked(s, 'upgrade', 'fast_machine')).toBe(false);
    s.shopLevel = 2;
    expect(isUnlocked(s, 'upgrade', 'fast_machine')).toBe(true);
  });

  it('the shop level still unlocks ahead of the calendar', () => {
    const s = createNewGame('Test', 'normal', 1);
    s.shopLevel = 4;
    expect(isUnlocked(s, 'menu', 'frappe')).toBe(true);
    expect(isUnlocked(s, 'upgrade', 'blender')).toBe(true);
  });

  it('a save without a week unlocks by shop level only', () => {
    const s = createNewGame('Test', 'normal', 1);
    delete s.week;
    s.day = 7;
    expect(isUnlocked(s, 'menu', 'cappuccino')).toBe(false);
    expect(isUnlocked(s, 'upgrade', 'expand_area')).toBe(false);
    expect(dispatch(s, { type: 'set_menu_item', itemId: 'cappuccino', enabled: true })).toBe(false);
    s.shopLevel = 2;
    expect(isUnlocked(s, 'menu', 'cappuccino')).toBe(true);
  });

  it('lets the player enable a calendar item through dispatch', () => {
    const s = createNewGame('Test', 'normal', 1);
    expect(dispatch(s, { type: 'set_menu_item', itemId: 'cappuccino', enabled: true })).toBe(false);
    s.day = 2;
    expect(dispatch(s, { type: 'set_menu_item', itemId: 'cappuccino', enabled: true })).toBe(true);
  });
});

describe('playing the week to day 7', () => {
  it('announces each day and expands the shop on day 7 with a clean layout', () => {
    const s = createNewGame('Test', 'normal', 7);
    const morning: GameEvent[][] = [];
    while (s.day < 7) morning.push(nextDay(s));
    expect(s.day).toBe(7);
    expect(s.shopLevel).toBeLessThan(6);

    // Days 2..7 each announced what opened.
    morning.forEach((events, i) => {
      const unlock = events.find((e) => e.type === 'week_unlocks');
      expect(unlock, `day ${i + 2}`).toMatchObject({ type: 'week_unlocks', day: i + 2 });
    });
    expect(morning[5]!.some((e) => e.type === 'notify' && e.text === 'Quán mở rộng!')).toBe(true);
    expect(morning.slice(0, 5).flat().some((e) => e.type === 'notify' && e.text === 'Quán mở rộng!')).toBe(false);

    expect(s.upgrades.expand_area).toBe(1);
    const layout = getShopLayout(s);
    expect(layout.expansion).not.toBeNull();
    expect(layout.tables.some((t) => t.zone === 'expansion')).toBe(true);
    expect(s.tables.filter((t) => tableZone(t.pos) === 'expansion').length).toBeGreaterThan(0);
    expect(validateLayout(layout)).toEqual([]);
  });

  it('does not grant the expansion again when the shop already has it', () => {
    const s = createNewGame('Test', 'normal', 7);
    while (s.day < 6) nextDay(s);
    s.upgrades.expand_area = 1;
    const tables = s.tables.length;
    const events = nextDay(s);
    expect(s.upgrades.expand_area).toBe(1);
    expect(s.tables.length).toBe(tables);
    expect(events.some((e) => e.type === 'notify' && e.text === 'Quán mở rộng!')).toBe(false);
  });

  it('a game without a week never expands for free', () => {
    const s = createNewGame('Test', 'normal', 7);
    delete s.week;
    while (s.day < 7) nextDay(s);
    expect(s.upgrades.expand_area ?? 0).toBe(0);
  });
});
