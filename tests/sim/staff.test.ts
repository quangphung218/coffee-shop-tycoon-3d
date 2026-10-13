import { describe, expect, it } from 'vitest';
import { arrivalRate, spawnCustomer } from '../../src/sim/customers';
import { getCampaign } from '../../src/sim/data/marketing';
import { dispatch, step } from '../../src/sim/index';
import { MARKETER_BONUS, customerMultiplier, runCampaign } from '../../src/sim/marketing';
import { isClaimed, updatePlayerTasks } from '../../src/sim/orders';
import { MAX_STAFF, fireStaff, hireStaff, rolePlan, updateStaff } from '../../src/sim/staff';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { DayStats, GameState, Staff, StaffRole } from '../../src/sim/types';

/** Serves alone on whatever the staff have not picked up: delivers first, cleans last. */
function autoPlay(state: GameState): void {
  if (state.playerTasks.length > 0) return;
  const free = (kind: Parameters<typeof isClaimed>[1], id: number) => !isClaimed(state, kind, id, null);
  const ready = state.orders.find((o) => o.status === 'ready' && free('serve', o.id));
  if (ready && dispatch(state, { type: 'deliver', orderId: ready.id })) return;
  const pending = state.orders.find((o) => o.status === 'pending' && free('brew', o.id));
  if (pending && dispatch(state, { type: 'brew', orderId: pending.id })) return;
  const next = state.customers.find((c) => c.state === 'queueing' && free('take_order', c.id));
  if (next && dispatch(state, { type: 'take_order', customerId: next.id })) return;
  const withCash = state.tables.find((t) => t.cash > 0 && free('collect', t.id));
  if (withCash && dispatch(state, { type: 'collect_cash', tableId: withCash.id })) return;
  const dirty = state.tables.find((t) => t.trash > 0 && free('clean', t.id));
  if (dirty) dispatch(state, { type: 'clean_table', tableId: dirty.id });
}

/** Plays the open day to the report, with or without the player working. */
function playDay(state: GameState, play = true): void {
  expect(dispatch(state, { type: 'start_day' })).toBe(true);
  for (let guard = 0; state.phase !== 'report' && guard < 3000; guard++) {
    if (play) autoPlay(state);
    step(state, 1);
    state.events = [];
  }
  expect(state.phase).toBe('report');
}

/** Fully stocked new game in preparation. */
function stockedGame(seed: number): GameState {
  const s = createNewGame('Quán Test', 'normal', seed);
  for (const i of s.inventory) i.qty = 100000;
  return s;
}

function hire(s: GameState, role: StaffRole, speed = 1): Staff {
  const member = hireStaff(s, s.candidates[0]!.id, role)!;
  member.speed = speed;
  return member;
}

/** Runs player work, staff and customers for `minutes` without new arrivals. */
function advance(s: GameState, minutes: number): void {
  for (let i = 0; i < minutes; i++) {
    updatePlayerTasks(s);
    updateStaff(s);
    for (const c of s.customers) if (c.state === 'entering') c.state = 'queueing';
  }
}

function openWithQueue(count: number): GameState {
  const s = stockedGame(5);
  for (const m of s.menu) m.enabled = m.id === 'latte';
  dispatch(s, { type: 'start_day' });
  for (let i = 0; i < count; i++) spawnCustomer(s);
  for (const c of s.customers) c.state = 'queueing';
  return s;
}

function avgWait(stats: DayStats): number {
  return (stats.waitShareSum ?? 0) / Math.max(1, stats.customersServed);
}

describe('hiring', () => {
  it('hires from today\'s candidates and fires', () => {
    const s = createNewGame('A', 'normal', 1);
    const candidate = s.candidates[0]!;
    expect(candidate.name.length).toBeGreaterThan(0);
    expect(candidate.wagePerDay).toBeGreaterThan(0);
    expect(candidate.speed).toBeGreaterThan(0);
    expect(dispatch(s, { type: 'hire_staff', candidateId: candidate.id, role: 'barista' })).toBe(true);
    expect(s.staff).toEqual([expect.objectContaining({ id: candidate.id, role: 'barista', busy: false, task: null })]);
    expect(s.candidates.some((c) => c.id === candidate.id)).toBe(false);
    expect(dispatch(s, { type: 'hire_staff', candidateId: candidate.id, role: 'server' })).toBe(false);

    expect(dispatch(s, { type: 'fire_staff', staffId: candidate.id })).toBe(true);
    expect(s.staff).toEqual([]);
    expect(dispatch(s, { type: 'fire_staff', staffId: candidate.id })).toBe(false);
  });

  it('caps the team size and rolls new candidates each morning', () => {
    const s = createNewGame('A', 'normal', 1);
    for (let i = 0; i < MAX_STAFF; i++) {
      if (s.candidates.length === 0) s.candidates.push({ ...s.staff[0]!, id: s.nextId++, role: 'none' });
      expect(hireStaff(s, s.candidates[0]!.id)).not.toBeNull();
    }
    s.candidates.push({ ...s.staff[0]!, id: s.nextId++, role: 'none' });
    expect(hireStaff(s, s.candidates[0]!.id)).toBeNull();

    const t = createNewGame('A', 'normal', 2);
    const firstIds = t.candidates.map((c) => c.id);
    t.phase = 'report';
    expect(dispatch(t, { type: 'next_day' })).toBe(true);
    expect(t.candidates).toHaveLength(firstIds.length);
    expect(t.candidates.some((c) => firstIds.includes(c.id))).toBe(false);
  });

  it('changes roles by hand only while auto-assign is off', () => {
    const s = createNewGame('A', 'normal', 1);
    const member = hire(s, 'none');
    expect(dispatch(s, { type: 'assign_role', staffId: member.id, role: 'cleaner' })).toBe(true);
    expect(member.role).toBe('cleaner');
    expect(dispatch(s, { type: 'set_auto_assign', enabled: true })).toBe(true);
    expect(member.role).toBe('barista');
    expect(dispatch(s, { type: 'assign_role', staffId: member.id, role: 'cleaner' })).toBe(false);
    expect(member.role).toBe('barista');
  });
});

