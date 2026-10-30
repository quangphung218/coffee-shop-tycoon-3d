// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryStorage } from '../../src/save/storage';
import { rollWeekChallenge } from '../../src/sim/challenges';
import { CHALLENGE_FIRST_WEEK, WEEK_CHALLENGES } from '../../src/sim/data/challenges';
import { WEEK_LENGTH, weekGoal } from '../../src/sim/data/week';
import { dispatch as simDispatch } from '../../src/sim';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState, WeekChallenge } from '../../src/sim/types';
import { rollWeekPlan } from '../../src/sim/week';
import { toastForEvent } from '../../src/ui/hud/events';
import type { PanelContext } from '../../src/ui/hud/panels';
import { renderTasksPanel } from '../../src/ui/panels/tasks';
import { createShell } from '../../src/ui/screens/shell';

const EMOJI = /\p{Extended_Pictographic}/u;

/** A normal game on the morning of week `index`, day `weekDay`, with the week's drawn challenge. */
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

/** Week 5 with a served_week challenge, `progress` already counted. */
function servedWeek(progress: number, status: WeekChallenge['status'] = 'active'): GameState {
  const state = gameInWeek(CHALLENGE_FIRST_WEEK, 3);
  state.week!.challenge = { id: 'served_week', target: 400, reward: { tickets: 7 }, progress, settledDay: state.day - 1, status };
  return state;
}

function mountTasks(state: GameState) {
  const body = document.createElement('div');
  document.body.append(body);
  const ctx: PanelContext = { dispatch: (cmd) => simDispatch(state, cmd), getState: () => state, close: () => {} };
  const handle = renderTasksPanel(body, ctx);
  return { body, handle };
}

const block = (root: ParentNode) => root.querySelector<HTMLElement>('[data-block="challenge"]');
const part = (root: ParentNode, id: string) => root.querySelector(`[data-challenge="${id}"]`)?.textContent ?? '';

afterEach(() => document.body.replaceChildren());

describe('Mục tiêu tuần challenge block (E-16)', () => {
  it('is hidden in week 4', () => {
    const state = gameInWeek(CHALLENGE_FIRST_WEEK - 1);
    expect(state.week!.challenge).toBeUndefined();
    const { body } = mountTasks(state);
    expect(block(body)).toBeNull();
    expect(body.querySelector('[data-block="week-goal"]')).not.toBeNull();
  });

  it('shows name, bar and Tem reward from week 5, under the week goal', () => {
    const state = servedWeek(120);
    state.today.customersServed = 30;
    const { body } = mountTasks(state);
    const el = block(body)!;
    expect(el).not.toBeNull();
    expect(el.parentElement!.hidden).toBe(false);
    expect(el.dataset.state).toBe('active');
    expect(part(body, 'name')).toBe(`Thử thách: ${WEEK_CHALLENGES.served_week.name}`);
    expect(part(body, 'description')).toBe('Phục vụ 400 khách trong tuần.');
    expect(part(body, 'value')).toBe('150/400');
    expect(part(body, 'reward')).toBe('Thưởng +7 Tem');
    const bar = el.querySelector<HTMLElement>('[role="progressbar"]')!;
    expect(bar.getAttribute('aria-valuenow')).toBe('38');
    expect(bar.querySelector('span')!.getAttribute('style')).toBe('width:38%');
    // After the week goal block.
    const goal = body.querySelector('[data-block="week-goal"]')!;
    expect(goal.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(EMOJI.test(el.textContent ?? '')).toBe(false);
  });

  it('updates live and shows the done state', () => {
    const state = servedWeek(120);
    const { body, handle } = mountTasks(state);
    expect(part(body, 'value')).toBe('120/400');
    state.week!.challenge!.progress = 400;
    state.week!.challenge!.status = 'completed';
    handle.update!(state);
    const el = block(body)!;
    expect(el.dataset.state).toBe('done');
    expect(part(body, 'value')).toBe('400/400');
    expect(part(body, 'reward')).toBe('Đã xong');
    expect(el.querySelector('[data-challenge="bar"]')!.classList.contains('is-done')).toBe(true);
    expect(el.querySelector('.progress > span')!.getAttribute('style')).toBe('width:100%');
  });

  it('shows the failed state', () => {
    const { body } = mountTasks(servedWeek(50, 'failed'));
    const el = block(body)!;
    expect(el.dataset.state).toBe('failed');
    expect(part(body, 'reward')).toBe('Đã hụt');
    expect(el.querySelector('[data-challenge="bar"]')!.classList.contains('is-failed')).toBe(true);
  });

  it('hides again when the next week has no challenge (save from before E-16)', () => {
    const state = servedWeek(10);
    const { body, handle } = mountTasks(state);
    expect(block(body)).not.toBeNull();
    delete state.week!.challenge;
    handle.update!(state);
    expect(block(body)).toBeNull();
  });
});

describe('challenge completion toast (E-16)', () => {
  const completed = (state: GameState): GameEvent => ({ type: 'challenge_completed', challenge: { ...state.week!.challenge!, status: 'completed' } });

  it('names the challenge and its Tem, without emoji', () => {
    const state = servedWeek(400, 'completed');
    const t = toastForEvent(completed(state), state)!;
    expect(t.level).toBe('success');
    expect(t.title).toBe(`Xong thử thách: ${WEEK_CHALLENGES.served_week.name}`);
    expect(t.text).toBe('+7 Tem');
    expect(EMOJI.test(`${t.title}${t.text}`)).toBe(false);
  });

  it('shows on the game screen as a toast, not a modal, and the challenge Tem add no second toast', () => {
    const state = servedWeek(400, 'completed');
    const root = document.createElement('div');
    document.body.append(root);
    const shell = createShell({ root, storage: createMemoryStorage() });
    try {
      shell.startGame(state);
      const dialogs = root.querySelectorAll('[role="dialog"]:not([hidden])').length;
      shell.handleEvents([completed(state), { type: 'tickets_earned', amount: 7, total: 7, reason: 'challenge' }]);
      const titles = [...root.querySelectorAll('.toast-title')].map((p) => p.textContent ?? '');
      expect(titles).toEqual([`Xong thử thách: ${WEEK_CHALLENGES.served_week.name}`]);
      expect(root.querySelectorAll('[role="dialog"]:not([hidden])').length).toBe(dialogs);
    } finally {
      shell.dispose();
    }
  });
});
