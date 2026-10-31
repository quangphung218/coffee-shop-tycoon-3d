import { it } from 'vitest';
import type { Difficulty } from '../../src/sim/types';
import { STRATEGIES, playWeeks, type StrategyName } from './run';

/**
 * Sampler of scripts/gen-size-goal.mjs: plays b_steady2 (or GEN_BOT) for 40
 * weeks on GEN_DIFFICULTY and GEN_SEED and prints one SIZE_GOAL_ROWS line of
 * JSON, [week, upgrade levels at the week's start, revenue, score profit,
 * revenue target, profit target, score] per week.
 * The *.gen.ts name keeps it out of `npm run check` and `npm run sim:long`.
 */

/** Node's stdout and env (the tsconfig has no Node types). */
declare const process: { stdout: { write(text: string): boolean }; env: Record<string, string | undefined> };

it('samples a bot (GEN_BOT, default b_steady2)', { timeout: 1_200_000 }, () => {
  const difficulty = (process.env.GEN_DIFFICULTY ?? 'normal') as Difficulty;
  const seed = Number(process.env.GEN_SEED ?? 1);
  const bot = (process.env.GEN_BOT ?? 'b_steady2') as StrategyName;
  const rows = playWeeks(difficulty, seed, STRATEGIES[bot]);
  const out = rows.map((r) => [r.week, r.startLevels, r.revenue, r.profit, r.revenueTarget, r.profitTarget, r.score]);
  process.stdout.write(`\nSIZE_GOAL_ROWS ${JSON.stringify({ difficulty, seed, bankruptDay: rows.bankruptDay ?? null, rows: out })}\n`);
});
