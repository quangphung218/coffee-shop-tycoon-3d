import { defineConfig } from 'vitest/config';

/** `npm run sim:long`: only the 40-week sim, which `npm run check` leaves out. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/longsim/**/*.sim.ts'],
  },
});
