import { describe, expect, it } from 'vitest';
import { MAX_QUEUE, totalSeats } from '../../src/sim/customers';
import { buildDailyReport, dispatch } from '../../src/sim/index';
import { createNewGame } from '../../src/sim/state';
import type { Customer, GameEvent, GameState } from '../../src/sim/types';
import { playDay } from './helpers';

function isGone(c: Customer): boolean {
  return c.state === 'leaving' || c.state === 'angry_leave';
}

function stock(state: GameState, qty: number): void {
  for (const item of state.inventory) item.qty = qty;
}

describe('edge cases', () => {
  it('customers storm out when the ingredients run out and the report lists the item', () => {
    const state = createNewGame('Quán Hết Hàng', 'normal', 99);
    stock(state, 100000);
    for (const m of state.menu) m.enabled = m.id === 'latte';
    // Cups for five lattes only.
    state.inventory.find((i) => i.id === 'cup')!.qty = 5;

    let sawAngryLeave = false;
    const events: GameEvent[] = playDay(state, {
      onMinute: (s) => {
        sawAngryLeave ||= s.customers.some((c) => c.state === 'angry_leave');
        for (const item of s.inventory) expect(item.qty).toBeGreaterThanOrEqual(0);
      },
    });

    const t = state.today;
    expect(t.sold.latte).toBe(5);
    expect(t.customersServed).toBe(5);
    expect(t.outOfStock.latte ?? 0).toBeGreaterThan(0);
    expect(sawAngryLeave).toBe(true);
    expect(events.some((e) => e.type === 'angry')).toBe(true);
    expect(state.inventory.find((i) => i.id === 'cup')!.qty).toBe(0);
    expect(t.customersLost).toBeGreaterThanOrEqual(t.outOfStock.latte ?? 0);

    const report = state.lastReport!;
    expect(report.outOfStock).toContain('latte');
    expect(report.customersLost).toBe(t.customersLost);
    expect(report.suggestions.some((s) => s.kind === 'restock')).toBe(true);
  });

  it('never seats or admits more people than the shop holds', () => {
    for (const play of [false, true]) {
      // Many arrivals, nobody served when play is false, so the shop fills up.
      const state = createNewGame('Quán Đông', 'easy', 5);
      stock(state, 100000);
      state.rating = 5;
      let peakPresent = 0;
      playDay(state, {
        play,
        onMinute: (s) => {
          const present = s.customers.filter((c) => !isGone(c));
          const inLine = present.filter((c) => c.state === 'entering' || c.state === 'queueing' || c.state === 'ordering');
          peakPresent = Math.max(peakPresent, present.length);
          expect(inLine.length).toBeLessThanOrEqual(MAX_QUEUE);
          expect(present.length).toBeLessThanOrEqual(totalSeats(s) + MAX_QUEUE);
          for (const table of s.tables) {
            expect(table.occupants.length).toBeLessThanOrEqual(table.seats);
            expect(new Set(table.occupants).size).toBe(table.occupants.length);
          }
          const seated = s.customers.filter((c) => c.tableId !== null).length;
          expect(seated).toBeLessThanOrEqual(totalSeats(s));
        },
      });
      expect(peakPresent, `play=${play}`).toBeGreaterThanOrEqual(MAX_QUEUE);
      if (!play) expect(state.today.customersServed).toBe(0);
    }
  });

  it('a day with nothing on the menu still ends with a valid report', () => {
    const state = createNewGame('Quán Trống', 'normal', 12);
    for (const m of state.menu) {
      if (m.enabled) expect(dispatch(state, { type: 'set_menu_item', itemId: m.id, enabled: false })).toBe(true);
    }
    const moneyBefore = state.money;
    const ratingBefore = state.rating;
    const events = playDay(state);

    const report = state.lastReport!;
    expect(report).toEqual(buildDailyReport(state));
    expect(report.day).toBe(1);
    expect(report.customersServed).toBe(0);
    expect(report.customersArrived).toBe(0);
    expect(report.customersLost).toBe(0);
    expect(report.revenue).toBe(0);
    expect(report.profit).toBe(0);
    expect(report.topSellers).toEqual([]);
    expect(report.outOfStock).toEqual([]);
    expect(report.ratingEnd).toBe(ratingBefore);
    expect(report.money).toBe(moneyBefore);
    for (const n of [report.revenue, report.ingredientCost, report.wages, report.marketingCost, report.profit, report.money]) {
      expect(Number.isFinite(n)).toBe(true);
    }
    expect(events.some((e) => e.type === 'doorbell')).toBe(false);
    expect(events.filter((e) => e.type === 'dayEnded')).toEqual([{ type: 'dayEnded', day: 1 }]);
    expect(dispatch(state, { type: 'next_day' })).toBe(true);
    expect(state.phase).toBe('preparation');
  });
});
