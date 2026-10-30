// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { createMemoryStorage } from '../../src/save/storage';
import { rollWeekChallenge } from '../../src/sim/challenges';
import { CHALLENGE_FIRST_WEEK, WEEK_CHALLENGES } from '../../src/sim/data/challenges';
import { WEEK_LENGTH, weekGoal } from '../../src/sim/data/week';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { DailyReport, GameEvent, GameState } from '../../src/sim/types';
import { rollWeekPlan, scoreWeek } from '../../src/sim/week';
import { mergedMilestoneTitle, resetRegularToasts, toastForEvent, weekChallengeToast } from '../../src/ui/hud/events';
import { LOCKED_STYLE_BADGE } from '../../src/ui/panels/styles';
import { renderSummary, reportMilestones } from '../../src/ui/report/report';
import { SPEED_HINT, SPEED_HINT_ACTION } from '../../src/ui/screens/game';
import { createShell, type Shell } from '../../src/ui/screens/shell';
import { challengeBlock, challengeView } from '../../src/ui/weekGoal';

// Vitest stubs .css imports, so read the stylesheet through node:fs (see css-order.test.ts).
const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as { readFileSync(path: string, encoding: 'utf8'): string };

const EMOJI = /\p{Extended_Pictographic}/u;

let shell: Shell | null = null;
afterEach(() => {
  shell?.dispose();
  shell = null;
  resetRegularToasts();
  document.body.replaceChildren();
});

function boot(): { root: HTMLElement; shell: Shell } {
  const root = document.createElement('div');
  document.body.append(root);
  shell = createShell({ root, storage: createMemoryStorage(), settings: { ...DEFAULT_SETTINGS } });
  return { root, shell };
}

/** A normal game on week `index`, day `weekDay`, with the week's drawn challenge. */
function gameInWeek(index: number, weekDay = 1): GameState {
  const state = createNewGame('Quán Thử Thách', 'normal', 4242);
  const startedDay = (index - 1) * WEEK_LENGTH + 1;
  state.day = startedDay + weekDay - 1;
  state.today = createDayStats(state.day, state.rating);
  state.week = { length: WEEK_LENGTH, index, startedDay, plan: rollWeekPlan(state.seed, index), goal: weekGoal('normal', index) };
  const challenge = rollWeekChallenge(state.seed, index);
  if (challenge) state.week.challenge = challenge;
  return state;
}

/** Week 5 with a served_week challenge at `progress`. */
function servedWeek(progress: number, status: 'active' | 'completed' | 'failed' = 'active', weekDay = 3): GameState {
  const state = gameInWeek(CHALLENGE_FIRST_WEEK, weekDay);
  state.week!.challenge = { id: 'served_week', target: 400, reward: { tickets: 7 }, progress, settledDay: state.day, status };
  if (status === 'completed') state.week!.challenge.reward.unlock = { kind: 'decor', id: 'sign_neon' };
  return state;
}

const titles = (root: ParentNode) => [...root.querySelectorAll('.toast-title')].map((p) => p.textContent ?? '');
const milestone = (regularId: string, n = 1): GameEvent => ({ type: 'regular_milestone', regularId, milestone: n, visits: [10, 40, 100][n - 1]!, tickets: n });

