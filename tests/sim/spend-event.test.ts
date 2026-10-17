import { describe, expect, it } from 'vitest';
import { getIngredient } from '../../src/sim/data/ingredients';
import { getCampaign } from '../../src/sim/data/marketing';
import { getUpgrade } from '../../src/sim/data/upgrades';
import { dispatch } from '../../src/sim/index';
import { applyRestockSuggestion, autoRestockSuggestion, buyIngredient, ingredientPrice } from '../../src/sim/inventory';
import { runCampaign } from '../../src/sim/marketing';
import { hireStaff } from '../../src/sim/staff';
import { createDayStats, createNewGame } from '../../src/sim/state';
import { buyUpgrade, nextUpgradeCost } from '../../src/sim/upgrades';
import type { GameEvent, GameState } from '../../src/sim/types';

type SpendEvent = Extract<GameEvent, { type: 'spend' }>;

const spends = (s: GameState): SpendEvent[] => s.events.filter((e): e is SpendEvent => e.type === 'spend');
const successNotices = (s: GameState): GameEvent[] => s.events.filter((e) => e.type === 'notify' && e.level === 'success');

function game(): GameState {
  const s = createNewGame('A', 'normal', 1);
  s.events = [];
  return s;
}

describe('spend event', () => {
  it('buying an ingredient emits one restock spend with the price and the money left', () => {
    const s = game();
    const money = s.money;
    const cost = ingredientPrice(s, 'milk', 10);
    expect(buyIngredient(s, 'milk', 10)).toEqual({ ok: true, cost });
    expect(spends(s)).toEqual([
      { type: 'spend', kind: 'restock', label: getIngredient('milk').name, amount: cost, moneyLeft: money - cost },
    ]);
    expect(s.money).toBe(money - cost);
  });

  it('buy_ingredient through dispatch emits the same event', () => {
    const s = game();
    expect(dispatch(s, { type: 'buy_ingredient', ingredientId: 'milk', packs: 1 })).toBe(true);
    expect(spends(s)).toHaveLength(1);
    expect(spends(s)[0]).toMatchObject({ kind: 'restock', moneyLeft: s.money });
  });

  it('a refused ingredient purchase emits no spend', () => {
    const s = game();
    s.money = ingredientPrice(s, 'milk', 10) - 1;
    expect(buyIngredient(s, 'milk', 10).ok).toBe(false);
    expect(buyIngredient(s, 'milk', 0).ok).toBe(false);
    expect(spends(s)).toEqual([]);
  });

  it('applying the restock suggestion emits one spend per bought line and no success notice', () => {
    const s = game();
    s.history.push({ ...createDayStats(1, 3), sold: { espresso: 15, americano: 15, latte: 20, lemon_tea: 10 } });
    s.day = 2;
    for (const i of s.inventory) i.qty = 0;
    s.money = 100_000_000;
    const lines = autoRestockSuggestion(s).items;
    expect(lines.length).toBeGreaterThan(0);
    const r = applyRestockSuggestion(s);
    expect(r.bought).toHaveLength(lines.length);
    const events = spends(s);
    expect(events.map((e) => e.label)).toEqual(lines.map((l) => getIngredient(l.id).name));
    expect(events.map((e) => e.amount)).toEqual(lines.map((l) => l.cost));
    expect(events.at(-1)!.moneyLeft).toBe(s.money);
    expect(s.events.some((e) => e.type === 'notify')).toBe(false);
  });

  it('buying an upgrade emits one upgrade spend naming the new level and no success notice', () => {
    const s = game();
    const money = s.money;
    const cost = nextUpgradeCost(s, 'tables')!;
    const r = buyUpgrade(s, 'tables');
    expect(r.ok).toBe(true);
    const level = r.ok ? r.level : 0;
    expect(spends(s)).toEqual([
      { type: 'spend', kind: 'upgrade', label: `${getUpgrade('tables').name} lên cấp ${level}`, amount: cost, moneyLeft: money - cost },
    ]);
    expect(successNotices(s)).toEqual([]);
  });

  it('a refused upgrade emits no spend', () => {
    const s = game();
    s.money = nextUpgradeCost(s, 'tables')! - 1;
    expect(buyUpgrade(s, 'tables').ok).toBe(false);
    expect(spends(s)).toEqual([]);
  });

  it('running a campaign emits one campaign spend and no success notice', () => {
    const s = game();
    s.phase = 'preparation';
    const money = s.money;
    const def = getCampaign('flyers');
    expect(runCampaign(s, 'flyers').ok).toBe(true);
    expect(spends(s)).toEqual([
      { type: 'spend', kind: 'campaign', label: def.name, amount: def.cost, moneyLeft: money - def.cost },
    ]);
    expect(successNotices(s)).toEqual([]);
  });

  it('a refused campaign emits no spend', () => {
    const s = game();
    s.phase = 'preparation';
    s.money = getCampaign('flyers').cost - 1;
    expect(runCampaign(s, 'flyers').ok).toBe(false);
    s.money = 100_000_000;
    s.phase = 'opening';
    expect(runCampaign(s, 'flyers').ok).toBe(false);
    expect(spends(s)).toEqual([]);
  });

  it('hiring has no fee and emits no spend', () => {
    const s = game();
    const money = s.money;
    const candidate = s.candidates[0]!;
    expect(hireStaff(s, candidate.id)).not.toBeNull();
    expect(s.money).toBe(money);
    expect(spends(s)).toEqual([]);
  });
});
