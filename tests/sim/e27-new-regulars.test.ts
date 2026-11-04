import { describe, expect, it } from 'vitest';
import {
  MILESTONE_COUNT,
  MILESTONE_TICKETS,
  MILESTONE_VISITS,
  NEW_REGULAR_BOOK,
  REGULAR_BOOK,
  movedInRegulars,
  regularBook,
} from '../../src/sim/data/regularMilestones';
import { NEW_REGULARS, REGULARS, newRegularOrder, regularById } from '../../src/sim/data/regulars';
import { WEEK_LENGTH } from '../../src/sim/data/week';
import { createNewGame } from '../../src/sim/state';
import { dispatch } from '../../src/sim/index';
import type { GameEvent, GameState } from '../../src/sim/types';
import { regularRows } from '../../src/ui/panels/tasks';
import { playDay } from '../integration/helpers';

const EMOJI = /\p{Extended_Pictographic}/u;
const VI = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;
const WEEKS_UNCHANGED = 40;

describe('E-27 season-2 regulars: data', () => {
  it('adds 4–8 new regulars with their own ids, names and recoloured looks', () => {
    expect(NEW_REGULARS.length).toBeGreaterThanOrEqual(4);
    expect(NEW_REGULARS.length).toBeLessThanOrEqual(8);
    const all = [...REGULARS, ...NEW_REGULARS];
    expect(new Set(all.map((r) => r.id)).size).toBe(all.length);
    expect(new Set(all.map((r) => r.name)).size).toBe(all.length);
    expect(new Set(all.map((r) => r.look)).size).toBe(all.length);
    for (const r of NEW_REGULARS) {
      expect(Number.isInteger(r.look) && r.look >= 0, r.id).toBe(true);
      expect(regularById(r.id)).toBe(r);
      expect(EMOJI.test(r.name), r.name).toBe(false);
    }
  });

  it('gives each new regular a book entry: dish, four milestones with the same small Tem', () => {
    expect(NEW_REGULAR_BOOK.map((e) => e.regularId)).toEqual(NEW_REGULARS.map((r) => r.id));
    for (const e of NEW_REGULAR_BOOK) {
      expect(e.favoriteDish.length).toBeGreaterThan(0);
      expect(EMOJI.test(e.favoriteDish)).toBe(false);
      expect(e.milestones).toHaveLength(MILESTONE_COUNT);
      expect(e.milestones.map((m) => m.visits)).toEqual(MILESTONE_VISITS[e.regularId]);
      expect(e.milestones.map((m) => m.tickets)).toEqual([...MILESTONE_TICKETS]);
      for (let i = 1; i < MILESTONE_COUNT; i++) expect(e.milestones[i]!.visits).toBeGreaterThan(e.milestones[i - 1]!.visits);
    }
  });

  it('staggers the thresholds: no two of all 64 are the same', () => {
    const all = [...REGULAR_BOOK, ...NEW_REGULAR_BOOK].flatMap((e) => e.milestones.map((m) => m.visits));
    expect(new Set(all).size).toBe(all.length);
  });

  it('puts no new milestone in weeks 1–40: it needs more visits than days left after the earliest move-in', () => {
    // Earliest move-in: the day after the lowest milestone 4 of the first eight (one visit a day from day 2).
    const earliestMoveIn = Math.min(...REGULAR_BOOK.map((e) => e.milestones[3].visits)) + 2;
    const lastDay = WEEKS_UNCHANGED * WEEK_LENGTH;
    for (const e of NEW_REGULAR_BOOK) expect(earliestMoveIn + e.milestones[0].visits - 1, e.regularId).toBeGreaterThan(lastDay);
  });

  it('tells a Vietnamese story of exactly 2 sentences per milestone, without emoji', () => {
    for (const e of NEW_REGULAR_BOOK) {
      for (const m of e.milestones) {
        expect(m.story.split(/(?<=[.!?])\s+/).filter(Boolean), m.story).toHaveLength(2);
        expect(EMOJI.test(m.story), m.story).toBe(false);
        expect(VI.test(m.story), m.story).toBe(true);
      }
    }
  });

  it('orders the move-ins by seed, deterministically', () => {
    const ids = NEW_REGULARS.map((r) => r.id).sort();
    for (const seed of [1, 7, 42, 2026]) {
      expect(newRegularOrder(seed)).toEqual(newRegularOrder(seed));
      expect([...newRegularOrder(seed)].sort()).toEqual(ids);
    }
    const orders = new Set([1, 7, 42, 2026, 99].map((s) => newRegularOrder(s).join()));
    expect(orders.size).toBeGreaterThan(1);
  });
});

/** A game on day 3's morning whose first-eight regulars have `visits(id)` visits, last seen day 2. */
function gameWith(seed: number, visits: (id: string) => number): GameState {
  const state = createNewGame('Quán E27', 'normal', seed);
  for (let day = 1; day <= 2; day++) {
    if (day > 1) expect(dispatch(state, { type: 'next_day' })).toBe(true);
    dispatch(state, { type: 'apply_restock' });
    playDay(state);
  }
  expect(dispatch(state, { type: 'next_day' })).toBe(true);
  state.regulars = Object.fromEntries(REGULARS.map((r) => [r.id, { visits: visits(r.id), firstDay: 2, lastDay: 2, keptMilestones: 0 }]));
  state.events = [];
  return state;
}

