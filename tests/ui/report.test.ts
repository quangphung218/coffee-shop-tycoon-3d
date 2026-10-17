// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { saveKey } from '../../src/save/save';
import { createMemoryStorage } from '../../src/save/storage';
import { WEEK_LENGTH } from '../../src/sim/data/week';
import { buildDailyReport } from '../../src/sim/report';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { Command, DailyReport, DayStats, GameState, Review } from '../../src/sim/types';
import { scoreWeek } from '../../src/sim/week';
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

/** Icon ids drawn inside `root`, in order ("i-star"…). */
function iconsIn(root: Element): string[] {
  return [...root.querySelectorAll<HTMLElement>('.ic[aria-hidden="true"]')].map((u) => u.dataset.icon ?? '');
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('Daily Report', () => {
  it('shows a profitable day in green with figures, costs, sellers and tips on one flat page', () => {
    const r = report({ reviews: [review(3, 5, 'tasty', 'A'), review(3, 4, 'fast_service', 'B'), review(3, 1, 'long_wait', 'C'), review(3, 3, 'dirty_table', 'D')] });
    const { el } = mountReport(atReport(r));

    expect(el.hidden).toBe(false);
    const figs = [...el.querySelectorAll<HTMLElement>('[data-block="figures"] [data-fig]')].map((f) => f.dataset.fig);
    expect(figs).toEqual(['profit', 'revenue', 'customersServed', 'stars']);

    const result = q(el, '[data-result]');
    expect(result.dataset.fig).toBe('profit');
    expect(result.dataset.result).toBe('profit');
    expect(result.className).not.toMatch(/is-loss|is-none/);
    // Not colour alone: triangle icon, word and sign.
    expect(iconsIn(q(result, '.rpt-fig-label'))).toEqual(['i-trend-up']);
    expect(text(result, '.rpt-fig-label')).toBe('Lãi');
    expect(text(result, '.rpt-fig-value')).toBe('+600.000đ');
    expect(text(el, '[data-fig="revenue"] .rpt-fig-value')).toBe('1.200.000đ');

    const money = text(el, '[data-block="money"]');
    expect(money).toContain('+1.200.000đ');
    expect(money).toContain('−300.000đ');
    expect(money).toContain('−200.000đ');
    expect(money).toContain('−100.000đ');
    expect(q(el, '[data-block="money"] .is-total dd').className).toBe('pos');
    expect(el.textContent).toContain('Tiền hiện có: 2.600.000đ');

    expect(text(el, '[data-block="customers"] .rpt-fig-value')).toBe('45/50');
    expect(text(el, '[data-block="customers"] .rpt-fig-sub')).toBe('phục vụ/đến · 5 bỏ đi');
    expect(text(el, '[data-block="rating"] .rpt-fig-value')).toBe('4,0');
    expect(text(el, '[data-block="rating"] .rpt-fig-sub')).toBe('đầu ngày 3,8');

    expect(q(el, '[data-block="top"] [data-item="latte"]').textContent).toContain('20 ly');
    expect(q(el, '[data-block="top"] [data-item="croissant"]').textContent).toContain('10 cái');
    expect(q(el, '[data-block="out"] [data-item="mocha"]')).toBeTruthy();
    expect(iconsIn(q(el, '[data-block="top"] [data-item="latte"]'))).toEqual(['i-latte']);
    expect(iconsIn(q(el, '[data-block="tips"] [data-kind="restock"]'))).toEqual(['i-inventory']);
    expect(text(el, '[data-block="tips"]')).toContain('Nhập thêm nguyên liệu');

    // Reviews moved to their own tab; no cards nested in the old two-column grid.
    const summary = q(el, '#rpt-summary');
    expect(summary.querySelector('[data-block="recent"]')).toBeNull();
    expect(summary.querySelector('.rpt-grid')).toBeNull();
    expect(summary.querySelector('.rpt-section')).toBeNull();
    expect(q(summary, '.rpt-split [data-block="money"]')).toBeTruthy();
    expect(q(summary, '.rpt-split [data-block="top"]')).toBeTruthy();

    expect(text(el, '.rpt-sub')).toContain('Thường');
    // The fixed opening hours are not repeated under every day's title.
    expect(text(el, '.rpt-sub')).not.toContain('07:00');
    expect(text(el, '#rpt-title')).toContain('Hết ngày 3 · Quán Thử');
  });

  it('shows a losing day in red', () => {
    const r = report({ revenue: 100_000, profit: -500_000, ratingStart: 3.8, ratingEnd: 3.6, suggestions: [] });
    const { el } = mountReport(atReport(r));

    const result = q(el, '[data-result]');
    expect(result.dataset.result).toBe('loss');
    expect(result.classList.contains('is-loss')).toBe(true);
    expect(iconsIn(q(result, '.rpt-fig-label'))).toEqual(['i-trend-down']);
    expect(text(result, '.rpt-fig-label')).toBe('Lỗ');
    expect(text(result, '.rpt-fig-value')).toBe('−500.000đ');
    expect(q(el, '[data-block="money"] .is-total dd').className).toBe('neg');
    expect(text(el, '[data-block="rating"] .rpt-fig-value')).toBe('3,6');
    expect(el.textContent).toContain('mọi thứ ổn');
  });

  it('keeps the summary to one tip on one line, its full text in the title', () => {
    const r = report({
      suggestions: [
        { kind: 'restock', text: 'Nhập thêm nguyên liệu' },
        { kind: 'hire_server', text: 'Tuyển thêm phục vụ' },
        { kind: 'marketing', text: 'Chạy quảng cáo' },
      ],
    });
    const { el } = mountReport(atReport(r));
    const tips = [...el.querySelectorAll<HTMLElement>('[data-block="tips"] [data-kind]')];
    expect(tips.map((t) => t.dataset.kind)).toEqual(['restock']);
    expect(tips[0]!.title).toBe('Nhập thêm nguyên liệu');
    expect(tips[0]!.querySelectorAll('p')).toHaveLength(1);
  });

  it('names at most 3 best sellers and the stock-outs on one goods line', () => {
    const r = report({
      topSellers: [
        { id: 'latte', qty: 20 },
        { id: 'croissant', qty: 10 },
        { id: 'mocha', qty: 8 },
        { id: 'espresso', qty: 5 },
      ],
      outOfStock: ['mocha'],
    });
    const { el } = mountReport(atReport(r));
    const goods = q(el, '#rpt-summary [data-block="goods"]');
    expect([...goods.querySelectorAll<HTMLElement>('[data-block="top"] [data-item]')].map((li) => li.dataset.item)).toEqual(['latte', 'croissant', 'mocha']);
    expect(q(goods, '[data-block="out"] [data-item="mocha"]')).toBeTruthy();
    expect(q(goods, '.rpt-goods-out').classList.contains('is-warn')).toBe(true);
    // One line of text, not two blocks.
    expect(el.querySelectorAll('#rpt-summary [data-block="top"]')).toHaveLength(1);
    expect(goods.tagName).toBe('P');
  });

  it('says so on the goods line when nothing sold or ran out', () => {
    const { el } = mountReport(atReport(report({ topSellers: [], outOfStock: [] })));
    const goods = text(el, '[data-block="goods"]');
    expect(goods).toContain('Bán chạy: chưa có món nào');
    expect(goods).toContain('Hết nguyên liệu: không');
    expect(el.querySelector('[data-block="goods"] .is-warn')).toBeNull();
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
    expect(iconsIn(q(result, '.rpt-fig-label'))).toEqual(['i-people']);
    expect(el.querySelector('[data-block="top"]')).toBeNull();
    expect(el.querySelector('[data-block="out"]')).toBeNull();
    expect(el.querySelector('[data-block="recent"]')).toBeNull();
    expect(el.textContent).toContain('Bán chạy: chưa có món nào');
    expect(el.textContent).toContain('Hết nguyên liệu: không');
    expect(text(el, '[data-block="customers"] .rpt-fig-value')).toBe('0/0');
    expect(text(el, '[data-block="customers"] .rpt-fig-sub')).toBe('phục vụ/đến');
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

  it('names both footer buttons by aria-label, so the phone layout can show the secondary one as an icon', () => {
    const { el } = mountReport(atReport(report()));
    const toggle = q(el, '.rpt-foot [data-action="reviews"]');
    const next = q(el, '.rpt-foot [data-action="next-day"]');
    expect(toggle.getAttribute('aria-label')).toBe('Xem đánh giá');
    expect(text(toggle, '.rpt-btn-text')).toBe('Xem đánh giá');
    expect(next.getAttribute('aria-label')).toBe('Ngày tiếp theo');
    expect(text(next, '.rpt-btn-text')).toBe('Ngày tiếp theo');
    toggle.click();
    expect(toggle.getAttribute('aria-label')).toBe('Về Tổng kết');
  });

  it('keeps a sub row in all four figures, empty for profit and revenue, then the changes', () => {
    const { el } = mountReport(atReport(report()));
    const figs = [...el.querySelectorAll<HTMLElement>('[data-block="figures"] [data-fig]')];
    expect(figs).toHaveLength(4);
    for (const fig of figs) {
      const rows = [...fig.children].map((c) => c.className);
      expect(rows, fig.dataset.fig).toEqual(['rpt-fig-label', 'rpt-fig-value', 'rpt-fig-sub', 'rpt-fig-deltas']);
    }
    for (const id of ['profit', 'revenue']) {
      const sub = q(el, `[data-fig="${id}"] .rpt-fig-sub`);
      expect(sub.textContent).toBe('');
      expect(sub.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('stays hidden outside the report phase', () => {
    const { view, el } = mountReport(atReport(report()));
    view.update(createNewGame('Khác', 'easy', 1), false);
    expect(el.hidden).toBe(true);
    view.update(null, true);
    expect(el.hidden).toBe(true);
  });
});

describe('Daily Report against yesterday and the week', () => {
  /** A closed day: revenue (a quarter of it on ingredients), served/arrived and the close rating. */
  function day(n: number, revenue: number, served: number, rating: number): DayStats {
    const d = createDayStats(n, rating);
    d.revenue = revenue;
    d.ingredientCost = revenue / 4;
    d.customersServed = served;
    d.customersArrived = served;
    d.ratingEnd = rating;
    return d;
  }

  /** The report of the last of `days`, the others in history, like the sim leaves it at closing. */
  function onReport(days: DayStats[]): GameState {
    const state = createNewGame('Quán Thử', 'normal', 42);
    state.history = days.slice(0, -1);
    state.today = days[days.length - 1]!;
    state.day = state.today.day;
    state.rating = state.today.ratingEnd;
    state.phase = 'report';
    if (state.day === WEEK_LENGTH) state.week!.result = scoreWeek(state)!;
    state.lastReport = buildDailyReport(state);
    return state;
  }

  function delta(el: HTMLElement, fig: string, vs: 'yesterday' | 'week'): HTMLElement {
    return q(el, `[data-fig="${fig}"] [data-vs="${vs}"]`);
  }

  it('shows no change on day 1', () => {
    const { el } = mountReport(onReport([day(1, 400_000, 40, 3.6)]));
    expect(el.querySelectorAll('[data-block="figures"] [data-fig]')).toHaveLength(4);
    expect(el.querySelector('[data-block="figures"] [data-vs]')).toBeNull();
    expect(el.querySelector('.rpt-fig-delta')).toBeNull();
  });

  it('signs each change on day 3 against yesterday and the week average', () => {
    const { el } = mountReport(onReport([day(1, 400_000, 40, 3.8), day(2, 500_000, 50, 4.0), day(3, 700_000, 40, 4.2)]));

    const revenue = delta(el, 'revenue', 'yesterday');
    expect(revenue.dataset.delta).toBe('up');
    expect(revenue.textContent).toBe('+200.000đ so hôm qua');
    expect(iconsIn(revenue)).toEqual(['i-trend-up']);
    // Week average of days 1–2: 450.000đ.
    expect(delta(el, 'revenue', 'week').textContent).toBe('+250.000đ so TB tuần');
    expect(delta(el, 'profit', 'yesterday').dataset.delta).toBe('up');

    const served = delta(el, 'customersServed', 'yesterday');
    expect(served.dataset.delta).toBe('down');
    expect(served.textContent).toBe('−10 so hôm qua');
    expect(iconsIn(served)).toEqual(['i-trend-down']);
    expect(delta(el, 'customersServed', 'week').dataset.delta).toBe('down');

    expect(delta(el, 'stars', 'yesterday').textContent).toBe('+0,2 so hôm qua');
    expect(delta(el, 'stars', 'week').textContent).toBe('+0,3 so TB tuần');
  });

  it('marks an unchanged figure as flat', () => {
    const { el } = mountReport(onReport([day(1, 500_000, 40, 4.0), day(2, 500_000, 40, 4.0)]));
    const revenue = delta(el, 'revenue', 'yesterday');
    expect(revenue.dataset.delta).toBe('flat');
    expect(iconsIn(revenue)).toEqual(['i-equal']);
  });

  it('shows the week revenue against its goal and the week day', () => {
    const state = onReport([day(1, 400_000, 40, 3.8), day(2, 500_000, 50, 4.0), day(3, 700_000, 40, 4.2)]);
    const { el } = mountReport(state);
    const week = q(el, '[data-block="week"]');
    expect(week.textContent).toContain('Tuần 1');
    expect(week.textContent).toContain('ngày 3/7');
    expect(week.textContent).toContain('1.600.000đ');
    const pct = Math.round((1_600_000 / state.week!.goal.revenue) * 100);
    expect(q(week, '[role="progressbar"]').getAttribute('aria-valuenow')).toBe(String(Math.min(100, pct)));
  });

  it('turns "Ngày tiếp theo" into "Xem tổng kết tuần" on the last week day', () => {
    const days = Array.from({ length: WEEK_LENGTH }, (_, i) => day(i + 1, 600_000, 40, 4));
    const mid = mountReport(onReport(days.slice(0, 3)));
    const next = q<HTMLButtonElement>(mid.el, '.rpt-foot .btn-primary');
    expect(next.textContent).toBe('Ngày tiếp theo');
    expect(next.dataset.action).toBe('next-day');
    mid.el.remove();

    const sent: Command[] = [];
    let weekEnds = 0;
    const view = createDailyReport({ dispatch: (cmd) => (sent.push(cmd), true), onWeekEnd: () => weekEnds++ });
    document.body.append(view.el);
    view.update(onReport(days), true);
    const btn = q<HTMLButtonElement>(view.el, '.rpt-foot .btn-primary');
    expect(btn.textContent).toBe('Xem tổng kết tuần');
    expect(btn.dataset.action).toBe('week-end');
    expect(text(view.el, '[data-block="week"]')).toContain('ngày 7/7');
    expect(view.el.textContent).toContain('Gợi ý cho tuần sau');
    btn.click();
    expect(weekEnds).toBe(1);
    expect(sent).toEqual([]);
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
    expect(iconsIn(q(items[1]!, '.rpt-stars'))).toEqual(['i-star', 'i-star-empty', 'i-star-empty', 'i-star-empty', 'i-star-empty']);
    expect(iconsIn(q(items[1]!, '[data-reason="long_wait"]'))).toEqual(['i-thumb-down']);
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
    expect(el.querySelectorAll('.ic').length).toBeGreaterThan(0);
    expect(iconsIn(q(el, '[data-action="next-day"]'))).toEqual(['i-next-day']);
    expect(iconsIn(q(el, '[data-tab="summary"]'))).toEqual(['i-chart']);
    expect(iconsIn(q(el, '[data-tab="reviews"]'))).toEqual(['i-reviews']);
  });

  it('"Đang tổng kết" shows a busy status and skeleton, no emoji', () => {
    const state = atReport(report());
    state.lastReport = null;
    const { view, el } = mountReport(state);
    const busy = q(el, '[data-block="busy"]');
    expect(busy.getAttribute('role')).toBe('status');
    expect(busy.textContent).toContain('Đang tổng kết ngày 3');
    expect(iconsIn(busy)).toEqual(['i-busy']);
    expect(el.querySelector('[data-result]')).toBeNull();
    expect(allText(view, el)).not.toMatch(EMOJI);
  });

  it('autosave failure and success lines use icons, no emoji', () => {
    const { view, el } = mountReport(atReport(report()), () => ({ day: 3, ok: true, savedAt: Date.UTC(2026, 9, 13, 14) }));
    const save = q(el, '[data-save]');
    view.setSaveStatus({ day: 3, ok: false });
    expect(save.textContent).not.toMatch(EMOJI);
    expect(iconsIn(save)).toEqual(['i-warning', 'i-retry']);
    q<HTMLButtonElement>(save, '[data-action="retry-save"]').click();
    expect(save.textContent).not.toMatch(EMOJI);
    expect(iconsIn(save)).toEqual(['i-ok']);
  });

  it('reviews panel and its empty state have no emoji', () => {
    const body = document.createElement('div');
    document.body.append(body);
    const state = createNewGame('Quán Thử', 'normal', 1);
    const handle = renderReviewsPanel(body, { dispatch: () => true, getState: () => state, close: () => {} });
    expect(iconsIn(q(body, '[data-empty="reviews"]'))).toEqual(['i-reviews']);
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

  it('keeps the footer in view and scrolls only the tab body, never sideways', async () => {
    const src = await css();
    const dialog = src.match(/\.rpt-dialog\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(dialog).toMatch(/display:\s*flex/);
    expect(dialog).toMatch(/flex-direction:\s*column/);
    expect(dialog).toMatch(/max-height:\s*100%/);
    const body = src.match(/\.rpt-body\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(body).toMatch(/min-height:\s*0/);
    expect(body).toMatch(/overflow-y:\s*auto/);
    expect(body).toMatch(/overflow-x:\s*hidden/);
    expect(src).toMatch(/\.rpt-foot\s*\{[^}]*flex:\s*none/);
  });

  it('fits the summary in one view: one-line tip, a compact level card, a wider report card', async () => {
    const src = await css();
    const tip = src.match(/\.rpt-tip p\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(tip).toMatch(/white-space:\s*nowrap/);
    expect(tip).toMatch(/text-overflow:\s*ellipsis/);
    expect(src).toMatch(/\.rpt-tips\s*\{[^}]*display:\s*flex/);
    // 8 px padding + 2 px frame around a 48 px badge and at most two 24 px chip lines stays under 96 px.
    expect(src).toMatch(/\.rpt-levelup\s*\{[^}]*padding:\s*var\(--space-2\) var\(--space-3\)/);
    expect(src).toMatch(/\n\.rpt-unlocks\s*\{[^}]*max-height:\s*calc\(2 \* var\(--size-icon-md\) \+ var\(--space-1\)\)/);
    expect(src).toMatch(/\.rpt-unlock,\s*\.rpt-unlock-more\s*\{[^}]*height:\s*var\(--size-icon-md\)/);
    expect(src).toMatch(/\.rpt-layer\[data-screen='report'\] \.rpt-dialog\s*\{[^}]*max-width:\s*calc\(var\(--size-dialog\)/);
    expect(src).toMatch(/\.rpt-body\.is-summary\s*\{[^}]*gap:\s*var\(--space-2\)/);
    // On a phone the tip wraps rather than hiding text behind an ellipsis.
    const narrow = src.slice(src.indexOf('@media (max-width: 640px)'));
    expect(narrow).toMatch(/\.rpt-tip p\s*\{[^}]*white-space:\s*normal/);
  });

  it('lines up the changes of all four figures through a subgrid', async () => {
    const src = await css();
    const fig = src.match(/\.rpt-fig\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(fig).toMatch(/grid-row:\s*span 4/);
    expect(fig).toMatch(/grid-template-rows:\s*subgrid/);
  });

  it('keeps the phone footer to one row: one-line buttons, the main one widest, the other an icon', async () => {
    const src = await css();
    const narrow = src.slice(src.indexOf('@media (max-width: 640px)'));
    expect(narrow).toMatch(/\.rpt-foot-actions\s*\{[^}]*flex-wrap:\s*nowrap/);
    expect(narrow).toMatch(/\.rpt-foot \.btn\s*\{[^}]*white-space:\s*nowrap/);
    expect(narrow).toMatch(/\.rpt-foot-actions > \.btn-primary\s*\{[^}]*flex:\s*1 1 auto/);
    expect(narrow).toMatch(/\.rpt-foot-actions > \[data-action='reviews'\]\s*\{[^}]*min-height:\s*var\(--size-control-lg\)/);
    expect(narrow).toMatch(/\.rpt-foot-actions > \[data-action='reviews'\] \.rpt-btn-text\s*\{[^}]*display:\s*none/);
    expect(narrow).not.toMatch(/\.rpt-foot \.btn\s*\{[^}]*flex:\s*1 1 10rem/);
  });

  it('sizes text and controls on the P24 scale with one 2px frame and the card shadow on the dialog only', async () => {
    const src = await css();
    // Figures sit one step above the text around them: lg in the cells, 2xl for the profit.
    const P24_TYPE = ['caption', 'label', 'value', 'panel-title', 'screen-title', 'lg', '2xl'];
    const sizes = [...src.matchAll(/font-size:\s*([^;]+);/g)].map((m) => m[1]!.trim());
    expect(sizes.length).toBeGreaterThan(0);
    for (const v of sizes) expect(P24_TYPE.map((t) => `var(--font-size-${t})`)).toContain(v);
    expect(src.match(/\.rpt-head h3\s*\{([^}]*)\}/)?.[1]).toMatch(/font-size:\s*var\(--font-size-screen-title\)/);
    expect(src.match(/\.rpt-h4\s*\{([^}]*)\}/)?.[1]).toMatch(/font-size:\s*var\(--font-size-panel-title\)/);
    for (const sel of ['\\.rpt-fig-value', '\\.rpt-kpi-value']) {
      expect(src.match(new RegExp(`\\n${sel}\\s*\\{([^}]*)\\}`))?.[1]).toMatch(/font-size:\s*var\(--font-size-lg\)/);
    }
    expect(src.match(/\.rpt-fig\.is-result \.rpt-fig-value\s*\{([^}]*)\}/)?.[1]).toMatch(/font-size:\s*var\(--font-size-2xl\)/);
    expect(src.match(/\.wk-goal-num\s*\{([^}]*)\}/)?.[1]).toMatch(/font-size:\s*var\(--font-size-value\)/);
    // The 32 px profit gets a wider column, and the whole first row on a phone.
    expect(src).toMatch(/\.rpt-figs\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1\.5fr\) repeat\(3, minmax\(0, 1fr\)\)/);
    expect(src.slice(src.indexOf('@media (max-width: 640px)'))).toMatch(/\.rpt-fig\.is-result\s*\{[^}]*grid-column:\s*1 \/ -1/);
    expect(src.match(/\.rpt-dialog\s*\{([^}]*)\}/)?.[1]).toMatch(/border:\s*var\(--size-frame-outline\) solid/);
    expect([...src.matchAll(/box-shadow:\s*([^;]+);/g)].map((m) => m[1]!.trim())).toEqual(['var(--shadow-card)', 'var(--shadow-sm)']);
    expect(src).toMatch(/\.rpt-foot \.btn\s*\{[^}]*min-height:\s*var\(--size-control-md\)/);
    expect(src).toMatch(/\.rpt-foot \.btn-primary\s*\{[^}]*min-height:\s*var\(--size-control-lg\)/);
    expect(src).toMatch(/\.rpt-tab\s*\{[^}]*min-height:\s*var\(--size-control-md\)/);
  });

  it('drops the card in, stamps the result, and tones both down for reduced motion', async () => {
    const src = await css();
    expect(src).toMatch(/\.rpt-dialog\s*\{[^}]*animation:\s*rpt-drop/);
    expect(src).toMatch(/\.rpt-result\s*\{[^}]*animation:\s*rpt-stamp/);
    const reduced = src.slice(src.indexOf('prefers-reduced-motion'));
    expect(reduced).toMatch(/\.rpt-dialog\s*\{[^}]*animation:\s*rpt-fade/);
    expect(reduced).toMatch(/\.rpt-result\s*\{[^}]*animation:\s*none/);
  });

  it('pops the level badge 0.6 → 1.08 → 1 in 400 ms, and not under reduced motion', async () => {
    const src = await css();
    expect(src).toMatch(/\.rpt-levelup-badge\s*\{[^}]*animation:\s*rpt-badge-pop 400ms/);
    const pop = src.slice(src.indexOf('@keyframes rpt-badge-pop'));
    expect(pop).toMatch(/0%\s*\{[^}]*scale\(0\.6\)[^}]*\}\s*60%\s*\{[^}]*scale\(1\.08\)[^}]*\}\s*100%\s*\{[^}]*scale\(1\)/);
    const reduced = src.slice(src.indexOf('prefers-reduced-motion'));
    expect(reduced).toMatch(/\.rpt-levelup-badge\s*\{[^}]*animation:\s*none/);
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
