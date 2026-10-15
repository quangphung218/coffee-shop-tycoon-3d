// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudio, soundForEvent } from '../../src/audio';
import { saveGame, saveKey } from '../../src/save/save';
import { DEFAULT_SETTINGS, loadSettings, type Settings } from '../../src/save/settings';
import { createMemoryStorage, type StorageLike } from '../../src/save/storage';
import { INGREDIENTS } from '../../src/sim/data/ingredients';
import { dispatch as simDispatch } from '../../src/sim/index';
import { createNewGame as createGameState } from '../../src/sim/state';
import type { GameState } from '../../src/sim/types';
import { Watcher } from '../../src/ui/core/dom';
import { formatClock, formatMoney, formatRating } from '../../src/ui/core/format';
import { MAX_TOASTS, TOAST_VISIBLE_MS, Toasts } from '../../src/ui/core/toast';
import { toastForEvent } from '../../src/ui/hud/events';
import { createHud } from '../../src/ui/hud/hud';
import { registerPanel } from '../../src/ui/hud/panels';
import { lowStockCount, openTaskCount, registerPrepPanels } from '../../src/ui/panels';
import { createLoadGame } from '../../src/ui/screens/loadGame';
import { createMainMenu } from '../../src/ui/screens/mainMenu';
import { createNewGame, validateShopName } from '../../src/ui/screens/newGame';
import { createSettings } from '../../src/ui/screens/settings';
import { createShell, type Shell } from '../../src/ui/screens/shell';
import INDEX_HTML from '../../index.html?raw';
import { playDay } from '../integration/helpers';

// Vitest stubs .css imports (even ?raw) to '' and the project has no Node
// types, so read the files through a dynamically named node:fs import.
const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as {
  readFileSync(path: string, encoding: 'utf8'): string;
};
// Under jsdom the global URL is jsdom's, which node:fs rejects; pass a plain path.
const readCss = (rel: string): string => readFileSync(decodeURIComponent(new URL(rel, import.meta.url).pathname), 'utf8');
const UI_CSS = readCss('../../src/ui/styles/ui.css');
const PANELS_CSS = readCss('../../src/ui/panels/panels.css');

/** Bodies of every `selector { … }` block (comments dropped, @media included). */
function cssBodies(css: string, selector: string): string[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1]!.trim() === selector).map((m) => m[2]!);
}

/** Emoji plus the text symbols the old screens used as icons. */
const EMOJI = /\p{Extended_Pictographic}|[▶▲▼✓✕★↺＋←→]/u;

function game(name = 'Quán Thử'): GameState {
  return createGameState(name, 'normal', 42);
}

function mount(el: HTMLElement): HTMLElement {
  document.body.append(el);
  el.hidden = false;
  return el;
}

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

