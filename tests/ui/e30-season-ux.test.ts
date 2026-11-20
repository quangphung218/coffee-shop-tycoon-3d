// @vitest-environment jsdom
// E-30 (T-110): season UX outside the Phong cách panel. The week-end summary
// names a season in its "Tuần N+1" block when week N+1 starts it, warns when
// week N+1 is its last, and the Phong cách dock button carries the "Mới" mark
// while the season has an unbought style the player has the Tem for. Driven by
// real days and week changes through the shell (playDay, "Sang tuần N+1").
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { createMemoryStorage } from '../../src/save/storage';
import { SEASONAL_STYLES } from '../../src/sim/data/seasons';
import { dispatch as simDispatch } from '../../src/sim/index';
import { ensureRetention } from '../../src/sim/retention';
import { createNewGame } from '../../src/sim/state';
import type { GameState } from '../../src/sim/types';
import { registerPrepPanels } from '../../src/ui/panels';
import { STYLES_PANEL_ID } from '../../src/ui/panels/styles';
import { createShell, type Shell } from '../../src/ui/screens/shell';
import { playDay } from '../integration/helpers';

const EMOJI = /\p{Extended_Pictographic}/u;

let shell: Shell | null = null;
let offPanels: (() => void) | null = null;

afterEach(() => {
  shell?.dispose();
  shell = null;
  offPanels?.();
  offPanels = null;
  document.body.replaceChildren();
});

/** A new game whose first week counts as `week` (the season rule reads only the week number). */
function boot(week: number, tickets: number): { root: HTMLElement; shell: Shell; state: GameState } {
  const root = document.createElement('div');
  document.body.append(root);
  offPanels = registerPrepPanels();
  shell = createShell({ root, storage: createMemoryStorage(), settings: { ...DEFAULT_SETTINGS }, seed: () => 99 });
  const state = createNewGame('Quán Mùa', 'normal', 2610);
  state.week!.index = week;
  ensureRetention(state).tickets = tickets;
  shell.startGame(state);
  shell.update();
  return { root, shell, state };
}

/** Plays days until the week summary shows; returns its element. */
function playToWeekEnd(s: Shell, state: GameState): HTMLElement {
  for (let i = 0; i < 10; i++) {
    simDispatch(state, { type: 'apply_restock' });
    s.handleEvents(playDay(state));
    s.update();
    s.report.el.querySelector<HTMLButtonElement>('.rpt-foot .btn-primary')!.click();
    if (s.screen === 'weekEnd') return document.querySelector<HTMLElement>('[data-screen="weekEnd"]')!;
    s.handleEvents(state.events.splice(0));
    s.update();
  }
  throw new Error('no week end');
}

function nextWeek(s: Shell, state: GameState, weekEl: HTMLElement): void {
  weekEl.querySelector<HTMLButtonElement>('[data-action="next-week"]')!.click();
  s.handleEvents(state.events.splice(0));
  s.update();
}

function newMark(root: HTMLElement): boolean {
  return !root.querySelector<HTMLElement>(`[data-panel="${STYLES_PANEL_ID}"] .dock-new`)!.hidden;
}

describe('E-30: season UX (T-110)', { timeout: 300_000 }, () => {
  it('week 23 summary announces Mùa xuân; the Phong cách mark shows in week 24 with enough Tem', () => {
    const { root, shell, state } = boot(23, 500);
    expect(newMark(root)).toBe(false);
    const week = playToWeekEnd(shell, state);
    expect(week.querySelector('[data-next="season-start"]')?.textContent).toBe('Mùa xuân: 4 kiểu mới bằng Tem, bán tới hết tuần 31.');
    expect(week.querySelector('[data-next="season-last"]')).toBeNull();
    expect(week.textContent).not.toMatch(EMOJI);
    nextWeek(shell, state, week);
    expect(state.week!.index).toBe(24);
    expect(newMark(root)).toBe(true);
    expect(root.querySelector(`[data-panel="${STYLES_PANEL_ID}"] [data-fresh-sr]`)?.textContent).toBe(', có mục mới');

    // Bought out: the mark goes.
    for (const s of SEASONAL_STYLES.filter((x) => x.season === 0)) {
      state.money += s.price;
      expect(shell.dispatch({ type: 'buy_style', styleId: s.id })).toBe(true);
    }
    shell.update();
    expect(newMark(root)).toBe(false);
  });

  it('counts only unbought styles and shows no mark without enough Tem', () => {
    const { root, shell, state } = boot(23, 0);
    (state.styles ??= { chosen: {}, owned: [], unlocked: [] }).owned.push('wall_peach');
    const week = playToWeekEnd(shell, state);
    expect(week.querySelector('[data-next="season-start"]')?.textContent).toBe('Mùa xuân: 3 kiểu mới bằng Tem, bán tới hết tuần 31.');
    nextWeek(shell, state, week);
    expect(state.week!.index).toBe(24);
    // Cheapest unbought spring style costs 80 Tem; a day's play earns far less than that.
    expect(state.retention!.tickets).toBeLessThan(80);
    expect(newMark(root)).toBe(false);
    ensureRetention(state).tickets = 80;
    shell.update();
    expect(newMark(root)).toBe(true);
  });

  it('week 30 summary warns that the season ends after week 31; no season line in mid-season', () => {
    const { shell, state } = boot(30, 0);
    const week = playToWeekEnd(shell, state);
    expect(week.querySelector('[data-next="season-last"]')?.textContent).toBe('Mùa xuân hết sau tuần này.');
    expect(week.querySelector('[data-next="season-start"]')).toBeNull();
    expect(week.textContent).not.toMatch(EMOJI);
    nextWeek(shell, state, week);
    expect(state.week!.index).toBe(31);
    // Week 31 summary: next week starts Mùa hè.
    const week31 = playToWeekEnd(shell, state);
    expect(week31.querySelector('[data-next="season-start"]')?.textContent).toBe('Mùa hè: 3 kiểu mới bằng Tem, bán tới hết tuần 39.');
    expect(week31.querySelector('[data-next="season-last"]')).toBeNull();
    expect(document.querySelector('dialog:not([data-screen]), [role="alertdialog"]')).toBeNull();
  });
});
