import { describe, expect, it } from 'vitest';
import { PALETTE } from '../../src/render/scene/palette';
import {
  SEASONAL_STYLES,
  SEASON_FIRST_WEEK,
  SEASON_SETS,
  SEASON_WEEKS,
  nextSeasonWeek,
  seasonFor,
  seasonalStylesFor,
  styleOnSale,
} from '../../src/sim/data/seasons';
import { ALL_STYLES, STYLES, STYLE_SLOTS, styleById, stylesOf } from '../../src/sim/data/styles';
import { buyStyle, canAffordStyle, dispatch, ownsStyle, selectStyle, styleBlockedReason, styleOf } from '../../src/sim/index';
import { ensureRetention } from '../../src/sim/retention';
import { createNewGame } from '../../src/sim/state';
import type { GameState } from '../../src/sim/types';

function atWeek(week: number): GameState {
  const s = createNewGame('Quán Mùa', 'normal', 2626);
  s.money = 2_000_000_000;
  ensureRetention(s).tickets = 1000;
  s.week!.index = week;
  return s;
}

describe('season calendar (E-26)', () => {
  it('has no season before week 24', () => {
    for (let w = 1; w < SEASON_FIRST_WEEK; w++) expect(seasonFor(w)).toBeNull();
    for (let w = 1; w < SEASON_FIRST_WEEK; w++) expect(seasonalStylesFor(w)).toEqual([]);
    expect(SEASON_FIRST_WEEK).toBe(24);
    expect(SEASON_WEEKS).toBe(8);
  });

  it('runs 8-week seasons from week 24 with weeks left counting down', () => {
    expect(seasonFor(24)).toEqual({ index: 0, set: 0, name: 'Mùa xuân', startWeek: 24, endWeek: 31, weeksLeft: 8, ids: SEASON_SETS[0]!.ids });
    expect(seasonFor(31)).toMatchObject({ index: 0, weeksLeft: 1 });
    expect(seasonFor(32)).toMatchObject({ index: 1, set: 1, startWeek: 32, endWeek: 39, weeksLeft: 8 });
    expect(seasonFor(40)).toMatchObject({ index: 2, set: 2, startWeek: 40, weeksLeft: 8 });
    expect(seasonFor(48)).toMatchObject({ index: 3, set: 0, startWeek: 48 });
    for (let w = 24; w < 200; w++) {
      const s = seasonFor(w)!;
      expect(s.weeksLeft).toBe(SEASON_WEEKS - ((w - 24) % SEASON_WEEKS));
      expect(seasonFor(w)).toEqual(s); // pure: same week, same season
    }
  });

  it('rotates the sets so a missed set comes back in the next cycle', () => {
    const n = SEASON_SETS.length;
    for (let set = 0; set < n; set++) {
      const weeks = [];
      for (let w = 24; w < 24 + 3 * n * SEASON_WEEKS; w += SEASON_WEEKS) if (seasonFor(w)!.set === set) weeks.push(w);
      expect(weeks).toEqual([0, 1, 2].map((c) => 24 + (set + c * n) * SEASON_WEEKS));
    }
    expect(nextSeasonWeek(0, 1)).toBe(24);
    expect(nextSeasonWeek(2, 1)).toBe(40);
    expect(nextSeasonWeek(0, 27)).toBe(27);
    expect(nextSeasonWeek(0, 32)).toBe(48);
    expect(nextSeasonWeek(1, 41)).toBe(56);
  });
});

