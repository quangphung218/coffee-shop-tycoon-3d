// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createNewGame } from '../../src/sim/state';
import type { GameState } from '../../src/sim/types';
import { toastForEvent } from '../../src/ui/hud/events';
import { createHud } from '../../src/ui/hud/hud';
import { renderTasksPanel } from '../../src/ui/panels/tasks';

function game(): GameState {
  return createNewGame('Quán Thử', 'normal', 42);
}

/** Moves the game to week day `day`, with that day's planned weather. */
function onWeekDay(state: GameState, day: number): GameState {
  const plan = state.week!.plan.find((p) => p.day === day)!;
  state.day = state.week!.startedDay + day - 1;
  state.weather = plan.weather;
  return state;
}

/** An older save: no week plan. */
function withoutWeek(): GameState {
  const state = game();
  delete state.week;
  return state;
}

function mountHud(state: GameState): HTMLElement {
  const hud = createHud({ dispatch: () => true, getState: () => state, onPause() {}, onSettings() {}, onResetCamera() {} });
  document.body.append(hud.el);
  hud.el.hidden = false;
  hud.update(state);
  return hud.el;
}

function mountTasks(state: GameState): HTMLElement {
  const body = document.createElement('div');
  document.body.append(body);
  renderTasksPanel(body, { dispatch: () => true, getState: () => state, close() {} });
  return body;
}

function chip(root: ParentNode, kind: 'weather' | 'event'): HTMLElement {
  const el = root.querySelector<HTMLElement>(`[data-chip="${kind}"]`);
  if (!el) throw new Error(`missing ${kind} chip`);
  return el;
}

afterEach(() => {
  document.body.replaceChildren();
});

function dayText(el: HTMLElement): { day: string; week: HTMLElement } {
  return { day: el.querySelector('[data-stat="day"]')!.textContent!, week: el.querySelector<HTMLElement>('[data-stat="week"]')! };
}

describe('HUD during a week', () => {
  it('shows "Ngày 1", "Tuần 1 · 1/7", the weather icon and the grand opening chip', () => {
    const el = mountHud(game());
    const { day, week } = dayText(el);
    expect(day).toBe('Ngày 1');
    expect(week.hidden).toBe(false);
    expect(week.textContent).toBe('Tuần 1 · 1/7');
    expect(el.querySelector<HTMLElement>('.hud-week')!.hidden).toBe(false);
    // Weather is an icon; its name and effect are the accessible name and title.
    const weather = chip(el, 'weather');
    expect(weather.textContent).toBe('');
    expect(weather.getAttribute('role')).toBe('img');
    expect(weather.querySelector('.ic')).toBeTruthy();
    expect(weather.getAttribute('aria-label')).toBe('Nắng: khách như thường');
    const event = chip(el, 'event');
    expect(event.hidden).toBe(false);
    expect(event.textContent).toBe('Khai trương');
    expect(event.getAttribute('aria-label')).toBe('Khai trương: lượt ghé tăng tới +15%');
    expect(event.title).toBe('Khai trương: lượt ghé tăng tới +15%');
  });

  it('shows the fair chip, with its walk-in boost as a ceiling, on a fair day', () => {
    const state = game();
    const fair = state.week!.plan.find((p) => p.event === 'fair')!;
    const el = mountHud(onWeekDay(state, fair.day));
    expect(dayText(el).day).toBe(`Ngày ${fair.day}`);
    expect(dayText(el).week.textContent).toBe(`Tuần 1 · ${fair.day}/7`);
    const event = chip(el, 'event');
    expect(event.textContent).toBe('Hội chợ');
    expect(event.getAttribute('aria-label')).toBe('Hội chợ: lượt ghé tăng tới +40%');
    expect(event.title).toBe('Hội chợ: lượt ghé tăng tới +40%');
    expect(event.title).not.toContain('khách +40%');
  });

  it('names the supplier hike by its price rise', () => {
    const state = game();
    const hike = state.week!.plan.find((p) => p.event === 'supplier_hike')!;
    const el = mountHud(onWeekDay(state, hike.day));
    expect(chip(el, 'event').textContent).toBe('Tăng giá nhập');
    expect(chip(el, 'event').getAttribute('aria-label')).toBe('Tăng giá nhập: giá nhập và giá vốn +25%');
  });

  it('describes rain by its effect on arrivals', () => {
    const state = game();
    const rain = state.week!.plan.find((p) => p.weather === 'rainy')!;
    const el = mountHud(onWeekDay(state, rain.day));
    expect(chip(el, 'weather').getAttribute('aria-label')).toBe('Mưa: khách -25%, đồ nóng bán chạy');
  });

  it('hides the event chip on an ordinary day', () => {
    const state = game();
    const plain = state.week!.plan.find((p) => p.event === 'none')!;
    const el = mountHud(onWeekDay(state, plain.day));
    expect(chip(el, 'weather').hidden).toBe(false);
    expect(chip(el, 'event').hidden).toBe(true);
    expect(el.textContent).not.toContain('Ngày thường');
  });

  it('counts the game day and the week from week 2 on', () => {
    const state = game();
    state.week!.index = 2;
    state.week!.startedDay = 8;
    state.day = 12;
    const el = mountHud(state);
    expect(dayText(el).day).toBe('Ngày 12');
    expect(dayText(el).week.textContent).toBe('Tuần 2 · 5/7');
  });

  it('keeps the day alone and no chips for a save without a week', () => {
    const el = mountHud(withoutWeek());
    expect(dayText(el).day).toBe('Ngày 1');
    expect(dayText(el).week.hidden).toBe(true);
    expect(el.textContent).not.toContain('/7');
    expect(el.querySelector<HTMLElement>('.hud-week')!.hidden).toBe(true);
    // The phase pill does not depend on the week.
    expect(el.querySelector('.phase-pill')!.textContent).toBe('Chuẩn bị');
  });
});

