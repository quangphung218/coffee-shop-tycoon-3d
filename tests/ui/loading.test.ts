// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveGame } from '../../src/save/save';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { createMemoryStorage } from '../../src/save/storage';
import { createNewGame as createGameState } from '../../src/sim/state';
import { downloadedFraction, initialComponents, LOAD_COMPONENTS, loadFonts, matchAsset, readAssets } from '../../src/ui/core/loadProgress';
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

  it('loads Nunito 400 and 700 with text from both subsets, and fails when a face fails', async () => {
    const calls: [string, string | undefined][] = [];
    const fonts = { load: (font: string, text?: string) => (calls.push([font, text]), Promise.resolve([])) } as unknown as FontFaceSet;
    await loadFonts(fonts);
    expect(calls.map(([f]) => f)).toEqual(['400 1em Nunito', '700 1em Nunito']);
    expect(calls[0]![1]).toMatch(/[A-Za-z]/);
    expect(calls[0]![1]).toMatch(/[Đđạ-ỹ]/);
    const broken = { load: () => Promise.reject(new Error('NetworkError')) } as unknown as FontFaceSet;
    await expect(loadFonts(broken)).rejects.toThrow();
    // No Font Loading API (old browsers, tests): nothing to wait for.
    await expect(loadFonts(undefined)).resolves.toBeUndefined();
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

  it('lists every component on the status line, one row each with a status icon and percent', () => {
    const gate = new SceneGate({ status: 'loading', progress: 0, slow: false, components: initialComponents() });
    const line = gate.statusLine();
    const rows = [...line.querySelectorAll<HTMLElement>('.scene-load-list > li')];
    expect(rows.map((r) => r.dataset.component)).toEqual(LOAD_COMPONENTS.map((c) => c.id));
    expect(rows.map((r) => q(r, '.scene-load-label').textContent)).toEqual([
      'Mã cảnh 3D',
      'Font',
      'Icon',
      'Dựng quán',
      'Biên dịch shader',
      'Nhãn và texture',
    ]);
    for (const row of rows) {
      expect(row.dataset.status).toBe('waiting');
      expect(q(row, '.scene-load-mark .ic').dataset.icon).toBe('i-dot-empty');
      expect(q(row, '.scene-load-item-pct').textContent).toBe('0%');
      expect(q<HTMLButtonElement>(row, 'button').hidden).toBe(true);
      expect(row.textContent).not.toMatch(EMOJI);
    }

    gate.setComponent('code', { status: 'loading', progress: 0.5 });
    gate.setComponent('fonts', { status: 'done' });
    const code = q(line, '[data-component="code"]');
    expect(code.dataset.status).toBe('loading');
    expect(q(code, '.scene-load-mark .ic').dataset.icon).toBe('i-busy');
    expect(q(code, '.scene-load-item-pct').textContent).toBe('50%');
    expect(q(code, '.sr-only').textContent).toBe(': đang tải');
    const fonts = q(line, '[data-component="fonts"]');
    expect(q(fonts, '.scene-load-mark .ic').dataset.icon).toBe('i-check');
    expect(q(fonts, '.scene-load-item-pct').textContent).toBe('100%');
    // The rows are built once and updated in place.
    expect(line.querySelector('[data-component="code"]')).toBe(code);
  });

  it('weighs the overall percent by component and reads 100 only once every one is done', () => {
    const gate = new SceneGate({ status: 'loading', progress: 0, slow: false, components: initialComponents() });
    const btn = document.createElement('button');
    document.body.append(btn);
    gate.bind(btn);
    const line = gate.statusLine();
    // Mã cảnh 3D is 55 of the 100 weight: half of it is 27.5%.
    gate.setComponent('code', { status: 'loading', progress: 0.5 });
    expect(progressPercent(gate.state)).toBe(27);
    expect(q(line, '.scene-load-pct').textContent).toBe('27%');
    expect(q(btn, '.btn-prep').textContent).toBe('Đang chuẩn bị 27%');

    for (const c of LOAD_COMPONENTS.slice(0, -1)) gate.setComponent(c.id, { status: 'done' });
    // Everything but Nhãn và texture done, and that one at 99%: still not 100, still gated.
    gate.setComponent('labels', { status: 'loading', progress: 0.999 });
    expect(gate.state.status).toBe('loading');
    expect(gate.ready).toBe(false);
    expect(progressPercent(gate.state)).toBeLessThan(100);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(line.hidden).toBe(false);
    // Progress 1 is not the same as done.
    gate.setComponent('labels', { progress: 1 });
    expect(gate.ready).toBe(false);

    gate.setComponent('labels', { status: 'done' });
    expect(gate.ready).toBe(true);
    expect(progressPercent(gate.state)).toBe(100);
    expect(btn.hasAttribute('aria-disabled')).toBe(false);
    expect(line.hidden).toBe(true);
    btn.remove();
  });

  it('turns to error when one component fails, with Thử lại on that row only', () => {
    const gate = new SceneGate({ status: 'loading', progress: 0, slow: false, components: initialComponents() });
    const retry = vi.fn();
    gate.onRetry = retry;
    const line = gate.statusLine();
    gate.setComponent('code', { status: 'done' });
    gate.setComponent('fonts', { status: 'error' });
    expect(gate.state.status).toBe('error');
    expect(gate.ready).toBe(false);
    expect(line.classList.contains('is-failed')).toBe(true);
    expect(q(line, '.scene-load-msg').textContent).toBe(SCENE_ERROR_TEXT);

    const fonts = q(line, '[data-component="fonts"]');
    expect(fonts.dataset.status).toBe('error');
    expect(q(fonts, '.scene-load-mark .ic').dataset.icon).toBe('i-error');
    const buttons = [...line.querySelectorAll<HTMLButtonElement>('button')].filter((b) => !b.hidden);
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.closest('li')).toBe(fonts);
    expect(buttons[0]!.textContent).toBe('Thử lại');
    buttons[0]!.click();
    expect(retry).toHaveBeenCalledWith('fonts');

    // Retrying puts it back to loading; the error clears.
    gate.setComponent('fonts', { status: 'loading' });
    expect(gate.state.status).toBe('loading');
    expect(q<HTMLButtonElement>(fonts, 'button').hidden).toBe(true);
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
