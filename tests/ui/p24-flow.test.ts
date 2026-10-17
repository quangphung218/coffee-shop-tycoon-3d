// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { createMemoryStorage } from '../../src/save/storage';
import { getIngredient } from '../../src/sim/data/ingredients';
import { menuUnlockLevel } from '../../src/sim/data/levels';
import { dispatch as simDispatch } from '../../src/sim/index';
import { autoRestockSuggestion, stockOf } from '../../src/sim/inventory';
import { createNewGame } from '../../src/sim/state';
import type { GameState } from '../../src/sim/types';
import { formatMoney } from '../../src/ui/core/format';
import { MERGE_NAMES } from '../../src/ui/core/toast';
import { registerPrepPanels } from '../../src/ui/panels';
import { createShell, type Shell } from '../../src/ui/screens/shell';
import { playDay, runOpenDay } from '../integration/helpers';

/**
 * P24 through the real shell and sim: Kho → Gợi ý → Nhập hàng reports the
 * purchase in one merged toast and never in the panel; the HUD at peak names
 * the phase instead of drawing dots; no emoji anywhere on the way.
 */

const EMOJI = /\p{Extended_Pictographic}/u;
/** Dots the old phase strip and stray markers drew. */
const DOTS = /[●○•◦⬤∙]/u;

const offs: (() => void)[] = [];
let shell: Shell | null = null;

afterEach(() => {
  shell?.dispose();
  shell = null;
  offs.splice(0).forEach((off) => off());
  document.body.replaceChildren();
});

function boot(state: GameState): Shell {
  offs.push(registerPrepPanels());
  const root = document.createElement('div');
  document.body.append(root);
  shell = createShell({ root, storage: createMemoryStorage(), settings: { ...DEFAULT_SETTINGS }, seed: () => 24 });
  shell.startGame(state);
  return shell;
}

function q<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

/** Hands the queued sim events to the shell and clears them, like the game loop. */
function drain(s: Shell, state: GameState): void {
  s.handleEvents(state.events);
  state.events.length = 0;
  s.update();
}

function openKho(s: Shell): HTMLElement {
  q<HTMLButtonElement>(s.hud.el, 'nav.dock [data-panel="inventory"]').click();
  expect(s.hud.openPanelId).toBe('inventory');
  return s.hud.panelEl;
}

const toastTitles = (s: Shell): string[] => [...s.toasts.el.querySelectorAll('.toast-title')].map((p) => p.textContent ?? '');
const toastTexts = (s: Shell): string[] => [...s.toasts.el.querySelectorAll('.toast-text')].map((p) => p.textContent ?? '');

function expectNoEmoji(step: string): void {
  const text = document.body.textContent ?? '';
  expect(text.match(EMOJI)?.[0], `${step}: ${text.slice(0, 200)}`).toBeUndefined();
}

/** "Đã nhập A, B, C và 2 mặt hàng khác", from the names alone. */
function mergedTitle(names: string[]): string {
  const rest = names.length - MERGE_NAMES;
  return `Đã nhập ${names.slice(0, MERGE_NAMES).join(', ')}${rest > 0 ? ` và ${rest} mặt hàng khác` : ''}`;
}

