import { afterAll, describe, expect, it } from 'vitest';
import type { Difficulty } from '../../src/sim/types';
import { STRATEGIES, WEEKS, allStylesWeek, playWeeks, summary, type StrategyName, type WeekRow, type WeekRows } from './run';

/**
 * E-19 40-week sim for one difficulty and some seeds: 1 and 42 in
 * normal.sim.ts and easy.sim.ts, 7 and 2026 in normal2.sim.ts and
 * easy2.sim.ts, which vitest runs side by side under `npm run sim:long` (the
 * *.sim.ts name keeps them out of `npm run check`); hard.sim.ts only with
 * LONGSIM_HARD=1. Prints one line per seed and strategy: cups, avg score and
 * challenge completion are reported only.
 * Asserted (not on Hard): the E-16 bots never go bankrupt, b_steady opens
 * every challenge-gated style before week 30 on seeds 1 and 42, and
 * `determinismSeed` replayed gives the same challenges and goals.
 */

/** Node's stdout and env (the tsconfig has no Node types); vitest drops console output of afterAll here. */
declare const process: { stdout: { write(text: string): boolean }; env: Record<string, string | undefined> };

/** Seeds the style unlock is asserted on (E-19); the others are reported only. */
const STYLE_SEEDS = [1, 42];
/** The E-16 bots, which must stay solvent; the E-21 bots are measured only. */
const BASELINE: readonly StrategyName[] = ['c_spend', 'b_steady'];
const STYLES_BEFORE_WEEK = 30;
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
  const run = (seed: number, name: StrategyName): WeekRows => {
    const key = `${seed}/${name}`;
    let rows = runs.get(key);
    if (!rows) {
      rows = playWeeks(difficulty, seed, STRATEGIES[name]);
      runs.set(key, rows);
    }
    return rows;
  };

  describe(`E-19 40 weeks, ${difficulty}`, () => {
    afterAll(() => {
      const lines = [...runs].map(([key, rows]) => summary(`${difficulty} s${key.replace('/', ' ')}`, rows));
      process.stdout.write(`\n${lines.join('\n')}\n\n`);
    });

    for (const seed of seeds) {
      it(`seed ${seed}: every bot plays ${WEEKS} weeks`, { timeout: TIMEOUT }, () => {
        for (const name of Object.keys(STRATEGIES) as StrategyName[]) run(seed, name);
        if (measureOnly) return;
        for (const name of BASELINE) expect(run(seed, name).bankruptDay, `${difficulty} seed ${seed} ${name} bankrupt`).toBeUndefined();
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
    }
  });
}
