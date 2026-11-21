import { defineConfig } from 'vitest/config';

/** `npm run sim:long:tem`: only the E-33 60-week Tem sim, left out of `npm run check`, `npm run sim:long`, `sim:long:s2` and `sim:long:s3`. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/longsim/**/*.tem.ts'],
  },
});
