import { defineConfig } from 'vitest/config';

/** Node's env (the tsconfig has no Node types). */
declare const process: { env: Record<string, string | undefined> };

/**
 * `npm run sim:long`: only the 40-week sim, which `npm run check` leaves out.
 * With LONGSIM_GEN=1 only the SIZE_GOAL sampler (scripts/gen-size-goal.mjs).
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: process.env.LONGSIM_GEN === '1' ? ['tests/longsim/**/*.gen.ts'] : ['tests/longsim/**/*.sim.ts'],
  },
});
