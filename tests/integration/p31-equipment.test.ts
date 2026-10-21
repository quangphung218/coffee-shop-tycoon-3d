import { describe, expect, it } from 'vitest';
import { FULL_UNLOCK_LEVEL } from '../../src/sim/data/levels';
import { getMenuItem } from '../../src/sim/data/menu';
import { dispatch } from '../../src/sim/index';
import { ensureRetention } from '../../src/sim/retention';
import { createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState, MenuItemId } from '../../src/sim/types';
import { upgradeLevel } from '../../src/sim/upgrades';
import { playDay } from './helpers';

/** A Normal game at `shopLevel` with money and tickets to spare. */
function rich(shopLevel: number): GameState {
  const s = createNewGame('Quán P31', 'normal', 831);
  s.shopLevel = shopLevel;
  s.money = 1e12;
  ensureRetention(s).tickets = 1000;
  return s;
}

const enabled = (s: GameState, id: MenuItemId): boolean => s.menu.find((m) => m.id === id)!.enabled;
const notes = (events: readonly GameEvent[]): Extract<GameEvent, { type: 'notify' }>[] =>
  events.filter((e): e is Extract<GameEvent, { type: 'notify' }> => e.type === 'notify');

describe('P31 equipment in a played day', { timeout: 120_000 }, () => {
  it('at level 8 buying the tower and the oven puts both items on the menu, and customers buy them', () => {
    const s = rich(8);
    expect(enabled(s, 'cold_brew')).toBe(false);
    expect(enabled(s, 'cookie')).toBe(false);
    s.events = [];
    expect(dispatch(s, { type: 'buy_upgrade', upgradeId: 'cold_brew_tower' })).toBe(true);
    expect(dispatch(s, { type: 'buy_upgrade', upgradeId: 'oven' })).toBe(true);
    expect(enabled(s, 'cold_brew')).toBe(true);
    expect(enabled(s, 'cookie')).toBe(true);
    const info = notes(s.events);
    for (const id of ['cold_brew', 'cookie'] as const) {
      expect(info.filter((n) => n.text === `Món mới: ${getMenuItem(id).name} đã lên Menu`), id).toHaveLength(1);
    }

    // Stock up so the day measures demand, not the starter stock.
    for (const item of s.inventory) item.qty = Math.max(item.qty, 50_000);
    s.events = [];
    playDay(s);
    expect(s.today.sold.cold_brew ?? 0).toBeGreaterThan(0);
    expect(s.today.sold.cookie ?? 0).toBeGreaterThan(0);
  });

  it(`at level ${FULL_UNLOCK_LEVEL} neither tool can be bought`, () => {
    const s = rich(FULL_UNLOCK_LEVEL);
    const money = s.money;
    expect(dispatch(s, { type: 'buy_upgrade', upgradeId: 'cold_brew_tower' })).toBe(false);
    expect(dispatch(s, { type: 'buy_upgrade', upgradeId: 'oven' })).toBe(false);
    expect(upgradeLevel(s, 'cold_brew_tower')).toBe(0);
    expect(upgradeLevel(s, 'oven')).toBe(0);
    expect(s.money).toBe(money);
    expect(enabled(s, 'cold_brew')).toBe(false);
    expect(enabled(s, 'cookie')).toBe(false);
  });
});
