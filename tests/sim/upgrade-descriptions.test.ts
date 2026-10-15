import { describe, expect, it } from 'vitest';
import { getUpgrade } from '../../src/sim/data/upgrades';
import { dayScore } from '../../src/sim/rating';
import { rateExperience } from '../../src/sim/reviews';
import { createNewGame } from '../../src/sim/state';

/** Share of 4-star visits that come out as 5 stars with `level` better_machine levels. */
function bumpShare(level: number, visits = 4000): number {
  const s = createNewGame('Quán Máy', 'normal', 11);
  s.upgrades = level > 0 ? { better_machine: level } : {};
  let bumped = 0;
  for (let i = 0; i < visits; i++) {
    if (rateExperience(s, { kind: 'served', waitShare: 0.5, dirtyTable: false }).stars === 5) bumped++;
  }
  return bumped / visits;
}

describe('better_machine description matches its effect', () => {
  const def = getUpgrade('better_machine');
  const bonus = def.effectPerLevel.ratingBonus!;

  it('states the per-level star bonus, the review chance and its cap', () => {
    expect(def.description).toContain(`+${String(bonus).replace('.', ',')} sao`);
    expect(def.description).toContain(`+${Math.round(bonus * 100)}% cơ hội khách chấm thêm 1 sao`);
    expect(def.description).toContain('tối đa 50%');
  });

  it('adds the stated stars to the day score per level', () => {
    const plain = createNewGame('Quán Máy', 'normal', 11);
    plain.today.customersArrived = 10;
    plain.today.customersServed = 6;
    plain.today.customersLost = 4;
    const geared = structuredClone(plain);
    geared.upgrades = { better_machine: 1 };
    expect(dayScore(geared) - dayScore(plain)).toBeCloseTo(bonus, 6);
  });

  it('turns about the stated share of 4-star visits into 5 stars, capped at 50%', () => {
    expect(bumpShare(0)).toBe(0);
    expect(bumpShare(1)).toBeCloseTo(bonus, 1);
    expect(bumpShare(2)).toBeCloseTo(bonus * 2, 1);
    // Three levels would be 60%; the cap holds it at 50%.
    expect(bumpShare(def.maxLevel)).toBeCloseTo(0.5, 1);
  });
});
