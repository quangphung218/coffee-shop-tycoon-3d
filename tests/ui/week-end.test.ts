// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { createMemoryStorage, type StorageLike } from '../../src/save/storage';
import { WEEK_LENGTH, weekGoal } from '../../src/sim/data/week';
import { dailyRent, totalWages } from '../../src/sim/economy';
import { grantWeekReward } from '../../src/sim/progression';
import { buildDailyReport, closeDay } from '../../src/sim/report';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { GameState } from '../../src/sim/types';
import { rollWeekPlan, scoreWeek, summarizeWeek } from '../../src/sim/week';
import { formatMoney } from '../../src/ui/core/format';
import { toastForEvent } from '../../src/ui/hud/events';
import { createShell, type Shell } from '../../src/ui/screens/shell';
import { REPLAY_CONFIRM_MS, weekProfitRule } from '../../src/ui/screens/weekEnd';

let shell: Shell | null = null;

afterEach(() => {
  shell?.dispose();
  shell = null;
  document.body.replaceChildren();
});

function boot(onReplay?: (finished: GameState) => void, storage: StorageLike = createMemoryStorage()): { root: HTMLElement; shell: Shell } {
  const root = document.createElement('div');
  document.body.append(root);
  shell = createShell({ root, storage, settings: { ...DEFAULT_SETTINGS }, seed: () => 99, onReplay });
  return { root, shell };
}

/** Scores the week like closeDay does on its last day: result, one archive row and the cup reward paid. */
function scoreLastDay(state: GameState): void {
  const result = scoreWeek(state)!;
  state.week!.result = result;
  (state.week!.archive ??= []).push(summarizeWeek(state, result)!);
  result.reward = grantWeekReward(state, result);
}

/**
 * A game in the report phase of week day `day`; day 7 is scored like the sim
 * does at closing. Earlier days earn `pastRevenue` each, today `todayRevenue`.
 */
function atReport(day: number, { pastRevenue = 3_000_000, todayRevenue = 2_000_000, rating = 4.4 } = {}): GameState {
  const state = createNewGame('Quán Cuối Tuần', 'hard', 42);
  for (let d = 1; d < day; d++) {
    const stats = createDayStats(d, 4);
    stats.revenue = pastRevenue;
    stats.customersServed = 40 + d;
    state.history.push(stats);
  }
  state.day = day;
  state.today = createDayStats(day, 4);
  state.today.revenue = todayRevenue;
  state.today.customersServed = 50;
  state.rating = rating;
  state.phase = 'report';
  if (day === WEEK_LENGTH) scoreLastDay(state);
  return state;
}

/**
 * Week 1 as atReport(7), then week 2 (days 8–14) played to its scored report:
 * 4.000.000đ and 60 customers a day, 5.000.000đ on day 10, 3.000.000đ today.
 */
function atWeek2Report(): GameState {
  const state = atReport(WEEK_LENGTH);
  const archive = state.week!.archive;
  state.history.push(state.today);
  state.week = { length: 7, index: 2, startedDay: 8, plan: rollWeekPlan(state.seed, 2), goal: weekGoal('hard', 2), archive };
  for (let d = 8; d < 14; d++) {
    const stats = createDayStats(d, 4);
    stats.revenue = d === 10 ? 5_000_000 : 4_000_000;
    stats.customersServed = 60;
    state.history.push(stats);
  }
  state.day = 14;
  state.today = createDayStats(14, 4);
  state.today.revenue = 3_000_000;
  state.today.customersServed = 60;
  scoreLastDay(state);
  return state;
}

function mainButton(s: Shell): HTMLButtonElement {
  return s.report.el.querySelector<HTMLButtonElement>('.rpt-foot .btn-primary')!;
}

function weekEndEl(root: HTMLElement): HTMLElement {
  const el = root.querySelector<HTMLElement>('[data-screen="weekEnd"]');
  if (!el) throw new Error('missing week-end screen');
  return el;
}

function block(root: ParentNode, name: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(`[data-block="${name}"]`);
  if (!el) throw new Error(`missing block ${name}`);
  return el;
}

function action(root: ParentNode, name: string): HTMLButtonElement {
  const el = root.querySelector<HTMLButtonElement>(`[data-action="${name}"]`);
  if (!el) throw new Error(`missing action ${name}`);
  return el;
}

