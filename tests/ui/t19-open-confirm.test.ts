// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { dispatch as simDispatch } from '../../src/sim';
import { createNewGame } from '../../src/sim/state';
import type { Command, GameState } from '../../src/sim/types';
import type { PanelContext } from '../../src/ui/hud/panels';
import { renderTasksPanel, stockMakesNoDish } from '../../src/ui/panels/tasks';

function mount(s: GameState): { body: HTMLElement; sent: Command[]; get: () => GameState } {
  const body = document.createElement('div');
  document.body.append(body);
  const sent: Command[] = [];
  const ctx: PanelContext = {
    dispatch: (cmd) => {
      sent.push(cmd);
      return simDispatch(s, cmd);
    },
    getState: () => s,
    close: () => {},
  };
  renderTasksPanel(body, ctx);
  return { body, sent, get: () => s };
}

const emptyStock = (): GameState => {
  const s = createNewGame('Quán Thử', 'normal', 42);
  return { ...s, inventory: s.inventory.map((i) => ({ ...i, qty: 0 })) };
};

/** A game with one barista hired, so only the stock check is in play. */
function withStaff(s: GameState): GameState {
  const c = s.candidates[0]!;
  expect(simDispatch(s, { type: 'hire_staff', candidateId: c.id, role: 'barista' })).toBe(true);
  return s;
}

const openBtn = (body: HTMLElement): HTMLButtonElement => body.querySelector<HTMLButtonElement>('[data-action="open"]')!;
const confirmRow = (body: HTMLElement): HTMLElement | null => body.querySelector<HTMLElement>('.panel-foot .confirm');
const button = (row: HTMLElement, text: string): HTMLButtonElement | undefined => [...row.querySelectorAll('button')].find((b) => b.textContent === text);

afterEach(() => {
  document.body.innerHTML = '';
});

describe('T-19 open-shop confirmation when stock makes no dish (UX-004)', () => {
  it('empty stock: Open asks with the stock message and a Mở Kho button, sends nothing yet', () => {
    const state = emptyStock();
    expect(stockMakesNoDish(state)).toBe(true);
    const m = mount(state);
    openBtn(m.body).click();
    const row = confirmRow(m.body)!;
    expect(row).not.toBeNull();
    expect(row.textContent).toContain('Kho trống: không bán được món nào');
    expect(button(row, 'Mở Kho')?.getAttribute('data-goto')).toBe('inventory');
    expect(row.querySelector('[data-action="cancel"]')).not.toBeNull();
    expect(m.sent).toEqual([]);
    expect(row.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    // A second click does not stack another confirm.
    openBtn(m.body).click();
    expect(m.body.querySelectorAll('.confirm')).toHaveLength(1);
  });

  it('cancel keeps the shop closed', () => {
    const m = mount(emptyStock());
    openBtn(m.body).click();
    confirmRow(m.body)!.querySelector<HTMLButtonElement>('[data-action="cancel"]')!.click();
    expect(confirmRow(m.body)).toBeNull();
    expect(m.sent).toEqual([]);
    expect(m.get().phase).toBe('preparation');
  });

  it('confirming still opens the shop (never blocked)', () => {
    const m = mount(emptyStock());
    openBtn(m.body).click();
    confirmRow(m.body)!.querySelector<HTMLButtonElement>('[data-action="confirm"]')!.click();
    expect(m.sent).toEqual([{ type: 'start_day' }]);
    expect(m.get().phase).not.toBe('preparation');
    expect(confirmRow(m.body)).toBeNull();
  });

  it('Mở Kho goes to the Kho panel and does not open the shop', () => {
    const m = mount(emptyStock());
    const dock = document.createElement('div');
    dock.className = 'dock';
    const kho = document.createElement('button');
    kho.setAttribute('data-panel', 'inventory');
    let clicked = 0;
    kho.addEventListener('click', () => clicked++);
    dock.append(kho);
    document.body.append(dock);
    openBtn(m.body).click();
    button(confirmRow(m.body)!, 'Mở Kho')!.click();
    expect(clicked).toBe(1);
    expect(m.sent).toEqual([]);
    expect(confirmRow(m.body)).toBeNull();
  });

  it('sellable stock: Open starts the day directly, no confirmation', () => {
    const state = withStaff(createNewGame('Quán Thử', 'normal', 42));
    expect(stockMakesNoDish(state)).toBe(false);
    const m = mount(state);
    openBtn(m.body).click();
    expect(confirmRow(m.body)).toBeNull();
    expect(m.sent).toEqual([{ type: 'start_day' }]);
  });
});
