// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudio, soundForEvent } from '../../src/audio';
import { saveGame, saveKey } from '../../src/save/save';
import { DEFAULT_SETTINGS, loadSettings, type Settings } from '../../src/save/settings';
import { createMemoryStorage, type StorageLike } from '../../src/save/storage';
import { createNewGame as createGameState } from '../../src/sim/state';
import type { GameState } from '../../src/sim/types';
import { Watcher } from '../../src/ui/core/dom';
import { formatClock, formatMoney, formatRating } from '../../src/ui/core/format';
import { MAX_TOASTS, TOAST_VISIBLE_MS, Toasts } from '../../src/ui/core/toast';
import { createHud } from '../../src/ui/hud/hud';
import { registerPanel } from '../../src/ui/hud/panels';
import { createLoadGame } from '../../src/ui/screens/loadGame';
import { createMainMenu } from '../../src/ui/screens/mainMenu';
import { createNewGame, validateShopName } from '../../src/ui/screens/newGame';
import { createSettings } from '../../src/ui/screens/settings';
import { createShell, type Shell } from '../../src/ui/screens/shell';

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

    const keys = q<HTMLButtonElement>(screen.el, '[role="switch"]');
    expect(keys.getAttribute('aria-checked')).toBe('true');
    keys.click();
    expect(keys.getAttribute('aria-checked')).toBe('false');
    expect(changes.at(-1)?.cameraKeys).toBe('qa-arrows');

    expect(loadSettings(storage)).toEqual({ musicVolume: 0.2, sfxVolume: 0, quality: 'high', gameSpeed: 4, cameraKeys: 'qa-arrows' });
    expect(q(screen.el, '[role="status"]').textContent).toContain('Đã lưu');

    button(screen.el, 'Về mặc định').click();
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    expect(music.value).toBe('50');
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
    expect(q(peak, 'use').getAttribute('href')).toBe('#i-flame');
    expect(q(hud.el, '[data-phase="opening"] use').getAttribute('href')).toBe('#i-check');
    expect(q(hud.el, '[data-phase="closing"] use').getAttribute('href')).toBe('#i-phase-close');
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
    expect(q(hud.el, '[data-action="open"] use').getAttribute('href')).toBe('#i-open');
    expect(q(hud.el, '[data-stat="money"]').parentElement?.querySelector('use')?.getAttribute('href')).toBe('#i-coin');
    state.phase = 'peak';
    hud.update(state);
    check();
    expect([...hud.el.querySelectorAll('[data-speed] use')].map((u) => u.getAttribute('href'))).toEqual(['#i-speed-1', '#i-speed-2', '#i-speed-4']);
    expect(hud.el.querySelector('[data-action="pause"]')).toBeTruthy();
    expect(hud.el.querySelectorAll('.hud .hud-stat b')[1]?.textContent).toBe('07:00');
    state.phase = 'report';
    hud.update(state);
    check();
    expect(q(hud.el, '[data-action="next-day"] use').getAttribute('href')).toBe('#i-next-day');
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
        expect(b.querySelector('svg.ic-lg use')).toBeTruthy();
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
