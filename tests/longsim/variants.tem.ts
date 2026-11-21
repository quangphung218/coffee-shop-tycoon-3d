import { afterAll, describe, expect, it } from 'vitest';
import { STRATEGIES, inWeeks, playWeeks, styleSeasons, type WeekRows } from './run';

/**
 * E-33 colour variants drain the Tem after every seasonal style is bought:
 * b2_styles on Normal plays 60 weeks on seeds 1, 42, 7 and 2026. Asserted per
 * seed: within weeks 41-60 at least one style (base or variant) is bought in
 * at least 2 different seasons, and the Tem held at the end of week 60 is at
 * most 250 (see TEM_END_MAX). Prints one parseable TEMTABLE row per seed with the Tem at the
 * end of weeks 40, 48, 56 and 60.
 * Runs with `npm run sim:long:tem` only (the *.tem.ts name keeps it out of
 * `npm run check`, `npm run sim:long`, `sim:long:s2` and `sim:long:s3`).
 * LONGSIM_SEED=<n> runs only that seed.
 */

/** Node's stdout and env (the tsconfig has no Node types); vitest drops console output of afterAll here. */
declare const process: { stdout: { write(text: string): boolean }; env: Record<string, string | undefined> };

const ONLY_SEED = process.env.LONGSIM_SEED;
const SEEDS = [1, 42, 7, 2026].filter((s) => ONLY_SEED === undefined || String(s) === ONLY_SEED);
const WEEKS = 60;
const FROM_WEEK = 41;
const SEASONS_MIN = 2;
/**
 * Owner decision Q-18 option A (E-33): the epic's week-60 band of <= 200 is
 * relaxed to <= 250 for b2_styles, Normal, seeds 1/42/7/2026. Measured Tem at
 * week 60 with the single price rule (variant Tem = base Tem x (1 + cycle)):
 * s1 203, s42 19, s7 205, s2026 166 (pre-epic v0.39.0: 503-519). No second
 * price rule and no tuning, per the T-124 stop rule.
 */
const TEM_END_MAX = 250;
const PRINT_WEEKS = [40, 48, 56, 60];
const TIMEOUT = 1_800_000;

describe(`E-33 variants: b2_styles ${WEEKS} weeks, normal`, () => {
  const runs = new Map<number, WeekRows>();

  afterAll(() => {
    const lines = [`TEMTABLE seed | ${PRINT_WEEKS.map((w) => `w${w}`).join(' ')} | bought w${FROM_WEEK}-${WEEKS} | seasons`];
    for (const [seed, rows] of runs) {
      const late = inWeeks(rows, FROM_WEEK, WEEKS);
      const tem = PRINT_WEEKS.map((w) => rows.find((r) => r.week === w)?.tem ?? '-');
      lines.push(`TEMTABLE s${seed} | ${tem.join(' ')} | ${late.reduce((n, r) => n + r.stylesBought, 0)} | [${styleSeasons(late).join(',')}]`);
    }
    process.stdout.write(`\n${lines.join('\n')}\n\n`);
  });

  for (const seed of SEEDS) {
    it(`seed ${seed}: styles bought in >=${SEASONS_MIN} seasons of weeks ${FROM_WEEK}-${WEEKS}, Tem at week ${WEEKS} <= ${TEM_END_MAX}`, { timeout: TIMEOUT }, () => {
      const rows = playWeeks('normal', seed, STRATEGIES.b2_styles, WEEKS);
      runs.set(seed, rows);
      expect(rows.bankruptDay, `seed ${seed} b2_styles bankrupt`).toBeUndefined();
      expect(rows, `seed ${seed} b2_styles weeks`).toHaveLength(WEEKS);
      expect(styleSeasons(inWeeks(rows, FROM_WEEK, WEEKS)).length, `seed ${seed} seasons with a style bought, weeks ${FROM_WEEK}-${WEEKS}`).toBeGreaterThanOrEqual(SEASONS_MIN);
      expect(rows.at(-1)!.tem, `seed ${seed} Tem at week ${WEEKS}`).toBeLessThanOrEqual(TEM_END_MAX);
    });
  }
});
