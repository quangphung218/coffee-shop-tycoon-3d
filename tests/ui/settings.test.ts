// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, sanitizeSettings, type Settings } from '../../src/save/settings';
import { createMemoryStorage, type StorageLike } from '../../src/save/storage';
import { createSettings } from '../../src/ui/screens/settings';

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

describe('Settings screen', () => {
  let storage: StorageLike;
  let changes: Settings[];

  beforeEach(() => {
    storage = createMemoryStorage();
    changes = [];
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  function open(initial: Settings = { ...DEFAULT_SETTINGS }) {
    const screen = createSettings(storage, initial, { onChange: (s) => changes.push(s), onBack: vi.fn() });
    mount(screen.el);
    screen.onShow?.();
    return screen;
  }

  it('lays out the four groups in order', () => {
    const screen = open();
    const titles = [...screen.el.querySelectorAll('.section-title')].map((t) => t.textContent);
    expect(titles).toEqual(['Âm thanh', 'Hiển thị', 'Điều khiển', 'Trò chơi']);
  });

  it('marks Giảm chuyển động with its own icon, not the Pause icon', () => {
    const screen = open();
    const row = q(screen.el, 'input[data-setting="reducedMotion"]').closest('.set-row');
    const icons = [...row!.querySelectorAll<HTMLElement>('.ic')].map((i) => i.dataset.icon);
    expect(icons).toContain('i-rest');
    expect(icons).not.toContain('i-pause');
  });

  it('gives every control a one-line purpose', () => {
    const screen = open();
    for (const row of screen.el.querySelectorAll('.set-row')) {
      expect(q(row, '.hint').textContent?.trim().length, row.textContent ?? '').toBeGreaterThan(0);
    }
  });

  it('changes the camera key style through two radio options, keeping the old data-setting', () => {
    const screen = open();
    const group = q(screen.el, 'input[data-setting="cameraKeys"]').closest('[role="radiogroup"]');
    expect(group).not.toBeNull();
    expect([...group!.querySelectorAll('input[data-setting="cameraKeys"]')].map((r) => (r as HTMLInputElement).value)).toEqual([
      'qe-wasd',
      'qa-arrows',
    ]);
    expect(q<HTMLInputElement>(screen.el, 'input[data-setting="cameraKeys"][value="qe-wasd"]').checked).toBe(true);

    const arrows = q<HTMLInputElement>(screen.el, 'input[data-setting="cameraKeys"][value="qa-arrows"]');
    arrows.checked = true;
    arrows.dispatchEvent(new Event('change'));
    expect(changes.at(-1)?.cameraKeys).toBe('qa-arrows');
    expect(loadSettings(storage).cameraKeys).toBe('qa-arrows');
  });

  it('saves the reduced-motion choice, with system the default', () => {
    const screen = open();
    expect(q<HTMLInputElement>(screen.el, 'input[data-setting="reducedMotion"][value="system"]').checked).toBe(true);
    const reduce = q<HTMLInputElement>(screen.el, 'input[data-setting="reducedMotion"][value="reduce"]');
    reduce.checked = true;
    reduce.dispatchEvent(new Event('change'));
    expect(changes.at(-1)?.reducedMotion).toBe('reduce');
    expect(loadSettings(storage).reducedMotion).toBe('reduce');
  });

  it('tucks the shortcut list into a details element that starts closed', () => {
    const screen = open();
    const details = q<HTMLDetailsElement>(screen.el, 'details.keys-details');
    expect(details.open).toBe(false);
    expect(q(details, 'summary').textContent).toContain('Phím tắt');
    expect(details.querySelector('.keys')).not.toBeNull();
  });

  it('confirms "Về mặc định" in place: one click arms it, a second resets', () => {
    vi.useFakeTimers();
    const screen = open({ ...DEFAULT_SETTINGS, quality: 'high', gameSpeed: 4 });
    const reset = button(screen.el, 'Về mặc định');

    reset.click();
    expect(reset.textContent).toContain('Bấm lần nữa để đặt lại');
    expect(screen.value.quality).toBe('high');

    reset.click();
    expect(screen.value).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    expect(reset.textContent).toContain('Về mặc định');
    expect(reset.textContent).not.toContain('lần nữa');
  });

  it('disarms the reset after the confirm window passes', () => {
    vi.useFakeTimers();
    const screen = open({ ...DEFAULT_SETTINGS, quality: 'high' });
    const reset = button(screen.el, 'Về mặc định');

    reset.click();
    expect(reset.textContent).toContain('Bấm lần nữa để đặt lại');
    vi.advanceTimersByTime(3000);
    expect(reset.textContent).toContain('Về mặc định');
    expect(reset.textContent).not.toContain('lần nữa');

    // A click after the window only re-arms; it does not reset.
    reset.click();
    expect(screen.value.quality).toBe('high');
    expect(reset.textContent).toContain('Bấm lần nữa để đặt lại');
  });

  it('sanitizes reducedMotion: missing or unknown becomes system', () => {
    expect(sanitizeSettings({}).reducedMotion).toBe('system');
    expect(sanitizeSettings({ reducedMotion: 'nope' }).reducedMotion).toBe('system');
    expect(sanitizeSettings({ reducedMotion: 'reduce' }).reducedMotion).toBe('reduce');
    expect(sanitizeSettings({ reducedMotion: 'system' }).reducedMotion).toBe('system');
  });
});
