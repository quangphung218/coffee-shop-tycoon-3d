import { describe, expect, it } from 'vitest';
import { arrivalRate, FIRST_DAY_SOLO_ARRIVALS } from '../../src/sim/customers';
import { dispatch } from '../../src/sim/index';
import { createNewGame } from '../../src/sim/state';
import { playDay } from './helpers';

const SEEDS = [1, 42, 777];

describe('E-20 day 1 with no staff', () => {
  it('lets a perfect solo player on Normal who restocks lose at most 10% of the customers', () => {
    const rates = SEEDS.map((seed) => {
      const s = createNewGame('Quán Ngày Đầu', 'normal', seed);
      expect(s.day).toBe(1);
      expect(s.staff).toHaveLength(0);
      dispatch(s, { type: 'apply_restock' });
      playDay(s);
      const { customersArrived, customersLost, customersServed } = s.today;
      console.log(`seed ${seed}: arrived ${customersArrived}, served ${customersServed}, lost ${customersLost}`);
      return customersLost / customersArrived;
    });
    for (const rate of rates) expect(rate).toBeLessThanOrEqual(0.1);
  });

  it('slows arrivals only on day 1 while nobody is hired', () => {
    const game = (day: number, hire: boolean) => {
      const s = createNewGame('Quán Ngày Đầu', 'normal', 1);
      if (hire) expect(dispatch(s, { type: 'hire_staff', candidateId: s.candidates[0]!.id, role: 'barista' })).toBe(true);
      s.day = day;
      return s;
    };
    expect(arrivalRate(game(1, false))).toBeCloseTo(arrivalRate(game(1, true)) * FIRST_DAY_SOLO_ARRIVALS, 6);
    expect(arrivalRate(game(2, false))).toBeCloseTo(arrivalRate(game(2, true)), 6);
  });
});
