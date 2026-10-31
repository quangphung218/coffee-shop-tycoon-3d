import { describe, expect, it } from 'vitest';
import { loadGame, migrate, saveGame, saveKey } from '../../src/save/save';
import { SAVE_VERSION } from '../../src/save/slots';
import { createMemoryStorage } from '../../src/save/storage';
import { MILESTONE_TICKETS, MILESTONE_VISITS, milestoneAt, regularBook } from '../../src/sim/data/regularMilestones';
import { REGULARS } from '../../src/sim/data/regulars';
import { dispatch } from '../../src/sim/index';
import { createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState } from '../../src/sim/types';
import { playDay } from '../integration/helpers';

/**
 * E-18 adds no save field: the milestones of the Sổ khách quen are derived
 * from `state.regulars[id].visits`, which saves have kept since P30. E-22 gives
 * each regular thresholds of their own and a 4th milestone; a save from before
 * it keeps what it reached in E-18's book (10/40/100 for everyone) through
 * `keptMilestones`, filled on load, so the save stays at version 6. Kept
 * milestones show reached and are never paid again; the next new one pays once.
 */

type Raw = Record<string, unknown>;

/**
 * Visits an E-18 save counted, in REGULARS order, against each regular's E-22
 * thresholds (MILESTONE_VISITS): co_lan 10/90/195/245, anh_minh 25/65/145/265,
 * chu_tuan 45/115/170/235, chi_hoa 15/80/220/255, em_vy 30/110/130/270,
 * bac_hung 60/75/180/240, chi_thao 40/120/160/260, anh_khoa 50/100/205/250.
 */
const OLD_COUNTS = [9, 64, 169, 45, 120, 0, 39, 249];
/** Milestones each reached in E-18's book (10/40/100). */
const E18_REACHED = { co_lan: 0, anh_minh: 2, chu_tuan: 3, chi_hoa: 2, em_vy: 3, bac_hung: 0, chi_thao: 1, anh_khoa: 3 };

/** A version-6 save of day 3's morning whose regulars were counted before E-22. */
function oldSave(): string {
  const state = createNewGame('Quán E18', 'normal', 1818);
  dispatch(state, { type: 'apply_restock' });
  playDay(state);
  expect(dispatch(state, { type: 'next_day' })).toBe(true);
  dispatch(state, { type: 'apply_restock' });
  playDay(state);
  expect(dispatch(state, { type: 'next_day' })).toBe(true);
  state.regulars = Object.fromEntries(REGULARS.map((r, i) => [r.id, { visits: OLD_COUNTS[i]!, firstDay: 2, lastDay: 2 }]));
  state.events = [];
  return JSON.stringify({ version: 6, savedAt: 1, state: state as unknown as Raw });
}

function load(text: string): GameState {
  const r = migrate(JSON.parse(text));
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.error.message);
  expect(r.value.version).toBe(SAVE_VERSION);
  return r.value.state;
}