describe('seasonal style data (E-26)', () => {
  it('has 3-4 styles per set, ids unique over all styles, mostly Tem priced, no challenge gate', () => {
    expect(new Set(ALL_STYLES.map((s) => s.id)).size).toBe(ALL_STYLES.length);
    for (const set of SEASON_SETS) {
      expect(set.ids.length).toBeGreaterThanOrEqual(3);
      expect(set.ids.length).toBeLessThanOrEqual(4);
    }
    expect(SEASON_SETS.flatMap((s) => s.ids).sort()).toEqual(SEASONAL_STYLES.map((s) => s.id).sort());
    for (const s of SEASONAL_STYLES) {
      expect(STYLE_SLOTS).toContain(s.slot);
      expect(s.tickets).toBeGreaterThan(0);
      expect(s.price).toBeLessThanOrEqual(5_000_000);
      expect(s.challenge).toBeUndefined();
      expect(styleById(s.id)).toBe(s);
    }
    expect(SEASONAL_STYLES.filter((s) => s.price > 0).length).toBeLessThan(SEASONAL_STYLES.length / 2);
    // Every set costs 320 Tem: a steady player can buy one set per season (see T-93).
    for (let set = 0; set < SEASON_SETS.length; set++) expect(SEASONAL_STYLES.filter((s) => s.season === set).reduce((t, s) => t + s.tickets, 0)).toBe(320);
  });

  it('keeps the base catalogue (what the panel and bots read) unchanged', () => {
    expect(STYLES).toHaveLength(20);
    expect(STYLES.some((s) => s.season !== undefined)).toBe(false);
    for (const slot of STYLE_SLOTS) expect(stylesOf(slot).every((s) => s.season === undefined)).toBe(true);
    // Seasonal colours never equal a palette default, so a worn one is visible.
    for (const s of SEASONAL_STYLES) expect([PALETTE.wall, PALETTE.floor, PALETTE.coral]).not.toContain(s.color);
  });

  it('base styles are always on sale, seasonal ones only in their season', () => {
    expect(styleOnSale(styleById('wall_mint')!, 1)).toBe(true);
    expect(styleOnSale(styleById('wall_peach')!, 23)).toBe(false);
    expect(styleOnSale(styleById('wall_peach')!, 24)).toBe(true);
    expect(styleOnSale(styleById('wall_peach')!, 32)).toBe(false);
    expect(styleOnSale(styleById('wall_seafoam')!, 32)).toBe(true);
    expect(styleOnSale(styleById('wall_peach')!, 48)).toBe(true);
  });
});

describe('buying seasonal styles (E-26)', () => {
  it('refuses a seasonal style outside its season, telling the week it opens', () => {
    const s = atWeek(10);
    expect(styleBlockedReason(s, 'wall_peach')).toBe('Mua Tường hoa đào từ tuần 24');
    expect(dispatch(s, { type: 'buy_style', styleId: 'wall_peach' })).toBe(false);
    expect(ownsStyle(s, 'wall_peach')).toBe(false);
    expect(s.retention!.tickets).toBe(1000);
    s.week!.index = 33;
    expect(styleBlockedReason(s, 'wall_peach')).toBe('Mua Tường hoa đào từ tuần 48');
    expect(canAffordStyle(s, 'wall_maple')).toBe(false);
  });

  it('buys through the existing path in season and keeps it owned and worn after the season ends', () => {
    const s = atWeek(24);
    const money = s.money;
    expect(dispatch(s, { type: 'buy_style', styleId: 'sign_lacquer' })).toBe(true);
    expect(s.retention!.tickets).toBe(1000 - 90);
    expect(s.money).toBe(money - 5_000_000);
    expect(styleOf(s, 'sign').id).toBe('sign_lacquer');
    expect(s.events.some((e) => e.type === 'style_bought' && e.styleId === 'sign_lacquer')).toBe(true);
    expect(dispatch(s, { type: 'buy_style', styleId: 'sign_lacquer' })).toBe(false); // already owned

    s.week!.index = 35;
    expect(ownsStyle(s, 'sign_lacquer')).toBe(true);
    expect(styleOf(s, 'sign').id).toBe('sign_lacquer');
    expect(selectStyle(s, 'sign_wood')).toBe(true);
    expect(selectStyle(s, 'sign_lacquer')).toBe(true);
    expect(styleOf(s, 'sign').id).toBe('sign_lacquer');
  });

  it('refuses without enough Tem like any style', () => {
    const s = atWeek(32);
    s.retention!.tickets = 50;
    expect(styleBlockedReason(s, 'wall_seafoam')).toBe('Thiếu 50 Tem');
    expect(buyStyle(s, 'wall_seafoam')).toBe(false);
  });
});
