import { describe, expect, it } from 'vitest';
import { chainVisits, generatedId, generatedIndex, generatedProfile, generatedVisits } from '../../src/sim/data/regularChain';
import {
  MILESTONE_COUNT,
  MILESTONE_TICKETS,
  MILESTONE_VISITS,
  movedInRegulars,
  regularBook,
  regularBookEntry,
} from '../../src/sim/data/regularMilestones';
import { NEW_REGULARS, REGULARS, chainSuccessor, newRegularOrder, regularById } from '../../src/sim/data/regulars';
import { dispatch } from '../../src/sim/index';
import { createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState, RegularVisits } from '../../src/sim/types';
import { NEW_REGULAR_DAYS, isNewRegular, regularRows } from '../../src/ui/panels/tasks';
import { playDay } from '../integration/helpers';

const EMOJI = /\p{Extended_Pictographic}/u;
const VI = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;
/** Generated regulars checked for uniqueness: 250 seasons of 8. */
const CHECKED = 2000;
const sentences = (story: string) => story.split(/(?<=[.!?])\s+/).filter(Boolean);
const givenName = (name: string) => name.split(' ').slice(1).join(' ');

describe('E-32 season 3+ regulars: data', () => {
  const profiles = Array.from({ length: CHECKED }, (_, k) => generatedProfile(k));
  const earlier = [...REGULARS, ...NEW_REGULARS];

  it('names every generated regular apart from each other and from seasons 1–2', () => {
    const names = [...earlier.map((r) => r.name), ...profiles.map((p) => p.name)];
    expect(new Set(names).size).toBe(names.length);
    // Not even the given name repeats ("Chị Hằng" and "Cô Hằng" would read as one person).
    const given = [...earlier.map((r) => givenName(r.name)), ...profiles.map((p) => givenName(p.name))];
    expect(new Set(given).size).toBe(given.length);
    for (const p of profiles) {
      expect(p.name, p.id).toMatch(/^(Cô|Chị|Anh|Chú|Em) \S/);
      expect(EMOJI.test(p.name), p.name).toBe(false);
    }
  });

  it('gives every generated regular a profession of their own, none a season 1–2 job', () => {
    const professions = profiles.map((p) => p.profession);
    expect(new Set(professions).size).toBe(professions.length);
    const old = ['dạy văn', 'lập trình', 'xe ôm', 'bán hoa', 'sinh viên', 'sửa đồng hồ', 'y tá', 'chụp ảnh', 'thủ thư', 'kiến trúc', 'piano', 'sửa xe đạp', 'giao hàng', 'bán xôi', 'đầu bếp', 'ngân hàng'];
    for (const p of professions.slice(0, 16)) for (const o of old) expect(p.includes(o), `${p} / ${o}`).toBe(false);
  });

  it('composes 2 Vietnamese sentences per milestone from the profession and the beat, no emoji, nothing left unfilled', () => {
    for (const p of profiles.slice(0, 64)) {
      expect(p.stories).toHaveLength(MILESTONE_COUNT);
      expect(new Set(p.stories).size).toBe(MILESTONE_COUNT);
      for (const story of p.stories) {
        expect(sentences(story), story).toHaveLength(2);
        expect(story.startsWith(p.name), story).toBe(true);
        expect(EMOJI.test(story), story).toBe(false);
        expect(VI.test(story), story).toBe(true);
        expect(story, story).not.toMatch(/[{}]|undefined|  /);
      }
    }
  });

  it('book entries pay only the usual milestone Tem, with a dish and rising thresholds', () => {
    for (let k = 0; k < 64; k++) {
      const e = regularBookEntry(generatedId(k))!;
      expect(e.regularId).toBe(generatedId(k));
      expect(e.favoriteDish.length).toBeGreaterThan(0);
      expect(e.milestones.map((m) => m.tickets)).toEqual([...MILESTONE_TICKETS]);
      expect(e.milestones.map((m) => m.visits)).toEqual([...generatedVisits(k)]);
      expect(e.milestones[0].visits).toBeGreaterThan(0);
      for (let i = 1; i < MILESTONE_COUNT; i++) expect(e.milestones[i]!.visits).toBeGreaterThan(e.milestones[i - 1]!.visits);
      expect(regularById(generatedId(k))!.name).toBe(generatedProfile(k).name);
    }
  });

  it('spacing rule: a chain continues E-27’s season-2 formula, 40 visits per milestone forever', () => {
    // Chain milestones 0–3 are exactly season 2's (E-27) thresholds.
    for (const [i, r] of NEW_REGULARS.entries()) expect([0, 1, 2, 3].map((m) => chainVisits(i, m))).toEqual(MILESTONE_VISITS[r.id]);
    // Summing visits along a chain (each successor starts after their predecessor's milestone 4) lands on chainVisits.
    for (let i = 0; i < NEW_REGULARS.length; i++) {
      let before = MILESTONE_VISITS[NEW_REGULARS[i]!.id]![3];
      for (let g = 1; g <= 20; g++) {
        const k = 8 * (g - 1) + i;
        const v = generatedVisits(k);
        for (let m = 0; m < MILESTONE_COUNT; m++) expect(before + v[m]!, `${k} m${m}`).toBe(chainVisits(i, 4 * g + m));
        before += v[3];
      }
    }
  });

  it('chains successors by data: season-2 i → generated i → i + 8 → ...; ids round-trip', () => {
    for (const [i, r] of NEW_REGULARS.entries()) expect(chainSuccessor(r.id)).toBe(generatedId(i));
    expect(chainSuccessor(generatedId(5))).toBe(generatedId(13));
    for (const r of REGULARS) expect(chainSuccessor(r.id)).toBeUndefined();
    expect(chainSuccessor('nobody')).toBeUndefined();
    for (const k of [0, 7, 8, 123, 99999]) expect(generatedIndex(generatedId(k))).toBe(k);
    for (const bad of ['gen_', 'gen_01', 'gen_-1', 'gen_1x', 'co_lan', 'xgen_1']) expect(generatedIndex(bad), bad).toBe(-1);
    expect(regularById('gen_01')).toBeUndefined();
  });
});

