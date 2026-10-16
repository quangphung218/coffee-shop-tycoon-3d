// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { createMemoryStorage } from '../../src/save/storage';
import { WEEK_LENGTH } from '../../src/sim/data/week';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { GameState } from '../../src/sim/types';
import { scoreWeek } from '../../src/sim/week';
import { createShell, type Shell } from '../../src/ui/screens/shell';

let shell: Shell | null = null;

afterEach(() => {
  shell?.dispose();
  shell = null;
  document.body.replaceChildren();
});

function boot(onReplay?: (finished: GameState) => void): { root: HTMLElement; shell: Shell } {
  const root = document.createElement('div');
  document.body.append(root);
  shell = createShell({ root, storage: createMemoryStorage(), settings: { ...DEFAULT_SETTINGS }, seed: () => 99, onReplay });
  return { root, shell };
}

/** A game in the report phase of week day `day`; day 7 is scored like the sim does at closing. */
function atReport(day: number): GameState {
  const state = createNewGame('Quán Cuối Tuần', 'hard', 42);
  for (let d = 1; d < day; d++) {
    const stats = createDayStats(d, 4);
    stats.revenue = 3_000_000;
    stats.customersServed = 40 + d;
    state.history.push(stats);
  }
  state.day = day;
  state.today = createDayStats(day, 4);
  state.today.revenue = 2_000_000;
  state.today.customersServed = 50;
  state.rating = 4.4;
  state.phase = 'report';
  if (day === WEEK_LENGTH) state.week!.result = scoreWeek(state)!;
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

/** Report of day 7 → "Xem kết tuần". */
function openWeekEnd(): { root: HTMLElement; shell: Shell; state: GameState } {
  const { root, shell } = boot();
  const state = atReport(WEEK_LENGTH);
  shell.startGame(state);
  mainButton(shell).click();
  return { root, shell, state };
}

describe('Daily Report main button', () => {
  it('reads "Xem kết tuần" once the week is scored, and opens the week-end screen', () => {
    const { root, shell } = boot();
    shell.startGame(atReport(WEEK_LENGTH));
    expect(shell.report.visible).toBe(true);
    const btn = mainButton(shell);
    expect(btn.textContent).toBe('Xem kết tuần');
    expect(btn.dataset.action).toBe('week-end');
    expect(btn.querySelector('[data-icon="i-trophy"]')).not.toBeNull();

    btn.click();
    expect(shell.screen).toBe('weekEnd');
    expect(shell.report.visible).toBe(false);
    expect(weekEndEl(root).hidden).toBe(false);
    // The week is over: the day did not move on.
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

describe('week-end screen', () => {
  it('shows revenue and stars against the goal, the score and the cups, one row per day', () => {
    const { root, state } = openWeekEnd();
    const r = state.week!.result!;
    const el = weekEndEl(root);
    expect(el.querySelector('h3')?.textContent).toBe('Kết thúc tuần');

    // 6 × 3.000.000 + 2.000.000 against the hard goal.
    expect(r.revenue).toBe(20_000_000);
    const revenue = block(el, 'revenue');
    expect(revenue.textContent).toContain('20.000.000đ');
    expect(revenue.textContent).toContain(`mục tiêu 23.000.000đ`);
    const bar = revenue.querySelector<HTMLElement>('[role="progressbar"]')!;
    expect(bar.getAttribute('aria-valuenow')).toBe(String(Math.round((r.revenue / r.revenueTarget) * 100)));
    expect(revenue.textContent).toContain('Chưa đạt');

    const stars = block(el, 'stars');
    expect(stars.textContent).toContain('4,4');
    expect(stars.textContent).toContain('mục tiêu 4,2 sao');
    expect(stars.textContent).toContain('Đạt mục tiêu');

    expect(block(el, 'score').textContent).toContain(`${r.score}/100`);
    const cups = block(el, 'cups');
    expect(cups.dataset.cups).toBe(String(r.cups));
    expect(cups.children).toHaveLength(3);
    expect(cups.querySelectorAll('.is-off')).toHaveLength(3 - r.cups);
    expect(cups.getAttribute('aria-label')).toBe(`${r.cups}/3 cúp`);

    const rows = block(el, 'days').querySelectorAll('tbody tr');
    expect(rows).toHaveLength(WEEK_LENGTH);
    expect(rows[0]!.textContent).toContain('Khai trương');
    expect(rows[0]!.textContent).toContain('3.000.000đ');
    expect(rows[WEEK_LENGTH - 1]!.textContent).toContain('2.000.000đ');
  });

  it('focuses "Chơi lại" when it opens', () => {
    const { root } = openWeekEnd();
    expect(document.activeElement).toBe(weekEndEl(root).querySelector('[data-action="replay"]'));
    expect(document.activeElement?.textContent).toBe('Chơi lại');
  });

  it('"Chơi lại" starts day 1 of a new week with the same shop name and difficulty', () => {
    const finished: GameState[] = [];
    const { root, shell } = boot((g) => finished.push(g));
    const old = atReport(WEEK_LENGTH);
    shell.startGame(old);
    mainButton(shell).click();
    weekEndEl(root).querySelector<HTMLButtonElement>('[data-action="replay"]')!.click();

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

  it('"Về menu" goes back to the main menu', () => {
    const { root, shell } = openWeekEnd();
    weekEndEl(root).querySelector<HTMLButtonElement>('[data-action="menu"]')!.click();
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
