import { defineConfig } from 'vitest/config';

/** `npm run sim:long:s2`: only the E-27 60-week season-2 sim, left out of `npm run check` and `npm run sim:long`. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/longsim/**/*.s2.ts'],
  },
});