describe('E-18/E-22 milestone save compatibility', { timeout: 120_000 }, () => {
  it('keeps SAVE_VERSION 6: kept milestones are filled on load', () => {
    expect(SAVE_VERSION).toBe(6);
  });

  it('keeps the milestones an old save reached in E-18’s book, paying nothing on load', () => {
    const g = load(oldSave());
    const tickets = g.retention?.tickets ?? 0;
    expect(Object.fromEntries(Object.entries(g.regulars!).map(([id, r]) => [id, r.keptMilestones]))).toEqual(E18_REACHED);
    const book = regularBook(g);
    expect(Object.fromEntries(book.map((p) => [p.regular.id, p.reached]))).toEqual(E18_REACHED);
    // chi_hoa (45) is below her E-22 milestone 2 (80) but keeps the 2 she had; em_vy (120) keeps 3 below her 130.
    const hoa = book.find((p) => p.regular.id === 'chi_hoa')!;
    expect(hoa.milestones.map((m) => m.reached)).toEqual([true, true, false, false]);
    expect(hoa.nextVisits).toBe(MILESTONE_VISITS.chi_hoa![2]);
    expect(book.find((p) => p.regular.id === 'em_vy')!.nextVisits).toBe(MILESTONE_VISITS.em_vy![3]);
    expect(book.find((p) => p.regular.id === 'co_lan')!.nextVisits).toBe(MILESTONE_VISITS.co_lan![0]);
    expect(g.events.filter((e) => e.type === 'regular_milestone')).toHaveLength(0);
    expect(g.retention?.tickets ?? 0).toBe(tickets);
  });

  it('marks regulars counted since E-22 so a later load keeps nothing extra', () => {
    const g = load(oldSave());
    delete g.regulars!.bac_hung;
    expect(dispatch(g, { type: 'apply_restock' })).toBe(true);
    playDay(g);
    const fresh = Object.entries(g.regulars!).filter(([id]) => !(id in E18_REACHED) || id === 'bac_hung');
    for (const [, r] of fresh) expect(r.keptMilestones).toBe(0);
    const storage = createMemoryStorage();
    expect(saveGame(g, '2', storage, 1).ok).toBe(true);
    const r = loadGame('2', storage);
    if (!r.ok) throw new Error(r.error.message);
    expect(Object.fromEntries(Object.entries(r.value.regulars!).map(([id, v]) => [id, v.keptMilestones]))).toEqual(
      Object.fromEntries(Object.entries(g.regulars!).map(([id, v]) => [id, v.keptMilestones])),
    );
  });

  it('pays a new milestone once, on the visit that reaches it, and never one kept from E-18', () => {
    const g = load(oldSave());
    const before = structuredClone(g.regulars!);
    const tickets = g.retention?.tickets ?? 0;
    expect(dispatch(g, { type: 'apply_restock' })).toBe(true);
    const events: GameEvent[] = playDay(g);
    const arrived = events.filter((e) => e.type === 'regular_arrived');
    const milestones = events.filter((e): e is Extract<GameEvent, { type: 'regular_milestone' }> => e.type === 'regular_milestone');
    expect(arrived.length).toBeGreaterThan(0);
    const expected = arrived
      .map((e) => ({ regularId: e.regularId, visits: e.visits, milestone: milestoneAt(e.regularId, e.visits, before[e.regularId]?.keptMilestones ?? 0) }))
      .filter((e) => e.milestone > 0);
    expect(milestones.map((e) => ({ regularId: e.regularId, visits: e.visits, milestone: e.milestone }))).toEqual(expected);
    // co_lan (9) is one below milestone 1, anh_khoa (249) one below milestone 4: both are new and pay.
    for (const id of ['co_lan', 'anh_khoa']) {
      if (arrived.some((e) => e.regularId === id)) expect(milestones.map((m) => m.regularId), id).toContain(id);
    }
    // anh_minh (64), chu_tuan (169) and chi_thao (39) are one below an E-22 milestone they already kept from E-18: no Tem again.
    for (const id of ['anh_minh', 'chu_tuan', 'chi_thao', 'chi_hoa', 'em_vy']) expect(milestones.map((m) => m.regularId), id).not.toContain(id);
    expect(arrived.some((e) => ['anh_minh', 'chu_tuan', 'chi_thao'].includes(e.regularId))).toBe(true);
    for (const e of arrived) expect(e.visits).toBe(before[e.regularId]!.visits + 1);
    const paid = milestones.reduce((s, e) => s + e.tickets, 0);
    expect(paid).toBe(milestones.reduce((s, e) => s + MILESTONE_TICKETS[e.milestone - 1]!, 0));
    const earned = events.filter((e) => e.type === 'tickets_earned' && e.reason === 'regular_milestone').reduce((s, e) => s + (e.type === 'tickets_earned' ? e.amount : 0), 0);
    expect(earned).toBe(paid);
    expect(g.retention!.tickets).toBeGreaterThanOrEqual(tickets + paid);
  });

  it('round-trips the counted visits at SAVE_VERSION', () => {
    const g = load(oldSave());
    const storage = createMemoryStorage();
    expect(saveGame(g, '2', storage, 1_700_000_000_000).ok).toBe(true);
    expect((JSON.parse(storage.getItem(saveKey('2'))!) as { version: number }).version).toBe(SAVE_VERSION);
    const r = loadGame('2', storage);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error.message);
    expect(regularBook(r.value).map((p) => p.reached)).toEqual(regularBook(g).map((p) => p.reached));
  });
});
