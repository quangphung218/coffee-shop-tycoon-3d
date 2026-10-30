// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadGame, saveGame } from '../../src/save/save';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../../src/save/settings';
import { createMemoryStorage, type StorageLike } from '../../src/save/storage';
import { step } from '../../src/sim';
import { createNewGame } from '../../src/sim/state';
import { SPEED_HINT, SPEED_HINT_KEY } from '../../src/ui/screens/game';
import { createShell, type Shell } from '../../src/ui/screens/shell';

let shell: Shell | null = null;
let hidden: ReturnType<typeof vi.spyOn> | null = null;

afterEach(() => {
  hidden?.mockRestore();
  hidden = null;
  shell?.dispose();
  shell = null;
  document.body.replaceChildren();
});

/** Boots the shell as a page load does: settings read from storage. */
function boot(storage: StorageLike): { root: HTMLElement; shell: Shell } {
  shell?.dispose();
  document.body.replaceChildren();
  const root = document.createElement('div');
  document.body.append(root);
  shell = createShell({ root, storage, seed: () => 7 });
  return { root, shell };
}

function hideTab(): void {
  hidden ??= vi.spyOn(document, 'hidden', 'get');
  hidden.mockReturnValue(true);
  document.dispatchEvent(new Event('visibilitychange'));
  hidden.mockReturnValue(false);
}

/** Runs the open shop until the clock reads `minute`, handling events like the frame loop. */
function playUntil(s: Shell, minute: number): void {
  while (s.state!.minute < minute) {
    step(s.state!, 1);
    s.handleEvents(s.state!.events);
    s.state!.events = [];
  }
}

function continueBtn(root: HTMLElement): HTMLButtonElement {
  return [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Tiếp tục'))!;
}

describe('autosave when the tab is hidden', () => {
  it('saves mid-day at 12:30; reload and Tiếp tục return to the same moment', () => {
    const storage = createMemoryStorage();
    const first = boot(storage).shell;
    first.startGame(createNewGame('Quán Trưa', 'normal', 7));
    expect(first.dispatch({ type: 'start_day' })).toBe(true);
    first.handleEvents(first.state!.events);
    first.state!.events = [];
    playUntil(first, 12 * 60 + 30);
    const at = first.state!;
    expect(at.minute).toBe(12 * 60 + 30);
    expect(at.customers.length).toBeGreaterThan(0);
    const snapshot = { day: at.day, minute: at.minute, phase: at.phase, money: at.money, customers: JSON.stringify(at.customers) };

    hideTab();
    expect(first.screen).toBe('pause');

    const { root, shell: second } = boot(storage);
    expect(second.state).toBeNull();
    const btn = continueBtn(root);
    expect(btn.hidden).toBe(false);
    btn.click();

    const back = second.state!;
    expect(back.runId).toBe(at.runId);
    expect({ day: back.day, minute: back.minute, phase: back.phase, money: back.money, customers: JSON.stringify(back.customers) }).toEqual(snapshot);
  });

  it('saves on pagehide too, in preparation', () => {
    const storage = createMemoryStorage();
    const s = boot(storage).shell;
    s.startGame(createNewGame('Quán Sáng', 'normal', 7));
    expect(loadGame('auto', storage).ok).toBe(false);
    window.dispatchEvent(new Event('pagehide'));
    const r = loadGame('auto', storage);
    expect(r.ok && r.value.phase).toBe('preparation');
  });

  it('leaves the save unchanged when hidden on the bankruptcy screen', () => {
    const storage = createMemoryStorage();
    const s = boot(storage).shell;
    const game = createNewGame('Quán Nợ', 'normal', 7);
    s.startGame(game);
    // The last playable day, autosaved by this run.
    s.state!.day = 5;
    window.dispatchEvent(new Event('pagehide'));
    const before = storage.getItem('cst3d:save:auto');
    expect(before).not.toBeNull();

    s.state!.day = 9;
    s.state!.phase = 'report';
    s.state!.bankrupt = true;
    s.update();
    expect(s.screen).toBe('bankrupt');
    hideTab();
    window.dispatchEvent(new Event('pagehide'));
    expect(storage.getItem('cst3d:save:auto')).toBe(before);
  });

  it('keeps another run in the auto slot: copied to a free slot before saving', () => {
    const storage = createMemoryStorage();
    const other = createNewGame('Quán Cũ', 'normal', 3);
    other.runId = 'old-run';
    saveGame(other, 'auto', storage);
    const before = storage.getItem('cst3d:save:auto');
    const s = boot(storage).shell;
    s.startGame(createNewGame('Quán Mới', 'normal', 7));
    hideTab();
    expect(storage.getItem('cst3d:save:1')).toBe(before);
    const r = loadGame('auto', storage);
    expect(r.ok && r.value.shopName).toBe('Quán Mới');
  });
});

describe('remembered speed and the day-2 hint', () => {
  it('starts a new game at 1x by default and remembers the speed picked on the HUD', () => {
    const storage = createMemoryStorage();
    const s = boot(storage).shell;
    s.startGame(createNewGame('Quán Nhanh', 'normal', 7));
    expect(s.state!.speed).toBe(DEFAULT_SETTINGS.gameSpeed);
    expect(s.state!.speed).toBe(1);
    s.hud.el.querySelector<HTMLButtonElement>('[data-speed="2"]')!.click();
    expect(s.state!.speed).toBe(2);
    expect(loadSettings(storage).gameSpeed).toBe(2);

    const again = boot(storage).shell;
    again.startGame(createNewGame('Quán Nhanh', 'normal', 8));
    expect(again.state!.speed).toBe(2);
  });

  it('shows the 2x hint once, when day 2 opens at 1x', () => {
    const storage = createMemoryStorage();
    saveSettings({ ...DEFAULT_SETTINGS }, storage);
    const s = boot(storage).shell;
    const game = createNewGame('Quán Gợi Ý', 'normal', 7);
    s.startGame(game);
    const texts = (): string[] => [...s.toasts.el.querySelectorAll('.toast')].map((t) => t.textContent ?? '');

    // Day 1: no hint.
    s.handleEvents([{ type: 'phase', phase: 'opening' }]);
    expect(texts().some((t) => t.includes(SPEED_HINT))).toBe(false);

    s.state!.day = 2;
    s.handleEvents([{ type: 'phase', phase: 'opening' }]);
    expect(texts().filter((t) => t.includes(SPEED_HINT))).toHaveLength(1);
    expect(storage.getItem(SPEED_HINT_KEY)).not.toBeNull();

    s.toasts.clear();
    const again = boot(storage).shell;
    const day2 = createNewGame('Quán Gợi Ý', 'normal', 9);
    day2.day = 2;
    again.startGame(day2);
    again.handleEvents([{ type: 'phase', phase: 'opening' }]);
    expect([...again.toasts.el.querySelectorAll('.toast')].some((t) => t.textContent?.includes(SPEED_HINT))).toBe(false);
  });
});
