// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveGame } from '../../src/save/save';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { createMemoryStorage } from '../../src/save/storage';
import { createNewGame as createGameState } from '../../src/sim/state';
import { BUILT_SHARE, DOWNLOAD_SHARE, downloadedFraction, matchAsset, readAssets, sceneProgress } from '../../src/ui/core/loadProgress';
import { progressPercent, SCENE_ERROR_TEXT, SCENE_LOADING_TEXT, SCENE_SLOW_TEXT, SceneGate } from '../../src/ui/core/sceneGate';
import { LOADING_TIPS } from '../../src/ui/core/tips';
import { createShell, type Shell } from '../../src/ui/screens/shell';
import INDEX_HTML from '../../index.html?raw';

const EMOJI = /\p{Extended_Pictographic}/u;

function q<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

function visibleScreen(root: HTMLElement): HTMLElement {
  return q(root, '.ui-screen:not([hidden])');
}

describe('loading progress', () => {
  const files = [
    ['assets/three-abc.js', 600],
    ['assets/index-def.js', 200],
  ] as const;

  it('matches resource URLs to build files, ignoring query and hash', () => {
    expect(matchAsset(files, 'https://x.github.io/game/assets/three-abc.js?v=1')).toBe('assets/three-abc.js');
    expect(matchAsset(files, 'https://x.github.io/game/assets/index-def.js#x')).toBe('assets/index-def.js');
    expect(matchAsset(files, 'https://x.github.io/game/assets/other.js')).toBeUndefined();
    // Only whole path segments count.
    expect(matchAsset(files, 'https://x.github.io/game/myassets/three-abc.js')).toBeUndefined();
  });

  it('weighs finished files by their size', () => {
    expect(downloadedFraction(files, new Set())).toBe(0);
    expect(downloadedFraction(files, new Set(['assets/index-def.js']))).toBe(0.25);
    expect(downloadedFraction(files, new Set(['assets/index-def.js', 'assets/three-abc.js']))).toBe(1);
    expect(downloadedFraction([], new Set())).toBeNull();
  });

  it('gives downloads their share, then fixed marks for building and compiling', () => {
    expect(sceneProgress(0.5, 'download')).toBeCloseTo(0.5 * DOWNLOAD_SHARE);
    expect(sceneProgress(null, 'download')).toBe(0);
    expect(sceneProgress(1, 'built')).toBe(BUILT_SHARE);
    expect(sceneProgress(1, 'compiled')).toBe(1);
    expect(DOWNLOAD_SHARE).toBeLessThan(BUILT_SHARE);
  });

  it('reads the lists index.html puts on window, or empty ones', () => {
    const g = globalThis as { __cstAssets?: unknown };
    g.__cstAssets = undefined;
    expect(readAssets()).toEqual({ boot: [], scene: [] });
    g.__cstAssets = { boot: [['a.js', 1]], scene: [['b.js', 2]] };
    expect(readAssets()).toEqual({ boot: [['a.js', 1]], scene: [['b.js', 2]] });
    delete g.__cstAssets;
  });

});

describe('SceneGate', () => {
  it('starts ready, so a shell without a loader is not gated', () => {
    const gate = new SceneGate();
    const btn = document.createElement('button');
    gate.bind(btn);
    expect(gate.ready).toBe(true);
    expect(btn.hasAttribute('aria-disabled')).toBe(false);
    expect(gate.statusLine().hidden).toBe(true);
  });

  it('shows the real percent on bound buttons until ready, then gives them back', () => {
    const gate = new SceneGate({ status: 'loading', progress: 0, slow: false });
    const btn = document.createElement('button');
    btn.textContent = 'Tiếp tục';
    document.body.append(btn);
    gate.bind(btn);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.textContent).toBe('Tiếp tụcĐang chuẩn bị 0%');
    gate.set({ progress: 0.42 });
    expect(q(btn, '.btn-prep').textContent).toBe('Đang chuẩn bị 42%');
    expect(btn.style.getPropertyValue('--prep')).toBe('0.42');
    gate.set({ status: 'ready', progress: 1 });
    expect(btn.hasAttribute('aria-disabled')).toBe(false);
    expect(btn.classList.contains('is-preparing')).toBe(false);
    expect(btn.textContent).toBe('Tiếp tục');
    btn.remove();
  });

  it('never reads 100% before the scene is ready', () => {
    expect(progressPercent({ status: 'loading', progress: 1, slow: false })).toBe(99);
    expect(progressPercent({ status: 'ready', progress: 0.5, slow: false })).toBe(100);
  });

  it('status line: progress and tip, then the slow note, then the error with Thử lại', () => {
    const gate = new SceneGate({ status: 'loading', progress: 0.3, slow: false });
    const retry = vi.fn();
    gate.onRetry = retry;
    const line = gate.statusLine();
    expect(line.hidden).toBe(false);
    expect(q(line, '.scene-load-msg').textContent).toBe(SCENE_LOADING_TEXT);
    expect(q(line, '.scene-load-msg').getAttribute('role')).toBe('status');
    expect(q(line, '.scene-load-pct').textContent).toBe('30%');
    expect(q(line, '[role="progressbar"]').getAttribute('aria-valuenow')).toBe('30');
    expect(q(line, '.scene-load-tip').textContent).toMatch(/^Mẹo: /);
    expect(q<HTMLButtonElement>(line, 'button').hidden).toBe(true);

    gate.set({ slow: true });
    expect(q(line, '.scene-load-msg').textContent).toBe(SCENE_SLOW_TEXT);
    expect(line.classList.contains('is-slow')).toBe(true);

    gate.set({ status: 'error', slow: false });
    expect(q(line, '.scene-load-msg').textContent).toBe(SCENE_ERROR_TEXT);
    expect(q(line, '[role="progressbar"]').hidden).toBe(true);
    const button = q<HTMLButtonElement>(line, 'button');
    expect(button.hidden).toBe(false);
    expect(button.textContent).toBe('Thử lại');
    button.click();
    expect(retry).toHaveBeenCalledTimes(1);

    gate.set({ status: 'error', message: 'Lỗi riêng' });
    expect(q(line, '.scene-load-msg').textContent).toBe('Lỗi riêng');
    // Back to loading drops the old message.
    gate.set({ status: 'loading', progress: 0 });
    expect(gate.state.message).toBeUndefined();
    gate.set({ status: 'ready' });
    expect(line.hidden).toBe(true);
  });

  it('keeps the tips short and emoji-free', () => {
    expect(LOADING_TIPS.length).toBeGreaterThan(3);
    for (const tip of LOADING_TIPS) {
      expect(tip.length).toBeLessThanOrEqual(90);
      expect(tip).not.toMatch(EMOJI);
    }
  });
});

