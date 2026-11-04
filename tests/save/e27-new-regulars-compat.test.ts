import { describe, expect, it } from 'vitest';
import { loadGame, migrate, saveGame } from '../../src/save/save';
import { SAVE_VERSION } from '../../src/save/slots';
import { createMemoryStorage } from '../../src/save/storage';
import { MILESTONE_COUNT, MILESTONE_VISITS, movedInRegulars, regularBook } from '../../src/sim/data/regularMilestones';
import { NEW_REGULARS, REGULARS, newRegularOrder } from '../../src/sim/data/regulars';
import { dispatch } from '../../src/sim/index';
import { createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState } from '../../src/sim/types';
import { playDay } from '../integration/helpers';

/**
 * E-27 adds one optional field, RegularVisits.succeededBy, so a save from
 * v0.37.0 (version 7, no field) loads unchanged: no version bump. It keeps
 * every milestone it reached, is paid nothing on load, and a regular already
 * past milestone 4 hands over to a season-2 regular on their next visit.
 */

type Raw = Record<string, unknown>;

/** Visits in REGULARS order: co_lan and chu_tuan are past milestone 4, anh_khoa kept 3 from E-18 and is one short of 4. */
const OLD = {
  co_lan: { visits: MILESTONE_VISITS.co_lan![3] + 20, keptMilestones: 0 },
  anh_minh: { visits: 70, keptMilestones: 2 },
  chu_tuan: { visits: MILESTONE_VISITS.chu_tuan![3] + 3, keptMilestones: 3 },
  chi_hoa: { visits: 45, keptMilestones: 2 },
  em_vy: { visits: 120, keptMilestones: 3 },
  bac_hung: { visits: 0, keptMilestones: 0 },
  chi_thao: { visits: 39, keptMilestones: 1 },
  anh_khoa: { visits: MILESTONE_VISITS.anh_khoa![3] - 1, keptMilestones: 3 },
};

/** A version-7 (v0.37.0) save of day 3's morning, written before E-27. */
function oldSave(): string {
  const state = createNewGame('Quán E27', 'normal', 2727);
  for (let day = 1; day <= 2; day++) {
    if (day > 1) expect(dispatch(state, { type: 'next_day' })).toBe(true);
    dispatch(state, { type: 'apply_restock' });
    playDay(state);
  }
  expect(dispatch(state, { type: 'next_day' })).toBe(true);
  state.regulars = Object.fromEntries(REGULARS.map((r) => [r.id, { ...OLD[r.id as keyof typeof OLD], firstDay: 2, lastDay: 2 }]));
  state.retention = { ...state.retention!, tickets: 17 };
  state.events = [];
  return JSON.stringify({ version: 7, savedAt: 1, analyticsConsent: 'unasked', state: state as unknown as Raw });
}

function load(text: string): GameState {
  const r = migrate(JSON.parse(text));
  if (!r.ok) throw new Error(r.error.message);
  expect(r.value.version).toBe(SAVE_VERSION);
  return r.value.state;
}

const reachedOf = (g: GameState) => Object.fromEntries(regularBook(g).map((p) => [p.regular.id, p.reached]));

describe('E-27 season-2 regulars: save compatibility', { timeout: 120_000 }, () => {
  it('keeps SAVE_VERSION 7: succeededBy is optional', () => {
    expect(SAVE_VERSION).toBe(7);
  });

  it('loads an old save with every reached milestone kept, nothing paid and nobody moved in yet', () => {
    const g = load(oldSave());
    expect(reachedOf(g)).toEqual({ co_lan: 4, anh_minh: 2, chu_tuan: 4, chi_hoa: 2, em_vy: 3, bac_hung: 0, chi_thao: 1, anh_khoa: 3 });
    expect(movedInRegulars(g)).toEqual([]);
    expect(g.retention!.tickets).toBe(17);
    expect(g.events.filter((e) => e.type === 'regular_milestone' || e.type === 'tickets_earned')).toHaveLength(0);
  });

  it('pays no old milestone again after load; a regular past milestone 4 hands over on their next visit', () => {
    const g = load(oldSave());
    const before = reachedOf(g);
    const events: GameEvent[] = [];
    for (let d = 0; d < 6; d++) {
      if (g.phase === 'report') expect(dispatch(g, { type: 'next_day' })).toBe(true);
      dispatch(g, { type: 'apply_restock' });
      events.push(...playDay(g));
    }
    const milestones = events.filter((e): e is Extract<GameEvent, { type: 'regular_milestone' }> => e.type === 'regular_milestone');
    // Only milestones above what the save had reached are paid (anh_khoa's 4th, at most).
    for (const m of milestones) expect(m.milestone, m.regularId).toBeGreaterThan(before[m.regularId] ?? 0);
    expect(milestones.filter((m) => m.regularId === 'co_lan' || m.regularId === 'chu_tuan')).toEqual([]);
    const reached = reachedOf(g);
    for (const r of REGULARS) expect(reached[r.id], r.id).toBeGreaterThanOrEqual(before[r.id]!);
    // co_lan and chu_tuan were past milestone 4: the season-2 regulars took their places, in seed order.
    const moved = movedInRegulars(g).map((r) => r.id);
    expect(moved).toEqual(newRegularOrder(g.seed).slice(0, moved.length));
    for (const id of ['co_lan', 'chu_tuan']) {
      const next = g.regulars![id]!.succeededBy;
      expect(next, id).toBeDefined();
      expect(NEW_REGULARS.some((r) => r.id === next)).toBe(true);
      expect(g.regulars![next!]!.keptMilestones).toBe(0);
      expect(g.regulars![next!]!.visits).toBeLessThan(MILESTONE_VISITS[next!]![0]);
    }
    for (const r of REGULARS) if (g.regulars![r.id]!.succeededBy) expect(reached[r.id]).toBe(MILESTONE_COUNT);
    // Season-2 regulars reach no milestone in their first days, so no Tem from them.
    expect(milestones.filter((m) => moved.includes(m.regularId))).toEqual([]);
  });

  it('round-trips who moved in', () => {
    const g = load(oldSave());
    for (let d = 0; d < 4; d++) {
      if (g.phase === 'report') expect(dispatch(g, { type: 'next_day' })).toBe(true);
      dispatch(g, { type: 'apply_restock' });
      playDay(g);
    }
    expect(movedInRegulars(g).length).toBeGreaterThan(0);
    const storage = createMemoryStorage();
    expect(saveGame(g, '2', storage, 1).ok).toBe(true);
    const r = loadGame('2', storage);
    if (!r.ok) throw new Error(r.error.message);
    expect(movedInRegulars(r.value)).toEqual(movedInRegulars(g));
    expect(reachedOf(r.value)).toEqual(reachedOf(g));
  });
});
