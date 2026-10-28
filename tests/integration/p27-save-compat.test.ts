import { describe, expect, it } from 'vitest';
import { loadGame, saveGame, saveKey } from '../../src/save/save';
import { SAVE_VERSION } from '../../src/save/slots';
import { createMemoryStorage } from '../../src/save/storage';
import { dispatch } from '../../src/sim/index';
import { ensureRetention } from '../../src/sim/retention';
import { STAFF_TRAITS, staffTrait } from '../../src/sim/data/staffTraits';
import { TOP_MAX_STAFF, canTrain, maxStaff, staffTraitOf } from '../../src/sim/staffGrowth';
import { createNewGame, generateCandidates, withTraits } from '../../src/sim/state';
import type { GameEvent, GameState } from '../../src/sim/types';
import { nextUpgradeTicketCost, upgradeLevel } from '../../src/sim/upgrades';
import { playDay, runOpenDay } from './helpers';

/** Days every fixture plays on after loading, with the P27 commands. */
const PLAY_ON_DAYS = 3;
/** Ticket-priced furniture open from shop level 6 (3 Tem). */
const TEM_FURNITURE = 'record_player';
const SAVED_AT = 1_700_000_000_000;

/** Local date key 'YYYY-MM-DD' of game day `day` in October 2026 (day ≤ 31), never the real clock. */
function octoberKey(day: number): string {
  return `2026-10-${String(day).padStart(2, '0')}`;
}

