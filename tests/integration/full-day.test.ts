import { describe, expect, it } from 'vitest';
import { autoRestockSuggestion, buyIngredient, dispatch } from '../../src/sim/index';
import { buildNavGrid, isWalkable } from '../../src/sim/nav';
import { hireStaff } from '../../src/sim/staff';
import { DAY_START_MINUTE, createNewGame } from '../../src/sim/state';
import type { DailyReport, GameState } from '../../src/sim/types';
import { buyUpgrade, getShopLayout } from '../../src/sim/upgrades';
import { playDay } from './helpers';

const SEED = 20261014;

const REPORT_FIELDS: readonly (keyof DailyReport)[] = [
  'day',
  'revenue',
  'ingredientCost',
  'wages',
  'marketingCost',
  'profit',
  'money',
  'customersArrived',
  'customersServed',
  'customersLost',
  'topSellers',
  'outOfStock',
  'ratingStart',
  'ratingEnd',
  'reviews',
  'suggestions',
];

describe('full day, headless', () => {
  it('plays a Normal day from preparation through the report and into day 2', () => {
    const state = createNewGame('Quán Tích Hợp', 'normal', SEED);
    const startMoney = state.money;

    // Menu for today, then stock it the way the restock button would.
    // milk_tea is unlocked at level 1 (cappuccino needs a higher shop level).
    expect(dispatch(state, { type: 'set_menu_item', itemId: 'milk_tea', enabled: true })).toBe(true);
    const suggestion = autoRestockSuggestion(state);
    expect(suggestion.items.length).toBeGreaterThan(0);
    let spent = 0;
    for (const line of suggestion.items) {
      const r = buyIngredient(state, line.id, line.qty);
      expect(r.ok, line.id).toBe(true);
      if (r.ok) spent += r.cost;
    }
    expect(spent).toBe(suggestion.totalCost);
    expect(state.money).toBe(startMoney - spent);
    expect(autoRestockSuggestion(state).items).toEqual([]);
    const enabled = state.menu.filter((m) => m.enabled).map((m) => m.id);
    expect(enabled).toEqual(['espresso', 'americano', 'latte', 'milk_tea', 'lemon_tea']);

    const events = playDay(state);

    const t = state.today;
    expect(t.customersArrived).toBeGreaterThan(0);
    expect(t.customersServed).toBeGreaterThan(0);
    expect(t.customersServed + t.customersLost).toBe(t.customersArrived);
    expect(Object.keys(t.sold).every((id) => enabled.includes(id as (typeof enabled)[number]))).toBe(true);

    const report = state.lastReport;
    expect(report).toBeTruthy();
    if (!report) return;
    for (const field of REPORT_FIELDS) expect(report, field).toHaveProperty(field);
    expect(report.day).toBe(1);
    expect(report.customersArrived).toBe(t.customersArrived);
    expect(report.customersServed).toBe(t.customersServed);
    expect(report.revenue).toBe(t.revenue);
    expect(report.revenue).toBeGreaterThan(0);
    expect(report.profit).toBe(report.revenue - report.ingredientCost - report.wages - report.marketingCost - report.rent!);
    expect(report.money).toBe(state.money);
    expect(report.ratingEnd).toBe(state.rating);
    expect(report.topSellers.length).toBeGreaterThan(0);

    // Ingredients are paid when bought; wages, rent and marketing at the end of the day;
    // completed daily missions add a small cash reward.
    const missionReward = (report.missions ?? [])
      .filter((m) => m.status === 'completed')
      .reduce((s, m) => s + m.rewardMoney, 0);
    expect(state.money).toBe(startMoney - spent + report.revenue - report.wages - report.rent! - report.marketingCost - t.upgradeCost + missionReward);

    const ended = events.filter((e) => e.type === 'dayEnded');
    expect(ended).toEqual([{ type: 'dayEnded', day: 1 }]);
    expect(events[events.length - 1]).toEqual({ type: 'dayEnded', day: 1 });

    expect(dispatch(state, { type: 'next_day' })).toBe(true);
    expect(state.day).toBe(2);
    expect(state.phase).toBe('preparation');
    expect(state.minute).toBe(DAY_START_MINUTE);
    expect(state.history).toHaveLength(1);
    expect(state.today.day).toBe(2);
    expect(state.today.customersArrived).toBe(0);
    expect(state.lastReport?.day).toBe(1);
  });

  it('never leaves a customer or staff member inside furniture or walls over several days', () => {
    const state = createNewGame('Quán Va Chạm', 'normal', SEED);
    state.money = 1e12;
    for (const i of state.inventory) i.qty = 100000;
    for (const id of ['tables', 'tables', 'outdoor_seating', 'expand_area', 'plants', 'plants', 'big_counter'] as const) {
      expect(buyUpgrade(state, id).ok, id).toBe(true);
    }
    for (const role of ['barista', 'barista', 'server', 'cleaner'] as const) {
      if (state.candidates.length === 0) state.candidates.push({ ...state.staff[0]!, id: state.nextId++, role: 'none' });
      expect(hireStaff(state, state.candidates[0]!.id, role), role).not.toBeNull();
    }
    const grid = buildNavGrid(getShopLayout(state));
    let checks = 0;
    const onMinute = (s: GameState) => {
      for (const a of [...s.customers, ...s.staff]) {
        expect(isWalkable(grid, a.pos), `day ${s.day} minute ${s.minute}: ${a.id} at ${a.pos.x},${a.pos.z}`).toBe(true);
        checks++;
      }
    };
    for (let day = 0; day < 3; day++) {
      playDay(state, { onMinute });
      expect(dispatch(state, { type: 'next_day' })).toBe(true);
      for (const i of state.inventory) i.qty = 100000;
    }
    expect(checks).toBeGreaterThan(1000);
  });
});
