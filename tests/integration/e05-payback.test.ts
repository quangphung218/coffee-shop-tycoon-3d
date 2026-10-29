import { describe, expect, it } from 'vitest';
import { upgradeUnlockLevel } from '../../src/sim/data/levels';
import { UPGRADES } from '../../src/sim/data/upgrades';
import { WEEK_LENGTH } from '../../src/sim/data/week';
import { dailyRent, profit, totalWages } from '../../src/sim/economy';
import { dispatch, nextUpgradeCost } from '../../src/sim/index';
import { autoRestockSuggestion } from '../../src/sim/inventory';
import { isUnlocked } from '../../src/sim/progression';
import { createNewGame } from '../../src/sim/state';
import { grantUpgradeLevel, nextUpgradeTicketCost, upgradeBlockedReason, upgradeLevelPrice } from '../../src/sim/upgrades';
import type { GameState, UpgradeId } from '../../src/sim/types';
import { playDay } from './helpers';

/**
 * E-05 payback on Normal: each level the epic added (extra levels of existing
 * upgrades, premium decor) is granted to a spender's shop and the week after
 * is played with and without it. Payback is the level's Normal price over the
 * extra profit of that week. The shop first gets every E-05 level opened at a
 * lower shop level, as a player reaching that level would own them.
 */

const SEEDS = [1, 42, 777];
const START_DAY = 21;

interface Sink {
  id: UpgradeId;
  /** Level from 1. */
  level: number;
  shopLevel: number;
}

/** Every E-05 level: extra levels of existing upgrades and the levels of the premium decor. */
const SINKS: Sink[] = UPGRADES.flatMap((u) => {
  const extras = (u.extraLevels ?? []).map((x, i) => ({ id: u.id, level: u.maxLevel + i + 1, shopLevel: x.shopLevel }));
  const premium = u.effectPerLevel.priceBonus ? Array.from({ length: u.maxLevel }, (_, i) => ({ id: u.id, level: i + 1, shopLevel: upgradeUnlockLevel(u.id) })) : [];
  return [...extras, ...premium];
});

function reserve(s: GameState): number {
  const d = structuredClone(s);
  for (const i of d.inventory) i.qty = 0;
  return totalWages(s) + dailyRent(s) + autoRestockSuggestion(d).totalCost;
}

/** The p23 spender: one barista, then the cheapest affordable upgrade every morning. */
function morning(s: GameState, day: number, spend: boolean): void {
  if (day > 1) expect(dispatch(s, { type: 'next_day' })).toBe(true);
  s.events = [];
  for (const m of s.menu) if (!m.enabled && isUnlocked(s, 'menu', m.id)) dispatch(s, { type: 'set_menu_item', itemId: m.id, enabled: true });
  dispatch(s, { type: 'apply_restock' });
  if (day === 1) {
    const pick = [...s.candidates].sort((a, b) => a.wagePerDay - b.wagePerDay || a.id - b.id)[0]!;
    dispatch(s, { type: 'hire_staff', candidateId: pick.id, role: 'barista' });
  }
  for (let guard = 0; spend && guard < 100; guard++) {
    let best: { id: UpgradeId; cost: number } | null = null;
    for (const def of UPGRADES) {
      if (!isUnlocked(s, 'upgrade', def.id)) continue;
      const cost = nextUpgradeCost(s, def.id);
      if (cost === null || s.money - reserve(s) < cost) continue;
      if ((nextUpgradeTicketCost(s, def.id) ?? 0) > (s.retention?.tickets ?? 0) || upgradeBlockedReason(s, def.id)) continue;
      if (!best || cost < best.cost) best = { id: def.id, cost };
    }
    if (!best) break;
    dispatch(s, { type: 'buy_upgrade', upgradeId: best.id });
  }
}

/** Profit of the next week with no buying: the days' profit as the week summary counts it, so restock bought ahead does not blur it. */
function weekProfit(start: GameState): number {
  const s = structuredClone(start);
  let total = 0;
  for (let d = START_DAY + 1; d <= START_DAY + WEEK_LENGTH; d++) {
    morning(s, d, false);
    playDay(s);
    total += profit(s.today);
  }
  return total;
}

/** Raises the upgrade to `level` without paying (levels below it included). */
function grantTo(s: GameState, id: UpgradeId, level: number): void {
  while ((s.upgrades[id] ?? 0) < level) grantUpgradeLevel(s, id);
}

describe('E-05 payback of the late-game levels on Normal', { timeout: 600_000 }, () => {
  const shops = SEEDS.map((seed) => {
    const s = createNewGame('Quán E05', 'normal', seed);
    for (let d = 1; d <= START_DAY; d++) {
      morning(s, d, true);
      playDay(s);
    }
    return s;
  });

  const rows = SINKS.map((sink) => {
    const gains = shops.map((shop) => {
      const before = structuredClone(shop);
      for (const other of SINKS) if (other.shopLevel < sink.shopLevel) grantTo(before, other.id, other.level);
      // Levels of the same upgrade below this one come with it; a level the spender already bought is taken back first.
      if ((before.upgrades[sink.id] ?? 0) >= sink.level) before.upgrades[sink.id] = sink.level - 1;
      grantTo(before, sink.id, sink.level - 1);
      const after = structuredClone(before);
      grantTo(after, sink.id, sink.level);
      return weekProfit(after) - weekProfit(before);
    });
    // Price over the extra profit of a week, averaged over the seeds first: one seed's week is noisy.
    const cost = upgradeLevelPrice(shops[0]!, sink.id, sink.level);
    return { ...sink, cost, gains, payback: cost / (gains.reduce((a, b) => a + b, 0) / gains.length) };
  });

  it('prints the payback of every E-05 level', () => {
    const k = (v: number) => `${Math.round(v / 1000).toLocaleString('en-US')}k`;
    const lines = rows.map((r) => `| ${r.id} | ${r.level} | ${r.shopLevel} | ${k(r.cost)} | ${r.gains.map(k).join(' / ')} | ${r.payback.toFixed(2)} |`);
    console.log(['| upgrade | level | shop level | cost (Normal) | extra profit per week (seeds 1 / 42 / 777) | payback (weeks) |', '|---|---|---|---|---|---|', ...lines].join('\n'));
    expect(rows.length).toBeGreaterThan(0);
  });

  it('pays every level back in about one to two weeks', () => {
    for (const r of rows) {
      expect(r.payback, `${r.id} level ${r.level}`).toBeGreaterThanOrEqual(0.75);
      expect(r.payback, `${r.id} level ${r.level}`).toBeLessThanOrEqual(2.25);
    }
  });
});