describe('Task Board "Hôm nay" block', () => {
  it('lists the grand opening, the starter menu and tomorrow on day 1', () => {
    const state = game();
    const body = mountTasks(state);
    const block = body.querySelector<HTMLElement>('.week-today')!;
    expect(block.hidden).toBe(false);
    expect(block.querySelector('[data-week="event"]')!.textContent).toContain('Khai trương');
    expect(block.querySelector('[data-week="unlocks"]')!.textContent).toMatch(/^Khởi đầu với: /);
    const tomorrow = state.week!.plan[1]!;
    expect(block.querySelector('[data-week="tomorrow"]')!.textContent).toMatch(/^Ngày mai: (Nắng|Mưa|Nóng) · /);
    expect(block.querySelector('[data-week="tomorrow"]')!.textContent).toContain(
      { sunny: 'Nắng', rainy: 'Mưa', hot: 'Nóng' }[tomorrow.weather],
    );
  });

  it('gives the fair the same walk-in ceiling as the HUD chip', () => {
    const state = game();
    const fair = state.week!.plan.find((p) => p.event === 'fair')!;
    const line = mountTasks(onWeekDay(state, fair.day)).querySelector('[data-week="event"]')!.textContent;
    expect(line).toContain('(lượt ghé tăng tới +40%)');
    expect(line).not.toContain('khách +40%');
  });

  it("names what today's calendar opens", () => {
    const body = mountTasks(onWeekDay(game(), 2));
    expect(body.querySelector('[data-week="unlocks"]')!.textContent).toBe('Mới mở khóa hôm nay: Cappuccino, Máy xay hạt, Máy làm đá.');
  });

  it('says the shop has expanded on day 7, with no tomorrow line', () => {
    const body = mountTasks(onWeekDay(game(), 7));
    expect(body.querySelector('[data-week="expand"]')!.textContent).toBe('Quán đã mở rộng.');
    expect(body.querySelector('[data-week="tomorrow"]')).toBeNull();
  });

  it('is hidden for a save without a week', () => {
    const body = mountTasks(withoutWeek());
    expect(body.querySelector<HTMLElement>('.week-today')!.hidden).toBe(true);
    expect(body.textContent).not.toContain('/7');
  });
});

describe('week unlock toast', () => {
  it('names what the day opens', () => {
    const t = toastForEvent({ type: 'week_unlocks', day: 3, unlocks: { menu: ['orange_juice'], upgrades: [], tools: ['pastry_case'] } }, game());
    expect(t).toMatchObject({ level: 'success', title: 'Ngày 3: mở khóa mới' });
    expect(t!.text).toContain('Nước cam');
  });
});
