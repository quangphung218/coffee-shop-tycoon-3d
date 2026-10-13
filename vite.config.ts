import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works under any GitHub Pages sub-path.
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