function submit(form: HTMLFormElement): void {
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('format', () => {
  it('formats money, clock and rating the Vietnamese way', () => {
    expect(formatMoney(2465000)).toBe('2.465.000đ');
    expect(formatMoney(-450000)).toBe('−450.000đ');
    expect(formatClock(702)).toBe('11:42');
    expect(formatClock(420)).toBe('07:00');
    expect(formatRating(3.84)).toBe('3,8');
  });
});

describe('New Game', () => {
  it('accepts 1–24 characters after trimming', () => {
    expect(validateShopName('')).not.toBeNull();
    expect(validateShopName('    ')).not.toBeNull();
    expect(validateShopName('A')).toBeNull();
    expect(validateShopName('  Cà Phê  ')).toBeNull();
    expect(validateShopName('x'.repeat(24))).toBeNull();
    expect(validateShopName('x'.repeat(25))).not.toBeNull();
  });

  it('shows the error in place and does not start with an empty name', () => {
    const onStart = vi.fn();
    const screen = createNewGame({ onStart, onBack: vi.fn() });
    mount(screen.el);
    screen.onShow?.();
    const input = q<HTMLInputElement>(screen.el, 'input[type="text"]');
    input.value = '   ';
    submit(q<HTMLFormElement>(screen.el, 'form'));

    expect(onStart).not.toHaveBeenCalled();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(q(screen.el, '.field').classList.contains('field-error')).toBe(true);
    expect(q(screen.el, '.error-msg').hidden).toBe(false);
    const summary = q(screen.el, '.error-summary');
    expect(summary.hidden).toBe(false);
    expect(document.activeElement).toBe(summary);

    // Typing a valid name clears the error at once.
    input.value = 'Gió';
    input.dispatchEvent(new Event('input'));
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(summary.hidden).toBe(true);
  });

  it('starts with the trimmed name and the chosen difficulty, showing starting money', () => {
    const onStart = vi.fn();
    const screen = createNewGame({ onStart, onBack: vi.fn() });
    mount(screen.el);
    screen.onShow?.();
    expect(screen.el.textContent).toContain('Vốn 3.000.000đ');
    expect(screen.el.textContent).toContain('Vốn 2.000.000đ');
    expect(screen.el.textContent).toContain('Vốn 1.200.000đ');
    expect(q<HTMLInputElement>(screen.el, 'input[value="normal"]').checked).toBe(true);

    q<HTMLInputElement>(screen.el, 'input[type="text"]').value = '  Cà Phê Sáng  ';
    q<HTMLInputElement>(screen.el, 'input[value="hard"]').checked = true;
    submit(q<HTMLFormElement>(screen.el, 'form'));
    expect(onStart).toHaveBeenCalledWith('Cà Phê Sáng', 'hard');
  });
});

describe('Main Menu', () => {
  it('dims Load Game with a reason when there is no save', () => {
    const onLoad = vi.fn();
    const storage = createMemoryStorage();
    const menu = createMainMenu(storage, { onContinue: vi.fn(), onNewGame: vi.fn(), onLoad, onSettings: vi.fn() });
    mount(menu.el);
    menu.onShow?.();

    const load = q<HTMLButtonElement>(menu.el, '[data-action="load"]');
    expect(load.getAttribute('aria-disabled')).toBe('true');
    const reasonId = load.getAttribute('aria-describedby');
    expect(reasonId).toBeTruthy();
    expect(document.getElementById(reasonId!)?.textContent).toContain('Chưa có bản lưu');
    load.click();
    expect(onLoad).not.toHaveBeenCalled();
    expect(button(menu.el, 'Tiếp tục').hidden).toBe(true);
    expect(button(menu.el, 'Ván mới').classList.contains('btn-primary')).toBe(true);
  });

  it('hides Continue for real and focuses New Game when storage is empty', () => {
    const menu = createMainMenu(createMemoryStorage(), { onContinue: vi.fn(), onNewGame: vi.fn(), onLoad: vi.fn(), onSettings: vi.fn() });
    mount(menu.el);
    menu.onShow?.();

    const cont = button(menu.el, 'Tiếp tục');
    expect(cont.hidden).toBe(true);
    const newGame = button(menu.el, 'Ván mới');
    expect(menu.initialFocus?.()).toBe(newGame);
    expect(newGame.classList.contains('btn-primary')).toBe(true);
    expect([...menu.el.querySelectorAll('.btn-primary')].filter((b) => !(b as HTMLElement).hidden)).toEqual([newGame]);

    const load = q<HTMLButtonElement>(menu.el, '[data-action="load"]');
    expect(load.getAttribute('aria-disabled')).toBe('true');
    const reason = document.getElementById(load.getAttribute('aria-describedby')!);
    expect(reason?.hidden).toBe(false);
    expect(reason?.querySelector<HTMLElement>('.ic')?.dataset.icon).toBe('i-lock');

    // ↑ ↓ skip the hidden Continue button.
    newGame.focus();
    newGame.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement?.textContent).toContain('Cài đặt');
    (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(newGame);
  });

  it('draws the cup mascot as the logo and icons on every button', () => {
    const storage = createMemoryStorage();
    saveGame(game(), '1', storage, 1000);
    const menu = createMainMenu(storage, { onContinue: vi.fn(), onNewGame: vi.fn(), onLoad: vi.fn(), onSettings: vi.fn() });
    mount(menu.el);
    menu.onShow?.();
    const logo = q(menu.el, '.logo svg.logo-mark');
    expect(logo.getAttribute('aria-hidden')).toBe('true');
    expect(logo.querySelector('.m-cup')).toBeTruthy();
    expect(menu.initialFocus?.()).toBe(button(menu.el, 'Tiếp tục'));
    const hrefs = [...menu.el.querySelectorAll('.menu-list button')].map((b) => b.querySelector<HTMLElement>('.ic')?.dataset.icon);
    expect(hrefs).toEqual(['i-speed-1', 'i-sparkle', 'i-load', 'i-settings']);
  });

  it('enables Load Game and offers Continue once a save exists', () => {
    const onLoad = vi.fn();
    const onContinue = vi.fn();
    const storage = createMemoryStorage();
    saveGame(game('Gió Mùa'), '2', storage, 1000);
    const menu = createMainMenu(storage, { onContinue, onNewGame: vi.fn(), onLoad, onSettings: vi.fn() });
    mount(menu.el);
    menu.onShow?.();

    const load = q<HTMLButtonElement>(menu.el, '[data-action="load"]');
    expect(load.hasAttribute('aria-disabled')).toBe(false);
    load.click();
    expect(onLoad).toHaveBeenCalledOnce();
    const cont = button(menu.el, 'Tiếp tục');
    expect(cont.hidden).toBe(false);
    expect(cont.textContent).toContain('Gió Mùa · Ngày 1');
    cont.click();
    expect(onContinue).toHaveBeenCalledWith('2');
  });
});

describe('Load Game', () => {
  it('reports a broken slot without deleting it and loads good ones', () => {
    const storage = createMemoryStorage();
    storage.setItem(saveKey('3'), '{not json');
    saveGame(game('Tự Động'), 'auto', storage, 2000);
    const onLoaded = vi.fn();
    const screen = createLoadGame(storage, { onLoaded, onBack: vi.fn() });
    mount(screen.el);
    screen.onShow?.();

    const broken = q(screen.el, '[data-slot="3"]');
    expect(broken.classList.contains('slot-broken')).toBe(true);
    expect(broken.textContent).toContain('Hỏng');
    button(broken, 'Tải slot 3').click();
    expect(onLoaded).not.toHaveBeenCalled();
    expect(storage.getItem(saveKey('3'))).toBe('{not json');

    expect(q(screen.el, '[data-slot="1"]').classList.contains('slot-empty')).toBe(true);
    button(q(screen.el, '[data-slot="auto"]'), 'Tải tự lưu').click();
    expect(onLoaded).toHaveBeenCalledOnce();
    expect(onLoaded.mock.calls[0]![0].shopName).toBe('Tự Động');
  });

  it('deletes only after confirming in place', () => {
    const storage = createMemoryStorage();
    saveGame(game(), '1', storage);
    const screen = createLoadGame(storage, { onLoaded: vi.fn(), onBack: vi.fn() });
    mount(screen.el);
    screen.onShow?.();

    button(screen.el, 'Xóa Slot 1').click();
    expect(document.activeElement?.textContent).toBe('Hủy');
    button(screen.el, 'Hủy').click();
    expect(storage.getItem(saveKey('1'))).not.toBeNull();

    button(screen.el, 'Xóa Slot 1').click();
    button(screen.el, 'Xóa vĩnh viễn').click();
    expect(storage.getItem(saveKey('1'))).toBeNull();
    expect(q(screen.el, '[data-slot="1"]').classList.contains('slot-empty')).toBe(true);
  });
});

describe('Settings', () => {
  let storage: StorageLike;
  let changes: Settings[];

  beforeEach(() => {
    storage = createMemoryStorage();
    changes = [];
  });

  function open() {
    const screen = createSettings(storage, { ...DEFAULT_SETTINGS }, { onChange: (s) => changes.push(s), onBack: vi.fn() });
    mount(screen.el);
    screen.onShow?.();
    return screen;
  }

  it('saves and applies every change at once', () => {
    const screen = open();
    const music = q<HTMLInputElement>(screen.el, 'input[name="musicVolume"]');
    expect(music.value).toBe('50');
    music.value = '20';
    music.dispatchEvent(new Event('input'));
    expect(changes.at(-1)?.musicVolume).toBeCloseTo(0.2);
    expect(loadSettings(storage).musicVolume).toBeCloseTo(0.2);
    expect(screen.el.textContent).toContain('20%');

    const sfx = q<HTMLInputElement>(screen.el, 'input[name="sfxVolume"]');
    sfx.value = '0';
    sfx.dispatchEvent(new Event('input'));
    expect(loadSettings(storage).sfxVolume).toBe(0);

    const high = q<HTMLInputElement>(screen.el, 'input[data-setting="quality"][value="high"]');
    high.checked = true;
    high.dispatchEvent(new Event('change'));
    expect(changes.at(-1)?.quality).toBe('high');

    const fast = q<HTMLInputElement>(screen.el, 'input[data-setting="speed"][value="4"]');
    fast.checked = true;
    fast.dispatchEvent(new Event('change'));
    expect(changes.at(-1)?.gameSpeed).toBe(4);

    expect(q<HTMLInputElement>(screen.el, 'input[data-setting="cameraKeys"][value="qe-wasd"]').checked).toBe(true);
    const arrows = q<HTMLInputElement>(screen.el, 'input[data-setting="cameraKeys"][value="qa-arrows"]');
    arrows.checked = true;
    arrows.dispatchEvent(new Event('change'));
    expect(changes.at(-1)?.cameraKeys).toBe('qa-arrows');

    const normal = q<HTMLInputElement>(screen.el, 'input[data-setting="cameraRotateSpeed"][value="normal"]');
    expect(normal.checked).toBe(true);
    expect(normal.closest('[role="radiogroup"]')?.textContent).toBe('ChậmVừaNhanh');
    const slow = q<HTMLInputElement>(screen.el, 'input[data-setting="cameraRotateSpeed"][value="slow"]');
    slow.checked = true;
    slow.dispatchEvent(new Event('change'));
    expect(changes.at(-1)?.cameraRotateSpeed).toBe('slow');

    expect(loadSettings(storage)).toEqual({
      musicVolume: 0.2,
      sfxVolume: 0,
      quality: 'high',
      gameSpeed: 4,
      cameraKeys: 'qa-arrows',
      cameraRotateSpeed: 'slow',
      reducedMotion: 'system',
    });
    expect(q(screen.el, '[role="status"]').textContent).toContain('Đã lưu');

    // "Về mặc định" confirms in place: the first click only arms it.
    const reset = button(screen.el, 'Về mặc định');
    reset.click();
    expect(loadSettings(storage).quality).toBe('high');
    reset.click();
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    expect(music.value).toBe('50');
    expect(normal.checked).toBe(true);
  });

  it('still applies when storage cannot save', () => {
    storage.setItem = () => {
      throw new Error('quota');
    };
    const screen = open();
    const music = q<HTMLInputElement>(screen.el, 'input[name="musicVolume"]');
    music.value = '70';
    music.dispatchEvent(new Event('input'));
    expect(changes.at(-1)?.musicVolume).toBeCloseTo(0.7);
    expect(q(screen.el, '[role="status"]').classList.contains('is-error')).toBe(true);
  });
});

describe('HUD', () => {
  function makeHud(state: GameState) {
    const dispatch = vi.fn(() => true);
    const hud = createHud({ dispatch, getState: () => state, onPause: vi.fn(), onSettings: vi.fn(), onResetCamera: vi.fn() });
    mount(hud.el);
    document.body.append(hud.panelEl);
    hud.update(state);
    return { hud, dispatch };
  }

  it('follows the state and only touches the DOM when a value changes', () => {
    // Money counts up over frames; fake timers let the test skip to the end.
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const state = game();
    const { hud } = makeHud(state);
    const text = () => hud.el.textContent ?? '';
    expect(text()).toContain('07:00');
    expect(text()).toContain('2.000.000đ');
    expect(q(hud.el, '[aria-current="step"]').dataset.phase).toBe('preparation');
    expect(button(hud.el, 'Mở cửa').hidden).toBe(false);
    expect(q(hud.el, '.speed').hidden).toBe(true);

    state.money = 2465000;
    state.minute = 702;
    state.phase = 'peak';
    state.rating = 3.84;
    state.speed = 2;
    hud.update(state);
    vi.advanceTimersByTime(1000);
    expect(text()).toContain('11:42');
    expect(text()).toContain('2.465.000đ');
    expect(q(hud.el, '[role="img"]').getAttribute('aria-label')).toBe('3,8 trên 5 sao');
    const peak = q(hud.el, '[aria-current="step"]');
    expect(peak.dataset.phase).toBe('peak');
    expect(peak.classList.contains('is-peak')).toBe(true);
    expect(q(peak, '.ic').dataset.icon).toBe('i-flame');
    expect(q(hud.el, '[data-phase="opening"] .ic').dataset.icon).toBe('i-check');
    expect(q(hud.el, '[data-phase="closing"] .ic').dataset.icon).toBe('i-phase-close');
    expect(q(hud.el, '.speed').hidden).toBe(false);
    expect(button(hud.el, 'Mở cửa').hidden).toBe(true);
    expect(q(hud.el, '[data-speed="2"]').getAttribute('aria-pressed')).toBe('true');
    expect(q(hud.el, '[data-speed="1"]').getAttribute('aria-pressed')).toBe('false');

    // Unchanged values are not written again.
    const money = q(hud.el, '[data-stat="money"]');
    money.textContent = 'sentinel';
    hud.update(state);
    expect(money.textContent).toBe('sentinel');
    state.money += 1000;
    hud.update(state);
    vi.advanceTimersByTime(1000);
    expect(money.textContent).toContain('2.466.000đ');
  });

  it('sends speed and open commands, all buttons labelled', () => {
    const state = game();
    const { hud, dispatch } = makeHud(state);
    button(hud.el, 'Mở cửa').click();
    expect(dispatch).toHaveBeenCalledWith({ type: 'start_day' });
    q<HTMLButtonElement>(hud.el, '[data-speed="4"]').click();
    expect(dispatch).toHaveBeenCalledWith({ type: 'set_speed', speed: 4 });
    for (const b of hud.el.querySelectorAll('button')) {
      expect(b.getAttribute('aria-label') ?? b.textContent?.trim()).toBeTruthy();
    }
  });

  it('draws icons instead of emoji and keeps the media-script selectors', () => {
    const state = game();
    const { hud } = makeHud(state);
    const emoji = /\p{Extended_Pictographic}|[▶▲▼✓✕★]/u;
    const check = () => {
      expect(hud.el.textContent).not.toMatch(emoji);
      expect(hud.panelEl.textContent).not.toMatch(emoji);
    };
    check();
    expect(q(hud.el, '[data-action="open"] .ic').dataset.icon).toBe('i-open');
    expect(q(hud.el, '[data-stat="money"]').parentElement?.querySelector<HTMLElement>('.ic')?.dataset.icon).toBe('i-coin');
    state.phase = 'peak';
    hud.update(state);
    check();
    expect([...hud.el.querySelectorAll<HTMLElement>('[data-speed] .ic')].map((u) => u.dataset.icon)).toEqual(['i-speed-1', 'i-speed-2', 'i-speed-4']);
    expect(hud.el.querySelector('[data-action="pause"]')).toBeTruthy();
    const clockPill = [...hud.el.querySelectorAll<HTMLElement>('.hud .hud-stat')].find((p) => p.querySelector('[data-icon="i-clock"]'));
    expect(clockPill?.querySelector('b')?.textContent).toBe('07:00');
    state.phase = 'report';
    hud.update(state);
    check();
    expect(q(hud.el, '[data-action="next-day"] .ic').dataset.icon).toBe('i-next-day');
  });

  it('counts money up when it rises and jumps when it falls', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'performance'] });
    const state = game();
    const { hud } = makeHud(state);
    const money = q(hud.el, '[data-stat="money"]');
    state.money += 40000;
    hud.update(state);
    expect(money.textContent).toBe('2.000.000đ');
    vi.advanceTimersByTime(200);
    expect(money.textContent).not.toBe('2.000.000đ');
    expect(money.textContent).not.toBe('2.040.000đ');
    vi.advanceTimersByTime(400);
    expect(money.textContent).toBe('2.040.000đ');
    state.money = 1000;
    hud.update(state);
    expect(money.textContent).toBe('1.000đ');
    hud.dispose();
  });

  it('jumps straight to the new money under reduced motion', () => {
    const matchMedia = vi.fn((query: string) => ({ matches: query.includes('reduce') }) as MediaQueryList);
    vi.stubGlobal('matchMedia', matchMedia);
    try {
      const state = game();
      const { hud } = makeHud(state);
      state.money += 40000;
      hud.update(state);
      expect(q(hud.el, '[data-stat="money"]').textContent).toBe('2.040.000đ');
      expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('puts the seven panels in a bottom dock that tracks the open panel', () => {
    const state = game();
    const { hud } = makeHud(state);
    const offs = [
      ...['tasks', 'menu', 'inventory', 'staff', 'marketing', 'upgrades', 'reviews'].map((id) =>
        registerPanel(id, id, 'i-tasks', (body) => {
          body.append(Object.assign(document.createElement('button'), { textContent: `in ${id}` }));
        }),
      ),
    ];
    try {
      const dock = q(hud.el, 'nav.dock');
      expect(dock.getAttribute('aria-label')).toBe('Bảng quản lý');
      expect(dock.closest('header')).toBeNull();
      const buttons = [...dock.querySelectorAll<HTMLButtonElement>('button[data-panel]')];
      expect(buttons).toHaveLength(7);
      for (const b of buttons) {
        expect(b.getAttribute('aria-controls')).toBe('ui-panel');
        expect(b.getAttribute('aria-pressed')).toBe('false');
        expect(b.querySelector('.ic.ic-lg[aria-hidden="true"][data-icon]')).toBeTruthy();
      }

      const kho = q<HTMLButtonElement>(dock, '[data-panel="inventory"]');
      kho.focus();
      kho.click();
      expect(kho.getAttribute('aria-pressed')).toBe('true');
      expect(buttons.filter((b) => b.getAttribute('aria-pressed') === 'true')).toEqual([kho]);
      expect(hud.panelEl.contains(document.activeElement)).toBe(true);

      // Switching panels moves the pressed state; the buttons are not rebuilt.
      q<HTMLButtonElement>(dock, '[data-panel="staff"]').click();
      expect(kho.isConnected).toBe(true);
      expect(kho.getAttribute('aria-pressed')).toBe('false');
      expect(q(dock, '[data-panel="staff"]').getAttribute('aria-pressed')).toBe('true');

      // Clicking the open panel's button closes it.
      q<HTMLButtonElement>(dock, '[data-panel="staff"]').click();
      expect(hud.panelEl.hidden).toBe(true);
      expect(buttons.every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    } finally {
      offs.forEach((off) => off());
    }
  });

  it('places the open panel between the measured HUD and dock, with only its body scrolling', () => {
    const root = document.createElement('div');
    root.id = 'ui';
    document.body.append(root);
    const state = game();
    const hud = createHud({ dispatch: vi.fn(() => true), getState: () => state, onPause: vi.fn(), onSettings: vi.fn(), onResetCamera: vi.fn() });
    root.append(hud.el, hud.panelEl);
    hud.el.hidden = false;
    hud.update(state);
    const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 390, width: 390, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this === root) return rect(0, 844);
      if (this.classList.contains('hud')) return rect(12, 120);
      if (this.classList.contains('dock')) return rect(660, 832);
      return rect(0, 0);
    });
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    const off = registerPanel('inventory', 'Kho', 'i-inventory', (body) => {
      body.append(Object.assign(document.createElement('button'), { textContent: 'Nhập hàng' }));
    });
    try {
      q<HTMLButtonElement>(hud.el, '.dock [data-panel="inventory"]').click();
      expect(hud.panelEl.hidden).toBe(false);
      expect(root.style.getPropertyValue('--hud-h')).toBe('120px');
      expect(root.style.getPropertyValue('--dock-h')).toBe('184px');
      // Opening focuses the first control without scrolling the head away.
      expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });

      // Head after the Kho mockup: icon tile, title, a level-4 close button.
      const head = q(hud.panelEl, '.panel-head');
      expect(q(head, '.panel-head-icon .ic').dataset.icon).toBe('i-inventory');
      expect(q(head, 'h2').textContent).toBe('Kho');
      const close = q<HTMLButtonElement>(head, 'button[aria-label="Đóng bảng (Esc)"]');
      expect(close.className).toBe('icon-btn');
      expect(q(close, '.ic').dataset.icon).toBe('i-close');

      // ui.css: top and bottom come from the measured edges at every width;
      // no rule pins the panel to the top or caps it as a bottom sheet.
      const panelRules = cssBodies(UI_CSS, '#ui > .panel');
      expect(panelRules[0]).toMatch(/top:\s*calc\(var\(--hud-h\b/);
      expect(panelRules[0]).toMatch(/bottom:\s*calc\(var\(--dock-h\b/);
      expect(panelRules[0]).toMatch(/flex-direction:\s*column/);
      // Not a scroll container, so focusing a body control cannot scroll the head away.
      expect(panelRules[0]).toMatch(/overflow:\s*clip/);
      for (const body of panelRules) expect(body).not.toMatch(/\b(top|bottom):\s*(0|auto)\b|max-height/);
      // .panel-body is the one scroll area; the foot sticks at its bottom with no negative margin.
      const bodyRule = cssBodies(UI_CSS, '.panel-body').join('');
      expect(bodyRule).toMatch(/overflow:\s*auto/);
      expect(bodyRule).toMatch(/min-height:\s*0/);
      expect(cssBodies(UI_CSS, '.panel-head').join('')).toMatch(/flex:\s*none/);
      const foot = cssBodies(PANELS_CSS, '.prep .panel-foot').join('');
      expect(foot).toMatch(/position:\s*sticky/);
      expect(foot).toMatch(/bottom:\s*0;/);
      expect(foot).not.toMatch(/-1 \*|margin:/);
      // Ticks are masked i-check icons; the Nunito subset has no ✓ glyph.
      expect(UI_CSS + PANELS_CSS).not.toContain('✓');
    } finally {
      off();
      hud.dispose();
      vi.restoreAllMocks();
    }
  });

  it('closes the panel on Esc and returns focus to its dock button', () => {
    const state = game();
    const { hud } = makeHud(state);
    const off = registerPanel('menu', 'Menu', 'i-menu', (body) => {
      body.append(Object.assign(document.createElement('button'), { textContent: 'Bật món' }));
    });
    try {
      const open = q<HTMLButtonElement>(hud.el, '.dock [data-panel="menu"]');
      open.focus();
      open.click();
      const inside = document.activeElement as HTMLElement;
      expect(inside.textContent).toBe('Bật món');
      inside.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(hud.panelEl.hidden).toBe(true);
      expect(hud.openPanelId).toBeNull();
      expect(open.getAttribute('aria-pressed')).toBe('false');
      expect(document.activeElement).toBe(open);
    } finally {
      off();
    }
  });

  it('shows registered panels and opens them in the side panel', () => {
    const state = game();
    const { hud } = makeHud(state);
    const update = vi.fn();
    const off = registerPanel('stock', 'Kho', 'i-inventory', (body) => {
      body.append(Object.assign(document.createElement('button'), { textContent: 'Nhập hàng' }));
      return { update };
    });
    const open = q<HTMLButtonElement>(hud.el, '[data-panel="stock"]');
    open.click();
    expect(hud.openPanelId).toBe('stock');
    expect(hud.panelEl.hidden).toBe(false);
    expect(hud.panelEl.textContent).toContain('Nhập hàng');
    hud.update(state);
    expect(update).toHaveBeenCalledWith(state);
    hud.panelEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(hud.panelEl.hidden).toBe(true);
    off();
    expect(hud.el.querySelector('[data-panel="stock"]')).toBeNull();
  });

  describe('dock badges', () => {
    /** Name as a screen reader builds it from content: aria-hidden parts dropped. */
    function spokenName(el: Element): string {
      let out = '';
      for (const node of el.childNodes) {
        if (node instanceof Element) {
          if (node.getAttribute('aria-hidden') === 'true') continue;
          out += spokenName(node);
        } else out += node.textContent ?? '';
      }
      return out.trim();
    }

    function fillStock(state: GameState, qty: number): void {
      for (const def of INGREDIENTS) {
        const item = state.inventory.find((i) => i.id === def.id);
        if (item) item.qty = qty;
        else state.inventory.push({ id: def.id, qty });
      }
    }

    it('counts low and empty stock on Kho, says it in words and hides at zero', () => {
      const state = game();
      fillStock(state, 1_000_000);
      const { hud } = makeHud(state);
      const off = registerPrepPanels();
      try {
        const kho = q<HTMLButtonElement>(hud.el, '.dock [data-panel="inventory"]');
        const badge = q(kho, '.dock-badge');
        expect(badge.getAttribute('aria-hidden')).toBe('true');
        expect(badge.hidden).toBe(true);
        expect(spokenName(kho)).toBe('Kho');

        const [a, b] = INGREDIENTS;
        state.inventory.find((i) => i.id === a!.id)!.qty = 0;
        state.inventory.find((i) => i.id === b!.id)!.qty = b!.lowStock - 1;
        hud.update(state);
        expect(badge.hidden).toBe(false);
        expect(badge.textContent).toBe('2');
        expect(lowStockCount(state)).toBe(2);
        expect(spokenName(kho)).toBe('Kho, 2 mục cần chú ý');
        expect(kho.dataset.panel).toBe('inventory');
        expect(kho.getAttribute('aria-controls')).toBe('ui-panel');
        expect(kho.getAttribute('aria-pressed')).toBe('false');

        // Same count: the badge is not written again.
        badge.textContent = 'sentinel';
        hud.update(state);
        expect(badge.textContent).toBe('sentinel');

        fillStock(state, 1_000_000);
        hud.update(state);
        expect(badge.hidden).toBe(true);
        expect(spokenName(kho)).toBe('Kho');
        // Panels without a badge function get no badge.
        expect(hud.el.querySelector('.dock [data-panel="menu"] .dock-badge')).toBeNull();
      } finally {
        off();
      }
    });

    it('drops the Việc count when a task gets done', () => {
      const state = game();
      fillStock(state, 0);
      const { hud } = makeHud(state);
      const off = registerPrepPanels();
      try {
        const viec = q<HTMLButtonElement>(hud.el, '.dock [data-panel="tasks"]');
        const badge = q(viec, '.dock-badge');
        const before = openTaskCount(state);
        expect(before).toBeGreaterThan(0);
        expect(badge.textContent).toBe(String(before));
        expect(spokenName(viec)).toBe(`Việc, ${before} mục cần chú ý`);

        // A full store finishes "Nhập nguyên liệu".
        fillStock(state, 1_000_000);
        hud.update(state);
        const after = openTaskCount(state);
        expect(after).toBeLessThan(before);
        expect(badge.hidden).toBe(after === 0);
        expect(badge.textContent).toBe(after > 0 ? String(after) : '');
      } finally {
        off();
      }
    });
  });

  it('announces a camera reset in a polite live region, then restores the button', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const state = game();
    const { hud } = makeHud(state);
    const reset = q<HTMLButtonElement>(hud.el, '[aria-label="Đặt lại camera (Home)"]');
    const live = q(hud.el, '[data-live="camera"]');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('');

    reset.click();
    expect(live.textContent).toBe('Đã đặt lại camera.');
    expect(reset.textContent).toContain('Đã đặt lại');
    expect(q(reset, '.ic').dataset.icon).toBe('i-check');

    vi.advanceTimersByTime(1500);
    expect(live.textContent).toBe('');
    expect(reset.textContent).not.toContain('Đã đặt lại');
    expect(q(reset, '.ic').dataset.icon).toBe('i-camera');
    hud.dispose();
  });
});

