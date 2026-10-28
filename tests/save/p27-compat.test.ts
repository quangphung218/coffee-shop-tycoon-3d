import { describe, expect, it } from 'vitest';
import { loadGame, saveGame, saveKey } from '../../src/save/save';
import { SAVE_VERSION, listSlotSummaries } from '../../src/save/slots';
import { createMemoryStorage } from '../../src/save/storage';
import { dispatch } from '../../src/sim/index';
import { ensureRetention } from '../../src/sim/retention';
import { createNewGame } from '../../src/sim/state';
import type { GameState, RetentionState, SpecialOrder } from '../../src/sim/types';

/**
 * P27 adds only optional fields (Staff.trait/level/exp, Customer.vip,
 * GameState.retention/specialOrder), so saves stay at version 3 both ways.
 */

const SAVED_AT = 1_700_000_000_000;

function load(storage: ReturnType<typeof createMemoryStorage>): GameState {
  const r = loadGame('1', storage);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

/** A game with a hired staff member and a customer in the shop, events cleared. */
function openGame(): GameState {
  const state = createNewGame('Quán P27', 'normal', 2727);
  const candidate = state.candidates[0]!;
  expect(dispatch(state, { type: 'hire_staff', candidateId: candidate.id, role: 'barista' })).toBe(true);
  expect(dispatch(state, { type: 'start_day' })).toBe(true);
  state.events = [];
  return state;
}

describe('P27 save compatibility', () => {
  it('loads a version 3 save without the new fields; ensureRetention fills defaults', () => {
    expect(SAVE_VERSION).toBe(5);
    const state = openGame();
    const raw = JSON.parse(JSON.stringify(state)) as GameState;
    // A version 3 save from before P27: staff and candidates carry no trait.
    for (const m of [...raw.staff, ...raw.candidates]) delete m.trait;
    expect(raw.retention).toBeUndefined();
    expect(raw.specialOrder).toBeUndefined();
    const storage = createMemoryStorage();
    storage.setItem(saveKey('1'), JSON.stringify({ version: 3, savedAt: SAVED_AT, state: raw }));

    const s = load(storage);
    expect(s.retention).toBeUndefined();
    expect(s.staff.every((m) => m.trait === undefined && m.level === undefined && m.exp === undefined)).toBe(true);
    expect(ensureRetention(s)).toEqual({
      tickets: 0,
      login: { lastDate: null, streak: 0, claimed: 0 },
      lifetime: { served: 0, revenue: 0, fiveStar: 0, perfectDays: 0, threeCupWeeks: 0 },
      achievements: {},
    });
    expect(s.retention).toBe(ensureRetention(s));
  });

  it('keeps every new field through saveGame and loadGame', () => {
    const state = openGame();
    const retention: RetentionState = {
      tickets: 12,
      login: { lastDate: '2026-10-18', streak: 3, claimed: 5 },
      lifetime: { served: 140, revenue: 3_500_000, fiveStar: 20, perfectDays: 2, threeCupWeeks: 1 },
      achievements: { served: 2, five_star: 1 },
    };
    const specialOrder: SpecialOrder = {
      itemId: 'latte',
      target: 8,
      byMinute: 15 * 60,
      progress: 3,
      rewardTickets: 2,
      rewardMoney: 50_000,
      status: 'active',
    };
    state.retention = retention;
    state.specialOrder = specialOrder;
    state.staff[0]!.trait = 'barista_pro';
    state.staff[0]!.level = 3;
    state.staff[0]!.exp = 42;
    state.candidates[0]!.trait = 'tidy';
    state.customers.push({
      id: state.nextId++,
      state: 'queueing',
      pos: { x: 0, z: 0 },
      target: null,
      patience: 10,
      maxPatience: 10,
      order: null,
      tableId: null,
      timer: 0,
      look: 0,
      vip: true,
    });
    const storage = createMemoryStorage();
    expect(saveGame(state, '1', storage, SAVED_AT).ok).toBe(true);

    const s = load(storage);
    expect(s.retention).toEqual(retention);
    expect(s.specialOrder).toEqual(specialOrder);
    expect(s.staff[0]).toMatchObject({ trait: 'barista_pro', level: 3, exp: 42 });
    expect(s.candidates[0]!.trait).toBe('tidy');
    expect(s.customers.at(-1)!.vip).toBe(true);
  });

  it('lists a save with the new fields as a valid slot', () => {
    const state = openGame();
    state.retention = ensureRetention(state);
    state.retention.tickets = 4;
    state.specialOrder = null;
    state.staff[0]!.level = 2;
    const storage = createMemoryStorage();
    expect(saveGame(state, '1', storage, SAVED_AT).ok).toBe(true);

    const slot = listSlotSummaries(storage).find((info) => info.slot === '1')!;
    expect(slot).toMatchObject({ empty: false, shopName: 'Quán P27', day: state.day, money: state.money, savedAt: SAVED_AT });
    expect(slot.error).toBeUndefined();
  });
});
