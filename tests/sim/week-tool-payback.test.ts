import { describe, expect, it } from 'vitest';
import { WEEK_LENGTH } from '../../src/sim/data/week';
import { totalWages } from '../../src/sim/economy';
import { dispatch, nextUpgradeCost } from '../../src/sim/index';
import { isUnlocked } from '../../src/sim/progression';
import { createNewGame } from '../../src/sim/state';
import type { Difficulty, ToolId } from '../../src/sim/types';
import { playDay } from '../integration/helpers';

/**
 * The ice maker and the dishwasher used to open on days 6 and 7 and lost
 * money at every seed and difficulty (docs/reports/p22-economy.md, Quyết
 * định). Strategy b of tests/integration/p22-strategies.test.ts, with or
 * without level 1 of one tool bought on the morning it opens.
 */

const SEEDS = [1, 42, 777, 2024, 31337, 9001];

/** Week profit: revenue − ingredients used − wages − upgrades bought. */
function weekProfit(difficulty: Difficulty, seed: number, tool: ToolId | null): number {
  const state = createNewGame('Quán P22', difficulty, seed);
  let profit = 0;
  for (let weekDay = 1; weekDay <= WEEK_LENGTH; weekDay++) {
    if (weekDay > 1) expect(dispatch(state, { type: 'next_day' })).toBe(true);
    dispatch(state, { type: 'apply_restock' });
    if (weekDay === 1) {
      const pick = [...state.candidates].sort((a, b) => a.wagePerDay - b.wagePerDay || a.id - b.id)[0]!;
      expect(dispatch(state, { type: 'hire_staff', candidateId: pick.id, role: 'barista' })).toBe(true);
    }
    if (tool && (state.upgrades[tool] ?? 0) === 0 && isUnlocked(state, 'upgrade', tool)) {
      const cost = nextUpgradeCost(state, tool)!;
      if (state.money - cost >= totalWages(state)) expect(dispatch(state, { type: 'buy_upgrade', upgradeId: tool })).toBe(true);
    }
    playDay(state);
    const t = state.today;
    profit += t.revenue - t.ingredientCost - t.wages - t.upgradeCost - t.marketingCost;
  }
  return profit;
}

function deltas(difficulty: Difficulty, tool: ToolId): number[] {
  return SEEDS.map((seed) => weekProfit(difficulty, seed, tool) - weekProfit(difficulty, seed, null));
}

describe('tools that open late in the week', { timeout: 60_000 }, () => {
  it('the ice maker pays back within the week on Dễ at every seed', () => {
    for (const d of deltas('easy', 'ice_maker')) expect(d).toBeGreaterThan(0);
  });

  it('the dishwasher pays back on average on Dễ and wins at least one seed on Thường', () => {
    const easy = deltas('easy', 'dishwasher');
    expect(easy.reduce((s, d) => s + d, 0)).toBeGreaterThan(0);
    expect(deltas('normal', 'dishwasher').some((d) => d > 0)).toBe(true);
  });
});
