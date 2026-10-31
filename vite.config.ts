import type { Plugin, Rollup } from 'vite';
import { defineConfig } from 'vitest/config';
import pkg from './package.json';
import { LOADING_TIPS } from './src/ui/core/tips';

type AssetList = [string, number][];

/** Node's env without pulling @types/node into the app's tsconfig. */
const hostEnv = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

/** Placeholders in the boot script of index.html. */
const ASSETS_SLOT = '/*CST_ASSETS*/ { boot: [], scene: [] }';
const TIPS_SLOT = '/*CST_TIPS*/ []';

/**
 * [file, bytes] for what the Main Menu needs (the entry chunk, its static
 * imports and their CSS) and for the lazy 3D scene (every chunk reached from
 * the entry's dynamic imports, minus those). src/ui/core/loadProgress.ts
 * turns them into progress.
 */
export function loadingAssets(bundle: Rollup.OutputBundle): { boot: AssetList; scene: AssetList } {
  const chunks = Object.values(bundle).filter((o): o is Rollup.OutputChunk => o.type === 'chunk');
  const byName = new Map(chunks.map((c) => [c.fileName, c]));
  const bytes = (text: string): number => new TextEncoder().encode(text).length;
  const size = (file: string): number => {
    const o = bundle[file];
    if (!o) return 0;
    if (o.type === 'chunk') return bytes(o.code);
    return typeof o.source === 'string' ? bytes(o.source) : o.source.byteLength;
  };
  const collect = (start: readonly string[], skip: ReadonlySet<string>): string[] => {
    const seen = new Set<string>();
    const walk = (file: string): void => {
      if (seen.has(file) || skip.has(file)) return;
      seen.add(file);
      const c = byName.get(file);
      if (!c) return;
      for (const css of c.viteMetadata?.importedCss ?? []) seen.add(css);
      for (const dep of c.imports) walk(dep);
    };
    for (const f of start) walk(f);
    return [...seen];
  };
  const entry = chunks.find((c) => c.isEntry);
  if (!entry) return { boot: [], scene: [] };
  const boot = collect([entry.fileName], new Set());
  const scene = collect(entry.dynamicImports, new Set(boot));
  return { boot: boot.map((f) => [f, size(f)]), scene: scene.map((f) => [f, size(f)]) };
}

/**
 * Fills the boot script's lists and moves the stylesheet from <head> to just
 * after #boot: the inline-styled loading screen then paints as soon as the
 * HTML arrives instead of waiting for the CSS, and the menu below still waits
 * for it (scripts run only once stylesheets have loaded).
 */
function loadingScreen(): Plugin {
  return {
    name: 'cst-loading-screen',
    // After vite:build-html, so generateBundle sees the emitted index.html.
    enforce: 'post',
    transformIndexHtml: (html) => html.replace(TIPS_SLOT, JSON.stringify(LOADING_TIPS)),
    generateBundle(_options, bundle) {
      const page = bundle['index.html'];
      if (!page || page.type !== 'asset' || typeof page.source !== 'string') return;
      const links: string[] = [];
      let html = page.source.replace(/\n?[ \t]*<link rel="stylesheet"[^>]*>/g, (tag) => {
        links.push(tag.trim());
        return '';
      });
      html = html.replace(ASSETS_SLOT, JSON.stringify(loadingAssets(bundle)));
      html = html.replace('<canvas id="scene">', `${links.map((l) => `${l}\n    `).join('')}<canvas id="scene">`);
      page.source = html;
    },
  };
}

export default defineConfig({
  // Relative base so the build works under any GitHub Pages sub-path.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [loadingScreen()],
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
    // Default (cores - 1) workers peak at ~1.5 GB on the 16 GB dev Mac while
    // several agents test at once; 4 workers peak ~0.9 GB for ~15% more time.
    // VITEST_MAX_WORKERS (set by the agent host) still wins.
    maxWorkers: Number(hostEnv.VITEST_MAX_WORKERS) || 4,
  },
});