/** Report of the last week day → "Xem tổng kết tuần". */
function openWeekEnd(state: GameState = atReport(WEEK_LENGTH)): { root: HTMLElement; shell: Shell; state: GameState } {
  const { root, shell } = boot();
  shell.startGame(state);
  mainButton(shell).click();
  return { root, shell, state };
}

/** Memory storage whose writes throw while `fail` is set (full or blocked). */
function flakyStorage(): StorageLike & { fail: boolean } {
  const inner = createMemoryStorage();
  const s = {
    fail: true,
    getItem: (k: string) => inner.getItem(k),
    setItem: (k: string, v: string) => {
      if (s.fail) throw new Error('QuotaExceededError');
      inner.setItem(k, v);
    },
    removeItem: (k: string) => inner.removeItem(k),
  };
  return s;
}

describe('Daily Report main button', () => {
  it('reads "Xem tổng kết tuần" once the week is scored, and opens the week summary', () => {
    const { root, shell } = boot();
    shell.startGame(atReport(WEEK_LENGTH));
    expect(shell.report.visible).toBe(true);
    const btn = mainButton(shell);
    expect(btn.textContent).toBe('Xem tổng kết tuần');
    expect(btn.dataset.action).toBe('week-end');
    expect(btn.querySelector('[data-icon="i-trophy"]')).not.toBeNull();

    btn.click();
    expect(shell.screen).toBe('weekEnd');
    expect(shell.report.visible).toBe(false);
    expect(weekEndEl(root).hidden).toBe(false);
    // Opening the summary does not move the day on.
    expect(shell.state?.day).toBe(WEEK_LENGTH);
  });

  it('stays "Ngày tiếp theo" on day 3 and moves to day 4', () => {
    const { shell } = boot();
    shell.startGame(atReport(3));
    const btn = mainButton(shell);
    expect(btn.textContent).toBe('Ngày tiếp theo');
    expect(btn.dataset.action).toBe('next-day');
    btn.click();
    expect(shell.screen).toBeNull();
    expect(shell.state?.day).toBe(4);
  });
});

describe('Daily Report of the last week day', () => {
  /** atReport with a built report whose insights flag one metric linked to a panel. */
  function withReport(day: number): GameState {
    const state = atReport(day);
    state.today.customersArrived = 60;
    const report = buildDailyReport(state);
    report.insights!.metrics = report.insights!.metrics.map((m) =>
      m.id === 'seat_fill' ? { ...m, status: 'bad', advice: 'Ghế gần kín: thêm bàn.', panel: 'upgrades' } : m,
    );
    state.lastReport = report;
    return state;
  }

  it('gives tips for next week, not for day 8', () => {
    const { shell } = boot();
    shell.startGame(withReport(WEEK_LENGTH));
    const el = shell.report.el;
    expect(el.textContent).not.toContain('ngày 8');
    expect(el.textContent).toContain('Gợi ý cho tuần sau');
  });

  it('drops the insight links that would open a panel, keeping "Xem tổng kết tuần"', () => {
    const { shell } = boot();
    shell.startGame(withReport(WEEK_LENGTH));
    const el = shell.report.el;
    expect(el.querySelector('[data-block="insight-tips"] [data-metric="seat_fill"]')?.textContent).toContain('Ghế gần kín');
    expect(el.querySelector('button[data-goto]')).toBeNull();
    expect(mainButton(shell).dataset.action).toBe('week-end');
  });

  it('keeps the links and the next-day tips on day 3', () => {
    const { shell } = boot();
    shell.startGame(withReport(3));
    const el = shell.report.el;
    expect(el.querySelector('[data-metric="seat_fill"] button[data-goto="upgrades"]')).not.toBeNull();
    expect(el.textContent).toContain('Gợi ý cho ngày 4');
  });
});

