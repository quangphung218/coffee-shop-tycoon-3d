// @vitest-environment jsdom
// E-33 (T-125): seasonal colour variants in the Phong cách "Mùa này" block and
// the week-end season line, priced "N Tem"; no emoji, no new modal.
import { afterEach, describe, expect, it } from 'vitest';
import { dispatch as simDispatch, styleOf } from '../../src/sim';
import { SEASON_SETS, SEASONAL_STYLES, seasonalVariantsFor, variantId } from '../../src/sim/data/seasons';
import { ensureRetention } from '../../src/sim/retention';
import { createNewGame } from '../../src/sim/state';
import { ensureStyles } from '../../src/sim/styles';
import type { Command, GameState } from '../../src/sim/types';
import { renderStylesPanel } from '../../src/ui/panels/styles';
import { seasonWeekEndLine } from '../../src/ui/seasonHints';

const EMOJI = /\p{Extended_Pictographic}/u;

function atWeek(week: number, tickets = 1000): GameState {
  const state = createNewGame('Quán Thử', 'normal', 7);
  state.money = 1_000_000_000;
  ensureRetention(state).tickets = tickets;
  state.week!.index = week;
  return state;
}

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

const block = (body: HTMLElement): HTMLElement => body.querySelector<HTMLElement>('[data-block="season"]')!;
const shownIds = (body: HTMLElement): string[] =>
  [...block(body).querySelectorAll<HTMLElement>('li[data-style]')].filter((li) => !li.hidden).map((li) => li.dataset.style!);

function ownAll(state: GameState, ids: readonly string[]): void {
  const st = ensureStyles(state);
  for (const id of ids) if (!st.owned.includes(id)) st.owned.push(id);
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Mùa này block: colour variants (T-125)', () => {
  it('shows no variant before week 48', () => {
    const { body } = mount(atWeek(47));
    expect(shownIds(body).some((id) => /_c\d+$/.test(id))).toBe(false);
  });

  it('lists the season variants after the base styles from week 48, priced in Tem, and follows the season', () => {
    const state = atWeek(48);
    const { body, handle } = mount(state);
    const base = [...SEASON_SETS[0]!.ids];
    expect(shownIds(body)).toEqual([...base, ...base.map((id) => variantId(id, 1))]);
    const li = block(body).querySelector<HTMLElement>(`li[data-style="${variantId('wall_peach', 1)}"]`)!;
    expect(li.querySelector('.item-title')!.textContent).toBe('Tường hoa đào (bản 2)');
    expect(li.querySelector('.item-meta')!.textContent).toBe('Giá 140 Tem');
    expect(block(body).textContent).not.toMatch(EMOJI);
    expect(document.querySelector('dialog, [role="dialog"], [aria-modal]')).toBeNull();

    state.week!.index = 56;
    handle.update!(state);
    expect(shownIds(body)).toEqual([...SEASON_SETS[1]!.ids, ...SEASON_SETS[1]!.ids.map((id) => variantId(id, 1))]);

    // Cycle 2: newest variants first, the older cycle's still on sale.
    state.week!.index = 72;
    handle.update!(state);
    expect(shownIds(body)).toEqual([...base, ...seasonalVariantsFor(72).map((v) => v.id)]);
    expect(shownIds(body).slice(base.length, base.length * 2)).toEqual(base.map((id) => variantId(id, 2)));
  });

  it('buys a variant with Tem through preview, Mua and the in-place confirm', () => {
    const state = atWeek(49, 200);
    const { body, sent } = mount(state);
    const id = variantId('wall_peach', 1);
    const li = block(body).querySelector<HTMLElement>(`li[data-style="${id}"]`)!;
    li.querySelector<HTMLButtonElement>('[data-action="preview"]')!.click();
    li.querySelector<HTMLButtonElement>('[data-action="buy"]')!.click();
    expect(li.querySelector('.confirm')!.textContent).toContain('Mua Tường hoa đào (bản 2) với 140 Tem? Còn lại 60 Tem.');
    li.querySelector<HTMLButtonElement>('.confirm [data-action="confirm"]')!.click();
    expect(sent).toEqual([{ type: 'buy_style', styleId: id }]);
    expect(styleOf(state, 'wall').id).toBe(id);
    expect(state.retention!.tickets).toBe(60);
    expect(li.querySelector('.badge')!.textContent).toBe('Đang dùng');
  });

  it('dims Mua with the Tem gap when short', () => {
    const state = atWeek(48, 100);
    const { body } = mount(state);
    const li = block(body).querySelector<HTMLElement>(`li[data-style="${variantId('floor_jade', 1)}"]`)!;
    li.querySelector<HTMLButtonElement>('[data-action="preview"]')!.click();
    expect(li.querySelector('[data-action="buy"]')!.getAttribute('aria-disabled')).toBe('true');
    expect(li.querySelector('.reason')!.textContent).toContain('Thiếu 60 Tem');
  });
});

describe('week-end season line: colour variants (T-125)', () => {
  it('stays as before in cycle 0', () => {
    expect(seasonWeekEndLine(atWeek(23), 24)).toEqual({ kind: 'start', text: 'Mùa xuân: 4 kiểu mới bằng Tem, bán tới hết tuần 31.' });
  });

  it('names the new variants and their lowest Tem price when the season starts', () => {
    const state = atWeek(47);
    expect(seasonWeekEndLine(state, 48)).toEqual({
      kind: 'start',
      text: 'Mùa xuân: 4 kiểu mới bằng Tem và 4 bản màu mới từ 140 Tem, bán tới hết tuần 55.',
    });
    ownAll(state, SEASONAL_STYLES.map((s) => s.id));
    const line = seasonWeekEndLine(state, 48)!;
    expect(line.text).toBe('Mùa xuân: 4 bản màu mới từ 140 Tem, bán tới hết tuần 55.');
    expect(line.text).not.toMatch(EMOJI);
  });

  it('warns on the last week while a variant is unbought, and is silent once all are owned', () => {
    const state = atWeek(54);
    ownAll(state, SEASONAL_STYLES.map((s) => s.id));
    expect(seasonWeekEndLine(state, 55)).toEqual({ kind: 'last', text: 'Mùa xuân hết sau tuần này.' });
    ownAll(state, seasonalVariantsFor(55).map((v) => v.id));
    expect(seasonWeekEndLine(state, 55)).toBeNull();
    expect(seasonWeekEndLine(state, 48)).toBeNull();
  });
});