describe('audio', () => {
  it('maps events to sounds and stays silent before unlock or without Web Audio', () => {
    expect(soundForEvent({ type: 'doorbell', customerId: 1 })).toBe('doorbell');
    expect(soundForEvent({ type: 'cash', amount: 1, pos: { x: 0, z: 0 } })).toBe('cash');
    expect(soundForEvent({ type: 'angry', customerId: 1 })).toBe('angry');
    expect(soundForEvent({ type: 'served', customerId: 1, itemId: 'latte' })).toBeNull();
    const audio = createAudio({ music: 0.5, sfx: 0.5 });
    expect(() => {
      audio.handleEvents([{ type: 'doorbell', customerId: 1 }]);
      audio.unlock();
      audio.setMusic(true);
      audio.play('cash');
      audio.dispose();
    }).not.toThrow();
  });
});

describe('Watcher', () => {
  it('applies only on change', () => {
    const apply = vi.fn();
    const w = new Watcher<{ v: number }>().watch((s) => s.v, apply);
    w.run({ v: 1 });
    w.run({ v: 1 });
    w.run({ v: 2 });
    expect(apply).toHaveBeenCalledTimes(2);
  });
});

describe('Toasts', () => {
  it('auto-hides info, keeps errors, merges repeats and caps at 3', () => {
    vi.useFakeTimers();
    const t = new Toasts();
    mount(t.el);
    t.show({ level: 'info', title: 'Mở cửa' });
    t.show({ level: 'error', title: 'Khách bỏ đi', key: 'angry' });
    t.show({ level: 'error', title: 'Khách bỏ đi', key: 'angry' });
    expect(t.count).toBe(2);
    expect(t.el.textContent).toContain('Khách bỏ đi ×2');
    vi.advanceTimersByTime(TOAST_VISIBLE_MS + 10);
    expect(t.count).toBe(1);
    expect(t.el.querySelector('[role="alert"]')).not.toBeNull();
    for (let i = 0; i < 5; i++) t.show({ level: 'warning', title: `W${i}` });
    expect(t.count).toBe(MAX_TOASTS);
  });

  it('shows an svg icon per level, never takes focus, and lets events pick theirs', () => {
    const t = new Toasts();
    mount(t.el);
    const before = document.createElement('button');
    document.body.append(before);
    before.focus();
    const levels = ['info', 'success', 'warning', 'error'] as const;
    for (const level of levels) t.show({ level, title: level });
    expect([...t.el.querySelectorAll<HTMLElement>('.toast-icon .ic')].map((u) => u.dataset.icon)).toEqual(['i-ok', 'i-warning', 'i-error']);
    expect(document.activeElement).toBe(before);
    t.clear();
    t.show({ level: 'info', title: 'Mở cửa' });
    expect(q(t.el, '.toast-icon .ic').dataset.icon).toBe('i-info');
    expect(q(t.el, '.toast-icon .ic').getAttribute('aria-hidden')).toBe('true');

    const state = game();
    const angry = toastForEvent({ type: 'angry', customerId: 1 }, state);
    expect(angry).toMatchObject({ level: 'error', icon: 'i-face-angry' });
    expect(toastForEvent({ type: 'low_stock', ingredientId: 'milk' }, state)?.icon).toBe('i-milk');
    t.show(angry!);
    expect(t.el.querySelector<HTMLElement>('.toast-error .toast-icon .ic')?.dataset.icon).toBe('i-face-angry');
    expect(t.el.textContent).not.toMatch(EMOJI);
  });
});