describe('week summary', () => {
  it('shows revenue and stars against the goal, the score and the cups', () => {
    const { root, state } = openWeekEnd();
    const r = state.week!.result!;
    const el = weekEndEl(root);
    expect(el.querySelector('h3')?.textContent).toBe('Tổng kết tuần 1');
    expect(el.querySelector('.rpt-sub')?.textContent).toContain('Ngày 1–7');

    // 6 × 3.000.000 + 2.000.000 against the hard goal.
    expect(r.revenue).toBe(20_000_000);
    const revenue = block(el, 'revenue');
    expect(revenue.textContent).toContain('20.000.000đ');
    expect(revenue.textContent).toContain(`mục tiêu 33.000.000đ`);
    const bar = revenue.querySelector<HTMLElement>('[role="progressbar"]')!;
    expect(bar.getAttribute('aria-valuenow')).toBe(String(Math.round((r.revenue / r.revenueTarget) * 100)));
    expect(revenue.textContent).toContain('Chưa đạt');

    const stars = block(el, 'stars');
    expect(stars.textContent).toContain('4,4');
    expect(stars.textContent).toContain('mục tiêu 4,2 sao');
    expect(stars.textContent).toContain('Đạt mục tiêu');

    // Week 1 spreads its upgrades like later weeks (E-11); Hard over three weeks.
    const profitEl = block(el, 'profit');
    expect(profitEl.closest('section')?.textContent).toContain('Lợi nhuận tuần');
    expect(profitEl.textContent).toContain(`${formatMoney(r.profit!)} / mục tiêu ${formatMoney(r.profitTarget!)}`);
    expect(block(el, 'profit-rule').textContent).toBe('Lãi các ngày trừ tiền nâng cấp chia đều 3 tuần kể từ tuần mua.');

    expect(block(el, 'score').textContent).toContain(`${r.score}/100`);
    const cups = block(el, 'cups');
    expect(cups.dataset.cups).toBe(String(r.cups));
    expect(cups.children).toHaveLength(3);
    expect(cups.querySelectorAll('.is-off')).toHaveLength(3 - r.cups);
    expect(cups.getAttribute('aria-label')).toBe(`${r.cups}/3 cúp`);
  });

  it('draws one column per day sized by revenue, the best day marked', () => {
    const { root } = openWeekEnd();
    const cols = block(weekEndEl(root), 'days').querySelectorAll<HTMLElement>('li');
    expect(cols).toHaveLength(WEEK_LENGTH);
    // Days 1–6 tie at 3.000.000đ: the earliest is the best.
    const best = [...cols].filter((c) => c.hasAttribute('data-best'));
    expect(best.map((c) => c.dataset.day)).toEqual(['1']);
    expect(best[0]!.classList.contains('is-best')).toBe(true);
    expect(cols[0]!.getAttribute('aria-label')).toContain('Khai trương');
    expect(cols[0]!.getAttribute('aria-label')).toContain('3.000.000đ');
    expect(cols[0]!.getAttribute('aria-label')).toContain('ngày tốt nhất');
    expect(cols[0]!.querySelector<HTMLElement>('.wk-bar')!.style.height).toBe('100%');
    expect(cols[WEEK_LENGTH - 1]!.querySelector<HTMLElement>('.wk-bar')!.style.height).toBe('67%');
    expect(cols[WEEK_LENGTH - 1]!.textContent).toContain('2,0tr');
  });

  it('has no comparison in week 1', () => {
    const { root } = openWeekEnd();
    const el = weekEndEl(root);
    expect(el.querySelector('[data-block="compare"]')).toBeNull();
    expect(el.textContent).not.toContain('So với tuần');
  });

  it('compares week 2 with week 1', () => {
    const { root, state } = openWeekEnd(atWeek2Report());
    const el = weekEndEl(root);
    expect(el.querySelector('h3')?.textContent).toBe('Tổng kết tuần 2');
    expect(el.querySelector('.rpt-sub')?.textContent).toContain('Ngày 8–14');
    expect(state.week!.result!.revenue).toBe(28_000_000);

    // Hard spreads upgrades over three weeks.
    expect(block(el, 'profit-rule').textContent).toBe('Lãi các ngày trừ tiền nâng cấp chia đều 3 tuần kể từ tuần mua.');

    const compare = block(el, 'compare');
    expect(compare.closest('section')?.textContent).toContain('So với tuần 1');
    const head = [...compare.querySelectorAll('th')].map((th) => th.textContent);
    expect(head).toEqual(['Chỉ số', 'Tuần 2', 'Tuần 1', 'Thay đổi']);
    const revenue = compare.querySelector<HTMLElement>('tr[data-stat="revenue"]')!;
    expect(revenue.textContent).toContain('28.000.000đ');
    expect(revenue.textContent).toContain('20.000.000đ');
    expect(revenue.textContent).toContain('+8.000.000đ');
    expect(revenue.querySelector('[data-delta]')?.getAttribute('data-delta')).toBe('up');
    const served = compare.querySelector<HTMLElement>('tr[data-stat="customersServed"]')!;
    // 7 × 60 against 41 + … + 46 + 50.
    expect(served.textContent).toContain('420');
    expect(served.textContent).toContain('+109');

    // Every figure has a signed, toned change; last week's cell can drop out when narrow.
    const rows = [...compare.querySelectorAll<HTMLTableRowElement>('tbody tr')];
    expect(rows.map((tr) => tr.dataset.stat)).toEqual(['profit', 'revenue', 'customersServed', 'abandonRate', 'stars']);
    for (const tr of rows) {
      const d = tr.querySelector<HTMLElement>('.wk-delta');
      expect(d, tr.dataset.stat).not.toBeNull();
      expect(d!.className).toMatch(/is-(up|down|flat)/);
      expect(d!.textContent).toMatch(/^([+−]|0$)/);
      expect(tr.querySelectorAll('td.wk-prev')).toHaveLength(1);
      expect(tr.cells).toHaveLength(4);
    }

    // Day 10 (week day 3) sold the most.
    const best = block(el, 'days').querySelector<HTMLElement>('[data-best]');
    expect(best?.dataset.day).toBe('3');
    expect(best?.textContent).toContain('5,0tr');
  });

  it('shows the cup reward and next week\'s goal and shop level', () => {
    const { root, state } = openWeekEnd(atReport(WEEK_LENGTH, { pastRevenue: 5_000_000, todayRevenue: 5_000_000, rating: 5 }));
    expect(state.week!.result!.cups).toBe(3);
    const el = weekEndEl(root);
    expect(block(el, 'reward').textContent).toContain('+3.000.000đ');

    const next = block(el, 'next-week');
    expect(next.closest('section')?.textContent).toContain('Tuần 2');
    expect(next.querySelector('[data-next="goal"]')?.textContent).toContain('54.500.000đ');
    expect(next.querySelector('[data-next="goal"]')?.textContent).toContain('4,2 sao');
    const levelEl = next.querySelector<HTMLElement>('[data-next="level"]')!;
    const level = levelEl.textContent ?? '';
    expect(level).toContain('Cấp 2 · Quán quen: mở');
    expect(level).toContain('Cappuccino');
    // The colon stays with its label.
    expect(levelEl.querySelector('.wk-next-label')?.textContent).toBe('Cấp 2 · Quán quen:');
  });

  it('shows exactly the reward closeDay added to the money in a new game', () => {
    // A new game closing week day 7 with 2+ cups: the real closeDay scores and pays.
    const state = createNewGame('Quán Mới', 'normal', 7);
    for (let d = 1; d < WEEK_LENGTH; d++) {
      const stats = createDayStats(d, 4.5);
      stats.revenue = 5_000_000;
      state.history.push(stats);
    }
    state.day = WEEK_LENGTH;
    state.today = createDayStats(WEEK_LENGTH, 4.5);
    state.today.revenue = 5_000_000;
    state.rating = 4.5;
    const before = state.money;
    const wages = totalWages(state) + dailyRent(state);
    state.lastReport = closeDay(state);
    state.phase = 'report';
    const result = state.week!.result!;
    expect(result.cups).toBeGreaterThanOrEqual(2);
    const paid = state.money - before + wages;
    expect(paid).toBeGreaterThan(0);
    expect(result.reward).toBe(paid);

    const { root } = openWeekEnd(state);
    expect(block(weekEndEl(root), 'reward').textContent).toBe(`Thưởng +${formatMoney(paid)}`);
  });

  it('lights all 3 cups when both goals are beaten', () => {
    const { root, state } = openWeekEnd(atReport(WEEK_LENGTH, { pastRevenue: 5_000_000, todayRevenue: 5_000_000, rating: 5 }));
    const r = state.week!.result!;
    expect(r.cups).toBe(3);
    const el = weekEndEl(root);
    expect(block(el, 'score').textContent).toContain('100/100');
    const cups = block(el, 'cups');
    expect(cups.dataset.cups).toBe('3');
    expect(cups.querySelectorAll('.is-off')).toHaveLength(0);
    expect(block(el, 'revenue').textContent).toContain('Đạt mục tiêu');
    expect(block(el, 'stars').textContent).toContain('Đạt mục tiêu');
  });

  it('dims every cup, pays nothing and marks both goals unmet on a week without sales', () => {
    const { root, state } = openWeekEnd(atReport(WEEK_LENGTH, { pastRevenue: 0, todayRevenue: 0, rating: 1 }));
    expect(state.week!.result!.cups).toBe(0);
    const el = weekEndEl(root);
    const cups = block(el, 'cups');
    expect(cups.dataset.cups).toBe('0');
    expect(cups.querySelectorAll('.is-off')).toHaveLength(3);
    expect(el.querySelector('[data-block="reward"]')).toBeNull();
    expect(block(el, 'revenue').textContent).toContain('0% mục tiêu');
    expect(block(el, 'stars').textContent).toContain('Chưa đạt');
    // No bar has a height without sales.
    for (const bar of block(el, 'days').querySelectorAll<HTMLElement>('.wk-bar')) expect(bar.style.height).toBe('0%');
    expect(action(el, 'next-week').textContent).toBe('Sang tuần 2');
  });

  it('shows no profit block for a week scored before profit counted, and no emoji in the rule', () => {
    const state = atReport(WEEK_LENGTH);
    delete state.week!.result!.profit;
    delete state.week!.result!.profitTarget;
    const { root } = openWeekEnd(state);
    expect(weekEndEl(root).querySelector('[data-block="profit"]')).toBeNull();
    for (const d of ['easy', 'normal', 'hard'] as const) expect(weekProfitRule(d)).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('says the last day was not saved, offers "Thử lại", and keeps the results', () => {
    const storage = flakyStorage();
    const { root, shell } = boot(undefined, storage);
    shell.startGame(atReport(WEEK_LENGTH));
    shell.handleEvents([{ type: 'dayEnded', day: WEEK_LENGTH }]);
    mainButton(shell).click();

    const el = weekEndEl(root);
    const save = el.querySelector<HTMLElement>('[data-save]')!;
    expect(save.classList.contains('is-error')).toBe(true);
    expect(save.getAttribute('role')).toBe('alert');
    expect(save.textContent).toContain('Chưa tự lưu được ngày 7, kết quả vẫn hiển thị');
    const retry = action(save, 'retry-save');
    expect(retry.textContent).toBe('Thử lại');
    for (const name of ['score', 'cups', 'revenue', 'stars', 'days', 'next-week']) expect(() => block(el, name)).not.toThrow();

    retry.click();
    expect(save.textContent).toContain('Chưa tự lưu được ngày 7');

    storage.fail = false;
    action(save, 'retry-save').click();
    expect(save.classList.contains('is-error')).toBe(false);
    expect(save.textContent).toContain('Đã tự lưu ngày 7');
    expect(document.activeElement).toBe(action(el, 'next-week'));
    // The Daily Report hears about it too.
    expect(shell.report.el.querySelector('[data-save]')?.textContent).toContain('Đã tự lưu ngày 7');
  });

  it('shows no save line when the last day\'s autosave worked', () => {
    const { root, shell } = boot();
    shell.startGame(atReport(WEEK_LENGTH));
    shell.handleEvents([{ type: 'dayEnded', day: WEEK_LENGTH }]);
    mainButton(shell).click();
    const save = weekEndEl(root).querySelector<HTMLElement>('[data-save]')!;
    expect(save.textContent).toBe('');
    expect(save.classList.contains('is-error')).toBe(false);
  });

  it('focuses "Sang tuần 2", the only primary button', () => {
    const { root } = openWeekEnd();
    const el = weekEndEl(root);
    const next = action(el, 'next-week');
    expect(document.activeElement).toBe(next);
    expect(next.textContent).toBe('Sang tuần 2');
    expect([...el.querySelectorAll('.btn-primary')]).toEqual([next]);
    expect(action(el, 'replay').classList.contains('btn-secondary')).toBe(true);
    expect(action(el, 'menu').classList.contains('btn-secondary')).toBe(true);
  });

  it('"Sang tuần 2" opens day 8 in preparation, week 2 day 1/7 on the HUD', () => {
    const { root, shell, state } = openWeekEnd();
    action(weekEndEl(root), 'next-week').click();

    expect(shell.state).toBe(state);
    expect(state.day).toBe(8);
    expect(state.phase).toBe('preparation');
    expect(state.week?.index).toBe(2);
    expect(state.week?.startedDay).toBe(8);
    expect(state.week?.result).toBeUndefined();
    expect(state.week?.archive).toHaveLength(1);
    expect(shell.screen).toBeNull();
    expect(shell.report.visible).toBe(false);
    expect(weekEndEl(root).hidden).toBe(true);
    expect(shell.hud.el.querySelector('[data-stat="week"]')?.textContent).toBe('Tuần 2 · 1/7');
    // Next step is the HUD's "Mở cửa".
    expect(shell.hud.el.querySelector('.hud-btn-cta:not([hidden])')).toBe(document.activeElement);
  });

  it('"Sang tuần 3" after week 2', () => {
    const { root, state } = openWeekEnd(atWeek2Report());
    const next = action(weekEndEl(root), 'next-week');
    expect(next.textContent).toBe('Sang tuần 3');
    next.click();
    expect(state.day).toBe(15);
    expect(state.week?.index).toBe(3);
    expect(state.week?.archive).toHaveLength(2);
  });

  it('"Chơi lại" starts day 1 of a new game with the same shop name and difficulty', () => {
    const finished: GameState[] = [];
    const { root, shell } = boot((g) => finished.push(g));
    const old = atReport(WEEK_LENGTH);
    shell.startGame(old);
    mainButton(shell).click();
    const replay = action(weekEndEl(root), 'replay');
    replay.click();
    // The first click only arms it, in place.
    expect(shell.state).toBe(old);
    expect(shell.screen).toBe('weekEnd');
    expect(replay.textContent).toBe('Bấm lần nữa để bỏ ván');
    expect(replay.hasAttribute('data-armed')).toBe(true);
    replay.click();

    const next = shell.state!;
    expect(next).not.toBe(old);
    expect(next.day).toBe(1);
    expect(next.phase).toBe('preparation');
    expect(next.shopName).toBe('Quán Cuối Tuần');
    expect(next.difficulty).toBe('hard');
    expect(next.week?.result).toBeUndefined();
    expect(shell.screen).toBeNull();
    expect(finished).toEqual([old]);
  });

  it('"Chơi lại" disarms by itself after a few seconds, keeping the game', () => {
    vi.useFakeTimers();
    try {
      const { root, shell, state } = openWeekEnd();
      const replay = action(weekEndEl(root), 'replay');
      replay.click();
      expect(replay.textContent).toBe('Bấm lần nữa để bỏ ván');
      vi.advanceTimersByTime(REPLAY_CONFIRM_MS);
      expect(replay.textContent).toBe('Chơi lại');
      expect(replay.hasAttribute('data-armed')).toBe(false);
      // A single click after the reset arms it again rather than replaying.
      replay.click();
      expect(shell.state).toBe(state);
      expect(shell.screen).toBe('weekEnd');
    } finally {
      vi.useRealTimers();
    }
  });

  it('"Về menu" goes back to the main menu', () => {
    const { root, shell } = openWeekEnd();
    action(weekEndEl(root), 'menu').click();
    expect(shell.screen).toBe('menu');
    expect(shell.state).toBeNull();
  });

  it('Esc goes back to the main menu', () => {
    const { shell } = openWeekEnd();
    expect(shell.screen).toBe('weekEnd');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(shell.screen).toBe('menu');
  });
});

describe('week summary CSS', () => {
  // Vitest stubs .css imports; read the file through a dynamically named node:fs import,
  // with a path from the repo root (under jsdom node:fs rejects jsdom's URL).
  const FS_MODULE = 'node:fs';

  async function css(): Promise<string> {
    const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as { readFileSync(path: string, encoding: 'utf8'): string };
    return readFileSync('src/ui/report/report.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  }

  /** Innermost `selector { body }` blocks in source order. */
  function rules(src: string): { selector: string; body: string }[] {
    return [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1]!.trim().replace(/\s+/g, ' '), body: m[2]! }));
  }

  /** font-size of the last rule whose selector list contains `selector`. */
  function fontSize(src: string, selector: string): string | undefined {
    const hit = rules(src).filter((r) => r.selector.split(',').map((s) => s.trim()).includes(selector) && /font-size:/.test(r.body)).at(-1);
    return hit?.body.match(/font-size:\s*([^;]+)/)?.[1]?.trim();
  }

  /** Rules of the ≤ 640 px block. */
  async function narrow(): Promise<string> {
    const src = await css();
    const start = src.indexOf('@media (max-width: 640px)');
    return src.slice(start, src.indexOf('@media (prefers-reduced-motion', start));
  }

  it('sizes the week score like the Daily Report profit', async () => {
    const src = await css();
    const profit = fontSize(src, '.rpt-fig.is-result .rpt-fig-value');
    expect(profit).toBe('var(--font-size-2xl)');
    expect(fontSize(src, '.wk-score .rpt-result-value')).toBe(profit);
  });

  it('puts the other figures on --font-size-value and the labels on --font-size-label', async () => {
    const src = await css();
    for (const sel of ['.wk-goal-num', '.wk-score .wk-reward', '.wk-compare td.is-num', '.wk-compare .wk-delta']) {
      expect(fontSize(src, sel), sel).toBe('var(--font-size-value)');
    }
    for (const sel of ['.wk-score .rpt-result-label', '.wk-compare thead th', '.wk-compare td']) {
      expect(fontSize(src, sel), sel).toBe('var(--font-size-label)');
    }
  });

  it('wraps the three footer buttons at 390 px instead of cutting "Sang tuần N"', async () => {
    const src = await narrow();
    const all = rules(src);
    const body = (sel: string) => all.find((r) => r.selector === sel)?.body ?? '';
    expect(body('.wk-foot-actions')).toMatch(/flex-wrap:\s*wrap/);
    const btn = body('.wk-foot-actions > .btn');
    expect(btn).toMatch(/min-width:\s*0/);
    expect(btn).toMatch(/white-space:\s*normal/);
    expect(body('.wk-foot-actions > .btn-primary')).toMatch(/flex-basis:\s*100%/);
    // Nothing in the footer has a fixed size (a full-width row is fine) or hides what spills.
    const foot = rules(await css()).filter((r) => /\.(rpt-foot|wk-foot-actions)\b/.test(r.selector));
    expect(foot.length).toBeGreaterThan(5);
    for (const r of foot) expect(r.body, r.selector).not.toMatch(/(^|[;\s])(height|max-height|width|max-width):(?!\s*(100%|auto))|overflow:\s*hidden/);
    // Every footer button keeps a 44 px target, the main one 56 px.
    const full = await css();
    expect(full).toMatch(/\.rpt-foot \.btn\s*\{[^}]*min-height:\s*var\(--size-control-md\)/);
    expect(full).toMatch(/\.rpt-foot \.btn-primary\s*\{[^}]*min-height:\s*var\(--size-control-lg\)/);
  });

  it('marks the footer row so only the week summary wraps it', () => {
    const { root } = openWeekEnd();
    const row = weekEndEl(root).querySelector<HTMLElement>('.rpt-foot-actions')!;
    expect(row.classList.contains('wk-foot-actions')).toBe(true);
    expect([...row.children].map((b) => (b as HTMLElement).dataset.action)).toEqual(['menu', 'replay', 'next-week']);
  });
});

describe('week_ended toast', () => {
  it('names the week, the score and the next week', () => {
    const state = atReport(WEEK_LENGTH);
    const result = state.week!.result!;
    const toast = toastForEvent({ type: 'week_ended', result }, state)!;
    expect(toast.title).toBe(`Hết tuần 1 · ${result.score}/100 điểm`);
    expect(toast.text).toContain(`${result.cups}/3 cúp`);
    expect(toast.text).toContain('sang tuần 2');
    expect(toast.icon).toBe('i-trophy');
  });
});
