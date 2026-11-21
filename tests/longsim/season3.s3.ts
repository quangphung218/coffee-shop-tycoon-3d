import { afterAll, describe, expect, it } from 'vitest';
import { weekIndex } from '../../src/sim/progression';
import { STRATEGIES, playWeeks } from './run';

/**
 * E-32 endless regulars (season N+1 chaining): b_steady2 on Normal plays 100
 * weeks on seeds 1, 42, 7 and 2026. Asserted per seed: at least 60% of weeks
 * 60-100 have a regular milestone and no week 60-100 has more than 3. Prints
 * one parseable S3TABLE row per seed with the milestone count of each week
 * 60-100 and one S3CUPS row per seed with the cups of every week 1-100.
 * Runs with `npm run sim:long:s3` only (the *.s3.ts name keeps it out of
 * `npm run check`, `npm run sim:long` and `npm run sim:long:s2`).
 * LONGSIM_SEED=<n> runs only that seed.
 */

/** Node's stdout and env (the tsconfig has no Node types); vitest drops console output of afterAll here. */
declare const process: { stdout: { write(text: string): boolean }; env: Record<string, string | undefined> };

const ONLY_SEED = process.env.LONGSIM_SEED;
const SEEDS = [1, 42, 7, 2026].filter((s) => ONLY_SEED === undefined || String(s) === ONLY_SEED);
const WEEKS = 100;
const FROM_WEEK = 60;
const MILESTONE_WEEKS_MIN = 0.6;
const MILESTONES_PER_WEEK_MAX = 3;
const TIMEOUT = 3_600_000;

describe(`E-32 endless regulars: b_steady2 ${WEEKS} weeks, normal`, () => {
  const tables = new Map<number, number[]>();
  const cups = new Map<number, number[]>();

  afterAll(() => {
    const weeks = Array.from({ length: WEEKS - FROM_WEEK + 1 }, (_, i) => FROM_WEEK + i);
    const lines = [`S3TABLE seed | ${weeks.map((w) => `w${w}`).join(' ')} | weeks>=1 | max`];
    for (const [seed, counts] of tables) {
      const late = counts.slice(FROM_WEEK - 1);
      lines.push(`S3TABLE s${seed} | ${late.join(' ')} | ${late.filter((n) => n > 0).length}/${late.length} | ${Math.max(...late)}`);
    }
    for (const [seed, c] of cups) lines.push(`S3CUPS s${seed} | ${c.join('')}`);
    process.stdout.write(`\n${lines.join('\n')}\n\n`);
  });

  for (const seed of SEEDS) {
    it(`seed ${seed}: milestones in >=60% of weeks ${FROM_WEEK}-${WEEKS}, never more than 3 a week`, { timeout: TIMEOUT }, () => {
      const counts = Array<number>(WEEKS).fill(0);
      const rows = playWeeks('normal', seed, STRATEGIES.b_steady2, WEEKS, (state, events) => {
        for (const e of events) if (e.type === 'regular_milestone') counts[weekIndex(state) - 1]! += 1;
      });
      tables.set(seed, counts);
      cups.set(seed, rows.map((r) => r.cups));
      expect(rows.bankruptDay, `seed ${seed} b_steady2 bankrupt`).toBeUndefined();
      expect(rows, `seed ${seed} b_steady2 weeks`).toHaveLength(WEEKS);
      const late = counts.slice(FROM_WEEK - 1);
      expect(late.filter((n) => n > 0).length / late.length, `seed ${seed} weeks ${FROM_WEEK}-${WEEKS} with a milestone`).toBeGreaterThanOrEqual(MILESTONE_WEEKS_MIN);
      expect(Math.max(...late), `seed ${seed} milestones in one week ${FROM_WEEK}-${WEEKS}`).toBeLessThanOrEqual(MILESTONES_PER_WEEK_MAX);
    });
  }
});
