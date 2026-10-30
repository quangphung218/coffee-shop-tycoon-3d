import { describe, expect, it } from 'vitest';
import { REGULARS, pickRegular } from '../../src/sim/data/regulars';
import { STAFF_NAMES } from '../../src/sim/data/staffNames';
import { dispatch } from '../../src/sim/index';
import { writeReview } from '../../src/sim/reviews';
import { createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState } from '../../src/sim/types';
import { playDay } from '../integration/helpers';

interface TwoDays {
  state: GameState;
  day1: GameEvent[];
  day2: GameEvent[];
}

/** Plays day 1 and day 2 of a new game, restocking each morning. */
function playTwoDays(seed: number, opts: { forget?: boolean } = {}): TwoDays {
  const state = createNewGame('Quán Quen', 'normal', seed);
  dispatch(state, { type: 'apply_restock' });
  const day1 = playDay(state);
  dispatch(state, { type: 'next_day' });
  dispatch(state, { type: 'apply_restock' });
  // `forget` wipes every trace of named regulars each minute, as if the feature were off.
  const forget = (s: GameState) => {
    delete s.regulars;
    for (const c of s.customers) delete c.regularId;
  };
  const day2 = playDay(state, opts.forget ? { onMinute: forget } : {});
  return { state, day1, day2 };
}

function arrivals(events: GameEvent[]) {
  return events.filter((e): e is Extract<GameEvent, { type: 'regular_arrived' }> => e.type === 'regular_arrived');
}

