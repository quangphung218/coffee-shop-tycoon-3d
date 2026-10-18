// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { saveGame, saveKey } from '../../src/save/save';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { createMemoryStorage, type StorageLike } from '../../src/save/storage';
import { createNewGame as createGameState } from '../../src/sim/state';
import { mountGame } from '../../src/ui/screens/game';
import { createMenuShell, type MenuShell, type ShellOptions } from '../../src/ui/screens/menuShell';

// The project has no Node types; under jsdom read files by a path from the repo root.
const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as {
  readFileSync(path: string, encoding: 'utf8'): string;
};

let menu: MenuShell | null = null;

afterEach(() => {
  menu?.dispose();
  menu = null;
  document.body.replaceChildren();
});

function setup(storage: StorageLike = createMemoryStorage()): { menu: MenuShell; options: ShellOptions } {
  const root = document.createElement('div');
  document.body.append(root);
  const options: ShellOptions = { root, storage, settings: { ...DEFAULT_SETTINGS }, seed: () => 7 };
  menu = createMenuShell(options);
  return { menu, options };
}

function button(root: ParentNode, text: string): HTMLButtonElement {
  const b = [...root.querySelectorAll('button')].find((x) => x.textContent?.includes(text));
  if (!b) throw new Error(`no button "${text}"`);
  return b;
}

function visibleScreen(root: HTMLElement): HTMLElement | null {
  return [...root.querySelectorAll<HTMLElement>('.ui-screen')].find((s) => !s.hidden) ?? null;
}

describe('createMenuShell', () => {
  it('shows the Main Menu with no game part', () => {
    const { menu } = setup();
    expect(menu.attached).toBe(false);
    expect(menu.screens.current).toBe('menu');
    expect(visibleScreen(menu.root)?.getAttribute('aria-label')).toBe('Menu chính');
    expect(menu.root.querySelector('.hud')).toBeNull();
    expect(button(menu.root, 'Tiếp tục').hidden).toBe(true);
  });

  it('opens Settings before the game part and comes back to the menu', () => {
    const { menu } = setup();
    button(menu.root, 'Cài đặt').click();
    expect(menu.screens.current).toBe('settings');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(menu.screens.current).toBe('menu');
  });

  it('opens the new-game form once the game part is attached when Ván mới came first', () => {
    const { menu, options } = setup();
    button(menu.root, 'Ván mới').click();
    expect(menu.screens.current).toBe('menu');

    menu.attachGame(mountGame(menu, options));
    expect(menu.screens.current).toBe('newGame');
    const form = visibleScreen(menu.root)?.querySelector('form');
    expect(form).toBeTruthy();
  });

  it('drops a pending Ván mới when the player went to Settings meanwhile', () => {
    const { menu, options } = setup();
    button(menu.root, 'Ván mới').click();
    button(menu.root, 'Cài đặt').click();
    menu.attachGame(mountGame(menu, options));
    expect(menu.screens.current).toBe('settings');
  });

  it('puts the HUD and report under the menu screens', () => {
    const { menu, options } = setup();
    const game = mountGame(menu, options);
    menu.attachGame(game);
    const children = [...menu.root.children];
    expect(game.hud.el.hidden).toBe(true);
    expect(children.indexOf(game.hud.el)).toBeGreaterThanOrEqual(0);
    expect(children.indexOf(game.hud.el)).toBeLessThan(children.indexOf(menu.screens.get('menu')!.el));
    expect(children.indexOf(game.report.el)).toBeLessThan(children.indexOf(menu.screens.get('menu')!.el));
    // Screens keep the pre-split order: new game and load before settings.
    expect(children.indexOf(menu.screens.get('newGame')!.el)).toBeLessThan(children.indexOf(menu.screens.get('settings')!.el));
  });

  it('shows Tiếp tục with the shop name and day of a save from saveGame', () => {
    const storage = createMemoryStorage();
    const state = createGameState('Quán Mây', 'normal', 3);
    state.day = 4;
    expect(saveGame(state, '2', storage).ok).toBe(true);
    const { menu } = setup(storage);
    const cont = button(menu.root, 'Tiếp tục');
    expect(cont.hidden).toBe(false);
    expect(cont.textContent).toContain('Quán Mây · Ngày 4');
  });

  it('hides Tiếp tục when the only slot is broken', () => {
    const storage = createMemoryStorage();
    storage.setItem(saveKey('auto'), '{not json');
    const { menu } = setup(storage);
    expect(button(menu.root, 'Tiếp tục').hidden).toBe(true);
    // The slot is not empty, so Tải game stays usable to explain it.
    expect(button(menu.root, 'Tải game').getAttribute('aria-disabled')).not.toBe('true');
  });
});

describe('menu shell imports', () => {
  // Value imports only; `import type` is erased from the bundle.
  const GAME_ONLY = /^import\s+(?!type\b)[^;]*from\s+'[^']*\/(sim|hud|report|panels|audio)(\/[^']*)?'|^import\s+(?!type\b)[^;]*from\s+'[^']*\/save\/save'/m;
  for (const file of ['src/ui/screens/menuShell.ts', 'src/ui/screens/mainMenu.ts', 'src/ui/screens/settings.ts']) {
    it(`${file} does not import game code`, () => {
      expect(readFileSync(file, 'utf8')).not.toMatch(GAME_ONLY);
    });
  }
});
