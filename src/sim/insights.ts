import {
  ABANDON_PCT,
  AVG_WAIT_MINUTES,
  FOOD_COST_PCT,
  ITEM_MARGIN_PCT,
  LABOR_PCT,
  PRIME_COST_PCT,
  SEAT_FILL_PCT,
  SERVICE_MINUTES,
  WASTE_PCT_OF_COGS,
  lowerStatus,
  upperStatus,
} from './data/benchmarks';
import { DIFFICULTIES } from './data/difficulty';
import { getMenuItem } from './data/menu';
import { servingCost } from './inventory';
import type { DayStats, GameState, InsightMetric, InsightPanel, InsightStatus, Insights, ItemMargin, ItemProfit, MenuItemId } from './types';

/** `part / whole` as a 0..100 percentage, or null when there is no base to divide by. */
function pct(part: number, whole: number): number | null {
  return whole > 0 ? (part / whole) * 100 : null;
}

/** Ingredient cost of one serving in đồng at today's prices (ice-maker discount and difficulty price multiplier). */
function itemCost(state: GameState, id: Parameters<typeof getMenuItem>[0]): number {
  return Math.round(servingCost(state, id) * DIFFICULTIES[state.difficulty].priceMult);
}

/** Advice and panel only matter when the status calls for action; otherwise the hint is blank. */
function hint(status: InsightStatus | null, advice: string, panel?: InsightPanel): { advice: string; panel?: InsightPanel } {
  return status === 'watch' || status === 'bad' ? { advice, panel } : { advice: '' };
}

/**
 * Management insights for a day's stats: cost ratios, margins, service and
 * occupancy figures, each scored against the F&B benchmarks with an action
 * hint. Pure and defensive — any figure it cannot compute (no revenue, no
 * customers, a save without the extra day stats) comes back as null rather
 * than NaN or Infinity.
 */