describe('named regulars', () => {
  const run = playTwoDays(2024);

  it('picks the same regular for the same seed and id, from a hash', () => {
    for (let id = 0; id < 50; id++) expect(pickRegular(2024, id)).toBe(pickRegular(2024, id));
    const picked = new Set(Array.from({ length: 200 }, (_, id) => pickRegular(2024, id).id));
    expect(picked.size).toBe(REGULARS.length);
  });

  it('has eight fixed regulars with unique ids and names', () => {
    expect(REGULARS).toHaveLength(8);
    expect(new Set(REGULARS.map((r) => r.id)).size).toBe(8);
    expect(new Set(REGULARS.map((r) => r.name)).size).toBe(8);
  });

  it('names nobody on day 1', () => {
    expect(arrivals(run.day1)).toHaveLength(0);
  });

  it('names regular-persona customers on day 2, each regular at most once', () => {
    const named = arrivals(run.day2);
    expect(named.length).toBeGreaterThan(0);
    expect(new Set(named.map((e) => e.regularId)).size).toBe(named.length);
    for (const e of named) {
      const c = run.state.customers.find((x) => x.id === e.customerId);
      if (c) {
        expect(c.persona).toBe('regular');
        expect(c.regularId).toBe(e.regularId);
      }
      expect(pickRegular(2024, e.customerId).id).toBe(e.regularId);
      expect(e.visits).toBe(1);
      expect(run.state.regulars![e.regularId]).toEqual({ visits: 1, firstDay: 2, lastDay: 2 });
    }
    expect(Object.keys(run.state.regulars!).sort()).toEqual(named.map((e) => e.regularId).sort());
  });

  it('comes right after the doorbell of the same customer', () => {
    const i = run.day2.findIndex((e) => e.type === 'regular_arrived');
    const e = run.day2[i] as Extract<GameEvent, { type: 'regular_arrived' }>;
    const bell = run.day2.slice(0, i).reverse().find((x) => x.type === 'doorbell');
    expect(bell).toEqual({ type: 'doorbell', customerId: e.customerId });
  });

  it('counts a second visit on a later day', () => {
    const fresh = playTwoDays(2024);
    const s = fresh.state;
    const first = arrivals(fresh.day2)[0]!;
    dispatch(s, { type: 'next_day' });
    dispatch(s, { type: 'apply_restock' });
    const day3 = arrivals(playDay(s));
    const again = day3.find((e) => e.regularId === first.regularId);
    if (again) {
      expect(again.visits).toBe(2);
      expect(s.regulars![first.regularId]).toEqual({ visits: 2, firstDay: 2, lastDay: 3 });
    } else {
      expect(s.regulars![first.regularId]!.lastDay).toBe(2);
    }
    expect(Object.values(s.regulars!).some((r) => r.visits === 2)).toBe(true);
  });

  it('leaves day 2 money, customers and the RNG exactly as before regulars existed', () => {
    // Captured from the build before named regulars (commit 9f662fd); the
    // money is less the rent of days 1 and 2, which came later (E-04).
    const before = {
      2024: { revenue: 2945000, served: 104, lost: 3, arrived: 107, rng: 3424022847, money: 5475000 },
      777: { revenue: 2785000, served: 102, lost: 6, arrived: 108, rng: 328784447, money: 5150000 },
    } as const;
    for (const seed of [2024, 777] as const) {
      const { state } = seed === 2024 ? run : playTwoDays(seed);
      const t = state.today;
      expect(state.day).toBe(2);
      expect({
        revenue: t.revenue,
        served: t.customersServed,
        lost: t.customersLost,
        arrived: t.customersArrived,
        rng: state.rngState,
        money: state.money + [...state.history, t].reduce((sum, d) => sum + (d.rent ?? 0), 0),
      }).toEqual(before[seed]);
    }
  });

  it('plays the same day 2 when every regular trace is wiped each minute', () => {
    const wiped = playTwoDays(2024, { forget: true });
    // regularsServed (E-16 challenge count) is itself a regular trace; everything else matches.
    const { regularsServed: _w, ...wipedToday } = wiped.state.today;
    const { regularsServed, ...runToday } = run.state.today;
    expect(regularsServed).toBeGreaterThan(0);
    expect(wipedToday).toEqual(runToday);
    expect(wiped.state.rngState).toBe(run.state.rngState);
    expect(wiped.state.reviews.map(({ author: _a, ...r }) => r)).toEqual(run.state.reviews.map(({ author: _a, ...r }) => r));
  });

  it('gives a regular the same look on every visit', () => {
    const s = createNewGame('Quán Quen', 'normal', 2024);
    const looks = new Map<string, number[]>();
    const seen = new Set<number>();
    const record = (st: GameState) => {
      for (const c of st.customers) {
        if (!c.regularId || seen.has(c.id)) continue;
        seen.add(c.id);
        looks.set(c.regularId, [...(looks.get(c.regularId) ?? []), c.look]);
      }
    };
    for (let day = 1; day <= 4; day++) {
      if (day > 1) dispatch(s, { type: 'next_day' });
      dispatch(s, { type: 'apply_restock' });
      playDay(s, { onMinute: record });
    }
    expect([...looks.values()].some((l) => l.length >= 2)).toBe(true);
    for (const [id, l] of looks) {
      const look = REGULARS.find((r) => r.id === id)!.look;
      expect(l).toEqual(l.map(() => look));
    }
  });

  it('plays the same day 2 whatever the customers look like', () => {
    const flat = createNewGame('Quán Quen', 'normal', 2024);
    dispatch(flat, { type: 'apply_restock' });
    playDay(flat);
    dispatch(flat, { type: 'next_day' });
    dispatch(flat, { type: 'apply_restock' });
    // Every look reset to 0 each minute: the look is drawn and shown but never read by the sim.
    playDay(flat, { onMinute: (st) => st.customers.forEach((c) => (c.look = 0)) });
    expect(flat.today).toEqual(run.state.today);
    expect(flat.rngState).toBe(run.state.rngState);
  });

  it('signs reviews with the regular name and keeps the RNG draw', () => {
    const named = createNewGame('Quán Quen', 'normal', 99);
    const plain = createNewGame('Quán Quen', 'normal', 99);
    const exp = { kind: 'served', waitShare: 0.1, dirtyTable: false, persona: 'regular' } as const;
    const a = writeReview(named, { ...exp, regularId: 'co_lan' });
    const b = writeReview(plain, exp);
    expect(a.author).toBe('Cô Lan');
    expect(STAFF_NAMES).toContain(b.author);
    expect({ ...a, author: '' }).toEqual({ ...b, author: '' });
    expect(named.rngState).toBe(plain.rngState);
  });

  it('falls back to a stand-in name for an unknown regular id', () => {
    const s = createNewGame('Quán Quen', 'normal', 99);
    expect(STAFF_NAMES).toContain(writeReview(s, { kind: 'angry', reason: 'long_wait', regularId: 'nobody' }).author);
  });

  it('signs day 2 reviews of named customers with their names', () => {
    const names = new Set(REGULARS.map((r) => r.name));
    const signed = run.day2.filter((e) => e.type === 'review' && names.has(e.review.author));
    expect(signed.length).toBeGreaterThan(0);
  });

  it('runs a save without regulars and starts the record on the next arrival', () => {
    const s = playTwoDays(777).state;
    delete s.regulars;
    for (const c of s.customers) delete c.regularId;
    const snapshot: GameState = JSON.parse(JSON.stringify(s));
    expect(snapshot.regulars).toBeUndefined();
    dispatch(snapshot, { type: 'next_day' });
    dispatch(snapshot, { type: 'apply_restock' });
    const day3 = arrivals(playDay(snapshot));
    expect(snapshot.phase).toBe('report');
    expect(day3.every((e) => e.visits === 1)).toBe(true);
    expect(Object.keys(snapshot.regulars ?? {})).toHaveLength(day3.length);
  });
});
