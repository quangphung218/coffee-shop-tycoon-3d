import { defineConfig } from 'vitest/config';

/** `npm run sim:long:s3`: only the E-32 100-week endless-regulars sim, left out of `npm run check`, `npm run sim:long` and `npm run sim:long:s2`. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/longsim/**/*.s3.ts'],
  },
});
