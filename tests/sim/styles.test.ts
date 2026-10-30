import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, loadGame, saveGame, saveKey } from '../../src/save/save';
import { createMemoryStorage } from '../../src/save/storage';
import { endOfDayChallenge } from '../../src/sim/challenges';
import { WEEK_CHALLENGES, WEEK_CHALLENGE_IDS } from '../../src/sim/data/challenges';
import { STYLES, STYLE_SLOTS, defaultStyle, styleById, stylesOf } from '../../src/sim/data/styles';
import { WEEK_LENGTH, weekGoal } from '../../src/sim/data/week';
import { buyStyle, canAffordStyle, chosenStyles, dispatch, isStyleUnlocked, ownsStyle, styleOf } from '../../src/sim/index';
import { createDayStats, createNewGame } from '../../src/sim/state';
import { ensureRetention } from '../../src/sim/retention';
import type { DailyReport, GameState, WeekChallenge } from '../../src/sim/types';
import { rollWeekPlan } from '../../src/sim/week';

function rich(): GameState {
  const state = createNewGame('Quán Kiểu', 'normal', 1717);
  state.money = 2_000_000_000;
  ensureRetention(state).tickets = 1000;
  return state;
}

describe('style catalog (E-17)', () => {
  it('has 4–6 styles per slot, a free default first, money and Tem rising, the last in the hundreds of millions and 50–100 Tem', () => {
    for (const slot of STYLE_SLOTS) {
      const list = stylesOf(slot);
      expect(list.length).toBeGreaterThanOrEqual(4);
      expect(list.length).toBeLessThanOrEqual(6);
      expect(list[0]).toBe(defaultStyle(slot));
      expect(list[0]!.price).toBe(0);
      expect(list[0]!.tickets).toBe(0);
      expect(list[0]!.challenge).toBeUndefined();
      for (let i = 1; i < list.length; i++) {
        expect(list[i]!.price).toBeGreaterThan(list[i - 1]!.price);
        expect(list[i]!.tickets).toBeGreaterThan(list[i - 1]!.tickets);
      }
      expect(list[1]!.price).toBeLessThan(10_000_000);
      const last = list[list.length - 1]!;
      expect(last.price).toBeGreaterThanOrEqual(100_000_000);
      expect(last.price).toBeLessThan(1_000_000_000);
      expect(last.tickets).toBeGreaterThanOrEqual(50);
      expect(last.tickets).toBeLessThanOrEqual(100);
    }
    expect(new Set(STYLES.map((s) => s.id)).size).toBe(STYLES.length);
  });

  it('gates styles by weekly challenge rewards, each gated style reachable from exactly one challenge', () => {
    const unlocks = WEEK_CHALLENGE_IDS.flatMap((id) => (WEEK_CHALLENGES[id].reward.unlock ? [WEEK_CHALLENGES[id].reward.unlock!] : []));
    expect(unlocks.length).toBeGreaterThan(0);
    for (const u of unlocks) {
      expect(u.kind).toBe('decor');
      expect(styleById(u.id)?.challenge).toBe(true);
    }
    const gated = STYLES.filter((s) => s.challenge).map((s) => s.id);
    expect(unlocks.map((u) => u.id).sort()).toEqual(gated.sort());
  });
});

