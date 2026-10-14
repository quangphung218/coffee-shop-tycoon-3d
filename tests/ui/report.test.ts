// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { saveKey } from '../../src/save/save';
import { createMemoryStorage } from '../../src/save/storage';
import { createNewGame } from '../../src/sim/state';
import type { Command, DailyReport, GameState, Review } from '../../src/sim/types';
import { createHud } from '../../src/ui/hud/hud';
import { listPanels, type PanelContext } from '../../src/ui/hud/panels';
import { createDailyReport, registerReviewsPanel, renderReviewsPanel, reportResult, type SaveStatus } from '../../src/ui/report';
import { createShell } from '../../src/ui/screens/shell';
import { playDay } from '../integration/helpers';

function report(over: Partial<DailyReport> = {}): DailyReport {
  return {
    day: 3,
    revenue: 1_200_000,
    ingredientCost: 300_000,
    wages: 200_000,
    marketingCost: 100_000,
    profit: 600_000,
    money: 2_600_000,
    customersArrived: 50,
    customersServed: 45,
    customersLost: 5,
    topSellers: [
      { id: 'latte', qty: 20 },
      { id: 'croissant', qty: 10 },
    ],
    outOfStock: ['mocha'],
    ratingStart: 3.84,
    ratingEnd: 3.96,
    reviews: [],
    suggestions: [{ kind: 'restock', text: 'Nhập thêm nguyên liệu cho: Mocha' }],
    ...over,
  };
}

function review(day: number, stars: number, reason: Review['reason'], author = 'An'): Review {
  return { day, stars, text: `Ý kiến ${author}`, author, reason };
}

/** A game sitting on the report screen with the given report. */
function atReport(r: DailyReport, reviews: Review[] = r.reviews): GameState {
  const state = createNewGame('Quán Thử', 'normal', 42);
  state.day = r.day;
  state.phase = 'report';
  state.lastReport = r;
  state.reviews = reviews;
  return state;
}

function mountReport(state: GameState, onRetrySave?: () => SaveStatus) {
  const sent: Command[] = [];
  const view = createDailyReport({ dispatch: (cmd) => (sent.push(cmd), true), onRetrySave });
  document.body.append(view.el);
  view.update(state, true);
  return { view, sent, el: view.el };
}

function q<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

function text(root: ParentNode, selector: string): string {
  return q(root, selector).textContent ?? '';
}

