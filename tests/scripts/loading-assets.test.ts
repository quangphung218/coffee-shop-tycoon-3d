// Node environment: vite.config.ts pulls in vite, whose esbuild refuses jsdom.
import { describe, expect, it } from 'vitest';
import { loadingAssets } from '../../vite.config';

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

  it('gives empty lists without an entry chunk', () => {
    expect(loadingAssets({} as never)).toEqual({ boot: [], scene: [] });
  });
});
