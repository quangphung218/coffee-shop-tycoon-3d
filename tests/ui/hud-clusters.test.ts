// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNewGame } from '../../src/sim/state';
import type { GameState, Phase } from '../../src/sim/types';
import { createHud, type Hud } from '../../src/ui/hud/hud';

function game(): GameState {
  return createNewGame('Quán Thử', 'normal', 42);
}

function q<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

interface Mounted {
  hud: Hud;
  bar: HTMLElement;
  onSettings: ReturnType<typeof vi.fn>;
  onResetCamera: ReturnType<typeof vi.fn>;
}

let mounted: Hud | null = null;

function mountHud(state: GameState): Mounted {
  const onSettings = vi.fn();
  const onResetCamera = vi.fn();
  const hud = createHud({ dispatch: () => true, getState: () => state, onPause() {}, onSettings, onResetCamera });
  mounted = hud;
  document.body.append(hud.el, hud.panelEl);
  hud.el.hidden = false;
  hud.update(state);
  return { hud, bar: q(hud.el, 'header.hud'), onSettings, onResetCamera };
}

/** Visible text of an element: sr-only and aria-hidden parts dropped. */
function visibleText(el: Element): string {
  let out = '';
  for (const node of el.childNodes) {
    if (node instanceof Element) {
      if (node.classList.contains('sr-only') || node.getAttribute('aria-hidden') === 'true') continue;
      out += visibleText(node);
    } else out += node.textContent ?? '';
  }
  return out;
}