describe('staff work', () => {
  it('a barista cuts the wait for drinks', () => {
    for (const seed of [11, 22, 33]) {
      const alone = stockedGame(seed);
      playDay(alone);
      const helped = stockedGame(seed);
      hire(helped, 'barista');
      playDay(helped);
      expect(avgWait(helped.today), `seed ${seed}`).toBeLessThan(avgWait(alone.today));
      expect(helped.today.customersServed, `seed ${seed}`).toBeGreaterThanOrEqual(alone.today.customersServed);
    }
  });

  it('a barista takes orders and brews from the shared queue, a server delivers', () => {
    const s = openWithQueue(2);
    const barista = hire(s, 'barista');
    const server = hire(s, 'server');
    advance(s, 1);
    expect(barista.busy).toBe(true);
    expect(barista.task?.kind).toBe('take_order');
    advance(s, 40);
    expect(s.today.customersServed).toBe(2);
    expect(s.customers.every((c) => c.state === 'drinking')).toBe(true);
    expect(s.orders).toEqual([]);
    expect(server.busy).toBe(false);
    expect(s.playerTasks).toEqual([]);
  });

  it('shares one queue with the player without doing a job twice', () => {
    const s = openWithQueue(1);
    const c = s.customers[0]!;
    expect(dispatch(s, { type: 'take_order', customerId: c.id })).toBe(true);
    const barista = hire(s, 'barista');
    advance(s, 1);
    // The player is on it, so the barista leaves this customer alone.
    expect(barista.task).toBeNull();
    expect(s.playerTasks.map((t) => t.kind)).toEqual(['take_order']);
    // Off the bar for a minute so the new order stays pending.
    barista.role = 'cleaner';
    advance(s, 1);
    const order = s.orders[0]!;
    expect(order.status).toBe('pending');

    // The player queues the brew behind other work; the barista gets there first.
    s.tables[0]!.cash = 1000;
    s.playerTasks.push({ kind: 'collect', targetId: s.tables[0]!.id, remaining: 5 });
    expect(dispatch(s, { type: 'brew', orderId: order.id })).toBe(true);
    barista.role = 'barista';
    s.events = [];
    advance(s, 1);
    expect(barista.task).toMatchObject({ kind: 'brew', targetId: order.id });
    expect(order.staffId).toBe(barista.id);
    advance(s, 20);
    expect(order.status).toBe('ready');
    expect(s.playerTasks).toEqual([]);
    expect(s.events.filter((e) => e.type === 'brew')).toEqual([{ type: 'brew', staffId: barista.id, itemId: 'latte' }]);
  });

  it('works at its own speed', () => {
    const slow = openWithQueue(1);
    hire(slow, 'barista', 0.5);
    const fast = openWithQueue(1);
    hire(fast, 'barista', 2);
    advance(slow, 3);
    advance(fast, 3);
    expect(slow.orders).toHaveLength(0);
    expect(fast.orders[0]?.status).toMatch(/brewing|ready/);
  });

  it('a cleaner clears dirty tables and nobody else does', () => {
    const s = openWithQueue(0);
    const cleaner = hire(s, 'cleaner');
    const barista = hire(s, 'barista');
    s.tables[0]!.trash = 2;
    s.tables[2]!.trash = 1;
    advance(s, 1);
    expect(cleaner.task).toMatchObject({ kind: 'clean', targetId: s.tables[0]!.id });
    expect(barista.task).toBeNull();
    advance(s, 4);
    expect(s.tables.every((t) => t.trash === 0)).toBe(true);
    expect(s.events.filter((e) => e.type === 'cleaned')).toHaveLength(2);
    expect(cleaner.busy).toBe(false);
    expect(s.playerTasks).toEqual([]);
  });

  it('puts half-done work back in the pool when fired', () => {
    const s = openWithQueue(1);
    const barista = hire(s, 'barista');
    advance(s, 3);
    const order = s.orders[0]!;
    expect(order.status).toBe('brewing');
    fireStaff(s, barista.id);
    expect(order).toMatchObject({ status: 'pending', staffId: null });
    expect(dispatch(s, { type: 'brew', orderId: order.id })).toBe(true);
    advance(s, order.remaining);
    expect(order.status).toBe('ready');
  });

  it('keeps every customer accounted for over a staffed day', () => {
    const s = stockedGame(8);
    for (const role of ['barista', 'server', 'cleaner'] as const) hire(s, role);
    playDay(s, false);
    const t = s.today;
    expect(t.customersServed).toBeGreaterThan(20);
    expect(t.customersServed + t.customersLost).toBe(t.customersArrived);
    expect(t.revenue).toBeGreaterThan(0);
    expect(s.staff.every((m) => m.task === null && !m.busy)).toBe(true);
  });
});

