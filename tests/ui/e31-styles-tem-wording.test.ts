// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { dispatch as simDispatch, styleOf } from '../../src/sim';
import { styleById } from '../../src/sim/data/styles';
import { ensureRetention } from '../../src/sim/retention';
import { createNewGame } from '../../src/sim/state';
import type { Command, GameState } from '../../src/sim/types';
import { renderStylesPanel, styleConfirmText, stylePriceText } from '../../src/ui/panels/styles';

function mount(state: GameState) {
  const body = document.createElement('div');
  document.body.append(body);
  const sent: Command[] = [];
  renderStylesPanel(body, {
    dispatch: (cmd) => {
      sent.push(cmd);
      return simDispatch(state, cmd);
    },
    getState: () => state,
    close: () => {},
    previewStyle: () => {},
  });
  return { body, sent };
}

function atSpring(): GameState {
  const state = createNewGame('Quán Thử', 'normal', 7);
  state.money = 20_000_000;
  ensureRetention(state).tickets = 200;
  state.week!.index = 24;
  return state;
}

const rowOf = (body: HTMLElement, id: string): HTMLElement => body.querySelector<HTMLElement>(`[data-block="season"] li[data-style="${id}"]`)!;

function confirmText(body: HTMLElement, id: string): string {
  const li = rowOf(body, id);
  li.querySelector<HTMLButtonElement>('[data-action="preview"]')!.click();
  li.querySelector<HTMLButtonElement>('[data-action="buy"]')!.click();
  return li.querySelector('.confirm')!.textContent ?? '';
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Phong cách: Tem wording (E-31)', () => {
  it('UX-403: a worn style paid with Tem only says Đã có, never Kiểu gốc', () => {
    const state = atSpring();
    simDispatch(state, { type: 'buy_style', styleId: 'wall_peach' });
    expect(styleOf(state, 'wall').id).toBe('wall_peach');
    const { body } = mount(state);
    const meta = rowOf(body, 'wall_peach').querySelector('.item-meta')!.textContent;
    expect(meta).toBe('Đã có');
    expect(body.querySelector('[data-block="season"]')!.textContent).not.toContain('Kiểu gốc');
  });

  it('UX-403: the free starting style still says Kiểu gốc', () => {
    const state = atSpring();
    const { body } = mount(state);
    const id = styleOf(state, 'wall').id;
    expect(body.querySelector(`li[data-style="${id}"] .item-meta`)!.textContent).toBe('Kiểu gốc');
  });

  it('UX-404: a Tem-only price reads just "N Tem", no 0đ', () => {
    const peach = styleById('wall_peach')!;
    expect(stylePriceText(peach)).toBe('70 Tem');
    const { body } = mount(atSpring());
    const meta = rowOf(body, 'wall_peach').querySelector('.item-meta')!.textContent!;
    expect(meta).toBe('Giá 70 Tem');
    expect(meta).not.toMatch(/0đ/);
  });

  it('UX-404: the Tem-only confirm states the Tem left, not the money', () => {
    const state = atSpring();
    const peach = styleById('wall_peach')!;
    expect(styleConfirmText(state, peach)).toBe('Mua Tường hoa đào với 70 Tem? Còn lại 130 Tem.');
    const { body } = mount(state);
    const text = confirmText(body, 'wall_peach');
    expect(text).toContain('Còn lại 130 Tem');
    expect(text).not.toMatch(/đ\b|đ\./);
  });

  it('UX-404: a money + Tem confirm states both what is left', () => {
    const state = atSpring();
    const sign = styleById('sign_lacquer')!;
    expect(stylePriceText(sign)).toBe('5.000.000đ + 90 Tem');
    const { body } = mount(state);
    const text = confirmText(body, 'sign_lacquer');
    expect(text).toContain('Còn lại 15.000.000đ và 110 Tem');
  });
});
