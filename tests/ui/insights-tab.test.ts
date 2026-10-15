// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createNewGame } from '../../src/sim/state';
import type { DailyReport, GameState, InsightPanel, Insights } from '../../src/sim/types';
import { createDailyReport } from '../../src/ui/report';

const EMOJI = /\p{Extended_Pictographic}|[▲▼△▽●○★☆→✓✔]/u;

function arrivals(): number[] {
  const a = new Array(24).fill(0);
  const open = [3, 6, 10, 14, 24, 40, 32, 16, 12, 14, 20, 18, 10, 5]; // 07..20
  for (let i = 0; i < open.length; i++) a[7 + i] = open[i]!;
  return a; // peak at hour 12 (index 5 of the window)
}

function insights(over: Partial<Insights> = {}): Insights {
  return {
    metrics: [
      { id: 'food_cost', value: 31, status: 'good', advice: '' },
      { id: 'labor_cost', value: 38, status: 'watch', advice: 'Chi phí lương cao so với doanh thu: cân đối số nhân viên.', panel: 'staff' },
      { id: 'prime_cost', value: 69, status: 'watch', advice: 'Prime cost cao: siết cả nguyên liệu lẫn nhân công.' },
      { id: 'aov', value: 48_000, status: null, advice: '' },
      { id: 'seat_fill', value: 74, status: 'bad', advice: 'Ghế gần kín: thêm bàn để nhận thêm khách.', panel: 'upgrades' },
      { id: 'avg_wait', value: 4.6, status: 'watch', advice: 'Khách chờ lâu: tuyển thêm phục vụ.', panel: 'staff' },
      { id: 'waste', value: 9_000, status: 'good', advice: '' },
      { id: 'peak_hour', value: 12, status: null, advice: '' },
      { id: 'abandon_rate', value: 5, status: 'good', advice: '' },
    ],
    grossProfit: 700_000,
    itemMargins: [],
    // Pre-sorted by day gross profit, as buildInsights returns them.
    itemProfits: [
      { id: 'latte', qty: 20, price: 40_000, cost: 15_000, marginPct: 62.5, grossProfit: 500_000, status: 'good' },
      { id: 'espresso', qty: 10, price: 25_000, cost: 7_000, marginPct: 72, grossProfit: 180_000, status: 'good' },
    ],
    arrivalsByHour: arrivals(),
    ...over,
  };
}

function report(over: Partial<DailyReport> = {}): DailyReport {
  return {
    day: 3,
    revenue: 1_200_000,
    ingredientCost: 300_000,
    wages: 450_000,
    marketingCost: 0,
    profit: 450_000,
    money: 2_600_000,
    customersArrived: 100,
    customersServed: 95,
    customersLost: 5,
    topSellers: [],
    outOfStock: [],
    ratingStart: 3.8,
    ratingEnd: 3.9,
    reviews: [],
    suggestions: [],
    insights: insights(),
    ...over,
  };
}

function atReport(r: DailyReport): GameState {
  const state = createNewGame('Quán Thử', 'normal', 42);
  state.day = r.day;
  state.phase = 'report';
  state.lastReport = r;
  return state;
}

function mount(r: DailyReport) {
  const opened: InsightPanel[] = [];
  const view = createDailyReport({ dispatch: () => true, onOpenPanel: (p) => opened.push(p) });
  document.body.append(view.el);
  view.update(atReport(r), true);
  view.showTab('insights');
  return { view, el: view.el, opened };
}

function q<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

