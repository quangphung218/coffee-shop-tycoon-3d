import { describe, expect, it } from 'vitest';
import { MILESTONE_COUNT, MILESTONE_VISITS, REGULAR_BOOK } from '../../src/sim/data/regularMilestones';
import { weekIndex } from '../../src/sim/progression';
import { STRATEGIES, WEEKS, playWeeks } from '../longsim/run';

/**
 * E-18/E-22 Sổ khách quen over a long game: plays 40 weeks on Normal, seeds 1
 * and 42, as the longsim's b_steady2 (tests/longsim/run.ts), and records each
 * 'regular_milestone' with its week. The staggered thresholds in
 * src/sim/data/regularMilestones.ts must put a milestone in at least 60% of
 * weeks 5–40 and never more than 3 in one week; visits, customers and scoring
 * are not touched for them.
 */

const SEEDS = [1, 42];
const SPREAD_FROM_WEEK = 5;
const SPREAD_MIN_SHARE = 0.6;
const MAX_PER_WEEK = 3;

interface Reached {
  regularId: string;
  milestone: number;
  day: number;
  week: number;
  tickets: number;
}

interface Run {
  reached: Reached[];
  /** Tem paid by 'tickets_earned' with reason 'regular_milestone'. */
  tem: number;
}

function play(seed: number): Run {
  const run: Run = { reached: [], tem: 0 };
  const rows = playWeeks('normal', seed, STRATEGIES.b_steady2, WEEKS, (state, events) => {
    for (const e of events) {
      if (e.type === 'regular_milestone') run.reached.push({ regularId: e.regularId, milestone: e.milestone, day: state.day, week: weekIndex(state), tickets: e.tickets });
      if (e.type === 'tickets_earned' && e.reason === 'regular_milestone') run.tem += e.amount;
    }
  });
  expect(rows.bankruptDay, `seed ${seed} bankrupt`).toBeUndefined();
  return run;
}

/** Milestones per week 1..WEEKS. */
const perWeek = (run: Run) => Array.from({ length: WEEKS }, (_, i) => run.reached.filter((r) => r.week === i + 1).length);

describe('E-22 regular milestones: 40 weeks, Normal, b_steady2, seeds 1 and 42', { timeout: 600_000 }, () => {
  const runs = SEEDS.map(play);

  it('prints the milestones per week', () => {
    for (const [i, run] of runs.entries()) {
      const counts = perWeek(run);
      const spread = counts.slice(SPREAD_FROM_WEEK - 1).filter((n) => n > 0).length;
      console.log(
        `seed ${SEEDS[i]} (${Object.entries(MILESTONE_VISITS).map(([id, v]) => `${id} ${v.join('/')}`).join(', ')})\n` +
          `per week: ${counts.map((n, w) => `w${w + 1}:${n}`).join(' ')}\n` +
          `weeks ${SPREAD_FROM_WEEK}-${WEEKS} with a milestone: ${spread}/${WEEKS - SPREAD_FROM_WEEK + 1}, max ${Math.max(...counts)}, reached ${run.reached.length}, Tem ${run.tem}`,
      );
    }
  });

  it(`puts a milestone in at least ${SPREAD_MIN_SHARE * 100}% of weeks ${SPREAD_FROM_WEEK}-${WEEKS}, never more than ${MAX_PER_WEEK} a week`, () => {
    for (const [i, run] of runs.entries()) {
      const counts = perWeek(run);
      const late = counts.slice(SPREAD_FROM_WEEK - 1);
      expect(late.filter((n) => n > 0).length / late.length, `seed ${SEEDS[i]}`).toBeGreaterThanOrEqual(SPREAD_MIN_SHARE);
      expect(Math.max(...counts), `seed ${SEEDS[i]}`).toBeLessThanOrEqual(MAX_PER_WEEK);
    }
  });

  it('reaches each milestone at most once and in order, milestones 1–3 of every regular within 40 weeks', () => {
    for (const [i, run] of runs.entries()) {
      const keys = run.reached.map((r) => `${r.regularId}:${r.milestone}`);
      expect(new Set(keys).size, `seed ${SEEDS[i]}`).toBe(keys.length);
      for (const e of REGULAR_BOOK) {
        const mine = run.reached.filter((r) => r.regularId === e.regularId).map((r) => r.milestone);
        expect(mine, `seed ${SEEDS[i]} ${e.regularId}`).toEqual(Array.from({ length: mine.length }, (_, k) => k + 1));
        expect(mine.length, `seed ${SEEDS[i]} ${e.regularId}`).toBeGreaterThanOrEqual(MILESTONE_COUNT - 1);
      }
    }
  });

  it('pays the milestone Tem once per milestone', () => {
    for (const run of runs) expect(run.tem).toBe(run.reached.reduce((s, r) => s + r.tickets, 0));
  });

  it('gives the same milestone order when a seed is played again', () => {
    for (const [i, seed] of SEEDS.entries()) expect(play(seed).reached).toEqual(runs[i]!.reached);
  });
});
