import { describe, expect, it } from 'vitest';
import {
  CYCLE_WEEKS,
  SEASONAL_STYLES,
  SEASON_SETS,
  cycleFor,
  nextStyleSaleWeek,
  seasonalStylesFor,
  seasonalVariant,
  seasonalVariantsFor,
  styleOnSale,
  variantById,
  variantFirstWeek,
  variantTickets,
} from '../../src/sim/data/seasons';
import { ALL_STYLES, styleById } from '../../src/sim/data/styles';
import { ensureRetention } from '../../src/sim/retention';
import { createNewGame } from '../../src/sim/state';
import { buyStyle, ownsStyle, styleBlockedReason, styleOf } from '../../src/sim/styles';
import type { GameState } from '../../src/sim/types';

function at(week: number, tickets = 10_000): GameState {
  const s = createNewGame('Quán Mây', 'normal', 1);
  s.week!.index = week;
  ensureRetention(s).tickets = tickets;
  return s;
}

describe('E-33 seasonal colour variants', () => {
  it('a cycle is 3 seasons (24 weeks); cycle 0 = weeks 24-47 has no variant', () => {
    expect(CYCLE_WEEKS).toBe(24);
    expect(cycleFor(23)).toBe(-1);
    expect(cycleFor(24)).toBe(0);
    expect(cycleFor(47)).toBe(0);
    expect(cycleFor(48)).toBe(1);
    expect(cycleFor(72)).toBe(2);
    for (let w = 1; w < 48; w++) expect(seasonalVariantsFor(w)).toEqual([]);
  });

  it('each cycle gives every style of the running set one variant, newest cycle first', () => {
    expect(seasonalVariantsFor(48).map((s) => s.id)).toEqual(SEASON_SETS[0]!.ids.map((id) => `${id}_c1`));
    expect(seasonalVariantsFor(56).map((s) => s.id)).toEqual(SEASON_SETS[1]!.ids.map((id) => `${id}_c1`));
    const w72 = seasonalVariantsFor(72).map((s) => s.id);
    expect(w72).toEqual([...SEASON_SETS[0]!.ids.map((id) => `${id}_c2`), ...SEASON_SETS[0]!.ids.map((id) => `${id}_c1`)]);
    // The base seasonal list and ALL_STYLES are unchanged.
    expect(seasonalStylesFor(48)).toEqual(seasonalStylesFor(24));
    expect(ALL_STYLES).toHaveLength(31);
  });

  it('variants only recolour: same slot and set, Tem only, price = base Tem * (1 + cycle)', () => {
    for (const base of SEASONAL_STYLES) {
      for (const cycle of [1, 2, 3, 7]) {
        const v = seasonalVariant(base.id, cycle)!;
        expect(v.slot).toBe(base.slot);
        expect(v.season).toBe(base.season);
        expect(v.price).toBe(0);
        expect(v.tickets).toBe(base.tickets * (1 + cycle));
        expect(v.tickets).toBe(variantTickets(base, cycle));
        expect([v.color, v.accent]).not.toEqual([base.color, base.accent]);
        expect(v.color).toBeGreaterThanOrEqual(0);
        expect(v.color).toBeLessThanOrEqual(0xffffff);
        expect(styleById(v.id)).toBe(v);
      }
    }
    expect(seasonalVariant('wall_peach', 0)).toBeUndefined();
    expect(seasonalVariant('wall_mint', 1)).toBeUndefined();
    expect(variantById('wall_peach_c01')).toBeUndefined();
    expect(variantById('nope_c1')).toBeUndefined();
  });

  it('a variant is on sale only in its set season from its cycle on', () => {
    const v = seasonalVariant('wall_seafoam', 1)!; // set 1
    expect(variantFirstWeek(1, 1)).toBe(56);
    expect(styleOnSale(v, 32)).toBe(false); // summer, cycle 0
    expect(styleOnSale(v, 48)).toBe(false); // spring, cycle 1
    expect(styleOnSale(v, 56)).toBe(true);
    expect(styleOnSale(v, 80)).toBe(true); // summer, cycle 2
    expect(nextStyleSaleWeek(v, 30)).toBe(56);
    expect(nextStyleSaleWeek(v, 64)).toBe(80);
    expect(nextStyleSaleWeek(styleById('wall_seafoam')!, 30)).toBe(32);
  });

  it('buy spends Tem only, owns and wears the variant; refused out of season or short of Tem', () => {
    const s = at(48);
    const money = s.money;
    expect(styleBlockedReason(at(40), 'wall_peach_c1')).toBe(`Mua ${seasonalVariant('wall_peach', 1)!.name} từ tuần 48`);
    expect(styleBlockedReason(at(48, 139), 'wall_peach_c1')).toBe('Thiếu 1 Tem');
    expect(buyStyle(s, 'wall_peach_c1')).toBe(true);
    expect(s.money).toBe(money);
    expect(s.retention!.tickets).toBe(10_000 - 140);
    expect(ownsStyle(s, 'wall_peach_c1')).toBe(true);
    expect(ownsStyle(s, 'wall_peach')).toBe(false);
    expect(styleOf(s, 'wall').id).toBe('wall_peach_c1');
    expect(buyStyle(s, 'wall_peach_c1')).toBe(false);
  });
});
