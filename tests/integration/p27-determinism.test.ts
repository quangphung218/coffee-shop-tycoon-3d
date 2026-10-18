import { describe, expect, it } from 'vitest';
import { dispatch } from '../../src/sim/index';
import { isUnlocked } from '../../src/sim/progression';
import { canTrain } from '../../src/sim/staffGrowth';
import { createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState, SpecialOrder, StaffTraitId } from '../../src/sim/types';
import { playDay } from './helpers';

const SEED = 1427;
const DAYS = 14;

/** Local date key 'YYYY-MM-DD' of game day `day` in October 2026 (day ≤ 31), never the real clock. */
function octoberKey(day: number): string {
  return `2026-10-${String(day).padStart(2, '0')}`;
}

interface Trace {
  state: GameState;
  /** rngState after each day's report. */
  rngByDay: number[];
  /** Trait of every staff member and candidate seen, by id. */
  traits: Record<number, StaffTraitId | undefined>;
  specialOrders: (SpecialOrder | undefined)[];
  vipDays: number[];
  events: GameEvent[];
}

/**
 * A fixed command script over DAYS days using every P27 command: the daily
 * gift (one skipped day to break the streak), hiring, training whenever
 * possible and the ticket-priced furniture once it opens.
 */
function run(seed: number): Trace {
  const state = createNewGame('Quán Tất Định', 'normal', seed);
  const trace: Trace = { state, rngByDay: [], traits: {}, specialOrders: [], vipDays: [], events: [] };
  const seeTraits = () => {
    for (const m of [...state.staff, ...state.candidates]) trace.traits[m.id] = m.trait;
  };
  for (let day = 1; day <= DAYS; day++) {
    seeTraits();
    if (day !== 6) dispatch(state, { type: 'claim_daily_gift', dateKey: octoberKey(day) });
    for (const m of state.menu) {
      if (!m.enabled && isUnlocked(state, 'menu', m.id)) dispatch(state, { type: 'set_menu_item', itemId: m.id, enabled: true });
    }
    dispatch(state, { type: 'apply_restock' });
    if (state.staff.length < 2 && state.candidates[0] && state.money > 1_500_000) {
      dispatch(state, { type: 'hire_staff', candidateId: state.candidates[0].id, role: state.staff.length === 0 ? 'barista' : 'server' });
    }
    for (const m of state.staff) if (canTrain(state, m.id) === null) dispatch(state, { type: 'train_staff', staffId: m.id });
    if (day === 10) {
      // Lift the shop to level 6 so the 3-Tem record player can be bought.
      state.shopLevel = Math.max(state.shopLevel, 6);
      dispatch(state, { type: 'buy_upgrade', upgradeId: 'record_player' });
    }
    trace.events.push(...state.events);
    state.events = [];
    const dayEvents = playDay(state);
    trace.events.push(...dayEvents, ...state.events);
    state.events = [];
    if (dayEvents.some((e) => e.type === 'vip_arrived')) trace.vipDays.push(day);
    trace.specialOrders.push(state.lastReport!.specialOrder);
    trace.rngByDay.push(state.rngState);
    seeTraits();
    if (day < DAYS) {
      delete state.week?.result;
      expect(dispatch(state, { type: 'next_day' })).toBe(true);
    }
  }
  return trace;
}

describe('P27 determinism', { timeout: 120_000 }, () => {
  const a = run(SEED);
  const b = run(SEED);

  it(`ends ${DAYS} days with the same state JSON and rngState`, () => {
    expect(a.state.day).toBe(DAYS);
    expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
    expect(b.state.rngState).toBe(a.state.rngState);
    expect(b.rngByDay).toEqual(a.rngByDay);
  });

  it('gives the same traits, special orders and VIP days in both runs', () => {
    expect(b.traits).toEqual(a.traits);
    expect(b.specialOrders).toEqual(a.specialOrders);
    expect(b.vipDays).toEqual(a.vipDays);
    expect(b.events).toEqual(a.events);
  });

  it('actually exercises the P27 systems in the script', () => {
    expect(Object.values(a.traits).every((t) => t !== undefined)).toBe(true);
    expect(a.specialOrders[0]).toBeUndefined();
    expect(a.specialOrders.slice(1).every((o) => o !== undefined)).toBe(true);
    expect(a.vipDays.length).toBeGreaterThan(0);
    expect(a.events.filter((e) => e.type === 'gift_claimed')).toHaveLength(DAYS - 1);
    expect(a.events.some((e) => e.type === 'staff_promoted')).toBe(true);
    expect(a.state.upgrades.record_player).toBe(1);
    expect(a.state.retention!.login.claimed).toBe(DAYS - 1);
  });

  it('diverges with another seed, so the comparison is not vacuous', () => {
    const c = run(SEED + 1);
    expect(JSON.stringify(c.state)).not.toBe(JSON.stringify(a.state));
    expect(c.state.rngState).not.toBe(a.state.rngState);
  });
});
