// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { saveKey } from '../../src/save/save';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { createMemoryStorage, type StorageLike } from '../../src/save/storage';
import { registerPrepPanels } from '../../src/ui/panels';
import { registerReviewsPanel } from '../../src/ui/report';
import { createShell, type Shell } from '../../src/ui/screens/shell';
import { playDay } from './helpers';

function q<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

function button(root: ParentNode, text: string): HTMLButtonElement {
  const b = [...root.querySelectorAll('button')].find((x) => x.textContent?.includes(text));
  if (!b) throw new Error(`no button "${text}"`);
  return b;
}

const offs: (() => void)[] = [];
let shell: Shell | null = null;

afterEach(() => {
  shell?.dispose();
  shell = null;
  offs.splice(0).forEach((off) => off());
  document.body.replaceChildren();
});

function boot(storage: StorageLike = createMemoryStorage()) {
  const root = document.createElement('div');
  document.body.append(root);
  shell = createShell({ root, storage, settings: { ...DEFAULT_SETTINGS }, seed: () => 7 });
  return { root, storage, shell };
}

/** Main Menu → Ván mới → name → start. */
function newGame(root: HTMLElement, s: Shell, name: string) {
  button(root, 'Ván mới').click();
  q<HTMLInputElement>(root, 'input[type="text"]').value = name;
  q<HTMLFormElement>(root, 'form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  expect(s.state?.shopName).toBe(name);
  return s.state!;
}

describe('Main Menu "Tiếp tục"', () => {
  it('is hidden with empty storage, New Game takes focus and Load explains why', () => {
    const { root, shell } = boot();
    expect(shell.screen).toBe('menu');
    const menu = q(root, '.ui-screen:not([hidden])');
    expect(button(menu, 'Tiếp tục').hidden).toBe(true);
    expect(document.activeElement).toBe(button(menu, 'Ván mới'));
    const reason = q(menu, '.reason');
    expect(reason.hidden).toBe(false);
    expect(reason.textContent).toContain('Chưa có bản lưu nào');
  });

  it('shows the shop name and day after a played day autosaves, and continues that game', () => {
    const { root, storage, shell } = boot();
    const state = newGame(root, shell, 'Quán Luồng');
    const events = playDay(state, { play: true });
    shell.update();
    shell.handleEvents(events);
    expect(storage.getItem(saveKey('auto'))).toContain('Quán Luồng');
    const savedDay = state.day;

    shell.openPause();
    button(root, 'Về Main Menu').click();
    expect(shell.screen).toBe('menu');
    const menu = q(root, '.ui-screen:not([hidden])');
    const cont = button(menu, 'Tiếp tục');
    expect(cont.hidden).toBe(false);
    expect(cont.textContent).toContain(`Quán Luồng · Ngày ${savedDay}`);
    // textContent still counts hidden nodes; the reason line itself must be hidden.
    expect(q(menu, '.reason').hidden).toBe(true);
    expect(document.activeElement).toBe(cont);

    cont.click();
    expect(shell.screen).toBeNull();
    expect(shell.state?.shopName).toBe('Quán Luồng');
    expect(shell.state?.day).toBe(savedDay);
  });
});

describe('Esc on an open panel', () => {
  it('closes it and returns focus to its dock button, from inside the panel or the window', () => {
    offs.push(registerPrepPanels(), registerReviewsPanel());
    const { root, shell } = boot();
    newGame(root, shell, 'Quán Phím');

    for (const id of ['inventory', 'menu']) {
      const open = q<HTMLButtonElement>(shell.hud.el, `.dock [data-panel="${id}"]`);
      open.focus();
      open.click();
      expect(shell.hud.openPanelId).toBe(id);
      const inside = document.activeElement as HTMLElement;
      expect(shell.hud.panelEl.contains(inside)).toBe(true);
      inside.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(shell.hud.panelEl.hidden).toBe(true);
      expect(shell.hud.openPanelId).toBeNull();
      expect(open.getAttribute('aria-pressed')).toBe('false');
      expect(document.activeElement).toBe(open);
      // The panel's Esc does not also open Pause.
      expect(shell.screen).toBeNull();
    }

    // Esc reaching the window (focus left the panel) still closes it, not Pause.
    const staff = q<HTMLButtonElement>(shell.hud.el, '.dock [data-panel="staff"]');
    staff.focus();
    staff.click();
    (document.activeElement as HTMLElement).blur();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(shell.hud.openPanelId).toBeNull();
    expect(shell.screen).toBeNull();
    expect(document.activeElement).toBe(staff);
  });
});
