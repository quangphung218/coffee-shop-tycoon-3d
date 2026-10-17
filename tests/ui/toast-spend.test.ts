// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getUpgrade } from '../../src/sim/data/upgrades';
import { dispatch } from '../../src/sim/index';
import { createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState, SpendKind } from '../../src/sim/types';
import { formatMoney } from '../../src/ui/core/format';
import { MAX_TOASTS, TOAST_VISIBLE_MS, Toasts } from '../../src/ui/core/toast';
import { toastForEvent } from '../../src/ui/hud/events';

let state: GameState;
let toasts: Toasts;

function spend(kind: SpendKind, label: string, amount: number, moneyLeft: number): void {
  const event: GameEvent = { type: 'spend', kind, label, amount, moneyLeft };
  toasts.show(toastForEvent(event, state)!);
}

const titles = (): string[] => [...toasts.el.querySelectorAll('.toast-title')].map((p) => p.textContent ?? '');
const texts = (): string[] => [...toasts.el.querySelectorAll('.toast-text')].map((p) => p.textContent ?? '');

beforeEach(() => {
  vi.useFakeTimers();
  state = createNewGame('Quán Thử', 'normal', 42);
  toasts = new Toasts();
  document.body.append(toasts.el);
});

afterEach(() => {
  toasts.clear();
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('spend toasts', () => {
  it('maps each kind to a success toast with its dock icon and a spend:<kind> key', () => {
    const icons: Record<SpendKind, string> = { restock: 'i-inventory', upgrade: 'i-upgrades', campaign: 'i-marketing' };
    for (const kind of Object.keys(icons) as SpendKind[]) {
      const toast = toastForEvent({ type: 'spend', kind, label: 'X', amount: 1000, moneyLeft: 5000 }, state);
      expect(toast).toMatchObject({ level: 'success', icon: icons[kind], key: `spend:${kind}` });
    }
  });

  it('merges back-to-back restocks into one toast with the summed amount and the latest balance', () => {
    spend('restock', 'Cam', 300_000, 19_581_724);
    spend('restock', 'Bột bánh', 519_375, 19_062_349);
    spend('restock', 'Cam', 375, 19_062_724);
    expect(toasts.count).toBe(1);
    expect(titles()).toEqual(['Đã nhập Cam, Bột bánh']);
    expect(texts()).toEqual([`${formatMoney(-819_750)} · Còn ${formatMoney(19_062_724)}`]);
    expect(toasts.el.textContent).not.toContain('×');
    expect(toasts.el.querySelector<HTMLElement>('.toast-success .toast-icon .ic')?.dataset.icon).toBe('i-inventory');
  });

  it('lists 3 names, then counts the rest', () => {
    for (const name of ['Cam', 'Chanh', 'Bơ', 'Sữa', 'Đá']) spend('restock', name, 1000, 10_000);
    expect(titles()).toEqual(['Đã nhập Cam, Chanh, Bơ và 2 mặt hàng khác']);
  });

  it('hides 4 s after the last merge', () => {
    spend('restock', 'Cam', 1000, 10_000);
    vi.advanceTimersByTime(TOAST_VISIBLE_MS - 500);
    spend('restock', 'Chanh', 1000, 9_000);
    vi.advanceTimersByTime(TOAST_VISIBLE_MS - 500);
    expect(toasts.count).toBe(1);
    vi.advanceTimersByTime(600);
    expect(toasts.count).toBe(0);
  });

  it.each([
    ['pointerenter', 'pointerleave'],
    ['focusin', 'focusout'],
  ])('stops the countdown on %s and starts it again on %s', (holdOn, holdOff) => {
    spend('restock', 'Cam', 1000, 10_000);
    const el = toasts.el.querySelector<HTMLElement>('.toast')!;
    vi.advanceTimersByTime(TOAST_VISIBLE_MS - 500);
    el.dispatchEvent(new Event(holdOn, { bubbles: true }));
    vi.advanceTimersByTime(TOAST_VISIBLE_MS * 3);
    expect(toasts.count).toBe(1);
    el.dispatchEvent(new Event(holdOff, { bubbles: true }));
    vi.advanceTimersByTime(TOAST_VISIBLE_MS - 100);
    expect(toasts.count).toBe(1);
    vi.advanceTimersByTime(200);
    expect(toasts.count).toBe(0);
  });

  it('stays while held even when a new restock merges into it', () => {
    spend('restock', 'Cam', 1000, 10_000);
    const el = toasts.el.querySelector<HTMLElement>('.toast')!;
    el.dispatchEvent(new Event('pointerenter', { bubbles: true }));
    spend('restock', 'Chanh', 2000, 8_000);
    vi.advanceTimersByTime(TOAST_VISIBLE_MS * 3);
    expect(toasts.count).toBe(1);
    expect(titles()).toEqual(['Đã nhập Cam, Chanh']);
    expect(texts()).toEqual([`${formatMoney(-3000)} · Còn ${formatMoney(8_000)}`]);
    el.dispatchEvent(new Event('pointerleave', { bubbles: true }));
    vi.advanceTimersByTime(TOAST_VISIBLE_MS + 100);
    expect(toasts.count).toBe(0);
  });

  it('keeps each kind in its own toast, at most 3 at once', () => {
    spend('restock', 'Cam', 1000, 10_000);
    spend('upgrade', 'Thêm bàn lên cấp 1', 2000, 8_000);
    spend('campaign', 'Phát tờ rơi', 500, 7_500);
    expect(titles()).toEqual(['Đã nhập Cam', 'Đã nâng cấp Thêm bàn lên cấp 1', 'Đã chạy Phát tờ rơi']);
    toasts.show({ level: 'error', title: 'Khách bỏ đi', key: 'angry' });
    expect(toasts.count).toBe(MAX_TOASTS);
    expect(titles()).toEqual(['Đã nâng cấp Thêm bàn lên cấp 1', 'Đã chạy Phát tờ rơi', 'Khách bỏ đi']);
  });

  it('shows one toast for two upgrades bought back to back through dispatch', () => {
    state.events = [];
    expect(dispatch(state, { type: 'buy_upgrade', upgradeId: 'tables' })).toBe(true);
    expect(dispatch(state, { type: 'buy_upgrade', upgradeId: 'tables' })).toBe(true);
    for (const event of state.events) {
      const toast = toastForEvent(event, state);
      if (toast) toasts.show(toast);
    }
    expect(toasts.count).toBe(1);
    const name = getUpgrade('tables').name;
    expect(titles()).toEqual([`Đã nâng cấp ${name} lên cấp 1, ${name} lên cấp 2`]);
    expect(texts()).toEqual([expect.stringContaining(`Còn ${formatMoney(state.money)}`)]);
  });

  it('does not take focus and leaves the ×n merge of other keys alone', () => {
    const before = document.createElement('button');
    document.body.append(before);
    before.focus();
    spend('restock', 'Cam', 1000, 10_000);
    expect(document.activeElement).toBe(before);
    toasts.show({ level: 'error', title: 'Khách bỏ đi', key: 'angry' });
    toasts.show({ level: 'error', title: 'Khách bỏ đi', key: 'angry' });
    expect(titles()).toContain('Khách bỏ đi ×2');
  });
});
