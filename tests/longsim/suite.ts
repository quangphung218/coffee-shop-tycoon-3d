import { afterAll, describe, expect, it } from 'vitest';
import { weekIndex } from '../../src/sim/progression';
import type { Difficulty } from '../../src/sim/types';
import { STRATEGIES, WEEKS, allStylesWeek, avgScore, inWeeks, playWeeks, share, summary, type DayHook, type StrategyName, type WeekRow, type WeekRows } from './run';

/**
 * E-19 40-week sim for one difficulty and some seeds: 1 and 42 in
 * normal.sim.ts and easy.sim.ts, 7 and 2026 in normal2.sim.ts and
 * easy2.sim.ts, which vitest runs side by side under `npm run sim:long` (the
 * *.sim.ts name keeps them out of `npm run check`); hard.sim.ts only with
 * LONGSIM_HARD=1. Prints one line per seed and strategy: cups, avg score and
 * challenge completion are reported only.
 * Asserted (not on Hard): the E-16 bots never go bankrupt, b_steady opens
 * every challenge-gated style before week 30 on seeds 1 and 42,
 * `determinismSeed` replayed gives the same challenges and goals, and the
 * E-21 promise on every seed (assertPromise). E-22: b_steady2's regular
 * milestones spread over the weeks on every seed (assertMilestones), and
 * replayed come in the same order.
 */

/** Node's stdout and env (the tsconfig has no Node types); vitest drops console output of afterAll here. */
declare const process: { stdout: { write(text: string): boolean }; env: Record<string, string | undefined> };

/** Seeds the style unlock is asserted on (E-19); the others are reported only. */
const STYLE_SEEDS = [1, 42];
/** The E-16 bots, which must stay solvent; the E-21 bots are measured only. */
const BASELINE: readonly StrategyName[] = ['c_spend', 'b_steady'];
const STYLES_BEFORE_WEEK = 30;
/** Steady play (b_steady2): weeks 21-40 mostly exactly 2 cups (E-21); 1-staff b_steady is reported only. */
const STEADY_TWO_CUPS_MIN = 0.7;
const STEADY_THREE_CUPS_MAX = 0.3;
const STEADY_BELOW_TWO_MAX = 0.1;
/** Managed play: weeks 21-40 mostly 3 cups, and well above b_steady2's average score. */
const MANAGE_THREE_CUPS_MIN = 0.7;
const MANAGE_SCORE_LEAD = 8;

/**
 * E-21 promise on weeks 21-40 of one seed, with the SIZE_GOAL table:
 * b_steady2 scores exactly 2 cups in at least 70% of the weeks, 3 cups in at
 * most 30% and below 2 in at most 10%; d_manage scores 3 cups in at least 70%
 * and averages at least 8 points more than b_steady2 over those weeks.
 */
function assertPromise(label: string, run: (name: StrategyName) => WeekRows): void {
  const late = (name: StrategyName) => inWeeks(run(name), 21, 40);
  const steady = late('b_steady2');
  expect(steady, `${label} b_steady2 weeks 21-40`).toHaveLength(20);
  expect(share(steady, (r) => r.cups === 2), `${label} b_steady2 exactly 2 cups`).toBeGreaterThanOrEqual(STEADY_TWO_CUPS_MIN);
  expect(share(steady, (r) => r.cups === 3), `${label} b_steady2 3 cups`).toBeLessThanOrEqual(STEADY_THREE_CUPS_MAX);
  expect(share(steady, (r) => r.cups < 2), `${label} b_steady2 below 2 cups`).toBeLessThanOrEqual(STEADY_BELOW_TWO_MAX);
  const manage = late('d_manage');
  expect(manage, `${label} d_manage weeks 21-40`).toHaveLength(20);
  expect(share(manage, (r) => r.cups === 3), `${label} d_manage 3 cups`).toBeGreaterThanOrEqual(MANAGE_THREE_CUPS_MIN);
  expect(avgScore(manage) - avgScore(steady), `${label} d_manage lead over b_steady2`).toBeGreaterThanOrEqual(MANAGE_SCORE_LEAD);
}

/** E-22 Sổ khách quen spread for b_steady2: a milestone in at least 60% of weeks 5-40, never more than 3 in one week. */
const MILESTONE_FROM_WEEK = 5;
const MILESTONE_WEEKS_MIN = 0.6;
const MILESTONES_PER_WEEK_MAX = 3;

/** One 'regular_milestone' of a run: `week:regularId:milestone`. */
type Milestones = string[];

/** Day hook that records the run's regular milestones. */
const recordMilestones =
  (into: Milestones): DayHook =>
  (state, events) => {
    for (const e of events) if (e.type === 'regular_milestone') into.push(`${weekIndex(state)}:${e.regularId}:${e.milestone}`);
  };

