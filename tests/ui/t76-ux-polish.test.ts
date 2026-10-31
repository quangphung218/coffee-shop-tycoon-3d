// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { saveGame } from '../../src/save/save';
import { createMemoryStorage } from '../../src/save/storage';
import { step, STYLE_SLOTS, stylesOf } from '../../src/sim';
import { endOfDayChallenge } from '../../src/sim/challenges';
import { WEEK_LENGTH, weekGoal } from '../../src/sim/data/week';
import { ensureRetention } from '../../src/sim/retention';
import { createDayStats, createNewGame } from '../../src/sim/state';
import { isStyleUnlocked } from '../../src/sim/styles';
import type { DailyReport, GameState, Mission, WeekChallenge } from '../../src/sim/types';
import { rollWeekPlan } from '../../src/sim/week';
import { toastForEvent } from '../../src/ui/hud/events';
import { PREP_PANELS } from '../../src/ui/panels';
import { renderStylesPanel, styleBuyReason, STYLES_PANEL_ID } from '../../src/ui/panels/styles';
import { TEM_SOURCES_TEXT } from '../../src/ui/panels/widgets';
import { continueDetailText, createMainMenu } from '../../src/ui/screens/mainMenu';
import { challengeBlock, challengeView } from '../../src/ui/weekGoal';

const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as { readFileSync(path: string, encoding: 'utf8'): string };
const EMOJI = /\p{Extended_Pictographic}/u;

afterEach(() => document.body.replaceChildren());

/** A style that needs Tem and is open to buy (not challenge-gated). */
function temStyle(state: GameState) {
  const style = STYLE_SLOTS.flatMap((sl) => stylesOf(sl)).find((s) => s.tickets > 0 && s.price > 0 && isStyleUnlocked(state, s.id));
  if (!style) throw new Error('no open style costs Tem');
  return style;
}

describe('UX-215 Tiếp tục names the moment of a mid-day save', () => {
  it('reads "Ngày N · HH:MM · đang mở cửa" for a save made with the doors open', () => {
    const storage = createMemoryStorage();
    const state = createNewGame('Quán Trưa', 'normal', 7);
    state.day = 3;
    state.phase = 'peak';
    state.minute = 12 * 60 + 30;
    saveGame(state, 'auto', storage, 1000);
    const menu = createMainMenu(storage, { onContinue: () => {}, onNewGame: () => {}, onLoad: () => {}, onSettings: () => {} });
    document.body.append(menu.el);
    menu.onShow?.();
    const btn = [...menu.el.querySelectorAll('button')].find((b) => b.textContent?.includes('Tiếp tục'))!;
    expect(btn.hidden).toBe(false);
    expect(btn.textContent).toContain('Quán Trưa · Ngày 3 · 12:30 · đang mở cửa');
    expect(btn.textContent).not.toMatch(EMOJI);
  });

  it('keeps "Quán · Ngày N" for a save in preparation or the report', () => {
    const slot = { shopName: 'Quán', day: 4 };
    expect(continueDetailText(slot, { phase: 'preparation', minute: 420 })).toBe('Quán · Ngày 4');
    expect(continueDetailText(slot, { phase: 'report', minute: 1320 })).toBe('Quán · Ngày 4');
    expect(continueDetailText(slot)).toBe('Quán · Ngày 4');
    expect(continueDetailText(slot, { phase: 'opening', minute: 7 * 60 + 5 })).toBe('Quán · Ngày 4 · 07:05 · đang mở cửa');
  });
});

