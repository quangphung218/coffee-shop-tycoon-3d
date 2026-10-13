import { DIFFICULTIES } from './data/difficulty';
import { getIngredient } from './data/ingredients';
import { getMenuItem } from './data/menu';
import { UPGRADES, upgradeCost } from './data/upgrades';
import { profit, settleDay, totalWages } from './economy';
import { autoRestockSuggestion, blockedMenuItems } from './inventory';
import { updateRating } from './rating';
import type { DailyReport, GameState, MenuItemId, Suggestion } from './types';

export const TOP_SELLERS = 3;
export const REPORT_REVIEWS = 5;
/** Arrivals under this count as a quiet day. */
export const QUIET_DAY_CUSTOMERS = 40;
/** Customers lost to waiting that call for more staff: at least this many… */
export const WAIT_LOSS_MIN = 3;
/** …and at least this share of arrivals. */
export const WAIT_LOSS_SHARE = 0.1;
/** Takeaway customers blocked by dirty tables that call for a cleaner. */
export const DIRTY_HITS_MIN = 2;

function sum(values: readonly (number | undefined)[]): number {
  return values.reduce<number>((s, v) => s + (v ?? 0), 0);
}

function hasRole(state: GameState, role: string): boolean {
  return state.staff.some((s) => s.role === role);
}

/** Action hints for tomorrow, from simple rules over today's numbers. */
export function buildSuggestions(state: GameState, outOfStock: readonly MenuItemId[]): Suggestion[] {
  const t = state.today;
  const out: Suggestion[] = [];

  const restock = autoRestockSuggestion(state);
  if (outOfStock.length > 0 || restock.items.length > 0) {
    const names = outOfStock.length > 0 ? outOfStock.map((id) => getMenuItem(id).name) : restock.items.map((i) => getIngredient(i.id).name);
    out.push({ kind: 'restock', text: `Nhập thêm nguyên liệu cho: ${names.join(', ')}` });
  }

  const lostToWait = t.customersLost - sum(Object.values(t.outOfStock));
  if (lostToWait >= WAIT_LOSS_MIN && lostToWait >= t.customersArrived * WAIT_LOSS_SHARE) {
    if (!hasRole(state, 'barista')) {
      out.push({ kind: 'hire_barista', text: `${lostToWait} khách bỏ về vì chờ lâu: tuyển barista để pha nhanh hơn` });
    } else {
      out.push({ kind: 'hire_server', text: `${lostToWait} khách bỏ về vì chờ lâu: tuyển thêm phục vụ` });
    }
  }

  if ((t.dirtyTableHits ?? 0) >= DIRTY_HITS_MIN && !hasRole(state, 'cleaner')) {
    out.push({ kind: 'hire_cleaner', text: `${t.dirtyTableHits} khách không có bàn sạch để ngồi: tuyển nhân viên dọn dẹp` });
  }

  const campaignRunning = state.campaigns.some((c) => c.daysLeft > 0);
  if (t.customersArrived < QUIET_DAY_CUSTOMERS && !campaignRunning) {
    out.push({ kind: 'marketing', text: 'Quán vắng khách: chạy marketing để kéo thêm khách' });
  }

  // Keep tomorrow's wages and restock in hand before spending on upgrades.
  const reserve = totalWages(state) + restock.totalCost;
  const priceMult = DIFFICULTIES[state.difficulty].priceMult;
  let best: { name: string; cost: number } | null = null;
  for (const def of UPGRADES) {
    const cost = upgradeCost(def, state.upgrades[def.id] ?? 0, priceMult);
    if (cost !== null && (best === null || cost < best.cost)) best = { name: def.name, cost };
  }
  if (best && state.money - reserve >= best.cost) {
    out.push({ kind: 'upgrade', text: `Đủ tiền nâng cấp: ${best.name}` });
  }
  return out;
}

/** Summary of the current day. Call after settleDay and updateRating so costs and rating are final. */
export function buildDailyReport(state: GameState): DailyReport {
  const t = state.today;
  const topSellers = (Object.entries(t.sold) as [MenuItemId, number][])
    .filter(([, qty]) => qty > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_SELLERS)
    .map(([id, qty]) => ({ id, qty }));
  const ranOut = (Object.keys(t.outOfStock) as MenuItemId[]).filter((id) => (t.outOfStock[id] ?? 0) > 0);
  const outOfStock = [...new Set([...ranOut, ...blockedMenuItems(state)])];
  return {
    day: t.day,
    revenue: t.revenue,
    ingredientCost: t.ingredientCost,
    wages: t.wages,
    marketingCost: t.marketingCost,
    profit: profit(t),
    money: state.money,
    customersArrived: t.customersArrived,
    customersServed: t.customersServed,
    customersLost: t.customersLost,
    topSellers,
    outOfStock,
    ratingStart: t.ratingStart,
    ratingEnd: t.ratingEnd,
    reviews: state.reviews.filter((r) => r.day === t.day).slice(-REPORT_REVIEWS),
    suggestions: buildSuggestions(state, outOfStock),
  };
}

/** End-of-day bookkeeping: pay costs, update the rating and store the report. */
export function closeDay(state: GameState): DailyReport {
  settleDay(state);
  updateRating(state);
  const report = buildDailyReport(state);
  state.lastReport = report;
  return report;
}
