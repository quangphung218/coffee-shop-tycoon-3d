import { describe, expect, it } from 'vitest';
import { FULL_UNLOCK_LEVEL, MAX_SHOP_LEVEL } from '../../src/sim/data/levels';
import { getMenuItem } from '../../src/sim/data/menu';
import { UPGRADES } from '../../src/sim/data/upgrades';
import { dispatch, isUnlocked } from '../../src/sim/index';
import { validateLayout } from '../../src/sim/nav';
import { MACHINE_SIZE, backCounterSpan } from '../../src/sim/nav/footprints';
import { ensureRetention } from '../../src/sim/retention';
import { createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState, MenuItemId } from '../../src/sim/types';
import { MENU_REQUIRES, buyUpgrade, getShopLayout, maxUpgradeLevel, menuBlockedReason, upgradeBlockedReason, upgradeLevel } from '../../src/sim/upgrades';

/** A Normal game at `shopLevel` with money and tickets to spare. */
function rich(shopLevel = MAX_SHOP_LEVEL): GameState {
  const s = createNewGame('Quán P31', 'normal', 31);
  s.shopLevel = shopLevel;
  s.money = 1e15;
  ensureRetention(s).tickets = 1000;
  return s;
}

const enabled = (s: GameState, id: MenuItemId): boolean => s.menu.find((m) => m.id === id)!.enabled;
const notes = (s: GameState): Extract<GameEvent, { type: 'notify' }>[] =>
  s.events.filter((e): e is Extract<GameEvent, { type: 'notify' }> => e.type === 'notify');

describe('P31 tools and items by shop level', () => {
  it('open the cold brew tower and Cold brew at level 7, the oven and the cookie at level 8', () => {
    const at = (level: number) => rich(level);
    for (const [kind, id, level] of [
      ['upgrade', 'cold_brew_tower', 7],
      ['menu', 'cold_brew', 7],
      ['upgrade', 'oven', 8],
      ['menu', 'cookie', 8],
    ] as const) {
      expect(isUnlocked(at(FULL_UNLOCK_LEVEL), kind, id), `${id} at 6`).toBe(false);
      expect(isUnlocked(at(level - 1), kind, id), `${id} at ${level - 1}`).toBe(false);
      expect(isUnlocked(at(level), kind, id), `${id} at ${level}`).toBe(true);
    }
  });

  it('starts every game with both items off the menu', () => {
    const s = createNewGame('Quán P31', 'normal', 31);
    expect(enabled(s, 'cold_brew')).toBe(false);
    expect(enabled(s, 'cookie')).toBe(false);
  });

  it('keep the tools out of reach through dispatch below their level', () => {
    const s = rich(FULL_UNLOCK_LEVEL);
    expect(dispatch(s, { type: 'buy_upgrade', upgradeId: 'cold_brew_tower' })).toBe(false);
    expect(dispatch(s, { type: 'buy_upgrade', upgradeId: 'oven' })).toBe(false);
    expect(upgradeLevel(s, 'cold_brew_tower')).toBe(0);
  });
});

