import { describe, expect, it } from 'vitest';
import { getMenuItem } from '../../src/sim/data/menu';
import { WEEK_LENGTH } from '../../src/sim/data/week';
import { dispatch } from '../../src/sim/index';
import { autoRestockSuggestion, stockOf } from '../../src/sim/inventory';
import { isUnlocked } from '../../src/sim/progression';
import { createNewGame } from '../../src/sim/state';
import type { Difficulty, MenuItemId } from '../../src/sim/types';
import { playDay } from './helpers';

/**
 * P24 restock over two weeks: every morning switch on each unlocked item,
 * apply the restock suggestion and open. Items unlocked mid-week (cam, bột
 * bánh…) must be stocked from the day they go on the menu, and no item may
 * lose a fifth of its servings to an empty shop.
 */

const SEEDS = [1, 42, 777];
const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];
const DAYS = 2 * WEEK_LENGTH;
/** Most of an item's servings that may be lost to empty stock. */
const MAX_OUT_SHARE = 0.2;

interface ItemDay {
  day: number;
  id: MenuItemId;
  sold: number;
  outOfStock: number;
  /** The money covered the whole suggestion this morning. */
  funded: boolean;
  /** Ingredients the item needs that were at zero when the doors opened. */
  emptyAtOpen: string[];
}

function playTwoWeeks(difficulty: Difficulty, seed: number): ItemDay[] {
  const state = createNewGame('Quán P24', difficulty, seed);
  const rows: ItemDay[] = [];
  for (let day = 1; day <= DAYS; day++) {
    if (day > 1) expect(dispatch(state, { type: 'next_day' })).toBe(true);
    state.events = [];
    for (const m of state.menu) {
      if (!m.enabled && isUnlocked(state, 'menu', m.id)) {
        expect(dispatch(state, { type: 'set_menu_item', itemId: m.id, enabled: true })).toBe(true);
      }
    }
    const funded = state.money >= autoRestockSuggestion(state).totalCost;
    dispatch(state, { type: 'apply_restock' });
    const enabled = state.menu.filter((m) => m.enabled).map((m) => m.id);
    const empty = new Map(enabled.map((id) => [id, getMenuItem(id).ingredients.filter((n) => stockOf(state, n.id) <= 0).map((n) => n.id)]));
    playDay(state);
    for (const id of enabled) {
      rows.push({
        day,
        id,
        sold: state.today.sold[id] ?? 0,
        outOfStock: state.today.outOfStock[id] ?? 0,
        funded,
        emptyAtOpen: empty.get(id)!,
      });
    }
  }
  return rows;
}

/** Items first on the menu after day 1: unlocked during the run. */
function lateItems(rows: readonly ItemDay[]): Set<MenuItemId> {
  const dayOne = new Set(rows.filter((r) => r.day === 1).map((r) => r.id));
  return new Set(rows.filter((r) => !dayOne.has(r.id)).map((r) => r.id));
}

describe('P24 restock over 2 weeks × 3 difficulties × 3 seeds', { timeout: 600_000 }, () => {
  const runs = new Map<string, ItemDay[]>();
  for (const d of DIFFICULTIES) for (const seed of SEEDS) runs.set(`${d} seed ${seed}`, playTwoWeeks(d, seed));

  it('switches on items unlocked during the run, oranges and cake among them', () => {
    for (const [key, rows] of runs) expect([...lateItems(rows)], key).toEqual(expect.arrayContaining(['orange_juice', 'cake']));
  });

  it('opens every funded day with each enabled item having all its ingredients', () => {
    for (const [key, rows] of runs) {
      const bad = rows.filter((r) => r.funded && r.emptyAtOpen.length > 0).map((r) => `day ${r.day} ${r.id}: ${r.emptyAtOpen.join(', ')}`);
      expect(bad, key).toEqual([]);
    }
  });

  it('stocks a newly unlocked item on the morning it goes on the menu', () => {
    for (const [key, rows] of runs) {
      for (const id of lateItems(rows)) {
        const first = rows.find((r) => r.id === id)!;
        if (!first.funded) continue;
        expect(first.emptyAtOpen, `${key} ${id} on day ${first.day}`).toEqual([]);
      }
    }
  });

  it('loses under a fifth of each item’s servings to empty stock from day 2 on', () => {
    for (const [key, rows] of runs) {
      for (const id of new Set(rows.map((r) => r.id))) {
        // Day 1 plans from the fixed DAY_ONE_SERVINGS guess, not from sales.
        const days = rows.filter((r) => r.id === id && r.day > 1);
        const sold = days.reduce((s, r) => s + r.sold, 0);
        const out = days.reduce((s, r) => s + r.outOfStock, 0);
        if (sold + out === 0) continue;
        expect(out / (sold + out), `${key} ${id}: ${out} out of stock, ${sold} sold`).toBeLessThan(MAX_OUT_SHARE);
      }
    }
  });

  it('gives the same rows when a seed is played again', () => {
    expect(playTwoWeeks('normal', SEEDS[0]!)).toEqual(runs.get(`normal seed ${SEEDS[0]}`));
  });
});