describe('no emoji on the screens', () => {
  it('main menu, new game, load, settings and pause draw icons, not emoji', () => {
    const empty = createMainMenu(createMemoryStorage(), { onContinue: vi.fn(), onNewGame: vi.fn(), onLoad: vi.fn(), onSettings: vi.fn() });
    mount(empty.el);
    empty.onShow?.();
    expect(empty.el.textContent).not.toMatch(EMOJI);

    const storage = createMemoryStorage();
    saveGame(game(), '1', storage, 1000);
    saveGame(game(), 'auto', storage, 2000);
    storage.setItem(saveKey('3'), '{not json');
    const menu = createMainMenu(storage, { onContinue: vi.fn(), onNewGame: vi.fn(), onLoad: vi.fn(), onSettings: vi.fn() });
    mount(menu.el);
    menu.onShow?.();
    expect(menu.el.textContent).not.toMatch(EMOJI);

    const ng = createNewGame({ onStart: vi.fn(), onBack: vi.fn() });
    mount(ng.el);
    ng.onShow?.();
    q<HTMLInputElement>(ng.el, 'input[type="text"]').value = '';
    submit(q<HTMLFormElement>(ng.el, 'form'));
    expect(q(ng.el, '.error-summary').hidden).toBe(false);
    expect(ng.el.textContent).not.toMatch(EMOJI);
    // capture-media picks the difficulty with this selector.
    expect(ng.el.querySelector('label.choice input[value=easy]')).toBeTruthy();

    const load = createLoadGame(storage, { onLoaded: vi.fn(), onBack: vi.fn() });
    mount(load.el);
    load.onShow?.();
    button(load.el, 'Xóa Slot 1').click();
    expect(load.el.textContent).not.toMatch(EMOJI);

    const settings = createSettings(createMemoryStorage(), { ...DEFAULT_SETTINGS }, { onChange: vi.fn(), onBack: vi.fn() });
    mount(settings.el);
    settings.onShow?.();
    const resetBtn = button(settings.el, 'Về mặc định');
    resetBtn.click();
    resetBtn.click();
    expect(q(settings.el, '[role="status"]').textContent).toContain('Đã lưu');
    expect(settings.el.textContent).not.toMatch(EMOJI);

    const root = document.createElement('div');
    document.body.append(root);
    const shell = createShell({ root, storage, settings: { ...DEFAULT_SETTINGS }, seed: () => 7 });
    try {
      shell.startGame(game());
      shell.openPause();
      const pause = q(root, '.ui-screen:not([hidden]) .w-pause');
      q<HTMLButtonElement>(pause, '[data-save-slot="2"]').click();
      expect(pause.textContent).toContain('Đã lưu vào Slot 2');
      expect(pause.textContent).not.toMatch(EMOJI);
      shell.handleEvents([{ type: 'dayEnded', day: 1 }]);
      expect(q(root, '.toasts .toast-icon .ic').dataset.icon).toBe('i-save');
      expect(q(root, '.toasts').textContent).not.toMatch(EMOJI);
    } finally {
      shell.dispose();
    }
  });

  it('keeps the CSS boot screen emoji-free with its ids and classes', () => {
    expect(INDEX_HTML).not.toMatch(EMOJI);
    const doc = new DOMParser().parseFromString(INDEX_HTML, 'text/html');
    const boot = doc.getElementById('boot');
    expect(boot?.getAttribute('role')).toBe('status');
    expect(boot?.querySelector('svg.boot-mark[aria-hidden="true"]')).toBeTruthy();
    expect(boot?.querySelector('.boot-bar > span')).toBeTruthy();
    expect(doc.querySelector('canvas#scene')).toBeTruthy();
    expect(INDEX_HTML).toContain('#boot.is-done');
    expect(INDEX_HTML).toContain('#scene.is-ready');
    expect(INDEX_HTML).toMatch(/@media \(prefers-reduced-motion: reduce\)[^}]*\.boot-mark/);
  });
});

