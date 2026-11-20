// @vitest-environment jsdom
// E-28 UI: the Mức giá row shows the days of High price left, and the day it
// runs out a short notice (no dialog, no emoji) with a button to set it again.
import { afterEach, describe, expect, it } from 'vitest';
import { dispatch as simDispatch } from '../../src/sim';
import { startNextDay } from '../../src/sim/clock';
import { HIGH_PRICE_DAYS, policyLevel } from '../../src/sim/policies';
import { createNewGame } from '../../src/sim/state';
import type { Command, GameState } from '../../src/sim/types';
import type { PanelContext } from '../../src/ui/hud/panels';
import { HIGH_PRICE_ENDED_TEXT, HIGH_PRICE_RESET_TEXT, highPriceLeftText, renderMenuPanel } from '../../src/ui/panels/menu';

const EMOJI = /\p{Extended_Pictographic}/u;

function mount(state: GameState): { body: HTMLElement; update: () => void; sent: Command[] } {
  const body = document.createElement('div');
  document.body.append(body);
  const sent: Command[] = [];
  const ctx: PanelContext = {
    dispatch: (cmd) => {
      sent.push(cmd);
      return simDispatch(state, cmd);
    },
    getState: () => state,
    close: () => {},
  };
  const handle = renderMenuPanel(body, ctx);
  return { body, update: () => handle.update?.(state), sent };
}

function pickHigh(body: HTMLElement): void {
  const radio = body.querySelector<HTMLInputElement>('[data-seg="price"] input[data-value="high"]')!;
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Ends today and starts the next day (preparation). */
function nextDay(state: GameState): void {
  state.phase = 'report';
  expect(startNextDay(state)).toBe(true);
}

const left = (body: HTMLElement) => body.querySelector<HTMLElement>('[data-hint="price-left"]')!;
const notice = (body: HTMLElement) => body.querySelector<HTMLElement>('[data-notice="price-ended"]')!;

afterEach(() => document.body.replaceChildren());

describe('E-28: High price days left and expiry notice in Menu', () => {
  it('shows no days line or notice at the standard price', () => {
    const state = createNewGame('Quán Cao', 'normal', 28);
    expect(state.phase).toBe('preparation');
    const { body } = mount(state);
    expect(left(body).hidden).toBe(true);
    expect(notice(body).hidden).toBe(true);
  });

  it('counts the days of High left, then shows the notice and sets High again from its button', () => {
    const state = createNewGame('Quán Cao', 'normal', 28);
    const { body, update, sent } = mount(state);
    pickHigh(body);
    expect(policyLevel(state, 'price')).toBe('high');
    expect(left(body).hidden).toBe(false);
    expect(left(body).textContent).toBe(highPriceLeftText(HIGH_PRICE_DAYS));
    expect(left(body).textContent).toBe('Giá Cao còn 7 ngày.');

    for (let d = 1; d < HIGH_PRICE_DAYS; d++) {
      nextDay(state);
      update();
      expect(left(body).textContent).toBe(highPriceLeftText(HIGH_PRICE_DAYS - d));
      expect(notice(body).hidden).toBe(true);
    }
    expect(left(body).textContent).toBe('Giá Cao còn 1 ngày.');

    // Day 8: High has run out.
    nextDay(state);
    update();
    expect(policyLevel(state, 'price')).toBe('standard');
    expect(left(body).hidden).toBe(true);
    const n = notice(body);
    expect(n.hidden).toBe(false);
    expect(n.textContent).toContain(HIGH_PRICE_ENDED_TEXT);
    expect(HIGH_PRICE_ENDED_TEXT).toBe('Đặt lại giá Cao để giữ thêm 7 ngày.');
    expect(n.textContent).not.toMatch(EMOJI);
    expect(document.querySelector('[role="dialog"], dialog, .modal')).toBeNull();

    const btn = n.querySelector<HTMLButtonElement>('[data-action="price-high-again"]')!;
    expect(btn.textContent).toBe(HIGH_PRICE_RESET_TEXT);
    btn.click();
    expect(sent.at(-1)).toEqual({ type: 'set_policy', policy: 'price', level: 'high' });
    expect(policyLevel(state, 'price')).toBe('high');
    expect(state.highPriceSinceDay).toBe(state.day);
    expect(notice(body).hidden).toBe(true);
    expect(left(body).textContent).toBe('Giá Cao còn 7 ngày.');
    expect(body.querySelector<HTMLInputElement>('[data-seg="price"] input[data-value="high"]')!.checked).toBe(true);
  });

  it('the notice is gone the next day, and once a price is picked by hand', () => {
    const state = createNewGame('Quán Cao', 'normal', 28);
    const { body, update } = mount(state);
    pickHigh(body);
    for (let d = 0; d < HIGH_PRICE_DAYS; d++) nextDay(state);
    update();
    expect(notice(body).hidden).toBe(false);
    nextDay(state);
    update();
    expect(notice(body).hidden).toBe(true);

    // Picking Rẻ on the day it ran out also clears it.
    const s2 = createNewGame('Quán Cao', 'normal', 28);
    const m2 = mount(s2);
    pickHigh(m2.body);
    for (let d = 0; d < HIGH_PRICE_DAYS; d++) nextDay(s2);
    m2.update();
    expect(notice(m2.body).hidden).toBe(false);
    const low = m2.body.querySelector<HTMLInputElement>('[data-seg="price"] input[data-value="low"]')!;
    low.checked = true;
    low.dispatchEvent(new Event('change', { bubbles: true }));
    expect(policyLevel(s2, 'price')).toBe('low');
    expect(notice(m2.body).hidden).toBe(true);
  });

  it('hides the notice once the day is open (price locked)', () => {
    const state = createNewGame('Quán Cao', 'normal', 28);
    const { body, update } = mount(state);
    pickHigh(body);
    for (let d = 0; d < HIGH_PRICE_DAYS; d++) nextDay(state);
    update();
    expect(notice(body).hidden).toBe(false);
    state.phase = 'opening';
    update();
    expect(notice(body).hidden).toBe(true);
  });
});