describe('style state and actions', () => {
  it('starts every slot on its default, owned', () => {
    const state = createNewGame('Quán Kiểu', 'normal', 1);
    expect(state.styles).toBeUndefined();
    for (const slot of STYLE_SLOTS) {
      expect(styleOf(state, slot)).toBe(defaultStyle(slot));
      expect(ownsStyle(state, defaultStyle(slot).id)).toBe(true);
    }
    expect(chosenStyles(state).wall.id).toBe('wall_cream');
  });

  it('buy takes money and Tem once, owns and wears the style, and touches nothing else', () => {
    const state = rich();
    const before = structuredClone({ ...state, events: [] });
    expect(canAffordStyle(state, 'wall_brick')).toBe(true);
    expect(dispatch(state, { type: 'buy_style', styleId: 'wall_brick' })).toBe(true);
    const def = styleById('wall_brick')!;
    expect(state.money).toBe(before.money - def.price);
    expect(state.retention!.tickets).toBe(1000 - def.tickets);
    expect(styleOf(state, 'wall').id).toBe('wall_brick');
    expect(state.events.map((e) => e.type)).toEqual(['style_bought', 'style_changed']);
    // No star, customer, day-stat or economy effect beyond the price.
    expect(state.rating).toBe(before.rating);
    expect(state.today).toEqual(before.today);
    expect(state.upgrades).toEqual(before.upgrades);
    expect(state.rngState).toBe(before.rngState);
    expect(state.customers).toEqual(before.customers);
    // Owned: a second buy is refused, switching back and forth is free.
    expect(dispatch(state, { type: 'buy_style', styleId: 'wall_brick' })).toBe(false);
    const money = state.money;
    expect(dispatch(state, { type: 'select_style', styleId: 'wall_cream' })).toBe(true);
    expect(dispatch(state, { type: 'select_style', styleId: 'wall_brick' })).toBe(true);
    expect(state.money).toBe(money);
    expect(styleOf(state, 'wall').id).toBe('wall_brick');
  });

  it('refuses unaffordable, unowned, unknown and locked styles without changing money or Tem', () => {
    const state = createNewGame('Quán Kiểu', 'normal', 2);
    const money = state.money;
    expect(canAffordStyle(state, 'floor_marble')).toBe(false);
    expect(buyStyle(state, 'floor_marble')).toBe(false);
    expect(dispatch(state, { type: 'select_style', styleId: 'floor_tile' })).toBe(false);
    expect(dispatch(state, { type: 'buy_style', styleId: 'nope' })).toBe(false);
    state.money = 2_000_000_000;
    ensureRetention(state).tickets = 1000;
    expect(isStyleUnlocked(state, 'sign_neon')).toBe(false);
    expect(dispatch(state, { type: 'buy_style', styleId: 'sign_neon' })).toBe(false);
    state.money = 3_000_000;
    ensureRetention(state).tickets = 4;
    expect(dispatch(state, { type: 'buy_style', styleId: 'wall_mint' })).toBe(false);
    expect(state.money).toBe(3_000_000);
    expect(state.retention!.tickets).toBe(4);
    expect(styleOf(state, 'wall').id).toBe('wall_cream');
    expect(money).toBeGreaterThan(0);
  });

  it('a completed challenge unlocks its style, which can then be bought', () => {
    const state = rich();
    state.day = 4 * WEEK_LENGTH + 1;
    state.today = createDayStats(state.day, state.rating);
    state.week = { length: WEEK_LENGTH, index: 5, startedDay: state.day, plan: rollWeekPlan(state.seed, 5), goal: weekGoal('normal', 5) };
    const def = WEEK_CHALLENGES.regular_visits;
    const c: WeekChallenge = { id: def.id, target: 1, reward: { ...def.reward }, progress: 0, settledDay: 0, status: 'active' };
    state.week.challenge = c;
    state.today.regularsServed = 1;
    const id = def.reward.unlock!.id;
    expect(isStyleUnlocked(state, id)).toBe(false);
    endOfDayChallenge(state, { missions: [] } as unknown as DailyReport);
    expect(c.status).toBe('completed');
    expect(isStyleUnlocked(state, id)).toBe(true);
    expect(state.events.some((e) => e.type === 'style_unlocked' && e.styleId === id)).toBe(true);
    expect(dispatch(state, { type: 'buy_style', styleId: id })).toBe(true);
    expect(styleOf(state, styleById(id)!.slot).id).toBe(id);
  });
});

describe('save compat (E-17 styles)', () => {
  function roundTrip(file: unknown): GameState {
    const storage = createMemoryStorage();
    storage.setItem(saveKey('auto'), JSON.stringify(file));
    const r = loadGame('auto', storage);
    expect(r.ok).toBe(true);
    return (r as { ok: true; value: GameState }).value;
  }

  it('keeps the save version', () => {
    expect(SAVE_VERSION).toBe(6);
  });

  it('loads a save from before E-17 with every slot on its default, and styles can be bought after', () => {
    const old = createNewGame('Quán Cũ', 'normal', 99) as GameState & Record<string, unknown>;
    delete old.styles;
    const s = roundTrip({ version: SAVE_VERSION, savedAt: 1, state: { ...old, events: [] } });
    expect(s.styles).toBeUndefined();
    for (const slot of STYLE_SLOTS) expect(styleOf(s, slot)).toBe(defaultStyle(slot));
    s.money = 10_000_000;
    ensureRetention(s).tickets = 10;
    expect(dispatch(s, { type: 'buy_style', styleId: 'awning_mint' })).toBe(true);
    expect(styleOf(s, 'awning').id).toBe('awning_mint');
  });

  it('round-trips chosen, owned and unlocked styles', () => {
    const state = rich();
    buyStyle(state, 'floor_tile');
    state.styles!.unlocked.push('wall_wood');
    const storage = createMemoryStorage();
    expect(saveGame(state, '1', storage).ok).toBe(true);
    const r = loadGame('1', storage);
    expect(r.ok && r.value.styles).toEqual({ chosen: { floor: 'floor_tile' }, owned: ['floor_tile'], unlocked: ['wall_wood'] });
  });

  it('drops unknown ids and resets a malformed style block', () => {
    const state = createNewGame('Quán Lạ', 'normal', 5) as unknown as Record<string, unknown>;
    state.styles = { chosen: { wall: 'wall_gone', floor: 'wall_brick', sign: 'sign_chalk' }, owned: ['x', 'sign_chalk'], unlocked: 3 };
    const s = roundTrip({ version: SAVE_VERSION, savedAt: 1, state: { ...state, events: [] } });
    expect(s.styles).toEqual({ chosen: { sign: 'sign_chalk' }, owned: ['sign_chalk'], unlocked: [] });
    const bad = createNewGame('Quán Lạ', 'normal', 5) as unknown as Record<string, unknown>;
    bad.styles = 'oops';
    const t = roundTrip({ version: SAVE_VERSION, savedAt: 1, state: { ...bad, events: [] } });
    expect(t.styles).toBeUndefined();
    expect(styleOf(t, 'wall').id).toBe('wall_cream');
  });
});