describe('UX-202 challenge bar at ≤ 480 px', () => {
  const css = readFileSync('src/ui/panels/panels.css', 'utf8');

  it('keeps the challenge value in the first column, so the bar gets the 1fr one', () => {
    const narrow = css.slice(css.indexOf('@media (max-width: 480px) {\n  .week-goal {'));
    const block = narrow.slice(0, narrow.indexOf('\n}\n'));
    expect(block).toContain('grid-template-columns: auto minmax(0, 1fr);');
    expect(block).toMatch(/\.week-challenge \.week-goal-num\[data-challenge='value'\] \{\s*grid-column: auto;/);
  });

  it('builds value | bar | reward in that order inside the row', () => {
    const el = challengeBlock(challengeView(servedWeek(120))!);
    const row = el.querySelector('[data-challenge="bar"]')!;
    expect([...row.children].map((c) => c.getAttribute('data-challenge') ?? c.getAttribute('role'))).toEqual(['value', 'progressbar', 'reward']);
  });
});

describe('UX-205/206 challenge surfacing', () => {
  it('the challenge block names the style it opens, and the one it opened once done', () => {
    const active = challengeBlock(challengeView(servedWeek(120))!);
    expect(active.querySelector('[data-challenge="style"]')!.textContent).toBe('Mở kiểu Biển neon');
    const done = servedWeek(400, 'completed');
    // The reward opened Biển neon, so the next one is Ốp gỗ ấm; the block names the opened one.
    done.styles = { ...(done.styles ?? {}), unlocked: ['sign_neon'] } as GameState['styles'];
    const doneEl = challengeBlock(challengeView(done)!);
    expect(doneEl.querySelector('[data-challenge="style"]')!.textContent).toBe('Đã mở kiểu Biển neon');
    const failed = challengeBlock(challengeView(servedWeek(50, 'failed'))!);
    expect(failed.querySelector('[data-challenge="style"]')).toBeNull();
  });

  it('the completion toast names the unlocked style', () => {
    const state = servedWeek(400, 'completed');
    const t = toastForEvent({ type: 'challenge_completed', challenge: state.week!.challenge! }, state)!;
    expect(t.title).toBe(`Xong thử thách: ${WEEK_CHALLENGES.served_week.name}`);
    expect(t.text).toBe('+7 Tem · Mở kiểu Biển neon');
    expect(EMOJI.test(`${t.title}${t.text}`)).toBe(false);
  });

  it('toasts a new week with a challenge, and not a week without one', () => {
    const t = weekChallengeToast(servedWeek(0, 'active', 1))!;
    expect(t.title).toBe(`Tuần ${CHALLENGE_FIRST_WEEK} có thử thách: ${WEEK_CHALLENGES.served_week.name}`);
    expect(t.text).toBe('Phục vụ 400 khách trong tuần. Thưởng +7 Tem, mở kiểu Biển neon.');
    expect(weekChallengeToast(gameInWeek(CHALLENGE_FIRST_WEEK - 1, 1))).toBeNull();
    expect(weekChallengeToast(servedWeek(0, 'active', 2))).toBeNull();
  });

  it('the lock badge says challenges open it from week 5', () => {
    expect(LOCKED_STYLE_BADGE).toBe('Mở bằng thử thách (từ tuần 5)');
  });

  it('the daily report shows the challenge on one line under the week strip', () => {
    const state = servedWeek(150);
    const root = document.createElement('div');
    root.append(...renderSummary(report(), false, { deltas: null, week: null, challenge: challengeView(state) }));
    const line = root.querySelector('[data-block="challenge"]')!;
    expect(line.textContent).toBe(`Thử thách: ${WEEK_CHALLENGES.served_week.name} · 150/400 · Thưởng +7 Tem · Mở kiểu Biển neon`);
    root.replaceChildren(...renderSummary(report(), false, { deltas: null, week: null, challenge: null }));
    expect(root.querySelector('[data-block="challenge"]')).toBeNull();
  });

  it('the week-end summary shows the challenge, then "Sang tuần" toasts the next week\'s challenge', () => {
    const { root, shell: s } = boot();
    const game = servedWeek(250, 'active', WEEK_LENGTH);
    game.phase = 'report';
    game.week!.result = scoreWeek(game)!;
    s.startGame(game);
    s.handleEvents([{ type: 'week_ended', result: game.week!.result }]);
    s.report.el.querySelector<HTMLButtonElement>('.rpt-foot .btn-primary')!.click();
    const screen = root.querySelector('[data-screen="weekEnd"]')!;
    const block = screen.querySelector<HTMLElement>('[data-block="challenge"]')!;
    expect(block).not.toBeNull();
    // Unfinished when the week closed: missed, and no style promised.
    expect(block.dataset.state).toBe('failed');
    expect(block.querySelector('[data-challenge="reward"]')!.textContent).toBe('Đã hụt');
    expect(screen.querySelector('[data-next="challenge"]')!.textContent).toBe(`Tuần ${CHALLENGE_FIRST_WEEK + 1} có thử thách: xong để nhận Tem và mở kiểu Biển neon.`);
    expect(EMOJI.test(screen.textContent ?? '')).toBe(false);

    s.toasts.clear();
    screen.querySelector<HTMLButtonElement>('[data-action="next-week"]')!.click();
    expect(s.state!.week!.index).toBe(CHALLENGE_FIRST_WEEK + 1);
    const name = WEEK_CHALLENGES[s.state!.week!.challenge!.id].name;
    expect(titles(root)).toContain(`Tuần ${CHALLENGE_FIRST_WEEK + 1} có thử thách: ${name}`);
  });

  it('a week-end before week 4 says nothing about challenges', () => {
    const { root, shell: s } = boot();
    const game = gameInWeek(2, WEEK_LENGTH);
    game.phase = 'report';
    game.week!.result = scoreWeek(game)!;
    s.startGame(game);
    s.report.el.querySelector<HTMLButtonElement>('.rpt-foot .btn-primary')!.click();
    const screen = root.querySelector('[data-screen="weekEnd"]')!;
    expect(screen.querySelector('[data-block="challenge"]')).toBeNull();
    expect(screen.querySelector('[data-next="challenge"]')).toBeNull();
  });
});

describe('UX-208 regular milestone toasts', () => {
  it('drops the "ghé quán" toast when the same turn has a milestone', () => {
    const { root, shell: s } = boot();
    s.startGame(gameInWeek(2, 4));
    s.handleEvents([{ type: 'regular_arrived', customerId: 1, regularId: 'co_lan', visits: 10 }, milestone('co_lan')]);
    expect(titles(root)).toEqual(['Cô Lan: mốc 1 trong Sổ khách quen']);
  });

  it('still toasts an arrival without a milestone', () => {
    const { root, shell: s } = boot();
    s.startGame(gameInWeek(2, 4));
    s.handleEvents([{ type: 'regular_arrived', customerId: 1, regularId: 'co_lan', visits: 3 }]);
    expect(titles(root)).toEqual(['Cô Lan ghé quán (lần 3)']);
  });

  it('merges the day\'s 2nd milestone on into one "N khách quen lên mốc · +N Tem" toast', () => {
    const { root, shell: s } = boot();
    s.startGame(gameInWeek(2, 4));
    const dialogs = () => [...root.querySelectorAll<HTMLElement>('[role="dialog"]')].filter((d) => !d.closest('[hidden]')).length;
    const before = dialogs();
    s.handleEvents([milestone('co_lan')]);
    expect(titles(root)).toEqual(['Cô Lan: mốc 1 trong Sổ khách quen']);
    s.handleEvents([{ type: 'regular_arrived', customerId: 2, regularId: 'anh_minh', visits: 10 }, milestone('anh_minh')]);
    expect(titles(root)).toEqual([mergedMilestoneTitle(2, 2)]);
    expect(titles(root)).toEqual(['2 khách quen lên mốc · +2 Tem']);
    s.handleEvents([milestone('chu_tuan', 2)]);
    s.handleEvents([milestone('chi_hoa')]);
    expect(titles(root)).toEqual(['4 khách quen lên mốc · +5 Tem']);
    expect(root.querySelectorAll('.toast')).toHaveLength(1);
    expect(root.querySelector('.toast-text')!.textContent).toBe('Xem trong Sổ khách quen.');
    expect(dialogs()).toBe(before);
    expect(EMOJI.test(root.querySelector('.toast')!.textContent ?? '')).toBe(false);
  });

  it('starts over the next day: the first milestone names the regular again', () => {
    const { root, shell: s } = boot();
    s.startGame(gameInWeek(2, 4));
    s.handleEvents([milestone('co_lan'), milestone('anh_minh')]);
    expect(titles(root)).toEqual(['2 khách quen lên mốc · +2 Tem']);
    s.toasts.clear();
    s.state!.day += 1;
    s.handleEvents([milestone('em_vy')]);
    expect(titles(root)).toEqual(['Em Vy: mốc 1 trong Sổ khách quen']);
  });

  it('a merged toast that already closed comes back with the running count', () => {
    const { root, shell: s } = boot();
    s.startGame(gameInWeek(2, 4));
    s.handleEvents([milestone('co_lan')]);
    s.toasts.clear();
    s.handleEvents([milestone('anh_minh')]);
    expect(titles(root)).toEqual(['2 khách quen lên mốc · +2 Tem']);
  });

  it('lists the day\'s milestones in the daily report', () => {
    const state = gameInWeek(2, 4);
    state.regulars = {
      co_lan: { visits: 10, firstDay: 2, lastDay: state.day },
      anh_minh: { visits: 40, firstDay: 2, lastDay: state.day },
      // Came today but no milestone; reached one on an earlier day.
      chu_tuan: { visits: 11, firstDay: 2, lastDay: state.day },
      chi_hoa: { visits: 10, firstDay: 2, lastDay: state.day - 1 },
    };
    const list = reportMilestones(state, state.day);
    expect(list).toEqual([
      { name: 'Cô Lan', milestone: 1, tickets: 1 },
      { name: 'Anh Minh', milestone: 2, tickets: 2 },
    ]);
    const root = document.createElement('div');
    root.append(...renderSummary(report(), false, { deltas: null, week: null, milestones: list }));
    const line = root.querySelector('[data-block="milestones"]')!;
    expect(line.textContent).toBe('Sổ khách quen: Cô Lan mốc 1 +1 TemAnh Minh mốc 2 +2 Tem');
    expect(line.querySelectorAll('li')).toHaveLength(2);
    root.replaceChildren(...renderSummary(report(), false, { deltas: null, week: null, milestones: [] }));
    expect(root.querySelector('[data-block="milestones"]')).toBeNull();
  });
});

describe('UX-209 2x hint button', () => {
  it('has "Chuyển 2x", which switches to 2x and closes the hint', () => {
    const { root, shell: s } = boot();
    const game = createNewGame('Quán Nhanh', 'normal', 7);
    game.day = 2;
    s.startGame(game);
    s.handleEvents([{ type: 'phase', phase: 'opening' }]);
    const toast = [...root.querySelectorAll<HTMLElement>('.toast')].find((t) => t.textContent?.includes(SPEED_HINT))!;
    const btn = toast.querySelector<HTMLButtonElement>('[data-action="toast-action"]')!;
    expect(btn.textContent).toBe(SPEED_HINT_ACTION);
    expect(SPEED_HINT_ACTION).toBe('Chuyển 2x');
    expect(s.state!.speed).toBe(1);
    btn.click();
    expect(s.state!.speed).toBe(2);
    expect(s.settings.gameSpeed).toBe(2);
    expect(toast.isConnected).toBe(false);
  });
});

function report(over: Partial<DailyReport> = {}): DailyReport {
  return {
    day: 3,
    revenue: 1_200_000,
    ingredientCost: 300_000,
    wages: 200_000,
    marketingCost: 0,
    profit: 700_000,
    money: 2_600_000,
    customersArrived: 50,
    customersServed: 45,
    customersLost: 5,
    topSellers: [],
    outOfStock: [],
    ratingStart: 3.8,
    ratingEnd: 3.9,
    reviews: [],
    suggestions: [],
    ...over,
  };
}