/** Icon ids drawn inside `root`, in order ("#i-star"…). */
function iconsIn(root: Element): string[] {
  return [...root.querySelectorAll('svg.ic use')].map((u) => u.getAttribute('href') ?? '');
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('Daily Report', () => {
  it('shows a profitable day in green with costs, customers, sellers, rating and tips', () => {
    const r = report({ reviews: [review(3, 5, 'tasty', 'A'), review(3, 4, 'fast_service', 'B'), review(3, 1, 'long_wait', 'C'), review(3, 3, 'dirty_table', 'D')] });
    const { el } = mountReport(atReport(r));

    expect(el.hidden).toBe(false);
    const result = q(el, '[data-result]');
    expect(result.dataset.result).toBe('profit');
    expect(result.className).not.toMatch(/is-loss|is-none/);
    // Not colour alone: triangle icon, word and sign.
    expect(iconsIn(result)).toEqual(['#i-trend-up']);
    expect(text(result, '.rpt-result-label')).toBe('Lãi');
    expect(text(result, '.rpt-result-value')).toBe('+600.000đ');

    const money = text(el, '[data-block="money"]');
    expect(money).toContain('+1.200.000đ');
    expect(money).toContain('−300.000đ');
    expect(money).toContain('−200.000đ');
    expect(money).toContain('−100.000đ');
    expect(q(el, '[data-block="money"] .is-total dd').className).toBe('pos');

    const customers = text(el, '[data-block="customers"]');
    expect(customers).toContain('50 khách');
    expect(customers).toContain('45 khách');
    expect(customers).toContain('5 khách');

    expect(q(el, '[data-block="top"] [data-item="latte"]').textContent).toContain('20 ly');
    expect(q(el, '[data-block="top"] [data-item="croissant"]').textContent).toContain('10 cái');
    expect(q(el, '[data-block="out"] [data-item="mocha"]')).toBeTruthy();

    const rating = text(el, '[data-block="rating"]');
    expect(rating).toContain('3,8');
    expect(rating).toContain('4,0');
    expect(text(el, '.rpt-delta')).toBe('+0,2');
    expect(iconsIn(q(el, '.rpt-delta'))).toEqual(['#i-trend-up']);
    expect(iconsIn(q(el, '[data-block="top"] [data-item="latte"]'))).toEqual(['#i-latte']);
    expect(iconsIn(q(el, '[data-block="tips"] [data-kind="restock"]'))).toEqual(['#i-inventory']);

    // The three newest reviews, newest first.
    const recent = [...el.querySelectorAll('[data-block="recent"] .rpt-review-name')].map((n) => n.textContent);
    expect(recent).toEqual(['D', 'C', 'B']);
    expect(text(el, '[data-block="tips"]')).toContain('Nhập thêm nguyên liệu');
    expect(text(el, '.rpt-sub')).toContain('Thường');
    expect(text(el, '#rpt-title')).toContain('Hết ngày 3 · Quán Thử');
  });

  it('shows a losing day in red with a falling rating', () => {
    const r = report({ revenue: 100_000, profit: -500_000, ratingStart: 3.8, ratingEnd: 3.6, suggestions: [] });
    const { el } = mountReport(atReport(r));

    const result = q(el, '[data-result]');
    expect(result.dataset.result).toBe('loss');
    expect(result.classList.contains('is-loss')).toBe(true);
    expect(iconsIn(result)).toEqual(['#i-trend-down']);
    expect(text(result, '.rpt-result-label')).toBe('Lỗ');
    expect(text(result, '.rpt-result-value')).toBe('−500.000đ');
    expect(q(el, '[data-block="money"] .is-total dd').className).toBe('neg');
    expect(text(el, '.rpt-delta')).toBe('−0,2');
    expect(iconsIn(q(el, '.rpt-delta'))).toEqual(['#i-trend-down']);
    expect(el.textContent).toContain('mọi thứ ổn');
  });

  it('handles a day without customers: neutral result, no charts, no reviews', () => {
    const r = report({
      revenue: 0,
      ingredientCost: 0,
      marketingCost: 0,
      profit: -200_000,
      customersArrived: 0,
      customersServed: 0,
      customersLost: 0,
      topSellers: [],
      outOfStock: [],
      ratingStart: 3,
      ratingEnd: 3,
    });
    const { el } = mountReport(atReport(r, []));

    const result = q(el, '[data-result]');
    expect(result.dataset.result).toBe('none');
    expect(result.classList.contains('is-none')).toBe(true);
    expect(result.textContent).toContain('Không có khách');
    expect(iconsIn(result)).toEqual(['#i-people']);
    expect(el.querySelector('[data-block="top"]')).toBeNull();
    expect(el.querySelector('[data-block="out"]')).toBeNull();
    expect(el.querySelector('[data-block="recent"]')).toBeNull();
    expect(el.textContent).toContain('Chưa bán được món nào');
    expect(el.textContent).toContain('Không món nào hết nguyên liệu');
    expect(text(el, '[data-block="rating"]')).toContain('Không đổi');
    expect(text(el, '[data-block="customers"]')).toContain('0 khách');
  });

  it('labels the result from profit and arrivals', () => {
    expect(reportResult(report({ profit: 1 })).kind).toBe('profit');
    expect(reportResult(report({ profit: -1 })).kind).toBe('loss');
    expect(reportResult(report({ profit: 0 })).kind).toBe('even');
    expect(reportResult(report({ profit: 50_000, customersArrived: 0 })).kind).toBe('none');
  });

  it('"Ngày tiếp theo" sends next_day and "Xem reviews" switches to the reviews tab', () => {
    const state = atReport(report(), [review(2, 5, 'nice_decor'), review(3, 2, 'out_of_stock')]);
    const { view, sent, el } = mountReport(state);

    expect(document.activeElement).toBe(q(el, '[data-action="next-day"]'));
    q<HTMLButtonElement>(el, '[data-action="next-day"]').click();
    expect(sent).toEqual([{ type: 'next_day' }]);

    const toggle = q<HTMLButtonElement>(el, '[data-action="reviews"]');
    expect(toggle.textContent).toBe('Xem đánh giá');
    toggle.click();
    expect(view.tab).toBe('reviews');
    expect(q(el, '#rpt-summary').hidden).toBe(true);
    expect(q(el, '#rpt-reviews').hidden).toBe(false);
    expect(text(el, '[data-tab="reviews"]')).toContain('(2)');
    expect(el.querySelectorAll('#rpt-reviews .rpt-review')).toHaveLength(2);
    toggle.click();
    expect(view.tab).toBe('summary');
  });

  it('shows the autosave result, and a retry when it failed', () => {
    const state = atReport(report());
    let retried = 0;
    const { view, el } = mountReport(state, () => {
      retried++;
      return { day: 3, ok: true, savedAt: Date.UTC(2026, 9, 13, 14) };
    });
    const save = q(el, '[data-save]');
    expect(save.textContent).toBe('');

    view.setSaveStatus({ day: 3, ok: false });
    expect(save.getAttribute('role')).toBe('alert');
    expect(save.textContent).toContain('Chưa tự lưu được');
    q<HTMLButtonElement>(save, '[data-action="retry-save"]').click();
    expect(retried).toBe(1);
    expect(save.getAttribute('role')).toBe('status');
    expect(save.textContent).toContain('Đã tự lưu ngày 3');

    // A status left over from another day is not shown.
    view.setSaveStatus({ day: 2, ok: true, savedAt: 0 });
    expect(save.textContent).toBe('');
  });

  it('stays hidden outside the report phase', () => {
    const { view, el } = mountReport(atReport(report()));
    view.update(createNewGame('Khác', 'easy', 1), false);
    expect(el.hidden).toBe(true);
    view.update(null, true);
    expect(el.hidden).toBe(true);
  });
});

describe('Reviews', () => {
  function mountPanel(state: GameState | null): HTMLElement {
    const body = document.createElement('div');
    document.body.append(body);
    const ctx: PanelContext = { dispatch: () => true, getState: () => state, close: () => {} };
    renderReviewsPanel(body, ctx);
    return body;
  }

  it('shows an empty state on day 1', () => {
    const body = mountPanel(createNewGame('Quán Mới', 'normal', 1));
    expect(q(body, '[data-empty="reviews"]').textContent).toContain('Chưa có đánh giá nào');
    expect(body.querySelectorAll('.rpt-review')).toHaveLength(0);
  });

  it('shows the empty state on the report tab too, with a way back', () => {
    const { view, el } = mountReport(atReport(report({ day: 1 }), []));
    view.showTab('reviews');
    expect(text(el, '[data-tab="reviews"]')).toContain('(0)');
    const empty = q(el, '#rpt-reviews [data-empty="reviews"]');
    [...empty.querySelectorAll('button')].find((b) => b.textContent?.includes('Về Tổng kết'))!.click();
    expect(view.tab).toBe('summary');
  });

  it('lists reviews newest first with stars and good/bad reasons, and updates live', () => {
    const state = createNewGame('Quán Thử', 'normal', 1);
    state.reviews = [review(1, 5, 'tasty', 'Hoa'), review(1, 1, 'long_wait', 'Tâm'), review(2, 4, 'tasty', 'Vy')];
    const body = document.createElement('div');
    document.body.append(body);
    const handle = renderReviewsPanel(body, { dispatch: () => true, getState: () => state, close: () => {} });

    const items = [...body.querySelectorAll<HTMLElement>('.rpt-review')];
    expect(items.map((i) => i.querySelector('.rpt-review-name')?.textContent)).toEqual(['Vy', 'Tâm', 'Hoa']);
    expect(items[1]!.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('1 trên 5 sao');
    expect(iconsIn(q(items[1]!, '.rpt-stars'))).toEqual(['#i-star', '#i-star-empty', '#i-star-empty', '#i-star-empty', '#i-star-empty']);
    expect(iconsIn(q(items[1]!, '[data-reason="long_wait"]'))).toEqual(['#i-thumb-down']);
    expect(items[1]!.querySelector('[data-reason="long_wait"]')?.className).toContain('is-bad');
    expect(items[0]!.querySelector('[data-reason="tasty"]')?.className).toContain('is-good');
    // Summary: "Đồ uống ngon" mentioned twice comes first.
    const chips = [...body.querySelectorAll('.rpt-chips')][0]!;
    expect(chips.firstElementChild?.textContent).toContain('Đồ uống ngon · 2');

    state.reviews.push(review(2, 2, 'dirty_table', 'Khoa'));
    handle.update?.(state);
    expect(body.querySelector('.rpt-review-name')?.textContent).toBe('Khoa');
  });

  it('opens from the HUD through registerPanel', () => {
    const off = registerReviewsPanel();
    try {
      expect(listPanels().map((p) => p.id)).toContain('reviews');
      const state = createNewGame('Quán Thử', 'normal', 1);
      const hud = createHud({ dispatch: () => true, getState: () => state, onPause() {}, onSettings() {}, onResetCamera() {} });
      document.body.append(hud.el, hud.panelEl);
      q<HTMLButtonElement>(hud.el, '[data-panel="reviews"]').click();
      expect(hud.openPanelId).toBe('reviews');
      expect(hud.panelEl.querySelector('[data-empty="reviews"]')).toBeTruthy();
      hud.dispose();
    } finally {
      off();
    }
  });
});

describe('no emoji', () => {
  // Emoji plus the old symbol glyphs (triangles, circle, stars, arrow, tick).
  const EMOJI = /\p{Extended_Pictographic}|[▲▼△▽●○★☆→✓✔]/u;
  const reviews = [review(3, 5, 'tasty', 'A'), review(3, 2, 'long_wait', 'B')];
  const noCustomers = { revenue: 0, ingredientCost: 0, marketingCost: 0, profit: -200_000, customersArrived: 0, customersServed: 0, customersLost: 0, topSellers: [], outOfStock: [] };

  /** Every text of the overlay, both tabs. */
  function allText(view: ReturnType<typeof mountReport>['view'], el: HTMLElement): string {
    view.showTab('reviews');
    const t = el.textContent ?? '';
    view.showTab('summary');
    return t + (el.textContent ?? '');
  }

  it.each([
    ['profit', report({ reviews })],
    ['loss', report({ profit: -500_000, ratingStart: 3.8, ratingEnd: 3.6, reviews })],
    ['no customers', report(noCustomers)],
  ] as const)('%s report has icons, no emoji', (_, r) => {
    const { view, el } = mountReport(atReport(r, [...r.reviews]));
    expect(allText(view, el)).not.toMatch(EMOJI);
    expect(el.querySelectorAll('svg.ic').length).toBeGreaterThan(0);
    expect(iconsIn(q(el, '[data-action="next-day"]'))).toEqual(['#i-next-day']);
    expect(iconsIn(q(el, '[data-tab="summary"]'))).toEqual(['#i-chart']);
    expect(iconsIn(q(el, '[data-tab="reviews"]'))).toEqual(['#i-reviews']);
  });

  it('"Đang tổng kết" shows a busy status and skeleton, no emoji', () => {
    const state = atReport(report());
    state.lastReport = null;
    const { view, el } = mountReport(state);
    const busy = q(el, '[data-block="busy"]');
    expect(busy.getAttribute('role')).toBe('status');
    expect(busy.textContent).toContain('Đang tổng kết ngày 3');
    expect(iconsIn(busy)).toEqual(['#i-busy']);
    expect(el.querySelector('[data-result]')).toBeNull();
    expect(allText(view, el)).not.toMatch(EMOJI);
  });

  it('autosave failure and success lines use icons, no emoji', () => {
    const { view, el } = mountReport(atReport(report()), () => ({ day: 3, ok: true, savedAt: Date.UTC(2026, 9, 13, 14) }));
    const save = q(el, '[data-save]');
    view.setSaveStatus({ day: 3, ok: false });
    expect(save.textContent).not.toMatch(EMOJI);
    expect(iconsIn(save)).toEqual(['#i-warning', '#i-retry']);
    q<HTMLButtonElement>(save, '[data-action="retry-save"]').click();
    expect(save.textContent).not.toMatch(EMOJI);
    expect(iconsIn(save)).toEqual(['#i-ok']);
  });

  it('reviews panel and its empty state have no emoji', () => {
    const body = document.createElement('div');
    document.body.append(body);
    const state = createNewGame('Quán Thử', 'normal', 1);
    const handle = renderReviewsPanel(body, { dispatch: () => true, getState: () => state, close: () => {} });
    expect(iconsIn(q(body, '[data-empty="reviews"]'))).toEqual(['#i-reviews']);
    expect(body.textContent).not.toMatch(EMOJI);
    state.reviews = [...reviews];
    handle.update?.(state);
    expect(body.textContent).not.toMatch(EMOJI);
    expect(body.querySelectorAll('.rpt-review-av')).toHaveLength(2);
  });
});

describe('report.css', () => {
  // Vitest stubs .css imports; read the file through a dynamically named node:fs import (see styles.test.ts).
  // A plain path from the repo root: under jsdom, `URL` is jsdom's and node:fs rejects it.
  const FS_MODULE = 'node:fs';

  async function css(): Promise<string> {
    const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as { readFileSync(path: string, encoding: 'utf8'): string };
    return readFileSync('src/ui/report/report.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  }

  it('draws tab focus inside the border, never as an outer outline', async () => {
    const src = await css();
    const focus = src.match(/\.rpt-tab:focus-visible\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(focus).toMatch(/border-color:\s*var\(--focus-ring\)/);
    expect(focus).toMatch(/outline-offset:\s*calc\(-1 \* \(var\(--bw\) \+ var\(--size-focus-width\)\)\)/);
    expect(src).not.toMatch(/\.rpt-tab:focus(?!-visible)/);
  });

  it('drops the card in, stamps the result, and tones both down for reduced motion', async () => {
    const src = await css();
    expect(src).toMatch(/\.rpt-dialog\s*\{[^}]*animation:\s*rpt-drop/);
    expect(src).toMatch(/\.rpt-result\s*\{[^}]*animation:\s*rpt-stamp/);
    const reduced = src.slice(src.indexOf('prefers-reduced-motion'));
    expect(reduced).toMatch(/\.rpt-dialog\s*\{[^}]*animation:\s*rpt-fade/);
    expect(reduced).toMatch(/\.rpt-result\s*\{[^}]*animation:\s*none/);
  });
});

describe('Shell wiring', () => {
  it('shows the report at day end with the autosave status and closes it on the next day', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const storage = createMemoryStorage();
    const shell = createShell({ root, storage });
    try {
      const state = createNewGame('Quán Ca', 'normal', 7);
      shell.startGame(state);
      expect(shell.report.visible).toBe(false);

      const events = playDay(state, { play: false });
      shell.update();
      shell.handleEvents(events);

      expect(shell.report.visible).toBe(true);
      expect(storage.getItem(saveKey('auto'))).toContain('Quán Ca');
      expect(text(root, '[data-save]')).toContain('Đã tự lưu ngày 1');

      // Pause covers the report; resuming brings it back.
      shell.openPause();
      shell.update();
      expect(shell.report.visible).toBe(false);

      shell.startGame(state);
      expect(shell.report.visible).toBe(true);
      expect(text(root, '[data-save]')).toBe('');

      q<HTMLButtonElement>(root, '[data-screen="report"] [data-action="next-day"]').click();
      expect(state.phase).toBe('preparation');
      expect(shell.report.visible).toBe(false);
      expect(document.activeElement?.getAttribute('data-action')).toBe('open');
    } finally {
      shell.dispose();
    }
  });
});