afterEach(() => {
  mounted?.dispose();
  mounted = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('HUD clusters (P23)', () => {
  it('has exactly three clusters: Hôm nay, Tiến độ, Điều khiển', () => {
    const { bar } = mountHud(game());
    const clusters = [...bar.querySelectorAll<HTMLElement>(':scope > .hud-cluster')];
    expect(clusters).toHaveLength(3);
    expect(clusters.map((c) => c.dataset.cluster)).toEqual(['today', 'progress', 'controls']);
    expect(clusters.map((c) => c.getAttribute('aria-label'))).toEqual(['Hôm nay', 'Tiến độ', 'Điều khiển']);
    for (const c of clusters) expect(c.getAttribute('role')).toBe('group');
    // Nothing else in the bar draws a frame: only the note and the live region sit beside the clusters.
    const others = [...bar.children].filter((c) => !c.classList.contains('hud-cluster'));
    expect(others.map((c) => c.className)).toEqual(['hud-note', 'sr-only']);
  });

  it('puts each value in its cluster', () => {
    const { bar } = mountHud(game());
    const today = q(bar, '[data-cluster="today"]');
    const progress = q(bar, '[data-cluster="progress"]');
    const controls = q(bar, '[data-cluster="controls"]');
    for (const sel of ['[data-stat="day"]', '[data-stat="week"]', '[data-chip="weather"]', '[data-stat="clock"]', 'ol.phases']) {
      expect(today.querySelector(sel), sel).toBeTruthy();
    }
    for (const sel of ['[data-stat="money"]', '[role="img"][aria-label$="trên 5 sao"]', '[data-stat="level"]']) {
      expect(progress.querySelector(sel), sel).toBeTruthy();
    }
    for (const sel of ['[data-action="open"]', '[data-action="next-day"]', '.speed', '[data-action="pause"]', '[data-action="more"]']) {
      expect(controls.querySelector(sel), sel).toBeTruthy();
    }
  });

  it('drops the "Tiền" and "Giờ" captions for icons, keeping the words for a screen reader', () => {
    const { bar } = mountHud(game());
    expect(bar.querySelector('small:not([data-stat])')).toBeNull();
    for (const [stat, word, iconId] of [
      ['money', 'Tiền', 'i-coin'],
      ['clock', 'Giờ', 'i-clock'],
    ] as const) {
      const val = q(bar, `[data-stat="${stat}"]`).parentElement!;
      expect(visibleText(val)).not.toContain(word);
      expect(q(val, '.sr-only').textContent).toBe(`${word} `);
      expect(val.title).toBe(word);
      expect(q(val, '.ic').dataset.icon).toBe(iconId);
    }
  });

  it.each<Phase>(['preparation', 'peak', 'closing', 'report'])('names every button in the %s phase', (phase) => {
    const state = game();
    state.phase = phase;
    const { bar } = mountHud(state);
    for (const b of bar.querySelectorAll<HTMLButtonElement>('button')) {
      const name = b.getAttribute('aria-label') ?? visibleText(b).trim();
      expect(name, b.outerHTML).toBeTruthy();
      // An icon-only button must carry an aria-label.
      if (!visibleText(b).trim()) expect(b.getAttribute('aria-label'), b.outerHTML).toBeTruthy();
    }
  });

  it('keeps the aria-labels of the icon controls', () => {
    const { bar } = mountHud(game());
    const labels = [...bar.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label'));
    for (const label of ['Tạm dừng (Space)', 'Camera và cài đặt', 'Đặt lại camera (Home)', 'Cài đặt', 'Tốc độ game', 'Tốc độ 1x', 'Tốc độ 2x', 'Tốc độ 4x', 'Pha trong ngày', 'Kinh nghiệm cấp quán']) {
      expect(labels, label).toContain(label);
    }
    expect(q(bar, '[data-action="open"]').title).toContain('07:00');
  });

  it('shows the phases as a strip with every name in the list and the current one marked', () => {
    const state = game();
    state.phase = 'peak';
    const { bar } = mountHud(state);
    const items = [...bar.querySelectorAll<HTMLElement>('ol.phases li')];
    expect(items.map((li) => li.textContent)).toEqual(['Chuẩn bị', 'Mở cửa', 'Cao điểm', 'Đóng cửa']);
    expect(items.filter((li) => li.getAttribute('aria-current') === 'step').map((li) => li.dataset.phase)).toEqual(['peak']);
    expect(items.filter((li) => li.classList.contains('is-done')).map((li) => li.dataset.phase)).toEqual(['preparation', 'opening']);
  });

  it('shows no note while preparing; the open button says why the clock waits', () => {
    const { bar } = mountHud(game());
    expect(q(bar, '.hud-note').hidden).toBe(true);
  });
});

describe('HUD camera and settings menu', () => {
  it('opens in place, moves with the arrows and closes on Esc without reaching the shell', () => {
    const { bar } = mountHud(game());
    const btn = q<HTMLButtonElement>(bar, '[data-action="more"]');
    const menu = q(bar, '[role="menu"]');
    expect(btn.getAttribute('aria-haspopup')).toBe('menu');
    expect(btn.getAttribute('aria-controls')).toBe(menu.id);
    expect(menu.hidden).toBe(true);
    expect(menu.closest('[data-cluster]')?.getAttribute('data-cluster')).toBe('controls');
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    btn.click();
    expect(menu.hidden).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    const items = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    expect(items.map((i) => i.getAttribute('aria-label'))).toEqual(['Đặt lại camera (Home)', 'Cài đặt']);
    expect(document.activeElement).toBe(items[0]);
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(items[1]);
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(items[0]);
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(items[1]);

    const shell = vi.fn();
    window.addEventListener('keydown', shell);
    try {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    } finally {
      window.removeEventListener('keydown', shell);
    }
    expect(shell).not.toHaveBeenCalled();
    expect(menu.hidden).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(btn);
  });

  it('opens settings and closes; resets the camera and stays open to show the tick', () => {
    const { bar, onSettings, onResetCamera } = mountHud(game());
    const btn = q<HTMLButtonElement>(bar, '[data-action="more"]');
    const menu = q(bar, '[role="menu"]');
    btn.click();
    q<HTMLButtonElement>(menu, '[aria-label="Đặt lại camera (Home)"]').click();
    expect(onResetCamera).toHaveBeenCalledTimes(1);
    expect(menu.hidden).toBe(false);
    q<HTMLButtonElement>(menu, '[aria-label="Cài đặt"]').click();
    expect(onSettings).toHaveBeenCalledTimes(1);
    expect(menu.hidden).toBe(true);
  });

  it('closes on a click outside', () => {
    const { bar } = mountHud(game());
    const btn = q<HTMLButtonElement>(bar, '[data-action="more"]');
    const menu = q(bar, '[role="menu"]');
    btn.click();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menu.hidden).toBe(true);
    // A click on the button itself toggles instead.
    btn.click();
    expect(menu.hidden).toBe(false);
    btn.click();
    expect(menu.hidden).toBe(true);
  });
});
