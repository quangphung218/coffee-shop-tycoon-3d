// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { BANKRUPT_DAYS, debtLimit } from '../../src/sim/economy';
import { createNewGame } from '../../src/sim/state';
import type { DailyReport, GameState } from '../../src/sim/types';
import { formatMoney } from '../../src/ui/core/format';
import { debtHints } from '../../src/ui/hud/hud';
import { createDailyReport } from '../../src/ui/report';
import { reportDebt } from '../../src/ui/report/report';

// Vitest stubs .css imports to '': read report.css through a dynamically named
// node:fs import, from the project root (jsdom's URL is rejected by node:fs).
const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as {
  readFileSync(path: string, encoding: 'utf8'): string;
};
const reportCss = readFileSync('src/ui/report/report.css', 'utf8');

afterEach(() => document.body.replaceChildren());

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

/** The report phase of day 3 with `money` in the till and `debtDays` days closed past the limit. */
function atReport(money: number, debtDays: number, over: Partial<DailyReport> = {}): GameState {
  const state = createNewGame('Quán Nợ', 'normal', 42);
  state.day = 3;
  state.phase = 'report';
  state.money = money;
  state.debtDays = debtDays;
  state.lastReport = report({ money, ...over });
  return state;
}

function mount(state: GameState): HTMLElement {
  const view = createDailyReport({ dispatch: () => true });
  document.body.append(view.el);
  view.update(state, true);
  return view.el;
}

describe('daily report debt block', () => {
  it('opens Tổng kết with the money, the limit, the days left and up to 3 hints', () => {
    const state = atReport(-2_150_000, 1, { profit: 300_000, marketingCost: 100_000 });
    const el = mount(state);
    const summary = el.querySelector<HTMLElement>('#rpt-summary')!;
    const block = summary.firstElementChild as HTMLElement;
    expect(block.getAttribute('data-block')).toBe('debt');
    expect(block.querySelector('[data-debt="money"]')!.textContent).toBe('−2.150.000đ');
    expect(block.querySelector('[data-debt="limit"]')!.textContent).toBe(formatMoney(-debtLimit(state)));
    expect(block.textContent).toContain(`Còn ${BANKRUPT_DAYS - 1} ngày trước khi phá sản`);
    const hints = [...block.querySelectorAll('li')].map((li) => li.textContent);
    expect(hints).toEqual(debtHints(state));
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.length).toBeLessThanOrEqual(3);
  });

  it('does not paint a day profit green while the money is below zero', () => {
    const el = mount(atReport(-2_150_000, 1, { profit: 300_000 }));
    const fig = el.querySelector<HTMLElement>('[data-fig="profit"]')!;
    expect(fig.textContent).toContain('Lãi');
    expect(fig.classList.contains('is-none')).toBe(true);
    // Out of debt the same profit is green again, and there is no debt block.
    const ok = mount(atReport(2_600_000, 0));
    expect(ok.querySelector('[data-fig="profit"]')!.classList.contains('is-none')).toBe(false);
    expect(ok.querySelector('[data-block="debt"]')).toBeNull();
  });

  it('has no debt block below zero but within the limit', () => {
    const state = atReport(-1, 0);
    expect(reportDebt(state)).toBeNull();
    expect(mount(state).querySelector('[data-block="debt"]')).toBeNull();
  });
});

describe('debtHints', () => {
  it('names only cuts the shop can make, at most three', () => {
    const state = atReport(-2_150_000, 1, { marketingCost: 100_000 });
    state.policies = { price: 'low', wage: 'high' };
    const hints = debtHints(state);
    expect(hints).toHaveLength(3);
    if (state.staff.length) expect(hints[0]).toContain(`${state.staff.length} người`);
    for (const h of hints) expect(h).not.toMatch(/\p{Extended_Pictographic}/u);

    const bare = atReport(-2_150_000, 1);
    bare.staff = [];
    bare.inventory = [];
    expect(debtHints(bare)).toEqual([]);
  });
});

describe('report.css narrow footer', () => {
  it('stacks the footer buttons full width at 480px, the primary first', () => {
    const at = reportCss.indexOf('@media (max-width: 480px)');
    expect(at).toBeGreaterThan(0);
    const block = reportCss.slice(at);
    expect(block).toMatch(/\.rpt-foot-actions,\s*\.wk-foot-actions \{[^}]*flex-direction: column;/);
    expect(block).toMatch(/\.rpt-foot-actions > \.btn,[^{]*\{[^}]*width: 100%;/);
    expect(block).toMatch(/\.rpt-foot-actions > \.btn-primary \{\s*order: -1;/);
  });
});
