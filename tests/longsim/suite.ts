import { afterAll, describe, expect, it } from 'vitest';
import type { Difficulty } from '../../src/sim/types';
import { STRATEGIES, allStylesWeek, playWeeks, summary, type StrategyName, type WeekRow } from './run';

/**
 * E-19 40-week sim for one difficulty, seeds 1 and 42 (normal.sim.ts and
 * easy.sim.ts, which vitest runs side by side under `npm run sim:long`; the
 * *.sim.ts name keeps them out of `npm run check`). Prints one line per seed
 * and strategy: cups share and challenge completion are reported only.
 * Asserted: b_steady opens every challenge-gated style before week 30, and
 * `determinismSeed` replayed gives the same challenges and goals.
 */

/** Node's stdout (the tsconfig has no Node types); vitest drops console output of afterAll here. */
declare const process: { stdout: { write(text: string): boolean } };

const SEEDS = [1, 42];
const STYLES_BEFORE_WEEK = 30;
const TIMEOUT = 600_000;

/** What must repeat for a seed: each week's challenge with its target, and the goal. */
const sequence = (rows: WeekRow[]) => rows.map((r) => [r.week, r.challenge, r.challengeGoal, r.revenueTarget, r.profitTarget]);

export function longSim(difficulty: Difficulty, determinismSeed: number): void {
  const runs = new Map<string, WeekRow[]>();
  const run = (seed: number, name: StrategyName): WeekRow[] => {
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

    for (const seed of SEEDS) {
      it(`seed ${seed}: b_steady opens every style before week ${STYLES_BEFORE_WEEK}`, { timeout: TIMEOUT }, () => {
        for (const name of Object.keys(STRATEGIES) as StrategyName[]) run(seed, name);
        const week = allStylesWeek(run(seed, 'b_steady'));
        expect(week, `${difficulty} seed ${seed} b_steady all styles`).not.toBeNull();
        expect(week!).toBeLessThan(STYLES_BEFORE_WEEK);
      });
    }

    it(`seed ${determinismSeed}: same seed, same challenges and goals`, { timeout: TIMEOUT }, () => {
      const again = playWeeks(difficulty, determinismSeed, STRATEGIES.b_steady);
      expect(sequence(again)).toEqual(sequence(run(determinismSeed, 'b_steady')));
    });
  });
}
