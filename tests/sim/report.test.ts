import { describe, expect, it } from 'vitest';
import { arrivalRate } from '../../src/sim/customers';
import { getMenuItem } from '../../src/sim/data/menu';
import { dailyRent } from '../../src/sim/economy';
import { dispatch, step } from '../../src/sim/index';
import { autoRestockSuggestion } from '../../src/sim/inventory';
import { dayScore, updateRating } from '../../src/sim/rating';
import { buildDailyReport } from '../../src/sim/report';
import { MAX_REVIEWS, writeReview } from '../../src/sim/reviews';
import { createNewGame, generateCandidates } from '../../src/sim/state';
import type { GameEvent, GameState, StaffRole, SuggestionKind } from '../../src/sim/types';

/** Serves alone: one task at a time, delivering first and cleaning last. */
function autoPlay(state: GameState): void {
  if (state.playerTasks.length > 0) return;
  const ready = state.orders.find((o) => o.status === 'ready');
  if (ready && dispatch(state, { type: 'deliver', orderId: ready.id })) return;
  const pending = state.orders.find((o) => o.status === 'pending');
  if (pending && dispatch(state, { type: 'brew', orderId: pending.id })) return;
  const next = state.customers.find((c) => c.state === 'queueing');
  if (next && dispatch(state, { type: 'take_order', customerId: next.id })) return;
  const withCash = state.tables.find((t) => t.cash > 0);
  if (withCash && dispatch(state, { type: 'collect_cash', tableId: withCash.id })) return;
  const dirty = state.tables.find((t) => t.trash > 0);
  if (dirty) dispatch(state, { type: 'clean_table', tableId: dirty.id });
}

function playDay(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  expect(dispatch(state, { type: 'start_day' })).toBe(true);
  for (let guard = 0; state.phase !== 'report' && guard < 2000; guard++) {
    autoPlay(state);
    step(state, 1);
    events.push(...state.events);
    state.events = [];
  }
  return events;
}

function hire(s: GameState, role: StaffRole, wage = 150000): void {
  const [member] = generateCandidates({ rngState: s.nextId }, s.nextId++, 1, 1);
  member!.role = role;
  member!.wagePerDay = wage;
  s.staff.push(member!);
}

function kinds(s: GameState): SuggestionKind[] {
  return buildDailyReport(s).suggestions.map((x) => x.kind);
}

/** A calm, fully stocked day after closing: nothing to suggest unless a test adds it. */
function quietGoodDay(): GameState {
  const s = createNewGame('A', 'normal', 1);
  s.phase = 'report';
  for (const i of s.inventory) i.qty = 100000;
  s.money = 0;
  Object.assign(s.today, { customersArrived: 60, customersServed: 60, customersLost: 0, sold: { latte: 60 } });
  return s;
}