describe('Shell with a loading scene', () => {
  let shell: Shell | null = null;
  afterEach(() => {
    shell?.dispose();
    shell = null;
  });

  function boot(storage = createMemoryStorage()) {
    const root = document.createElement('div');
    document.body.append(root);
    const scene = new SceneGate({ status: 'loading', progress: 0.5, slow: false });
    shell = createShell({ root, storage, settings: { ...DEFAULT_SETTINGS }, seed: () => 7, scene });
    return { root, scene, shell };
  }

  it('does not open the shop from New Game until the scene is ready', () => {
    const { root, scene, shell } = boot();
    const newGame = [...root.querySelectorAll('button')].find((b) => b.textContent?.includes('Ván mới'))!;
    // Ván mới only opens the form, so it is not gated.
    expect(newGame.hasAttribute('aria-disabled')).toBe(false);
    newGame.click();
    expect(shell.screen).toBe('newGame');
    const form = q<HTMLFormElement>(visibleScreen(root), 'form');
    const start = q<HTMLButtonElement>(form, 'button[type="submit"]');
    expect(start.getAttribute('aria-disabled')).toBe('true');
    expect(start.textContent).toContain('Đang chuẩn bị 50%');
    expect(q(form, '.scene-load').hidden).toBe(false);
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(shell.state).toBeNull();

    scene.set({ status: 'ready', progress: 1 });
    expect(q(form, '.scene-load').hidden).toBe(true);
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(shell.state).not.toBeNull();
    expect(shell.screen).toBeNull();
  });

  it('gates Tiếp tục on the menu and Tải on the load screen', () => {
    const storage = createMemoryStorage();
    expect(saveGame(createGameState('Quán Cũ', 'normal', 3), '1', storage).ok).toBe(true);
    const { root, scene, shell } = boot(storage);
    const menu = visibleScreen(root);
    const cont = q<HTMLButtonElement>(menu, '.btn-primary');
    expect(cont.textContent).toContain('Tiếp tục');
    expect(cont.getAttribute('aria-disabled')).toBe('true');
    cont.click();
    expect(shell.state).toBeNull();

    q<HTMLButtonElement>(menu, '[data-action="load"]').click();
    expect(shell.screen).toBe('load');
    const load = q<HTMLButtonElement>(visibleScreen(root), '[data-slot="1"] .btn-primary');
    expect(load.getAttribute('aria-disabled')).toBe('true');
    load.click();
    expect(shell.state).toBeNull();

    scene.set({ status: 'ready', progress: 1 });
    expect(load.hasAttribute('aria-disabled')).toBe(false);
    load.click();
    expect(shell.state?.shopName).toBe('Quán Cũ');
  });
});

describe('boot screen in index.html', () => {
  const doc = new DOMParser().parseFromString(INDEX_HTML, 'text/html');

  it('has a percent, a tip line and a hidden Thử lại button', () => {
    const boot = q(doc, '#boot');
    expect(boot.querySelector('.boot-pct')).toBeTruthy();
    expect(boot.querySelector('.boot-tip')).toBeTruthy();
    const retry = q<HTMLButtonElement>(boot, 'button.boot-retry');
    expect(retry.hidden).toBe(true);
    expect(retry.textContent).toBe('Thử lại');
  });

  it('fills the bar from the files loaded, not a timed animation', () => {
    expect(INDEX_HTML).not.toContain('boot-fill');
    expect(INDEX_HTML).toContain("observe({ type: 'resource', buffered: true })");
    expect(INDEX_HTML).toContain('/*CST_ASSETS*/ { boot: [], scene: [] }');
    expect(INDEX_HTML).toContain('/*CST_TIPS*/ []');
    expect(INDEX_HTML).toContain('Mạng đang chậm, game vẫn đang tải…');
  });

  it('runs the boot script before the stylesheet and the game script can delay it', () => {
    const script = [...doc.querySelectorAll('script:not([src])')].find((s) => s.textContent?.includes('__cstAssets'));
    expect(script?.previousElementSibling?.id).toBe('boot');
  });
});
