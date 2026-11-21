// @vitest-environment jsdom
// T-121 (E-32): with endless regulars the Khách quen list grows by 8 a season.
// Past seasons 1–2, finished books collapse under one toggle (the Thành tựu
// toggle's classes) so the open chains stay on top at 390 px. Same row, same
// "Mới" label, no new modal.
import { afterEach, describe, expect, it } from 'vitest';
import { dispatch as simDispatch } from '../../src/sim';
import { generatedId } from '../../src/sim/data/regularChain';
import { milestoneVisits, regularBook } from '../../src/sim/data/regularMilestones';
import { NEW_REGULARS, REGULARS, chainSuccessor, newRegularOrder } from '../../src/sim/data/regulars';
import { createNewGame } from '../../src/sim/state';
import type { GameState, RegularVisits } from '../../src/sim/types';
import type { PanelContext } from '../../src/ui/hud/panels';
import { REGULAR_LIST_FULL, regularListPages, renderTasksPanel, revealRegular, splitRegularPages } from '../../src/ui/panels/tasks';

afterEach(() => {
  revealRegular(null);
  document.body.replaceChildren();
});

const SEED = 1;
const DAY = 400;

/** Seasons 1, 2 and 3 finished; season 4 (gen_8..gen_15) in progress, gen_8 moved in today. 32 regulars. */
function longBook(): GameState {
  const state = createNewGame('Quán Thử', 'normal', SEED);
  state.day = DAY;
  const done = (id: string, lastDay: number, succeededBy: string): RegularVisits => ({ visits: milestoneVisits(id)[3]!, firstDay: 2, lastDay, keptMilestones: 0, succeededBy });
  const order = newRegularOrder(SEED);
  const regulars: Record<string, RegularVisits> = {};
  REGULARS.forEach((r, i) => (regulars[r.id] = done(r.id, 100 + i, order[i]!)));
  NEW_REGULARS.forEach((r, i) => (regulars[r.id] = done(r.id, 200 + i, chainSuccessor(r.id)!)));
  for (let k = 0; k < 8; k++) regulars[generatedId(k)] = done(generatedId(k), DAY - 10 + k, chainSuccessor(generatedId(k))!);
  for (let k = 8; k < 16; k++) regulars[generatedId(k)] = { visits: k === 8 ? 1 : 5, firstDay: k === 8 ? DAY : DAY - 20, lastDay: k === 8 ? DAY : DAY - 20 + k, keptMilestones: 0 };
  state.regulars = regulars;
  return state;
}

function render(state: GameState): HTMLElement {
  const body = document.createElement('div');
  document.body.append(body);
  const ctx: PanelContext = { dispatch: (cmd) => simDispatch(state, cmd), getState: () => state, close: () => {} };
  renderTasksPanel(body, ctx);
  return body;
}

const ids = (root: ParentNode | null): string[] => [...(root?.querySelectorAll<HTMLElement>(':scope > [data-book]') ?? [])].map((r) => r.dataset.book!);

describe('T-121 long Khách quen list', () => {
  it('keeps seasons 1–2 lists whole', () => {
    expect(REGULAR_LIST_FULL).toBe(REGULARS.length + NEW_REGULARS.length);
    const state = longBook();
    const pages = regularBook(state).slice(0, REGULAR_LIST_FULL);
    expect(splitRegularPages(pages)).toEqual({ shown: pages, older: [] });
  });

  it('a 32-regular book shows the 8 open chains, newest move-in first, and collapses 24 finished books', () => {
    const state = longBook();
    expect(regularBook(state)).toHaveLength(32);
    const body = render(state);
    const main = body.querySelector('ul[aria-label="Khách quen"]');
    const older = body.querySelector<HTMLElement>('ul[aria-label="Khách quen đã xong sổ"]')!;
    const shown = ids(main);
    expect(shown).toHaveLength(8);
    expect(shown[0]).toBe(generatedId(8));
    expect(new Set(shown)).toEqual(new Set(Array.from({ length: 8 }, (_, k) => generatedId(8 + k))));
    // Same row and same "Mới" label as before.
    expect(body.querySelectorAll('[data-new-regular]')).toHaveLength(1);
    expect(body.querySelector(`[data-book="${generatedId(8)}"] [data-new-regular]`)?.textContent).toBe('Mới');
    // Finished books: same rows, same order as the full list, collapsed.
    expect(older.hidden).toBe(true);
    const finished = regularListPages(state).filter((p) => p.reached === 4).map((p) => p.regular.id);
    expect(ids(older)).toEqual(finished);
    expect(finished).toHaveLength(24);
    expect(older.querySelectorAll('.regular-row')).toHaveLength(24);
    const btn = body.querySelector<HTMLButtonElement>('[data-action="regulars-older"]')!;
    expect(btn.hidden).toBe(false);
    expect(btn.classList.contains('ach-toggle')).toBe(true);
    expect(btn.textContent).toContain('24');
    expect(btn.getAttribute('aria-controls')).toBe(older.id);
    btn.click();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(older.hidden).toBe(false);
    // A finished row opens in place and stays in the expanded group.
    const id = finished[0]!;
    older.querySelector<HTMLButtonElement>(`[data-book="${id}"] [data-action="regular-page"]`)!.click();
    expect(ids(older)).toContain(id);
    expect(older.querySelector<HTMLElement>(`[data-book="${id}"] [data-book-page]`)!.hidden).toBe(false);
    expect(older.hidden).toBe(false);
    // No modal or dialog was added.
    expect(body.querySelector('dialog, [role="dialog"], .modal')).toBeNull();
  });

  it('a milestone toast for a finished regular keeps that row in the main list, open', () => {
    const state = longBook();
    const id = generatedId(7);
    revealRegular(id, 4);
    const body = render(state);
    const main = body.querySelector('ul[aria-label="Khách quen"]');
    expect(ids(main)).toContain(id);
    const row = main!.querySelector<HTMLElement>(`[data-book="${id}"]`)!;
    expect(row.querySelector<HTMLElement>('[data-book-page]')!.hidden).toBe(false);
    expect(row.querySelector('.book-cell[aria-expanded="true"]')?.getAttribute('data-milestone')).toBe('4');
  });
});