describe('UX-212 Phong cách: Tem line and the missing-Tem reason', () => {
  it('says how to earn Tem, not "nhận từ Quà hằng ngày"', () => {
    const state = createNewGame('Quán Tem', 'normal', 7);
    const body = document.createElement('div');
    document.body.append(body);
    renderStylesPanel(body, { dispatch: () => true, getState: () => state, close: () => {} });
    const tem = body.querySelector('[data-summary="tickets"]')!.textContent!;
    expect(tem).toBe(`Tem: ${state.retention?.tickets ?? 0} · ${TEM_SOURCES_TEXT}`);
    expect(tem).not.toContain('Quà hằng ngày');
    expect(tem).toContain('thử thách tuần');
  });

  it('names both the missing money and the missing Tem when short of both', () => {
    const state = createNewGame('Quán Tem', 'normal', 7);
    const style = temStyle(state);
    state.money = style.price - 100_000;
    ensureRetention(state).tickets = style.tickets - 1;
    const reason = styleBuyReason(state, style)!;
    expect(reason).toMatch(/^Thiếu 100\.000đ và 1 Tem \(/);
    expect(reason).toContain('Kiếm Tem từ thử thách tuần');
    expect(reason).not.toContain('Quà hằng ngày');
  });

  it('shows that reason under a dimmed "Mua" in the panel', () => {
    const state = createNewGame('Quán Tem', 'normal', 7);
    const style = temStyle(state);
    state.money = 0;
    ensureRetention(state).tickets = 0;
    const body = document.createElement('div');
    document.body.append(body);
    renderStylesPanel(body, { dispatch: () => true, getState: () => state, close: () => {} });
    body.querySelector<HTMLInputElement>(`input[data-value="${style.slot}"]`)!.click();
    const li = body.querySelector<HTMLElement>(`li[data-style="${style.id}"]`)!;
    li.querySelector<HTMLButtonElement>('[data-action="preview"]')!.click();
    const buy = li.querySelector<HTMLButtonElement>('[data-action="buy"]')!;
    expect(buy.getAttribute('aria-disabled')).toBe('true');
    expect(li.querySelector('.reason')!.textContent).toContain(`và ${style.tickets} Tem`);
  });

  it('missing Tem alone still says how to earn it', () => {
    const state = createNewGame('Quán Tem', 'normal', 7);
    const style = temStyle(state);
    state.money = style.price;
    ensureRetention(state).tickets = 0;
    expect(styleBuyReason(state, style)).toBe(`Thiếu ${style.tickets} Tem (cần ${style.tickets}, có 0). Kiếm Tem từ thử thách tuần, mốc khách quen, đơn đặc biệt, khách VIP và thành tích.`);
  });
});

describe('UX-211/214 Phong cách tabs and dock label', () => {
  it('labels the dock button "Phong cách"', () => {
    expect(PREP_PANELS.find((p) => p.id === STYLES_PANEL_ID)?.label).toBe('Phong cách');
  });

  it('lays the four slot tabs on one row of equal columns', () => {
    const css = readFileSync('src/ui/panels/panels.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = /\.styles-panel \.seg\.seg \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/display:\s*grid/);
    expect(rule).toMatch(/grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
    expect(STYLE_SLOTS).toHaveLength(4);
  });
});

/** Week 5, week day 3, with challenge `c` and nothing folded yet. */
function weekWith(c: Omit<WeekChallenge, 'settledDay' | 'status' | 'progress' | 'reward'>): GameState {
  const state = createNewGame('Quán Thử', 'normal', 4242);
  const index = 5;
  const startedDay = (index - 1) * WEEK_LENGTH + 1;
  state.day = startedDay + 2;
  state.today = createDayStats(state.day, state.rating);
  state.week = { length: WEEK_LENGTH, index, startedDay, plan: rollWeekPlan(state.seed, index), goal: weekGoal('normal', index) };
  state.week.challenge = { ...c, reward: { tickets: 5 }, progress: 0, settledDay: state.day - 1, status: 'active' };
  return state;
}

const report = (missions: Mission[] = []): DailyReport => ({ missions }) as unknown as DailyReport;
const mission = (status: Mission['status']): Mission => ({ id: 'serve', target: 1, progress: 0, rewardXp: 0, rewardMoney: 0, status }) as unknown as Mission;
const text = (el: HTMLElement, which: string): string => el.querySelector(`[data-challenge="${which}"]`)?.textContent ?? '';

describe('UX-210 per-day challenges show "Ngày tốt nhất"', () => {
  it('calm_day: no 0/1, the best day nobody walked out', () => {
    const state = weekWith({ id: 'calm_day', target: 1, minServed: 300 });
    let el = challengeBlock(challengeView(state)!);
    expect(text(el, 'value')).toBe('Chưa đạt');
    expect(text(el, 'best')).toBe('Ngày tốt nhất: chưa có ngày nào không ai bỏ về');
    state.today.customersServed = 245;
    state.today.customersLost = 0;
    endOfDayChallenge(state, report());
    el = challengeBlock(challengeView(state)!);
    expect(el.textContent).not.toContain('0/1');
    expect(text(el, 'best')).toBe('Ngày tốt nhất: 245/300 khách, không ai bỏ về');
  });

  it('stars_week: the highest closing rating', () => {
    const state = weekWith({ id: 'stars_week', target: 7 });
    state.rating = 4.94;
    endOfDayChallenge(state, report());
    const el = challengeBlock(challengeView(state)!);
    expect(text(el, 'value')).toBe('1/7 ngày');
    expect(text(el, 'best')).toBe('Ngày tốt nhất: 4,9 sao');
  });

  it('perfect_days: the most missions done in a day', () => {
    const state = weekWith({ id: 'perfect_days', target: 4 });
    endOfDayChallenge(state, report([mission('completed'), mission('completed'), mission('active')]));
    const el = challengeBlock(challengeView(state)!);
    expect(text(el, 'value')).toBe('0/4 ngày');
    expect(text(el, 'best')).toBe('Ngày tốt nhất: 2/3 nhiệm vụ');
  });

  it('additive challenges keep value/target and no best line', () => {
    const state = weekWith({ id: 'served_week', target: 400 });
    const el = challengeBlock(challengeView(state)!);
    expect(text(el, 'value')).toBe('0/400');
    expect(el.querySelector('[data-challenge="best"]')).toBeNull();
  });
});

describe('UX-102 "Kết thúc ngày N" toast', () => {
  it('is not raised over the Daily Report, whose heading already says "Hết ngày N"', () => {
    const state = createNewGame('Quán Tối', 'normal', 7);
    state.phase = 'report';
    expect(toastForEvent({ type: 'notify', level: 'info', text: 'Kết thúc ngày 3' }, state, 0)).toBeNull();
    // Other notices still toast.
    expect(toastForEvent({ type: 'notify', level: 'info', text: 'Đã lưu' }, state, 0)).not.toBeNull();
  });

  it('a real day end raises no toast that could cover the report week strip', () => {
    const state = createNewGame('Quán Tối', 'normal', 7);
    // The empty shop after closing time: the next ticks end the day.
    state.phase = 'closing' as GameState['phase'];
    state.minute = 22 * 60;
    state.customers = [];
    for (let i = 0; i < 200 && (state.phase as string) !== 'report'; i++) step(state, 1);
    expect(state.phase).toBe('report');
    const titles = state.events.map((e) => toastForEvent(e, state, 0)?.title).filter(Boolean);
    expect(titles.some((t) => /Kết thúc ngày/.test(String(t)))).toBe(false);
  });
});
