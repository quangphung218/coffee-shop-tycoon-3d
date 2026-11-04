import { afterAll, describe, expect, it } from 'vitest';
import { weekIndex } from '../../src/sim/progression';
import { STRATEGIES, playWeeks } from './run';

/**
 * E-27 season 2 of the Sổ khách quen: b_steady2 on Normal plays 60 weeks on
 * seeds 1, 42, 7 and 2026. Asserted per seed: at least 60% of weeks 40-60
 * have a regular milestone and no week has more than 3. Prints one parseable
 * row per seed with the milestone count of each week 40-60.
 * Runs with `npm run sim:long:s2` only (the *.s2.ts name keeps it out of
 * `npm run check` and `npm run sim:long`).
 */

/** Node's stdout (the tsconfig has no Node types); vitest drops console output of afterAll here. */
declare const process: { stdout: { write(text: string): boolean } };

const SEEDS = [1, 42, 7, 2026];
const WEEKS = 60;
const FROM_WEEK = 40;
const MILESTONE_WEEKS_MIN = 0.6;
const MILESTONES_PER_WEEK_MAX = 3;
const TIMEOUT = 1_800_000;

describe(`E-27 season 2: b_steady2 ${WEEKS} weeks, normal`, () => {
  const tables = new Map<number, number[]>();

  afterAll(() => {
    const weeks = Array.from({ length: WEEKS - FROM_WEEK + 1 }, (_, i) => FROM_WEEK + i);
    const lines = [`S2TABLE seed | ${weeks.map((w) => `w${w}`).join(' ')} | weeks>=1 | max`];
    for (const [seed, counts] of tables) {
      const late = counts.slice(FROM_WEEK - 1);
      lines.push(`S2TABLE s${seed} | ${late.join(' ')} | ${late.filter((n) => n > 0).length}/${late.length} | ${Math.max(...late)}`);
    }
    process.stdout.write(`\n${lines.join('\n')}\n\n`);
  });

  for (const seed of SEEDS) {
    it(`seed ${seed}: milestones in >=60% of weeks ${FROM_WEEK}-${WEEKS}, never more than 3 a week`, { timeout: TIMEOUT }, () => {
      const counts = Array<number>(WEEKS).fill(0);
      const rows = playWeeks('normal', seed, STRATEGIES.b_steady2, WEEKS, (state, events) => {
        for (const e of events) if (e.type === 'regular_milestone') counts[weekIndex(state) - 1]! += 1;
      });
      tables.set(seed, counts);
      expect(rows.bankruptDay, `seed ${seed} b_steady2 bankrupt`).toBeUndefined();
      expect(rows, `seed ${seed} b_steady2 weeks`).toHaveLength(WEEKS);
      const late = counts.slice(FROM_WEEK - 1);
      expect(late.filter((n) => n > 0).length / late.length, `seed ${seed} weeks ${FROM_WEEK}-${WEEKS} with a milestone`).toBeGreaterThanOrEqual(MILESTONE_WEEKS_MIN);
      expect(Math.max(...late), `seed ${seed} milestones in one week ${FROM_WEEK}-${WEEKS}`).toBeLessThanOrEqual(MILESTONES_PER_WEEK_MAX);
    });
  }
});