/**
 * A game on day 3's morning where every first-eight regular has been followed
 * by a season-2 one (newRegularOrder), each `s2Visits(id)` visits in, last seen
 * day 2.
 */
function gameWith(seed: number, s2Visits: (id: string) => number, extra: Record<string, RegularVisits> = {}): GameState {
  const state = createNewGame('Quán E32', 'normal', seed);
  for (let day = 1; day <= 2; day++) {
    if (day > 1) expect(dispatch(state, { type: 'next_day' })).toBe(true);
    dispatch(state, { type: 'apply_restock' });
    playDay(state);
  }
  expect(dispatch(state, { type: 'next_day' })).toBe(true);
  const order = newRegularOrder(seed);
  state.regulars = {
    ...Object.fromEntries(REGULARS.map((r, i) => [r.id, { visits: MILESTONE_VISITS[r.id]![3] + 30, firstDay: 2, lastDay: 1, keptMilestones: 0, succeededBy: order[i] }])),
    ...Object.fromEntries(order.map((id) => [id, { visits: s2Visits(id), firstDay: 2, lastDay: 2, keptMilestones: 0 }])),
    ...extra,
  };
  state.events = [];
  return state;
}

interface DayLog {
  arrived: Extract<GameEvent, { type: 'regular_arrived' }>[];
  milestones: Extract<GameEvent, { type: 'regular_milestone' }>[];
  milestoneTem: number;
  shape: { money: number; a: number; s: number; r: number; c: number; named: number };
}

function playDays(state: GameState, days: number): DayLog[] {
  const log: DayLog[] = [];
  for (let d = 0; d < days; d++) {
    if (state.phase === 'report') expect(dispatch(state, { type: 'next_day' })).toBe(true);
    dispatch(state, { type: 'apply_restock' });
    const events = playDay(state);
    const arrived = events.filter((e): e is DayLog['arrived'][number] => e.type === 'regular_arrived');
    log.push({
      arrived,
      milestones: events.filter((e): e is DayLog['milestones'][number] => e.type === 'regular_milestone'),
      milestoneTem: events.reduce((n, e) => n + (e.type === 'tickets_earned' && e.reason === 'regular_milestone' ? e.amount : 0), 0),
      shape: {
        money: state.money,
        a: state.today.customersArrived,
        s: state.today.customersServed,
        r: state.today.regularsServed ?? 0,
        c: Object.values(state.today.sold).reduce((n, v) => n + (v ?? 0), 0),
        named: arrived.length,
      },
    });
  }
  return log;
}

