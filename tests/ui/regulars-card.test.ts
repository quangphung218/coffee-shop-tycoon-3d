// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dispatch as simDispatch } from '../../src/sim';
import { createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState } from '../../src/sim/types';
import { createMemoryStorage } from '../../src/save/storage';
import { REGULAR_TOAST_GAP_MS, resetRegularToasts, toastForEvent } from '../../src/ui/hud/events';
import type { PanelContext, PanelHandle } from '../../src/ui/hud/panels';
import { regularRows, renderTasksPanel } from '../../src/ui/panels/tasks';
import { createShell } from '../../src/ui/screens/shell';

const game = (): GameState => createNewGame('Quán Thử', 'normal', 42);

function mount(state: GameState): { body: HTMLElement; handle: PanelHandle } {
  const body = document.createElement('div');
  document.body.append(body);
  const ctx: PanelContext = { dispatch: (cmd) => simDispatch(state, cmd), getState: () => state, close: () => {} };
  return { body, handle: renderTasksPanel(body, ctx) as PanelHandle };
}

const rowTexts = (body: HTMLElement): string[] =>
  [...body.querySelectorAll('[data-regular]')].map((li) => [...li.querySelectorAll('p')].map((p) => p.textContent).join(' | '));

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Khách quen card', () => {
  it('shows the empty line when no regular has come in, also on saves without the field', () => {
    const state = game();
    delete state.regulars;
    const { body } = mount(state);
    const empty = body.querySelector<HTMLElement>('[data-regular-empty]')!;
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toBe('Chưa có khách quen nào ghé');
    expect(body.querySelector<HTMLElement>('ul[aria-label="Khách quen"]')!.hidden).toBe(true);
    expect(rowTexts(body)).toEqual([]);
  });

  it('lists regulars met with visits and favorite drink, latest visit first', () => {
    const state = game();
    state.regulars = {
      co_lan: { visits: 3, firstDay: 2, lastDay: 4 },
      anh_minh: { visits: 1, firstDay: 5, lastDay: 5 },
      chi_hoa: { visits: 2, firstDay: 2, lastDay: 4 },
      gone_id: { visits: 9, firstDay: 2, lastDay: 9 },
    };
    const { body } = mount(state);
    expect(body.querySelector<HTMLElement>('[data-regular-empty]')!.hidden).toBe(true);
    expect(rowTexts(body)).toEqual(['Anh Minh | Ghé 1 lần · Hay gọi Americano', 'Cô Lan | Ghé 3 lần · Hay gọi Latte', 'Chị Hoa | Ghé 2 lần · Hay gọi Cappuccino']);
    expect(body.querySelector<HTMLElement>('[data-regular="co_lan"] .item-icon .ic')!.dataset.icon).toBe('i-latte');
  });

  it('redraws when a regular comes in', () => {
    const state = game();
    const { body, handle } = mount(state);
    expect(rowTexts(body)).toEqual([]);
    state.regulars = { em_vy: { visits: 1, firstDay: 3, lastDay: 3 } };
    handle.update!(state);
    expect(regularRows(state).map((r) => r.id)).toEqual(['em_vy']);
    expect(rowTexts(body)).toHaveLength(1);
    expect(body.querySelector<HTMLElement>('[data-regular-empty]')!.hidden).toBe(true);
  });
});

describe('regular_arrived toast', () => {
  const arrived = (regularId: string, visits: number): GameEvent => ({ type: 'regular_arrived', customerId: 1, regularId, visits });

  beforeEach(() => resetRegularToasts());

  it('greets a first visit as a new regular', () => {
    const t = toastForEvent(arrived('co_lan', 1), game(), 1000)!;
    expect(t.title).toBe('Khách quen mới: Cô Lan');
    expect(t.icon).toBe('i-face-happy');
  });

  it('counts later visits', () => {
    expect(toastForEvent(arrived('chu_tuan', 4), game(), 1000)!.title).toBe('Chú Tuấn ghé quán (lần 4)');
  });

  it('shows at most one regular toast per 20 s of real time', () => {
    const state = game();
    expect(toastForEvent(arrived('co_lan', 2), state, 0)).not.toBeNull();
    expect(toastForEvent(arrived('anh_minh', 1), state, 5000)).toBeNull();
    expect(toastForEvent(arrived('chi_hoa', 3), state, REGULAR_TOAST_GAP_MS - 1)).toBeNull();
    expect(toastForEvent(arrived('chi_hoa', 3), state, REGULAR_TOAST_GAP_MS)!.title).toBe('Chị Hoa ghé quán (lần 3)');
    // Other toasts are not held back by the gap.
    expect(toastForEvent({ type: 'vip_arrived', customerId: 2 }, state, REGULAR_TOAST_GAP_MS + 1)).not.toBeNull();
  });

  it('skips an unknown regular id without using up the gap', () => {
    const state = game();
    expect(toastForEvent(arrived('gone_id', 1), state, 0)).toBeNull();
    expect(toastForEvent(arrived('em_vy', 1), state, 10)!.title).toBe('Khách quen mới: Em Vy');
  });

  it('toasts the first regular of a new game even inside the 20 s gap', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const shell = createShell({ root, storage: createMemoryStorage() });
    const titles = () => [...root.querySelectorAll('.toast-title')].map((p) => p.textContent);
    try {
      shell.startGame(game());
      shell.handleEvents([arrived('co_lan', 2)]);
      expect(titles()).toEqual(['Cô Lan ghé quán (lần 2)']);
      // Same game, a moment later: held back by the gap.
      shell.handleEvents([arrived('anh_minh', 1)]);
      expect(titles()).toEqual(['Cô Lan ghé quán (lần 2)']);
      // Ván mới, Chơi lại and loading a save all go through startGame, which starts the gap over.
      shell.startGame(game());
      shell.handleEvents([arrived('anh_minh', 1)]);
      expect(titles()).toEqual(['Khách quen mới: Anh Minh']);
    } finally {
      shell.dispose();
      root.remove();
    }
  });
});
