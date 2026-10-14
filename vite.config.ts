import { defineConfig } from 'vitest/config';
import pkg from './package.json';

export default defineConfig({
  // Relative base so the build works under any GitHub Pages sub-path.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    rollupOptions: {
      output: {
        // The menu needs neither: main.ts imports src/render lazily. three.js
        // changes rarely, so its own chunk stays cached across deploys.
        manualChunks(id) {
          return id.includes('/node_modules/three/') ? 'three' : undefined;
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