export function buildInsights(state: GameState, stats: DayStats): Insights {
  const revenue = stats.revenue;
  const cogs = stats.ingredientCost;
  const wages = stats.wages;
  const priceMult = DIFFICULTIES[state.difficulty].priceMult;

  const itemMargins: ItemMargin[] = state.menu
    .filter((m) => m.enabled)
    .map((m) => {
      const grossProfit = m.price - itemCost(state, m.id);
      const marginPct = m.price > 0 ? (grossProfit / m.price) * 100 : 0;
      return { id: m.id, grossProfit, marginPct, status: upperStatus(marginPct, ITEM_MARGIN_PCT) };
    });
  const worstMargin = itemMargins.reduce<ItemMargin | null>((w, m) => (w === null || m.marginPct < w.marginPct ? m : w), null);

  // Profit per item actually sold today, including any item since switched off.
  const priceOf = (id: MenuItemId): number => state.menu.find((m) => m.id === id)?.price ?? getMenuItem(id).price;
  const itemProfits: ItemProfit[] = (Object.entries(stats.sold) as [MenuItemId, number][])
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => {
      const price = priceOf(id);
      const cost = itemCost(state, id);
      const marginPct = price > 0 ? ((price - cost) / price) * 100 : 0;
      return { id, qty, price, cost, marginPct, grossProfit: (price - cost) * qty, status: upperStatus(marginPct, ITEM_MARGIN_PCT) };
    })
    .sort((a, b) => b.grossProfit - a.grossProfit || a.id.localeCompare(b.id));

  const metrics: InsightMetric[] = [];

  const foodCost = pct(cogs, revenue);
  const foodCostStatus = foodCost === null ? null : lowerStatus(foodCost, FOOD_COST_PCT);
  const foodCostHint =
    worstMargin && worstMargin.status !== 'good'
      ? hint(foodCostStatus, `Chi phí nguyên liệu cao: cân nhắc tắt ${getMenuItem(worstMargin.id).name} (biên ${Math.round(worstMargin.marginPct)}%).`, 'menu')
      : hint(foodCostStatus, 'Chi phí nguyên liệu cao: mua máy làm đá để giảm giá nguyên liệu đá.', 'upgrades');
  metrics.push({ id: 'food_cost', value: foodCost, status: foodCostStatus, ...foodCostHint });

  const laborPct = pct(wages, revenue);
  const laborStatus = laborPct === null ? null : lowerStatus(laborPct, LABOR_PCT);
  metrics.push({
    id: 'labor_cost',
    value: laborPct,
    status: laborStatus,
    ...hint(laborStatus, 'Chi phí lương cao so với doanh thu: cân đối số nhân viên theo lượng khách.', 'staff'),
  });

  const primeCost = pct(cogs + wages, revenue);
  const primeStatus = primeCost === null ? null : lowerStatus(primeCost, PRIME_COST_PCT);
  metrics.push({
    id: 'prime_cost',
    value: primeCost,
    status: primeStatus,
    ...hint(primeStatus, 'Prime cost cao: siết cả chi phí nguyên liệu lẫn nhân công.'),
  });

  const aov = stats.customersServed > 0 ? Math.round(revenue / stats.customersServed) : null;
  metrics.push({ id: 'aov', value: aov, status: null, advice: '' });

  const seats = state.tables.reduce((s, t) => s + t.seats, 0);
  const seatFill =
    stats.seatMinutesUsed !== undefined && seats > 0 ? (stats.seatMinutesUsed / (seats * SERVICE_MINUTES)) * 100 : null;
  const seatStatus = seatFill === null ? null : lowerStatus(seatFill, SEAT_FILL_PCT);
  metrics.push({
    id: 'seat_fill',
    value: seatFill,
    status: seatStatus,
    ...hint(seatStatus, 'Ghế gần kín trong giờ mở cửa: thêm bàn để nhận thêm khách.', 'upgrades'),
  });

  const avgWait =
    stats.waitMinutesSum !== undefined && stats.waitCount !== undefined && stats.waitCount > 0
      ? stats.waitMinutesSum / stats.waitCount
      : null;
  const waitStatus = avgWait === null ? null : lowerStatus(avgWait, AVG_WAIT_MINUTES);
  const hasBarista = state.staff.some((s) => s.role === 'barista');
  const waitAdvice = hasBarista
    ? 'Khách chờ lâu: tuyển thêm phục vụ hoặc nâng máy espresso 2 group.'
    : 'Khách chờ lâu: tuyển barista để pha nhanh hơn.';
  metrics.push({ id: 'avg_wait', value: avgWait, status: waitStatus, ...hint(waitStatus, waitAdvice, 'staff') });

  const wasteDong = stats.wasteCost !== undefined ? Math.round(stats.wasteCost * priceMult) : null;
  const wastePct =
    stats.wasteCost !== undefined && stats.ingredientsUsed !== undefined && stats.ingredientsUsed > 0
      ? (stats.wasteCost / stats.ingredientsUsed) * 100
      : null;
  const wasteStatus = wastePct === null ? null : lowerStatus(wastePct, WASTE_PCT_OF_COGS);
  metrics.push({
    id: 'waste',
    value: wasteDong,
    status: wasteStatus,
    ...hint(wasteStatus, 'Nhiều đồ đã pha bị bỏ: phục vụ nhanh hơn để khách không bỏ về sau khi gọi.', 'staff'),
  });

  let peakHour: number | null = null;
  if (stats.arrivalsByHour) {
    let best = 0;
    for (let h = 0; h < stats.arrivalsByHour.length; h++) {
      if (stats.arrivalsByHour[h]! > best) {
        best = stats.arrivalsByHour[h]!;
        peakHour = h;
      }
    }
  }
  metrics.push({ id: 'peak_hour', value: peakHour, status: null, advice: '' });

  const abandon = pct(stats.customersLost, stats.customersArrived);
  const abandonStatus = abandon === null ? null : lowerStatus(abandon, ABANDON_PCT);
  metrics.push({
    id: 'abandon_rate',
    value: abandon,
    status: abandonStatus,
    ...hint(abandonStatus, 'Nhiều khách bỏ về: tuyển thêm nhân viên hoặc nhập đủ nguyên liệu để phục vụ kịp.', 'staff'),
  });

  return { metrics, grossProfit: revenue > 0 ? revenue - cogs : null, itemMargins, itemProfits, arrivalsByHour: stats.arrivalsByHour };
}