describe('Shell', () => {
  let shell: Shell | null = null;
  afterEach(() => {
    shell?.dispose();
    shell = null;
  });

  function boot(storage: StorageLike = createMemoryStorage(), onSettingsChange = vi.fn()) {
    const root = document.createElement('div');
    document.body.append(root);
    shell = createShell({ root, storage, settings: { ...DEFAULT_SETTINGS, gameSpeed: 2 }, onSettingsChange, seed: () => 7 });
    return { root, storage, shell, onSettingsChange };
  }

  it('goes from the main menu to gameplay through New Game', () => {
    const { root, shell } = boot();
    expect(shell.screen).toBe('menu');
    expect(shell.hud.el.hidden).toBe(true);
    button(root, 'Ván mới').click();
    expect(shell.screen).toBe('newGame');
    q<HTMLInputElement>(root, 'input[type="text"]').value = 'Quán Gió';
    submit(q<HTMLFormElement>(root, 'form'));

    expect(shell.screen).toBeNull();
    expect(shell.state?.shopName).toBe('Quán Gió');
    expect(shell.state?.speed).toBe(2);
    expect(shell.hud.el.hidden).toBe(false);
    expect(shell.dispatch({ type: 'start_day' })).toBe(true);
    expect(shell.state?.phase).toBe('opening');
  });

  it('pauses on Space and Esc, and resumes', () => {
    const { shell } = boot();
    shell.startGame(game());
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
    expect(shell.screen).toBe('pause');
    expect(shell.state?.paused).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
    expect(shell.screen).toBeNull();
    expect(shell.state?.paused).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(shell.screen).toBe('pause');
  });

  it('applies settings opened from the HUD and returns to pause', () => {
    const { root, shell, storage, onSettingsChange } = boot();
    shell.startGame(game());
    q<HTMLButtonElement>(shell.hud.el, 'button[aria-label="Cài đặt"]').click();
    expect(shell.screen).toBe('settings');
    expect(shell.state?.paused).toBe(true);
    const fast = q<HTMLInputElement>(root, 'input[data-setting="speed"][value="4"]');
    fast.checked = true;
    fast.dispatchEvent(new Event('change'));
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ gameSpeed: 4 }));
    expect(shell.state?.speed).toBe(4);
    expect(loadSettings(storage).gameSpeed).toBe(4);
    button(root, 'Xong').click();
    expect(shell.screen).toBe('pause');
  });

  it('autosaves on dayEnded and toasts sim events', () => {
    const { root, storage, shell } = boot();
    shell.startGame(game('Ngày Một'));
    shell.handleEvents([
      { type: 'notify', level: 'info', text: 'Quán đã mở cửa!' },
      { type: 'low_stock', ingredientId: 'milk' },
      { type: 'dayEnded', day: 1 },
    ]);
    expect(storage.getItem(saveKey('auto'))).toContain('Ngày Một');
    const text = root.querySelector('.toasts')?.textContent ?? '';
    expect(text).toContain('Quán đã mở cửa!');
    expect(text).toContain('Sắp hết');
    expect(text).toContain('Đã tự lưu ngày 1');
  });

  it('toasts an error when the autosave fails', () => {
    const storage = createMemoryStorage();
    storage.setItem = () => {
      throw new Error('quota');
    };
    const { root, shell } = boot(storage);
    shell.startGame(game());
    shell.handleEvents([{ type: 'dayEnded', day: 1 }]);
    expect(root.querySelector('.toasts [role="alert"]')?.textContent).toContain('Không tự lưu được');
  });

  it('follows an insight link from the report: next day, report hidden, the linked panel open', () => {
    const offPanels = registerPrepPanels();
    try {
      const played = game('Gợi Ý');
      expect(simDispatch(played, { type: 'apply_restock' })).toBe(true);
      playDay(played);
      const report = played.lastReport!;
      // Pin one flagged metric with a panel link so the action list always has it.
      report.insights!.metrics = report.insights!.metrics.map((m) =>
        m.id === 'seat_fill' ? { ...m, status: 'bad', advice: 'Ghế gần kín: thêm bàn.', panel: 'upgrades' } : m,
      );
      const { root, shell } = boot();
      shell.startGame(played);
      expect(shell.state?.phase).toBe('report');
      expect(shell.report.visible).toBe(true);
      const day = shell.state!.day;

      q<HTMLButtonElement>(shell.report.el, '[role="tab"][data-tab="insights"]').click();
      q<HTMLButtonElement>(shell.report.el, '[data-metric="seat_fill"] button[data-goto="upgrades"]').click();

      expect(shell.state?.phase).toBe('preparation');
      expect(shell.state?.day).toBe(day + 1);
      expect(shell.report.visible).toBe(false);
      expect(shell.report.el.hidden).toBe(true);
      expect(shell.hud.openPanelId).toBe('upgrades');
      expect(shell.hud.panelEl.hidden).toBe(false);
      expect(q(root, '.dock [data-panel="upgrades"]').getAttribute('aria-pressed')).toBe('true');
    } finally {
      offPanels();
    }
  });

  it('saves into a slot from the pause overlay and goes back to the menu', () => {
    const { root, storage, shell } = boot();
    shell.startGame(game('Lưu Tay'));
    shell.openPause();
    q<HTMLButtonElement>(root, '[data-save-slot="2"]').click();
    expect(storage.getItem(saveKey('2'))).toContain('Lưu Tay');
    button(root, 'Về Main Menu').click();
    expect(shell.state).toBeNull();
    expect(shell.screen).toBe('menu');
    expect(q(root, '[data-action="load"]').hasAttribute('aria-disabled')).toBe(false);
  });
});