describe('MENU_REQUIRES', () => {
  it('ties Cold brew to the tower and the cookie to the oven', () => {
    expect(MENU_REQUIRES).toEqual({ cold_brew: { id: 'cold_brew_tower', level: 1 }, cookie: { id: 'oven', level: 1 } });
    const s = rich();
    expect(menuBlockedReason(s, 'cold_brew')).toBe('Cần Tháp cold brew');
    expect(menuBlockedReason(s, 'cookie')).toBe('Cần Lò nướng');
    expect(menuBlockedReason(s, 'latte')).toBeNull();
  });

  it('refuses to put Cold brew on the menu before the tower, with an error note', () => {
    const s = rich(7);
    expect(dispatch(s, { type: 'set_menu_item', itemId: 'cold_brew', enabled: true })).toBe(false);
    expect(enabled(s, 'cold_brew')).toBe(false);
    expect(notes(s).at(-1)).toEqual({ type: 'notify', level: 'error', text: 'Cần Tháp cold brew' });
    // Switching it off needs no tool.
    expect(dispatch(s, { type: 'set_menu_item', itemId: 'cold_brew', enabled: false })).toBe(true);
  });

  it('says the item is locked, not the tool, below the shop level', () => {
    const s = rich(FULL_UNLOCK_LEVEL);
    expect(dispatch(s, { type: 'set_menu_item', itemId: 'cookie', enabled: true })).toBe(false);
    expect(notes(s).at(-1)!.text).toBe(`${getMenuItem('cookie').name} chưa mở khóa ở cấp quán này`);
  });

  it('puts Cold brew on the menu with one info note when the tower level 1 is bought', () => {
    const s = rich(7);
    expect(dispatch(s, { type: 'buy_upgrade', upgradeId: 'cold_brew_tower' })).toBe(true);
    expect(enabled(s, 'cold_brew')).toBe(true);
    expect(notes(s)).toEqual([{ type: 'notify', level: 'info', text: 'Món mới: Cold brew đã lên Menu' }]);
    expect(menuBlockedReason(s, 'cold_brew')).toBeNull();
    // Level 2 does not announce it again, nor turn it back on once the player switched it off.
    expect(dispatch(s, { type: 'set_menu_item', itemId: 'cold_brew', enabled: false })).toBe(true);
    expect(dispatch(s, { type: 'buy_upgrade', upgradeId: 'cold_brew_tower' })).toBe(true);
    expect(enabled(s, 'cold_brew')).toBe(false);
    expect(notes(s)).toHaveLength(1);
    expect(dispatch(s, { type: 'set_menu_item', itemId: 'cold_brew', enabled: true })).toBe(true);
  });

  it('puts the cookie on the menu when the oven level 1 is bought', () => {
    const s = rich(8);
    expect(dispatch(s, { type: 'buy_upgrade', upgradeId: 'oven' })).toBe(true);
    expect(enabled(s, 'cookie')).toBe(true);
    expect(notes(s).at(-1)).toEqual({ type: 'notify', level: 'info', text: `Món mới: ${getMenuItem('cookie').name} đã lên Menu` });
  });

  it('leaves a still-locked item off when the tool is bought below its level', () => {
    // buyUpgrade itself skips the shop-level gate, as cheats and tests do.
    const s = rich(1);
    expect(buyUpgrade(s, 'oven').ok).toBe(true);
    expect(enabled(s, 'cookie')).toBe(false);
    expect(notes(s)).toEqual([]);
  });
});

describe('P31 layout at shop level 10', () => {
  /** Every upgrade bought to its cap at shop level 10 (the sofa corner after the side room). */
  function maxedShop(): GameState {
    const s = rich();
    for (const u of [...UPGRADES].sort((a, b) => (a.id === 'sofa_corner' ? 1 : b.id === 'sofa_corner' ? -1 : 0))) {
      if (upgradeBlockedReason(s, u.id)) continue;
      while (upgradeLevel(s, u.id) < maxUpgradeLevel(s, u.id)) expect(buyUpgrade(s, u.id).ok, u.id).toBe(true);
    }
    return s;
  }

  it('puts every machine on the back counter without two of them overlapping', () => {
    const layout = getShopLayout(maxedShop());
    const kinds = layout.machines.map((m) => m.kind);
    expect(kinds).toContain('cold_brew_tower');
    expect(kinds).toContain('oven');
    const boxes = layout.machines.map((m) => {
      const size = MACHINE_SIZE[m.kind];
      return { kind: m.kind, minX: m.pos.x - size.width / 2, maxX: m.pos.x + size.width / 2 };
    });
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const A = boxes[a]!;
        const B = boxes[b]!;
        expect(A.minX < B.maxX && B.minX < A.maxX, `${A.kind} and ${B.kind}`).toBe(false);
      }
    }
    // Every machine stands on the back counter, which stays inside the room.
    const span = backCounterSpan(layout)!;
    for (const b of boxes) {
      expect(b.minX, b.kind).toBeGreaterThan(span.minX);
      expect(b.maxX, b.kind).toBeLessThan(span.maxX);
    }
    expect(span.minX).toBeGreaterThan(layout.indoor.minX);
    expect(span.maxX).toBeLessThan(layout.indoor.maxX);
    expect(validateLayout(layout)).toEqual([]);
  });

  it('keeps the back counter of the older machines where it was', () => {
    const s = rich();
    for (const id of ['grinder', 'pastry_case', 'dishwasher'] as const) expect(buyUpgrade(s, id).ok).toBe(true);
    const before = backCounterSpan(getShopLayout(s));
    for (const id of ['cold_brew_tower', 'oven'] as const) expect(buyUpgrade(s, id).ok).toBe(true);
    expect(backCounterSpan(getShopLayout(s))).toEqual(before);
  });
});
