import { afterAll, describe, expect, it } from 'vitest';
import { weekIndex } from '../../src/sim/progression';
import type { Difficulty } from '../../src/sim/types';
import { STRATEGIES, WEEKS, allStylesWeek, avgScore, inWeeks, playWeeks, share, styleSeasons, summary, type DayHook, type StrategyName, type WeekRow, type WeekRows } from './run';

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
 * replayed come in the same order. E-24: a2 and a_manage (no upgrades) get
 * 3 cups in at most 10% of weeks 21-40; challenges-normal.sim.ts and
 * challenges-easy.sim.ts hold the mean challenge completion of weeks 21-40
 * over the 4 seeds to CHALLENGE_BANDS (challengeBands). E-26, Normal only:
 * b2_styles ends week 40 with at most STYLES_TEM_END_MAX Tem and bought
 * styles in at least STYLES_SEASONS_MIN seasons (assertStyles); the Tem held
 * each week by b_steady2 and b2_styles is printed.
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
/** E-24: shops that never upgrade (a2, a_manage) get 3 cups in at most 10% of weeks 21-40 (level floor). */
const NO_UPGRADE: readonly StrategyName[] = ['a2', 'a_manage'];
const NO_UPGRADE_THREE_CUPS_MAX = 0.1;

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
  for (const name of NO_UPGRADE) {
    const rows = late(name);
    expect(rows, `${label} ${name} weeks 21-40`).toHaveLength(20);
    expect(share(rows, (r) => r.cups === 3), `${label} ${name} 3 cups`).toBeLessThanOrEqual(NO_UPGRADE_THREE_CUPS_MAX);
  }
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

/** E-26: seasonal styles drain the Tem that piles up after the upgrades are done (Normal). */
const STYLES_TEM_END_MAX = 150;
const STYLES_SEASONS_MIN = 2;
const TEM_TABLE: readonly StrategyName[] = ['b_steady2', 'b2_styles'];

function assertStyles(label: string, rows: WeekRows): void {
  expect(rows, `${label} b2_styles weeks`).toHaveLength(WEEKS);
  expect(rows.at(-1)!.tem, `${label} b2_styles Tem at week ${WEEKS}`).toBeLessThanOrEqual(STYLES_TEM_END_MAX);
  expect(styleSeasons(rows).length, `${label} b2_styles seasons with a style bought`).toBeGreaterThanOrEqual(STYLES_SEASONS_MIN);
}

/** Tem held at the end of each week, and the seasons styles were bought in. */
const temLine = (label: string, rows: WeekRows) =>
  `${label} Tem by week ${rows.map((r) => r.tem).join(' ')} | styles bought ${rows.reduce((n, r) => n + r.stylesBought, 0)} in seasons [${styleSeasons(rows).join(',')}]`;

/**
 * E-24 part B: challenge completion over weeks 21-40, its mean over `seeds`
 * per bot. Single seeds may fall outside; only the mean is held to the band.
 */
const CHALLENGE_BANDS: Readonly<Partial<Record<StrategyName, readonly [number, number]>>> = {
  b_steady2: [0.4, 0.7],
  d_manage: [0.7, 0.95],
};

/**
 * Plays b_steady2 and d_manage on all of `seeds` (the seeds are split over
 * two files in longSim, so the 4-seed mean needs its own file) and asserts
 * each bot's mean challenge completion over weeks 21-40 is in CHALLENGE_BANDS.
 * Prints the per-seed rates.
 */
export function challengeBands(difficulty: Difficulty, seeds: number[]): void {
  describe(`E-24 challenges weeks 21-40, ${difficulty}`, () => {
    for (const [name, [min, max]] of Object.entries(CHALLENGE_BANDS) as [StrategyName, readonly [number, number]][]) {
      it(`${name}: mean completion over seeds ${seeds.join(', ')} in ${min * 100}-${max * 100}%`, { timeout: TIMEOUT }, () => {
        const rates = seeds.map((seed) => {
          const late = inWeeks(playWeeks(difficulty, seed, STRATEGIES[name], WEEKS), 21, 40).filter((r) => r.challenge);
          expect(late, `${difficulty} s${seed} ${name} challenges weeks 21-40`).toHaveLength(20);
          return share(late, (r) => r.completed);
        });
        const mean = rates.reduce((s, r) => s + r, 0) / rates.length;
        process.stdout.write(
          `\n${difficulty} ${name} ch21-40 ${seeds.map((s, i) => `s${s} ${Math.round(rates[i]! * 100)}%`).join(' ')} | mean ${Math.round(mean * 100)}%\n`,
        );
        expect(mean, `${difficulty} ${name} mean challenge completion weeks 21-40`).toBeGreaterThanOrEqual(min);
        expect(mean, `${difficulty} ${name} mean challenge completion weeks 21-40`).toBeLessThanOrEqual(max);
      });
    }
  });
}

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
      for (const [key, rows] of runs) if (TEM_TABLE.some((name) => key.endsWith(`/${name}`))) lines.push(temLine(`${difficulty} s${key.replace('/', ' ')}`, rows));
      process.stdout.write(`\n${lines.join('\n')}\n\n`);
    });

    for (const seed of seeds) {
      it(`seed ${seed}: every bot plays ${WEEKS} weeks`, { timeout: TIMEOUT }, () => {
        for (const name of Object.keys(STRATEGIES) as StrategyName[]) run(seed, name);
        if (measureOnly) return;
        for (const name of BASELINE) expect(run(seed, name).bankruptDay, `${difficulty} seed ${seed} ${name} bankrupt`).toBeUndefined();
        assertPromise(`${difficulty} seed ${seed}`, (name) => run(seed, name));
        assertMilestones(`${difficulty} seed ${seed}`, milestones.get(seed)!);
        if (difficulty === 'normal') assertStyles(`${difficulty} seed ${seed}`, run(seed, 'b2_styles'));
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