describe('P24 Kho: Gợi ý then Nhập hàng', () => {
  it('buys the suggestion and reports it in exactly one merged toast, not in the panel', () => {
    const state = createNewGame('Quán P24', 'normal', 2424);
    const s = boot(state);
    const panel = openKho(s);
    const plan = autoRestockSuggestion(state);
    expect(plan.items.length).toBeGreaterThan(1);
    const before = state.money;

    q<HTMLButtonElement>(panel, '[data-action="suggest"]').click();
    const tagged = [...panel.querySelectorAll<HTMLElement>('li[data-ingredient]')]
      .filter((li) => !li.querySelector('.sug')!.classList.contains('is-off'))
      .map((li) => li.dataset.ingredient);
    expect(tagged).toEqual(plan.items.map((i) => i.id));
    const buy = q<HTMLButtonElement>(panel, '[data-action="buy"]');
    expect(buy.getAttribute('aria-disabled')).not.toBe('true');
    expect(buy.textContent).toBe(`Nhập hàng · ${formatMoney(plan.totalCost)}`);

    buy.click();
    drain(s, state);
    expect(state.money).toBe(before - plan.totalCost);
    expect(s.toasts.count).toBe(1);
    expect(s.toasts.el.querySelectorAll('.toast-success')).toHaveLength(1);
    expect(toastTitles(s)).toEqual([mergedTitle(plan.items.map((i) => getIngredient(i.id).name))]);
    expect(toastTexts(s)).toEqual([`${formatMoney(-plan.totalCost)} · Còn ${formatMoney(state.money)}`]);
    expect(panel.textContent).not.toContain('Đã nhập');
    expect(s.hud.el.textContent).not.toContain('Đã nhập');
    // The order is cleared: nothing picked, no row still tagged.
    expect(buy.getAttribute('aria-disabled')).toBe('true');
    expect(panel.querySelectorAll('.sug:not(.is-off)')).toHaveLength(0);
    expectNoEmoji('after Nhập hàng');
  });

  it('suggests oranges on day 3 once orange juice is on the menu', () => {
    const state = createNewGame('Quán P24', 'normal', 2424);
    const s = boot(state);
    for (let day = 1; day <= 2; day++) {
      simDispatch(state, { type: 'apply_restock' });
      playDay(state);
      expect(simDispatch(state, { type: 'next_day' })).toBe(true);
    }
    state.events.length = 0;
    expect(simDispatch(state, { type: 'set_menu_item', itemId: 'orange_juice', enabled: true })).toBe(true);
    expect(stockOf(state, 'orange')).toBe(0);
    s.update();

    const panel = openKho(s);
    q<HTMLButtonElement>(panel, '[data-action="suggest"]').click();
    const row = q(panel, 'li[data-ingredient="orange"]');
    expect(q(row, '.sug').classList.contains('is-off')).toBe(false);
    expect(Number(q<HTMLInputElement>(row, '.step-input').value)).toBeGreaterThan(0);

    q<HTMLButtonElement>(panel, '[data-action="buy"]').click();
    drain(s, state);
    expect(stockOf(state, 'orange')).toBeGreaterThan(0);
    expect(s.toasts.count).toBe(1);
    expect(panel.textContent).not.toContain('Đã nhập');
  });

  it.each([
    ['orange_juice', ['orange']],
    ['cake', ['flour', 'butter']],
  ] as const)('switches %s on in Menu with its stock at zero, then Gợi ý buys %j', (itemId, needs) => {
    const state = createNewGame('Quán P24', 'normal', 2424);
    const s = boot(state);
    for (let day = 1; day <= 2; day++) {
      simDispatch(state, { type: 'apply_restock' });
      playDay(state);
      expect(simDispatch(state, { type: 'next_day' })).toBe(true);
    }
    // Cake opens on day 6 of the week; its shop level opens it now.
    state.shopLevel = Math.max(state.shopLevel, menuUnlockLevel(itemId));
    for (const id of needs) state.inventory.find((i) => i.id === id)!.qty = 0;
    state.events.length = 0;
    s.update();

    q<HTMLButtonElement>(s.hud.el, 'nav.dock [data-panel="menu"]').click();
    const row = q(s.hud.panelEl, `li[data-item="${itemId}"]`);
    const sw = q<HTMLButtonElement>(row, '[role="switch"]');
    expect(sw.getAttribute('aria-disabled')).not.toBe('true');
    sw.click();
    expect(state.menu.find((m) => m.id === itemId)!.enabled).toBe(true);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    // Still short: the warning label and the way to Kho stay on the row.
    expect(q(row, '[data-lock="stock"]').hidden).toBe(false);
    expect(q(row, '[data-goto="inventory"]').hidden).toBe(false);

    const panel = openKho(s);
    q<HTMLButtonElement>(panel, '[data-action="suggest"]').click();
    for (const id of needs) {
      const line = q(panel, `li[data-ingredient="${id}"]`);
      expect(q(line, '.sug').classList.contains('is-off'), id).toBe(false);
      expect(Number(q<HTMLInputElement>(line, '.step-input').value), id).toBeGreaterThan(0);
    }
  });

  it('says how much is missing and buys nothing when the money is short', () => {
    const state = createNewGame('Quán P24', 'normal', 2424);
    const s = boot(state);
    const plan = autoRestockSuggestion(state);
    state.money = plan.totalCost - 1000;
    s.update();
    const panel = openKho(s);
    q<HTMLButtonElement>(panel, '[data-action="suggest"]').click();
    const buy = q<HTMLButtonElement>(panel, '[data-action="buy"]');
    expect(buy.getAttribute('aria-disabled')).toBe('true');
    expect(q(panel, '.foot-hint').textContent).toContain(`Thiếu ${formatMoney(1000)}`);

    buy.click();
    drain(s, state);
    expect(state.money).toBe(plan.totalCost - 1000);
    expect(s.toasts.count).toBe(0);
  });
});

describe('P24 HUD at peak', () => {
  it('names the phase in one pill with the next change, and draws no dots', () => {
    const state = createNewGame('Quán P24', 'normal', 2424);
    const s = boot(state);
    simDispatch(state, { type: 'apply_restock' });
    expect(simDispatch(state, { type: 'start_day' })).toBe(true);
    runOpenDay(state, { untilMinute: 12 * 60 + 50, onMinute: (st) => drain(s, st) });
    expect(state.phase).toBe('peak');
    s.update();

    const today = q(s.hud.el, '[data-cluster="today"]');
    const pills = today.querySelectorAll<HTMLElement>('.phase-pill');
    expect(pills).toHaveLength(1);
    expect(pills[0]!.textContent).toBe('Cao điểm');
    expect(q(today, '[data-stat="phase-next"]').textContent).toBe('tới 13:00');
    // The four phase names exist only for screen readers, never as drawn steps.
    expect([...today.querySelectorAll('li')].filter((li) => !li.closest('.sr-only'))).toEqual([]);
    expect(s.hud.el.textContent).not.toMatch(DOTS);
    expect(today.querySelectorAll('[class*="dot"]')).toHaveLength(0);
    expectNoEmoji('HUD at peak');
  });
});
