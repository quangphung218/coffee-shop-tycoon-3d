import { describe, expect, it } from 'vitest';
import { loadGame, migrate, saveGame } from '../../src/save/save';
import { SAVE_VERSION } from '../../src/save/slots';
import { createMemoryStorage } from '../../src/save/storage';
import { generatedId, generatedIndex } from '../../src/sim/data/regularChain';
import { MILESTONE_COUNT, MILESTONE_VISITS, movedInRegulars, regularBook } from '../../src/sim/data/regularMilestones';
import { NEW_REGULARS, REGULARS, newRegularOrder } from '../../src/sim/data/regulars';
import { dispatch } from '../../src/sim/index';
import { createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState, RegularVisits } from '../../src/sim/types';
import { playDay } from '../integration/helpers';

/**
 * E-32 adds no field: season 3+ regulars are new keys of state.regulars and
 * new succeededBy values, so a v0.42.0 save (version 9) loads unchanged and
 * SAVE_VERSION stays 9. It keeps every milestone it reached, is paid nothing
 * on load, and a season-2 regular already past milestone 4 hands over to
 * their generated successor on their next visit. A damaged chain is cut at
 * load so following it cannot loop.
 */

type Raw = Record<string, unknown>;

/** Day 3's morning of a v0.42.0 game whose regulars are `regulars`, with 17 Tem. */
function oldSave(regulars: (order: string[]) => Record<string, RegularVisits>): string {
  const state = createNewGame('Quán E32', 'normal', 3232);
  for (let day = 1; day <= 2; day++) {
    if (day > 1) expect(dispatch(state, { type: 'next_day' })).toBe(true);
    dispatch(state, { type: 'apply_restock' });
    playDay(state);
  }
  expect(dispatch(state, { type: 'next_day' })).toBe(true);
  state.regulars = regulars(newRegularOrder(state.seed));
  state.retention = { ...state.retention!, tickets: 17 };
  state.events = [];
  return JSON.stringify({ version: 9, savedAt: 1, analyticsConsent: 'unasked', state: state as unknown as Raw });
}

/** Every first-eight regular followed by season 2; season-2 slots 0–2 are past milestone 4, the rest part-way. */
const late = (order: string[]): Record<string, RegularVisits> => ({
  ...Object.fromEntries(REGULARS.map((r, i) => [r.id, { visits: MILESTONE_VISITS[r.id]![3] + 40, firstDay: 2, lastDay: 1, keptMilestones: 0, succeededBy: order[i] }])),
  ...Object.fromEntries(order.map((id, slot) => [id, { visits: slot < 3 ? MILESTONE_VISITS[id]![3] + 2 : MILESTONE_VISITS[id]![1] + 1, firstDay: 2, lastDay: 1, keptMilestones: 0 }])),
});

function load(text: string): GameState {
  const r = migrate(JSON.parse(text));
  if (!r.ok) throw new Error(r.error.message);
  expect(r.value.version).toBe(SAVE_VERSION);
  return r.value.state;
}

function play(g: GameState, days: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let d = 0; d < days; d++) {
    if (g.phase === 'report') expect(dispatch(g, { type: 'next_day' })).toBe(true);
    dispatch(g, { type: 'apply_restock' });
    events.push(...playDay(g));
  }
  return events;
}

const reachedOf = (g: GameState) => Object.fromEntries(regularBook(g).map((p) => [p.regular.id, p.reached]));

