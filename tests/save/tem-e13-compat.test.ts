import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, loadGame, saveKey } from '../../src/save/save';
import { createMemoryStorage } from '../../src/save/storage';
import { getUpgrade } from '../../src/sim/data/upgrades';
import { createNewGame } from '../../src/sim/state';
import { ensureRetention } from '../../src/sim/retention';
import type { GameState } from '../../src/sim/types';
import { buyUpgrade, nextTicketUpgrade, nextUpgradeCost, nextUpgradeTicketCost, ownedPriceBonus } from '../../src/sim/upgrades';

/**
 * E-13 moves Tem off the espresso machine's level 4 (was 30.000.000đ + 150 Tem)
 * onto plants, paintings and lights. Saves keep their version: levels bought
 * under the old prices stay owned and the Tem balance is kept as it was.
 */

/** A shop at level 4 that bought the old better_machine L4 and plants/paintings/lights without Tem. */
function oldShop(): GameState {
  const state = createNewGame('Quán Tem Cũ', 'normal', 1313);
  state.shopLevel = 4;
  state.money = 20_000_000;
  state.upgrades = { better_machine: 4, plants: 3, paintings: 2, lights: 2 };
  ensureRetention(state).tickets = 47;
  return state;
}

function load(state: GameState): GameState {
  const storage = createMemoryStorage();
  storage.setItem(saveKey('auto'), JSON.stringify({ version: SAVE_VERSION, savedAt: 1_700_000_000_000, state: { ...state, events: [] } }));
  const r = loadGame('auto', storage);
  expect(r.ok).toBe(true);
  return (r as { ok: true; value: GameState }).value;
}

describe('saves from before the E-13 Tem prices', () => {
  it('keep the Tem balance and every level bought, without a new save version', () => {
    expect(SAVE_VERSION).toBe(6);
    const s = load(oldShop());
    expect(s.retention!.tickets).toBe(47);
    expect(s.upgrades).toMatchObject({ better_machine: 4, plants: 3, paintings: 2, lights: 2 });
    // The owned espresso level 4 now adds its E-13 bonus.
    expect(getUpgrade('better_machine').extraLevels![0]!.effect.priceBonus).toBe(0.06);
    expect(ownedPriceBonus(s)).toBeCloseTo(0.06);
  });

  it('price the next levels at the new money and Tem, paid from the kept balance', () => {
    const s = load(oldShop());
    expect(nextUpgradeTicketCost(s, 'paintings')).toBe(12);
    expect(nextUpgradeTicketCost(s, 'plants')).toBe(15);
    expect(nextUpgradeCost(s, 'plants')).toBe(3_000_000);
    expect(buyUpgrade(s, 'paintings').ok).toBe(true);
    expect(s.retention!.tickets).toBe(35);
    expect(buyUpgrade(s, 'plants').ok).toBe(true);
    expect(s.retention!.tickets).toBe(20);
  });
});

describe('Tem helpers for the UI (E-13)', () => {
  it('name the open upgrade whose next level costs the fewest Tem', () => {
    const s = createNewGame('Quán Tem', 'normal', 7);
    s.shopLevel = 4;
    // Lights costs Tem from level 1; plants and paintings from level 2.
    expect(nextTicketUpgrade(s)).toEqual({ id: 'lights', tickets: 10, cost: nextUpgradeCost(s, 'lights') });
    s.upgrades = { lights: 2, plants: 1 };
    expect(nextTicketUpgrade(s)).toEqual({ id: 'plants', tickets: 12, cost: nextUpgradeCost(s, 'plants') });
  });

  it('return null when no open upgrade costs Tem', () => {
    const s = createNewGame('Quán Tem', 'normal', 7);
    s.upgrades = { plants: 5, paintings: 4, lights: 3, record_player: 1, sofa_corner: 1 };
    s.shopLevel = 10;
    expect(nextTicketUpgrade(s)).toBeNull();
  });

  it('sum the sell-price bonus of every owned level', () => {
    const s = createNewGame('Quán Tem', 'normal', 7);
    expect(ownedPriceBonus(s)).toBe(0);
    s.upgrades = { plants: 5, chandelier: 2 };
    expect(ownedPriceBonus(s)).toBeCloseTo(0.02 + 0.045 + 2 * 0.065);
  });
});