function text(root: ParentNode, selector: string): string {
  return q(root, selector).textContent ?? '';
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('Daily Report — Chỉ số tab', () => {
  it('sits between Tổng kết and Đánh giá and keeps the old data-tab values', () => {
    const { el } = mount(report());
    const tabs = [...el.querySelectorAll('[role="tab"]')].map((t) => t.getAttribute('data-tab'));
    expect(tabs).toEqual(['summary', 'insights', 'reviews']);
    expect(q(el, '#rpt-insights').hidden).toBe(false);
    expect(q(el, '#rpt-summary').hidden).toBe(true);
  });

  it('shows each KPI with its value and a Tốt/Cần chú ý/Xấu label by word, not colour', () => {
    const { el } = mount(report());
    expect(el.querySelectorAll('[data-block="kpis"] .rpt-kpi')).toHaveLength(8);

    expect(text(el, '[data-metric="food_cost"] .rpt-kpi-value')).toBe('31%');
    expect(text(el, '[data-metric="food_cost"] .rpt-kpi-status')).toContain('Tốt');

    expect(text(el, '[data-metric="labor_cost"] .rpt-kpi-value')).toBe('38%');
    expect(text(el, '[data-metric="labor_cost"] .rpt-kpi-status')).toContain('Cần chú ý');

    expect(text(el, '[data-metric="seat_fill"] .rpt-kpi-status')).toContain('Xấu');
    expect(text(el, '[data-metric="avg_wait"] .rpt-kpi-value')).toBe('4,6 phút');
    expect(text(el, '[data-metric="aov"] .rpt-kpi-value')).toBe('48.000đ');
    expect(text(el, '[data-metric="aov"] .rpt-kpi-status')).toContain('Tham khảo');
    expect(text(el, '[data-metric="waste"] .rpt-kpi-value')).toBe('9.000đ');

    // Every status label carries an icon, so colour is never the only signal.
    expect(q(el, '[data-metric="food_cost"] .rpt-kpi-status .ic')).toBeTruthy();
  });

  it('draws the hourly chart 07–20 with the peak hour marked and a hidden table', () => {
    const { el } = mount(report());
    const bars = el.querySelectorAll('.rpt-chart-bars .rpt-hour');
    expect(bars).toHaveLength(14);
    expect(q(el, '.rpt-chart-bars').getAttribute('aria-hidden')).toBe('true');
    expect(q(el, '.rpt-hour[data-hour="12"]').classList.contains('is-peak')).toBe(true);
    expect(q(el, '.rpt-hour[data-hour="7"]').classList.contains('is-peak')).toBe(false);
    expect(text(el, '.rpt-peak')).toContain('Cao điểm 12:00');
    // The screen-reader table repeats the data as rows.
    expect(el.querySelectorAll('table.sr-only tbody tr')).toHaveLength(14);
  });

  it('lists each sold item with price, cost, margin and quantity, highest gross profit first', () => {
    const { el } = mount(report());
    const rows = [...el.querySelectorAll('[data-block="margins"] tbody tr')].map((r) => r.getAttribute('data-item'));
    expect(rows).toEqual(['latte', 'espresso']); // 500.000đ before 180.000đ
    const latte = q(el, '[data-block="margins"] [data-item="latte"]');
    expect(latte.textContent).toContain('40.000đ');
    expect(latte.textContent).toContain('15.000đ');
    expect(latte.textContent).toContain('63%');
    expect(latte.textContent).toContain('20');
    expect(latte.textContent).toContain('500.000đ');
  });

  it('lists only the flagged metrics as actions, with a panel link where there is one', () => {
    const { el, opened } = mount(report());
    const tips = [...el.querySelectorAll('[data-block="insight-tips"] .rpt-sugg')].map((t) => t.getAttribute('data-metric'));
    expect(tips).toEqual(['labor_cost', 'prime_cost', 'seat_fill', 'avg_wait']);
    // Prime cost has advice but no panel, so no link button.
    expect(q(el, '[data-metric="prime_cost"]').querySelector('button')).toBeNull();

    q<HTMLButtonElement>(el, '[data-metric="seat_fill"] button[data-goto="upgrades"]').click();
    expect(opened).toEqual(['upgrades']);
    q<HTMLButtonElement>(el, '[data-metric="labor_cost"] button[data-goto="staff"]').click();
    expect(opened).toEqual(['upgrades', 'staff']);
  });

  it('shows an empty note for a day with no customers', () => {
    const { el } = mount(report({ customersArrived: 0, customersServed: 0, customersLost: 0, revenue: 0 }));
    const empty = q(el, '#rpt-insights [data-empty="insights"]');
    expect(empty.getAttribute('data-reason')).toBe('quiet');
    expect(empty.textContent).toContain('Hôm nay chưa có khách');
    expect(el.querySelector('[data-block="kpis"]')).toBeNull();
  });

  it('shows an old-save note when the report carries no insights', () => {
    const { el } = mount(report({ insights: undefined }));
    const empty = q(el, '#rpt-insights [data-empty="insights"]');
    expect(empty.getAttribute('data-reason')).toBe('old');
    expect(empty.textContent).toContain('phiên bản cũ');
  });

  it('shows "—" and "Chưa đủ dữ liệu" for a metric the day could not supply', () => {
    const base = insights();
    const metrics = base.metrics.map((m) => (m.id === 'waste' || m.id === 'food_cost' ? { ...m, value: null, status: null, advice: '' } : m));
    const { el } = mount(report({ insights: { ...base, metrics } }));
    for (const id of ['waste', 'food_cost']) {
      expect(text(el, `[data-metric="${id}"] .rpt-kpi-value`), id).toBe('—');
      expect(text(el, `[data-metric="${id}"] .rpt-kpi-status`), id).toContain('Chưa đủ dữ liệu');
      expect(text(el, `[data-metric="${id}"] .rpt-kpi-status`), id).not.toContain('Tốt');
    }
    // Metrics with a value keep their normal label.
    expect(text(el, '[data-metric="labor_cost"] .rpt-kpi-value')).toBe('38%');
    expect(text(el, '[data-metric="labor_cost"] .rpt-kpi-status')).toContain('Cần chú ý');
  });

  it('hides the chart with a note when the save lacks the hourly stat', () => {
    const { el } = mount(report({ insights: insights({ arrivalsByHour: undefined }) }));
    expect(el.querySelector('.rpt-chart-bars')).toBeNull();
    expect(q(el, '#rpt-insights').textContent).toContain('chưa ghi lượng khách theo giờ');
    // The KPI grid and margin table still render.
    expect(el.querySelector('[data-block="kpis"]')).toBeTruthy();
    expect(el.querySelector('[data-block="margins"]')).toBeTruthy();
  });

  it('shows no emoji on the insights tab, only atlas icons', () => {
    const { el } = mount(report());
    expect(q(el, '#rpt-insights').textContent).not.toMatch(EMOJI);
    expect(el.querySelectorAll('#rpt-insights .ic').length).toBeGreaterThan(0);
  });
});