/** Milestones per week 1..WEEKS. */
const milestonesPerWeek = (milestones: Milestones) => {
  const counts = Array<number>(WEEKS).fill(0);
  for (const m of milestones) counts[Number(m.split(':')[0]) - 1]! += 1;
  return counts;
};

function milestoneLine(label: string, milestones: Milestones): string {
  const counts = milestonesPerWeek(milestones);
  const late = counts.slice(MILESTONE_FROM_WEEK - 1);
  return `${label} milestones w${MILESTONE_FROM_WEEK}-${WEEKS} ${late.filter((n) => n > 0).length}/${late.length} | max/week ${Math.max(...counts)} | per week ${counts.join('')}`;
}

function assertMilestones(label: string, milestones: Milestones): void {
  const counts = milestonesPerWeek(milestones);
  const late = counts.slice(MILESTONE_FROM_WEEK - 1);
  expect(late.filter((n) => n > 0).length / late.length, `${label} b_steady2 weeks with a milestone`).toBeGreaterThanOrEqual(MILESTONE_WEEKS_MIN);
  expect(Math.max(...counts), `${label} b_steady2 milestones in one week`).toBeLessThanOrEqual(MILESTONES_PER_WEEK_MAX);
}
const TIMEOUT = 1_200_000;

/** What must repeat for a seed: each week's challenge with its target, and the goal. */
const sequence = (rows: WeekRow[]) => rows.map((r) => [r.week, r.challenge, r.challengeGoal, r.revenueTarget, r.profitTarget]);

export interface LongSimOptions {
  seeds: number[];
  /** Seed replayed with b_steady for the determinism check; none when unset. */
  determinismSeed?: number;
  /** Report only, nothing asserted (Hard). */
  measureOnly?: boolean;
}

/** Hard runs only on demand: `LONGSIM_HARD=1 npm run sim:long -- hard`. */
export const hardEnabled = () => process.env.LONGSIM_HARD === '1';

export function longSim(difficulty: Difficulty, { seeds, determinismSeed, measureOnly = false }: LongSimOptions): void {
  const runs = new Map<string, WeekRows>();
  /** b_steady2's regular milestones per seed. */
  const milestones = new Map<number, Milestones>();
  const run = (seed: number, name: StrategyName): WeekRows => {
    const key = `${seed}/${name}`;
    let rows = runs.get(key);
    if (!rows) {
      const reached: Milestones = [];
      rows = playWeeks(difficulty, seed, STRATEGIES[name], WEEKS, name === 'b_steady2' ? recordMilestones(reached) : undefined);
      if (name === 'b_steady2') milestones.set(seed, reached);
      runs.set(key, rows);
    }
    return rows;
  };

  describe(`E-19 40 weeks, ${difficulty}`, () => {
    afterAll(() => {
      const lines = [...runs].map(([key, rows]) => summary(`${difficulty} s${key.replace('/', ' ')}`, rows));
      for (const [seed, reached] of milestones) lines.push(milestoneLine(`${difficulty} s${seed} b_steady2`, reached));
      process.stdout.write(`\n${lines.join('\n')}\n\n`);
    });

    for (const seed of seeds) {
      it(`seed ${seed}: every bot plays ${WEEKS} weeks`, { timeout: TIMEOUT }, () => {
        for (const name of Object.keys(STRATEGIES) as StrategyName[]) run(seed, name);
        if (measureOnly) return;
        for (const name of BASELINE) expect(run(seed, name).bankruptDay, `${difficulty} seed ${seed} ${name} bankrupt`).toBeUndefined();
        assertPromise(`${difficulty} seed ${seed}`, (name) => run(seed, name));
        assertMilestones(`${difficulty} seed ${seed}`, milestones.get(seed)!);
        if (!STYLE_SEEDS.includes(seed)) return;
        const week = allStylesWeek(run(seed, 'b_steady'));
        expect(week, `${difficulty} seed ${seed} b_steady all styles`).not.toBeNull();
        expect(week!).toBeLessThan(STYLES_BEFORE_WEEK);
      });
    }

    if (determinismSeed !== undefined) {
      it(`seed ${determinismSeed}: same seed, same challenges and goals`, { timeout: TIMEOUT }, () => {
        const again = playWeeks(difficulty, determinismSeed, STRATEGIES.b_steady);
        expect(sequence(again)).toEqual(sequence(run(determinismSeed, 'b_steady')));
      });

      it(`seed ${determinismSeed}: same seed, same regular milestones in the same order`, { timeout: TIMEOUT }, () => {
        run(determinismSeed, 'b_steady2');
        const again: Milestones = [];
        playWeeks(difficulty, determinismSeed, STRATEGIES.b_steady2, WEEKS, recordMilestones(again));
        expect(again.length, `${difficulty} seed ${determinismSeed} b_steady2 milestones`).toBeGreaterThan(0);
        expect(again).toEqual(milestones.get(determinismSeed));
      });
    }
  });
}
