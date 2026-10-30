import { describe, expect, it } from 'vitest';
import { loadGame, migrate, saveGame, saveKey } from '../../src/save/save';
import { SAVE_VERSION } from '../../src/save/slots';
import { createMemoryStorage } from '../../src/save/storage';
import { MILESTONE_TICKETS, MILESTONE_VISITS, regularBook } from '../../src/sim/data/regularMilestones';
import { REGULARS } from '../../src/sim/data/regulars';
import { dispatch } from '../../src/sim/index';
import { createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState } from '../../src/sim/types';
import { playDay } from '../integration/helpers';

/**
 * E-18 adds no save field: the milestones of the Sổ khách quen are derived
 * from `state.regulars[id].visits`, which saves have kept since P30. So the
 * save stays at version 6; a save whose regulars are already past a milestone
 * shows it reached on load without paying it, and the next milestone pays once.
 */

type Raw = Record<string, unknown>;

/** A version-6 save of day 3's morning whose regulars were counted before E-18: each sits just below or past a milestone. */
function oldSave(): string {
  const state = createNewGame('Quán E18', 'normal', 1818);
  dispatch(state, { type: 'apply_restock' });
  playDay(state);
  expect(dispatch(state, { type: 'next_day' })).toBe(true);
  dispatch(state, { type: 'apply_restock' });
  playDay(state);
  expect(dispatch(state, { type: 'next_day' })).toBe(true);
  const counts = [MILESTONE_VISITS[0] - 1, MILESTONE_VISITS[1] - 1, MILESTONE_VISITS[2] - 1, 45, 120, 0, MILESTONE_VISITS[0], 3];
  state.regulars = Object.fromEntries(REGULARS.map((r, i) => [r.id, { visits: counts[i]!, firstDay: 2, lastDay: 2 }]));
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

describe('E-18 milestone save compatibility', { timeout: 120_000 }, () => {
  it('keeps SAVE_VERSION 6: no new save field', () => {
    expect(SAVE_VERSION).toBe(6);
  });

  it('derives the reached milestones from the visits an old save counted, paying nothing on load', () => {
    const g = load(oldSave());
    const tickets = g.retention?.tickets ?? 0;
    const reached = Object.fromEntries(regularBook(g).map((p) => [p.regular.id, p.reached]));
    expect(reached).toEqual({ co_lan: 0, anh_minh: 1, chu_tuan: 2, chi_hoa: 2, em_vy: 3, bac_hung: 0, chi_thao: 1, anh_khoa: 0 });
    const lan = regularBook(g)[0]!;
    expect(lan.nextVisits).toBe(MILESTONE_VISITS[0]);
    expect(regularBook(g)[4]!.nextVisits).toBeNull();
    expect(g.events.filter((e) => e.type === 'regular_milestone')).toHaveLength(0);
    expect(g.retention?.tickets ?? 0).toBe(tickets);
  });

  it('pays a milestone once, on the visit that reaches it, and never for one already passed', () => {
    const g = load(oldSave());
    const before = structuredClone(g.regulars!);
    const tickets = g.retention?.tickets ?? 0;
    expect(dispatch(g, { type: 'apply_restock' })).toBe(true);
    const events: GameEvent[] = playDay(g);
    const arrived = events.filter((e) => e.type === 'regular_arrived');
    const milestones = events.filter((e): e is Extract<GameEvent, { type: 'regular_milestone' }> => e.type === 'regular_milestone');
    expect(arrived.length).toBeGreaterThan(0);
    const expected = arrived
      .map((e) => ({ regularId: e.regularId, visits: e.visits, milestone: MILESTONE_VISITS.indexOf(e.visits as (typeof MILESTONE_VISITS)[number]) + 1 }))
      .filter((e) => e.milestone > 0);
    expect(milestones.map((e) => ({ regularId: e.regularId, visits: e.visits, milestone: e.milestone }))).toEqual(expected);
    // co_lan, anh_minh and chu_tuan sit one visit below milestones 1, 2 and 3.
    for (const id of ['co_lan', 'anh_minh', 'chu_tuan']) {
      if (arrived.some((e) => e.regularId === id)) expect(milestones.map((m) => m.regularId), id).toContain(id);
    }
    // chi_hoa (45), em_vy (120) and chi_thao (10) are past a milestone already: one more visit pays nothing.
    for (const id of ['chi_hoa', 'em_vy', 'chi_thao']) expect(milestones.map((m) => m.regularId), id).not.toContain(id);
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