describe('end of day', () => {
  it('stores a report whose numbers add up and then emits dayEnded', () => {
    const s = createNewGame('Quán Test', 'normal', 2024);
    hire(s, 'none', 150000);
    const startMoney = s.money;
    const events = playDay(s);
    const r = s.lastReport!;
    expect(r).toBeTruthy();
    expect(r.day).toBe(1);

    const t = s.today;
    expect(r.revenue).toBe(t.revenue);
    expect(r.revenue).toBeGreaterThan(0);
    const cogs = (Object.entries(t.sold) as [Parameters<typeof getMenuItem>[0], number][]).reduce(
      (sum, [id, qty]) => sum + getMenuItem(id).cost * qty,
      0,
    );
    // Drinks made for customers who left unserved cost ingredients too.
    expect(r.ingredientCost).toBeGreaterThanOrEqual(cogs);
    expect(r.ingredientCost).toBe(t.ingredientsUsed);
    expect(r.wages).toBe(150000);
    expect(r.rent).toBe(dailyRent(s));
    expect(r.profit).toBe(r.revenue - r.ingredientCost - r.wages - r.marketingCost - r.rent!);
    const missionReward = (r.missions ?? []).filter((m) => m.status === 'completed').reduce((sum, m) => sum + m.rewardMoney, 0);
    expect(s.money).toBe(startMoney + r.revenue - r.wages - r.rent! + missionReward);
    expect(r.money).toBe(s.money);
    expect(r.customersServed + r.customersLost).toBe(r.customersArrived);

    const soldTotal = Object.values(t.sold).reduce((a, b) => a + (b ?? 0), 0);
    expect(soldTotal).toBe(r.customersServed);
    expect(r.topSellers.length).toBeGreaterThan(0);
    for (let i = 1; i < r.topSellers.length; i++) expect(r.topSellers[i - 1]!.qty).toBeGreaterThanOrEqual(r.topSellers[i]!.qty);
    expect(r.topSellers[0]!.qty).toBe(Math.max(...Object.values(t.sold).map((v) => v ?? 0)));

    expect(r.ratingStart).toBe(3);
    expect(r.ratingEnd).toBe(s.rating);
    expect(s.rating).toBeGreaterThanOrEqual(1);
    expect(s.rating).toBeLessThanOrEqual(5);
    expect(r.reviews.every((rv) => rv.day === 1)).toBe(true);
    expect(s.reviews.length).toBeGreaterThan(0);

    const reportAt = events.findIndex((e) => e.type === 'phase' && e.phase === 'report');
    const endedAt = events.findIndex((e) => e.type === 'dayEnded');
    expect(endedAt).toBeGreaterThan(reportAt);
    expect(events[endedAt]).toEqual({ type: 'dayEnded', day: 1 });
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it('suggests restocking from the day just played', () => {
    const s = createNewGame('Quán Test', 'normal', 7);
    playDay(s);
    const fromToday = autoRestockSuggestion(s);
    dispatch(s, { type: 'next_day' });
    expect(autoRestockSuggestion(s)).toEqual(fromToday);
  });
});

describe('rating', () => {
  it('rises after a good day and falls after a bad one, within 1..5', () => {
    const good = quietGoodDay();
    good.rating = 3;
    expect(updateRating(good)).toBeGreaterThan(3);

    const bad = createNewGame('A', 'normal', 1);
    Object.assign(bad.today, { customersArrived: 40, customersServed: 10, customersLost: 30, waitShareSum: 9, dirtyTableHits: 8 });
    expect(updateRating(bad)).toBeLessThan(3);
    expect(bad.today.ratingEnd).toBe(bad.rating);

    bad.rating = 1;
    updateRating(bad);
    expect(bad.rating).toBeGreaterThanOrEqual(1);
  });

  it('counts upgrade and decor bonuses', () => {
    const plain = quietGoodDay();
    Object.assign(plain.today, { waitShareSum: 30 });
    const decorated = quietGoodDay();
    Object.assign(decorated.today, { waitShareSum: 30 });
    decorated.upgrades = { better_machine: 2, plants: 1 };
    expect(dayScore(decorated)).toBeCloseTo(dayScore(plain) + 0.45);
  });

  it('brings more customers the next day when it goes up', () => {
    const s = createNewGame('A', 'normal', 1);
    s.phase = 'opening';
    const before = arrivalRate(s);
    s.rating = 4.5;
    expect(arrivalRate(s)).toBeGreaterThan(before);
  });

  it('stays put on a day without customers', () => {
    const s = createNewGame('A', 'normal', 1);
    expect(updateRating(s)).toBe(3);
  });
});

describe('reviews', () => {
  it('gives the reason in stars and Vietnamese text', () => {
    const s = createNewGame('A', 'normal', 1);
    const wait = writeReview(s, { kind: 'angry', reason: 'long_wait' });
    expect(wait).toMatchObject({ stars: 1, reason: 'long_wait', day: 1 });
    expect(wait.text).toMatch(/[Đđ]ợi|[Cc]hờ/);
    expect(writeReview(s, { kind: 'angry', reason: 'out_of_stock' })).toMatchObject({ stars: 2, reason: 'out_of_stock' });
    const dirty = writeReview(s, { kind: 'served', waitShare: 0.1, dirtyTable: true });
    expect(dirty).toMatchObject({ stars: 4, reason: 'dirty_table' });
    const fast = writeReview(s, { kind: 'served', waitShare: 0.1, dirtyTable: false });
    expect(fast.stars).toBe(5);
    expect(['fast_service', 'tasty']).toContain(fast.reason);
    expect(s.events.filter((e) => e.type === 'review')).toHaveLength(4);
  });

  it('praises the decor once the shop is decorated', () => {
    const s = createNewGame('A', 'normal', 3);
    s.upgrades = { paintings: 2 };
    const reasons = new Set(
      Array.from({ length: 30 }, () => writeReview(s, { kind: 'served', waitShare: 0.5, dirtyTable: false }).reason),
    );
    expect(reasons.has('nice_decor')).toBe(true);
  });

  it('keeps only the 30 most recent', () => {
    const s = createNewGame('A', 'normal', 1);
    for (let i = 0; i < 40; i++) {
      s.day = i + 1;
      writeReview(s, { kind: 'angry', reason: 'long_wait' });
    }
    expect(s.reviews).toHaveLength(MAX_REVIEWS);
    expect(s.reviews[0]!.day).toBe(11);
    expect(s.reviews[MAX_REVIEWS - 1]!.day).toBe(40);
  });
});

describe('report suggestions', () => {
  it('suggests nothing on a calm, stocked day without spare money', () => {
    expect(kinds(quietGoodDay())).toEqual([]);
  });

  it('suggests restocking when an item ran out', () => {
    const s = quietGoodDay();
    s.today.outOfStock = { latte: 4 };
    const r = buildDailyReport(s);
    expect(r.outOfStock).toEqual(['latte']);
    expect(r.suggestions.map((x) => x.kind)).toEqual(['restock']);
    expect(r.suggestions[0]!.text).toContain('Latte');
  });

  it('suggests restocking when the stock left cannot cover tomorrow', () => {
    const s = quietGoodDay();
    s.inventory.find((i) => i.id === 'milk')!.qty = 0;
    const r = buildDailyReport(s);
    expect(r.outOfStock).toContain('latte');
    expect(kinds(s)).toContain('restock');
  });

  it('suggests a barista, then a server, when customers leave from waiting', () => {
    const s = quietGoodDay();
    Object.assign(s.today, { customersServed: 50, customersLost: 10, sold: { latte: 50 } });
    expect(kinds(s)).toEqual(['hire_barista']);
    hire(s, 'barista');
    expect(kinds(s)).toEqual(['hire_server']);
  });

  it('does not blame waiting for customers lost to empty stock', () => {
    const s = quietGoodDay();
    Object.assign(s.today, { customersServed: 50, customersLost: 10, sold: { latte: 50 }, outOfStock: { latte: 10 } });
    expect(kinds(s)).toEqual(['restock']);
  });

  it('suggests a cleaner when dirty tables turned customers away', () => {
    const s = quietGoodDay();
    s.today.dirtyTableHits = 3;
    expect(kinds(s)).toEqual(['hire_cleaner']);
    hire(s, 'cleaner');
    expect(kinds(s)).toEqual([]);
  });

  it('suggests marketing on a quiet day unless a campaign is running', () => {
    const s = quietGoodDay();
    Object.assign(s.today, { customersArrived: 12, customersServed: 12, sold: { latte: 12 } });
    expect(kinds(s)).toEqual(['marketing']);
    s.campaigns = [{ id: 'flyers', daysLeft: 1 }];
    expect(kinds(s)).toEqual([]);
  });

  it('suggests an upgrade once the money covers it after tomorrow’s costs', () => {
    const s = quietGoodDay();
    // Tonight's rent is kept in hand too.
    s.money = 299000 + dailyRent(s);
    expect(kinds(s)).toEqual([]);
    s.money = 300000 + dailyRent(s);
    const r = buildDailyReport(s);
    expect(r.suggestions.map((x) => x.kind)).toEqual(['upgrade']);
    expect(r.suggestions[0]!.text).toContain('Cây xanh');
    hire(s, 'barista', 200000);
    expect(kinds(s)).toEqual([]);
  });

  it('only suggests upgrades the shop level has unlocked', () => {
    const s = quietGoodDay();
    // Enough for the ice maker (level 5), not for the plants (level 1).
    s.money = 250000 + dailyRent(s);
    expect(kinds(s)).toEqual([]);
    s.shopLevel = 5;
    s.money = 250000 + dailyRent(s);
    const r = buildDailyReport(s);
    expect(r.suggestions.map((x) => x.kind)).toEqual(['upgrade']);
    expect(r.suggestions[0]!.text).toContain('Máy làm đá');
  });
});