function loadText(text: string): GameState {
  const storage = createMemoryStorage();
  storage.setItem(saveKey('1'), text);
  const r = loadGame('1', storage);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

function roundTrip(state: GameState): GameState {
  const storage = createMemoryStorage();
  expect(saveGame(state, '2', storage, SAVED_AT).ok).toBe(true);
  expect(JSON.parse(storage.getItem(saveKey('2'))!).version).toBe(SAVE_VERSION);
  const r = loadGame('2', storage);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

/** A save of `state` as written before P27: no retention, no special order, no trait/level/exp, no VIP. */
function stripP27(state: GameState): Record<string, unknown> {
  const raw = JSON.parse(JSON.stringify(state)) as GameState;
  delete raw.retention;
  delete raw.specialOrder;
  for (const m of [...raw.staff, ...raw.candidates]) {
    delete m.trait;
    delete m.level;
    delete m.exp;
  }
  for (const c of raw.customers) delete c.vip;
  return raw as unknown as Record<string, unknown>;
}

/** Fixture files built like tests/save/migration-v3.test.ts, one per old save version. */
function fixtures(): Record<string, string> {
  // v3: a played game (report of day 2) from before P27.
  const played = createNewGame('Quán v3', 'normal', 303);
  playDay(played);
  expect(dispatch(played, { type: 'next_day' })).toBe(true);
  playDay(played);
  const v3 = JSON.stringify({ version: 3, savedAt: 1, state: stripP27(played) });

  // v2: the same kind of save without the week index and archive.
  const v2State = stripP27(played);
  const week = v2State.week as Record<string, unknown> | undefined;
  if (week) {
    delete week.index;
    delete week.archive;
  }
  const v2 = JSON.stringify({ version: 2, savedAt: 1, state: v2State });

  // v1: a new game without week, seed, level, XP or missions.
  const v1State = stripP27(createNewGame('Quán v1', 'normal', 11));
  for (const k of ['week', 'seed', 'shopLevel', 'xp', 'missions']) delete v1State[k];
  const v1 = JSON.stringify({ version: 1, savedAt: 1, state: v1State });

  // v0: the bare prototype state, no version wrapper.
  const v0State = stripP27(createNewGame('Quán v0', 'normal', 13));
  const v0Fields = ['events', 'campaigns', 'orders', 'history', 'reviews', 'candidates', 'spawnAccumulator', 'weather', 'tickAccumulator', 'playerTasks'];
  for (const k of [...v0Fields, 'week', 'seed', 'shopLevel', 'xp', 'missions']) delete v0State[k];
  const v0 = JSON.stringify(v0State);

  return { v0, v1, v2, v3 };
}

interface PlayLog {
  gifts: number;
  trainings: number;
  furnitureBought: boolean;
  ticketsBeforeFurniture: number;
  ticketsAfterFurniture: number;
  events: GameEvent[];
}

/**
 * Plays PLAY_ON_DAYS days from a loaded save: each morning claims the gift,
 * hires a barista when there is none, trains whoever can be trained and, on
 * the last day, buys the ticket-priced furniture with the Tem earned.
 */
function playOnWithP27(g: GameState): PlayLog {
  const log: PlayLog = { gifts: 0, trainings: 0, furnitureBought: false, ticketsBeforeFurniture: 0, ticketsAfterFurniture: 0, events: [] };
  if (g.phase === 'report') expect(dispatch(g, { type: 'next_day' })).toBe(true);
  // The furniture opens at shop level 6; money covers it, the Tem must come from play.
  g.shopLevel = Math.max(g.shopLevel, 6);
  g.money += 5_000_000;
  for (let i = 1; i <= PLAY_ON_DAYS; i++) {
    expect(dispatch(g, { type: 'claim_daily_gift', dateKey: octoberKey(i) })).toBe(true);
    log.gifts++;
    if (!g.staff.some((s) => s.role === 'barista') && g.candidates[0]) {
      expect(dispatch(g, { type: 'hire_staff', candidateId: g.candidates[0].id, role: 'barista' })).toBe(true);
    }
    for (const m of g.staff) if (canTrain(g, m.id) === null && dispatch(g, { type: 'train_staff', staffId: m.id })) log.trainings++;
    if (i === PLAY_ON_DAYS) {
      log.ticketsBeforeFurniture = ensureRetention(g).tickets;
      log.furnitureBought = dispatch(g, { type: 'buy_upgrade', upgradeId: TEM_FURNITURE });
      log.ticketsAfterFurniture = ensureRetention(g).tickets;
    }
    dispatch(g, { type: 'apply_restock' });
    log.events.push(...g.events);
    g.events = [];
    log.events.push(...playDay(g));
    log.events.push(...g.events);
    g.events = [];
    if (i < PLAY_ON_DAYS) {
      delete g.week?.result;
      expect(dispatch(g, { type: 'next_day' })).toBe(true);
    }
  }
  return log;
}

describe('P27 save compatibility', { timeout: 120_000 }, () => {
  it('is at SAVE_VERSION 5 (rent)', () => {
    expect(SAVE_VERSION).toBe(5);
  });

  const files = fixtures();
  for (const version of ['v0', 'v1', 'v2', 'v3'] as const) {
    describe(`a ${version} save`, () => {
      it(`loads without the P27 fields and plays ${PLAY_ON_DAYS} days with gift, training and Tem furniture`, () => {
        const g = loadText(files[version]!);
        expect(g.retention).toBeUndefined();
        expect(g.specialOrder ?? null).toBeNull();
        const startDay = g.phase === 'report' ? g.day + 1 : g.day;

        const log = playOnWithP27(g);
        expect(g.phase).toBe('report');
        expect(g.day).toBe(startDay + PLAY_ON_DAYS - 1);
        expect(log.gifts).toBe(PLAY_ON_DAYS);
        // Streak days 1, 2, 3 of the gift cycle: 1 + 1 + 2 Tem.
        expect(g.retention!.login).toEqual({ lastDate: octoberKey(PLAY_ON_DAYS), streak: PLAY_ON_DAYS, claimed: PLAY_ON_DAYS });
        expect(log.events.filter((e) => e.type === 'gift_claimed')).toHaveLength(PLAY_ON_DAYS);
        expect(log.trainings).toBeGreaterThan(0);
        const barista = g.staff.find((s) => s.role === 'barista')!;
        expect(barista.level).toBeGreaterThanOrEqual(2);
        expect(barista.exp).toBeGreaterThan(0);
        // A candidate from an older save carries no trait; it is read from the hash without being written.
        expect(staffTraitOf(g, barista)).toBe(barista.trait ?? staffTrait(g.seed, barista.id));
        expect(STAFF_TRAITS[staffTraitOf(g, barista)]).toBeDefined();
        expect(log.furnitureBought).toBe(true);
        expect(log.ticketsAfterFurniture).toBe(log.ticketsBeforeFurniture - 3);
        expect(upgradeLevel(g, TEM_FURNITURE)).toBe(1);
        expect(nextUpgradeTicketCost(g, TEM_FURNITURE)).toBeNull();
        expect(g.money).toBeGreaterThan(0);
      });

      it('keeps retention, staff level/exp/trait and the special order through saveGame and loadGame', () => {
        const g = loadText(files[version]!);
        playOnWithP27(g);
        // Open the next day and stop at 09:00, with today's special order set and partly done.
        expect(dispatch(g, { type: 'next_day' })).toBe(true);
        dispatch(g, { type: 'apply_restock' });
        expect(dispatch(g, { type: 'start_day' })).toBe(true);
        runOpenDay(g, { untilMinute: 9 * 60 });
        expect(g.specialOrder).toBeTruthy();
        expect(g.specialOrder!.progress).toBeGreaterThan(0);

        const s = roundTrip(g);
        expect(s.retention).toEqual(g.retention);
        expect(s.specialOrder).toEqual(g.specialOrder);
        const pick = (st: GameState) => st.staff.map((m) => ({ id: m.id, level: m.level, exp: m.exp, trait: m.trait, wage: m.wagePerDay }));
        expect(pick(s)).toEqual(pick(g));
        expect(s.candidates.map((c) => c.trait)).toEqual(g.candidates.map((c) => c.trait));
        expect(s.customers.map((c) => c.vip)).toEqual(g.customers.map((c) => c.vip));
        expect(s.upgrades[TEM_FURNITURE]).toBe(1);
      });
    });
  }
});

describe('P27 edge cases', { timeout: 120_000 }, () => {
  it('employs 8 staff at expand_area 4, refuses a 9th, plays a day and keeps them through a save', () => {
    const s = createNewGame('Quán Rộng', 'normal', 88);
    s.shopLevel = 9;
    s.money = 1e12;
    for (let i = 0; i < 4; i++) expect(dispatch(s, { type: 'buy_upgrade', upgradeId: 'expand_area' })).toBe(true);
    expect(upgradeLevel(s, 'expand_area')).toBe(4);
    expect(maxStaff(s)).toBe(TOP_MAX_STAFF);
    expect(TOP_MAX_STAFF).toBe(8);
    s.candidates = withTraits(s.seed, generateCandidates(s, s.nextId, 10, 1));
    s.nextId += 10;
    for (let i = 0; i < 8; i++) expect(dispatch(s, { type: 'hire_staff', candidateId: s.candidates[0]!.id, role: 'barista' })).toBe(true);
    s.events = [];
    expect(dispatch(s, { type: 'hire_staff', candidateId: s.candidates[0]!.id, role: 'barista' })).toBe(false);
    expect(s.events).toContainEqual({ type: 'notify', level: 'error', text: 'Tối đa 8 nhân viên' });
    expect(s.staff).toHaveLength(8);

    dispatch(s, { type: 'apply_restock' });
    playDay(s);
    expect(s.staff).toHaveLength(8);
    expect(s.lastReport!.customersServed).toBeGreaterThan(0);
    const loaded = roundTrip(s);
    expect(loaded.staff.map((m) => m.id)).toEqual(s.staff.map((m) => m.id));
    expect(maxStaff(loaded)).toBe(8);
  });

  it('settles the special order when its item is turned off mid-day and never rolls a disabled item', () => {
    const s = createNewGame('Quán Tắt Món', 'normal', 4242);
    dispatch(s, { type: 'apply_restock' });
    playDay(s);
    expect(dispatch(s, { type: 'next_day' })).toBe(true);
    dispatch(s, { type: 'apply_restock' });
    expect(dispatch(s, { type: 'start_day' })).toBe(true);
    const order = s.specialOrder!;
    expect(order.status).toBe('active');
    const itemId = order.itemId;

    runOpenDay(s, { untilMinute: 9 * 60 });
    expect(dispatch(s, { type: 'set_menu_item', itemId, enabled: false })).toBe(true);
    const progressAtOff = s.specialOrder!.progress;
    runOpenDay(s);
    expect(s.phase).toBe('report');

    const settled = s.lastReport!.specialOrder!;
    expect(settled.itemId).toBe(itemId);
    expect(settled.progress).toBeGreaterThanOrEqual(progressAtOff);
    expect(settled.progress).toBeLessThanOrEqual(settled.target);
    expect(settled.status).toBe(settled.progress >= settled.target ? 'completed' : 'failed');
    expect(s.specialOrder).toBeNull();

    // The item stays off: the next days' orders pick only enabled items.
    for (let i = 0; i < 4; i++) {
      expect(dispatch(s, { type: 'next_day' })).toBe(true);
      dispatch(s, { type: 'apply_restock' });
      expect(dispatch(s, { type: 'start_day' })).toBe(true);
      if (s.specialOrder) expect(s.specialOrder.itemId).not.toBe(itemId);
      runOpenDay(s);
    }
  });

  it('claims the gift in the report phase, then refuses the same date the next morning', () => {
    const s = createNewGame('Quán Tối', 'normal', 55);
    dispatch(s, { type: 'apply_restock' });
    playDay(s);
    expect(s.phase).toBe('report');
    s.events = [];
    const money = s.money;
    expect(dispatch(s, { type: 'claim_daily_gift', dateKey: '2026-10-18' })).toBe(true);
    // Streak day 1 at Normal: 50.000 đ and 1 Tem.
    expect(s.money).toBe(money + 50_000);
    expect(s.retention!.tickets).toBeGreaterThanOrEqual(1);
    expect(s.events).toContainEqual({ type: 'gift_claimed', streak: 1, money: 50_000, tickets: 1 });
    expect(s.phase).toBe('report');

    expect(dispatch(s, { type: 'next_day' })).toBe(true);
    expect(dispatch(s, { type: 'claim_daily_gift', dateKey: '2026-10-18' })).toBe(false);
    expect(s.retention!.login).toEqual({ lastDate: '2026-10-18', streak: 1, claimed: 1 });
    expect(dispatch(s, { type: 'claim_daily_gift', dateKey: '2026-10-19' })).toBe(true);
    expect(s.retention!.login.streak).toBe(2);
  });

  it("keeps the streak across the new year: '2026-12-31' then '2027-01-01'", () => {
    const s = createNewGame('Quán Giao Thừa', 'normal', 2027);
    expect(dispatch(s, { type: 'claim_daily_gift', dateKey: '2026-12-30' })).toBe(true);
    expect(dispatch(s, { type: 'claim_daily_gift', dateKey: '2026-12-31' })).toBe(true);
    expect(s.retention!.login.streak).toBe(2);
    expect(dispatch(s, { type: 'claim_daily_gift', dateKey: '2027-01-01' })).toBe(true);
    expect(s.retention!.login).toEqual({ lastDate: '2027-01-01', streak: 3, claimed: 3 });
    // A skipped day starts the cycle again.
    expect(dispatch(s, { type: 'claim_daily_gift', dateKey: '2027-01-03' })).toBe(true);
    expect(s.retention!.login.streak).toBe(1);
  });
});
