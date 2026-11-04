// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { dispatch as simDispatch, styleOf } from '../../src/sim';
import { SEASON_SETS, seasonFor } from '../../src/sim/data/seasons';
import { ensureRetention } from '../../src/sim/retention';
import { createNewGame } from '../../src/sim/state';
import type { Command, GameState } from '../../src/sim/types';
import { renderStylesPanel } from '../../src/ui/panels/styles';

function mount(state: GameState) {
  const body = document.createElement('div');
  document.body.append(body);
  const sent: Command[] = [];
  const handle = renderStylesPanel(body, {
    dispatch: (cmd) => {
      sent.push(cmd);
      return simDispatch(state, cmd);
    },
    getState: () => state,
    close: () => {},
    previewStyle: () => {},
  })!;
  return { body, sent, handle };
}

function atWeek(week: number): GameState {
  const state = createNewGame('Quán Thử', 'normal', 7);
  state.money = 1_000_000_000;
  ensureRetention(state).tickets = 500;
  state.week!.index = week;
  return state;
}

const block = (body: HTMLElement): HTMLElement => body.querySelector<HTMLElement>('[data-block="season"]')!;
const weeksText = (body: HTMLElement): string | null => block(body).querySelector('[data-summary="season-weeks"]')!.textContent;
const shownIds = (body: HTMLElement): string[] =>
  [...block(body).querySelectorAll<HTMLElement>('li[data-style]')].filter((li) => !li.hidden).map((li) => li.dataset.style!);

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Phong cách: Mùa này block (T-94)', () => {
  it('is hidden before week 24', () => {
    const { body } = mount(atWeek(23));
    expect(block(body).hidden).toBe(true);
  });

  it('shows the season name, weeks left and only the season styles from week 24', () => {
    const state = atWeek(24);
    const { body, handle } = mount(state);
    expect(block(body).hidden).toBe(false);
    expect(block(body).textContent).toContain('Mùa này: Mùa xuân');
    expect(weeksText(body)).toBe('Còn 8 tuần để mua');
    expect(shownIds(body)).toEqual([...SEASON_SETS[0]!.ids]);
    state.week!.index = 31;
    handle.update!(state);
    expect(weeksText(body)).toBe('Còn 1 tuần để mua');
    state.week!.index = 32;
    handle.update!(state);
    expect(block(body).textContent).toContain('Mùa hè');
    expect(shownIds(body)).toEqual([...seasonFor(32)!.ids]);
    expect(block(body).textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(document.querySelector('dialog, [role="dialog"], [aria-modal]')).toBeNull();
  });

  it('buys a season style through the existing preview, Mua and in-place confirm', () => {
    const state = atWeek(25);
    const { body, sent } = mount(state);
    const li = block(body).querySelector<HTMLElement>('li[data-style="wall_peach"]')!;
    li.querySelector<HTMLButtonElement>('[data-action="preview"]')!.click();
    const buy = li.querySelector<HTMLButtonElement>('[data-action="buy"]')!;
    expect(buy.textContent).toBe('Mua');
    expect(buy.getAttribute('aria-disabled')).not.toBe('true');
    buy.click();
    expect(sent).toEqual([]);
    li.querySelector<HTMLButtonElement>('.confirm [data-action="confirm"]')!.click();
    expect(sent).toEqual([{ type: 'buy_style', styleId: 'wall_peach' }]);
    expect(styleOf(state, 'wall').id).toBe('wall_peach');
    expect(state.retention!.tickets).toBe(430);
    expect(li.querySelector('.badge')!.textContent).toBe('Đang dùng');
  });

  it('dims Mua with what to do when short of Tem', () => {
    const state = atWeek(24);
    ensureRetention(state).tickets = 10;
    const { body } = mount(state);
    const li = block(body).querySelector<HTMLElement>('li[data-style="wall_peach"]')!;
    li.querySelector<HTMLButtonElement>('[data-action="preview"]')!.click();
    expect(li.querySelector('[data-action="buy"]')!.getAttribute('aria-disabled')).toBe('true');
    expect(li.querySelector('.reason')!.textContent).toContain('Thiếu 60 Tem');
  });
});
