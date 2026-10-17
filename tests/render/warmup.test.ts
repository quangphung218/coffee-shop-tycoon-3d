import { Scene, type Object3D } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActors, WARM_BODIES, WARM_COINS } from '../../src/render/actors';
import { ANGRY_ICON, LABEL_BUBBLES, LABEL_FACES, LabelAssets } from '../../src/render/actors/labels';
import { MENU_ICONS } from '../../src/ui/core/iconMap';
import { dispatch } from '../../src/sim';
import { createNewGame } from '../../src/sim/state';

/** A 2D context that accepts every call, enough for the bubble drawing. */
function fakeCanvas(): unknown {
  const ctx = new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? () => undefined : undefined), set: () => true });
  return { width: 0, height: 0, getContext: () => ctx };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('label prebuild', () => {
  it('lists every menu item, the angry face, the mood faces and the coin', () => {
    for (const id of Object.values(MENU_ICONS)) expect(LABEL_BUBBLES).toContain(id);
    expect(LABEL_BUBBLES).toContain(ANGRY_ICON);
    expect(new Set(LABEL_BUBBLES).size).toBe(LABEL_BUBBLES.length);
    expect(LABEL_FACES).toEqual(expect.arrayContaining(['i-face-happy', 'i-face-ok', 'i-face-worried', 'i-coin']));
  });

  it('makes one texture per icon up front and reuses them afterwards', async () => {
    vi.stubGlobal('document', { createElement: () => fakeCanvas() });
    const assets = new LabelAssets();
    const textures = await assets.prebuild();
    expect(textures).toHaveLength(LABEL_BUBBLES.length + LABEL_FACES.length);
    expect(new Set(textures).size).toBe(textures.length);
    // Tags shown later take the prebuilt materials instead of drawing new canvases.
    expect(textures).toContain(assets.icon('i-latte').map);
    expect(textures).toContain(assets.face('i-face-ok').map);
    expect(await assets.prebuild()).toHaveLength(textures.length);
    assets.dispose();
  });

  it('resolves with no textures without a DOM', async () => {
    const assets = new LabelAssets();
    expect(await assets.prebuild()).toEqual([]);
    assets.dispose();
  });
});

describe('actors warm-up', () => {
  const visibleRoots = (scene: Scene): number => {
    const actors = scene.getObjectByName('actors')!;
    return actors.children.filter((o: Object3D) => o.visible && o.name !== 'coins').length;
  };

  it('pools the warm-up characters and coins before the first customer', async () => {
    const scene = new Scene();
    const actors = createActors(scene);
    await actors.prebuild();
    const s = actors.stats();
    expect(s.created).toBeGreaterThanOrEqual(WARM_BODIES);
    expect(s.live).toBe(0);
    expect(s.coinsCreated).toBe(WARM_COINS);
    expect(s.coins).toBe(0);
    actors.dispose();
  });

  it('shows the warm-up characters for one draw, then puts them back', async () => {
    const scene = new Scene();
    const actors = createActors(scene);
    const state = createNewGame('Test', 'normal', 1);
    dispatch(state, { type: 'start_day' });
    actors.update(state, 0);
    await actors.prebuild();
    const before = actors.stats();
    const shown = visibleRoots(scene);
    const draw = vi.fn(() => {
      expect(actors.stats().live).toBe(before.live + WARM_BODIES);
      expect(visibleRoots(scene)).toBe(shown + WARM_BODIES);
      expect(actors.stats().coins).toBe(1);
    });
    actors.drawWarm(draw);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(actors.stats().live).toBe(before.live);
    expect(actors.stats().coins).toBe(0);
    expect(visibleRoots(scene)).toBe(shown);
    // The pool already holds enough bodies: the warm-up makes none.
    expect(actors.stats().created).toBe(before.created);
    actors.dispose();
  });
});