describe('E-32 season 3+ regulars: save compatibility', { timeout: 120_000 }, () => {
  it('keeps SAVE_VERSION 9: no new field', () => {
    expect(SAVE_VERSION).toBe(9);
  });

  it('loads a v0.42.0 save with every reached milestone kept, nothing paid, chains untouched', () => {
    const text = oldSave(late);
    const g = load(text);
    const order = newRegularOrder(g.seed);
    const reached = reachedOf(g);
    for (const r of REGULARS) expect(reached[r.id], r.id).toBe(MILESTONE_COUNT);
    for (const [slot, id] of order.entries()) expect(reached[id], id).toBe(slot < 3 ? 4 : 2);
    expect(g.retention!.tickets).toBe(17);
    expect(g.events.filter((e) => e.type === 'regular_milestone' || e.type === 'tickets_earned')).toHaveLength(0);
    // Written by the game: nothing cut.
    expect(g.regulars).toEqual((JSON.parse(text) as { state: GameState }).state.regulars);
    expect(movedInRegulars(g).map((r) => r.id)).toEqual(order);
  });

  it('pays no old milestone again; a season-2 regular past milestone 4 hands over to their generated successor', () => {
    const g = load(oldSave(late));
    const before = reachedOf(g);
    const events = play(g, 6);
    const milestones = events.filter((e): e is Extract<GameEvent, { type: 'regular_milestone' }> => e.type === 'regular_milestone');
    for (const m of milestones) expect(m.milestone, m.regularId).toBeGreaterThan(before[m.regularId] ?? 0);
    const order = newRegularOrder(g.seed);
    let handedOver = 0;
    for (const [slot, id] of order.entries()) {
      const next = g.regulars![id]!.succeededBy;
      if (slot >= 3) {
        expect(next, id).toBeUndefined();
        continue;
      }
      if (!next) continue; // not named in these 6 days
      handedOver += 1;
      expect(next).toBe(generatedId(NEW_REGULARS.findIndex((r) => r.id === id)));
      expect(g.regulars![next]!.keptMilestones).toBe(0);
    }
    expect(handedOver).toBeGreaterThan(0);
    // Generated regulars reach no milestone in their first days, so no Tem from them; no one lost a reached milestone.
    expect(milestones.filter((m) => generatedIndex(m.regularId) >= 0)).toEqual([]);
    const reached = reachedOf(g);
    for (const id of Object.keys(before)) expect(reached[id], id).toBeGreaterThanOrEqual(before[id]!);
  });

  it('round-trips the chain', () => {
    const g = load(oldSave(late));
    play(g, 4);
    expect(movedInRegulars(g).length).toBeGreaterThan(NEW_REGULARS.length);
    const storage = createMemoryStorage();
    expect(saveGame(g, '2', storage, 1).ok).toBe(true);
    const r = loadGame('2', storage);
    if (!r.ok) throw new Error(r.error.message);
    expect(movedInRegulars(r.value)).toEqual(movedInRegulars(g));
    expect(reachedOf(r.value)).toEqual(reachedOf(g));
    expect(r.value.regulars).toEqual(g.regulars);
  });

  it('cuts a damaged chain (loop, unknown id, first-eight id, double claim) so play cannot hang', () => {
    const damaged = (order: string[]): Record<string, RegularVisits> => {
      const base = late(order);
      const [a, b] = [order[0]!, order[1]!];
      base[a] = { ...base[a]!, succeededBy: generatedId(0) };
      base[generatedId(0)] = { visits: 400, firstDay: 2, lastDay: 1, keptMilestones: 0, succeededBy: a }; // loops back
      base[b] = { ...base[b]!, succeededBy: 'nobody' };
      base[order[2]!] = { ...base[order[2]!]!, succeededBy: REGULARS[0]!.id };
      base[order[3]!] = { ...base[order[3]!]!, succeededBy: generatedId(0) }; // already claimed by slot 0
      base.stray = { visits: 1, firstDay: 2, lastDay: 1, keptMilestones: 0, succeededBy: generatedId(9) };
      return base;
    };
    const g = load(oldSave(damaged));
    const order = newRegularOrder(g.seed);
    expect(g.regulars![order[0]!]!.succeededBy).toBe(generatedId(0));
    expect(g.regulars![generatedId(0)]!.succeededBy).toBeUndefined();
    for (const id of [order[1]!, order[2]!, order[3]!, 'stray']) expect(g.regulars![id]!.succeededBy, id).toBeUndefined();
    // Visits are kept; nothing paid.
    expect(g.regulars![generatedId(0)]!.visits).toBe(400);
    expect(g.retention!.tickets).toBe(17);
    play(g, 2);
  });
});
