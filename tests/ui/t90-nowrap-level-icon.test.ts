// @vitest-environment jsdom
// T-90 UX-308/309/311. jsdom has no layout: these pin the markup and the CSS
// rules; scripts/check-layout.mjs measures the real lines (LAYOUT_ONLY=styles,menu).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveGame } from '../../src/save/save';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { createMemoryStorage } from '../../src/save/storage';
import { MAX_SHOP_LEVEL } from '../../src/sim/data/levels';
import { WEEK_LENGTH } from '../../src/sim/data/week';
import { dispatch as simDispatch } from '../../src/sim';
import { grantWeekReward } from '../../src/sim/progression';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { GameState } from '../../src/sim/types';
import { scoreWeek, summarizeWeek } from '../../src/sim/week';
import { renderStylesPanel, SLOT_LABELS } from '../../src/ui/panels/styles';
import { createMainMenu } from '../../src/ui/screens/mainMenu';
import { createShell, type Shell } from '../../src/ui/screens/shell';

// Vitest stubs .css imports; read the files by path from the repo root (as t89-style-lock-bar.test.ts).
const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as { readFileSync(path: string, encoding: 'utf8'): string };
const css = (path: string) => readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const UI_CSS = css('src/ui/styles/ui.css');
const PANELS_CSS = css('src/ui/panels/panels.css');
const EMOJI = /\p{Extended_Pictographic}/u;

/** The declarations of the first rule whose selector list is exactly `selector`. */
function rule(sheet: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|})\\s*${esc}\\s*\\{([^}]*)\\}`).exec(sheet);
  if (!m) throw new Error(`no rule ${selector}`);
  return m[1]!;
}

let shell: Shell | null = null;
afterEach(() => {
  shell?.dispose();
  shell = null;
  document.body.replaceChildren();
});

describe('UX-308 Phong cách quán slot tabs on one line', () => {
  it('renders the four labels in .seg-opt spans that never wrap, the tick out of their line', () => {
    const state = createNewGame('Quán Thử', 'normal', 7);
    const body = document.createElement('div');
    document.body.append(body);
    renderStylesPanel(body, { dispatch: (cmd) => simDispatch(state, cmd), getState: () => state, close: () => {}, previewStyle: () => {}, resetCamera: () => {} });
    const labels = [...body.querySelectorAll('[data-seg="style-slot"] .seg-opt span')].map((s) => s.textContent);
    expect(labels).toEqual(Object.values(SLOT_LABELS));
    expect(labels.some((l) => EMOJI.test(l ?? ''))).toBe(false);

    const tab = rule(PANELS_CSS, '.styles-panel .seg-opt span');
    expect(tab).toMatch(/white-space:\s*nowrap/);
    expect(tab).toMatch(/font-size:\s*var\(--font-size-sm\)/);
    const tick = rule(PANELS_CSS, '.styles-panel .seg-opt input:checked + span::before');
    expect(tick).toMatch(/position:\s*absolute/);
  });
});

describe('UX-309 Main Menu "Tiếp tục" on one line', () => {
  it('puts every button label in a .btn-label span that does not wrap or shrink, the detail beside it', () => {
    const storage = createMemoryStorage();
    const game = createNewGame('Cà Phê Gió Mùa Sài Gòn 1', 'easy', 1);
    game.phase = 'peak';
    game.minute = 12 * 60 + 30;
    saveGame(game, 'auto', storage, 1000);
    const menu = createMainMenu(storage, { onContinue: vi.fn(), onNewGame: vi.fn(), onLoad: vi.fn(), onSettings: vi.fn() });
    document.body.append(menu.el);
    menu.onShow?.();

    const buttons = [...menu.el.querySelectorAll<HTMLButtonElement>('.menu-list button')];
    expect(buttons.map((b) => b.querySelector('.btn-label')?.textContent)).toEqual(['Tiếp tục', 'Ván mới', 'Tải game', 'Cài đặt']);
    const cont = buttons[0]!;
    // No bare text node left in the button: the label is its own non-shrinking flex item.
    expect([...cont.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim())).toBe(false);
    const detail = cont.querySelector('.btn-label + .btn-sm-text');
    expect(detail?.textContent).toContain('đang mở cửa');
    expect(cont.textContent).toMatch(/^Tiếp tục/);

    const label = rule(UI_CSS, '.btn-label');
    expect(label).toMatch(/white-space:\s*nowrap/);
    expect(label).toMatch(/flex:\s*none/);
    expect(rule(UI_CSS, '.btn-label + .btn-sm-text')).toMatch(/min-width:\s*0/);
  });
});

describe('UX-311 week-end level icon at max level', () => {
  /** Week 1 scored on its day-7 report with the shop at MAX_SHOP_LEVEL. */
  function maxedWeek(): GameState {
    const state = createNewGame('Quán Tuần', 'hard', 42);
    for (let d = 1; d <= WEEK_LENGTH; d++) {
      const stats = createDayStats(d, 4);
      stats.revenue = 3_000_000;
      stats.customersServed = 40;
      if (d < WEEK_LENGTH) state.history.push(stats);
      else state.today = stats;
    }
    state.day = WEEK_LENGTH;
    state.phase = 'report';
    const result = scoreWeek(state)!;
    state.week!.result = result;
    (state.week!.archive ??= []).push(summarizeWeek(state, result)!);
    result.reward = grantWeekReward(state, result);
    state.shopLevel = MAX_SHOP_LEVEL;
    return state;
  }

  it('keeps i-level a 16 px icon (ic-sm, never the growing last span)', () => {
    const root = document.createElement('div');
    document.body.append(root);
    shell = createShell({ root, storage: createMemoryStorage(), settings: { ...DEFAULT_SETTINGS }, seed: () => 99 });
    shell.startGame(maxedWeek());
    shell.report.el.querySelector<HTMLButtonElement>('.rpt-foot .btn-primary')!.click();
    const line = root.querySelector<HTMLElement>('[data-screen="weekEnd"] [data-next="level"]')!;
    expect(line.textContent).toBe('Quán đã ở cấp cao nhất.');
    const ic = line.querySelector<HTMLElement>('.ic[data-icon="i-level"]')!;
    expect(ic.classList.contains('ic-sm')).toBe(true);
    expect(rule(UI_CSS, '.ic-sm')).toMatch(/width:\s*var\(--size-icon-sm\);\s*height:\s*var\(--size-icon-sm\)/);
    expect(readFileSync('src/ui/styles/tokens.css', 'utf8')).toMatch(/--size-icon-sm:\s*16px/);
    // No rule that grows a .wk-next span may reach the icon (it did when the icon was the last span).
    const growing = [...UI_CSS.matchAll(/([^{}]*\.wk-next p[^{}]*)\{([^}]*)\}/g)].filter(([, , body]) => /flex:\s*1|flex-grow|width:\s*100%/.test(body!));
    expect(growing.length).toBeGreaterThan(0);
    for (const [, sel] of growing) for (const s of sel!.split(/,(?![^(]*\))/)) expect(ic.matches(s.trim())).toBe(false);
  });
});