interface DayLog {
  arrived: Extract<GameEvent, { type: 'regular_arrived' }>[];
  milestones: Extract<GameEvent, { type: 'regular_milestone' }>[];
  milestoneTem: number;
  money: number;
  customersArrived: number;
  customersServed: number;
  regularsServed: number;
  cups: number;
}

function playDays(state: GameState, days: number): DayLog[] {
  const log: DayLog[] = [];
  for (let d = 0; d < days; d++) {
    if (state.phase === 'report') expect(dispatch(state, { type: 'next_day' })).toBe(true);
    dispatch(state, { type: 'apply_restock' });
    const events = playDay(state);
    log.push({
      arrived: events.filter((e): e is DayLog['arrived'][number] => e.type === 'regular_arrived'),
      milestones: events.filter((e): e is DayLog['milestones'][number] => e.type === 'regular_milestone'),
      milestoneTem: events.reduce((n, e) => n + (e.type === 'tickets_earned' && e.reason === 'regular_milestone' ? e.amount : 0), 0),
      money: state.money,
      customersArrived: state.today.customersArrived,
      customersServed: state.today.customersServed,
      regularsServed: state.today.regularsServed ?? 0,
      cups: Object.values(state.today.sold).reduce((n, v) => n + (v ?? 0), 0),
    });
  }
  return log;
}

describe('E-27 season-2 regulars: moving in', { timeout: 120_000 }, () => {
  const SEED = 4242;
  const DAYS = 12;
  /** Every first-eight regular one visit short of milestone 4. */
  const nearDone = (id: string) => MILESTONE_VISITS[id]![3] - 1;

  it('moves a new regular in, in seed order, once a first-eight regular completes milestone 4', () => {
    const state = gameWith(SEED, nearDone);
    const log = playDays(state, DAYS);
    const all = log.flatMap((d, i) => d.arrived.map((e) => ({ ...e, day: i })));
    const completedDay = new Map<string, number>();
    for (const [i, d] of log.entries()) for (const m of d.milestones) if (m.milestone === 4) completedDay.set(m.regularId, i);
    expect(completedDay.size).toBeGreaterThan(0);
    const moved = movedInRegulars(state).map((r) => r.id);
    expect(moved).toEqual(newRegularOrder(SEED).slice(0, moved.length));
    expect(moved.length).toBe(REGULARS.filter((r) => state.regulars![r.id]!.succeededBy).length);
    for (const r of REGULARS) {
      const next = state.regulars![r.id]!.succeededBy;
      if (!next) continue;
      // The first-eight regular came for the last time on the day of milestone 4; the new one only on later days.
      const done = completedDay.get(r.id)!;
      expect(all.filter((e) => e.regularId === r.id).every((e) => e.day <= done), r.id).toBe(true);
      const theirs = all.filter((e) => e.regularId === next);
      expect(theirs.length, next).toBeGreaterThan(0);
      expect(theirs[0]!.day, next).toBeGreaterThan(done);
      expect(theirs.map((e) => e.visits)).toEqual(theirs.map((_, k) => k + 1));
      expect(state.regulars![next]!.keptMilestones).toBe(0);
    }
    // New regulars are named and shown: book pages after the first eight, rows in the Khách quen card.
    expect(regularBook(state).map((p) => p.regular.id)).toEqual([...REGULARS.map((r) => r.id), ...moved]);
    expect(regularRows(state).map((r) => r.id)).toEqual(expect.arrayContaining(moved));
    // Still at most one named visit per regular per day.
    for (const d of log) expect(new Set(d.arrived.map((e) => e.regularId)).size).toBe(d.arrived.length);
  });

  it('changes nothing but names and Tem: same arrivals, served, regulars served, cups and money as a game without move-ins', () => {
    const withMoveIns = playDays(gameWith(SEED, nearDone), DAYS);
    // Same game, regulars far from milestone 4 (nobody moves in); milestones there pay Tem only.
    const without = playDays(gameWith(SEED, (id) => MILESTONE_VISITS[id]![0] - 5), DAYS);
    const shape = (l: DayLog[]) => l.map((d) => ({ money: d.money, a: d.customersArrived, s: d.customersServed, r: d.regularsServed, c: d.cups, named: d.arrived.length }));
    expect(shape(withMoveIns)).toEqual(shape(without));
    expect(withMoveIns.some((d) => d.arrived.some((e) => NEW_REGULARS.some((r) => r.id === e.regularId)))).toBe(true);
  });

  it('pays a new regular’s milestone Tem once, on the visit that reaches it, under reason regular_milestone', () => {
    const state = gameWith(SEED, nearDone);
    playDays(state, 4);
    const next = movedInRegulars(state)[0]!.id;
    const first = MILESTONE_VISITS[next]![0];
    state.regulars![next]!.visits = first - 1;
    const log = playDays(state, 6);
    const theirs = log.flatMap((d) => d.milestones).filter((m) => m.regularId === next);
    const visited = log.some((d) => d.arrived.some((e) => e.regularId === next));
    expect(visited).toBe(true);
    expect(theirs).toEqual([{ type: 'regular_milestone', regularId: next, milestone: 1, visits: first, tickets: MILESTONE_TICKETS[0] }]);
    expect(regularBook(state).find((p) => p.regular.id === next)!.reached).toBe(1);
  });
});