describe('E-32 season 3+ regulars: moving in', { timeout: 120_000 }, () => {
  const SEED = 3232;
  const DAYS = 12;
  /** Every season-2 regular one visit short of milestone 4. */
  const nearDone = (id: string) => MILESTONE_VISITS[id]![3] - 1;

  it('moves generated regular i in once season-2 regular i completes milestone 4; they come instead from the next visit', () => {
    const state = gameWith(SEED, nearDone);
    const log = playDays(state, DAYS);
    const all = log.flatMap((d, i) => d.arrived.map((e) => ({ ...e, day: i })));
    const completedDay = new Map<string, number>();
    for (const [i, d] of log.entries()) for (const m of d.milestones) if (m.milestone === 4) completedDay.set(m.regularId, i);
    expect(completedDay.size).toBeGreaterThan(0);
    let movedIn = 0;
    for (const [i, r] of NEW_REGULARS.entries()) {
      const next = state.regulars![r.id]!.succeededBy;
      if (!next) continue;
      movedIn += 1;
      expect(next).toBe(generatedId(i));
      const done = completedDay.get(r.id)!;
      expect(all.filter((e) => e.regularId === r.id).every((e) => e.day <= done), r.id).toBe(true);
      const theirs = all.filter((e) => e.regularId === next);
      expect(theirs.length, next).toBeGreaterThan(0);
      expect(theirs[0]!.day).toBeGreaterThan(done);
      expect(theirs.map((e) => e.visits)).toEqual(theirs.map((_, k) => k + 1));
      expect(state.regulars![next]!.keptMilestones).toBe(0);
    }
    expect(movedIn).toBeGreaterThan(0);
    // The book and the Khách quen card show them after season 2, latest move-ins flagged "Mới".
    const moved = movedInRegulars(state).map((r) => r.id);
    expect(moved.slice(0, NEW_REGULARS.length)).toEqual(newRegularOrder(SEED));
    const generated = moved.slice(NEW_REGULARS.length);
    expect(generated).toHaveLength(movedIn);
    expect(regularBook(state).map((p) => p.regular.id)).toEqual([...REGULARS.map((r) => r.id), ...moved]);
    expect(regularRows(state).map((r) => r.id)).toEqual(expect.arrayContaining(generated));
    for (const id of generated) expect(isNewRegular(state, id), id).toBe(state.day - state.regulars![id]!.firstDay < NEW_REGULAR_DAYS);
    const fresh = gameWith(SEED, nearDone);
    playDays(fresh, 3);
    const freshMoved = movedInRegulars(fresh).slice(NEW_REGULARS.length);
    expect(freshMoved.length).toBeGreaterThan(0);
    for (const r of freshMoved) expect(isNewRegular(fresh, r.id), r.id).toBe(true);
    for (const d of log) expect(new Set(d.arrived.map((e) => e.regularId)).size).toBe(d.arrived.length);
  });

  it('changes nothing but names and Tem: same arrivals, served, regulars served, cups and money as a game without move-ins', () => {
    const withMoveIns = playDays(gameWith(SEED, nearDone), DAYS);
    const without = playDays(gameWith(SEED, (id) => MILESTONE_VISITS[id]![0] - 5), DAYS);
    expect(withMoveIns.map((d) => d.shape)).toEqual(without.map((d) => d.shape));
    expect(withMoveIns.some((d) => d.arrived.some((e) => generatedIndex(e.regularId) >= 0))).toBe(true);
  });

  it('chains on: generated regular k is followed by k + 8, whose milestone pays its Tem once', () => {
    const order = newRegularOrder(SEED);
    // Every slot two generations on: season 2 done, generated i one visit short of milestone 4.
    const extra: Record<string, RegularVisits> = {};
    for (const id of order) {
      const i = NEW_REGULARS.findIndex((r) => r.id === id);
      extra[id] = { visits: MILESTONE_VISITS[id]![3] + 5, firstDay: 2, lastDay: 1, keptMilestones: 0, succeededBy: generatedId(i) };
      extra[generatedId(i)] = { visits: generatedVisits(i)[3] - 1, firstDay: 2, lastDay: 2, keptMilestones: 0 };
    }
    const state = gameWith(SEED, () => 0, extra);
    const log = playDays(state, 4);
    const third = NEW_REGULARS.map((_, i) => state.regulars![generatedId(i)]!.succeededBy).filter(Boolean);
    expect(third.length).toBeGreaterThan(0);
    for (const id of third) expect(generatedIndex(id!)).toBeGreaterThanOrEqual(NEW_REGULARS.length);
    const next = third[0]!;
    state.regulars![next]!.visits = generatedVisits(generatedIndex(next))[0] - 1;
    const later = playDays(state, 6);
    const theirs = later.flatMap((d) => d.milestones).filter((m) => m.regularId === next);
    expect(theirs).toEqual([{ type: 'regular_milestone', regularId: next, milestone: 1, visits: generatedVisits(generatedIndex(next))[0], tickets: MILESTONE_TICKETS[0] }]);
    // Only milestone Tem: each milestone of these days paid its MILESTONE_TICKETS, nothing else under that reason.
    for (const d of [...log, ...later]) expect(d.milestoneTem).toBe(d.milestones.reduce((n, m) => n + MILESTONE_TICKETS[m.milestone - 1]!, 0));
  });
});
