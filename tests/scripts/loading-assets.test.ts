// Node environment: vite.config.ts pulls in vite, whose esbuild refuses jsdom.
import { describe, expect, it } from 'vitest';
import {
  componentProgress,
  componentsStatus,
  initialComponents,
  LOAD_COMPONENTS,
  weightedProgress,
  type LoadComponent,
} from '../../src/ui/core/loadProgress';
import { loadingAssets } from '../../vite.config';

describe('loading components (src/ui/core/loadProgress.ts)', () => {
  const list = (patch: Partial<Record<LoadComponent['id'], Partial<LoadComponent>>>): LoadComponent[] =>
    initialComponents().map((c) => ({ ...c, ...patch[c.id] }));

  it('lists the code chunk, fonts, icons, world, shaders and labels, with no audio item', () => {
    expect(LOAD_COMPONENTS.map((c) => c.id)).toEqual(['code', 'fonts', 'icons', 'world', 'shaders', 'labels']);
    expect(LOAD_COMPONENTS.every((c) => c.weight > 0 && c.label.length > 0)).toBe(true);
    expect(initialComponents().every((c) => c.status === 'waiting' && c.progress === 0)).toBe(true);
  });

  it('averages the components by weight', () => {
    const total = LOAD_COMPONENTS.reduce((sum, c) => sum + c.weight, 0);
    const weight = (id: LoadComponent['id']) => LOAD_COMPONENTS.find((c) => c.id === id)!.weight;
    expect(weightedProgress(initialComponents())).toBe(0);
    expect(weightedProgress(list({ code: { status: 'loading', progress: 0.5 } }))).toBeCloseTo((0.5 * weight('code')) / total);
    expect(weightedProgress(list({ fonts: { status: 'done' }, shaders: { status: 'done' } }))).toBeCloseTo(
      (weight('fonts') + weight('shaders')) / total,
    );
    expect(weightedProgress([])).toBe(1);
  });

  it('counts done as whole and clamps the rest', () => {
    expect(componentProgress({ status: 'done', progress: 0 })).toBe(1);
    expect(componentProgress({ status: 'loading', progress: 2 })).toBe(1);
    expect(componentProgress({ status: 'error', progress: -1 })).toBe(0);
  });

  it('is ready only once every component is done, and an error as soon as one fails', () => {
    const allDone = list(Object.fromEntries(LOAD_COMPONENTS.map((c) => [c.id, { status: 'done' }])));
    expect(componentsStatus(allDone)).toBe('ready');
    expect(componentsStatus(list({ code: { status: 'done' } }))).toBe('loading');
    const oneLeft = allDone.map((c) => (c.id === 'labels' ? { ...c, status: 'loading' as const, progress: 1 } : c));
    expect(componentsStatus(oneLeft)).toBe('loading');
    expect(weightedProgress(oneLeft)).toBe(1);
    const oneFailed = allDone.map((c) => (c.id === 'icons' ? { ...c, status: 'error' as const } : c));
    expect(componentsStatus(oneFailed)).toBe('error');
  });
});

describe('loadingAssets (vite.config.ts)', () => {
  it('splits the build into what the menu needs and the lazy 3D scene', () => {
    const chunk = (fileName: string, code: string, extra: Record<string, unknown> = {}) => ({
      type: 'chunk',
      fileName,
      code,
      isEntry: false,
      imports: [],
      dynamicImports: [],
      viteMetadata: { importedCss: new Set<string>(), importedAssets: new Set<string>() },
      ...extra,
    });
    const bundle = {
      'assets/main.js': chunk('assets/main.js', 'aaaa', {
        isEntry: true,
        imports: ['assets/shared.js'],
        dynamicImports: ['assets/scene.js'],
        viteMetadata: { importedCss: new Set(['assets/main.css']), importedAssets: new Set() },
      }),
      'assets/shared.js': chunk('assets/shared.js', 'ss'),
      'assets/scene.js': chunk('assets/scene.js', 'scene', { imports: ['assets/three.js', 'assets/shared.js'] }),
      'assets/three.js': chunk('assets/three.js', 'threethree'),
      'assets/main.css': { type: 'asset', fileName: 'assets/main.css', source: 'body{}' },
    };
    const lists = loadingAssets(bundle as never);
    expect(lists.boot).toEqual([
      ['assets/main.js', 4],
      ['assets/main.css', 6],
      ['assets/shared.js', 2],
    ]);
    // shared.js is already loaded for the menu, so it is not part of the scene.
    expect(lists.scene).toEqual([
      ['assets/scene.js', 5],
      ['assets/three.js', 10],
    ]);
  });

  it('puts the game and 3D scene chunks and what they share in the scene list', () => {
    const chunk = (fileName: string, code: string, extra: Record<string, unknown> = {}) => ({
      type: 'chunk',
      fileName,
      code,
      isEntry: false,
      imports: [],
      dynamicImports: [],
      viteMetadata: { importedCss: new Set<string>(), importedAssets: new Set<string>() },
      ...extra,
    });
    const bundle = {
      'assets/main.js': chunk('assets/main.js', 'aaaa', {
        isEntry: true,
        dynamicImports: ['assets/scene.js', 'assets/game.js'],
      }),
      'assets/scene.js': chunk('assets/scene.js', 'scene', { imports: ['assets/sim.js', 'assets/three.js'] }),
      'assets/game.js': chunk('assets/game.js', 'gamegame', { imports: ['assets/sim.js'] }),
      'assets/sim.js': chunk('assets/sim.js', 'sim'),
      'assets/three.js': chunk('assets/three.js', 'threethree'),
    };
    const lists = loadingAssets(bundle as never);
    expect(lists.boot).toEqual([['assets/main.js', 4]]);
    // The shared sim chunk is counted once.
    expect(lists.scene).toEqual([
      ['assets/scene.js', 5],
      ['assets/sim.js', 3],
      ['assets/three.js', 10],
      ['assets/game.js', 8],
    ]);
  });

  it('gives empty lists without an entry chunk', () => {
    expect(loadingAssets({} as never)).toEqual({ boot: [], scene: [] });
  });
});