describe('auto-assign', () => {
  const stats = (patch: Partial<DayStats>): DayStats => ({ ...createDayStats(1, 3), customersArrived: 100, ...patch });

  it('plans roles from the last day\'s bottleneck', () => {
    expect(rolePlan(null, 3)).toEqual(['barista', 'server', 'cleaner']);
    expect(rolePlan(stats({ dirtyTableHits: 8 }), 1)).toEqual(['cleaner']);
    expect(rolePlan(stats({ customersLost: 20 }), 2)).toEqual(['barista', 'server']);
    expect(rolePlan(stats({ customersArrived: 20 }), 1)).toEqual(['marketer']);
    expect(rolePlan(stats({ customersLost: 20, dirtyTableHits: 8 }), 4)).toEqual(['barista', 'server', 'cleaner', 'barista']);
    // Out-of-stock losses are not a staffing problem.
    expect(rolePlan(stats({ customersLost: 20, outOfStock: { latte: 20 } }), 1)).toEqual(['barista']);
    expect(rolePlan(null, 8)).toHaveLength(8);
  });

  it('reassigns every morning, fastest staff to the most needed role', () => {
    const s = createNewGame('A', 'normal', 1);
    const slow = hire(s, 'none', 0.9);
    const fast = hire(s, 'none', 1.2);
    dispatch(s, { type: 'set_auto_assign', enabled: true });
    expect(fast.role).toBe('barista');
    expect(slow.role).toBe('server');

    s.phase = 'report';
    Object.assign(s.today, { customersArrived: 80, customersServed: 75, dirtyTableHits: 9 });
    expect(dispatch(s, { type: 'next_day' })).toBe(true);
    expect(fast.role).toBe('cleaner');
    expect(slow.role).toBe('barista');
  });
});

describe('wages', () => {
  it('are taken from the money at the end of the day', () => {
    const s = stockedGame(4);
    const a = hire(s, 'barista');
    const b = hire(s, 'server');
    const start = s.money;
    playDay(s);
    expect(s.today.wages).toBe(a.wagePerDay + b.wagePerDay);
    expect(s.lastReport?.wages).toBe(s.today.wages);
    expect(s.money).toBe(start + s.today.revenue - s.today.wages);
  });
});

describe('marketing', () => {
  it('runs a campaign in preparation, pays for it and brings more customers', () => {
    const s = createNewGame('A', 'normal', 1);
    s.phase = 'opening';
    const base = arrivalRate(s);
    s.phase = 'preparation';
    const money = s.money;
    expect(dispatch(s, { type: 'start_campaign', campaignId: 'flyers' })).toBe(true);
    expect(s.money).toBe(money - getCampaign('flyers').cost);
    expect(s.today.marketingCost).toBe(getCampaign('flyers').cost);
    expect(dispatch(s, { type: 'start_campaign', campaignId: 'flyers' })).toBe(false);
    s.phase = 'opening';
    expect(arrivalRate(s)).toBeCloseTo(base * getCampaign('flyers').customerMult);
    expect(runCampaign(s, 'happy_hour').ok).toBe(false);
  });

  it('refuses without the money and lasts the campaign\'s days', () => {
    const s = createNewGame('A', 'normal', 1);
    s.money = 1000;
    expect(runCampaign(s, 'influencer')).toMatchObject({ ok: false });
    expect(s.campaigns).toEqual([]);
    expect(s.money).toBe(1000);

    s.money = 10000000;
    expect(runCampaign(s, 'social_media').ok).toBe(true);
    const days = getCampaign('social_media').days;
    for (let d = 1; d <= days; d++) {
      expect(customerMultiplier(s)).toBeGreaterThan(1);
      s.phase = 'report';
      dispatch(s, { type: 'next_day' });
    }
    expect(s.campaigns).toEqual([]);
    expect(customerMultiplier(s)).toBe(1);
  });

  it('a marketer raises today\'s customer multiplier', () => {
    const s = createNewGame('A', 'normal', 1);
    const member = hire(s, 'marketer', 1);
    expect(customerMultiplier(s)).toBeCloseTo(1 + MARKETER_BONUS);
    dispatch(s, { type: 'start_day' });
    advance(s, 1);
    expect(member.task?.kind).toBe('promote');
    dispatch(s, { type: 'assign_role', staffId: member.id, role: 'barista' });
    expect(customerMultiplier(s)).toBe(1);
  });
});
